// Smoke test for the persona-only plugin (0.3.3).
//
// The plugin registers ONE system-prompt section and nothing else; this test
// pins that contract, the DSH-adapted prompt text, the bundle preset that
// carries every standard DSH tool row, and the package manifest.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pluginMod from '../lib/index.js'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_GPT56, personaForModel } from '../lib/system-prompt.js'

let assertionCount = 0
function ok(value, message) {
  assertionCount += 1
  assert.ok(value, message)
}
function eq(actual, expected, message) {
  assertionCount += 1
  assert.equal(actual, expected, message)
}
function deep(actual, expected, message) {
  assertionCount += 1
  assert.deepEqual(actual, expected, message)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** A minimal DSH context: only the systemPrompt service exists. */
function makeCtx() {
  const seen = []
  const sections = []
  let suppressed = 0
  return {
    seen,
    sections,
    get suppressed() { return suppressed },
    ctx: {
      get(service) {
        seen.push(service)
        if (service !== 'systemPrompt') return undefined
        return {
          section(section) { sections.push(section) },
          suppressRuntimeContext() { suppressed += 1 },
        }
      },
    },
  }
}

// Codex tool names that must NOT survive the DSH adaptation.
const CODEX_TOOL_NAMES = [
  'exec_command', 'write_stdin', 'apply_patch', 'view_file', 'update_plan',
  'spawn_agent', 'request_permissions', 'get_context_remaining', 'new_context',
  'skills.list', 'skills.read', 'request_user_input',
]

// DSH tool names the prompt must teach instead.
const DSH_TOOL_NAMES = [
  'bash', 'read', 'edit', 'write', 'glob', 'grep', 'todo_write',
  'mcp__exa__web_search_exa', 'subagent', 'job_output', 'job_list', 'job_kill', 'skill',
]

function main() {
  // ---- module surface ----
  eq(pluginMod.name, 'dsh-kernel-codex', 'plugin name')
  deep(pluginMod.inject, ['systemPrompt'], 'plugin injects only the prompt registry')
  eq(typeof pluginMod.apply, 'function', 'plugin exports apply')

  // ---- default registration ----
  {
    const h = makeCtx()
    pluginMod.apply(h.ctx, {})
    eq(h.sections.length, 1, 'exactly one prompt section is registered')
    const section = h.sections[0]
    eq(section.name, 'deployment:persona', 'section name')
    eq(section.order, 0, 'section order')
    eq(section.complete, false, 'not complete by default (keeps DSH sections)')
    ok(typeof section.text === 'string' && section.text.length > 20000, 'persona text is the full prompt')
    ok(section.text.startsWith('You are Codex'), 'persona opens as Codex')
    eq(h.suppressed, 0, 'runtime context is kept by default')
    deep(h.seen, ['systemPrompt'], 'no tool/fs/jobs service is touched')
  }

  // ---- DSH-adapted prompt text (both templates) ----
  for (const [label, text] of [['gpt-5.2', SYSTEM_PROMPT], ['gpt-5.6', SYSTEM_PROMPT_GPT56]]) {
    for (const tool of DSH_TOOL_NAMES) ok(text.includes(tool), label + ' prompt names the DSH tool ' + tool)
    for (const tool of CODEX_TOOL_NAMES) ok(!text.includes(tool), label + ' prompt drops the Codex tool ' + tool)
    ok(!text.includes('commentary` channel'), label + ' prompt has no Codex channel model')
    ok(text.includes('mcp__exa__web_search_exa'), label + ' prompt routes web search to the Exa MCP tool')

    // bash hard rules: 35s foreground grace, long commands background, no idle wait
    ok(text.includes('## bash — hard rules'), label + ' prompt carries the bash hard rules')
    ok(text.includes('Short commands stay in the foreground'), label + ' prompt keeps short commands in the foreground')
    ok(text.includes('run_in_background: true'), label + ' prompt sends long commands to the background')
    ok(text.includes('timeoutMs'), label + ' prompt names the real timeoutMs parameter')
    ok(text.includes('timeoutMs` above 35000') || text.includes('timeoutMs\\` above 35000'), label + ' prompt caps timeoutMs at 35000')
    ok(text.includes('promoted to a background job'), label + ' prompt states the 35s promotion')
    ok(text.includes('Never idle-wait'), label + ' prompt forbids idle waiting')
    ok(text.includes('30 seconds'), label + ' prompt sets the 30s progress cadence')
    ok(text.includes('nothing else to do'), label + ' prompt only reports when no other work is parallel')
    ok(text.includes('进度:#####'), label + ' prompt shows the ASCII progress line')

    // reply rules: terse, subject in every sentence, ASCII first, correct the user
    ok(text.includes('# Replying to the user'), label + ' prompt carries the reply rules')
    ok(text.includes('severe reading disability'), label + ' prompt states the reader constraint')
    ok(text.includes('Give every sentence a subject'), label + ' prompt demands a subject per sentence')
    ok(text.includes('Prefer ASCII diagrams'), label + ' prompt prefers ASCII diagrams')
    ok(text.includes('The user can be wrong'), label + ' prompt allows correcting the user')
    ok(text.includes('Disagree when the evidence disagrees'), label + ' prompt allows pushback')

    // exa search first: mandatory the moment the user reports a problem
    ok(text.includes('## Search first — non-negotiable'), label + ' prompt carries the mandatory search rule')
    ok(text.includes('reports a problem'), label + ' prompt triggers search on reported problems')
    ok(text.includes('before you form a theory'), label + ' prompt forbids theorising before searching')
    ok(text.includes('read the returned sources'), label + ' prompt requires reading the sources')

    // English-only personas: the progress example is the single allowed CJK string
    const stripped = text.replace('进度:#####   5/10 当前正在进行 attention kernel 的编译', '')
    ok(!/[\u4e00-\u9fff]/.test(stripped), label + ' prompt is free of other Chinese text')
  }

  // ---- model-aware template selection ----
  eq(personaForModel('gpt-5.6-sol'), SYSTEM_PROMPT_GPT56, 'gpt-5.6 uses its own template')
  eq(personaForModel('gpt-5.6-terra'), SYSTEM_PROMPT_GPT56, 'gpt-5.6-terra uses its own template')
  eq(personaForModel('gpt-5.2-codex'), SYSTEM_PROMPT, 'other models fall back to the assembled prompt')
  eq(personaForModel(undefined), SYSTEM_PROMPT, 'no model falls back to the assembled prompt')

  // ---- config overrides ----
  {
    const h = makeCtx()
    pluginMod.apply(h.ctx, { persona: 'You are a custom persona.' })
    eq(h.sections[0].text, 'You are a custom persona.', 'config.persona overrides the text')
  }
  {
    const h = makeCtx()
    pluginMod.apply(h.ctx, { complete: true })
    eq(h.sections[0].complete, true, 'config.complete switches to the sole-section mode')
    eq(h.suppressed, 1, 'config.complete suppresses the runtime context')
  }

  // ---- graceful without the service ----
  {
    const ctx = { get() { return undefined } }
    pluginMod.apply(ctx, {})
    ok(true, 'apply is a no-op when systemPrompt is absent')
  }

  // ---- mesh child mount ----
  {
    const h = makeCtx()
    pluginMod.apply(h.ctx, { skipPersona: true })
    eq(h.sections.length, 0, 'config.skipPersona registers nothing')
  }

  // ---- bundle preset: id/name `codex`, all standard tool rows ----
  {
    const preset = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
    ok(preset.includes('- id: preset-codex'), 'preset row id')
    ok(preset.includes('id: codex'), 'preset id is codex')
    ok(preset.includes('name: codex'), 'preset display name is codex')
    ok(preset.includes('codex-persona'), 'preset mounts the persona row')
    ok(preset.includes('name: dsh-kernel-codex'), 'persona row points at this package')

    const standardRows = [
      '@deepseek-ai/dsh-agent-instructions',
      '@deepseek-ai/dsh-time-context',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-tool-fs',
      '@deepseek-ai/dsh-tool-fs-search',
      '@deepseek-ai/dsh-tool-jobs',
      '@deepseek-ai/dsh-tool-schedule',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
      '@deepseek-ai/dsh-command-goal',
      '@deepseek-ai/dsh-tool-goal',
      '@deepseek-ai/dsh-plan-mode',
      '@deepseek-ai/dsh-compaction-basic',
      '@deepseek-ai/dsh-command-compact',
      '@deepseek-ai/dsh-compaction-tool-result-pruner',
      '@deepseek-ai/dsh-tool-subagent-control',
      '@deepseek-ai/dsh-tool-subagent',
      '@deepseek-ai/dsh-workflow-ptc',
      '@deepseek-ai/dsh-tool-workflow',
      '@deepseek-ai/dsh-tool-ask-user',
      '@deepseek-ai/dsh-tool-todo',
      '@deepseek-ai/dsh-tool-web',
      '@deepseek-ai/dsh-tool-present',
    ]
    for (const row of standardRows) ok(preset.includes(row), 'preset carries the standard row ' + row)
    ok(!preset.includes('codex-surface'), 'preset no longer mounts a Codex tool surface')
    ok(!preset.includes('kernelMesh'), 'preset has no mesh dependency')
  }

  // ---- package manifest ----
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    eq(pkg.version, '0.3.4', 'package version')
    eq(pkg.dependencies, undefined, 'no runtime dependency (mesh dropped)')
    ok(pkg.files.includes('lib/index.js'), 'package ships lib/index.js')
    ok(pkg.files.includes('lib/system-prompt.js'), 'package ships lib/system-prompt.js')
    ok(!pkg.files.includes('lib/ensure-mesh.js'), 'package no longer ships the mesh fallback')
    eq(pkg.dsh.bundle.patch, './cordis.patch.yml', 'package declares the bundle patch')
    ok(pkg.engines.dsh.startsWith('>=0.2.1-rc.2'), 'package pins the DSH 0.2 engine')
    ok(fs.existsSync(path.join(root, 'cordis.patch.yml')), 'bundle patch file exists')
    ok(!fs.existsSync(path.join(root, 'lib/ensure-mesh.js')), 'mesh fallback file removed')
  }

  console.log('dsh-kernel-codex smoke: ' + assertionCount + ' assertions ok')
}

main()
