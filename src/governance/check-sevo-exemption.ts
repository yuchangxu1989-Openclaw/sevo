/**
 * checkSevoExemption — Determines whether a task should be exempt from SEVO pipeline routing.
 *
 * Used by the sevo-pipeline extension plugin to skip pipeline creation for tasks
 * that are inherently non-development (audit, research, infra) or explicitly exempted.
 *
 * @param taskPrompt - The task description/prompt content
 * @param agentId - The agent being dispatched to
 * @param label - The task label (may be empty)
 * @returns ExemptionResult if exempt, null if not exempt
 */

export interface ExemptionResult {
  ruleId: string;
  exemptedBy?: string;
  exemptReason?: string;
}

// ── Exemption Rules ─────────────────────────────────────────────

const AUDIT_PROMPT_PATTERNS = [
  /审计/,
  /code\s*review/i,
  /安全审计/,
  /质量审计/,
  /review.*spec/i,
  /review.*code/i,
];

const AUDIT_LABEL_PREFIXES = ['audit-', 'review-'];

const RESEARCH_PROMPT_PATTERNS = [
  /调研/,
  /研究/,
  /分析报告/,
  /竞品/,
  /research/i,
];

const RESEARCH_LABEL_PREFIXES = ['research-'];

const HOTFIX_PROMPT_PATTERNS = [
  /(?:^|\s)P0\s*(?:fix|修复|紧急|urgent|hotfix)/i,
  /紧急修复/,
  /hotfix/i,
  /urgent\s*fix/i,
];

const HOTFIX_LABEL_PREFIXES = ['p0-', 'hotfix-'];

const SEVO_INTERNAL_LABEL_PATTERNS = [/^sevo-/];

const INFRA_PROMPT_PATTERNS = [
  /watchdog/i,
  /插件维护/,
  /plugin.*维护/,
  /cron.*维护/,
  /systemd/,
  /基础设施/,
  /infrastructure/i,
];

// ── Main Function ───────────────────────────────────────────────

export function checkSevoExemption(
  taskPrompt: string,
  agentId: string,
  label: string,
): ExemptionResult | null {
  // Rule: manual exemption via label prefix "exempt:"
  // Only the main session agent is allowed to use manual exemption.
  if (label.startsWith('exempt:')) {
    if (agentId && agentId !== 'main') {
      // Non-main agents cannot use exempt: prefix — fall through to other rules
    } else {
      const reason = label.slice('exempt:'.length).trim() || 'no reason provided';
      return {
        ruleId: 'exempt.manual',
        exemptedBy: agentId,
        exemptReason: reason,
      };
    }
  }

  // Rule: audit tasks (by prompt content or label prefix)
  if (matchesAny(taskPrompt, AUDIT_PROMPT_PATTERNS) || startsWithAny(label, AUDIT_LABEL_PREFIXES)) {
    return { ruleId: 'exempt.audit' };
  }

  // Rule: research tasks (by prompt content or label prefix)
  if (matchesAny(taskPrompt, RESEARCH_PROMPT_PATTERNS) || startsWithAny(label, RESEARCH_LABEL_PREFIXES)) {
    return { ruleId: 'exempt.research' };
  }

  // Rule: hotfix/P0 tasks (by prompt content or label prefix)
  if (matchesAny(taskPrompt, HOTFIX_PROMPT_PATTERNS) || startsWithAny(label, HOTFIX_LABEL_PREFIXES)) {
    return { ruleId: 'exempt.hotfix' };
  }

  // Rule: SEVO internal tasks (label starts with "sevo-")
  if (SEVO_INTERNAL_LABEL_PATTERNS.some((p) => p.test(label))) {
    return { ruleId: 'exempt.sevo_internal' };
  }

  // Rule: infrastructure maintenance (by prompt content)
  if (matchesAny(taskPrompt, INFRA_PROMPT_PATTERNS)) {
    return { ruleId: 'exempt.infra' };
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function startsWithAny(text: string, prefixes: string[]): boolean {
  return prefixes.some((p) => text.startsWith(p));
}
