English | [中文](README.zh.md)

# dsh-kernel-codex

DSH runs on one simple idea: **everything is a plugin**. Models, tools, subagents — plug them together however you like.

So we did exactly that: we turned the **OpenAI Codex CLI into a DSH plugin**. The codex tool surface you already know — `exec_command`, `write_stdin`, `apply_patch`, `request_permissions`, `web_search`, `view_image`, `sleep`, `update_plan`, `request_user_input`, `get_context_remaining`, `new_context`, the multi-agent family (`spawn_agent` and friends), background-task management (`list_tasks` / `task_output` / `task_stop`), and the file primitives `view_file` / `write_file` / `edit_file` / `glob` / `grep` — 30 tools in all, now native DSH tools. Same names, same schemas, same behavior.

The payoff is simple: use the Codex CLI tool surface natively inside DSH — **no different** from opening Codex itself. Every model stays in the environment it knows best — main agent or subagent, it feels like coming home.

Distilled from `@openai/codex` **0.147.0** (stable). The 0.148 series is still alpha; handler names are unchanged.

## System prompt & subagents

`lib/system-prompt.js` carries the full upstream **Codex** prompt
(`gpt_5_2_prompt.md`; gpt-5.6 models reuse it). `apply()` registers it as the
agent's sole system-prompt section (`complete: true` + `suppressRuntimeContext()`).

Codex's own plan mode is `update_plan` (it writes `todo/write` events so the plan
renders through DSH's `todos` projection); there is no DSH `enter_plan_mode` /
`exit_plan_mode` pair.

`lib/subagents.js` ships `codex-agent`, `codex-explore`, and `codex-worker` (Codex's built-in
`default`, `explorer`, and `worker` roles). The mesh loads them and mounts this plugin on each
child with a `config.tools` whitelist.

## Install

1. Install the plugin into your profile with the official plugin command:

   ```sh
   dsh plugin --profile web add dsh-kernel-codex
   ```

   GitHub also works (`dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex`) because `lib/` ships in the repository.

   This package is a DSH 0.2 **bundle**: `package.json` declares
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, so the profile composes the
   `codex-kernel` preset at boot. There is no preset directory to copy — DSH 0.2 replaced
   `~/.dsh/.agent-presets/` with declarative `@deepseek-ai/dsh-agent-preset` rows.

2. Install the mesh into the same profile. It supplies the `codex-kernel` model route and the
   L2 subagent recipes; without it the surface still loads, but routes and recipes are
   unavailable:

   ```sh
   dsh plugin --profile web add dsh-kernel-mesh
   ```

3. Restart the profile. The preset picker lists **Codex kernel**, and the preset mounts the
   Codex surface itself:

   ```yaml
   - id: codex-surface
     name: dsh-kernel-codex
   ```

   `tool-fs`, `tool-web`, and `tool-fs-search` are deliberately absent: the Codex surface owns
   `view_file` / `write_file` / `edit_file` / `glob` / `grep` / `web_search`, so those DSH rows
   would only shadow them. `tool-jobs` stays — the jobs controller attaches there.

   `send_message`, `interrupt_agent`, and `list_agents` share names with DSH's native control tools: if those rows already registered the names, Codex skips them; otherwise the Codex-named tools deliver the same `subagents` APIs.

## Usage

Pick the **Codex kernel** preset. Its tools run under whatever model route you select; the
**codex-kernel** route itself appears once the mesh finds vendor credentials for it.

## License

MIT — see [LICENSE](LICENSE).
