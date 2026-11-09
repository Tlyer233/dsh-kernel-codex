English | [中文](README.zh.md)

# dsh-kernel-codex

The **Codex persona** for DSH — the prompt, and nothing else.

This package registers exactly one system-prompt section: the upstream Codex CLI prompt, rewritten against the DSH tool surface. It ships no tools of its own. The `codex` agent preset it installs is the DSH **standard** preset with that persona swapped in, so every standard DSH tool stays callable:

```
bash  read  write  edit  glob  grep  web_search  web_fetch
job_list  job_output  job_kill  subagent  subagent_fork  workflow
todo_write  ask_user_question  skill  create_goal/update_goal
schedule_*  enter_plan_mode/exit_plan_mode  present
```

Persona distilled from `@openai/codex` **rust-v0.151.0**: `gpt_5_2_prompt.md` for pre-5.6 models, and the `models.json` `instructions_template` for `gpt-5.6-*` models.

## What changed in 0.3.0

0.2.x shipped 30 Codex-shaped tools (`exec_command`, `apply_patch`, `spawn_agent`, …). 0.3.0 deletes them; the persona is the whole plugin. The prompt now teaches the DSH tools instead:

| Codex tool | DSH tool the prompt now teaches |
|---|---|
| `exec_command` | `bash` |
| `view_file` | `read` |
| `view_image` | `read_image` |
| `apply_patch` | `edit` / `write` |
| `update_plan` | `todo_write` |
| `request_user_input` | `ask_user_question` |
| `web_search` | `mcp__exa__web_search_exa` (Exa MCP) |
| `spawn_agent` / `send_input` / `wait` / `close_agent` | `subagent` / `send_message` / `interrupt_agent` / `list_agents` |
| `list_tasks` / `task_output` / `task_stop` | `job_list` / `job_output` / `job_kill` |

Workflows DSH has no equivalent for — `write_stdin`, `request_permissions`, `get_context_remaining`, `new_context` — were removed from the prompt. The Codex "commentary / final channel" model was replaced with DSH's streamed progress messages plus one final answer.

## Install

Install **from GitHub** — 0.3.0 only exists there:

```sh
dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex
```

The npm release is still **0.1.8**, the build that ships the 30 Codex-shaped tools (see
"What changed in 0.3.0"), so the bare name — `dsh plugin --profile web add dsh-kernel-codex` —
installs the old tool plugin, not this persona. `lib/` is committed to the repository, which is
what lets the `github:` specifier install it directly. When GitHub is not reachable without a
proxy, put the install behind one:
`https_proxy=http://127.0.0.1:<port> dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex`.

This package is a DSH 0.2 **bundle**: `package.json` declares
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, so the profile composes the `codex`
preset at boot. There is no preset directory to copy — DSH 0.2 replaced
`~/.dsh/.agent-presets/` with declarative `@deepseek-ai/dsh-agent-preset` rows.

Restart the profile afterwards. The preset picker lists **codex**.

## How the persona is registered

`lib/index.js` contributes one section to the prompt registry:

```js
systemPrompt.section({
  name: 'deployment:persona',
  order: 0,
  text: personaForModel(readCodexConfigModel()),
  complete: false,
})
```

- `complete: false` (default) keeps DSH's own sections — the `available_skills` catalog, AGENTS.md instructions, and the runtime-context snapshot — around the Codex persona. The prompt is adapted *to* DSH, not a replacement of it.
- `complete: true` restores upstream Codex behavior: the persona becomes the sole system-prompt section and the runtime-context snapshot is dropped.
- `persona` overrides the text outright; `skipPersona: true` makes the row register nothing (used when a kernel mesh mounts the plugin on a child that already has a persona).

## License

MIT — see [LICENSE](LICENSE).
