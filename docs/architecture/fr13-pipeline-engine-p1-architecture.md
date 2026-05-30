# FR-13 PipelineEngine P1 架构详设

OpenClaw（sa-01 子Agent）｜2026-05-23

---

## 1. 总览

P1 在 P0 阶段推进守卫基础上扩展四项能力。所有设计基于现有代码结构扩展，不重写。

| 文件路径 | 类型 | 职责 |
|----------|------|------|
| `src/scan/scan-mapping.ts` | 新增 | FR→文件映射加载/生成/持久化 |
| `src/scan/llm-semantic-verifier.ts` | 新增 | LLM 语义验证层 |
| `src/pipeline/fix-loop.ts` | 新增 | 门禁失败自动修复状态机 |
| `src/pipeline/stage-rollback.ts` | 新增 | 阶段回退逻辑 |
| `src/pipeline/stage-machine.ts` | 修改 | 新增 `fix_pending`、`rolled_back` 状态 |
| `src/pipeline/pipeline-engine.ts` | 修改 | `advance()` 接入 fix-loop；新增 `rollback()` |
| `src/scan/l1-file-scanner.ts` | 修改 | `findFilesForFr()` 接入 scan-mapping |
| `src/adapter/host-adapter.ts` | 修改 | 新增 `dispatchFixTask()` 接口 |
| `scripts/init.sh` | 修改 | 三层降级重构 |

---

## 2. Scan L1 检查逻辑升级

### 2.1 分层架构

- **Layer 1**：结构化映射文件（`sevo.scan.json`），零 LLM 开销，覆盖 90% 场景
- **Layer 2**：LLM 语义验证（`--semantic` 启用），用于高置信度场景

### 2.2 映射文件格式（`sevo.scan.json`）

```json
{
  "version": 1,
  "generatedAt": "2026-05-23T10:00:00Z",
  "generatedBy": "sevo scan --generate-map",
  "frFileMap": {
    "fr-13": { "files": ["src/pipeline/pipeline-engine.ts"], "confidence": 0.95, "rationale": "核心编排" }
  }
}
```

### 2.3 接口定义

```typescript
// scan-mapping.ts
export class ScanMappingLoader {
  load(projectRoot: string, fallbackMap?: Record<string, string[]>): Record<string, string[]>;
  validate(config: unknown): config is ScanMappingConfig;
}

export class ScanMappingGenerator {
  async generate(opts: { specPath: string; codeMap: string; adapter: SevoHostAdapter }): Promise<ScanMappingConfig>;
}

// llm-semantic-verifier.ts
export class LlmSemanticVerifier {
  async verify(opts: {
    frId: string; frDescription: string;
    files: Array<{ path: string; contentHead: string }>;
    adapter: SevoHostAdapter;
  }): Promise<Array<{ frId: string; file: string; implements: boolean; confidence: number }>>;
}
```

### 2.4 生成流程

1. `CodeMapGenerator.generate()` 产出代码结构摘要（已有，~12K tokens）
2. `parseSpecMarkdown()` 提取 FR 列表（已有）
3. LLM prompt：「给定 FR 列表和代码结构，输出 FR→文件映射 JSON」
4. 写入 `sevo.scan.json`

### 2.5 与 `l1-file-scanner.ts` 集成

`findFilesForFr()` 查找优先级变为：
1. `ScanMappingLoader` 读取 `sevo.scan.json`（新增）
2. 传入的 `frFileMap` 参数（现有）
3. 文件名匹配降级（现有，向后兼容）

### 2.6 错误处理

LLM 调用超时/失败 → 降级为 Layer 1 结果，confidence 标记 `unverified`，不阻断扫描。映射文件不存在 → 静默降级到现有逻辑。

---

## 3. AC-13.3 门禁失败自动修复

### 3.1 状态机扩展（`stage-machine.ts`）

```typescript
// 新增状态
'fix_pending': ['active', 'rolled_back'],

// active 出口新增
active: ['passed', 'failed', 'blocked', 'clarification-blocked', 'fix_pending'],

// passed 出口新增（回退场景：目标阶段需从 passed 重激活）
passed: ['active'],
```

> 回退重激活约束：`passed → active` 仅由 `StageRollback.execute()` 触发，普通流程不可调用。代码层通过 `{ reason: 'rollback' }` 参数守卫。

`StageStatus` 类型新增：`'fix_pending' | 'rolled_back'`

### 3.2 `fix-loop.ts` 核心接口

```typescript
export interface FixLoopConfig { maxRetries: number; fixTimeoutMs: number; }

export interface FixLoopState {
  stageId: StageId; pipelineId: string;
  gateFailureReason: string; artifactPaths: string[];
  attempts: Array<{ attempt: number; triggeredAt: string; taskId: string | null; outcome: string }>;
}

export class FixLoopManager {
  initiate(ctx: { pipelineId: string; stageId: StageId; gateVerdict: GateVerdict; artifacts: ArtifactRef[] }): FixLoopState;
  async onFixComplete(state: FixLoopState, fixResult: { artifacts: ArtifactRef[] }, gateEngine: GateEngine): Promise<'advance' | 'retry' | 'rollback'>;
  buildFixPrompt(state: FixLoopState): string;
}
```

### 3.3 数据流

```
gate failed → stage.status = fix_pending → fixLoop.initiate()
  → adapter.dispatchFixTask(prompt 含失败原因+工件路径)
  → subagent_ended → fixLoop.onFixComplete()
    → gateEngine.evaluate()
      → passed: stage → active → advance()
      → failed & attempt < max: 再次 dispatchFixTask
      → failed & attempt >= max: 触发 rollback
```

### 3.4 集成点

- `pipeline-engine.ts` 的 `handleFailedStage()`：gate 阶段失败时转入 fix_pending 而非直接 failed
- `advance-on-complete.ts`：监听修复任务的 `subagent_ended`，调用 `onFixComplete()`
- `host-adapter.ts` 新增：`dispatchFixTask?(pipelineId, stageId, prompt): Promise<string | null>`

### 3.5 事件记录

每次修复尝试写入 `events.jsonl`，eventType: `'fix_attempt'`，含 attempt 序号、失败原因、taskId、outcome。

---

## 4. AC-13.4 阶段回退机制

### 4.1 `stage-rollback.ts` 接口

```typescript
export interface RollbackConfig { maxRollbacks: number; } // 默认 2

export class StageRollback {
  /** 回退目标：阶段配置 rollbackTarget > requiredStages 前一阶段 > null(第一阶段) */
  resolveTarget(state: PipelineState, failedStage: StageId): StageId | null;
  /** 执行：failedStage→rolled_back, target→active, 写事件, 触发重新执行 */
  execute(ctx: { engine: PipelineEngine; pipelineId: string; failedStage: StageId; target: StageId; reason: string }): RollbackDecision;
  /** pipeline 级回退次数是否超限 */
  isExhausted(pipelineId: string, config: RollbackConfig): boolean;
}
```

### 4.2 状态转换

```
fix_pending ─[attempt >= maxRetries]─► rolled_back（终态）
                                            │
                                            ▼
                                   target stage → active（重新执行）

rollbackCount >= maxRollbacks → pipeline.status = 'blocked'（等待人工介入）
```

### 4.3 与 `pipeline-engine.ts` 集成

新增 `rollback()` 方法：
1. 检查 `isExhausted()` → 超限则 `markBlocked()`
2. `resolveTarget()` → null 则 `markBlocked()`（第一阶段无法回退）
3. `stageRollback.execute()` → 写事件 + 重置目标阶段 + `adapter.triggerStage()`

触发点：`fix-loop.ts` 的 `onFixComplete()` 返回 `'rollback'` 时调用。

### 4.4 数据模型扩展

```typescript
// StageRecord 新增
rollbackTarget?: StageId;   // 可选回退目标配置
fixAttempts?: number;       // 修复尝试计数

// PipelineState 新增
rollbackCount?: number;     // 已回退次数
status?: 'active' | 'blocked';  // pipeline 级状态
```

---

## 5. Postinstall 三层降级

### 5.1 判断逻辑

```bash
detect_environment() {
  HAS_CONFIG=false; HAS_CLI=false
  [ -f "$CONFIG_PATH" ] && HAS_CONFIG=true
  command -v openclaw >/dev/null 2>&1 && HAS_CLI=true
}
```

### 5.2 行为矩阵

| 层级 | 条件 | 行为 | 退出码 |
|------|------|------|--------|
| 完全无环境 | 无配置文件 | 输出提示 + exit 0 | 0 |
| 部分环境 | 有配置但缺 CLI | warn + 跳过 hook 校验/doctor + exit 0 | 0 |
| 完整环境 | 配置 + CLI | 执行完整注册流程 | 0 |

### 5.3 关键改动

```bash
# 第 55 行：die → warn + PARTIAL_ENV
if ! command -v openclaw >/dev/null 2>&1; then
  warn "openclaw CLI not found — partial mode"
  PARTIAL_ENV=true
fi
```

受 `PARTIAL_ENV` 保护（跳过）：hook 正则校验、`openclaw doctor`、依赖 CLI 的 config 操作。
始终执行：node 检查、版本输出、备份逻辑。
不可恢复错误仍 die：node 不存在、文件系统写入失败。

---

## 6. 依赖与实现顺序

```
postinstall（独立）→ scan-mapping（依赖 code-map-generator）→ fix-loop（依赖 gate-engine）→ stage-rollback（依赖 fix-loop）
```

每个模块可独立单元测试，集成点通过接口解耦。
