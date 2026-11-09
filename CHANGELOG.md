# Changelog

## 0.3.3

- **Exa search is a hard rule now.** Both personas carry
  `## Search first — non-negotiable`: when the user reports a problem, an
  error, a symptom, or any uncertainty about how a tool, an API, or an
  environment behaves, the agent searches with `mcp__exa__web_search_exa`
  before forming a theory, reads the returned sources, and cites them in one
  line. Probing the environment first is forbidden. `web_search` is the stated
  fallback when the Exa row is not mounted.

## 0.3.2

- **Reply rules in both personas.** A new `# Replying to the user` section
  states that the user has a severe reading disability and pins five rules:
  no preamble; every sentence carries its own subject; ASCII diagrams before
  prose; correct the user in one line with a cited check when the user is
  wrong; disagree when the evidence disagrees.
- **English-only personas.** Both templates are English, apart from the single
  progress example `进度:#####   5/10 当前正在进行 attention kernel 的编译`.
  The smoke test allows that one string and fails on any other CJK text.

## 0.3.1

- **bash hard rules in both personas.** The prompt now tells the agent to call
  `bash` with `run_in_background: true` always, to omit `timeoutMs` (or write
  exactly `1`), never to block the foreground, and — only when nothing else can
  run in parallel — to report a one-line progress update every 30 seconds
  (`进度:#####   5/10 当前正在进行 attention kernel 的编译`, format may vary).
  Output is collected with `job_output`, stopped with `job_kill`, listed with
  `job_list`. The smoke test pins every one of these phrases in both templates.

## 0.3.0

The plugin becomes a **persona**: the Codex prompt, no tools.

- **30 Codex tools deleted.** `exec_command`, `write_stdin`, `apply_patch`,
  `view_file` / `write_file` / `edit_file`, `web_search`, `view_image`,
  `sleep`, `update_plan`, `request_user_input`, `get_context_remaining`,
  `new_context`, the multi-agent family, the background-task tools, and the
  glob/grep pair are all gone. `lib/index.js` now registers one
  `deployment:persona` prompt section and nothing else.
- **Preset renamed `codex-kernel` → `codex`** (`id: codex`, display name
  `codex`). It is the DSH **standard** preset with the Codex persona swapped
  in: every standard tool row — bash/pwsh, fs, fs-search, jobs, schedule,
  skills, goal, plan mode, compaction, subagent/workflow, ask-user, todo, web,
  present — is carried over, so all standard DSH tools stay callable.
- **Prompt adapted to DSH tool names.** `exec_command`→`bash`,
  `view_file`→`read`, `view_image`→`read_image`, `apply_patch`→`edit`/`write`,
  `update_plan`→`todo_write`, `request_user_input`→`ask_user_question`,
  `web_search`→`mcp__exa__web_search_exa`, agent family→`subagent` /
  `send_message` / `interrupt_agent` / `list_agents`, task family→`job_list` /
  `job_output` / `job_kill`. Codex-only workflows (`write_stdin`,
  `request_permissions`, `get_context_remaining`, `new_context`) were removed,
  and the commentary/final channel model became DSH's streamed progress
  messages plus one final answer.
- **`complete` is off by default.** The Codex persona is the only persona
  section, while DSH's own sections (skills catalog, AGENTS.md instructions,
  runtime context) stay in the prompt. `complete: true` restores the upstream
  behavior (persona as the sole section, runtime context suppressed).
  `skipPersona: true` registers nothing (kernel-mesh child mounts).
- **Mesh dependency dropped.** `lib/ensure-mesh.js`, `lib/subagents.js`, and the
  `dsh-kernel-mesh` dependency are removed; the package has no runtime
  dependencies.
- **`engines` unchanged:** `dsh >=0.2.1-rc.2 <0.3.0-0`, Node `>=22.19.0`.
- **Smoke test rewritten** (113+ assertions) to pin the persona-only contract,
  the absence of every Codex tool name in both prompt templates, the preset's
  full standard-tool row list, and the manifest.

## 0.2.0

DSH 0.2 adaptation. Breaking against every 0.1.x host: `engines` now requires
`dsh >=0.2.1-rc.2 <0.3.0-0` and Node `>=22.19.0`.

- **The preset is a bundle patch, not a directory.** `package.json` declares
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the profile composes
  `preset-codex-kernel` (the `codex-kernel` agent preset) at boot, so the old
  `~/.dsh/.agent-presets/` copy step — and that directory itself — is gone.
  DSH 0.2 mounts presets through `@deepseek-ai/dsh-agent-preset` rows.
- **subagents: managed activations.** 0.1's `start` / `startContinuable` /
  `followup` are gone. `spawn_agent` now calls
  `subagents.startActivation({ provider, label, request, signal, delivery })`
  (background → `delivery: 'parent'`, foreground → `'caller'`), follow-ups use
  `subagents.sendMessage`, and `close_agent` is a real implementation of
  `subagents.drainChildren`. `wait_agent` is implemented over
  `subagents.waitForChildren` instead of being an honest stub.
- **Per-role recipe providers dropped.** DSH 0.2's native `spawn` provider
  inherits the selected agent preset, so a Codex child already carries this
  preset's persona and tool surface; `lib/subagents.js` recipes are no longer
  injected into the request. `exec_command`'s subagent family uses the first
  available provider of `spawn`, then `codex-agent`.
- **jobs: pull-ring producers.** `jobs.start` is called with
  `owner: agent.id`, `kind: 'bash'`, and `run(job)`; output is appended through
  `job.append(text, { channel })` on a 200 ms drain instead of the removed
  `readOutput` hook. Reads go through `jobs.read(id, caller)` and return
  `{ chunks, result, job }`; `list` / `wait` / `kill` take the caller session id.
- **`exec_command` is platform-native.** POSIX hosts run `bash -lc`, Windows
  keeps PowerShell; the hardcoded `C:\` fallback workspace root became `/`.
- **`apply()` stays synchronous.** The mesh fallback is fired without awaiting
  it, so tool and prompt registrations land inside the row's dispose set.
- **Mesh fallback resolves through the profile.** `lib/ensure-mesh.js` now
  resolves `dsh-kernel-mesh` from `profileContext.dir` (a `link:`-installed
  plugin cannot resolve its own bare dependency), and skips the fallback when
  the profile already lists the mesh in `startedBundles` — the previous code
  raced the concurrent bundle start and warned about a mesh that was mounted
  moments later.

## 0.1.8

- **npm.** Preferred install is `dsh plugin --profile web add dsh-kernel-codex`. The mesh dependency is now `dsh-kernel-mesh@^0.1.8` on the npm registry.

## 0.1.7

- **Publish channels.** Preferred install is `dsh plugin --profile web add dsh-kernel-codex` (npm, once published); GitHub remains a fallback because `lib/` ships in the repository. The mesh dependency is `github:oppnc/dsh-kernel-mesh#semver:^0.1.7`. Keywords include `dsh-plugin`.

## 0.1.6

- **Mesh dependency + fallback mount.** `dsh-kernel-mesh` is now a declared
  dependency (`dsh-kernel-mesh@^0.1.6`, originally a GitHub specifier), so installing this
  package also installs the mesh. At `apply()` time the plugin checks for the
  mesh's `kernelMesh` marker service / any `*-kernel` route; when the host
  composition never mounted the mesh, the plugin mounts its own copy
  (`lib/ensure-mesh.js`) so kernel routes and subagent recipes keep working —
  with a logged pointer to the preferred profile-level mount
  (`dsh plugin add dsh-kernel-mesh`), since a fallback-mounted mesh shares this
  row's lifecycle.

## 0.1.5

- **DSH 0.1.1-rc.2 compatibility: `spawn_agent` no longer sets `toolFilter` on
  subagent requests.** The new dsh-tools restricts `tools.restrict()` to GLOBAL
  tool names and rejects scope-local (vendor) names; the child tool mask is
  applied by the mesh `agent/created` listener instead (mesh AGENTS.md §6).
  The smoke test now asserts the request carries no `toolFilter`.
- **Codex 0.151.0 sync: model-aware persona.** `lib/system-prompt.js` gains
  `SYSTEM_PROMPT_GPT56` — the template upstream actually serves gpt-5.6
  models (`codex-rs/models-manager/models.json`
  `model_messages.instructions_template` at rust-v0.151.0; the
  `codex-rs/core/*prompt.md` files turned out to be legacy leftovers).
  New `personaForModel(model)` picks the persona upstream would serve, driven
  by the top-level `model` key of `~/.codex/config.toml` (new
  `lib/codex-config.js`); `lib/subagents.js` re-exports the picker so the mesh
  can re-derive recipe personas when it overrides recipe models. Re-check
  findings recorded in AGENTS.md: upstream removed `shell_command`, added a
  feature-gated `send_user_message_async` (off by default — not registered),
  `assign_agent_task` confirmed to have no upstream counterpart.

## 0.1.4

- **Subagent recipes match upstream Codex roles.** `codex-agent` (default),
  `codex-explore`, `codex-worker`; upstream `explorer.toml` is empty and `worker`
  has no config file, so no role restricts tools — every role runs the full Codex
  base prompt with the full toolset.
- **`spawn_agent` reuses the L2 recipes** and maps `explorer`/`worker`/default.
- **No fabricated default model.** Recipes carry an empty model; the mesh fills
  it from `~/.codex/config.toml`.

## 0.1.3

- **Upstream system prompt.** `lib/system-prompt.js` carries the full Codex prompt
  (`gpt_5_2_prompt.md`; gpt-5.6 models reuse it — there is no gpt-5.6-specific
  file). `apply()` registers it as `deployment:persona` with `complete: true` +
  `suppressRuntimeContext()`.
- **Codex's own plan mode.** Removed the DSH `enter_plan_mode`/`exit_plan_mode`
  aliases; `update_plan` is the plan mode and now writes `todo/write` session
  events so the plan renders through DSH's `todos` projection.
- **L2 subagent recipes.** `lib/subagents.js` ships `codex-explore` and
  `codex-worker` (Codex's built-in `explorer` and `worker` roles; there is no
  "general" subagent — the main agent is general).
- **Subagent mounting config.** `apply(ctx, config)` accepts `config.persona`,
  `config.skipPersona`, and `config.tools`.

## 0.1.2

- Initial DSH-form Codex CLI tool surface.
