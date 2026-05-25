# SEVO - arc42 架构文档

OpenClaw(sa-01 子Agent)| 2026-04-19

---

## 目录

1. 引言与目标
2. 架构约束
3. 上下文与范围
4. 解决方案策略
5. 构建块视图
6. 运行时视图
7. 部署视图
8. 横切关注点
9. 架构决策
10. 质量要求
11. 风险与技术债务
12. 术语表

---

## 1. 引言与目标

### 1.1 需求概览

SEVO(Spec-Execute-Verify-Operate)是面向 vibe coding 用户的 Agent 研发流水线。它把需求定义、方案约束、实现执行、独立审计、回归验证、部署发布、清洁环境验收和交付留痕收拢到同一条可追溯流水线上。

核心能力:8 个阶段(Spec → Contract → Implement → Review → Regression → Deploy → Verify → Ledger)+ 2 个门禁(Spec Review Gate、Contract Review Gate)+ 1 个并行活动(Test Case Authoring)。

详细需求规格:`docs/product-requirements.md`(11 个 FR,5 类 NFR)。

### 1.2 质量目标

| 优先级 | 质量目标 | 场景描述 |
|--------|---------|---------|
| 1 | 可追溯性 | 任一交付都能从 Ledger 反向追溯到 Spec、Contract、Review、Regression 全链路工件 |
| 2 | 可靠性 | 阶段失败后支持修复续跑,长流程状态持久化,主会话中断不丢失进度 |
| 3 | 可扩展性 | 阶段定义、工件定义、门禁逻辑与具体运行时解耦,支持多宿主接入 |
| 4 | 安全性 | 审计与开发职责分离,高风险改动多阶段加厚检查 |

### 1.3 干系人

| 角色 | 关注点 | 期望 |
|------|--------|------|
| Solo Founder | 交付速度与返工成本 | 每轮改动有清晰目标、边界、验收标准和交付证据 |
| Agent 原生开发者 | 流程约束 Agent 行为 | Spec-Contract-Implement-Review 串联,杜绝假完成 |
| 质量与架构把关者 | 独立审计视角 | 统一工件链路,快速判断通过/阻断/缺失 |
| 宿主平台方 | 接入成本 | 通用流水线语义,核心逻辑与运行时解耦 |

---

## 2. 架构约束

### 2.1 技术约束

| 约束 | 说明 |
|------|------|
| 宿主无关 | SEVO 定义阶段语义和工件语言,不预设某个唯一宿主环境 |
| 文件系统可用 | 宿主至少提供文件读写、任务派发和结果回收能力 |
| 工件驱动 | 完成判定依赖文件或结构化工件,不依赖聊天回复 |
| 状态持久化 | 长流程状态必须落盘,不依赖主会话内存 |

### 2.2 组织约束

| 约束 | 说明 |
|------|------|
| Solo Founder + AI Agents | 无人类开发团队,所有阶段由 Agent 执行 |
| 审查-实现分离 | Review/Verify 阶段的执行者不能与 Implement 阶段相同 |
| 渐进交付 | Wave 1 先跑通最小闭环,Wave 2/3 增量增强 |

### 2.3 惯例

| 惯例 | 说明 |
|------|------|
| 工件命名 | 每类工件有标准名称和最小字段集 |
| 阶段状态机 | 统一 7 态:pending / active / blocked / clarification-blocked / passed / failed / skipped |
| 门禁三档 | 通过 / 有条件通过 / 不通过 |

---

## 3. 上下文与范围

### 3.1 业务上下文

SEVO 处于 Self-Evolving Harness 生态的研发流程层,与三个兄弟模块协作:

| 参与者 | 输入给 SEVO | SEVO 输出 |
|--------|------------|-----------|
| 用户(Solo Founder) | 研发任务、目标、约束、验收裁定 | 路由结果、阶段进展、交付账本 |
| KIVO(知识治理) | 历史规格、方法论、规则、经验线索 | 经验沉淀(通过 Ledger 回流) |
| AEO(效果运营) | - | 阶段耗时、失败分布、Agent 表现数据(通过 Ledger 提供) |
| Claw Design(设计产物) | - | 作为被研发产品时的流水线服务 |
| 宿主环境 | Agent 运行时、工具接入、消息调度、执行沙箱 | 阶段指令、工件读写请求 |

边界原则:
- KIVO 管"知道什么",SEVO 管"如何把一次研发任务做完"。
- AEO 管"做得怎么样",SEVO 管"按什么流程做完"。
- 宿主提供执行能力,SEVO 定义流程语义。

### 3.2 技术上下文

| 接口 | 协议 | 数据格式 | 说明 |
|------|------|---------|------|
| Pipeline API | 函数调用 / CLI | JSON 工件 | 创建任务、推进阶段、查询状态 |
| Artifact Store | 文件系统 | Markdown + JSON | 工件读写,宿主提供存储适配 |
| Agent Dispatch | 宿主调度协议 | 宿主定义 | 按流程阶段派发执行者 |
| Ledger Query | 文件系统 / API | JSON | 账本查询、复盘、经验回流 |

Wave 1 技术上下文以文件系统 + 函数调用为主,Wave 2+ 可扩展为独立服务接口。

#### 3.2.1 Web 层业务上下文扩展

用户侧 Web 层是 SEVO 引擎的观察面和操作面。它不改写流水线语义,负责把引擎层的 Pipeline Instance、Stage Record、Gate Verdict、Clarification Record、ArtifactRef 和 Ledger Entry 组织成管理者可直接使用的页面与交互。

| 参与者 | 与 Web 层的关系 | Web 层输入 | Web 层输出 |
|--------|----------------|-----------|-----------|
| 项目管理者 | 首页、FR 详情、待办、审批、澄清回复的直接使用者 | 筛选条件、审批动作、澄清回复、暂停/恢复/取消指令 | 项目健康度、FR 阶段进度、待办队列、质量摘要、工件索引 |
| SEVO Engine | Web 层唯一业务真相源 | Pipeline Instance、Stage Record、Gate Verdict、Clarification Record、ArtifactRef、Ledger Entry | 供 Web 层消费的查询结果和命令执行结果 |
| 通知适配器(IM) | 异常和待办的外部触达通道 | 告警事件、待办事件、深链参数 | 飞书等 IM 消息和跳转链接 |
| 工件预览器 | Markdown/报告在线查看能力 | ArtifactRef、文档内容 | HTML 预览、下载链接 |

Web 层边界:
- UFR-01/UFR-01a/UFR-13 消费项目、FR、阶段聚合视图,不直接暴露底层 JSON 结构。
- UFR-03/UFR-04/UFR-08 通过命令接口驱动引擎状态变化,但命令是否生效仍由引擎层状态机和门禁决定。
- UFR-05/UFR-06/UFR-07 消费质量、工件、通知只读投影,不在 Web 层自行生成结论。

Web 层发布边界（ADR-014）：
- Web 驾驶舱以独立 npm 包 `sevo-web` 发版，**不随 `sevo-pipeline` 主包打包**。`sevo-pipeline@1.13.0+` 的 npm tarball 不包含 `web/` 子目录。
- `sevo-web` 通过 `package.json.peerDependencies` 声明 `sevo-pipeline >=1.13.0 <2.0.0` 的兼容范围，启动时校验引擎契约版本；不匹配时拒绝启动。
- `sevo-web` 读取引擎层产出的 `pipelines/<id>/state.json`、`pipelines/<id>/events.jsonl`、`projects/<slug>/.sevo/ledger.json` 作为唯一真相源，禁止 mock / seed 占位数据进入 production build（受 FR-36 校验）。
- 主包与 Web 包发版节奏解耦：引擎变更不要求 Web 随之重发，Web 视觉/交互变更不要求主包 bump。

#### 3.2.2 Web 层技术上下文扩展

```text
Browser SPA
  ├─ Query: HTTPS JSON
  ├─ Command: HTTPS JSON
  └─ Event Stream: SSE(默认) / Polling(降级)
        │
        ▼
Web API / BFF
  ├─ Query Adapter → 读取 Pipeline / Ledger / Gate / Clarification 投影
  ├─ Command Adapter → pause/resume/cancel、gate decision、clarification reply
  ├─ Projection Assembler → 组装项目总览、FR 详情、待办、质量摘要
  └─ AuthZ Guard → 会话鉴权、项目级权限、命令审计
        │
        ▼
SEVO Engine + Artifact Store
```

| Web 接口 | 协议 | 输入/输出 | 说明 |
|----------|------|-----------|------|
| Query API | HTTPS + JSON | 筛选参数 → View Model | 服务 UFR-01/UFR-01a/UFR-02/UFR-05/UFR-06/UFR-13 |
| Command API | HTTPS + JSON | 用户动作 → Command Result | 服务 UFR-03/UFR-04/UFR-08 |
| Event Stream API | SSE | 事件流(JSON) | 服务 UFR-01/UFR-03/UFR-07 的实时更新 |
| Preview API | HTTPS + HTML/JSON | ArtifactRef → 预览内容 | 服务 UFR-04/UFR-06 的在线查看 |

技术边界:
- Web 层以 BFF 方式聚合多个引擎对象,前端不直接读取 pipelines 目录。
- 核心 API 契约基于资源和命令语义定义,不绑定具体前端框架。
- 实时更新采用单向事件推送优先,命令确认仍走同步 HTTP 返回。

---

## 4. 解决方案策略

| 质量目标 | 策略 | 详见 |
|---------|------|------|
| 可追溯性 | 工件驱动 + Ledger 汇总:每个阶段产出标准工件,Ledger 串联全链路 | §5 Ledger Engine |
| 可靠性 | 状态机 + 持久化:7 态状态机管理阶段生命周期,状态落盘到 JSON | §5 Pipeline Engine |
| 可扩展性 | 核心-适配分层:Pipeline Core 定义语义,Adapter Layer 对接宿主 | §5 Level 1 |
| 安全性 | 阶段分离 + 门禁:Gate 模块强制评审,执行-审查阶段分离禁止自审 | §5 Gate Engine |

关键技术决策:

- **阶段编排采用状态机而非硬编码流程**:支持跳过、修复续跑、并行分支。
- **工件存储采用文件系统 + JSON Schema**:Wave 1 零外部依赖,宿主只需提供文件读写。
- **门禁采用声明式规则引擎**:门禁条件可配置,不硬编码到流程代码中。
- **测试用例作为独立工件并行产出**:Spec Review Gate 通过后,Test Case Authoring 与 Contract 并行启动,互不阻塞。

---

## 5. 构建块视图

### 5.1 Level 1:系统整体

SEVO 分为 4 个顶层模块:

| 构建块 | 职责 | 暴露接口 |
|--------|------|---------|
| **Router** | 接收任务,判定级别(L0/L1/L2+),输出必经阶段清单和跳过理由 | `route(task) → RoutingResult` |
| **Pipeline Engine** | 管理 Pipeline Instance 生命周期和阶段状态机,驱动阶段流转,处理并行分支(如 Test Case Authoring ∥ Contract)和跨阶段澄清子流程 | `create(task, projectSlug) → PipelineInstance` / `advance(pipelineId, stageResult) → StageTransition` |
| **Gate Engine** | 执行门禁检查,管理评审维度分配,汇总多方评审结论 | `evaluate(gateId, reviewBundles) → GateVerdict` |
| **Ledger Engine** | 汇总全链路工件,生成交付账本条目,支持追溯查询 | `record(pipelineId) → LedgerEntry` / `query(filter) → LedgerEntry[]` |

模块间协作:用户提交任务后,Pipeline Engine 的 Instance Manager 先创建 Pipeline Instance(校验 Project、生成 ID、初始化目录),再调用 Router 完成路由判定;Router 产出路由结果写入 Instance 记录后,Pipeline Engine 驱动阶段流转;Pipeline Engine 在门禁阶段调用 Gate Engine,在 Spec / Contract / Implement 阶段内部通过 Clarification Coordinator 管理模糊检测、问题路由和工件回写;当 Gate Engine 输出 conditional/rejected 时,Review Fix Loop 自动介入,驱动问题提取→修复任务生成→定向复验→门禁重评估的自动闭环;流水线完成时 Pipeline Engine 调用 Ledger Engine 生成账本,并把 Clarification Record 和 Fix Loop 记录一并纳入证据链。

### 5.1.1 核心接口契约

```typescript
// --- Router ---
interface RoutingResult {
  taskId: string;
  level: 'L0' | 'L1' | 'L2+';
  requiredStages: StageId[];       // 必经阶段
  skippedStages: { stage: StageId; reason: string }[];
  acceptanceFocus: string;         // 当前轮次的验收重点
  trackedArtifacts: ArtifactRef[]; // 需要追踪的核心工件
}
declare function route(task: PipelineTask): RoutingResult;

// --- Pipeline Engine ---
interface PipelineInstance {
  instanceId: string;            // 如 "pi-sevo-20260420-001"
  projectSlug: string;
  status: 'created' | 'active' | 'paused' | 'completed' | 'failed';
  routingResult: RoutingResult;
  currentStage: StageId;
  stages: StageRecord[];
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

interface StageTransition {
  pipelineId: string;
  fromStage: StageId;
  toStage: StageId;
  status: 'pending' | 'active' | 'blocked' | 'clarification-blocked' | 'passed' | 'failed' | 'skipped';
  artifacts: ArtifactRef[];        // 本阶段产出的工件引用
}
declare function create(task: PipelineTask, projectSlug: string): PipelineInstance;
declare function advance(pipelineId: string, stageResult: StageResult): StageTransition;

// --- Gate Engine ---
interface GateVerdict {
  gateId: string;
  conclusion: 'passed' | 'conditional' | 'rejected';
  blockers: { item: string; owner: string }[];  // 阻断项清单
  reviewBundles: ReviewBundle[];                 // 各方评审结果
}
declare function evaluate(gateId: string, reviewBundles: ReviewBundle[]): GateVerdict;

// --- Ledger Engine ---
interface LedgerEntry {
  pipelineId: string;
  version: string;
  createdAt: string;               // ISO 8601
  scope: string;
  stages: StageRecord[];           // 全阶段记录引用
  conclusion: 'delivered' | 'aborted';
  evidence: ArtifactRef[];         // 关键工件引用
}
declare function record(pipelineId: string): LedgerEntry;
declare function query(filter: LedgerFilter): LedgerEntry[];
```

以上为 Wave 1 基线接口,实现时可根据实际运行时语言调整。完整 schema 定义见 §5.3。

性能基线(Wave 1):
- 路由判定:≤ 3 秒(NFR-5.1)
- 单个工件查询:≤ 1 秒(NFR-5.3)
- 各阶段默认超时:Spec 30min、Contract 60min、Implement 60min/Task、Review 30min、Regression 30min、Deploy 15min、Verify 30min

### 5.1.2 FR-06 双方放行归属

FR-06 Review 的双方放行机制(质量维度 + 产品维度均通过才放行)归属 Gate Engine。理由:双方放行本质是"门禁判定"职责--汇总多方评审结论并输出最终裁决,这正是 Gate Engine 的 Verdict Aggregator 子模块的核心职责。Pipeline Orchestrator 仅负责在 Review 阶段完成后触发 Gate Engine 评估,不参与放行判定。

### 5.2 Level 2:子模块分解

#### 5.2.1 Router

| 子模块 | 职责 |
|--------|------|
| Rule Matcher | 匹配触发条件(新建模块、跨域变更、500+ 行等 7 条规则) |
| Level Classifier | 根据匹配结果判定 L0/L1/L2+ |
| Stage Planner | 根据级别输出必经阶段、可跳过阶段及跳过理由 |

#### 5.2.2 Pipeline Engine

| 子模块 | 职责 |
|--------|------|
| Stage State Machine | 管理单个阶段的 7 态生命周期(pending → active → passed/failed/blocked/clarification-blocked/skipped) |
| Pipeline Orchestrator | 编排多阶段顺序和并行关系,处理 Test Case Authoring ∥ Contract 并行分支 |
| Clarification Coordinator | 在 Spec / Contract / Implement 阶段执行模糊检测、生成澄清问题、标注阻断级别、驱动回复后的工件回写与知识沉淀 |
| Artifact Registry | 注册和校验每个阶段的输入/输出工件,确保工件链完整 |
| Instance Manager | 创建 Pipeline Instance,管理 5 态生命周期(created → active → paused/completed/failed),生成 instance-id(`pi-<project-slug>-<yyyyMMdd>-<seq>`),强制同一 Project 同一时刻只允许一个 active Instance |
| Project Manager | 管理 Project 标准目录结构(§3.6 六分区),创建时初始化或补全缺失目录,校验 project-slug 合法性 |
| Persistence Store | 将流水线状态、阶段记录、工件引用持久化到文件系统 |

并行分支处理:Pipeline Orchestrator 在 Spec Review Gate 通过后同时激活 Contract(FR-03)和 Test Case Authoring(FR-02a)两个阶段,各自独立推进。Contract Review Gate(FR-04)仅依赖 Contract 完成,不等待 Test Case Authoring。Test Case Document 必须在 Implement 阶段激活前可用;若尚未就绪,Implement 保持 blocked 直到 Test Case Document 到位。Test Case 工件在 Implement 阶段供执行者自测参考,在 Review 和 Regression 阶段供审查和回归引用。

澄清子流程处理:Clarification Coordinator 是跨阶段通用组件,在 Spec、Contract、Implement 三个阶段的入口和关键提交点执行模糊检测。发现 blocking 类澄清时,Stage State Machine 将当前阶段从 active 置为 clarification-blocked,并创建 Clarification Record;发现 non-blocking 类澄清时,阶段保持 active,但必须显式记录默认假设和待确认问题。收到回复后,Clarification Coordinator 负责把收敛结论回写到 Spec Package、Contract Package、Task 描述或 ADR,并将 Clarification Record 从 open 推进到 resolved / settled;如原阶段被阻断,则状态从 clarification-blocked 恢复到 active。`blocked` 保留给非澄清类阻断,例如等待 Test Case Document、外部依赖或人工干预。

##### Clarification Coordinator 接口契约

```typescript
interface ClarificationCoordinator {
  // 模糊检测:扫描当前阶段记录和工件,返回发现的模糊信号
  scan(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[];

  // 开单:将模糊发现转为正式澄清记录
  open(findings: ClarificationFinding[]): ClarificationRecord[];

  // 派发:将澄清问题路由到目标回复对象
  dispatch(record: ClarificationRecord): ClarificationHandle;

  // 收敛:接收回复并更新记录状态为 resolved
  resolve(clarificationId: string, response: ClarificationResponse): ClarificationRecord;

  // 回写:将收敛结论写入目标工件,记录状态为 settled
  applyResolution(clarificationId: string): ArtifactRef[];

  // 恢复:所有 blocking 澄清已 settled 后,触发阶段从 blocked 恢复为 active
  resumeStage(stageId: StageId, clarificationId: string): ClarificationStageTransition;
}

interface ClarificationFinding {
  type: ClarificationType;
  blockingLevel: ClarificationBlockingLevel;
  targetType: 'user' | 'upstream-stage' | 'reviewer' | 'internal-owner';
  targetId?: string;
  question: string;
  suggestedOptions?: string[];
  sourceArtifacts: ArtifactRef[];
  impactScope: string[];
}

interface ClarificationHandle {
  clarificationId: string;
  targetType: string;
  targetId?: string;
  dispatchedAt: string;
  timeoutMs?: number;           // 超时未回复时触发降级策略
}

interface ClarificationResponse {
  clarificationId: string;
  responderId: string;
  content: string;
  receivedAt: string;
}

interface ClarificationStageTransition {
  stageId: StageId;
  from: StageRecord['status'];
  to: StageRecord['status'];
  triggeredBy: string;          // clarificationId
}
```

宿主适配层澄清回复接口:在 HostAdapter 基础上,澄清流程还需要宿主提供回复接收能力:

```typescript
interface HostClarificationAdapter {
  // 发送澄清请求并获取可追踪的 handle
  requestClarification(target: ClarificationTarget, payload: ClarificationPayload): ClarificationHandle;

  // 事件订阅:收到回复时回调
  onClarificationResponse(callback: (response: ClarificationResponse) => void): void;

  // 超时处理:当澄清超时未回复时触发
  onClarificationTimeout(callback: (handle: ClarificationHandle) => void): void;
}

interface ClarificationTarget {
  type: 'user' | 'upstream-stage' | 'reviewer' | 'internal-owner';
  id?: string;
}

interface ClarificationPayload {
  clarificationId: string;
  question: string;
  suggestedOptions?: string[];
  context: string;              // 澄清背景摘要
}
```

Wave 1 参考实现:`requestClarification` 映射到 `lark-cli` 发送澄清卡片 + 会话内回复监听;`onClarificationResponse` 通过飞书消息回调或 ACP completion event 触发。

##### Work Package → Task 分解结构

Contract 阶段产出的每个 Work Package 内部拆分为 Task 列表。Task 是 Pipeline Engine 在 Implement 阶段调度的最小执行单元。

Task 对象的技术表示:

```typescript
interface Task {
  id: string;                    // 如 "WP-01-T-03"
  work_package_ref: string;      // 所属 Work Package ID
  title: string;                 // 任务描述
  target_files: string[];        // 精确文件路径
  expected_changes: string;      // 预期变更描述
  status: 'pending' | 'active' | 'passed' | 'failed';
  verification_steps: string[];  // 完成验证步骤
}
```

粒度约束:每个 Task 控制在原子、可验证、小步提交的范围,建议 5-15 分钟执行时间,对应一个原子可验证的代码变更。Pipeline Orchestrator 按 Task 列表顺序驱动 Implement 阶段,每个 Task 完成后校验 verification_steps,失败时阻断后续 Task 并记录失败上下文。

#### 5.2.3 Gate Engine

| 子模块 | 职责 |
|--------|------|
| Review Coordinator | 分配评审维度,管理并行评审(三方会审场景) |
| Rule Evaluator | 执行门禁检查规则,校验工件完整性和评审结论 |
| Verdict Aggregator | 汇总多方评审结论,输出最终门禁结果(通过/有条件通过/不通过) |

两道门禁的差异:
- Spec Review Gate:单一独立评审,检查规格完整性和阶段隔离。
- Contract Review Gate:三方并行会审(产品 + 开发 + 质量),检查需求承接、实现可行性和决策严谨性。

#### 5.2.4 Ledger Engine

| 子模块 | 职责 |
|--------|------|
| Artifact Collector | 从 Artifact Registry 收集本轮全部关键工件引用,包括 Clarification Record 与对应的回写工件 |
| Entry Generator | 生成结构化账本条目(版本、日期、范围、证据、结论、经验) |
| Review Checkpoint | 触发产品维度和架构维度对账本条目的双方审查,确认交付范围、证据链和经验沉淀质量 |
| Query Interface | 支持按任务、时间、阶段、结论等维度查询账本 |

#### 5.2.5 Adapter Layer

Adapter Layer 是 SEVO 核心与宿主环境之间的桥接层。宿主环境必须实现以下最小接口集才能接入 SEVO:

```typescript
// --- 宿主必须实现的最小接口集 ---
interface HostAdapter {
  // 文件存储
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  fileExists(path: string): boolean;
  listDir(path: string): string[];

  // Agent 派发
  dispatchAgent(stage: StageId, task: TaskPayload): AgentHandle;
  awaitResult(handle: AgentHandle): AgentResult;

  // 消息通知
  notify(recipient: string, message: string): void;
}

// --- 可选增强接口(宿主支持时启用,提升治理粒度) ---
interface HostAdapterEnhanced extends HostAdapter {
  // 执行环境隔离(如 git worktree、临时目录、容器)
  createIsolatedEnv(config: IsolationConfig): EnvHandle;
  destroyEnv(handle: EnvHandle): void;

  // 工具调用层 hook(实时守卫)
  registerToolHook(hook: ExecutionHook): void;
}
```

Wave 1 参考实现(OpenClaw 宿主):
- 文件存储:直接映射到 Node.js `fs` 模块
- Agent 派发:映射到 `sessions_spawn` + completion event
- 消息通知:映射到 `lark-cli` 或会话内回复
- 环境隔离:映射到 `git worktree`
- 工具 hook:映射到 wow-harness 的 PreToolUse/PostToolUse hook

#### 5.2.6 Web Layer

Web Layer 是引擎层之上的用户交互层,由 API Layer、Frontend Components、Persistence Layer 三部分组成。它围绕 UFR-01~UFR-08、UFR-13 组织页面和接口,职责是把引擎层对象投影成可浏览、可审批、可追溯的管理界面。

##### 5.2.6.1 API Layer

接口分为 Query API、Command API、Event Stream API 三类。Wave 1 主接口风格采用 REST 资源接口;GraphQL 不作为默认对外契约,仅保留为后续只读聚合适配点。

| UFR | 主要接口 | 语义 | 引擎来源 |
|-----|----------|------|---------|
| UFR-01 项目总览 | `GET /api/projects?q=&health=` | 返回项目卡片列表、FR 计数、健康度、最近更新时间 | Pipeline Instance + HealthSnapshot + NotificationRecord |
| UFR-01a 项目内 FR 进度视图 | `GET /api/projects/{projectId}/frs?stage=&status=` | 返回项目下 FR 列表、当前阶段、门禁状态、摘要 | FrSummaryView + GateVerdict |
| UFR-02 FR 流程详情 | `GET /api/frs/{frId}` | 返回阶段时间线、路由结果、阻断原因、执行者 | StageRecord + RoutingResult + GateVerdict |
| UFR-03 待办决策队列 | `GET /api/todos` | 聚合门禁审批、澄清回复、失败处置待办 | GateVerdict + ClarificationRecord + PipelineInstance |
| UFR-03/UFR-11 澄清回复 | `GET /api/clarifications/{id}` / `POST /api/clarifications/{id}/reply` | 读取澄清上下文并提交回复 | ClarificationRecord + Clarification Coordinator |
| UFR-04 门禁审批 | `GET /api/gates/{gateId}` / `POST /api/gates/{gateId}/approve` / `POST /api/gates/{gateId}/reject` / `POST /api/gates/{gateId}/request-review` | 查看门禁细节并执行裁定 | Gate Engine + Ledger Engine |
| UFR-05 质量概览 | `GET /api/frs/{frId}/quality` | 返回 Review / Regression / Verify 摘要 | Review Bundle + Regression Bundle + Verification Bundle |
| UFR-06 交付物索引 | `GET /api/frs/{frId}/artifacts?type=` | 按阶段列出工件及预览链接 | Artifact Registry + ArtifactRef |
| UFR-07 异常告警 | `GET /api/notifications` / `POST /api/notifications/{id}/read` | 读取告警列表、标记已读 | Stage 事件日志 + NotificationRecord |
| UFR-07 告警偏好 | `GET /api/v1/notification-preferences?userId=` / `POST /api/v1/notification-preferences` / `PATCH /api/v1/notification-preferences/{preferenceId}` / `DELETE /api/v1/notification-preferences/{preferenceId}` | 读取/创建/修改/删除用户级通知偏好 | NotificationPreference |
| UFR-08 FR 流程操作 | `POST /api/frs/{frId}/pause` / `POST /api/frs/{frId}/resume` / `POST /api/frs/{frId}/cancel` / `POST /api/v1/frs/{frId}/retry` / `POST /api/v1/frs/{frId}/abandon` | 用户控制 FR 生命周期,failed 后可执行重试或放弃 | Pipeline Engine |
| UFR-13 FR 全景视图 | `GET /api/projects/{projectId}/fr-matrix` | 返回 FR × 4 宏阶段矩阵,细阶段按统一映射聚合 | FrMatrixView + StageSnapshot + USER_MACRO_STAGE_MAP |
| Future: UFR-09 | `GET /api/frs/{frId}/timeline` | 返回阶段耗时和 attempt 统计 | StageRecord |
| Future: UFR-12 | `GET /api/ledger?projectId=` | 返回历史交付账本 | Ledger Query |

命令接口约束:
- 所有 `POST` 命令必须记录 `actorId`、`requestId`、`expectedVersion` 并写入审计日志,避免重复提交和并发覆盖。
- `POST /api/v1/frs/{frId}/retry` 仅用于 `failed` FR,从最近失败的细阶段以 `attempt + 1` 重新排队,保留历史失败记录和工件引用;`POST /api/v1/frs/{frId}/abandon` 把 FR 置为终态 `abandoned`,关闭相关待办并停止后续自动推进。
- `NotificationPreference` 控制 Web / IM 渠道、静默时段和严重级别过滤;若用户未显式配置,默认采用 `web + im` 且接收全部级别事件。
- 查询接口返回只读 View Model,不把底层 StageRecord 原样暴露给前端。
- 若后续引入 GraphQL,它只能聚合上述只读资源,不直接承载状态变更命令。

##### 5.2.6.2 Frontend Components

| 组件 | 对应 UFR | 职责 | 关键子组件 |
|------|----------|------|-----------|
| `ProjectDashboardPage` | UFR-01 | 首页项目卡片、健康度筛选、待办角标 | `ProjectCardList`、`HealthFilterBar`、`TodoBadge` |
| `ProjectFrBoardPage` | UFR-01a / UFR-13 | 项目内 FR 列表和 FR × 阶段矩阵 | `FrCardGroup`、`FrMatrixBoard`、`ProjectSummaryHeader` |
| `FrDetailPage` | UFR-02 / UFR-05 / UFR-06 | FR 阶段时间线、质量摘要、工件索引 | `StageTimeline`、`QualitySummaryPanel`、`ArtifactTabs` |
| `TodoInboxPage` | UFR-03 | 聚合用户待处理事项 | `TodoList`、`TodoTypeFilter`、`WaitingDurationBadge` |
| `GateDecisionPanel` | UFR-04 | 门禁摘要、评审报告预览、审批动作 | `GateSummary`、`ReviewBundlePreview`、`DecisionActionBar` |
| `ClarificationReplyPanel` | UFR-03 / UFR-11 | 展示澄清上下文并提交回复 | `ClarificationContext`、`ReplyComposer`、`ResolutionStatus` |
| `NotificationCenter` | UFR-07 | 异常告警列表、已读状态和通知偏好入口 | `NotificationList`、`SeverityTag`、`PreferenceForm` |
| `FrControlBar` | UFR-08 | 暂停/恢复/取消/重试/放弃 FR | `PauseButton`、`ResumeButton`、`RetryButton`、`AbandonConfirmDialog` |

前端组件约束:
- 页面以 UFR 为边界组织,不按引擎内部模块名暴露 UI。
- 所有状态展示组件依赖同一套 View Model,避免首页、详情页、通知中心出现状态口径不一致。
- 组件通过资源接口消费数据,不依赖特定前端框架的全局状态库约定。

##### 5.2.6.3 Persistence Layer

Web 层持久化采用读优化投影模型。引擎层对象仍是真相源,Web 层保存的是可重建的 View Model、事件游标和用户界面状态。

| Web 数据模型 | 字段摘要 | 来源对象 | 用途 |
|-------------|---------|---------|------|
| `ProjectOverviewView` | `projectId`、`name`、`frTotal`、`activeFrCount`、`blockedFrCount`、`healthStatus`、`updatedAt` | PipelineInstance + HealthSnapshot | 首页项目卡片 |
| `FrSummaryView` | `frId`、`frCode`、`title`、`currentStage`、`currentMacroStage`、`gateStatus`、`healthStatus`、`updatedAt` | StageRecord + GateVerdict + USER_MACRO_STAGE_MAP | 项目内 FR 列表 |
| `FrDetailView` | `routingResult`、`stageTimeline[]`、`macroStageTimeline[]`、`blockers[]`、`qualitySummary`、`artifactGroups[]` | RoutingResult + StageRecord + ArtifactRef + Review/Regression/Verification Bundle + USER_MACRO_STAGE_MAP | FR 详情页 |
| `TodoItemView` | `todoId`、`type`、`frId`、`stageId`、`waitDuration`、`summary`、`status` | GateVerdict + ClarificationRecord + PipelineInstance | 待办队列 |
| `GateDecisionView` | `gateId`、`gateType`、`reviewBundles[]`、`blockers[]`、`decisionStatus` | GateVerdict + Review Bundle | 门禁审批页 |
| `ClarificationThreadView` | `clarificationId`、`question`、`blockingLevel`、`context`、`response`、`resolutionStatus` | ClarificationRecord | 澄清详情与回复状态 |
| `QualitySummaryView` | `reviewStatus`、`regressionStatus`、`verifyStatus`、`failedCount` | Review/Regression/Verification Bundle | 质量摘要 |
| `NotificationRecord` | `notificationId`、`severity`、`eventType`、`deliveryChannels[]`、`targetUrl`、`readAt` | 事件日志 + NotificationPreference + 用户已读状态 | 异常通知中心 |
| `NotificationPreference` | `preferenceId`、`userId`、`channels[]`、`quietHours`、`severityFilter[]`、`updatedAt` | 用户配置 + Notification Adapter | 用户级告警偏好 |
| `HealthSnapshot` | `targetType`、`targetId`、`healthStatus`、`reasons[]`、`computedAt` | StageRecord + timeout policy + PipelineInstance | 首页与 FR 健康度 |

与引擎层的关系:
- `PipelineInstance`、`StageRecord`、`GateVerdict`、`ClarificationRecord`、`ArtifactRef`、`LedgerEntry` 是真相源,Web 投影可随时重建。
- Web 层只允许持久化读模型、游标、已读状态和用户级 `NotificationPreference`,不得持久化绕开引擎状态机的业务状态。
- 视图投影可存放在 `projects/<slug>/artifacts/web-views/` 或独立读库;物理存储可替换,逻辑模型保持稳定。

#### 5.2.7 Review Fix Loop

Review Fix Loop 是 Gate Engine 和 Pipeline Engine 协作的内置子流程,在评审结论为「有条件通过」或「不通过」时自动触发,驱动问题修复→定向复验→门禁重评估的闭环。

| 子模块 | 职责 |
|--------|------|
| Issue Extractor | 解析 Review Bundle,提取结构化问题清单,标注严重级别(P0/P1/P2/P3)、关联 FR、问题工件定位和修复建议 |
| Fix Task Generator | 将 P0/P1 问题转化为修复任务卡片(Fix Task),关联原 Pipeline Instance ID 和评审报告引用;P2/P3 记录待办不阻断 |
| Revalidation Trigger | 修复任务完成后,自动触发原评审维度对修复范围做定向复验,复验范围限定为修复涉及的工件及关联影响面 |
| Loop Controller | 管理修复→复验循环状态,跟踪轮次计数(默认上限 3 轮),超限升级为人工介入 |
| Gate Re-evaluator | 所有 P0 关闭且 P1 关闭或经人工豁免后,重新触发 Gate Engine 评估放行条件 |

数据流:

```
Review Bundle (conclusion: conditional/rejected)
  → Issue Extractor: 解析评审报告,输出 ReviewIssueList
  → Fix Task Generator: P0/P1 问题 → FixTask 卡片,排入 Task Queue(P0 优先于 P1)
  → Pipeline Orchestrator: 派发 FixTask 给空闲 Agent 执行
  → [Fix Executor]: 执行修复,产出修复工件
  → Revalidation Trigger: 触发原评审维度定向复验
  → [Original Reviewer]: 复验修复范围
  → Loop Controller: 复验通过 → 关闭问题;复验不通过 → 问题回退,继续循环
  → Gate Re-evaluator: 全部 P0 关闭 + P1 关闭/豁免 → 触发 Gate Engine 重新评估
  → Gate Engine: 输出新 GateVerdict(passed)
```

与现有组件的交互:
- Gate Engine:Fix Loop 由 Gate Engine 的 Verdict Aggregator 输出 conditional/rejected 时触发;闭环后 Gate Re-evaluator 调用 Gate Engine 重新评估。
- Pipeline Engine(Pipeline Orchestrator):负责将 FixTask 作为 Implement 子任务派发给执行者,复用现有 Agent 派发和 completion 监听机制。
- Task Queue:FixTask 排入与 Implement 阶段相同的任务队列,按优先级调度。
- Artifact Registry:修复产出的工件和复验报告均注册到 Artifact Registry,保证工件链完整。
- Ledger Engine:Fix Loop 全链路记录(问题清单、修复任务、复验结果)纳入最终 Ledger Entry 的证据链。
- Web Layer:问题清单、修复任务状态、复验结果通过 API 投影到驾驶舱,实时可见。

##### Review Fix Loop 接口契约

```typescript
interface ReviewFixLoop {
  // 从评审包提取结构化问题清单
  extractIssues(bundle: ReviewBundle): ReviewIssue[];

  // 为 P0/P1 问题生成修复任务卡片
  generateFixTasks(issues: ReviewIssue[], pipelineId: string): FixTask[];

  // 修复完成后触发定向复验
  triggerRevalidation(fixTask: FixTask, fixArtifacts: ArtifactRef[]): RevalidationRequest;

  // 处理复验结果,更新问题状态
  handleRevalidationResult(result: RevalidationResult): ReviewIssue;

  // 评估是否满足门禁放行条件
  evaluateGateReadiness(issues: ReviewIssue[]): GateReadiness;
}
```

#### 5.2.8 Publish Generalization Gate

Publish Generalization Gate 是 Deploy 阶段前的可选门禁组件,仅当项目配置了 `publishTarget`(npm / ClawHub / GitHub)时激活。职责是确保交付物满足商用化/通用化质量标准,防止内部开发态残留泄漏到公开发布渠道。

| 子模块 | 职责 |
|--------|------|
| Trigger Detector | 检测项目配置中是否存在 `publishTarget`,决定是否激活本门禁 |
| Clarification Requester | 复用 Clarification Coordinator 的 `open` + `dispatch` 接口,向用户发起主动澄清:"该项目配置了发布目标,是否需要在发布前执行商用化/通用化处理?" |
| Check Executor | 用户确认后,顺序执行 6 项检查(见下表) |
| Skip Recorder | 用户选择跳过时,调用 Ledger Engine 写入审计记录,标注"用户主动跳过通用化门禁" |

检查项清单:

| # | 检查项 | 判定标准 |
|---|--------|----------|
| 1 | 空目录检查 | `publish/` 下 `scripts/`、`references/`、`assets/` 均为非空目录 |
| 2 | 代码示例可执行性 | SKILL.md 中出现的代码示例均有对应的实际可执行入口 |
| 3 | 全英文检查 | 无中文注释、中文内部术语或面向内部协作语境的残留表述 |
| 4 | 内部路径检查 | 不存在 `/root/.openclaw/` 等内部路径硬编码,不存在内部 OpenClaw 配置引用 |
| 5 | package.json 完整性 | `name`、`version`、`description`、`author`、`license` 字段均存在且非空 |
| 6 | README 一致性 | README.md 存在,且内容与 SKILL.md 对外描述保持一致 |

与现有组件的交互:
- **Clarification Coordinator**:复用已有的澄清工作流(`open` → `dispatch` → `resolve`),不新建独立交互机制。Stage State Machine 在等待用户回复期间将阶段置为 `clarification-blocked`。
- **Pipeline Engine(Stage Planner)**:Stage Planner 在规划阶段序列时,根据 `publishTarget` 配置决定是否在 Deploy 前插入本阶段;无配置时完全跳过,不影响 Deploy 流程。
- **Ledger Engine**:跳过决定和门禁结果均写入 Ledger Entry 证据链。
- **Gate Engine**:本组件不经过 Gate Engine 的多方会审流程(非评审类门禁),而是自包含的检查+阻断逻辑。

输出:Publish Generalization Gate Result(通过 / 阻断+具体失败项 / 用户跳过)。

---

### 5.3 核心 Schema 定义(v1)

以下为 Wave 1 的正式 schema 定义,覆盖持久化对象和关键引用类型。所有对象包含 `schema_version` 字段以支持向前兼容。

```typescript
// --- 基础类型 ---
type InstanceStatus = 'created' | 'active' | 'paused' | 'completed' | 'failed';

type StageId = 'spec' | 'spec-review-gate' | 'test-case-authoring' | 'contract' |
  'contract-review-gate' | 'implement' | 'review' | 'regression' |
  'deploy' | 'verify' | 'ledger';

type UserMacroStage = 'specify' | 'plan' | 'implement' | 'review';

// 11 个内核细阶段到 4 个用户宏阶段的唯一映射。
// 首页、FR 详情、待办、通知中心、FR × 阶段矩阵和统计口径必须统一引用该映射。
const USER_MACRO_STAGE_MAP: Record<StageId, UserMacroStage> = {
  'spec': 'specify',
  'spec-review-gate': 'specify',
  'test-case-authoring': 'plan',
  'contract': 'plan',
  'contract-review-gate': 'plan',
  'implement': 'implement',
  'review': 'review',
  'regression': 'review',
  'deploy': 'review',
  'verify': 'review',
  'ledger': 'review',
};

type NotificationChannel = 'web' | 'im';
type NotificationSeverity = 'info' | 'warning' | 'critical';

interface ArtifactRef {
  schema_version: '1.0';
  artifactId: string;          // 如 "spec-package-v1"
  path: string;                // 相对于流水线根目录的文件路径
  type: string;                // 工件类型(spec-package / review-bundle / ...)
  createdAt: string;           // ISO 8601
  checksum?: string;           // 内容哈希(Wave 2+)
}

type ClarificationType = 'correction' | 'methodology' | 'decision' | 'boundary' | 'experience' | 'meta';
type ClarificationBlockingLevel = 'blocking' | 'non-blocking';
type ClarificationStatus = 'open' | 'resolved' | 'settled';
type ClarificationResolutionSink =
  'spec' |           // 回写需求规格
  'contract' |       // 回写架构契约
  'task' |           // 回写实现任务描述
  'fact' |           // 收敛为事实知识
  'adr' |            // 写入正式 ADR(技术决策类,含替代方案和取舍理由)
  'adr-candidate' |  // 形成 ADR 候选(尚需评审确认)
  'constraint' |     // 收敛为边界/约束
  'methodology' |    // 收敛为方法论
  'experience' |     // 收敛为经验
  'meta';            // 收敛为流程元知识

// --- Pipeline Instance ---
interface PipelineInstance {
  schema_version: '1.0';
  instanceId: string;            // 格式:pi-<project-slug>-<yyyyMMdd>-<seq>
  projectSlug: string;           // 归属 Project 标识
  status: InstanceStatus;
  routingResult: RoutingResult;   // 创建时确定的路由结果
  currentStage: StageId;         // 当前执行阶段
  stages: StageRecord[];         // 全阶段记录
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

// --- Instance ID 生成策略 ---
// 格式:pi-<project-slug>-<yyyyMMdd>-<seq>
// 示例:pi-sevo-20260420-001
// 规则:
//   - project-slug:小写字母 + 连字符,如 "sevo"、"claw-design"
//   - yyyyMMdd:创建日期(UTC+8)
//   - seq:当日序号,从 001 开始,同一 Project 同一天内递增
//   - 全局唯一性由 (projectSlug + date + seq) 三元组保证
//   - Instance Manager 在创建时扫描已有 Instance 确定下一个 seq

// --- Project 目录结构 ---
interface ProjectLayout {
  schema_version: '1.0';
  projectSlug: string;
  rootPath: string;              // <workspace>/projects/<project-slug>/
  partitions: {
    docs: string;                // 过程文档:需求规格、架构设计、ADR、测试用例
    src: string;                 // 源代码:实现产物
    tests: string;               // 测试代码:自动化测试
    skill: string;               // Skill 定义(如有)
    reports: string;             // 质量证据:评审报告、审计报告、回归报告
    artifacts: string;           // 交付物:构建产物、发布包、部署制品
  };
  // 四分类映射:
  //   过程文档 → docs/
  //   结果代码 → src/
  //   质量证据 → tests/ + reports/
  //   交付物   → artifacts/
}

// --- 流水线状态 ---
interface PipelineState {
  schema_version: '1.0';
  pipelineId: string;            // 等价于 instanceId
  instanceId: string;            // 关联 PipelineInstance
  projectSlug: string;           // 关联 Project
  taskId: string;
  level: 'L0' | 'L1' | 'L2+';
  currentStage: StageId;
  stages: StageRecord[];
  createdAt: string;
  updatedAt: string;
}

interface StageRecord {
  schema_version: '1.0';
  stageId: StageId;
  status: 'pending' | 'active' | 'blocked' | 'clarification-blocked' | 'passed' | 'failed' | 'skipped';
  attempt: number;             // 当前执行尝试次数,从 1 开始
  executorId?: string;         // 执行者 Agent ID
  leaseExpireAt?: string;      // 租约过期时间(ISO 8601),用于恢复续跑时判断旧执行是否失效
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  clarificationSummary?: {           // 当前阶段澄清聚合状态
    open: number;
    resolved: number;
    settled: number;
    blockingOpen: number;            // >0 时阶段必须保持 blocked
  };
  clarificationRefs?: ArtifactRef[]; // 当前阶段关联的澄清记录引用
  blockers: string[];          // 阻断原因清单
  startedAt?: string;
  completedAt?: string;
  skipReason?: string;         // 跳过原因(status=skipped 时必填)
  createdAt: string;
  updatedAt: string;
}

// --- 阶段结果 ---
interface StageResult {
  schema_version: '1.0';
  stageId: StageId;
  pipelineId: string;
  attempt: number;
  conclusion: 'passed' | 'failed' | 'blocked';
  artifacts: ArtifactRef[];
  clarificationRefs?: ArtifactRef[];
  evidence: string;            // 结论依据摘要
  failureReason?: string;
}

// --- 通知偏好 ---
interface QuietHours {
  start: string;               // HH:mm
  end: string;                 // HH:mm
  timezone: string;            // IANA timezone
}

interface NotificationPreference {
  schema_version: '1.0';
  preferenceId: string;
  userId: string;
  channels: NotificationChannel[];
  severityFilter: NotificationSeverity[];
  quietHours?: QuietHours;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- 澄清记录 ---
interface ClarificationRecord {
  schema_version: '1.0';
  clarificationId: string;
  pipelineId: string;
  stageId: StageId;
  stageAttempt: number;                // 归属的阶段执行尝试,与 StageRecord.attempt 对齐
  type: ClarificationType;
  blockingLevel: ClarificationBlockingLevel;
  status: ClarificationStatus;
  targetType: 'user' | 'upstream-stage' | 'reviewer' | 'internal-owner';  // 澄清对象类型
  targetId?: string;                   // 澄清对象标识(用户 ID / 阶段 ID / 评审者 ID)
  sourceArtifacts: ArtifactRef[];      // 触发澄清的工件引用
  impactScope: string[];               // 受影响的 FR / Work Package / Task / 模块
  question: string;                    // 结构化澄清问题
  suggestedOptions?: string[];         // 可选建议(如有)
  assumedDefault?: string;             // non-blocking 时允许的默认假设
  responder?: string;                  // 实际回复者(可能与 target 不同)
  response?: string;                   // 回复内容
  resolution?: string;                 // 收敛结论
  resolutionSinks: ClarificationResolutionSink[];
  settledArtifacts?: ArtifactRef[];    // 写回后的工件引用(Spec / Contract / Task / ADR 等)
  createdAt: string;
  resolvedAt?: string;
  settledAt?: string;
}

// --- 评审包 ---
interface ReviewBundle {
  schema_version: '1.0';
  gateId: string;
  reviewer: { agentId: string; stageId: StageId };
  conclusion: 'passed' | 'conditional' | 'rejected';
  items: { issue: string; severity: 'blocker' | 'major' | 'minor'; owner?: string }[];
  evidence: ArtifactRef[];
  createdAt: string;
}

// --- Review Fix Loop ---
type ReviewIssueSeverity = 'P0' | 'P1' | 'P2' | 'P3';
type ReviewIssueStatus = 'open' | 'fixing' | 'revalidating' | 'closed' | 'waived';

interface ReviewIssue {
  schema_version: '1.0';
  issueId: string;                     // 如 "ri-<pipelineId>-<seq>"
  pipelineId: string;
  gateId: string;                      // 来源门禁
  severity: ReviewIssueSeverity;
  status: ReviewIssueStatus;
  relatedFr: string;                   // 关联的原始 FR 标识
  artifactLocation: string;            // 问题所在工件路径
  description: string;                 // 问题描述
  fixSuggestion?: string;              // 修复建议
  fixTaskId?: string;                  // 关联的修复任务 ID
  revalidationAttempt: number;         // 当前复验轮次
  maxAttempts: number;                 // 最大复验轮次(默认 3)
  waivedBy?: string;                   // 豁免人(P1 人工豁免时填写)
  createdAt: string;
  closedAt?: string;
}

interface FixTask {
  schema_version: '1.0';
  fixTaskId: string;                   // 如 "ft-<pipelineId>-<seq>"
  pipelineId: string;
  issueId: string;                     // 关联的 ReviewIssue
  priority: ReviewIssueSeverity;       // 继承问题严重级别
  status: 'queued' | 'active' | 'completed' | 'failed';
  executorId?: string;                 // 执行者 Agent ID
  inputArtifacts: ArtifactRef[];       // 修复输入(原工件 + 评审报告)
  outputArtifacts: ArtifactRef[];      // 修复产出
  createdAt: string;
  completedAt?: string;
}

interface RevalidationResult {
  schema_version: '1.0';
  revalidationId: string;
  fixTaskId: string;
  issueId: string;
  reviewerId: string;                  // 原评审维度执行者
  conclusion: 'passed' | 'failed';
  scope: ArtifactRef[];                // 复验范围
  evidence: ArtifactRef[];
  createdAt: string;
}

interface GateReadiness {
  ready: boolean;                      // 是否满足放行条件
  openP0: number;                      // 未关闭 P0 数量
  openP1: number;                      // 未关闭/未豁免 P1 数量
  pendingP2P3: number;                 // 待办 P2/P3 数量(不阻断)
  escalated: boolean;                  // 是否已超限升级为人工介入
}

// --- 事件日志 ---
interface StageEvent {
  schema_version: '1.0';
  timestamp: string;           // ISO 8601
  pipelineId: string;
  stageId: StageId;
  attempt: number;
  eventType: 'status-change' | 'artifact-registered' | 'gate-verdict' | 'hook-result' |
    'clarification-opened' | 'clarification-resolved' | 'clarification-settled' |
    'fix-loop-started' | 'fix-task-completed' | 'revalidation-passed' | 'revalidation-failed' | 'fix-loop-escalated';
  payload: Record<string, unknown>;
}
```

幂等与恢复策略:每次阶段执行带 `attempt` 编号,同一 `(pipelineId, stageId, attempt)` 的重复写入为幂等操作。恢复扫描时,Pipeline Engine 检查 `leaseExpireAt`:租约过期的 active 阶段可重新派发(attempt+1),未过期的保持等待。Gate、Ledger、Artifact 写入均以 `(pipelineId, stageId, attempt)` 为幂等键,重复写入不产生副作用。

### 5.4 Skill 接口定义

SEVO 对外暴露以下独立 Skill,每个 Skill 对应研发流水线中的一个用户意图。多项目并行时,每个项目在不同阶段独立触发对应 Skill。

#### 内置 Skill(Wave 1)

| Skill 名称 | 职责 | 触发条件 | 核心模块/入口 |
|------------|------|----------|---------------|
| PipelineCreateSkill | 创建 Pipeline Instance,初始化 Project 目录,路由判定任务级别并输出必经阶段 | 用户说"新建一个研发任务""启动流水线""开始做 X 功能""这个需求走流程" | `src/pipeline/instance-manager.ts` → `src/pipeline/project-manager.ts` → `src/router/router.ts` → `src/router/level-classifier.ts` → `src/pipeline/pipeline-engine.ts` |
| SpecSkill | 执行需求规格阶段,产出 Spec Package,并在阶段内置模糊检测与澄清回写 | 用户说"写需求规格""定义需求""明确这个任务要做什么""出 spec" | `src/pipeline/pipeline-engine.ts`(激活 spec 阶段)→ `src/clarification/clarification-coordinator.ts` → Adapter Layer 派发执行者 |
| ContractSkill | 执行架构设计阶段,产出 Contract Package(架构方案 + 工作包拆分),并处理技术/需求模糊的分流澄清 | 用户说"做架构设计""拆分工作包""出技术方案""写 contract" | `src/pipeline/pipeline-engine.ts`(激活 contract 阶段)→ `src/clarification/clarification-coordinator.ts` → Adapter Layer 派发执行者 |
| ImplementSkill | 执行实现阶段,按 Task 列表驱动 TDD 循环,并在任务不完整或上游矛盾时触发澄清 | 用户说"开始编码""执行实现""开发这个功能""跑 implement" | `src/orchestrator/task-orchestrator.ts` → `src/clarification/clarification-coordinator.ts` → `src/pipeline/pipeline-engine.ts` |
| ReviewSkill | 执行独立审计阶段,产出 Review Bundle | 用户说"审查代码""做 code review""质量审计""检查实现" | `src/pipeline/pipeline-engine.ts`(激活 review 阶段)→ Adapter Layer 派发审计者 |
| RegressionSkill | 执行回归验证阶段,确保无回归缺陷 | 用户说"跑回归测试""验证没有回归""确认没破坏已有功能" | `src/pipeline/pipeline-engine.ts`(激活 regression 阶段)→ Adapter Layer 派发执行者 |
| DeploySkill | 执行发布阶段,产出 Release Artifact | 用户说"发布""部署""打包发版""上线" | `src/pipeline/pipeline-engine.ts`(激活 deploy 阶段)→ Adapter Layer |
| VerifySkill | 在清洁环境中执行交付验证 | 用户说"验证交付物""清洁环境测试""确认可交付" | `src/pipeline/pipeline-engine.ts`(激活 verify 阶段)→ VerifyAdapter |

#### 治理 Skill(跨阶段)

| Skill 名称 | 职责 | 触发条件 | 核心模块/入口 |
|------------|------|----------|---------------|
| GateSkill | 执行门禁检查,汇总评审结论并输出裁决 | 用户说"过门禁""检查能不能进下一步""评审结果怎么样",或流水线自动触发 | `src/gate/gate-engine.ts` → `src/gate/verdict-aggregator.ts` |
| ClarificationSkill | 在 Spec / Contract / Implement 阶段执行模糊检测、问题路由、收敛写回与知识沉淀 | 用户说"先澄清一下""这里有歧义",或阶段执行时自动触发 | `src/clarification/clarification-coordinator.ts` → `src/clarification/rule-set.ts` |
| LedgerSkill | 生成交付账本,汇总全链路工件 | 用户说"生成交付记录""查看账本""这次交付的证据链" | `src/ledger/ledger-engine.ts` → `src/ledger/artifact-collector.ts` |
| PipelineStatusSkill | 查询流水线当前状态和进度 | 用户说"流水线进度如何""当前在哪个阶段""任务状态" | `src/pipeline/pipeline-engine.ts`(状态查询)→ `src/pipeline/stage-machine.ts` |
| PipelineResumeSkill | 从失败点恢复续跑流水线 | 用户说"继续流水线""修复后继续""从失败点恢复""重试" | `src/pipeline/pipeline-engine.ts`(状态恢复 + attempt 递增)|

#### Skill 间依赖关系

```
PipelineCreateSkill ──→ SpecSkill(创建后自动激活第一个阶段)
SpecSkill ──→ ClarificationSkill(Spec 阶段内自动触发,可多次往返)
SpecSkill ──→ GateSkill(Spec 完成后触发 Spec Review Gate)
GateSkill ──→ ContractSkill(门禁通过后激活下一阶段)
ContractSkill ──→ ClarificationSkill(Contract 阶段内自动触发,可多次往返)
ContractSkill ──→ GateSkill(Contract 完成后触发 Contract Review Gate)
GateSkill ──→ ImplementSkill(门禁通过后激活实现)
ImplementSkill ──→ ClarificationSkill(Task 不完整或上游矛盾时触发)
ImplementSkill ──→ ReviewSkill(实现完成后触发审计)
ReviewSkill ──→ RegressionSkill(审计通过后触发回归)
RegressionSkill ──→ DeploySkill(回归通过后触发发布)
DeploySkill ──→ VerifySkill(发布后触发清洁环境验证)
VerifySkill ──→ LedgerSkill(验证通过后生成账本)
ClarificationSkill ──→ LedgerSkill(澄清记录纳入最终证据链)
PipelineResumeSkill ──→ 任意阶段 Skill(从失败点恢复)
```

#### Skill 路由契约

每个 Skill 通过声明式契约注册能力,宿主的 SkillRouter 基于用户意图匹配对应 Skill:

```yaml
# 示例:PipelineCreateSkill 契约
name: pipeline-create
description: 创建研发流水线,路由判定任务级别并输出必经阶段
triggers:
  - "新建任务|启动流水线|开始做|走流程|新需求"
  - "create pipeline|start task|new feature"
input: PipelineTask(任务目标、约束、范围)
output: RoutingResult(级别、必经阶段、跟踪工件)
```

## 6. 运行时视图

### 6.1 场景:完整 Level 2+ 流水线(含并行分支)

这是 SEVO 最完整的运行路径,覆盖全部 8 阶段 + 2 门禁 + 1 并行活动。

```
用户 -> PipelineCreateSkill: 提交研发任务
PipelineCreateSkill -> Instance Manager: create(task, projectSlug)
Instance Manager -> Project Manager: 校验 slug + 初始化目录
Instance Manager -> Router: route(task)
Router -> Router: 匹配触发规则，判定 Level 2+
Router -> Instance Manager: RoutingResult
Instance Manager -> Pipeline Engine: PipelineInstance（status=created）
Pipeline Engine -> Pipeline Engine: status → active

Pipeline Engine -> [执行者]: 激活 Spec 阶段
[Spec 执行者] -> Pipeline Engine: 提交 Spec Package
Pipeline Engine -> Artifact Registry: 注册 Spec Package

Pipeline Engine -> Gate Engine: 触发 Spec Review Gate
Gate Engine -> [Spec Review 执行者]: 分配独立评审
[Spec Review 执行者] -> Gate Engine: 提交 Spec Review Bundle
Gate Engine -> Pipeline Engine: 门禁结论(通过)

Pipeline Engine -> Pipeline Engine: 并行分支激活
Pipeline Engine -> [Contract 执行者]: 激活 Contract 阶段
Pipeline Engine -> [Test Case 执行者]: 激活 Test Case Authoring 阶段

[Test Case 执行者] -> Pipeline Engine: 提交 Test Case Document(独立工件)
[Contract 执行者] -> Pipeline Engine: 提交 Contract Package

Pipeline Engine -> Gate Engine: 触发 Contract Review Gate
Gate Engine -> [产品维度评审者]: 产品视角评审
Gate Engine -> [开发维度评审者]: 开发视角评审
Gate Engine -> [质量维度评审者]: 质量视角评审
Gate Engine -> Gate Engine: 汇总三方结论
Gate Engine -> Pipeline Engine: 门禁结论(通过)

Pipeline Engine -> [Implement 执行者]: 激活 Implement 阶段(输入含 Test Case Document)
[Implement 执行者] -> Pipeline Engine: 提交 Implementation Bundle

Pipeline Engine -> [Review 执行者-质量维度]: 激活 Review 阶段(参考 Test Case Document)
Pipeline Engine -> [Review 执行者-产品维度]: 激活 Review 阶段(功能完整性)
[Review 执行者-质量维度] -> Pipeline Engine: Review Bundle(质量维度)
[Review 执行者-产品维度] -> Pipeline Engine: Review Bundle(产品维度)

Pipeline Engine -> [Regression 执行者]: 激活 Regression 阶段(引用 Test Case Document)
[Regression 执行者] -> Pipeline Engine: 提交 Regression Bundle
Pipeline Engine -> [Regression 审查者]: 审查回归结果完整性和覆盖度
[Regression 审查者] -> Pipeline Engine: Regression Review 结论

Pipeline Engine -> [Deploy 执行者]: 激活 Deploy 阶段
[Deploy 执行者] -> Pipeline Engine: 提交 Release Artifact
Pipeline Engine -> [Deploy 审查者]: 审查发布制品与架构方案一致性、版本元数据完整性
[Deploy 审查者] -> Pipeline Engine: Deploy Review 结论

Pipeline Engine -> [Verify 执行者]: 激活 Verify 阶段(独立清洁环境)
[Verify 执行者] -> Pipeline Engine: 提交 Verification Bundle
Pipeline Engine -> [Verify 审查者]: 确认核心用户路径和交付可用性达标
[Verify 审查者] -> Pipeline Engine: Verify Review 结论

Pipeline Engine -> Ledger Engine: 触发账本生成
Ledger Engine -> Ledger Engine: 收集全链路工件,生成 Ledger Entry
Ledger Engine -> [Ledger 审查者-产品维度]: 确认交付范围和结论准确
Ledger Engine -> [Ledger 审查者-架构维度]: 确认证据链完整和经验沉淀质量
[Ledger 审查者-产品维度] -> Ledger Engine: Ledger Review 结论(产品维度)
[Ledger 审查者-架构维度] -> Ledger Engine: Ledger Review 结论(架构维度)
Ledger Engine -> 用户: 交付账本
```

### 6.2 场景:Level 0 微小改动快速通道

```
用户 -> Router: 提交微小改动
Router -> Pipeline Engine: 路由结果(跳过 Spec/Contract/Gate,直接 Implement)

Pipeline Engine -> [Implement 执行者]: 激活 Implement
[Implement 执行者] -> Pipeline Engine: Implementation Bundle

Pipeline Engine -> [Review 执行者]: 激活 Review(最小审查)
[Review 执行者] -> Pipeline Engine: Review Bundle

Pipeline Engine -> [Regression 执行者]: 激活 Regression(最小回归)
[Regression 执行者] -> Pipeline Engine: Regression Bundle

Pipeline Engine -> Ledger Engine: 生成 Ledger Entry(记录跳过阶段及理由)
```

### 6.3 场景:Level 1 单域中等改动

Level 1 从 Spec 开始,Contract 和 Implement 可简化,门禁不能省。简化方式:Contract 阶段产出轻量契约(仅工作包拆分和关键边界,不要求完整 arc42);Contract Review Gate 简化为双维度评审(产品维度 + 实现维度,质量维度可选);Implement 阶段不强制 Task 级 TDD 循环,但仍需测试覆盖。

```
用户 -> Router: 提交单域中等改动
Router -> Pipeline Engine: 路由结果(Level 1,Contract 简化,门禁保留)

Pipeline Engine -> [Spec 执行者]: 激活 Spec 阶段
[Spec 执行者] -> Pipeline Engine: 提交 Spec Package

Pipeline Engine -> Gate Engine: 触发 Spec Review Gate
Gate Engine -> [Review 执行者]: 独立评审
[Review 执行者] -> Gate Engine: 通过
Gate Engine -> Pipeline Engine: 门禁通过

Pipeline Engine -> [Plan 执行者]: 激活 Contract 阶段(轻量模式)
[Plan 执行者] -> Pipeline Engine: 提交轻量 Contract Package

Pipeline Engine -> Gate Engine: 触发 Contract Review Gate(简化双方评审)
Gate Engine -> [Spec 执行者]: 需求承接检查
Gate Engine -> [Implement 执行者]: 实现可行性检查
Gate Engine -> Pipeline Engine: 门禁通过

Pipeline Engine -> [Implement 执行者]: 激活 Implement
[Implement 执行者] -> Pipeline Engine: Implementation Bundle

Pipeline Engine -> [Review 执行者]: 激活 Review
Pipeline Engine -> [Spec 执行者]: 激活 Review(功能完整性)
[Review 执行者] -> Pipeline Engine: Review Bundle(质量维度)
[Spec 执行者] -> Pipeline Engine: Review Bundle(产品维度)

Pipeline Engine -> [Implement 执行者]: 激活 Regression
[Implement 执行者] -> Pipeline Engine: Regression Bundle
Pipeline Engine -> [Review 执行者]: 审查回归结果
[Review 执行者] -> Pipeline Engine: Regression Review 结论

Pipeline Engine -> [Operate 执行者]: 激活 Deploy
[Operate 执行者] -> Pipeline Engine: Release Artifact
Pipeline Engine -> [Plan 执行者]: 审查发布制品
[Plan 执行者] -> Pipeline Engine: Deploy Review 结论

Pipeline Engine -> [Review 执行者]: 激活 Verify
[Review 执行者] -> Pipeline Engine: Verification Bundle
Pipeline Engine -> [Spec 执行者]: 确认交付可用性
[Spec 执行者] -> Pipeline Engine: Verify Review 结论

Pipeline Engine -> Ledger Engine: 生成 Ledger Entry
```

### 6.4 场景:Implement 阶段 TDD 循环

Implement 阶段内部,每个 Task 的执行遵循 TDD 循环(Red-Green-Refactor)。状态机在 Task 级别强制 test-first 约束:

```
Task 激活
  │
  ▼
[Red] 编写覆盖目标行为的失败测试
  │
  ├── 测试未编写或未失败 → 阻断,禁止进入 Green
  │
  ▼
[Green] 编写最小实现使测试通过
  │
  ├── 测试未通过 → 回退到 Green 继续修复
  │
  ▼
[Refactor] 重构(测试必须保持通过)
  │
  ├── 测试回归失败 → 回退到 Refactor 修复
  │
  ▼
Task 完成 → 校验 verification_steps → 推进下一个 Task
```

强制机制:Pipeline Engine 在 Task 状态流转时校验 TDD 阶段标记。Task 的 Implementation Bundle 必须包含测试文件引用和测试执行结果。缺少测试证据的 Task 提交会被 Artifact Registry 拒绝,状态保持 active 直到补齐。

### 6.5 场景:Systematic Debugging

当 Implement 或 Review 阶段发现缺陷时,触发系统化调试活动。调试遵循四阶段框架,作为当前阶段内部的子流程执行:

```
缺陷触发(测试失败 / 审计发现 / 回归异常)
  │
  ▼
[复现] 在可控条件下稳定重现问题
  │
  ├── 无法复现 → 记录环境信息,扩大复现条件后重试
  │
  ▼
[定位] 缩小问题范围至具体模块或代码路径
  │
  ▼
[分析] 确定根因,排除表面症状
  │
  ├── 根因不明确 → 回退到定位,增加观测手段
  │
  ▼
[验证] 修复后确认问题消除且未引入新问题
  │
  ├── 验证失败 → 回退到分析
  │
  ▼
产出 Debugging Record → 归入当前阶段工件
```

触发条件:TDD 循环中测试持续失败超过 2 轮、Review 阶段发现逻辑缺陷、Regression 阶段出现回归异常。调试结论必须基于证据(日志、测试结果、代码路径分析),禁止基于主观推测直接修复。Debugging Record 作为工件归入触发阶段的 artifacts 目录。

### 6.6 场景:门禁阻断与修复续跑

```
Gate Engine -> Pipeline Engine: Spec Review Gate 结论(有条件通过,2 个阻断问题)
Pipeline Engine -> Pipeline Engine: Spec 阶段状态 → blocked

[Spec 执行者] -> Pipeline Engine: 修复 Spec Package,重新提交
Pipeline Engine -> Gate Engine: 重新触发 Spec Review Gate
Gate Engine -> [Review 执行者]: 复审(仅针对 2 个阻断问题)
[Review 执行者] -> Gate Engine: 复审通过
Gate Engine -> Pipeline Engine: 门禁结论(通过)
Pipeline Engine -> Pipeline Engine: 并行激活 Contract + Test Case Authoring
```

### 6.7 场景:Test Case Authoring 并行流

这是 phase2-inputs.md 要求明确的并行活动。

触发时机:Spec Review Gate 通过后,Pipeline Orchestrator 同时激活两个阶段。

```
[Spec Review Gate 通过]
    ├── Contract(Plan 执行者)
    │     └── 产出 Contract Package
    └── Test Case Authoring(Review 执行者)
          └── 产出 Test Case Document
```

Test Case Document 的消费路径:
- Implement 阶段:Implement 执行者获取 Test Case Document 作为自测参考。Test Case Document 不阻塞 Contract Review Gate,但必须在 Implement 激活前可用。
- Review 阶段:Review 执行者参考 Test Case Document 辅助评审,不代表全部审计项。
- Regression 阶段:回归测试引用 Test Case Document 中的用例,确保覆盖关键验收路径。

完成门禁:Test Case Authoring 完成不阻塞 Contract Review Gate。Test Case Document 必须在 Implement 阶段激活前可用;若 Test Case Authoring 尚未完成,Pipeline Orchestrator 将 Implement 置为 blocked 直到 Test Case Document 就绪。

### 6.8 场景:跨阶段主动澄清闭环

FR-11 在 Spec、Contract、Implement 三个阶段复用同一套澄清子流程。Clarification Coordinator 在阶段入口和关键提交点执行规则扫描,发现模糊信号后生成 Clarification Record,并推动回复、回写和沉淀。

```
[阶段激活]
  │
  ▼
Clarification Coordinator 扫描模糊信号
  │
  ├── 无模糊 → 当前阶段继续执行
  │
  └── 发现模糊 → 创建 Clarification Record
          │
          ├── blocking → Stage State Machine: active → blocked
          │
          └── non-blocking → 保持 active,记录 assumedDefault
          │
          ▼
      路由澄清对象并获取回复
          │
          ▼
      回写工件(Spec / Contract / Task / ADR)
          │
          ▼
      Clarification Record: open → resolved → settled
          │
          ├── 原 blocked 阶段:blocked → active
          └── 原 active 阶段:继续执行直至 passed / failed
```

分阶段收敛规则:
- Spec:检测验收标准缺失、边界未定义、术语未解释、依赖未声明。收敛后直接回写 Spec Package;澄清类型按 6 类映射沉淀:correction → fact,decision → adr-candidate(Spec 阶段产出候选,待 Contract 阶段确认后升级为正式 ADR),boundary → constraint,methodology → methodology,experience → experience,meta → meta。
- Contract:检测接口契约不完整、数据流不明、性能约束缺失、模块职责重叠,以及 Spec / Contract 矛盾。技术模糊在 Contract 内部消解并沉淀到 Contract Package / ADR(技术决策类澄清收敛后直接写入正式 ADR,含替代方案和取舍理由);需求模糊回传 Spec 来源方,避免架构阶段单方面假设。
- Implement:检测 Task 描述缺口、Spec / Contract 矛盾、未覆盖场景。blocking 类澄清必须等待回复后再继续;non-blocking 类允许带默认假设推进,但结论必须回写 Task 描述或上游工件,不能只留在执行日志。

阶段状态机中的澄清转换:
- `active → blocked`:发现 blocking 类澄清,当前阶段暂停等待收敛。
- `active → active`:发现 non-blocking 类澄清,继续执行但挂有 open Clarification Record。
- `blocked → active`:所有 blocking 澄清已 settled(`clarificationSummary.blockingOpen = 0`),阻断解除。
- `active → passed`:所有 blocking 澄清已 settled,且所有 non-blocking 澄清已 settled,且阶段本身验收通过。Ledger 收口要求全部澄清 settled。
- `active / blocked` 上的澄清记录按 `open → resolved → settled` 演进;只有 settled 后,对应澄清才算进入证据链闭环。

多条澄清并发规则:
- 同一阶段可同时存在多条 Clarification Record,状态各自独立演进。
- 阶段的 `blocked` 状态由 `clarificationSummary.blockingOpen > 0` 驱动;任意一条 blocking 澄清仍为 open,阶段就保持 blocked。
- 收到单条 blocking 澄清回复时,更新该条记录状态并重新计算 `blockingOpen`;仅当 `blockingOpen = 0` 时才触发 `blocked → active`。

non-blocking 收口硬规则:
- non-blocking 澄清不阻止阶段执行,但禁止阶段提交为 passed。
- 阶段完成执行后,若仍有 non-blocking 澄清未 settled,阶段进入等待状态(保持 active)直到全部 settled。
- Ledger Engine 拒绝收口任何包含未 settled 澄清的阶段记录。

旧 attempt 隔离规则:
- ClarificationRecord 通过 `stageAttempt` 字段绑定到特定执行尝试。
- 阶段重试时(attempt +1),旧 attempt 的 open 澄清不会自动继承到新 attempt。
- Clarification Coordinator 在新 attempt 启动时扫描旧记录,逐条决策:复用(引用旧记录的 resolution)、关闭(标记为已过期)、重开(创建新记录并关联旧 ID)。
- 旧 attempt 的回复不能直接解锁新 attempt 的 blocked 状态;只有新 attempt 自己的 ClarificationRecord 才能驱动新 attempt 的状态转换。

阶段失败时的澄清处理:
- 阶段因非澄清原因进入 `failed` 时,关联的 open 澄清保持 open 状态,绑定在原 attempt。
- 这些澄清不会自动关闭,以保留回复后的收敛价值。
- 阶段重试时由 Coordinator 统一决策处理(见上方隔离规则)。

工件回写事务规则:
1. 先完成主工件回写(Spec / Contract / Task / ADR)。
2. 再写知识沉淀(fact / methodology / experience / meta)。
3. 两者都成功后,ClarificationRecord 才能从 `resolved → settled`。
4. 任一步失败,记录保留 `resolved` 状态,禁止标记为 `settled`,等待重试或人工介入。

上游澄清引发的下游失效:
- 当 `resolutionSinks` 命中上游工件(如 Spec 被澄清更新)时,受影响的下游 StageRecord 自动进入 `blocked` 或 `failed`。
- Pipeline Orchestrator 在下游阶段的 `blockers` 字段记录 `invalidatedBy: <clarificationId>`。
- 下游阶段重试时必须基于更新后的上游工件重新执行。

最小结构定义(初期极简):

```json
{
  "clarification_id": "CLR-spec-001",
  "stage_id": "spec",
  "type": "boundary",
  "blocking_level": "blocking",
  "question": "登录失败后的重试上限是否属于本轮范围?",
  "impact_scope": ["FR-03", "AC-4.12"],
  "response": "本轮只覆盖账号密码登录,不包含限流策略。",
  "resolution": "将限流策略明确排除出 Wave 1 范围,并在 Spec 的边界章节写明。",
  "resolution_sinks": ["spec", "constraint"],
  "status": "settled"
}
```

存储位置:`{project}/artifacts/{stage}/clarifications/` 目录,由宿主适配层决定具体文件命名;对应的回写工件仍保留在原阶段目录中。

### 6.9 场景:Pipeline Create(FR-12 六步流程)

用户提交任务后,PipelineCreateSkill 触发 Pipeline Engine 的 Instance Manager 执行 6 步创建流程:

```
用户 -> PipelineCreateSkill: 提交任务(任务描述 + project-slug)

PipelineCreateSkill -> Instance Manager: create(task, projectSlug)

  [Step 1] Instance Manager -> Project Manager: validateSlug(projectSlug)
           Project Manager -> Instance Manager: 校验通过(命名规范、字符合法性)

  [Step 2] Instance Manager -> Persistence Store: queryActiveInstances(projectSlug)
           Persistence Store -> Instance Manager: 无 active Instance(若已有 active 则拒绝创建)

  [Step 3] Instance Manager -> Instance Manager: generateInstanceId()
           // 格式:pi-<project-slug>-<yyyyMMdd>-<seq>
           // 扫描已有 Instance 确定当日 seq

  [Step 4] Instance Manager -> Router: route(task)
           Router -> Rule Matcher: 匹配触发规则
           Rule Matcher -> Level Classifier: 判定 L0/L1/L2+
           Level Classifier -> Stage Planner: 输出必经阶段和跳过理由
           Router -> Instance Manager: RoutingResult

  [Step 5] Instance Manager -> Project Manager: ensureLayout(projectSlug)
           Project Manager -> Artifact Store: 检查目录结构
           Artifact Store -> Project Manager: 缺失目录列表
           Project Manager -> Artifact Store: 初始化/补全六分区目录
           // docs/ | src/ | tests/ | skill/ | reports/ | artifacts/
           // 已有目录不覆盖,只补全缺失的子目录

  [Step 6] Instance Manager -> Persistence Store: savePipelineInstance(instance)
           // status = 'created',写入 pipelines/{instanceId}/instance.json
           Instance Manager -> Pipeline Engine: 返回 PipelineInstance

Pipeline Engine -> Pipeline Engine: instance.status = 'active',激活第一个阶段
```

组件归属:

| 步骤 | 责任组件 | 说明 |
|------|----------|------|
| Step 1 校验 project-slug | Project Manager | 命名规范:小写字母 + 连字符,禁止特殊字符 |
| Step 2 检查并行约束 | Instance Manager | 同一 Project 同一时刻只允许一个 active Instance |
| Step 3 生成 instance-id | Instance Manager | 三元组 (slug + date + seq) 保证全局唯一 |
| Step 4 路由判定 | Router (全部子模块) | 产出 RoutingResult,写入 Instance 记录 |
| Step 5 目录初始化 | Project Manager + HostAdapter | 六分区目录补全,不覆盖已有内容 |
| Step 6 持久化 Instance | Persistence Store | 状态 created,等待 Pipeline Engine 激活 |

并行规则强制:
- 同一 Project 已有 active/paused Instance 时,Step 2 拒绝创建并返回明确错误信息。
- 不同 Project 的 Instance 完全独立,可并行运行。
- Instance 状态流转:created → active(第一个阶段开始执行)→ paused(用户挂起)/ completed(Ledger 通过)/ failed(不可恢复失败)。paused → active(恢复执行)。

### 6.10 场景:项目总览仪表盘加载(UFR-01)

```
Browser -> ProjectDashboardPage: 打开首页
ProjectDashboardPage -> Query API: GET /api/projects?q=&health=
Query API -> Projection Assembler: loadProjectOverviewViews(filter)
Projection Assembler -> View Store: 读取 ProjectOverviewView[]
Projection Assembler -> Health Calculator: 校验过期 HealthSnapshot 并按阈值重算
Health Calculator -> Engine Read Adapter: 读取 PipelineInstance / StageRecord
Engine Read Adapter -> Health Calculator: 当前状态与最近更新时间
Health Calculator -> View Store: 更新 HealthSnapshot / ProjectOverviewView
Projection Assembler -> Query API: 项目卡片列表 + 待办角标 + 最近更新时间
Query API -> ProjectDashboardPage: 200 JSON
ProjectDashboardPage -> Event Stream API: 订阅 /api/events/projects
Event Stream API -> ProjectDashboardPage: project.updated / todo.count.changed / health.changed
```

实现要点:
- 首页查询只返回卡片级聚合字段,不携带 FR 详情明细,控制首屏体积。
- 健康度计算使用最差 FR 继承规则,对应 UFR-01 的项目级健康度定义。
- 首页完成首屏渲染后再建立事件订阅,避免 SSE 连接阻塞初次加载。

### 6.11 场景:FR 详情页查看(UFR-02/UFR-05/UFR-06)

```
Browser -> FrDetailPage: 打开 /frs/{frId}
FrDetailPage -> Query API: GET /api/frs/{frId}
Query API -> Detail Assembler: assembleFrDetail(frId)
Detail Assembler -> Engine Read Adapter: 读取 RoutingResult、StageRecord、GateVerdict
Detail Assembler -> Artifact Registry Adapter: 读取 ArtifactRef 分组
Detail Assembler -> Quality Adapter: 读取 Review / Regression / Verification Bundle
Detail Assembler -> Detail Assembler: 组装 stageTimeline、qualitySummary、artifactGroups
Detail Assembler -> Query API: FrDetailView
Query API -> FrDetailPage: 200 JSON
FrDetailPage -> Preview API: 请求评审报告或 Markdown 工件预览(按需)
Preview API -> FrDetailPage: HTML / JSON 预览内容
```

实现要点:
- 阶段时间线与质量摘要来自同一次装配,避免 UFR-02 和 UFR-05 状态不一致。
- 工件列表按阶段分组,直接服务 UFR-06,不要求用户记底层路径。
- 若某阶段尚未产出质量工件,返回占位状态 `not-ready`,前端显示“待生成”,不伪造绿色状态。

### 6.12 场景:澄清回复交互(UFR-03/UFR-11)

```
Browser -> TodoInboxPage: 点击澄清待办
TodoInboxPage -> Query API: GET /api/clarifications/{id}
Query API -> Clarification Adapter: 读取 ClarificationRecord + 来源工件片段
Clarification Adapter -> TodoInboxPage: question + context + suggestedOptions
Browser -> ClarificationReplyPanel: 输入回复并提交
ClarificationReplyPanel -> Command API: POST /api/clarifications/{id}/reply
Command API -> AuthZ Guard: 校验 operator 权限 + requestId
Command API -> Command Adapter: submitClarificationReply()
Command Adapter -> Clarification Coordinator: resolve(clarificationId, response)
Clarification Coordinator -> Clarification Coordinator: applyResolution()
Clarification Coordinator -> Pipeline Engine: 如为 blocking 澄清则恢复原阶段
Pipeline Engine -> Event Stream API: 发布 clarification.resolved / fr.updated
Command API -> ClarificationReplyPanel: 202 accepted + resolutionStatus=pending-apply 或 settled
Event Stream API -> TodoInboxPage: 待办状态切换为已回复/已收敛
```

实现要点:
- 回复命令是异步提交,HTTP 返回只确认命令已被接收,最终状态靠事件流回推。
- `applyResolution()` 必须把收敛结论写回目标工件或状态记录,否则待办不能从 open 变为 settled。
- 同一澄清回复命令要求 `requestId` 幂等,防止用户重复点击造成双写。

### 6.13 场景:健康度计算与展示(UFR-01/UFR-05/UFR-07)

```
Stage Event / Gate Event / Timeout Tick -> Health Calculator: 接收状态变化
Health Calculator -> Rule Set: 计算 FR 健康度
Rule Set -> Health Calculator: green / yellow / red + reasons[]
Health Calculator -> Project Aggregator: 汇总项目最差 FR 状态
Project Aggregator -> View Store: 写入 HealthSnapshot(Project / FR)
View Store -> Event Stream API: 发布 health.changed
Browser -> Query API: GET /api/projects 或 GET /api/frs/{frId}/quality
Query API -> View Store: 读取最新 HealthSnapshot + QualitySummaryView
Query API -> Browser: 返回颜色状态、理由、更新时间
```

健康度规则落地:
- FR 级: `failed` 且未恢复 = red; `clarification-blocked`、门禁待裁定、普通 `blocked` 超过阈值 = yellow; 其余 active/passed = green。
- Project 级: 取该项目全部 FR 健康度中的最差值,与 UFR-01 定义保持一致。
- 告警中心消费同一套 HealthSnapshot 和事件流,避免 Web 提示和 IM 推送口径不一致。

### 6.14 场景:Review Fix Loop 自动闭环(FR-06a)

触发条件:Review 或 Contract Review Gate 产出评审包且结论为 conditional/rejected。

```
Gate Engine -> Review Fix Loop: GateVerdict(conditional), ReviewBundle[]
Review Fix Loop(Issue Extractor) -> Review Fix Loop: 解析 ReviewBundle,生成 ReviewIssue[]
Review Fix Loop(Fix Task Generator) -> Task Queue: 创建 FixTask[](P0 优先于 P1)

Pipeline Orchestrator -> [Fix Executor]: 派发 FixTask
[Fix Executor] -> Pipeline Orchestrator: 修复完成,产出修复工件
Pipeline Orchestrator -> Artifact Registry: 注册修复工件

Review Fix Loop(Revalidation Trigger) -> [Original Reviewer]: 触发定向复验
[Original Reviewer] -> Review Fix Loop: RevalidationResult

alt 复验通过:
  Review Fix Loop(Loop Controller) -> ReviewIssue: status → closed
alt 复验不通过:
  Review Fix Loop(Loop Controller) -> ReviewIssue: status → open, attempt+1
  Review Fix Loop(Loop Controller) -> Fix Task Generator: 重新生成 FixTask
alt 超过最大轮次:
  Review Fix Loop(Loop Controller) -> 用户: 升级为人工介入

Review Fix Loop(Gate Re-evaluator) -> Gate Engine: 所有 P0 关闭 + P1 关闭/豁免
Gate Engine -> Pipeline Engine: GateVerdict(passed)
Pipeline Engine -> Pipeline Engine: 继续下一阶段
```

### 6.15 场景:Publish Generalization Gate(FR-08a)

触发条件:Pipeline 进入 Deploy 阶段前,Trigger Detector 检测到项目存在 `publishTarget` 配置。

```
Pipeline Engine(Stage Planner) -> Publish Generalization Gate(Trigger Detector): 检测 publishTarget
Trigger Detector -> Trigger Detector: publishTarget 存在,激活门禁

Publish Generalization Gate(Clarification Requester) -> Clarification Coordinator: open(finding: "是否执行商用化/通用化处理?")
Clarification Coordinator -> 用户: dispatch 澄清问题
Stage State Machine -> Stage State Machine: 阶段状态 active → clarification-blocked

alt 用户确认执行:
  用户 -> Clarification Coordinator: resolve(response: "确认执行")
  Clarification Coordinator -> Stage State Machine: resumeStage → active
  Publish Generalization Gate(Check Executor) -> Check Executor: 顺序执行 6 项检查
  alt 全部通过:
    Check Executor -> Pipeline Engine: Gate Result(passed)
    Pipeline Engine -> [Deploy 执行者]: 激活 Deploy 阶段
  alt 任一不通过:
    Check Executor -> Pipeline Engine: Gate Result(blocked, failedItems[])
    Pipeline Engine -> 用户: 阻断通知,列出具体失败项

alt 用户选择跳过:
  用户 -> Clarification Coordinator: resolve(response: "跳过")
  Clarification Coordinator -> Stage State Machine: resumeStage → active
  Publish Generalization Gate(Skip Recorder) -> Ledger Engine: 写入审计记录("用户主动跳过通用化门禁")
  Pipeline Engine -> [Deploy 执行者]: 激活 Deploy 阶段
```

---

## 7. 部署视图

### 7.1 Wave 1 部署拓扑

Wave 1 运行在单机宿主环境内,无独立服务进程,无外部数据库。

**包边界**：SEVO 在 npm 上以双包形式发布。

- `sevo-pipeline`：CLI + 引擎 + 流水线编排 + ledger。面向所有陌生用户的最小安装入口：`npm install -g sevo-pipeline` 即可走通 `init → project create → fr add → advance → ledger` 闭环，**不依赖 Web 包**。
- `sevo-web`：驾驶舱观察面/操作面。面向需要可视化项目总览 / 实时状态 / 审批交互的用户：`npm install -g sevo-pipeline && npm install -g sevo-web && sevo-web start --workspace <path>`。`sevo-web` 不重复实现任何引擎语义，只读取主包产出的状态/事件/帐本。

CLI 用户路径是 SEVO 默认交付路径，Web 是可选增强。`sevo init` 检测到项目声明 Web 入口时主动提示安装 `sevo-web`。

```
┌─────────────────────────────────────────────┐
│  宿主环境(如 OpenClaw VM)                    │
│                                             │
│  ┌──────────────┐   ┌──────────────────┐    │
│  │ 主会话/调度器  │──▶│ SEVO Core Library │    │
│  └──────────────┘   │  ├─ Router        │    │
│                     │  ├─ Pipeline Eng.  │    │
│  ┌──────────────┐   │  ├─ Gate Engine    │    │
│  │ Agent 执行器  │◀──│  └─ Ledger Engine │    │
│  │ (ACP/subagent)│   └──────────────────┘    │
│  └──────────────┘                            │
│         │                                    │
│         ▼                                    │
│  ┌──────────────────────────────────────┐    │
│  │ 文件系统(Artifact Store)             │    │
│  │  ├─ projects/{slug}/                 │    │
│  │  │   ├─ docs/                        │    │
│  │  │   ├─ src/                         │    │
│  │  │   ├─ tests/                       │    │
│  │  │   ├─ skill/                       │    │
│  │  │   ├─ reports/                     │    │
│  │  │   └─ artifacts/                   │    │
│  │  ├─ pipelines/{instanceId}/          │    │
│  │  │   ├─ instance.json                │    │
│  │  │   ├─ state.json                   │    │
│  │  │   ├─ stages/                      │    │
│  │  │   ├─ artifacts/                   │    │
│  │  │   └─ events.jsonl                 │    │
│  │  └─ ledger/                          │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 7.2 部署约束

| 约束 | 说明 |
|------|------|
| 零外部依赖 | Wave 1 不引入数据库、消息队列或独立服务进程 |
| 文件系统即存储 | 所有状态和工件以 JSON + Markdown 文件形式落盘 |
| 宿主调度器驱动 | SEVO 不自带任务调度,由宿主的 Agent 调度机制驱动阶段推进 |
| 单机单实例 | Wave 1 不考虑多实例并发写同一条流水线 |

### 7.3 Git Worktree 隔离

宿主环境支持 git worktree 时,Implement 阶段在独立 worktree 中执行,主分支不受影响。

```
主工作区(main branch)
  │
  ├── worktree/wp-01/  ← Work Package 01 的独立 worktree
  │     └── 独立分支 sevo/wp-01
  ├── worktree/wp-02/  ← Work Package 02 的独立 worktree
  │     └── 独立分支 sevo/wp-02
  └── ...
```

技术方案:

| 环节 | 行为 |
|------|------|
| 创建 | Contract Review Gate 通过后,Pipeline Engine 为每个 Work Package 创建独立 worktree 和分支 |
| 执行 | Implement 执行者在 worktree 内执行 Task,测试在 worktree 内运行,不影响主工作区 |
| 合并 | Review + Regression 通过后,Deploy 阶段将 worktree 分支合并回主分支 |
| 回滚 | 任何阶段失败时可直接丢弃 worktree,主分支不受污染 |
| 并行 | 多个 Work Package 的 worktree 互相隔离,支持并行开发 |

宿主适配层负责检测 git worktree 可用性。不支持 worktree 的宿主环境退化为在主工作区直接执行,Pipeline Engine 的阶段语义不变。

### 7.4 Verify 清洁环境执行方案

Verify 阶段要求在独立、清洁或最小依赖环境中验证,不能依赖开发现场残留。

Wave 1 执行路径:

| 环节 | 行为 |
|------|------|
| 环境准备 | 在同机创建临时目录(`/tmp/sevo-verify-{pipelineId}/`),从 Release Artifact 重建环境 |
| 依赖安装 | 仅安装 Release Artifact 声明的依赖,禁止复用开发工作区的 node_modules 或缓存 |
| 执行验证 | Review 执行者在临时目录内执行核心用户路径测试和关键 NFR 检查 |
| 产品审查 | Spec 执行者确认核心用户路径和交付可用性达标 |
| 清理 | 验证完成后删除临时目录,保留 Verification Bundle |

Verify Adapter 接口:

```typescript
interface VerifyAdapter {
  prepareCleanEnv(releaseArtifact: ArtifactRef): EnvHandle;
  runVerification(env: EnvHandle, testSuite: ArtifactRef): VerificationResult;
  cleanup(env: EnvHandle): void;
}
```

隔离边界:Verify 环境与 Implement 环境完全隔离。Verify 不能读取开发 worktree、不能复用开发环境缓存、不能访问未发布的代码。如果 Verify 退化为"在开发目录再跑一次测试",post-execute hook 会检测并阻断。

### 7.5 Wave 2+ 演进方向

- 引入独立进程或轻量服务,支持长流程编排脱离主会话。
- Artifact Store 可替换为对象存储或数据库适配。
- 支持多宿主通过 API 接入同一 SEVO 实例。

---

## 8. 横切关注点

### 8.1 错误处理

| 层级 | 策略 |
|------|------|
| 阶段执行失败 | 阶段状态置为 failed,记录失败原因和缺失工件,支持修复后从 failed → active 续跑 |
| 门禁阻断 | 阻断问题逐条记录到 Review Bundle,标注责任工件和修复项,复审仅针对阻断项 |
| 工件校验失败 | Artifact Registry 在阶段入口校验必需工件,缺失时阻断并输出缺失清单 |
| 路由异常 | 规则无法匹配时默认 Level 1(保守路由),记录异常原因供人工复核 |

错误恢复原则:任何阶段失败都支持修复续跑,不要求整条流水线从头重跑。失败上下文(失败原因、已完成工件、阻断点)持久化到 Stage Record,修复者可直接读取。

#### 8.1.1 Web 层错误处理策略

| 场景 | HTTP 状态 | 返回字段 | 前端行为 |
|------|-----------|----------|---------|
| 参数错误/筛选条件非法 | `400` | `code`、`message`、`fieldErrors[]`、`traceId` | 表单内联提示,不弹全局异常 |
| 未登录或会话失效 | `401` | `code=UNAUTHENTICATED`、`loginUrl`、`traceId` | 跳转登录或刷新会话 |
| 已登录但无权限 | `403` | `code=FORBIDDEN`、`requiredPermission`、`traceId` | 隐藏高风险动作,保留只读视图 |
| 资源不存在 | `404` | `code=NOT_FOUND`、`resourceType`、`resourceId`、`traceId` | 页面显示空态和返回入口 |
| 状态冲突(重复审批/版本过期) | `409` | `code=VERSION_CONFLICT`、`currentVersion`、`traceId` | 刷新当前 FR 详情,重新确认后再提交 |
| 命令已接收但异步处理中 | `202` | `code=ACCEPTED`、`requestId`、`traceId` | 前端进入 pending 状态,等待事件流更新 |
| 引擎暂时不可用 | `503` | `code=ENGINE_UNAVAILABLE`、`retryAfter`、`traceId` | 显示可重试提示,查询接口允许退回最近快照 |

统一错误包结构:

```json
{
  "code": "VERSION_CONFLICT",
  "message": "Gate verdict changed after page load",
  "details": {
    "resourceId": "gate-sevo-fr-001",
    "currentVersion": 12
  },
  "traceId": "trc_01HT...",
  "retryable": true
}
```

### 8.2 日志与可观测性

| 日志类型 | 内容 | 存储位置 |
|---------|------|----------|
| 阶段事件日志 | 状态变迁、工件注册、门禁结论 | `pipelines/{id}/events.jsonl` |
| 路由决策日志 | 匹配规则、级别判定、跳过理由 | `pipelines/{id}/routing.json` |
| 审计追踪 | 评审维度分配、评审结论、复审记录 | 各阶段 Review Bundle 内 |

日志格式统一为 JSON Lines,每条包含 `timestamp`、`pipeline_id`、`stage`、`event_type`、`payload`。

Wave 1 不引入集中式日志系统,文件系统日志足够支撑单机排查。Wave 2 可接入结构化日志查询。

### 8.3 配置管理

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 触发规则集 | 路由匹配的 7 条触发条件 | 内置默认规则,支持宿主覆盖 |
| 阶段定义 | 8 阶段 + 2 门禁的名称、顺序、并行关系 | 内置默认定义 |
| 门禁规则 | 每道门禁的检查项、评审维度、放行条件 | 内置默认规则 |
| 工件 Schema | 每类工件的最小字段集 | 内置 JSON Schema |
| 阶段职责矩阵 | 每个阶段的执行权限和审查维度 | 内置默认矩阵 |

配置分层:SEVO Core 内置默认配置 → 宿主适配层可覆盖 → 单条流水线可局部覆盖。

配置格式:JSON 文件,存储在 SEVO 安装目录或宿主指定路径。

### 8.4 文件系统并发约束

Wave 1 假设单机单实例,但多 Agent 并行场景(如 Contract ∥ Test Case Authoring)仍可能并发写同一目录。约束如下:

| 约束 | 说明 |
|------|------|
| 单写者状态文件 | `state.json` 等流水线状态文件仅由 Pipeline Engine 写入,禁止阶段执行者直接修改 |
| 工件路径隔离 | 每个阶段的工件写入独立子目录(`artifacts/{stage}/`),不同阶段不写同一文件 |
| 写入幂等 | 工件写入采用"先写临时文件,再原子重命名"模式(write-tmp + rename),避免半写状态 |
| 账本追加写 | Ledger 文件仅支持 append,不支持修改已有条目,避免并发覆盖 |
| 事件日志串行化 | `events.jsonl` 采用 append-only 写入,单条事件原子追加(利用 `O_APPEND` 语义) |

Wave 2 引入文件锁或迁移到数据库后,以上约束可放宽。

### 8.4A 前后端通信协议

| 主题 | 约束 |
|------|------|
| 查询协议 | `HTTPS + JSON`。列表接口支持分页、筛选、排序,时间字段统一 ISO 8601 |
| 命令协议 | `HTTPS + JSON`。所有命令请求头携带 `X-Request-Id`,请求体携带 `expectedVersion` |
| 事件协议 | `text/event-stream`。事件载荷统一包含 `eventType`、`targetType`、`targetId`、`occurredAt`、`traceId` |
| 工件预览 | Markdown 报告经 Preview API 渲染为受控 HTML,二进制工件返回签名下载链接 |
| 契约稳定性 | 前端消费 View Model 版本字段 `viewVersion`,后端新增字段向后兼容,禁止静默改名 |

通信设计原则:
- 查询接口返回聚合后的 View Model,命令接口返回最小确认结果,避免把引擎内部对象暴露为前端契约。
- 审批、暂停/恢复/取消、澄清回复都走显式命令端点,不复用查询接口做隐式副作用。
- Preview API 与 Query API 分离,防止大文档预览拖慢首页和详情页主请求。

### 8.4B 实时更新策略

Wave 1 采用 SSE 作为默认实时通道,Polling 作为降级方案,WebSocket 暂不启用。

| 方案 | 适用性 | 结论 |
|------|--------|------|
| SSE | 单向推送,实现简单,天然适配状态更新、待办变化、告警通知 | Wave 1 默认 |
| Polling | 基础设施要求最低,适合作为降级和断线补偿 | 备用 |
| WebSocket | 适合双向协作和高频交互,但当前用户侧命令量低、复杂度高 | Wave 2+ 再评估 |

事件主题:
- `project.updated`: 项目卡片、FR 计数、健康度发生变化
- `fr.updated`: FR 当前阶段、门禁状态、质量摘要变化
- `todo.updated`: 待办创建、关闭、已回复、等待裁定
- `notification.created`: 新异常告警
- `health.changed`: FR 或项目健康度变更

降级规则:
- SSE 连接失败后前端退回 30 秒轮询首页/详情核心查询接口。
- 连续 3 次轮询失败后显示只读降级提示,保留最近一次成功快照。
- 命令执行结果始终以同步 HTTP 应答 + 事件确认双轨校验,不依赖单一通道。

### 8.5 安全

| 关注点 | 措施 |
|--------|------|
| 审计-开发分离 | 阶段职责矩阵强制约束:Review、Verify 阶段的执行者不能与 Implement 阶段相同 |
| 门禁不可绕过 | Pipeline Engine 在阶段流转时强制检查门禁结论,无门禁通过记录则阻断 |
| 工件完整性 | Artifact Registry 校验工件存在性和最小字段集,缺失即阻断 |
| 账本不可篡改 | Ledger Entry 生成后追加写入,不支持修改已有条目(Wave 1 靠文件权限,Wave 2 可引入签名) |

#### 8.5.1 Web 认证与权限

认证和授权由 Web API / BFF 统一收口,前端不直接持有引擎写权限。

| 角色 | 读取权限 | 命令权限 |
|------|----------|----------|
| `viewer` | 项目总览、FR 详情、质量摘要、工件预览、告警列表 | 无 |
| `operator` | `viewer` 全部权限 | 澄清回复、门禁审批、暂停/恢复/取消 FR、标记通知已读 |
| `system` | 事件流、投影重建、通知投递 | 不经人工页面触发的系统内命令 |

授权规则:
- 每个命令都必须带 `actorId` 并写入 Ledger 或审计日志,满足 UFR-04/UFR-08 的可追溯要求。
- 门禁审批和 FR 生命周期操作要求 `operator` 权限,并校验目标 Project 作用域。
- 预览接口沿用只读权限,禁止通过工件预览下载拿到未授权项目的内部资料。
- 长连接事件流在握手时完成鉴权,连接存活期间若会话失效,服务端主动断开并要求重新登录。

### 8.6 执行治理层(Execution Governance)

SEVO 的 Execute 阶段(Implement、Review、Regression)内建一套执行治理机制,确保 Agent 在执行期间的行为受控、可审计、不漂移。这套机制是 SEVO 核心能力,不是可选插件。

#### 8.6.1 Hooks 协议(执行前检查 + 执行后验证)

Pipeline Engine 在每个 Task 执行前后触发 hook,实现机械式质量控制:

```typescript
interface ExecutionHook {
  phase: 'pre-execute' | 'post-execute';
  evaluate(context: TaskExecutionContext): HookResult;
}

interface HookResult {
  proceed: boolean;          // false 则阻断执行
  reason?: string;           // 阻断原因
  evidence?: ArtifactRef[];  // 验证证据
}
```

pre-execute hook 检查前置条件(工件就绪、环境就绪、权限合规),post-execute hook 验证产出(测试通过、工件完整、无越界改动)。Hook 结论为 false 时,Task 状态保持 active 或置为 blocked,禁止推进。

典型 pre-execute hook:
- 检查 TDD 红灯测试是否已编写(Implement 阶段)
- 检查 Review 阶段执行者与 Implement 阶段执行者是否分离(Review 阶段)
- 检查前置工件是否存在且 schema 合规

典型 post-execute hook:
- 校验测试执行结果是否存在(禁止"声称通过但未跑测试")
- 校验代码变更是否在允许范围内(文件路径白名单)
- 校验工件最小字段集是否齐全

#### 8.6.2 Session Guards(Agent 会话边界控制)

Pipeline Engine 在派发 Agent 执行时,通过 Session Guard 根据当前流程阶段控制 Agent 的权限边界:

```typescript
interface SessionGuard {
  stageId: StageId;
  permissions: {
    canWrite: boolean;       // 是否允许写文件
    canExecute: boolean;     // 是否允许执行命令
    scopePaths: string[];    // 允许操作的文件路径范围
  };
}
```

阶段权限矩阵:
- implement:canWrite=true,canExecute=true,scopePaths 限制为当前 Work Package 的 target_files
- review:canWrite=false,canExecute=true(仅读 + 测试执行),scopePaths 为全仓库只读
- verify:canWrite=false,canExecute=true,scopePaths 为清洁环境

Session Guard 的强制方式取决于宿主能力:支持 hook 拦截的宿主(如 OpenClaw)可在工具调用层机械式阻断越权操作;不支持 hook 的宿主通过 post-execute hook 事后校验。核心流程不因宿主能力差异而断裂。

#### 8.6.3 Context Enrichment(任务上下文注入)

Router 在产出 RoutingResult 后,Pipeline Engine 根据任务类型自动注入执行上下文:

```typescript
interface ContextEnrichment {
  taskType: string;                    // 任务类型标识
  pipelineStage: PipelineStage;        // 当前流程阶段
  injectedContext: {
    specs: ArtifactRef[];              // 相关规格引用
    contracts: ArtifactRef[];          // 相关契约引用
    testCases: ArtifactRef[];          // 相关测试用例
    domainRules: string[];             // 领域规则(来自 KIVO 或本地配置)
    historicalLessons: ArtifactRef[];  // 历史经验教训(来自 Ledger 回流)
    stageGuidelines: StageGuideline[]; // 阶段执行原则(根据 pipelineStage 自动匹配)
  };
}

type PipelineStage = 'spec' | 'contract' | 'implement' | 'review' | 'regression' | 'deploy' | 'verify';

interface StageGuideline {
  principle: string;                   // 原则名称
  description: string;                 // 原则内容
  enforcement: 'hard' | 'soft';        // hard=违反即阻断,soft=警告但不阻断
}
```

阶段执行原则注入规则:

| 流程阶段 | 自动注入的执行原则 |
|----------|--------------------|
| spec | 用户价值优先、需求完整度校验、概念-技术阶段隔离 |
| contract | 通用化判断标准、问题定义先行、结构设计四问、约束先于方案、最简可行架构、禁止绝对排斥宿主能力 |
| implement | 最小改动(Surgical Changes)、最简实现(Simplicity First)、目标驱动执行(Goal-Driven) |
| review / regression | 独立性(不做开发只做检查)、可验证结论(附证据)、不放过设计方向问题 |
| contract-review-gate | 各方按审查维度注入对应原则(产品视角、开发视角、质量视角) |

原则绑定的是流程阶段,不是 Agent 身份。无论用户派谁来执行,只要在该阶段工作,就自动获得对应原则。这些原则来源于经过验证的最佳实践(SDD 三阶段、wow-harness 执行治理、Karpathy Guidelines 等),由 SEVO 内建管理,不依赖人工逐个配置 Agent。

#### 8.6.4 与 SDD 工作流的对齐

SEVO 面向用户统一暴露 4 个宏阶段:`Specify / Plan / Implement / Review`。内核 11 个细阶段通过固定映射聚合,所有 Web 页面、通知中心、FR × 阶段矩阵、看板和统计口径都必须引用 `USER_MACRO_STAGE_MAP`,禁止各页面自行定义阶段口径。

| 用户可见宏阶段 | 内核细阶段 | SDD 对应 | 说明 |
|------------|----------|----------|------|
| Specify | `spec`、`spec-review-gate` | Specify | 需求定义和规格评审对用户合并展示为一个阶段 |
| Plan | `test-case-authoring`、`contract`、`contract-review-gate` | Plan | 测试用例编写属于实现前准备,与 Contract 同属规划期 |
| Implement | `implement` | Implement | 编码与任务执行阶段 |
| Review | `review`、`regression`、`deploy`、`verify`、`ledger` | Implement 之后的质量与交付收口 | 对用户统一展示为实现后的检查、发布、验证和留痕闭环 |

补充规则:
- `currentStage` 保留细阶段,服务审计追溯、调试和恢复续跑。
- `currentMacroStage` 与 `macroStageTimeline` 是所有页面的统一展示字段;首页、FR 详情、待办、通知和 `fr-matrix` 必须按同一映射聚合。
- Contract Review Gate 对齐 SDD 的 Phase 2→3 门禁:三方会审(产品 + 开发 + 质量)全部通过后才允许进入 Implement。

#### 8.6.5 宿主适配模式

执行治理层的核心接口(Hooks、Session Guards、Context Enrichment)由 SEVO 定义,宿主通过 Adapter 接入增强能力:

- OpenClaw 宿主:通过 wow-harness 的 PreToolUse/PostToolUse hook 实现机械式强制(100% 覆盖率)
- 其他宿主:通过 post-execute hook 事后校验实现等效治理

核心流程不因缺少某个宿主而断裂。宿主能力越强,治理粒度越细(从事后校验升级到实时守卫),但最低保障始终存在。

## 9. 架构决策

关键架构决策以 ADR(Architecture Decision Record)形式记录,独立文件存放在 `docs/architecture/decisions/` 目录。

| ADR | 标题 | 状态 |
|-----|------|------|
| ADR-001 | 文件系统作为 Wave 1 唯一存储层 | 已采纳 |
| ADR-002 | 阶段生命周期采用有限状态机 | 已采纳 |
| ADR-003 | 门禁采用声明式规则引擎 | 已采纳 |
| ADR-004 | 测试用例作为独立工件并行产出 | 已采纳 |
| ADR-005 | 路由策略:7 条触发规则采用 OR 逻辑,命中任一即触发 | 已采纳 |
| ADR-006 | Git worktree 作为 Implement 阶段隔离机制(宿主适配层实现) | 已采纳 |
| ADR-007 | TDD 强制执行放在 Pipeline Engine 层(而非 Review 层) | 已采纳 |
| ADR-008 | Core-Adapter 分层模式:核心定义语义,宿主提供执行 | 已采纳 |
| ADR-009 | Pipeline Instance 5 态生命周期模型(created/active/paused/completed/failed),与 Stage 7 态状态机分层管理 | 已采纳 |
| ADR-010 | 同一 Project 同一时刻只允许一个 active Pipeline Instance,避免工件冲突和状态混乱 | 已采纳 |
| ADR-011 | instance-id 采用 `pi-<slug>-<date>-<seq>` 格式,三元组保证全局唯一性且可读 | 已采纳 |
| ADR-012 | Project 标准六分区目录结构,创建时补全不覆盖 | 已采纳 |
| ADR-004-Web | Web 层 API 风格选择: REST 资源接口为主,GraphQL 只保留为只读聚合扩展点 | 已采纳 |
| ADR-005-Web | 实时更新方案选择: SSE 默认,Polling 降级,WebSocket 暂缓 | 已采纳 |
| ADR-006-Web | 前端框架选择: React + Next.js App Router 作为 Web 宿主 | 已采纳 |
| ADR-013 | Publish Generalization Gate 设计为可选阶段并复用 Clarification 机制 | 已采纳 |
| ADR-014 | Web 与引擎拆分为 `sevo-pipeline` + `sevo-web` 双包独立发版，引擎契约通过 peerDependencies 锚定 | 已采纳 |
| ADR-015 | role-matching 默认 warn-only，`strictRoleMatching: true` 才返回 error，适配陌生宿主开箱即用 | 已采纳 |
| ADR-016 | 路径默认值守则：源码默认值禁止字面量包含宿主特定绝对路径，允许 null/相对路径/__dirname 包内嵌资源 | 已采纳 |

详见各 ADR 文件。

### ADR-013: Publish Generalization Gate 设计决策

**状态**: 已采纳

**背景**: FR-08a 要求在 Deploy 前对面向公开发布的项目执行商用化/通用化质量检查。需要决定:(1) 该阶段是强制还是可选;(2) 用户交互采用何种机制。

**决策 1: 可选阶段而非强制**

理由:
- 并非所有项目都有公开发布需求,内部工具、实验项目无需通用化检查。
- 强制执行会给无发布目标的项目增加无意义的流程摩擦。
- 通过 `publishTarget` 配置作为触发条件,实现"有配置才检查"的精确激活,符合 SEVO 的"最小必要流程"原则。
- 即使有发布目标,用户仍可主动跳过(写入审计记录),保留人类最终决策权。

**决策 2: 复用 Clarification 而非新建独立交互机制**

理由:
- SEVO 已有成熟的 Clarification Coordinator 组件,支持 open → dispatch → resolve → resumeStage 全流程。
- 新建独立交互机制会引入重复的状态管理(阻断/恢复)、消息路由、超时处理逻辑。
- 复用 Clarification 使 Publish Generalization Gate 的用户交互与其他阶段的澄清体验一致,降低用户认知负担。
- Stage State Machine 的 `clarification-blocked` 状态天然适配"等待用户确认"场景,无需新增状态。

**后果**:
- 正面:零新增交互基础设施,开发成本低;用户体验一致;审计链路完整(Clarification Record + Ledger 双重记录)。
- 负面:Clarification Coordinator 的语义从"解决模糊"扩展到"征求确认",需在文档中明确这一语义扩展。

---

### ADR-014: Web 与引擎双包独立发版

**状态**：已采纳

**背景**：FR-36 要求 SEVO 受管项目 Web 端接真实数据通路。SEVO 自身 Web 指南 (`web/lib/engine-service.ts` 当前是 stub) 必须切换为读取引擎真实产出。需要决定 Web 是随 `sevo-pipeline` 主包发，还是拆分为独立包。

**决策**：Web 拆分为独立 npm 包 `sevo-web`，与 `sevo-pipeline` 通过 peerDependencies 声明引擎契约兼容版本。

**理由**：
- SEVO 核心价值在引擎层 (CLI + 状态机 + ledger)，Web 是观察面。arc42 §3.2.1/§5.2.6 明确"Web 层只持久化读模型"，同包发布反而模糊了这个边界。
- 同包发布会让节奏绡死：Web 改一个图标颜色要 bump 主包；CLI 改一个 evaluator 阈值要重打包 Web 静态资源。
- 同包发布会让体积爆炸：Next.js 构建产物（`.next/`、`web/.next/static/`）要么进 tarball、让 CLI 用户下载几十 MB 用不到的资源，要么要求独立构建产出与"单包"理念冲突。
- 部署语义不一致：CLI 用户 `npm install -g sevo-pipeline`，Web 用户需要 `next start ./node_modules/sevo-pipeline/web`，两条路径硬塞同一包名不合理。

**后果**：
- 正面：节奏解耦，CLI 用户零 Web 包袋，架构边界表达一致。
- 负面：双包版本协议需要显式管理。缓解：peerDependencies + 运行时契约版本校验。用户从“装一个包”变为“装两个包”，`sevo init` 主动提示。

**实现要点**：
- `sevo-pipeline@1.13.0+` 的 `package.json.files` 不包含 `web/`。
- `web/package.json` 独立为 `name="sevo-web"`，首发 `0.1.0`。
- `sevo-web` 启动读 `process.env.SEVO_WORKSPACE` 或 `--workspace <path>` 参数定位引擎产出目录。
- FR-36 校验对象从 SEVO 主包的 `web/` 转为 `sevo-web` 包。

---

### ADR-015: role-matching 自适应降级

**状态**：已采纳

**背景**：`sevo init` 在陌生宿主上生成的 roleAssignment 包含了 `dev-01/dev-02/cc` 这类 SEVO 维护者私有 agent ID，导致 `sevo doctor` 报 156 条 blocked dispatch，陌生用户开箱即用闭环判定 FAIL。

**决策**：role-matching 默认 warn-only。仅当用户显式配置 `strictRoleMatching: true` 时，blocked dispatch 才返回 error 并阻断。`sevo init` 不再硬编码 SEVO 维护者私有 agent ID，改为读取宿主实际注册 agent 并自动分类 + 兜底。

**理由**：
- “陌生用户开箱即用”是 SEVO 第一性原理，doctor 报红直接打断该路径。
- NFR-5.10 明确要求“支持不同类型 Agent 接入同一流程”，fail-fast 与这条 NFR 冲突。
- role-matching 是质量边界，只在多 agent 角色已分离的成熟环境里有意义；在单 agent / 零角色环境里强制 enforce 就是在造障碍。

**后果**：
- 正面：陌生环境 doctor 报 `Errors: 0`，pipeline 能进入 advance。
- 负面：OpenClaw 这种多 agent 环境默认不再严格 enforce 角色边界。缓解：成熟部署者设置 `strictRoleMatching: true` 取回严格模式，默认倒向不同用户人群可控。

---

### ADR-016: 路径默认值守则

**状态**：已采纳

**背景**：终审报告§2 点名 16 处绝对路径命中，其中 6 处 const-default 以 `/root/.openclaw/...` 字面量存在，虽然 env 覆盖逻辑存在但默认值本身是维护者私有路径。是否要求 zero-hardcoded 会造成配置爆炸。

**决策**：保留 ENV > OPTIONS > DEFAULT 三级覆盖模式，但默认值字面量禁止包含宿主特定绝对路径前缀。默认值仅允许 `null` / 相对路径 / `__dirname` 解析的包内嵌资源。

**理由**：
- 默认值在解决“99% 公共场景零配置启动”，不能丢（违反 FR-15 L0）。
- zero-hardcoded 会让默认值变必填项，忘记设 env 从“用了默认值跑了”变为“什么也没跑 throw”，运维错误模式恶化。
- 默认值可以是 sane default 但不一定是维护者私有路径。`null` + 运行时探测 / 相对工件根 / 包内嵌资源都能同时满足 sane default 和 不绑死宿主。

**后果**：
- 正面：源码从文本层面上不再“只在维护者宿主上跑”；后续审计可用“源码含 `/root/.openclaw/`”快速招违。
- 负面：6 处 const-default 需重构，部分需补充 cwd 探测逻辑。一次性工作，后续零增量。

---

## 10. 质量要求

### 10.1 质量树

```
质量
├── 可追溯性
│   ├── 工件链完整(任一交付可反向追溯到 Spec)
│   └── 账本可查询(按任务/时间/阶段/结论检索)
├── 可靠性
│   ├── 阶段失败可修复续跑
│   ├── 长流程状态持久化
│   └── 主会话中断不丢失进度
├── 性能
│   ├── 单阶段执行延迟可控
│   └── 全流水线端到端耗时可观测
├── 可扩展性
│   ├── 阶段/工件/门禁定义与运行时解耦
│   ├── 支持多宿主接入
│   └── 新规则可增量追加
└── 安全性
    ├── 审计-开发职责分离
    ├── 门禁不可绕过
    └── 高风险改动多阶段加厚检查
```

### 10.2 质量场景

| 编号 | 质量属性 | 场景 | 度量 |
|------|---------|------|------|
| QS-01 | 可追溯性 | 给定一个 Ledger Entry,能找到对应的 Spec、Contract、Review、Regression 全部工件引用 | 100% 工件引用可解析 |
| QS-02 | 可追溯性 | 跳过阶段的流水线,Ledger Entry 仍记录跳过理由和实际执行的阶段 | 跳过阶段有 skipped 记录和理由 |
| QS-03 | 可靠性 | Implement 阶段失败后,修复并重新提交,流水线从 Review 继续而非从头重跑 | 修复续跑成功,无需重建上下文 |
| QS-04 | 可靠性 | 主会话意外中断后重启,流水线状态从文件系统恢复,继续执行 | 状态恢复后阶段位置正确 |
| QS-05 | 可扩展性 | 新增一个自定义阶段(如 Security Scan),不修改 Pipeline Engine 核心代码 | 通过配置文件新增,核心代码零改动 |
| QS-06 | 可扩展性 | 更换宿主环境(从 OpenClaw 迁移到其他 ACP),SEVO 核心逻辑不变 | 仅替换 Adapter Layer |
| QS-07 | 安全性 | Implement 执行者尝试跳过 Review 直接进入 Regression,系统阻断并记录违规 | 阻断成功,事件日志有记录 |
| QS-08 | 安全性 | 同一 Agent 同时担任 Implement 和 Review 阶段执行者,系统拒绝 | 阶段职责矩阵校验失败,阻断 |
| QS-09 | 性能 | 单个阶段执行延迟不超过配置的超时阈值,超时后自动标记 failed 并记录耗时 | Wave 1 默认超时:Spec 30min、Contract 60min、Implement 60min/Task、Review 30min、Regression 30min、Deploy 15min、Verify 30min |
| QS-10 | 性能 | 完整 Level 2+ 流水线端到端耗时可观测,Ledger Entry 记录各阶段开始/结束时间戳 | Ledger Entry 含各阶段 duration,总耗时可计算 |

---

## 11. 风险与技术债务

### 11.1 风险

| 编号 | 风险 | 影响 | 缓解措施 |
|------|------|------|----------|
| R-01 | 文件系统并发写入冲突 | 多 Agent 同时写同一流水线状态文件导致数据损坏 | Wave 1 限制单机单实例;Wave 2 引入文件锁或迁移到数据库 |
| R-02 | 工件 Schema 频繁变更 | 早期迭代中工件结构不稳定,已有数据与新 Schema 不兼容 | 工件 Schema 包含版本号,Pipeline Engine 支持向前兼容读取 |
| R-03 | 门禁规则过严导致流程卡死 | 规则配置不当时合法任务被反复阻断 | 提供门禁规则 dry-run 模式;Level 0 快速通道绕过大部分门禁;单道门禁最大重试 3 次,超限后升级为用户裁定 |
| R-04 | 宿主调度器不可靠 | 宿主丢消息或超时导致阶段推进中断 | 阶段状态持久化,支持手动或定时扫描恢复中断的流水线 |
| R-05 | Test Case Authoring 成为 Implement 瓶颈 | TC 编写慢于 Contract,Implement 被 blocked 卡住 | TC 设置超时阈值(默认 45min);超时后允许 Implement 以"无 TC 参考"模式启动,TC 到位后补充 |
| R-06 | 门禁循环拒绝 | Gate 反复 reject → fix → reject,无终止条件 | 单道门禁最大重试 3 次,超限后升级为用户裁定,记录升级原因 |
| R-07 | Agent 能力与阶段要求不匹配 | 分配的 Agent 无法胜任当前阶段要求,产出低质量评审结论 | 阶段职责矩阵增加能力要求字段;Gate Engine 校验评审结论的最小质量标准(如结论必须指向具体工件) |

### 11.2 技术债务

| 编号 | 债务 | 产生原因 | 偿还计划 |
|------|------|---------|----------|
| TD-01 | 无文件锁机制 | Wave 1 简化设计,假设单实例运行 | Wave 2 引入文件锁或迁移存储层 |
| TD-02 | 门禁规则硬编码在配置文件中 | Wave 1 优先跑通闭环,规则引擎极简实现 | Wave 2 支持动态规则加载和条件表达式 |
| TD-03 | Ledger 无签名机制 | Wave 1 靠文件权限保证不可篡改 | Wave 3 引入内容哈希或数字签名 |
| TD-04 | 无集中式日志查询 | Wave 1 日志分散在各流水线目录 | Wave 2 引入日志聚合和结构化查询 |

---

## 12. 术语表

| 术语 | 定义 |
|------|------|
| Pipeline Instance | 一次完整的流水线执行实例,绑定到一个 Project,承载唯一 ID(`pi-<project-slug>-<yyyyMMdd>-<seq>`)、当前状态(5 态:created/active/paused/completed/failed)、所属阶段和全部工件引用 |
| Project | 独立交付单元,拥有标准六分区目录结构(docs/src/tests/skill/reports/artifacts/),是 Pipeline Instance 的归属容器 |
| Instance Manager | Pipeline Engine 子模块,负责创建 Pipeline Instance、管理 5 态生命周期、生成 instance-id、强制并行规则 |
| Project Manager | Pipeline Engine 子模块,负责管理 Project 标准目录结构的初始化和补全 |
| Pipeline Task | 一条进入 SEVO 的研发任务,承载目标、级别、范围和当前阶段 |
| Stage Record | 某个阶段的执行记录,包含输入、输出、状态、阻断原因和通过结论 |
| Spec Package | 需求规格工件集合,FR-01 的产出 |
| Spec Review Bundle | 需求规格门禁评审结果集合,FR-02 的产出 |
| Contract Package | 架构方案、实现边界、工作包规划工件集合,FR-03 的产出 |
| Contract Review Bundle | 三方会审结果集合,FR-04 的产出 |
| Work Package | 可派发、可验收、可追责的最小实现单元,内部拆分为 Task 列表 |
| Task | Work Package 内部的最小执行单元,原子可验证,建议 5-15 分钟,包含精确文件路径、预期变更描述和验证步骤 |
| Debugging Record | 系统化调试的产出工件,包含问题描述、根因分析、修复方案和验证结果 |
| Implementation Bundle | 某个工作包的实现结果集合,FR-05 的产出 |
| Review Bundle | 实现后独立评审与审计结论集合,FR-06 的产出 |
| Regression Bundle | 回归验证结果集合,FR-07 的产出 |
| Release Artifact | 发布制品及其版本元数据,FR-08 的产出 |
| Verification Bundle | 清洁环境验证结果集合,FR-09 的产出 |
| Ledger Entry | 交付账本记录,一次研发闭环的最终摘要对象,FR-10 的产出 |
| Test Case Document | 基于验收标准编写的测试用例文档,FR-02a 的产出 |
| Clarification Record | 澄清记录,记录模糊检测触发点、问题、阻断级别、回复内容、收敛结论和回写去向,挂接到对应阶段的 Stage Record,并纳入 Ledger 证据链 |
| Gate | 门禁,阶段间的质量检查点,通过/有条件通过/不通过三档结论 |
| Routing Result | 路由结果,包含任务级别、必经阶段、跳过阶段及理由 |
| Artifact Registry | 工件注册表,管理每个阶段的输入/输出工件引用 |
| Stage State Machine | 阶段状态机,管理 7 态生命周期(pending/active/blocked/clarification-blocked/passed/failed/skipped) |
| ADR | Architecture Decision Record,架构决策记录 |
| Wave | 交付波次,SEVO 按 Wave 1/2/3 渐进交付 |
| 宿主环境 | 运行 SEVO 的外部平台,提供 Agent 运行时、工具接入、消息调度等基础能力 |
| Adapter Layer | 宿主适配层,SEVO 核心与宿主环境之间的桥接层,宿主实现 HostAdapter 接口即可接入 |
| TDD Cycle | 测试驱动开发循环(Red-Green-Refactor),Implement 阶段每个 Task 的强制执行模式 |
| Execution Hook | 执行前检查 / 执行后验证的通用接口,SEVO 执行治理层的核心机制 |
| Session Guard | Agent 会话边界控制,根据当前流程阶段限制 Agent 的读写、执行权限和文件路径范围 |
| Context Enrichment | 任务上下文注入,Pipeline Engine 根据任务类型自动组装执行所需的规格、契约、测试用例和领域规则 |
