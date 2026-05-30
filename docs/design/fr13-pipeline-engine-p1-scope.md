# FR-13 PipelineEngine P1 实现范围定义

OpenClaw（pm-01 子Agent）｜2026-05-23

---

## 1. P1 定位

P0 解决了「阶段顺序不可绕过」——创建时锁定、完成时推进、派发时拦截。P1 在此基础上解决四个问题：

1. **scan L1 检查逻辑失效**：当前 `findFilesForFr` 用文件名匹配 FR 编号，对按模块组织的代码库无效，导致每日扫描 A1 FAIL。
2. **门禁失败后无自动修复**：P0 门禁失败只做阻断 + 记录，需人工 `sevo resume`。P1 实现自动触发修复流程并恢复推进。
3. **无阶段回退机制**：门禁反复失败或修复超限时，缺乏回退到上一阶段重新执行的能力。
4. **postinstall 脚本阻断陌生人安装**：`scripts/init.sh` 的 hook 校验和 `openclaw` CLI 依赖导致 `npm install -g` 在无 OpenClaw 环境下失败。

---

## 2. P1 包含的工作项

### 2.1 Scan L1 检查逻辑升级（基础设施修复）

**目标**

将 `L1FileScanner.findFilesForFr()` 从文件名/路径字符串匹配升级为语义级 spec-to-code mapping，使按模块组织的代码库也能正确判定 FR 覆盖状态。

**现状问题**

`l1-file-scanner.ts` 的 `findFilesForFr` 方法逻辑：
1. 优先查 `frFileMap`（用户手动配置的映射表）
2. 若无映射，将 FR ID（如 `fr-13`）生成变体，在源文件路径中做 `includes` 匹配

对于按模块组织的代码库（如 `src/pipeline/`、`src/gate/`、`src/scan/`），文件名不含 FR 编号，导致所有 FR 的 `files` 为空 → `covered: false` → A1 FAIL。

**方案**

采用 spec-to-code mapping 文件 + LLM 语义验证双层方案：

- **Layer 1：结构化映射文件**（`sevo.scan.json` 或 `sevo.config.json` 中的 `frFileMap` 字段）。`sevo scan --level 1` 优先读取项目根目录的映射配置。映射可由 `sevo scan --generate-map` 自动生成（LLM 分析 spec + 源码目录结构，输出 FR→文件映射）。
- **Layer 2：LLM 语义验证**（可选，`--semantic` 标志启用）。对 Layer 1 映射结果做二次验证：将 FR 描述 + 对应文件摘要送入 LLM，判定文件是否真正实现了该 FR。用于高置信度场景（发布前扫描）。

**验收标准**

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | `sevo scan --level 1` 在有 `frFileMap` 配置的项目上，不再因文件名不含 FR 编号而报 uncovered | 对 SEVO 自身项目执行 scan，3 个 A1 FAIL 消失 |
| 2 | `sevo scan --generate-map` 能自动生成 FR→文件映射并写入配置 | 在空映射项目上执行，产出合理映射 |
| 3 | 无映射配置时降级为原有文件名匹配（向后兼容） | 删除映射配置后 scan 行为不变 |
| 4 | `--semantic` 标志启用 LLM 验证层，输出置信度评分 | 执行后报告含 confidence 字段 |

**依赖**

- LLM 调用能力（通过 OpenClaw Adapter 或直接 API）
- spec 文件解析（已有 `parseSpecMarkdown`）

**预估复杂度**：中等（3-5 天）。Layer 1 映射文件方案简单，Layer 2 LLM 验证需要 prompt 工程和结果解析。

---

### 2.2 AC-13.3 门禁失败自动修复与恢复推进

**目标**

门禁评估失败时，PipelineEngine 自动触发 Review Fix Loop（FR-06a），修复通过后自动恢复推进到下一阶段，无需人工 `sevo resume`。

**Spec 原文**

> AC-13.3：门禁失败时，PipelineEngine 自动触发修复流程（FR-06a），修复通过后自动恢复推进。

**P0 现状**

P0 的 `advance()` 在门禁失败时：标记阶段为 `failed` → 写入 `advance_decision` 事件（verdict: blocked）→ 停止。恢复需人工执行 `sevo resume <pipelineId>`。

**P1 行为**

```
门禁评估 → 失败
  → 标记阶段为 fix_pending（新状态）
  → 通过 Adapter 触发修复任务（携带门禁失败原因 + 原始工件路径）
  → 修复任务完成
    → 重新评估门禁
      → 通过 → 标记阶段 passed → 自动推进下一阶段
      → 再次失败 → 递增 attempt 计数
        → attempt < maxRetries → 再次触发修复
        → attempt >= maxRetries → 标记阶段 failed → 触发回退（AC-13.4）或阻断
```

**验收标准**

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 门禁失败后 30 秒内自动触发修复任务 | 集成测试：制造门禁失败场景，验证修复任务被派发 |
| 2 | 修复通过后自动恢复推进，无需人工干预 | 端到端测试：门禁失败→修复→自动进入下一阶段 |
| 3 | 修复任务携带门禁失败原因和原始工件路径 | 检查修复任务的 prompt 包含失败详情 |
| 4 | 重试次数可配置（默认 maxRetries=3） | 配置 maxRetries=1，验证超限后停止重试 |
| 5 | 每次修复尝试写入结构化事件（type: `fix_attempt`） | 检查 events.jsonl 包含 fix_attempt 记录 |
| 6 | 超过重试上限时触发回退或最终阻断 | 验证 attempt >= maxRetries 时行为正确 |

**依赖**

- P0 的 `advance()` 和 `GateEngine` 已实现
- FR-06a Review Fix Loop 的修复任务模板
- `stage-machine.ts` 需新增 `fix_pending` 状态及其转换规则

**预估复杂度**：中高（5-7 天）。核心逻辑不复杂，但需要处理修复任务的异步完成监听、重试计数持久化、与 FR-06a 的集成。

---

### 2.3 AC-13.4 阶段回退机制

**目标**

门禁反复失败（修复重试超限）时，PipelineEngine 能将 pipeline 回退到上一阶段重新执行，避免永久阻塞。

**Spec 原文**

> AC-13.4：并行阶段（如 UX Acceptance + PM Commercial Review）同时触发，两者均通过后才推进到下一阶段。

注：spec 中 AC-13.4 定义为并行阶段能力（P0 已通过复用 `parallel-branch.ts` 覆盖）。P1 此处实现的是阶段回退机制——作为 AC-13.3 修复超限后的降级策略，属于 PipelineEngine 编排完整性的必要补充。

**P1 行为**

```
阶段 N 修复重试超限（attempt >= maxRetries）
  → 评估回退策略：
    - 若阶段 N 配置了 rollbackTarget → 回退到指定阶段
    - 若未配置 → 默认回退到上一阶段（N-1）
    - 若已是第一阶段 → 标记 pipeline 为 blocked，等待人工介入
  → 执行回退：
    - 将目标阶段（N-1）状态重置为 active
    - 将阶段 N 状态设为 rolled_back（新状态）
    - 写入 rollback_decision 事件
    - 通过 Adapter 重新触发目标阶段执行
```

**验收标准**

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 修复超限后自动回退到上一阶段 | 集成测试：maxRetries=1，修复失败后验证上一阶段被重新激活 |
| 2 | 回退目标可通过阶段配置指定 | 配置 rollbackTarget，验证回退到指定阶段而非默认上一阶段 |
| 3 | 第一阶段无法回退时标记 pipeline 为 blocked | 验证第一阶段超限后 pipeline 状态为 blocked |
| 4 | 回退事件写入结构化记录 | 检查 events.jsonl 包含 rollback_decision |
| 5 | 回退后重新执行的阶段产出覆盖旧产出 | 验证回退后阶段重新执行，工件被更新 |
| 6 | 单个 pipeline 回退次数有上限（默认 maxRollbacks=2），超限则 blocked | 验证连续回退超限后 pipeline 停止 |

**依赖**

- AC-13.3 的修复重试机制（回退是重试超限的后续动作）
- `stage-machine.ts` 需新增 `rolled_back` 状态及 `passed/active → rolled_back` 转换规则
- 阶段配置 schema 需扩展 `rollbackTarget` 字段

**预估复杂度**：中等（3-4 天）。状态机扩展和回退逻辑本身不复杂，难点在于回退后工件清理和重新执行的边界处理。

---

### 2.4 Postinstall 脚本兼容性修复（基础设施修复）

**目标**

`scripts/init.sh` 在无 OpenClaw 运行时环境下（陌生人 `npm install -g sevo-pipeline`）能正常完成安装，不因 hook 校验或 CLI 依赖而失败。

**现状问题**

`init.sh` 当前逻辑：
1. ✅ 第 4-8 行：检测 `OPENCLAW_HOME` 和 `~/.openclaw/openclaw.json`，不存在则 graceful skip（`exit 0`）
2. ❌ 第 55 行：`command -v openclaw >/dev/null 2>&1 || die "openclaw CLI is required"` — 在 graceful skip 之后的路径中，如果 `openclaw.json` 存在但 `openclaw` CLI 未安装（如用户手动创建了配置目录），会 `die` 导致安装失败
3. ❌ 第 109-125 行：hook 校验用正则匹配 `index.js` 中的 hook 注册模式，如果编译产物格式变化（minify、bundle）会误报失败
4. ❌ 第 175 行：`openclaw doctor` 调用在 CLI 不可用时会失败

根本问题：脚本的 graceful skip 只覆盖了「完全无 OpenClaw 环境」的场景，但「部分环境」（有配置文件但无 CLI、有 CLI 但版本不兼容）场景会触发 `die`。

**方案**

将 init.sh 改为三层降级策略：

1. **完全无环境**（无 `OPENCLAW_HOME` 且无 `~/.openclaw/openclaw.json`）→ 输出提示 + `exit 0`（现有逻辑，保留）
2. **部分环境**（有配置文件但缺 CLI 或 CLI 版本不兼容）→ 输出 warning + 跳过需要 CLI 的步骤（hook 校验、doctor、config 写入）+ `exit 0`
3. **完整环境**（配置 + CLI + 版本兼容）→ 执行完整注册流程（现有逻辑）

关键改动：
- `command -v openclaw` 失败时从 `die` 改为 `warn` + 设置 `PARTIAL_ENV=true`
- hook 校验在 `PARTIAL_ENV=true` 时跳过
- `openclaw doctor` 在 `PARTIAL_ENV=true` 时跳过
- 所有 `die` 调用审查：区分「不可恢复错误」（如 node 不存在）和「环境不完整」（可降级）

**验收标准**

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 无 OpenClaw 环境下 `npm install -g sevo-pipeline` 成功（exit 0） | 干净 Docker 容器中执行安装 |
| 2 | 有 `openclaw.json` 但无 `openclaw` CLI 时安装成功（exit 0）+ 输出 warning | 模拟部分环境执行 |
| 3 | 完整 OpenClaw 环境下行为不变（完整注册 + doctor） | 在当前环境执行，对比输出 |
| 4 | `--ignore-scripts` 不再是必须的安装方式 | README 和错误提示中移除 `--ignore-scripts` 建议 |
| 5 | hook 校验失败不阻断安装，改为 warning | 修改 index.js 使正则不匹配，验证安装仍成功 |

**依赖**

- 无外部依赖，纯 shell 脚本修改

**预估复杂度**：低（1-2 天）。逻辑清晰，主要是条件分支重构和测试覆盖。

---

## 3. P1 与 P0/P2 的边界

| 维度 | P0（已完成） | P1（本轮） | P2（后续） |
|------|-------------|-----------|-----------|
| 阶段推进 | 通过→自动推进 | 失败→自动修复→恢复推进 | 多策略推进（跳过、条件推进） |
| 门禁失败 | 阻断 + 记录 | 自动修复 + 重试 + 回退 | 人工审批介入 + 升级通知 |
| 阶段回退 | 不支持 | 修复超限→回退上一阶段 | 任意阶段回退 + 回退链路追踪 |
| Scan L1 | 文件名匹配 | spec-to-code mapping + LLM 验证 | 增量扫描 + 变更影响分析 |
| 安装体验 | 需 --ignore-scripts | 三层降级，零障碍安装 | 交互式引导安装 |
| 中断恢复 | 不处理 | — | AC-13.8 自动恢复 |
| 多 pipeline | 不处理 | — | AC-13.9 优先级排队 |

---

## 4. 实现顺序建议

```
Phase 1: postinstall 修复（1-2 天）
  ↓ 解除安装阻断，陌生人可装
Phase 2: scan L1 升级（3-5 天）
  ↓ 消除 A1 FAIL，每日扫描恢复绿色
Phase 3: AC-13.3 自动修复（5-7 天）
  ↓ 门禁失败不再需要人工介入
Phase 4: AC-13.4 阶段回退（3-4 天）
  ↓ 修复超限有降级策略，pipeline 不会永久卡死
```

总预估：12-18 天。建议按此顺序实施——先解决用户可感知的安装和扫描问题，再补全引擎能力。

---

## 5. 状态机扩展摘要

P1 需要在 `stage-machine.ts` 中新增的状态和转换：

| 新状态 | 含义 | 入口转换 | 出口转换 |
|--------|------|----------|----------|
| `fix_pending` | 门禁失败，修复任务进行中 | `active → fix_pending`（门禁失败触发） | `fix_pending → active`（修复完成，重新评估） |
| `rolled_back` | 阶段被回退 | `fix_pending → rolled_back`（重试超限） | 终态，不可转出 |

Pipeline 级新增状态：

| 新状态 | 含义 | 触发条件 |
|--------|------|----------|
| `blocked` | 无法继续推进，等待人工介入 | 第一阶段回退超限 / pipeline 回退次数超限 |
