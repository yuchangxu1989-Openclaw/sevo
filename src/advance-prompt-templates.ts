export const ADVANCE_PROMPT_TEMPLATES = Object.freeze({
  autoAdvanceAction:
    '{agentLine} | timeout: {timeout}s{roleNavHint}{roleRelevantAgents}\n' +
    'Label (required): {label}\n' +
    '必须在本回合立即派发；This is not a suggestion. Spawn this task now.\n' +
    '派发完成后必须确认 task board 中出现同 label 任务；if the board does not contain this label, retry dispatch before continuing.\n\n' +
    '{commercializationGateBlock}{taskDescription}',
});

export type AdvancePromptTemplateName = keyof typeof ADVANCE_PROMPT_TEMPLATES;

export function renderAdvancePromptTemplate(
  name: AdvancePromptTemplateName,
  values: Record<string, unknown> = {},
  templates: Partial<Record<AdvancePromptTemplateName, string>> = ADVANCE_PROMPT_TEMPLATES,
): string {
  const templateSet: Record<AdvancePromptTemplateName, string> = { ...ADVANCE_PROMPT_TEMPLATES, ...templates };
  const template = templateSet[name];
  if (typeof template !== 'string') {
    throw new Error(`Unknown advance prompt template: ${name}`);
  }
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}
