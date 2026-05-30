import type { StageId } from '../types/index.js';
import type { AmbiguitySignal, AmbiguitySignalType, DetectionRule } from './clarification-types.js';

/**
 * Configurable ambiguity detector with pluggable rules.
 * Scans content for ambiguity signals across pipeline stages (FR-11).
 */
export class AmbiguityDetector {
  private readonly rules = new Map<string, DetectionRule>();

  constructor(options?: { useDefaults?: boolean }) {
    if (options?.useDefaults !== false) {
      for (const rule of createDefaultRules()) {
        this.rules.set(rule.id, rule);
      }
    }
  }

  addRule(rule: DetectionRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getRules(): DetectionRule[] {
    return [...this.rules.values()];
  }

  detect(content: string, _stage?: StageId): AmbiguitySignal[] {
    const signals: AmbiguitySignal[] = [];
    for (const rule of this.rules.values()) {
      signals.push(...rule.detect(content));
    }
    return signals;
  }
}

// ── Built-in default rules ──────────────────────────────────────

function createDefaultRules(): DetectionRule[] {
  return [
    {
      id: 'ac-missing',
      signalType: 'acceptance-criteria-missing',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const frPattern = /^###?\s+(FR-\d+[^\n]*)/gm;
        let match: RegExpExecArray | null;
        while ((match = frPattern.exec(content)) !== null) {
          const frTitle = match[1]!;
          const startIdx = match.index + match[0].length;
          const nextSection = content.indexOf('\n##', startIdx);
          const section = content.slice(startIdx, nextSection === -1 ? undefined : nextSection);
          if (!/AC-\d|验收标准|acceptance.?criter/i.test(section)) {
            signals.push({
              type: 'acceptance-criteria-missing',
              description: `${frTitle} lacks acceptance criteria`,
              location: frTitle,
              severity: 'high',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'boundary-undefined',
      signalType: 'boundary-undefined',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const vague = /(?:适当|合理|必要时|视情况|酌情|as\s+needed|if\s+appropriate|reasonable)/gi;
        let match: RegExpExecArray | null;
        while ((match = vague.exec(content)) !== null) {
          const lineStart = content.lastIndexOf('\n', match.index) + 1;
          const lineEnd = content.indexOf('\n', match.index);
          const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
          signals.push({
            type: 'boundary-undefined',
            description: `Vague boundary: "${match[0]}" without quantifiable criteria`,
            location: line.slice(0, 80),
            severity: 'medium',
          });
        }
        return signals;
      },
    },
    {
      id: 'term-undefined',
      signalType: 'term-undefined',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const termIntro = /(?:所谓|即|refers?\s+to|defined?\s+as|means?)\s+"([^"]+)"/gi;
        const definedTerms = new Set<string>();
        let match: RegExpExecArray | null;
        while ((match = termIntro.exec(content)) !== null) {
          definedTerms.add(match[1]!.toLowerCase());
        }
        // Detect capitalized terms or quoted terms that appear without definition
        const usedTerms = /「([^」]+)」|"([^"]+)"/g;
        while ((match = usedTerms.exec(content)) !== null) {
          const term = (match[1] ?? match[2] ?? '').toLowerCase();
          if (!definedTerms.has(term) && term.length > 1 && term.length < 30) {
            definedTerms.add(term); // only flag first occurrence
            signals.push({
              type: 'term-undefined',
              description: `Term "${match[1] ?? match[2] ?? ''}" used without definition`,
              location: `char ${match.index}`,
              severity: 'low',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'dependency-undeclared',
      signalType: 'dependency-undeclared',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const depHints = /(?:依赖|requires?|depends?\s+on|assumes?|前提|prerequisite)[：:\s]+([^\n。.]+)/gi;
        let match: RegExpExecArray | null;
        while ((match = depHints.exec(content)) !== null) {
          const dep = (match[1] ?? '').trim();
          if (dep.length > 2 && !/已[声明确]|declared|documented/i.test(dep)) {
            signals.push({
              type: 'dependency-undeclared',
              description: `Potential undeclared dependency: "${dep.slice(0, 60)}"`,
              location: `char ${match.index}`,
              severity: 'medium',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'interface-incomplete',
      signalType: 'interface-incomplete',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const ifacePattern = /(?:接口|interface|API|endpoint)[：:\s]+([^\n]+)/gi;
        let match: RegExpExecArray | null;
        while ((match = ifacePattern.exec(content)) !== null) {
          const desc = match[1] ?? '';
          if (!/参数|param|返回|return|错误|error|response/i.test(desc)) {
            signals.push({
              type: 'interface-incomplete',
              description: `Interface description lacks params/return/error spec: "${desc.slice(0, 60)}"`,
              location: `char ${match.index}`,
              severity: 'high',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'data-flow-unclear',
      signalType: 'data-flow-unclear',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const flowHints = /(?:数据|data)\s*(?:流|flow|传递|transfer|exchange)/gi;
        let match: RegExpExecArray | null;
        while ((match = flowHints.exec(content)) !== null) {
          const ctx = content.slice(match.index, match.index + 120);
          if (!/(?:从|from|到|to|格式|format|schema|producer|consumer|产出|消费)/i.test(ctx)) {
            signals.push({
              type: 'data-flow-unclear',
              description: 'Data flow mentioned without specifying producer/consumer/format',
              location: `char ${match.index}`,
              severity: 'medium',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'performance-constraint-missing',
      signalType: 'performance-constraint-missing',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const perfHints = /(?:性能|performance|latency|throughput|延迟|吞吐)/gi;
        let match: RegExpExecArray | null;
        while ((match = perfHints.exec(content)) !== null) {
          const ctx = content.slice(match.index, match.index + 100);
          if (!/\d+\s*(?:ms|s|秒|毫秒|qps|tps|rps|%)/i.test(ctx)) {
            signals.push({
              type: 'performance-constraint-missing',
              description: 'Performance mentioned without quantifiable constraint',
              location: `char ${match.index}`,
              severity: 'medium',
            });
          }
        }
        return signals;
      },
    },
    {
      id: 'spec-contract-contradiction',
      signalType: 'spec-contract-contradiction',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        const contradictions = /(?:矛盾|contradiction|conflict|inconsisten|不一致|与.*相悖)/gi;
        let match: RegExpExecArray | null;
        while ((match = contradictions.exec(content)) !== null) {
          const lineStart = content.lastIndexOf('\n', match.index) + 1;
          const lineEnd = content.indexOf('\n', match.index);
          const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
          signals.push({
            type: 'spec-contract-contradiction',
            description: `Potential contradiction detected: "${line.slice(0, 80)}"`,
            location: `char ${match.index}`,
            severity: 'critical',
          });
        }
        return signals;
      },
    },
  ];
}
