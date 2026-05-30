# FR-13 PipelineEngine P0 架构详设：阶段推进守卫

OpenClaw（sa-01 子Agent）｜2026-05-23

---

## 1. 模块划分

### 新增文件

| 文件路径 | 职责 |
|----------|------|
| `src/pipeline/stage-gate-guard.ts` | 拦截守卫：校验 task:spawn 目标阶段是否为 active |
| `src/pipeline/advance-on-complete.ts` | 闭环推进：subagent_ended → advance → triggerStage |
| `src/pipeline/advance-decision-log.ts` | 推进决策结构化记录（AC-13.5） |
| `src/knowledge/default-stage-standards.json` | 阶段质量标准配置文件（AC-6.6.3） |
| `src/knowledge/stage-standards-loader.ts` | 标准加载器：默认 + 用户覆盖合并 + schema 校验 |

### 需修改的现有文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/plugin-adapter/plugin-adapter.ts` | `handleTaskSpawn()` 增加 Stage Gate Guard；`handleSubagentEnded()` 接入 advance-on-complete |
| `src/adapter/host-adapter.ts` | `SevoHostAdapter` 新增 `triggerStage(pipelineId, stageId)` |
| `src/pipeline/pipeline-engine.ts` | `advance()` 返回值增加 `nextTriggered`；新增 `getStageStatus()` |
| `src/types/index.ts` | `PipelineEvent.eventType` 新增 `'advance_decision'` |
| `src/gates/spec-review-gate.ts` | 新增四章节结构化检查 |

---

## 2. Stage Gate Guard 设计

### 触发点

`task:spawn` hook。执行顺序：LLM 拦截 → Stage Gate Guard。

### 判定逻辑

```typescript
export function evaluateStageGate(
  tag: SevoTag | null,
  getPipelineState: (id: string) => PipelineState | null,
): StageGateResult {
  if (!tag) return { allowed: true };
  const state = getPipelineState(tag.pipelineId);
  if (!state) return { allowed: true };
  const record = state.stages[tag.stageId];
  if (!record) return { allowed: false, reason: `stage '${tag.stageId}' not in pipeline` };
  if (record.status === 'active') return { allowed: true };
  return { allowed: false, reason: `Stage '${tag.stageId}' is '${record.status}', not active.` };
}
```

DAG 合法后继由 `parallel-branch.ts` 的 `arePrerequisitesMet()` 保证。Guard 只需检查 `status === 'active'`。

输出：放行 `{ proceed: true }` / 阻断 `{ proceed: false, advisory: reason }`。Guard 是纯读操作，阻断事件追加到 `events.jsonl`。

---

## 3. Advance-on-Complete 设计

### 触发点

`subagent_ended` hook → 抽取为独立模块，补全 advance → triggerStage 闭环。

### 阶段完成判定（含 Gate 路径）

判定策略按优先级：

1. **Gate 阶段**（stageId 含 `-gate` 后缀）：调用 GateEngine 获取结构化 verdict，不走文本匹配。
2. **SevoTag 元数据**：completion 携带 `sevoOutcome` 字段时直接采信。
3. **文本匹配 fallback**：检查 `[SEVO:FAILED]` 标记（降级方案）。

```typescript
export async function resolveOutcome(
  stageId: StageId,
  payload: { output: string; sevoOutcome?: 'passed'|'failed'; artifacts: ArtifactRef[] },
  gateEngine: GateEngine,
  pipelineId: string,
): Promise<'passed' | 'failed'> {
  if (stageId.endsWith('-gate')) {
    const verdict = await gateEngine.evaluate(pipelineId, stageId, payload.artifacts);
    return verdict.conclusion;
  }
  if (payload.sevoOutcome) return payload.sevoOutcome;
  if (payload.output.includes('[SEVO:FAILED]')) return 'failed';
  return 'passed';
}
```

### Gate 阶段数据流

```
subagent_ended → advanceOnComplete 识别 gate 类型
  → gateEngine.evaluate(pipelineId, stageId, artifacts)
  → GateConclusion { conclusion: 'passed'|'failed', reasons: string[], checklist: CheckItem[] }
  → passed → advance / failed → block
  → 决策写入 events.jsonl（含完整 gateVerdict）
```

P0 所有 gate 评估均为纯规则（无 LLM）：spec-review-gate 做四章节结构检查，contract-review-gate 做四方维度完整性检查。

### 推进逻辑（含 30s SLA 保障）

```typescript
export async function advanceOnComplete(
  signal: { pipelineId: string; stageId: StageId; outcome: 'passed'|'failed'; artifacts: ArtifactRef[] },
  engine: PipelineEngine, adapter: SevoHostAdapter,
  gateEngine: GateEngine, logDecision: (d: AdvanceDecision) => void,
): Promise<void> {
  const startMs = Date.now();

  // 1. 解析 outcome（gate 走 GateEngine，超时 10s 降级采信原始 outcome）
  const outcome = await withTimeout(
    resolveOutcome(signal.stageId, signal, gateEngine, signal.pipelineId),
    10_000, signal.outcome);

  // 2. advance 更新状态（纯磁盘，<10ms）
  const transition = engine.advance(signal.pipelineId, { ...signal, outcome });

  // 3. 记录推进决策
  logDecision({ timestamp: new Date().toISOString(), pipelineId: signal.pipelineId,
    fromStage: signal.stageId, toStage: transition.toStage,
    verdict: outcome === 'passed' ? 'advance' : 'block',
    reason: `${signal.stageId} ${outcome}`, durationMs: Date.now() - startMs });

  // 4. 并行触发新激活阶段（单个超时 15s，互不阻塞）
  if (outcome === 'passed') {
    const active = engine.load(signal.pipelineId).requiredStages
      .filter(s => engine.load(signal.pipelineId).stages[s].status === 'active' && s !== signal.stageId);
    await Promise.allSettled(active.map(s => withTimeout(adapter.triggerStage(signal.pipelineId, s), 15_000, undefined)));
  }

  if (Date.now() - startMs > 30_000)
    logger.warn(`advanceOnComplete exceeded 30s SLA: ${Date.now()-startMs}ms`);
}
```

### 30s SLA 保障机制（AC-13.2）

| 环节 | 时间预算 | 超时降级 |
|------|----------|----------|
| Gate 评估 | ≤10s | 采信原始 outcome |
| State advance + 日志 | <100ms | — |
| triggerStage 派发 | ≤15s/阶段 | `Promise.allSettled`，失败记 `trigger_failed` 事件，支持重试 |
| **总计** | **≤25s + 5s buffer** | 超 30s 写 warning，不硬阻断 |

P0 所有 gate 为纯规则（<100ms），30s SLA 天然满足。预留超时机制为未来 LLM gate 做准备。

### 并行阶段 Join

由 `parallel-branch.ts` 的 `getActivatableStages()` 实现。`advanceOnComplete` 调用 `advance()` 后并行 `triggerStage()` 所有新激活阶段。

---

## 4. 与 OpenClaw Adapter 的集成

### 4.1 SevoHostAdapter 接口扩展

```typescript
triggerStage(pipelineId: string, stageId: StageId): Promise<void>;
```

实现：`ProjectConfig.stageAgents[stageId]` → 确定 Agent → 构造 task prompt（含 SevoTag + 质量标准）→ `spawnTask()`。

### 4.2 `sevo init` 自动注册（热加载，无需重启）

```
sevo init → 创建 sevo.json + 写入 openclaw.json plugins
  → POST http://127.0.0.1:3000/api/plugins/reload（热加载）
  → Gateway 加载插件 → hook 即时生效
```

热加载实现：`sevo init` 写入配置后调用 Gateway 管理端点 `POST /api/plugins/reload`（仅 localhost 可访问）。

降级路径：
- Gateway 支持热加载（返回 200）→ 插件即时生效，用户无感
- Gateway 不支持（返回 404）→ CLI 输出 `⚠ Please restart Gateway: openclaw gateway restart`
- Gateway 未运行 → CLI 输出 `Plugin will activate on next Gateway start.`

用户始终有明确的下一步指引，不会卡住。

### 4.3 CLI-only 降级

无宿主时 Guard 不生效，手动 `sevo advance` 推进，决策日志仍写入。

### 4.4 阶段质量标准注入（spec §6.6，配置文件方案）

**存储**：`src/knowledge/default-stage-standards.json`，随 npm 包发布。格式：

```json
{
  "spec": { "principles": ["spec 必须包含四个独立章节...", "用户价值优先...", "概念-技术阶段隔离...", "主动澄清..."] },
  "ux-interaction-design": { "principles": ["以陌生小白用户为设计基准", "操作流不依赖命令行", "全程可视化引导"] },
  "contract": { "principles": ["开箱即用（零手动配置）", "通用化+最简可行架构", "主动澄清技术模糊"] },
  "implement": { "principles": ["最小改动（Surgical Changes）", "最简实现（Simplicity First）", "目标驱动", "主动澄清"] },
  "review": { "principles": ["独立性（只检查不开发）", "可验证结论（附证据）", "不放过设计方向问题"] },
  "regression": { "principles": ["独立性（只验证不修复）", "逐条对照 AC", "结论附运行日志"] },
  "contract-review-gate": { "principles": ["四方维度：产品/开发/质量/体验", "任一维度 P0 未解决则打回", "结论结构化"] },
  "spec-review-gate": { "principles": ["四章节完整性检查", "缺任一章节即打回"] }
}
```

**加载与覆盖**（AC-6.6.3：不改代码即可扩展）：

```typescript
export function loadStageStandards(projectRoot?: string): StageStandards {
  const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'default-stage-standards.json'), 'utf-8'));
  const userPath = path.join(projectRoot ?? process.cwd(), 'sevo-standards.json');
  if (fs.existsSync(userPath)) {
    return { ...defaults, ...JSON.parse(fs.readFileSync(userPath, 'utf-8')) };
  }
  return defaults;
}
```

用户扩展：项目根目录创建 `sevo-standards.json`，同格式，覆盖同名阶段或新增阶段，无需改代码。

**降级**（AC-6.6.4）：加载失败时 log warning 并继续派发（不注入标准），不阻断流程。

**注入时机**：`triggerStage()` 构造 prompt 时调用 `loadStageStandards()` 拼接对应阶段原则。

### spec-review-gate 四章节检查

```typescript
const REQUIRED_SPEC_SECTIONS = [
  { id: 'user-personas', patterns: [/用户人群|目标用户|user persona/i] },
  { id: 'pain-points', patterns: [/痛点|pain point|问题场景/i] },
  { id: 'raw-requirements', patterns: [/原始需求|用户需求|raw requirement/i] },
  { id: 'ux-flow', patterns: [/用户体验流|操作流程|user flow/i] },
];
export function checkRequiredSections(specContent: string): { passed: boolean; missing: string[] } {
  const missing = REQUIRED_SPEC_SECTIONS.filter(s => !s.patterns.some(p => p.test(specContent))).map(s => s.id);
  return { passed: missing.length === 0, missing };
}
```

---

## 5. 数据模型

### 5.1 Pipeline 状态（已有，无需修改）

路径：`<basePath>/pipelines/<pipelineId>/state.json`，schema 为 `PipelineState`。

### 5.2 推进决策事件（新增）

```typescript
export interface AdvanceDecision {
  timestamp: string; pipelineId: string;
  fromStage: StageId; toStage: StageId;
  verdict: 'advance' | 'block' | 'retry';
  reason: string; gateVerdict?: GateConclusion;
  blockedRequestLabel?: string; durationMs?: number;
}
```

写入 `events.jsonl`，eventType 为 `'advance_decision'`。

---

## 6. 实现优先级

| 序号 | 模块 | 验证方式 |
|------|------|----------|
| 1 | `advance-decision-log.ts` | 单元测试：写入/读取 |
| 2 | `stage-gate-guard.ts` | 单元测试：active 放行、pending 阻断 |
| 3 | `host-adapter.ts` 扩展 | 类型检查 |
| 4 | `default-stage-standards.json` + loader | 单元测试：加载/合并/降级 |
| 5 | `advance-on-complete.ts`（含 Gate + SLA） | 集成测试：gate verdict → advance/block |
| 6 | `plugin-adapter.ts` 集成 | 端到端测试 |

端到端验证场景：
```
sevo fr add test "实现登录"
→ pipeline 创建，spec active
→ spawn implement → Guard 阻断
→ spec 完成 → spec-review-gate（四章节检查 passed）→ contract 激活
→ ... → implement 激活 → spawn implement → 放行（prompt 含 implement 原则）
```
