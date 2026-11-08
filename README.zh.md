[English](README.md) | 中文

# dsh-kernel-codex

DSH 有个很朴素的想法：**一切都是插件**。模型是插件，工具是插件，子代理也是插件，想怎么拼就怎么拼。

顺着这个思路，我们把 **OpenAI Codex CLI 写成了 DSH 插件**。你熟悉的 codex 工具面——`exec_command`、`write_stdin`、`apply_patch`、`request_permissions`、`web_search`、`view_image`、`sleep`、`update_plan`、`request_user_input`、`get_context_remaining`、`new_context`、`spawn_agent` 那一大家子多代理工具、`list_tasks`/`task_output`/`task_stop` 后台任务管理，还有 `view_file`/`write_file`/`edit_file`/`glob`/`grep` 文件操作——一共 30 个工具，现在就是 DSH 的原生工具，名字一样、schema 一样、行为一样。

好处很简单：在 DSH 里原生使用 Codex CLI 这套工具，和直接打开 Codex **没有任何区别**。每个模型都待在自己最熟悉的环境里，不管是主 agent 还是 subagent，感觉就像回家一样。

对齐 `@openai/codex` **0.147.0**（稳定版）。0.148 系列仍是 alpha，handler 名称未变。

## 系统提示词与子代理

`lib/system-prompt.js` 携带完整的上游 **Codex** prompt（`gpt_5_2_prompt.md`；
gpt-5.6 系列模型复用它）。`apply()` 把它注册为 agent 唯一的 system-prompt 段
（`complete: true` + `suppressRuntimeContext()`）。

Codex 自己的计划模式是 `update_plan`（它会写 `todo/write` 事件，让计划通过 DSH
的 `todos` 投影渲染）；没有 DSH 的 `enter_plan_mode` / `exit_plan_mode` 对。

`lib/subagents.js` 提供 `codex-agent`、`codex-explore` 和 `codex-worker`（Codex 内置的
`default`、`explorer` 与 `worker` 角色）。mesh 会加载它们，并在每个子代理上以
`config.tools` 白名单挂载本插件。

## 安装

1. 用官方插件命令把本包装进你的 profile：

   ```sh
   dsh plugin --profile web add dsh-kernel-codex
   ```

   GitHub 也可以（`dsh plugin --profile web add github:Tlyer233/dsh-kernel-codex`），因为本仓库已经提交了 `lib/`。

   本包是 DSH 0.2 的 **bundle**：`package.json` 声明了
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，profile 在启动时就会组合出
   `codex-kernel` 预设。已经不需要复制预设目录——DSH 0.2 用声明式的
   `@deepseek-ai/dsh-agent-preset` 行取代了 `~/.dsh/.agent-presets/`。

2. 把 mesh 装进同一个 profile。它提供 `codex-kernel` 模型路由和 L2 子代理配方；没有它插件照样加载，但路由和配方不可用：

   ```sh
   dsh plugin --profile web add dsh-kernel-mesh
   ```

3. 重启 profile。预设选择器里会出现 **Codex kernel**，预设自己挂载 Codex 工具面：

   ```yaml
   - id: codex-surface
     name: dsh-kernel-codex
   ```

   预设故意不含 `tool-fs`、`tool-web`、`tool-fs-search`：Codex 工具面自带
   `view_file` / `write_file` / `edit_file` / `glob` / `grep` / `web_search`，这些 DSH 行只会遮蔽它们。
   `tool-jobs` 保留——jobs 控制器挂在那里。

   `send_message`、`interrupt_agent`、`list_agents` 与 DSH 原生控制工具同名：若那些行已经注册了这些名字，Codex 会跳过；否则 Codex 同名工具会交付相同的 `subagents` API。

## 使用

选 **Codex kernel** 预设，它的工具在你选的任何模型路由下都可用；只有当 mesh 找到对应厂商凭据时，**codex-kernel** 路由本身才会出现。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
