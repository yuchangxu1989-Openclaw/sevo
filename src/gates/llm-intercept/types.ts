export interface InterceptAuditEntry {
  timestamp: string;
  label: string;
  taskTextPreview: string;
  decision: 'intercept' | 'pass' | 'fail-closed';
  source: 'label-bypass' | 'deterministic' | 'llm' | 'fail-closed';
  reasoning: string;
  llmLatencyMs: number;
}

export interface LlmJudgment {
  isDev: boolean;
  reason: string;
}

export interface DecisionResult {
  decision: 'intercept' | 'pass' | 'fail-closed';
  step: InterceptAuditEntry['source'];
  reason: string;
}

export interface SpawnTaskRequest {
  label?: string;
  taskText: string;
}

export interface LlmProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface SevoConfig {
  managedProjects: string[];
  llmProvider: LlmProvider | null;
}
