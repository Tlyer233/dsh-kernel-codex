// dsh-kernel-codex — the Codex CLI persona, and nothing else, as a DSH plugin.
//
// This row contributes ONE system-prompt section: the upstream Codex prompt,
// rewritten against the DSH tool surface. It registers no tools at all — the
// `codex` agent preset mounts DSH's own tool rows, so bash / read / write /
// edit / glob / grep / web_search / job_* / subagent / todo_write /
// ask_user_question / skill / goal / plan mode / workflow are all callable
// alongside this persona.
//
// Prompt sources (upstream `openai/codex`, rust-v0.151.0):
//   - gpt_5_2_prompt.md                       → SYSTEM_PROMPT
//   - models.json instructions_template       → SYSTEM_PROMPT_GPT56 (gpt-5.6-*)
// Tool names inside both are kept in their DSH form; the original Codex tool
// surface (exec_command / apply_patch / update_plan / spawn_agent / …) is gone.
import { personaForModel } from './system-prompt.js'
import { readCodexConfigModel } from './codex-config.js'

const name = 'dsh-kernel-codex'
const inject = ['systemPrompt']

/** The persona this row contributes; `config.persona` overrides the model-aware default. */
function personaText(config) {
  if (config && typeof config.persona === 'string' && config.persona.length > 0) return config.persona
  return personaForModel(readCodexConfigModel())
}

function apply(ctx, config = {}) {
  // Child mounts from a kernel mesh pass `skipPersona` when the recipe already
  // installs its own persona; stay out of the way instead of registering twice.
  if (config.skipPersona === true) return

  const systemPrompt = ctx.get('systemPrompt')
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return

  // Default: the Codex persona is the only persona section, while every other
  // DSH section (skills catalog, AGENTS.md instructions, runtime context) stays
  // in place — the prompt is adapted TO DSH, not a replacement of it.
  // `complete: true` restores upstream Codex behavior: the persona becomes the
  // sole system-prompt section and the runtime-context snapshot is dropped.
  const complete = config.complete === true
  systemPrompt.section({
    name: 'deployment:persona',
    order: 0,
    text: personaText(config),
    complete,
  })
  if (complete && typeof systemPrompt.suppressRuntimeContext === 'function') systemPrompt.suppressRuntimeContext()
}

export { name, inject, apply }
