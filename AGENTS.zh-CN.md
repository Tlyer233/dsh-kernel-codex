# AGENTS.md — dsh-kernel-codex

面向维护者的 `dsh-kernel-codex` 包文档。本文件解释这个包现在是什么、为什么是这个形状，以及测试锁住了哪些不变量——这样未来的维护者（或智能体）改 `lib/index.js` 或提示词时不用重新推导每个决策。

## 总览

`dsh-kernel-codex` 是**人设插件**，不是工具插件。它只贡献一个 system-prompt 段——上游 OpenAI Codex CLI 的提示词，按 DSH 工具面重写——注册的工具数为零。

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

为什么必须拆开：0.2.x 里 Codex 提示词和 Codex 工具面是一起发的。现在不是了。`codex` 预设挂的是 DSH 标准工具行，所以人设**必须**教 DSH 的工具名，否则模型会去调不存在的工具。

## 预设

`cordis.patch.yml` 插入一个 `@deepseek-ai/dsh-agent-preset` 行：

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
      # … DSH 标准预设的每一行，原样照搬
```

规则：

- 这个预设 = DSH **标准**预设（`dsh-web-app/presets/standard.patch.yml`），只把 `persona` 行换成 `codex-persona`。上游标准预设新增工具行时，这里也要加——少一行就是少一个工具。
- 必须保留的标准行：`tool-bash`/`tool-pwsh`、`agent-instructions`、`time-context`、`tool-fs`、`tool-fs-search`、`tool-jobs`、`tool-schedule`、`skill-filesystem`、`tool-skill`、`command-goal`/`tool-goal`、`plan-mode`、`compaction`、`tool-subagent-control` / `tool-subagent` / `tool-workflow`、`tool-ask-user`、`tool-todo`、`tool-web`、`present`。
- `tool-plugin-manager` 与 `tool-plugin-market` 保持 `disabled: true`——与标准预设一致。

## 提示词不变量

`lib/system-prompt.js` 导出两份模板：

- `SYSTEM_PROMPT` —— `gpt_5_2_prompt.md`（5.6 以前）。
- `SYSTEM_PROMPT_GPT56` —— `models.json` 的 `instructions_template`，服务 `gpt-5.6-*`。
- `personaForModel(model)` 负责选择。

适配规则（`test/smoke.test.js` 强制）：

| Codex 工具 | 提示词里的 DSH 工具 |
|---|---|
| `exec_command` | `bash` |
| `view_file` | `read` |
| `view_image` | `read_image` |
| `apply_patch` | `edit` / `write` |
| `update_plan` | `todo_write` |
| `request_user_input` | `ask_user_question` |
| `web_search` | `mcp__exa__web_search_exa` |
| `spawn_agent` 家族 | `subagent` / `send_message` / `interrupt_agent` / `list_agents` |
| `list_tasks` / `task_output` / `task_stop` | `job_list` / `job_output` / `job_kill` |

两份模板里都禁止出现：`exec_command`、`write_stdin`、`apply_patch`、`view_file`、`update_plan`、`spawn_agent`、`request_permissions`、`get_context_remaining`、`new_context`、`skills.list`、`skills.read`、`request_user_input`，以及 Codex 的 `commentary` / `final` 双通道模型。DSH 都没有，写进去就是 bug。

两份模板里都必须出现：`bash`、`read`、`write`、`edit`、`glob`、`grep`、`todo_write`、`ask_user_question`、`subagent`、`job_list` / `job_output` / `job_kill`、`mcp__exa__web_search_exa`、`skill`。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `persona` | 按模型选择的提示词 | 直接覆盖段文本 |
| `complete` | `false` | `true` 时人设成为唯一提示词段，并丢弃运行时上下文快照（上游 Codex 行为） |
| `skipPersona` | `false` | `true` 时什么都不注册；`dsh-kernel-mesh` 在已有子代理人设的 kernel 子代理上挂载本行时使用 |

`complete: false` 是有意的：DSH 自己的段（`available_skills` 目录、AGENTS.md 指令、运行时上下文）必须保留。提示词是**适配 DSH**，不是替代 DSH。

## DSH 0.2 契约要点

- bundle 通过 `package.json` 的 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 声明；`dsh plugin add` 负责 profile 与预设行，启动即出现。0.2 已用 `@deepseek-ai/dsh-agent-preset` 行取代 `~/.dsh/.agent-presets/`，不再需要复制预设目录。
- 本包**没有运行时依赖**。0.2.x 的 mesh 依赖、`lib/ensure-mesh.js`、`lib/subagents.js` 已在 0.3.0 删除。
- `engines` 锁 `dsh >=0.2.1-rc.2 <0.3.0-0`、Node `>=22.19.0`。

## 测试

```sh
npm test                       # 语法 + smoke（打印断言数）
dsh --profile <p> --dump-config | grep -A20 preset-codex   # 组合检查
```

实机检查：把包装进一个测试 profile，启动，选 `codex` 预设，让模型在一个回合里依次调用 `todo_write`、`bash`、`write`、`read`、`edit`。五个都必须返回真实输出——只有当人设下面的标准工具确实可调用，这个人设才有意义。

## 已知局限

- 提示词正文来自上游；上游发布新的 `instructions_template` 时，拷进来重跑一次适配（smoke 测试列出了所有必须替换的名字）。
- 5.6 以前的模板上游没有 skills 章节；本包补了一小段 `skill` / `ask_user_question` 说明，让两份模板都覆盖完整 DSH 工具面。
- 人设把 `mcp__exa__web_search_exa` 指定为联网搜索工具；未挂 Exa MCP 行时，提示词的兜底是标准 `tool-web` 行提供的 `web_search`。
