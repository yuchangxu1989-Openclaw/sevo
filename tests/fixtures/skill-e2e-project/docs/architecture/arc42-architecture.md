# arc42 Architecture

## Solution Strategy

Use a modular pipeline engine with pluggable adapters.

## Skill Interface

### sevo-router
- 职责：任务分级路由
- 触发条件：新任务进入 SEVO
- 核心模块：src/router/

### sevo-gate
- 职责：阶段门禁评估
- 触发条件：阶段完成时
- 核心模块：src/gate/

### sevo-ledger
- 职责：交付记录归档
- 触发条件：流水线完成
- 核心模块：src/ledger/

## 模块边界

- Router: 只做分级，不做调度
- Pipeline Engine: 状态机驱动，不含业务逻辑
- Gate Engine: 规则评估，不做修复
- Adapter: 宿主集成，不含核心逻辑
