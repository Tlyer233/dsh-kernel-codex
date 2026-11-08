import assert from 'node:assert/strict'
import path from 'node:path'
import * as pluginMod from '../lib/index.js'

let assertionCount = 0
function ok(value, message) {
  assertionCount += 1
  assert.ok(value, message)
}
function eq(actual, expected, message) {
  assertionCount += 1
  assert.equal(actual, expected, message)
}
function match(actual, re, message) {
  assertionCount += 1
  assert.match(String(actual), re, message)
}
function deep(actual, expected, message) {
  assertionCount += 1
  assert.deepEqual(actual, expected, message)
}

function keyOf(target) {
  if (typeof target === 'string') return path.normalize(target)
  if (target && typeof target.path === 'string') return path.normalize(target.path)
  return String(target)
}

function makeTarget(p) {
  const n = path.normalize(p)
  return { path: n, displayPath: n, targetKey: n }
}

function createHarness() {
  const workspaceRoot = '/workspace'
  const files = new Map()
  const registered = new Map()
  const sections = []
  let suppressed = false
  const calls = {
    startActivation: [],
    sendMessage: [],
    interrupt: [],
    listChildren: [],
    waitForChildren: [],
    drainChildren: [],
    jobsStart: [],
    jobsList: [],
    jobsRead: [],
    jobsWait: [],
    jobsKill: [],
    spawn: [],
    terminate: [],
    appendEvent: [],
    userQuestions: [],
  }

  const fs = {
    async resolve(p, opts) {
      const cwd = (opts && opts.cwd) || workspaceRoot
      const raw = String(p)
      if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return makeTarget(raw)
      return makeTarget(path.join(cwd, raw))
    },
    async readText(target) {
      const key = keyOf(target)
      if (!files.has(key)) {
        const err = new Error('FS_NOT_FOUND: ' + key)
        err.code = 'FS_NOT_FOUND'
        throw err
      }
      return files.get(key).text
    },
    async writeText(target, content) {
      const key = keyOf(target)
      const prev = files.get(key)
      files.set(key, { text: String(content), version: (prev ? prev.version : 0) + 1, type: 'file' })
      calls.writeText = calls.writeText || []
      calls.writeText.push({ path: key, content: String(content) })
    },
    async editText(target, edit) {
      const key = keyOf(target)
      if (!files.has(key)) {
        const err = new Error('FS_NOT_FOUND: ' + key)
        err.code = 'FS_NOT_FOUND'
        throw err
      }
      const cur = files.get(key)
      const idx = cur.text.indexOf(edit.oldString)
      if (idx < 0) throw new Error('oldString not found in ' + key)
      const next = cur.text.slice(0, idx) + edit.newString + cur.text.slice(idx + edit.oldString.length)
      files.set(key, { text: next, version: cur.version + 1, type: 'file' })
    },
    async stat(target) {
      const key = keyOf(target)
      if (!files.has(key)) return null
      const rec = files.get(key)
      return { type: rec.type || 'file', size: Buffer.byteLength(rec.text || ''), version: rec.version }
    },
    async listDir(target) {
      const dir = keyOf(target).replace(/[\\/]+$/, '')
      const kids = new Map()
      for (const [p, rec] of files) {
        if (p === dir) continue
        const prefix = dir + path.sep
        if (!p.startsWith(prefix)) continue
        const rest = p.slice(prefix.length)
        const name = rest.split(/[\\/]/)[0]
        if (!name || kids.has(name)) continue
        const childPath = path.join(dir, name)
        const isDir = rest.includes(path.sep) || rec.type === 'directory'
        kids.set(name, {
          name,
          type: isDir ? 'directory' : 'file',
          target: makeTarget(childPath),
        })
      }
      return Array.from(kids.values())
    },
    processPath(target) { return keyOf(target) },
    contains() { return true },
  }

  const tools = {
    register(def) {
      if (!def || !def.name) throw new Error('tool missing name')
      if (registered.has(def.name)) throw new Error('tool "' + def.name + '" is already registered')
      registered.set(def.name, def)
    },
    get(name) { return registered.get(name) },
  }

  let childSeq = 0
  const subagents = {
    list() { return ['spawn'] },
    async startActivation(spec) {
      calls.startActivation.push(spec)
      const childId = 'codex-child-' + (++childSeq)
      return {
        childId,
        messageId: 'msg-' + childSeq,
        result: Promise.resolve({
          stopReason: 'completed',
          output: [{ type: 'text', text: 'codex child answer' }],
        }),
        async dispose() {},
      }
    },
    async sendMessage(sender, targetId, content, options) {
      calls.sendMessage.push({ sender, targetId, content, options })
      return 'codex-msg-1'
    },
    interrupt(targetId, authority) {
      calls.interrupt.push({ targetId, authority })
    },
    async listChildren(parentId, signal) {
      calls.listChildren.push({ parentId, signal })
      return [
        { id: 'codex-child-1', label: 'demo', mode: 'continuable' },
        { id: 'other', label: 'skip-me', mode: 'one-shot' },
      ]
    },
    async waitForChildren(parent) {
      calls.waitForChildren.push(parent)
      return true
    },
    async drainChildren(parent, ids) {
      calls.drainChildren.push({ parent, ids })
    },
  }

  const jobsStore = new Map()
  let jobSeq = 0
  const jobs = {
    start(spec) {
      const id = 'bash-' + (++jobSeq)
      const chunks = []
      const view = {
        id,
        kind: spec.kind,
        label: spec.label,
        owner: spec.owner,
        status: 'running',
        startedAt: Date.now(),
      }
      const job = {
        id,
        append(text, options) {
          if (!text) return
          chunks.push({ at: chunks.length, text, channel: options && options.channel })
        },
        updateProgress() {},
      }
      const hooks = spec.run(job)
      jobsStore.set(id, { view, chunks, hooks })
      calls.jobsStart.push({ spec, job })
      Promise.resolve(hooks.done).then(
        (outcome) => {
          view.status = outcome.status
          view.detail = outcome.detail
          view.finishedAt = Date.now()
        },
        (e) => {
          view.status = 'failed'
          view.detail = String(e)
          view.finishedAt = Date.now()
        },
      )
      return id
    },
    list(caller) {
      calls.jobsList.push(caller)
      return Array.from(jobsStore.values()).map((j) => ({ ...j.view }))
    },
    read(id, caller) {
      calls.jobsRead.push({ id, caller })
      const rec = jobsStore.get(id)
      if (!rec) throw new Error('job not found: ' + id)
      const chunks = rec.chunks.slice()
      rec.chunks.length = 0
      return { chunks, lossy: false, result: rec.result, job: { ...rec.view } }
    },
    async wait(id, timeoutMs, caller, signal) {
      calls.jobsWait.push({ id, timeoutMs, caller, signal })
      const rec = jobsStore.get(id)
      return rec ? { ...rec.view } : { status: 'completed' }
    },
    kill(id, caller, reason) {
      calls.jobsKill.push({ id, caller, reason })
      const rec = jobsStore.get(id)
      if (rec) {
        try { rec.hooks.cancel(reason) } catch {}
      }
      return 'requested'
    },
  }

  const subprocess = {
    async resolveExecutable(name) { return '/mock/' + name },
    spawn(opts) {
      calls.spawn.push(opts)
      const stdout = {
        text: 'shell-ok\n',
        readFrom(off) { return { text: this.text.slice(off), nextOffset: this.text.length } },
      }
      const stderr = {
        text: '',
        readFrom(off) { return { text: this.text.slice(off), nextOffset: this.text.length } },
      }
      return {
        collected: { stdout, stderr },
        done: Promise.resolve({ exitCode: 0 }),
        terminate() { calls.terminate.push(true) },
      }
    },
  }

  const services = {
    fs,
    tools,
    subprocess,
    web: {
      async search() { return { sources: [{ title: 't', url: 'https://example.com', snippet: 's' }] } },
      async fetch() { return { body: { content: '' } } },
    },
    jobs,
    subagents,
    sandboxPolicy: {
      workspaceRoot,
      resolve() { return { mode: 'danger-full-access', workspaceRoot } },
    },
    attachments: { async saveImage() { return { id: 'att-1' } } },
    userQuestions: {
      async ask(request) {
        calls.userQuestions.push(request)
        return { answers: [{ id: request.questions[0].id, selected: ['Yes'] }] }
      },
    },
    systemPrompt: {
      section(s) { sections.push(s); return () => {} },
      suppressRuntimeContext() { suppressed = true; return () => {} },
    },
  }

  return {
    ctx: { get(name) { return services[name] } },
    registered,
    sections,
    get suppressed() { return suppressed },
    calls,
    files,
    workspaceRoot,
    seed(rel, text) {
      const p = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel)
      files.set(path.normalize(p), { text, version: 1, type: 'file' })
      return path.normalize(p)
    },
    readSeed(rel) {
      const p = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel)
      const rec = files.get(path.normalize(p))
      return rec ? rec.text : undefined
    },
  }
}

const EXPECTED_TOOLS = [
  'exec_command', 'write_stdin', 'apply_patch', 'request_permissions', 'web_search',
  'view_image', 'sleep', 'update_plan', 'request_user_input', 'get_context_remaining',
  'new_context', 'spawn_agent', 'assign_agent_task', 'send_message', 'followup_task',
  'wait_agent', 'list_agents', 'resume_agent', 'interrupt_agent', 'close_agent',
  'list_tasks', 'task_output', 'task_stop',
  'view_file', 'write_file', 'edit_file', 'glob', 'grep',
]

async function main() {
  const plugin = pluginMod
  ok(plugin, 'plugin module loads')
  eq(plugin.name, 'dsh-kernel-codex', 'plugin.name')
  ok(typeof plugin.apply === 'function', 'plugin.apply is a function')
  ok(Array.isArray(plugin.inject), 'plugin.inject is metadata')

  const h = createHarness()
  await plugin.apply(h.ctx)

  for (const name of EXPECTED_TOOLS) {
    ok(h.registered.has(name), 'registers ' + name)
  }
  eq(h.registered.size, EXPECTED_TOOLS.length, 'expected tool count')

  for (const [name, def] of h.registered) {
    ok(def.output && typeof def.output === 'object', name + ' has output')
    ok(def.output.schema, name + ' has output.schema')
    ok(typeof def.output.render === 'function', name + ' has output.render')
    const rendered = def.output.render({}, 'ok')
    ok(Array.isArray(rendered), name + ' render returns blocks')
  }

  const exec = { agent: { id: 'parent-session' }, signal: new AbortController().signal }
  const spawn_agent = h.registered.get('spawn_agent')
  ok(typeof spawn_agent.isConcurrencySafe === 'function', 'spawn_agent.isConcurrencySafe is a function')
  eq(spawn_agent.isConcurrencySafe(), true, 'spawn_agent.isConcurrencySafe() === true')

  const bg = await spawn_agent.execute({ task_name: 'smoke_child', message: 'do the work' }, exec)
  eq(h.calls.startActivation.length, 1, 'background calls startActivation once')
  const bgSpec = h.calls.startActivation[0]
  eq(bgSpec.provider, 'spawn', 'background provider is native spawn')
  eq(bgSpec.delivery, 'parent', 'background delivery is parent')
  eq(bgSpec.label, 'smoke_child', 'background label')
  eq(Array.isArray(bgSpec.request.prompt), true, 'background request has prompt blocks')
  eq(bgSpec.request.prompt[0].text, 'do the work', 'background prompt text')
  eq(bgSpec.request.maxDepth, 3, 'request.maxDepth is 3')
  ok(!('persona' in bgSpec.request), 'request does not use the retired 0.1 persona field')
  ok(!('label' in bgSpec.request), 'label lives on the activation spec, not the request')
  match(bg, /codex-child-1/, 'background return text contains durable child id')

  const followup_task = h.registered.get('followup_task')
  const send_message = h.registered.get('send_message')
  const resume_agent = h.registered.get('resume_agent')
  const assign_agent_task = h.registered.get('assign_agent_task')

  const fu = await followup_task.execute({ agent_id: 'codex-child-1', message: 'next step' }, exec)
  eq(h.calls.sendMessage.length, 1, 'followup_task → subagents.sendMessage')
  eq(h.calls.sendMessage[0].targetId, 'codex-child-1', 'followup_task target id')
  eq(h.calls.sendMessage[0].content[0].text, 'next step', 'followup_task message text')
  eq(h.calls.sendMessage[0].options.signal, exec.signal, 'followup_task forwards exec.signal')
  match(fu, /codex-msg-1/, 'followup_task mentions message id')

  const sm = await send_message.execute({ agent_id: 'codex-child-1', message: 'via send' }, exec)
  eq(h.calls.sendMessage.length, 2, 'send_message → subagents.sendMessage')
  eq(h.calls.sendMessage[1].content[0].text, 'via send', 'send_message text')
  match(sm, /codex-msg-1/, 'send_message mentions message id')

  const ra = await resume_agent.execute({ agent_id: 'codex-child-1' }, exec)
  eq(h.calls.sendMessage.length, 3, 'resume_agent → subagents.sendMessage')
  match(h.calls.sendMessage[2].content[0].text, /Continue from where you left off/, 'resume_agent continue prompt')
  match(ra, /codex-msg-1/, 'resume_agent mentions message id')

  await assign_agent_task.execute({ agent_id: 'codex-child-1', message: 'assigned' }, exec)
  eq(h.calls.sendMessage.length, 4, 'assign_agent_task → subagents.sendMessage')

  const interrupt_agent = h.registered.get('interrupt_agent')
  const ir = await interrupt_agent.execute({ agent_id: 'codex-child-1' }, exec)
  eq(h.calls.interrupt.length, 1, 'interrupt_agent calls subagents.interrupt')
  eq(h.calls.interrupt[0].targetId, 'codex-child-1', 'interrupt target id')
  deep(h.calls.interrupt[0].authority, { kind: 'ancestor', agent: exec.agent }, 'interrupt authority is ancestor+caller')
  match(ir, /interrupt requested/, 'interrupt confirmation')

  const list_agents = h.registered.get('list_agents')
  const listed = await list_agents.execute({}, exec)
  eq(h.calls.listChildren.length, 1, 'list_agents → subagents.listChildren')
  eq(h.calls.listChildren[0].parentId, 'parent-session', 'listChildren parent id')
  match(listed, /codex-child-1/, 'list_agents includes continuable child')
  ok(!/skip-me/.test(listed), 'list_agents skips non-continuable entries')

  const wait_agent = h.registered.get('wait_agent')
  const waitText = await wait_agent.execute({ targets: ['codex-child-1'] }, exec)
  eq(h.calls.waitForChildren.length, 1, 'wait_agent → subagents.waitForChildren')
  match(waitText, /waited for|no progressing descendants/, 'wait_agent reports join status')

  const close_agent = h.registered.get('close_agent')
  const closeText = await close_agent.execute({ agent_id: 'codex-child-1' }, exec)
  eq(h.calls.drainChildren.length, 1, 'close_agent → subagents.drainChildren')
  deep(h.calls.drainChildren[0].ids, ['codex-child-1'], 'close_agent drains the selected child')
  match(closeText, /closed agent/, 'close_agent confirmation')

  const fg = await spawn_agent.execute({
    task_name: 'wait',
    message: 'finish this',
    run_in_background: false,
  }, exec)
  eq(h.calls.startActivation.length, 2, 'foreground calls startActivation again')
  eq(h.calls.startActivation[1].delivery, 'caller', 'foreground delivery is caller')
  eq(fg, 'codex child answer', 'foreground returns child text')

  eq(h.sections.length, 2, 'systemPrompt registers persona + tool section')
  eq(h.sections[0].name, 'deployment:persona', 'persona section name')
  eq(h.sections[0].order, 0, 'persona section order')
  eq(h.sections[0].complete, true, 'persona section is complete')
  ok(typeof h.sections[0].text === 'string', 'persona text is a string')
  eq(h.sections[1].name, 'tool:spawn_agent', 'tool section name')
  eq(h.sections[1].order, 116.5, 'tool section order')
  ok(typeof h.sections[1].text === 'function', 'tool section text is a function')
  ok(h.suppressed, 'runtime context suppressed')

  const apply_patch = h.registered.get('apply_patch')
  const addOut = await apply_patch.execute({
    patch: [
      '*** Begin Patch',
      '*** Add File: hello.txt',
      '+hello world',
      '+second line',
      '*** End Patch',
    ].join('\n'),
  }, exec)
  match(addOut, /Wrote hello\.txt/, 'apply_patch Add File reports write')
  eq(h.readSeed('hello.txt'), 'hello world\nsecond line', 'apply_patch Add File content')

  const updOut = await apply_patch.execute({
    patch: [
      '*** Begin Patch',
      '*** Update File: hello.txt',
      '@@',
      ' hello world',
      '-second line',
      '+updated line',
      '*** End Patch',
    ].join('\n'),
  }, exec)
  match(updOut, /Updated hello\.txt/, 'apply_patch Update File reports update')
  eq(h.readSeed('hello.txt'), 'hello world\nupdated line', 'apply_patch Update File content')

  const view_file = h.registered.get('view_file')
  const viewed = await view_file.execute({ path: 'hello.txt' }, exec)
  match(viewed, /^1: hello world\n2: updated line$/, 'view_file line-numbers content')

  const exec_command = h.registered.get('exec_command')
  const ex = await exec_command.execute({ command: 'echo hi', timeout_ms: 5000 }, exec)
  match(ex, /shell-ok/, 'exec_command captures stdout')
  match(ex, /\[exit code: 0\]/, 'exec_command reports exit code')
  const spawnSpec = h.calls.spawn[0]
  if (process.platform === 'win32') {
    ok(spawnSpec.argv[1] === '-NoProfile', 'exec_command uses PowerShell on Windows')
  } else {
    eq(spawnSpec.argv[1], '-lc', 'exec_command uses a login shell on POSIX')
    eq(spawnSpec.argv[2], 'echo hi', 'exec_command passes the command to bash')
  }

  const bgExec = await exec_command.execute({ command: 'echo bg', run_in_background: true, description: 'bg' }, exec)
  match(bgExec, /Background task started: bash-/, 'background exec starts a bash job')
  const jobStart = h.calls.jobsStart[0]
  eq(jobStart.spec.owner, 'parent-session', 'job owner is the caller session id')
  eq(jobStart.spec.kind, 'bash', 'job kind is bash')
  await new Promise((resolve) => setTimeout(resolve, 10))
  const taskId = String(bgExec).split(': ').pop()
  const task_output = h.registered.get('task_output')
  const taskText = await task_output.execute({ task_id: taskId }, exec)
  match(taskText, /shell-ok/, 'task_output reads appended job output')
  eq(h.calls.jobsRead[0].caller, 'parent-session', 'task_output passes the session id')

  const list_tasks = h.registered.get('list_tasks')
  const listText = await list_tasks.execute({ active_only: false }, exec)
  match(listText, /bash-1/, 'list_tasks lists the background job')
  eq(h.calls.jobsList[0], 'parent-session', 'list_tasks passes the session id')

  const task_stop = h.registered.get('task_stop')
  const stopText = await task_stop.execute({ task_id: taskId, reason: 'smoke' }, exec)
  match(stopText, /requested/, 'task_stop reports kill outcome')
  eq(h.calls.jobsKill[0].caller, 'parent-session', 'task_stop passes the session id')
  eq(h.calls.jobsKill[0].reason, 'smoke', 'task_stop forwards the reason')

  const update_plan = h.registered.get('update_plan')
  const planText = await update_plan.execute({
    plan: [{ step: 'adapt', status: 'completed' }, { step: 'verify', status: 'in_progress' }],
  }, { ...exec, agent: { id: 'parent-session', session: { append(type, data) { h.calls.appendEvent.push({ type, data }) } } } })
  match(planText, /\[completed\] adapt/, 'update_plan renders the plan')
  eq(h.calls.appendEvent[0].type, 'todo/write', 'update_plan writes todo/write events')

  const web_search = h.registered.get('web_search')
  const webText = await web_search.execute({ query: 'dsh', limit: 3 }, exec)
  match(webText, /example\.com/, 'web_search renders sources')

  const request_user_input = h.registered.get('request_user_input')
  const askText = await request_user_input.execute({
    questions: [{ id: 'q1', prompt: 'Proceed?', options: [{ label: 'Yes' }, { label: 'No' }] }],
  }, exec)
  eq(h.calls.userQuestions.length, 1, 'request_user_input reaches userQuestions.ask')
  match(askText, /Yes/, 'request_user_input serializes the answer')

  console.log('dsh-kernel-codex smoke: ' + assertionCount + ' assertions ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
