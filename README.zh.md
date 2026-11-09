[English](README.md) | 中文

# dsh-kernel-codex

给 DSH 用的 **Codex 人设**——只有提示词，没有工具。

本包只注册一个 system-prompt 段：上游 Codex CLI 的提示词，按 DSH 的工具面重写。它自己不带任何工具。它安装的 `codex` 预设 = DSH **标准模式**预设，只把人设换成 Codex，所以所有标准 DSH 工具都还能调用：

```
bash  read  write  edit  glob  grep  web_search  web_fetch
job_list  job_output  job_kill  subagent  subagent_fork  workflow
todo_write  ask_user_question  skill  create_goal/update_goal
schedule_*  enter_plan_mode/exit_plan_mode  present
```

人设取自 `@openai/codex` **rust-v0.151.0**：5.6 以前的模型用 `gpt_5_2_prompt.md`，`gpt-5.6-*` 用 `models.json` 里的 `instructions_template`。

## 0.3.0 改了什么

0.2.x 带 30 个 Codex 形态工具（`exec_command`、`apply_patch`、`spawn_agent` …）。0.3.0 把它们全删了，插件就等于人设本身。提示词现在教的是 DSH 工具：

| Codex 工具 | 提示词里改用的 DSH 工具 |
|---|---|
| `exec_command` | `bash` |
| `view_file` | `read` |
| `view_image` | `read_image` |
| `apply_patch` | `edit` / `write` |
| `update_plan` | `todo_write` |
| `request_user_input` | `ask_user_question` |
| `web_search` | `mcp__exa__web_search_exa`（Exa MCP） |
| `spawn_agent` / `send_input` / `wait` / `close_agent` | `subagent` / `send_message` / `interrupt_agent` / `list_agents` |
| `list_tasks` / `task_output` / `task_stop` | `job_list` / `job_output` / `job_kill` |

DSH 没有对应物的流程——`write_stdin`、`request_permissions`、`get_context_remaining`、`new_context`——已从提示词删除。Codex 的“commentary / final 双通道”改成了 DSH 的流式进度消息 + 一条最终答复。

## 安装

**从 GitHub 装**——0.3.0 目前只在 GitHub 上：

```sh
dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex
```

npm 上的 `dsh-kernel-codex` 还停在 **0.1.8**，那是带 30 个 Codex 形态工具的旧版（见「0.3.0 改了什么」），
所以不带 `github:` 的 `dsh plugin --profile web add dsh-kernel-codex` 装到的是旧工具插件，不是这个人设。
本仓库已提交 `lib/`，`github:` 才能直接安装；GitHub 直连不通时给命令套上代理：
`https_proxy=http://127.0.0.1:<代理端口> dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex`。

本包是 DSH 0.2 的 **bundle**：`package.json` 声明了
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，profile 启动时就会组合出 `codex`
预设。不需要复制预设目录——DSH 0.2 用声明式的 `@deepseek-ai/dsh-agent-preset` 行取代了
`~/.dsh/.agent-presets/`。

重启 profile 后，预设选择器里会出现 **codex**。

## 人设是怎么注册的

`lib/index.js` 只向提示词注册表贡献一个段：

```js
systemPrompt.section({
  name: 'deployment:persona',
  order: 0,
  text: personaForModel(readCodexConfigModel()),
  complete: false,
})
```

- `complete: false`（默认）保留 DSH 自己的段——`available_skills` 目录、AGENTS.md 指令、运行时上下文快照——Codex 人设与它们并存。这是“适配 DSH”，不是替代 DSH。
- `complete: true` 恢复上游 Codex 行为：人设成为唯一的系统提示段，运行时上下文快照被丢弃。
- `persona` 直接覆盖文本；`skipPersona: true` 让该行什么都不注册（kernel mesh 在已有子代理人设时挂载本插件就用它）。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
