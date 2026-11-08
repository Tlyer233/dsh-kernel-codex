# AGENTS.md — dsh-kernel-codex

Maintainer-facing notes for the `dsh-kernel-codex` package. This file explains
what the package is now, why it is shaped that way, and which invariants the
tests pin — so a future maintainer (or agent) can change `lib/index.js` or the
prompt without re-deriving every decision.

## Overview

`dsh-kernel-codex` is a **persona plugin**, not a tool plugin. It contributes
exactly one system-prompt section — the upstream OpenAI Codex CLI prompt,
rewritten against the DSH tool surface — and registers no tools at all.

```js
export const name = 'dsh-kernel-codex'
export const inject = ['systemPrompt']

export function apply(ctx, config = {}) {
  if (config.skipPersona === true) return
  const systemPrompt = ctx.get('systemPrompt')
  if (!systemPrompt) return
  systemPrompt.section({ name: 'deployment:persona', order: 0, text, complete })
}
```

Why the split matters: the Codex prompt and the Codex tool surface used to ship
together (0.2.x). They no longer do. The `codex` preset mounts the DSH standard
tool rows, so the persona must teach **DSH** tool names or the model calls tools
that do not exist.

## The preset

`cordis.patch.yml` inserts one `@deepseek-ai/dsh-agent-preset` row:

```yaml
- id: preset-codex
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: codex
    name: codex
    order: 5
    plugins:
      - id: codex-persona
        name: dsh-kernel-codex
      # … every row of the shipped standard preset, verbatim
```

Rules:

- The preset is the DSH **standard** preset (`dsh-web-app/presets/standard.patch.yml`)
  with the `persona` row replaced by `codex-persona`. If upstream adds a
  standard tool row, add it here too — a missing row is a missing tool.
- Every standard tool row must stay present: `tool-bash`/`tool-pwsh`,
  `agent-instructions`, `time-context`, `tool-fs`, `tool-fs-search`,
  `tool-jobs`, `tool-schedule`, `skill-filesystem`, `tool-skill`,
  `command-goal`/`tool-goal`, `plan-mode`, `compaction`,
  `tool-subagent-control` / `tool-subagent` / `tool-workflow`,
  `tool-ask-user`, `tool-todo`, `tool-web`, `present`.
- `tool-plugin-manager` and `tool-plugin-market` stay `disabled: true` — same
  as the shipped standard preset.

## Prompt invariants

`lib/system-prompt.js` exports two templates:

- `SYSTEM_PROMPT` — `gpt_5_2_prompt.md` (pre-5.6 models).
- `SYSTEM_PROMPT_GPT56` — the `models.json` `instructions_template` served to
  `gpt-5.6-*`.
- `personaForModel(model)` picks between them.

Adaptation rules (enforced by `test/smoke.test.js`):

| Codex tool | DSH tool in the prompt |
|---|---|
| `exec_command` | `bash` |
| `view_file` | `read` |
| `view_image` | `read_image` |
| `apply_patch` | `edit` / `write` |
| `update_plan` | `todo_write` |
| `request_user_input` | `ask_user_question` |
| `web_search` | `mcp__exa__web_search_exa` |
| `spawn_agent` family | `subagent` / `send_message` / `interrupt_agent` / `list_agents` |
| `list_tasks` / `task_output` / `task_stop` | `job_list` / `job_output` / `job_kill` |

Forbidden in both templates: `exec_command`, `write_stdin`, `apply_patch`,
`view_file`, `update_plan`, `spawn_agent`, `request_permissions`,
`get_context_remaining`, `new_context`, `skills.list`, `skills.read`,
`request_user_input`, and the Codex `commentary` / `final` channel model.
DSH has none of them, so a prompt that mentions them is a bug.

Required in both templates: `bash`, `read`, `write`, `edit`, `glob`, `grep`,
`todo_write`, `ask_user_question`, `subagent`, `job_list` / `job_output` /
`job_kill`, `mcp__exa__web_search_exa`, `skill`.

## Configuration

| key | default | meaning |
|---|---|---|
| `persona` | model-aware prompt | overrides the section text outright |
| `complete` | `false` | `true` makes the persona the sole prompt section and suppresses the runtime-context snapshot (upstream Codex behavior) |
| `skipPersona` | `false` | `true` registers nothing; used by `dsh-kernel-mesh` when it mounts this row on a kernel child that already has a persona |

`complete: false` is deliberate: DSH's own sections (`available_skills`
catalog, AGENTS.md instructions, runtime context) must survive. The prompt is
adapted *to* DSH, not a replacement of it.

## DSH 0.2 contract notes

- The bundle is declared as `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
  in `package.json`; `dsh plugin add` reconciles the profile, and the preset
  appears at boot. There is no preset directory to copy — 0.2 replaced
  `~/.dsh/.agent-presets/` with `@deepseek-ai/dsh-agent-preset` rows.
- The package has **no runtime dependencies**. The 0.2.x mesh dependency,
  `lib/ensure-mesh.js`, and `lib/subagents.js` were removed in 0.3.0.
- `engines` pins `dsh >=0.2.1-rc.2 <0.3.0-0` and Node `>=22.19.0`.

## Testing

```sh
npm test                       # syntax + smoke (assertion count printed)
dsh --profile <p> --dump-config | grep -A20 preset-codex   # composition check
```

For a live check: install the package into a scratch profile, boot it, pick the
`codex` preset, and ask the agent to call `todo_write`, `bash`, `write`,
`read`, and `edit` in one turn. All five must return real output — the persona
is only useful if the standard tools underneath it are callable.

## Known limitations

- Prompt prose is upstream-derived; when upstream ships a new
  `instructions_template`, copy it in and re-run the adaptation pass (the smoke
  test lists every name that must change).
- The pre-5.6 template has no skills section upstream; it gained a short
  `skill` / `ask_user_question` note so both templates teach the full DSH
  surface.
- The persona names `mcp__exa__web_search_exa` as the web tool. When the Exa
  MCP row is not mounted, the prompt's fallback is `web_search`, which the
  standard `tool-web` row provides.
