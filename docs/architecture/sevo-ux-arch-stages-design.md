# SEVO UX Interaction Design & Architecture Design 阶段详设

OpenClaw（sa-01 子Agent）｜2026-05-23

---

## 1. 概述

本文档定义 FR-02d（UX Interaction Design）和 FR-02e（Architecture Design）两个新阶段的技术架构，以及 Spec Review Gate 四维度评审（AC-4.5a/AC-4.5b）和 Review 三方 SA/架构维度（AC-4.24n4/AC-4.24n5）的实现方案。

两个新阶段作为 spec-review-gate 通过后的条件性并行分支，与 contract / test-case-authoring 等并行执行，不互相阻塞。

---

## 2. 模块划分

### 2.1 新增文件

| 文件路径 | 职责 |
|----------|------|
| `src/stages/ux-interaction-design-stage.ts` | FR-02d 阶段执行逻辑 |
| `src/stages/ux-interaction-design-types.ts` | FR-02d 输入/输出类型 |
| `src/stages/architecture-design-stage.ts` | FR-02e 阶段执行逻辑 |
| `src/stages/architecture-design-types.ts` | FR-02e 输入/输出类型 |
| `src/router/design-need-classifier.ts` | 路由判定是否需要 UX/Architecture Design |
| `src/gates/spec-review-dimensions.ts` | Spec Review Gate 四维度评审 |

### 2.2 需修改的现有文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/types/index.ts` | StageId 新增两值、RoutingResult 新增四字段 |
| `src/constants.ts` | STAGE_IDS / ALL_STAGES / PARALLEL_FORK / L0_SKIP_REASONS |
| `src/pipeline/parallel-branch.ts` | 新阶段前置依赖 + contract-review-gate 等待规则 |
| `src/router/router.ts` | route() 集成 classifyDesignNeeds |
| `src/router/stage-graph.ts` | DEFAULT_SDD_EDGES 新增两条边 |
| `src/stages/index.ts` | 导出新阶段 |
| `src/gates/spec-review-gate.ts` | 接入四维度评审 |
| `src/gates/implementation-review-gate.ts` | SA/架构维度核对 |

---

## 3. 数据模型

### 3.1 路由判定（design-need-classifier.ts）

```typescript
export interface DesignNeedInput {
  taskScope: TaskScope;
  specOutput: SpecOutput;
  projectConfig: ProjectConfig;
}

export interface DesignNeedResult {
  needsUxDesign: boolean;
  uxDesignReason: string;
  needsArchDesign: boolean;
  archDesignReason: string;
}

export function classifyDesignNeeds(input: DesignNeedInput): DesignNeedResult;
```

判定规则：
- `needsUxDesign = true`：`projectConfig.hasUI && spec 涉及页面/交互/导航变更`
- `needsArchDesign = true`：`affectedDomains >= 2 || hasDataModelChange || estimatedFiles >= 5`

### 3.2 StageId 与 RoutingResult 扩展（types/index.ts）

```typescript
export type StageId = /* existing */ | 'ux-interaction-design' | 'architecture-design';

export interface RoutingResult {
  /* existing fields */
  needsUxDesign: boolean;
  uxDesignReason: string;
  needsArchDesign: boolean;
  archDesignReason: string;
}
```

### 3.3 UX Interaction Design 类型

```typescript
export interface UxInteractionDesignInput {
  taskId: string;
  pipelineId: string;
  specPackage: SpecOutput;
  projectConfig: ProjectConfig;
  artifactBasePath: string;
}

export interface UxInteractionDesignOutput {
  designDocument: ArtifactRef;       // docs/ux/<task-id>-ux-design.md
  pages: Array<{ pageId: string; title: string; layout: string; components: string[] }>;
  navigationStructure: Array<{ path: string; label: string; children?: any[] }>;
  operationFlows: Array<{ flowId: string; name: string; steps: string[] }>;
  authorRole: 'ux';
  pmReviewStatus: 'pending' | 'approved' | 'rejected';
}
```

### 3.4 Architecture Design 类型

```typescript
export interface ArchitectureDesignInput {
  taskId: string;
  pipelineId: string;
  specPackage: SpecOutput;
  uxDesignDocument?: ArtifactRef;    // 如有 FR-02d 产出，作为参考
  projectConfig: ProjectConfig;
  artifactBasePath: string;
}

export interface ArchitectureDesignOutput {
  designDocument: ArtifactRef;       // docs/architecture/<task-id>-arch-design.md
  apiDefinitions: Array<{
    path: string; method: string; requestSchema: string;
    responseSchema: string; errorCodes: Array<{ code: string; httpStatus: number }>;
  }>;
  dataModels: Array<{ name: string; fields: Array<{ name: string; type: string; required: boolean }> }>;
  moduleInteractions: Array<{ from: string; to: string; protocol: string }>;
  authorRole: 'sa';
}
```

### 3.5 Spec Review Gate 四维度（spec-review-dimensions.ts）

```typescript
export type SpecReviewDimension = 'product' | 'technical' | 'experience' | 'quality';

export interface DimensionReview {
  dimension: SpecReviewDimension;
  conclusion: GateConclusion;
  findings: ReviewFinding[];
}

export interface SpecReviewBundleMultiDim {
  dimensions: DimensionReview[];
  gateConclusion: GateConclusion;
  blockers: ReviewFinding[];
  requiredDimensions: SpecReviewDimension[];  // hasUI=false 时不含 experience
}
```

---

## 4. 状态机与调用关系

### 4.1 Pipeline 状态转换

```
spec-review-gate [passed]
  ├── contract                          (existing)
  ├── test-case-authoring               (existing)
  ├── ux-acceptance-authoring           (existing)
  ├── commercial-acceptance-authoring   (existing)
  ├── ux-interaction-design             (NEW, conditional)
  └── architecture-design               (NEW, conditional)

contract-review-gate 前置依赖:
  contract [passed] + ux-interaction-design [passed/skipped] + architecture-design [passed/skipped]

implement 前置依赖:
  contract-review-gate [passed]  (间接保证 UX/Arch 已完成)
```

### 4.2 parallel-branch.ts 新增规则

```typescript
case 'ux-interaction-design':
case 'architecture-design':
  return inPipeline(STAGE_IDS.SPEC_REVIEW_GATE) ? [STAGE_IDS.SPEC_REVIEW_GATE] : [];

case STAGE_IDS.CONTRACT_REVIEW_GATE: {
  const deps: StageId[] = [];
  if (inPipeline(STAGE_IDS.CONTRACT)) deps.push(STAGE_IDS.CONTRACT);
  if (inPipeline('ux-interaction-design')) deps.push('ux-interaction-design');
  if (inPipeline('architecture-design')) deps.push('architecture-design');
  return deps;
}
```

### 4.3 router.ts 调用链

```
route(task, specOutput?, projectConfig?)
  → classifyLevel(task.scope)
  → classifyDesignNeeds({ taskScope, specOutput, projectConfig })
  → planStages(level, designNeeds)
      needsUxDesign=false → 'ux-interaction-design' 加入 skippedStages
      needsArchDesign=false → 'architecture-design' 加入 skippedStages
  → return RoutingResult (含四个新字段)
```

### 4.4 stage-graph.ts 新增边

```typescript
{ from: 'spec-review-gate', to: 'ux-interaction-design' },
{ from: 'spec-review-gate', to: 'architecture-design' },
```

### 4.5 Review 阶段 SA/架构维度

```typescript
// implementation-review-gate.ts
export interface ImplementationReviewInput {
  /* existing */ archDesignDocument?: ArtifactRef;
}
// evaluate() 逻辑:
// archDesignDocument 存在 → 逐项核对 API 一致性（AC-4.24n4）
// archDesignDocument 不存在 → SA 维度跳过（AC-4.24n5）
```

---

## 5. 集成点（具体到函数名）

| 现有文件 | 函数/类 | 修改方式 |
|----------|---------|----------|
| `types/index.ts` | `StageId` type | 新增两个联合成员 |
| `types/index.ts` | `RoutingResult` interface | 新增四个字段 |
| `constants.ts` | `STAGE_IDS` | 新增 `UX_INTERACTION_DESIGN`, `ARCHITECTURE_DESIGN` |
| `constants.ts` | `ALL_STAGES` | 在 `COMMERCIAL_ACCEPTANCE_AUTHORING` 后插入 |
| `constants.ts` | `PARALLEL_FORK_AFTER_SPEC_REVIEW` | 新增两个阶段 |
| `constants.ts` | `L0_SKIP_REASONS` | 新增两条跳过理由 |
| `router/router.ts` | `route()` | 调用 classifyDesignNeeds，传入 planStages |
| `router/router.ts` | `planStages()` | 接收 designNeeds 参数，条件性 skip |
| `pipeline/parallel-branch.ts` | `getPrerequisites()` | 新增两个 case + 修改 CONTRACT_REVIEW_GATE case |
| `gates/spec-review-gate.ts` | `SpecReviewGate.evaluate()` | 委托给 SpecReviewGateMultiDim |
| `gates/implementation-review-gate.ts` | `ImplementationReviewGate.evaluate()` | 新增 archDesign 核对分支 |
| `stages/index.ts` | barrel exports | 新增四个导出 |

---

## 6. 实现优先级

### P0（流水线能跑通）

1. `types/index.ts` — StageId + RoutingResult 扩展
2. `constants.ts` — 常量更新
3. `router/design-need-classifier.ts` — 判定逻辑
4. `router/router.ts` — 集成 classifyDesignNeeds + planStages 扩展
5. `stages/*-types.ts` — 两个阶段的类型定义
6. `stages/*-stage.ts` — 两个阶段的执行骨架
7. `pipeline/parallel-branch.ts` — 前置依赖规则
8. `stages/index.ts` — 导出

### P1（完善体验）

1. `gates/spec-review-dimensions.ts` — 四维度评审完整实现
2. `gates/spec-review-gate.ts` — 接入多维度
3. `gates/implementation-review-gate.ts` — SA/架构维度核对
4. `router/stage-graph.ts` — DAG 边
5. UX 阶段 PM 评审流程（pmReviewStatus 状态机）
6. adapter 层新增 `generateUxDesign()` / `generateArchDesign()` 方法

---

## 7. 关键设计决策

| 决策 | 理由 |
|------|------|
| 条件性并行分支 | 非所有任务需要设计，通过路由动态加入 requiredStages |
| contract-review-gate 等待设计完成 | 四方会审需核对契约与设计文档一致性（FR-04） |
| implement 不直接依赖设计阶段 | 通过 contract-review-gate 间接保证 |
| 四维度内聚在一个 gate 类 | 避免四个独立 gate 增加编排复杂度 |
| SA 维度无文档时自动跳过 | AC-4.24n5 明确要求 |
| 设计文档通过 ArtifactRef 传递 | 复用现有工件追踪机制 |
