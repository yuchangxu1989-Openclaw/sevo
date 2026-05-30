# SEVO OpenClaw Plugin — 架构方案

OpenClaw（sa-01 子Agent）| 2026-04-21

## 1. 问题陈述

当前 SDD 流水线完全靠主会话读 AGENTS.md 规则手动执行（L6 层），依赖模型遵从度。已发生的故障：架构完成后未自动推进到实现——长上下文稀释了规则。

目标：写一个 OpenClaw 扩展插件 `sevo-pipeline`，把 SDD 流水线从 L6（prompt 注入）下沉到 L2/L3（插件层 + Hook 层），实现：
- 监听 subagent completion event
- 调用 SEVO PipelineEngine 判断当前阶段
- 自动派发下一阶段任务
- gate check 失败时自动触发返工

## 2. 约束

| 约束 | 说明 |
|------|------|
| C-1 | 插件自身出错不能阻断正常 dispatch（fail-open） |
| C-2 | 必须遵守 OpenClaw 插件事件模型，且不抢夺主会话调度权 |
| C-3 | SEVO 核心是 TypeScript，插件是 ESM JS——需要桥接层 |
| C-4 | 单 pipeline instance per project（SEVO 已有此约束） |
| C-5 | 插件不修改 openclaw.json，只读 agent/model 配置 |

## 3. 核心设计

### 3.1 插件在 OpenClaw 可控性分层中的位置

```
L2 (插件层)  ← sevo-pipeline 插件主体
  ├─ 监听 subagent_ended event，识别阶段完成
  ├─ 维护 pipeline → stage → label 的关联协议
  └─ before_prompt_build 向主会话注入待派发任务上下文

L3 (Hook 层)  ← pipeline 生命周期钩子
  └─ bootstrap 时恢复活跃 pipeline state
```

### 3.2 模块结构

```
/root/.openclaw/extensions/sevo-pipeline/
├── index.js              # 插件入口，注册 OpenClaw hooks
├── bridge.js             # SEVO TypeScript → JS 桥接层
├── task-mapper.js        # StageId → Agent 任务描述映射
├── label-protocol.js     # completion ↔ pipeline instance 关联协议
└── state/                # 运行时状态（不进 git）
    └── active-pipelines.json
```

### 3.3 关键数据流

```
用户发起 SDD 任务
    │
    ▼
主会话识别 SDD 触发条件 → 调用插件 API 创建 pipeline
    │
    ▼
sevo-pipeline 插件:
  1. 调用 SEVO route() 分类任务级别（L0/L1/L2+）
  2. 调用 PipelineEngine.create() 创建 pipeline state
  3. 读取第一个 active stage
  4. 通过 task-mapper 生成任务描述
  5. 向主会话注入 "请 spawn 以下任务" 的 context
    │
    ▼
主会话审核后 spawn subagent
  └─ label 格式: "sevo:<pipelineId>:<stageId>"
    │
    ▼
subagent 完成 → Gateway 发出 subagent_ended event
    │
    ▼
sevo-pipeline 插件 (subagent_ended hook):
  1. 从 label 解析 pipelineId + stageId
  2. 构造 StageResult（passed/failed + artifacts）
  3. 调用 PipelineEngine.advance()
  4. 如果 advance 返回下一个 active stage:
     a. 通过 task-mapper 生成下一阶段任务描述
     b. 注入 auto-advance notice 到主会话
  5. 如果 gate 失败:
     a. 解析失败原因
     b. 生成返工任务描述
     c. 注入 rework notice 到主会话
  6. 如果 pipeline 完成:
     a. 调用 LedgerEngine.record()
     b. 注入 completion notice
```

## 4. 七个核心设计问题的解答

### 4.1 如何监听 subagent completion event？

直接监听 OpenClaw 提供的 `subagent_ended` 事件：

```javascript
api.on('subagent_ended', async (evt, ctx) => {
  try {
    const label = evt?.label || '';
    if (!label.startsWith('sevo:')) return; // 不是 SEVO 任务，跳过
    // ... 处理逻辑
  } catch (err) {
    // fail-open: 记录错误但不阻断
    appendEvent({ type: 'sevo_hook_error', error: err.message });
  }
}, { priority: 200 }); // 中等优先级，给更底层状态同步插件预留空间
```

priority 200 的目的是避免 sevo-pipeline 抢占更底层的状态收口或审计插件；即便系统中没有其他插件，它也能独立工作。

### 4.2 如何判断 completion 属于哪个 pipeline instance？

**Label 协议**（最简方案，零侵入）：

```
label 格式: "sevo:<pipelineId>:<stageId>[:<attempt>]"
示例: "sevo:pi-cortex-20260421-001:implement:1"
```

- 派发任务时，插件通过 `before_tool_call` hook 路由 `sessions_spawn`，检查 label 是否匹配 sevo 格式
- completion 时，从 `evt.label` 解析出 pipelineId 和 stageId
- 如果 label 丢失（极端情况），fallback 到 completion payload 中的任务标题与阶段关键字匹配

为什么不用 metadata？OpenClaw 的 sessions_spawn API 没有 metadata 透传机制，label 是唯一可靠的关联通道。

### 4.3 如何调用 SEVO PipelineEngine？

**桥接层设计**（bridge.js）：

SEVO 是 TypeScript 编译产物，插件是 ESM JS。桥接方案：

```javascript
// bridge.js
import { PipelineEngine } from '../../workspace/projects/sevo/dist/pipeline/pipeline-engine.js';
import { route } from '../../workspace/projects/sevo/dist/router/index.js';
import { LedgerEngine } from '../../workspace/projects/sevo/dist/ledger/index.js';

const SEVO_BASE_PATH = '/root/.openclaw/workspace/projects/sevo/data';

let engine = null;
let ledger = null;

export function getEngine() {
  if (!engine) engine = new PipelineEngine(SEVO_BASE_PATH);
  return engine;
}

export function getLedger() {
  if (!ledger) ledger = new LedgerEngine(SEVO_BASE_PATH);
  return ledger;
}

export { route };
```

前提：SEVO 必须先 `tsc` 编译到 `dist/`，插件 import 编译产物。

如果 SEVO 尚未编译或编译产物不存在，桥接层 graceful degrade：记录警告，插件所有 hook 变成 no-op。

### 4.4 如何自动派发下一阶段任务？

插件不直接调用 `sessions_spawn`——OpenClaw 插件 API 没有暴露 spawn 能力。

**方案：通过 `before_prompt_build` 注入指令到主会话**

```javascript
// 暂存待推进阶段，等主会话下一轮 prompt 构建时注入
const pendingAdvances = new Map(); // pipelineId → { stageId, taskDescription }

api.on('before_prompt_build', (evt, ctx) => {
  const sessionKey = ctx?.sessionKey || '';
  if (!sessionKey.startsWith('agent:main:')) return null;

  const notices = consumePendingAdvances();
  if (!notices.length) return null;

  const context = notices.map(n =>
    `[SEVO 自动推进] Pipeline ${n.pipelineId} 进入 ${n.stageId} 阶段。\n` +
    `请立即派发以下任务：\n${n.taskDescription}`
  ).join('\n\n');

  return { prependContext: context };
}, { priority: 850 }); // 较晚注入，尽量贴近主会话最终可见上下文
```

这个方案的优势：
- 保持主会话调度权，插件只给出下一步建议
- 保留人在回路，主会话仍可补充约束、改派 agent 或暂缓推进
- 插件不直接 spawn，避免把阶段推进逻辑和执行权限耦死在插件内部

### 4.5 如何处理 gate check 失败？

SEVO 的 gate 有三种结论：`passed`、`conditional`、`rejected`。

```javascript
function handleGateResult(pipelineId, stageId, verdict) {
  switch (verdict.conclusion) {
    case 'passed':
      // advance() 已自动激活下一阶段
      break;

    case 'conditional':
      // 有条件通过：提取必须解决的 blockers，生成修复任务
      const fixTasks = verdict.blockers.map(b => ({
        description: `修复 ${b.item}（owner: ${b.owner}）`,
        stageId: stageId, // 返回同一阶段
      }));
      queueReworkNotice(pipelineId, stageId, fixTasks);
      break;

    case 'rejected':
      // 拒绝：回退到前一阶段
      const prevStage = getPreviousStage(pipelineId, stageId);
      queueReworkNotice(pipelineId, prevStage, [{
        description: `Gate ${stageId} 拒绝，需返回 ${prevStage} 重做`,
        blockers: verdict.blockers,
      }]);
      break;
  }
}
```

Gate 评估时机：
- 对于 `spec-review-gate`、`contract-review-gate`、`publish-generalization-gate`：当对应的 review/audit 子任务完成时，插件收集 review bundles，调用 `evaluate()` 得到 verdict
- Review bundles 从子任务的产出文件（reports/*.md）中解析

### 4.6 如何与 OpenClaw 调度机制协同？

| 职责 | OpenClaw Core / 主会话 | sevo-pipeline |
|------|------------------------|---------------|
| 会话创建与实际 spawn | ✅ | ❌ |
| agent 选择与任务最终确认 | ✅ | ❌ |
| pipeline 状态管理 | ❌ | ✅ |
| 阶段推进决策 | ❌ | ✅ |
| 任务描述生成 | ❌ | ✅ |
| label 协议维护 | ❌ | ✅ |

协同机制：
1. sevo-pipeline 只负责生成结构化的下一步任务建议，并把 `pipelineId/stageId` 编进 label 协议
2. 主会话在看到注入上下文后，自行决定是否立即 spawn、改派 agent、补充约束或暂停
3. OpenClaw core 继续负责真正的会话创建与事件投递，插件不越权替代

```
主会话决策链:
  sevo-pipeline: 注入阶段上下文 + 推荐任务
  → 主会话: 保留调度权与人工判断
  → OpenClaw core: 实际 spawn / 事件分发
```

### 4.7 错误处理：插件自身出错时不阻断

**fail-open 原则**：所有 hook handler 包裹在 try-catch 中，异常只记录不阻断。

```javascript
function safeSevoHook(handler) {
  return (evt, ctx) => {
    try {
      return handler(evt, ctx);
    } catch (err) {
      appendEvent({
        type: 'sevo_plugin_error',
        hook: handler.name,
        error: String(err?.message || err),
        stack: String(err?.stack || '').slice(0, 500),
      });
      return null; // 不阻断，不修改
    }
  };
}
```

降级策略：
- SEVO 编译产物不存在 → 插件启动时检测，所有 hook 变 no-op，记录 `sevo_degraded` 事件
- PipelineEngine 抛异常 → 记录错误，该次 completion 不推进，等下次手动触发
- 主会话暂未采纳注入的推进指令 → pipeline 保持当前状态，等待下一轮 prompt 或人工补发

## 5. Stage → Agent 任务映射（task-mapper.js）

```javascript
const STAGE_AGENT_MAP = {
  'spec':                       { tier: 'pm',   agentId: 'pm-01',    timeout: 1800 },
  'spec-review-gate':           { tier: 'arch', agentId: 'sa-01',    timeout: 1200 },
  'test-case-authoring':        { tier: 'audit', agentId: 'audit-01', timeout: 1200 },
  'contract':                   { tier: 'arch', agentId: 'sa-01',    timeout: 3600 },
  'contract-review-gate':       { tier: 'audit', agentId: 'audit-01', timeout: 1200 },
  'implement':                  { tier: 'T1',   agentId: null,       timeout: 1200 },
  'review':                     { tier: 'audit', agentId: 'audit-01', timeout: 1200 },
  'regression':                 { tier: 'T1',   agentId: null,       timeout: 1200 },
  'publish-generalization-gate': { tier: 'arch', agentId: 'sa-01',    timeout: 1200 },
  'deploy':                     { tier: 'T1',   agentId: null,       timeout: 600  },
  'verify':                     { tier: 'audit', agentId: 'audit-01', timeout: 600  },
  'ledger':                     { tier: 'T4',   agentId: 'dev-01',   timeout: 600  },
};
```

`agentId: null` 表示 task-mapper 只声明能力梯队，由主会话结合当前可用 agent 池完成最终分配。

每个 stage 的 task prompt 模板从 `task-mapper.js` 生成，包含：
- 当前 pipeline 上下文（projectSlug、level、已完成阶段）
- 前序阶段产出的 artifact 路径
- 该阶段的验收标准（从 SEVO spec 中提取）

## 6. 状态持久化

### 6.1 SEVO 自身状态

SEVO PipelineEngine 已有完整的持久化机制：
- `data/pipelines/<pipelineId>/state.json` — 原子写入（write-tmp + rename）
- `data/pipelines/<pipelineId>/events.jsonl` — append-only 事件日志

插件不重复持久化 pipeline 状态，直接复用 SEVO 的。

### 6.2 插件运行时状态

```json
// state/active-pipelines.json
{
  "pipelines": {
    "pi-cortex-20260421-001": {
      "projectSlug": "cortex",
      "pipelineId": "pi-cortex-20260421-001",
      "sevoBasePath": "/root/.openclaw/workspace/projects/sevo/data",
      "createdAt": "2026-04-21T12:00:00Z",
      "lastAdvancedAt": "2026-04-21T14:30:00Z"
    }
  }
}
```

这个文件只记录"哪些 pipeline 是活跃的"，具体状态从 SEVO state.json 读取。

## 7. 并行分支处理

SEVO 已有 parallel-branch.ts 处理 spec-review-gate 之后的并行分支：
- `test-case-authoring` 和 `contract` 并行执行
- `implement` 需要两者都完成才能开始

插件的处理：
1. `spec-review-gate` 通过后，PipelineEngine.advance() 自动激活两个并行 stage
2. 插件检测到两个 active stage，生成两个任务描述，一次性注入主会话
3. 主会话并行 spawn 两个子任务
4. 两个子任务各自完成时，分别调用 advance()
5. 当两者都 passed，PipelineEngine 自动激活 implement

## 8. 与 OpenClaw 平台的集成点

```
┌─────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                 │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │               sevo-pipeline (L2)              │  │
│  │  subagent_ended │ before_tool_call │          │  │
│  │  before_prompt_build │ label protocol         │  │
│  └──────────────────────────┬────────────────────┘  │
│                             │                       │
│                             ▼                       │
│  ┌───────────────────────────────────────────────┐  │
│  │              OpenClaw Plugin API              │  │
│  │  Events: before_tool_call, subagent_ended,   │  │
│  │          before_prompt_build, ...            │  │
│  └──────────────────────────┬────────────────────┘  │
│                             │                       │
│                             ▼                       │
│  ┌───────────────────────────────────────────────┐  │
│  │           SEVO Core (TypeScript/dist)         │  │
│  │  PipelineEngine │ Router │ GateEngine │ Ledger│  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| SEVO dist 不存在或过期 | 插件无法调用 PipelineEngine | 启动时检测，graceful degrade 为 no-op；CI 中加 build check |
| 主会话暂未采纳注入的推进指令 | 流水线停滞 | pipeline 保持当前阶段；下一轮 prompt 再次注入，必要时发出人工提醒 |
| label 被主会话覆盖或丢失 | 无法关联 completion 到 pipeline | fallback 到 completion payload 中的任务标题/阶段关键字匹配；记录 label 异常日志 |
| 并行 stage 其中一个失败 | 另一个继续执行但 implement 被阻塞 | PipelineEngine 已有 blocked 状态处理；插件生成返工任务 |
| 与其他插件共享同一批 hook | 执行顺序或上下文竞争 | hook 设计保持幂等 + fail-open；priority 只表达顺序偏好，不绑定特定插件存在 |

## 10. 实现路线图

### Phase 1: 骨架（1-2 天）
- 插件入口 + bridge.js + label-protocol.js
- `subagent_ended` hook：解析 label → 调用 advance() → 记录事件
- `before_prompt_build` hook：注入下一阶段任务描述
- 手动创建 pipeline（通过 exec 调用 bridge API）

### Phase 2: 自动化（2-3 天）
- task-mapper.js：完整的 stage → task prompt 模板
- `before_tool_call` hook：自动注入 sevo label
- gate 评估：从 review 产出文件解析 review bundles
- 返工流程：gate 失败 → 自动生成修复任务

### Phase 3: 闭环（1-2 天）
- pipeline 创建 API（主会话可通过命令触发）
- ledger 记录
- 飞书通知集成
- 与 AGENTS.md 中 SDD 规则的双写同步

## 11. ADR 索引

- ADR-010: SEVO OpenClaw 插件通信协议（label-based vs metadata-based）→ 选择 label-based
- ADR-011: 插件不直接 spawn，通过 prompt 注入驱动主会话 spawn → 保持调度权在主会话
