# SEVO Endgame 流水线 — 实现范围定义

OpenClaw（pm-01 子Agent）| 2026-05-23

---

## 概述

本文档定义 sevo-endgame 流水线 8 个 FR 缺口的实现范围、优先级排序、依赖关系和并行策略。每个 FR 基于 spec AC 定义缺口，不发明新需求。

---

## 优先级排序（P1 → P4）

| 优先级 | FR | 缺口摘要 | 工作量 | 可并行 |
|--------|-----|----------|--------|--------|
| P1 | FR-13 | gate/ 与 gates/ 目录统一 | S | 独立 |
| P1 | FR-08a | 商用化检查清单从 5 项扩展到 21 项 | M | 独立 |
| P2 | FR-29 | L3 运行时验证默认检查项补充 | S | 独立 |
| P2 | FR-22 | 独立验证模块（CLI 可调用） | S | 独立 |
| P3 | FR-14 | 单 Agent 降级场景 CLI 端到端覆盖 | M | 独立 |
| P3 | FR-15 | CLI 交互层分层配置深度 | M | 独立 |
| P3 | FR-16 | demo 项目自动推进验证 | M | 依赖 FR-13 |
| P4 | FR-11 | 自动触发链路集成验证 | M | 依赖 FR-13 |

---

## FR-13: PipelineEngine — 两个目录残留统一

### 当前状态

代码中存在两个门禁相关目录：
- `src/gate/` — 包含 GateEngine（核心门禁评估引擎）、built-in-rules、verdict-aggregator、review-role-assigner
- `src/gates/` — 包含具体门禁实现：SpecReviewGate、ContractReviewGate、ImplementationReviewGate、llm-intercept 子模块

两个目录都被活跃引用：
- `gate/` 被 plugin-adapter、sevo.ts、drive/、orchestrator/、pipeline/、engine/、stage-runner/ 引用
- `gates/` 被 plugin-adapter（llm-intercept）、stages/ac-coverage-gate、index.ts 引用

### 缺口描述

两个目录职责有重叠（都是"门禁"相关），命名不一致（单数 vs 复数），违反单一职责目录原则。需要统一到一个目录下，保持清晰的内部分层。

### 实现方案概要

1. 将 `gates/` 下的所有文件移入 `gate/` 目录（`gate/` 作为统一门禁目录）
2. 在 `gate/` 内部按职责分子目录：
   - `gate/engine/` — GateEngine、verdict-aggregator、built-in-rules
   - `gate/reviews/` — SpecReviewGate、ContractReviewGate、ImplementationReviewGate
   - `gate/llm-intercept/` — LLM 拦截决策引擎
   - `gate/rules/` — 保留现有 rules 子目录
3. 更新所有 import 路径（约 15-20 个文件）
4. 删除空的 `gates/` 目录
5. 确保 `tsc` 编译通过 + 全部测试绿

### 预估工作量

**S**（小）— 纯文件移动 + import 路径重写，无逻辑变更。

### 依赖关系

无外部依赖。是其他 FR 的前置条件（FR-16 demo 和 FR-11 集成验证依赖稳定的目录结构）。

---

## FR-08a: Commercialization Gate — 商用化检查清单扩展

### 当前状态

`src/scan/commercialization-scanners.ts` 已实现 5 个扫描器：
1. `consoleLogScanner` — console.log/debug/warn 残留检测
2. `todoFixmeScanner` — TODO/FIXME/HACK 残留检测
3. `configExternalizationChecker` — 硬编码端口/URL/路径检测
4. `documentationQualityChecker` — 文档质量检查
5. `errorHandlingCoverageChecker` — 错误处理覆盖率

CLI 已通过 `sevo scan --commercialization` 暴露。

### 缺口描述

Spec 定义了五层 21 项检查，当前仅覆盖第一层（代码清洁度）的部分项和第三层（文档质量）的部分项。缺失：

**第一层（代码清洁度）缺失项：**
- 内部引用检测（内部 agent 名称、内部 API 地址）
- 敏感信息检测（API key、token、密钥文件、.env）
- 依赖声明完整性（package.json dependencies 覆盖所有 import）

**第二层（包完整性）全部缺失：**
- package.json 必填字段完整性
- 入口文件指向存在的文件
- TypeScript 编译验证
- .gitignore 排除编译产物
- .npmignore / files 字段配置

**第三层（文档质量）缺失项：**
- README 营销质量标准（tagline→痛点→优势→快速体验→场景→文档链接）
- 配置项文档说明
- CHANGELOG.md 存在性
- LICENSE 文件存在性

**第四层（可构建性）全部缺失：**
- 干净目录 clone→install→build 验证
- npm test 通过
- CLI npx --help 验证

**第五层（开箱即用）全部缺失：**
- npm install 成功验证
- 核心功能首次使用路径验证
- 外部依赖配置引导检查

### 实现方案概要

1. 扩展 `commercialization-scanners.ts`，按五层结构新增扫描器函数
2. 第一层补充：`internalReferenceScanner`、`sensitiveInfoScanner`、`dependencyCompletenessChecker`
3. 第二层新增：`packageJsonFieldsChecker`、`entryPointChecker`、`typescriptBuildChecker`、`gitignoreChecker`、`npmignoreChecker`
4. 第三层补充：`readmeMarketingQualityChecker`（可选 LLM 评估）、`changelogChecker`、`licenseChecker`
5. 第四层新增：`cleanBuildVerifier`（spawn 子进程执行 clone→install→build）
6. 第五层新增：`installVerifier`、`firstUsePathVerifier`、`externalDependencyGuideChecker`
7. 更新 `runCommercializationScan()` 聚合函数，按层分组输出
8. 更新 CLI 输出格式，按五层展示结果
9. AC-4.32c：任一项不通过时输出修复建议

### 预估工作量

**M**（中）— 新增约 15 个扫描器函数，每个 30-80 行，加上测试。

### 依赖关系

无外部依赖。可独立并行实现。

---

## FR-29: Tiered Endgame Gap Scan — L3 运行时验证默认检查项补充

### 当前状态

`src/scan/l3-runtime-verifier.ts` 已实现：
- `L3RuntimeVerifier` 类，支持 CLI/Web/Hook/Plugin/Library 五种项目类型
- `defaultRuntimeChecksForType()` 从 package.json 自动推断检查项
- LLM 语义判定"有意义产出"
- Exit code 校验
- 自定义 validator 支持
- AC 级验证（specPath 传入时）

`src/scan/default-runtime-checks.ts` 已实现：
- 从 `sevo.config.json` 读取自定义 runtimeChecks
- 从 package.json 推断 CLI bin、test script、library entry
- 检测 openclaw.plugin.json 生成 plugin 检查

### 缺口描述

默认检查项覆盖不够全面，spec 要求的以下场景缺少默认检查：

1. **Web 服务默认检查**：当前仅靠用户传入 `--url`，没有自动检测 `scripts.start` 或 `scripts.dev` 并启动服务后验证 HTTP 200
2. **Hook/Plugin 事件触发验证**：当前仅检查 plugin manifest 存在，未实际触发事件验证 handler 执行
3. **AC-29.20 可达性验证**：检查新功能是否通过 `npm install` + `init` 后用户可达（代码存在但用户不可达 = P0）
4. **AC-29.21 独立仓库同步门禁**：验证改动已同步到独立 GitHub 仓库

### 实现方案概要

1. `default-runtime-checks.ts` 补充 Web 服务自动检测逻辑：检测 `scripts.start`/`scripts.dev` → 启动服务 → 等待端口就绪 → HTTP GET → 验证响应 → 关闭服务
2. 补充 Hook/Plugin 事件模拟触发：读取 plugin manifest 的 hooks 声明 → 构造最小事件 payload → 调用 handler → 验证有副作用
3. 新增 `reachability-checker.ts`：对比 npm 包 exports/bin 与实际代码入口，确认用户安装后能触达所有声明的功能
4. 新增 `repo-sync-checker.ts`：对比主仓库项目目录与独立仓库最新 commit 的 diff
5. 将新检查项注册到 `defaultRuntimeChecksForType()` 的自动推断逻辑中

### 预估工作量

**S**（小）— 主要是补充 4 个检查函数，每个 40-60 行，核心逻辑已有框架支撑。

### 依赖关系

无外部依赖。可独立并行实现。

---

## FR-22: 角色-任务匹配调度约束 — 独立验证模块

### 当前状态

`src/role-registry/` 已实现：
- `RoleTaskMatcher` 类：支持 multi-agent blocking 和 single-agent warning
- `RoleStageValidator`：每个阶段声明 requiredRole，派发前校验
- `validateDispatchMatrix()`：生成完整的 agent×stage 匹配矩阵
- 集成到 `plugin-adapter.ts`：派发时自动校验
- 集成到 `cmd-doctor.ts`：doctor 命令中做 role-matching 检查
- 单元测试覆盖核心匹配逻辑

### 缺口描述

"独立验证模块"要求：一个可以脱离 pipeline 运行、独立验证角色-任务匹配配置正确性的模块。当前 `validateDispatchMatrix()` 已存在但仅在 `sevo doctor` 中调用，缺少：

1. **独立 CLI 命令**：`sevo role verify` 或 `sevo dispatch check`，输出完整的角色分配表 + 匹配矩阵 + 潜在冲突
2. **结构化报告输出**：JSON 格式的验证报告，可被 CI/CD 消费
3. **模拟派发验证**：给定一组 pipeline 阶段序列，模拟完整派发流程，提前发现所有角色冲突

### 实现方案概要

1. 新增 `src/cli/cmd-role.ts`：注册 `sevo role verify` 子命令
2. 调用已有的 `validateDispatchMatrix()` 生成矩阵
3. 新增模拟派发逻辑：按 pipeline 阶段顺序遍历，对每个阶段调用 `RoleTaskMatcher.match()`，收集所有 blocked/warned 结果
4. 输出格式：表格（默认）或 JSON（`--json` flag）
5. 退出码：有 blocked = exit 1，仅 warned = exit 0（配合 CI 使用）

### 预估工作量

**S**（小）— 核心逻辑已在 `validateDispatchMatrix()` 中实现，只需包装为 CLI 命令 + 格式化输出。

### 依赖关系

无外部依赖。可独立并行实现。

---

## FR-14: Package Distribution & CLI — 单 Agent 降级场景覆盖

### 当前状态

单 Agent 降级已实现核心机制：
- `cmd-init.ts`：检测到单 Agent 时，所有 role pool 填入同一 agentId（AC-14F.3）
- `plugin-adapter.ts`：`singleAgent` flag 控制角色校验降级为 warning
- `task-dag.ts`：单 Agent 模式下使用 serial-fallback 策略
- `pdca-auto-driver.ts`：单 Agent CLI 降级输出

### 缺口描述

Spec AC-14.1 要求"陌生用户 5 分钟内能创建第一个 Project 并启动第一条 pipeline"。单 Agent 降级场景下，以下 CLI 命令的端到端行为未被充分验证：

1. **`sevo init` 单 Agent 检测**：当环境中只有一个 Agent 时，init 输出是否明确告知用户"单 Agent 降级模式"并解释含义
2. **`sevo fr add` 单 Agent 派发**：pipeline 创建后，PipelineEngine 在单 Agent 模式下是否能正确串行推进所有阶段（而非并行导致冲突）
3. **`sevo status` 降级标识**：状态输出是否标注"单 Agent 模式"
4. **AC-14.13 ACP 持久化注入**：单 Agent 环境下是否正确生成 ACP 配置文件
5. **角色知识注入完整性**：单 Agent 执行 Specify 阶段时，是否注入了 PM 角色的专业标准（AC-19.13）

### 实现方案概要

1. 新增集成测试 `src/cli/__tests__/cmd-init-single-agent.test.ts`（已存在文件，需补充覆盖）
2. 补充 `sevo status` 输出中的降级模式标识
3. 验证 `plugin-adapter.ts` 的 `buildSpawnOptions()` 在 singleAgent=true 时注入完整角色知识
4. 补充 `sevo fr add` 在单 Agent 模式下的端到端测试：创建 pipeline → 验证 stage queue 为串行 → 验证第一阶段触发
5. 确保 `sevo doctor` 在单 Agent 模式下输出"INFO: 单 Agent 降级模式"（已有，需验证）

### 预估工作量

**M**（中）— 主要是补充测试覆盖和少量 CLI 输出调整，涉及多个文件但每处改动小。

### 依赖关系

无外部依赖。可独立并行实现。

---

## FR-15: Progressive Disclosure — CLI 交互层分层配置深度

### 当前状态

`src/progressive-disclosure/` 已实现：
- `default-config.ts`：定义 L0/L1/L2 配置项及默认值，包含 `actionLevels`
- `cli-maturity.ts`：记录 CLI 命令使用频率，根据用户成熟度调整帮助信息展示深度
- `sdk.ts`：SevoSDK 提供编程控制接口（L3），包含 action level 判定
- `custom-stage.ts`：自定义阶段注册（L2）
- `cmd-config.ts`：`sevo config` 命令查看/修改配置

### 缺口描述

Spec AC-15.7 定义了 Agent 自主行动三级分类（L0 无需确认 / L1 执行后通知 / L2 必须确认），当前 `actionLevels` 在 config 中定义了空对象 `{}`，缺少：

1. **默认 actionLevels 填充**：spec 要求"默认值覆盖常见操作类型"，当前为空
2. **CLI 交互层实际执行 action level 检查**：`sevo config` 能查看配置，但 pipeline 执行时是否真正在派发前检查 action level 并按级别处理（L0 直接执行 / L1 通知 / L2 等确认）
3. **`sevo config set` 的分层引导**：用户修改 L2 配置时是否有确认提示
4. **AC-15.6 验证**：从 L0 升级到 L1 不需要重新初始化

### 实现方案概要

1. 填充 `default-config.ts` 中的 `actionLevels` 默认值：
   - L0：file-read、file-write、build、test、code-generate
   - L1：config-change、dependency-install、branch-create
   - L2：publish、delete、external-communication、production-change
2. 在 `plugin-adapter.ts` 的阶段派发逻辑中加入 action level 检查：读取当前操作类型 → 查 actionLevels 配置 → L2 操作注入确认提示到 task prompt
3. `sevo config set` 对 L2 级配置项增加确认提示
4. 补充测试：验证 L0→L1 升级只需编辑配置文件

### 预估工作量

**M**（中）— 需要在 config 层填充默认值 + 在 adapter 层加入 action level 检查逻辑 + 测试。

### 依赖关系

无外部依赖。可独立并行实现。

---

## FR-16: Onboarding Experience — demo 项目自动推进验证

### 当前状态

`src/cli/cmd-demo.ts` 已实现：
- `--dry-run` 模式：用 mock 数据展示 pipeline 阶段流转
- `--okr` 模式：展示 OKR-driven PDCA 闭环
- `--create-after` 选项：demo 完成后创建真实项目
- 完整的 ANSI 彩色输出和阶段进度展示
- Demo stages 定义（spec → spec-review-gate → implement → review → smoke-test → deploy）

### 缺口描述

AC-16.3 要求"`sevo demo` 在有 LLM 的环境中用内置示例项目跑通一条真实 Level 0 pipeline"。当前 demo 的非 dry-run 模式需要验证：

1. **真实 pipeline 自动推进**：demo 是否真正调用 PipelineEngine 推进阶段（而非仅模拟输出）
2. **阶段产出验证**：每个阶段完成后是否产出了有意义的工件（spec markdown、review report 等）
3. **AC-16.4 完成后指引**：demo 完成后的"你刚刚经历了什么"解释和"下一步做什么"指引是否完整
4. **AC-16.5 失败反馈**：每一步失败时是否告诉用户怎么修
5. **`--create-after` 真实项目创建**：是否正确调用 `sevo project create` 并输出后续指引

### 实现方案概要

1. 验证 `cmd-demo.ts` 非 dry-run 路径是否调用真实的 pipeline 创建和推进逻辑
2. 如果当前仅为模拟输出，需要接入 `PipelineEngine` 的 `createPipeline()` + `advance()` 方法
3. 补充阶段完成后的工件验证逻辑（检查文件是否写入）
4. 确保失败路径有明确的错误信息 + 修复建议
5. 补充集成测试：在有 mock LLM 的环境中验证 demo 端到端跑通

### 预估工作量

**M**（中）— 如果当前已接入真实 pipeline 则主要是验证和补充测试；如果仅为模拟则需要接入真实引擎。

### 依赖关系

依赖 FR-13 目录统一完成（demo 内部引用门禁模块，目录变更后 import 路径需要稳定）。

---

## FR-11: Proactive Clarification — 自动触发链路集成验证

### 当前状态

`src/clarification/` 已实现完整模块：
- `AmbiguityDetector`：模糊信号检测，支持 8 种信号类型（验收标准缺失、边界未定义、术语未解释、依赖未声明、接口不完整、数据流不明、性能约束缺失、Spec/Contract 矛盾）
- `ClarificationCoordinator`：协调澄清流程，管理 records 和 handles，支持 timeout
- `ResolutionWriter`：将收敛结论写回工件
- `ClarificationRecord`：结构化记录
- 类型系统：`BlockingLevel`、`ClarificationType`、`ClarificationScanRule`

集成状态：
- `spec-stage.ts`：import 了 AmbiguityDetector 和相关类型，在 spec 执行中使用
- `stages/__tests__/spec-stage.test.ts`：有 clarification 相关测试
- `stages/__tests__/ledger-stage.test.ts`：验证 clarificationRefs 纳入 Ledger

### 缺口描述

"自动触发链路集成验证"要求验证从检测到写回的完整链路在真实 pipeline 中自动工作：

1. **Contract 阶段集成**（AC-4.45-4.48）：`ClarificationCoordinator` 是否已接入 contract-stage？当前仅确认 spec-stage 有集成
2. **Implement 阶段集成**（AC-4.49-4.52）：implement 阶段执行前是否检查 Task 描述完整性？发现矛盾时是否暂停？
3. **AC-4.53 规则可配置**：模糊检测规则是否可通过配置文件扩展（不改 Skill 源码）
4. **AC-4.54 Ledger 证据链**：澄清记录是否作为阶段工件纳入 Ledger（测试已有，需验证真实路径）
5. **AC-4.55 不依赖特定 Agent**：澄清机制是否通过阶段执行原则注入（而非绑定 Agent 身份）
6. **端到端集成测试**：一条 pipeline 从 spec → contract → implement，每个阶段都触发澄清 → 收到回复 → 写回工件 → 继续推进

### 实现方案概要

1. 检查 `contract-stage.ts` 是否已集成 `ClarificationCoordinator`，如未集成则接入
2. 检查 implement 阶段（通过 plugin-adapter 的 task prompt 注入）是否包含澄清触发逻辑
3. 验证 `ClarificationScanRule` 是否支持从配置文件加载（`sevo.config.json` 的 `clarificationRules` 字段）
4. 新增端到端集成测试：`src/__tests__/clarification-e2e.test.ts`
5. 确保 `ClarificationCoordinator` 的 `HostClarificationAdapter` 接口不绑定特定 Agent

### 预估工作量

**M**（中）— 核心模块已实现，主要是补充 contract/implement 阶段的集成 + 端到端测试。

### 依赖关系

依赖 FR-13 目录统一完成（集成测试需要稳定的模块路径）。

---

## 并行策略

```
Wave 1（可立即并行启动）:
├── FR-13: gate/ + gates/ 目录统一 [S]
├── FR-08a: 商用化检查清单扩展 [M]
├── FR-29: L3 默认检查项补充 [S]
└── FR-22: 独立验证 CLI 命令 [S]

Wave 2（Wave 1 完成后，可并行）:
├── FR-14: 单 Agent 降级端到端覆盖 [M]
├── FR-15: CLI 交互层 actionLevels [M]
├── FR-16: demo 自动推进验证 [M] ← 依赖 FR-13
└── FR-11: 澄清链路集成验证 [M] ← 依赖 FR-13
```

Wave 1 的 4 个 FR 完全独立，可同时派发 4 个 Agent 并行实现。
Wave 2 的 4 个 FR 中，FR-14 和 FR-15 独立于 FR-13，但优先级较低；FR-16 和 FR-11 依赖 FR-13 的目录统一结果。

实际执行建议：Wave 1 全部并行 → FR-13 完成后立即启动 FR-16 和 FR-11 → FR-14/FR-15 在有空闲 Agent 时随时启动。

---

## 总工作量估算

- S（小）× 3 = 约 3 个 Agent·小时
- M（中）× 5 = 约 10 个 Agent·小时
- **总计**：约 13 个 Agent·小时（实际并行后挂钟时间约 4-6 小时）
