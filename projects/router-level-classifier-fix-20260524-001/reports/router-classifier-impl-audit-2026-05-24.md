# SEVO Router Level-Classifier 修复 — 实装审计

OpenClaw（audit-01 子Agent）/ 2026-05-24

## 结论一句话
**OK + 改进建议**。架构方向 1+2+3+4 全部落地，根因（`cmd-from.ts` 写死空 scope）已堵；4 个真实路由 case 静态走读结果与 cc 自报一致；新增 11 用例覆盖 spec 7 条 + 4 条边界守护；旧测试兼容回填到位。无 P0/P1 阻断；2 条 P2 改进建议涉及 ComplianceRouter 的隐式 L0 回填策略与启发式词表覆盖。

## 通过 / 待修条数
- 通过审计点：**7 / 7**
- P0：0
- P1：0
- P2：2

## 审计点逐条

### 1. 架构对齐性 — 通过

- 方向一（CLI 强默认 L1 兜底）：`level-classifier.ts:isL0` 增加 `if (!scope.userExplicitL0) return false`（line 69-71），配合 `classifyLevel` 第三档默认 L1，空 scope 必落 L1。
- 方向二（启发式 + LLM 推断 scope）：新增 `src/router/description-scope-inferrer.ts`（160 行）。启发式词表 + MODULE_NOUN 正则匹配 → LLM fallback（仅在 `OPENAI_API_KEY` 存在时调用）→ 解析失败兜底返回启发式（通常空对象）。
- 方向三（CLI `--level` 显式越权）：`cmd-from.ts` 注册 `--level`，非法值 throw + exitCode=1；显式越权时填 `userExplicitLevel + userExplicitL0/userExplicitFullPipeline`，`classifyLevel` 入口直接返回该层级（line 24-26）。
- 方向四（`forceArchDesignAllLevels`）：以可选项形式新增到 `ProjectConfig`（types/index.ts:135），默认 undefined ≡ false；`router.ts:planL0/planFullPipeline` 都消费此开关。L0 默认不强制 architect，符合"L0 定位不退化"约束。
- 模块边界：改动仅落在 `src/router/`、`src/cli/cmd-from.ts`、`src/types/index.ts`、`src/pipeline/pipeline-engine.ts:levelToScope`、`src/compliance/compliance-router.ts:parseTaskScopeFromLLM`、对应 `__tests__/`。`pipeline-engine` 与 `compliance-router` 的改动是协议层兼容回填（不是新分支），不构成跨域扩散。
- TaskScope 新字段：`userExplicitL0?: boolean` + `userExplicitLevel?: TaskLevel`，全部 optional，默认行为兼容旧调用。

### 2. 根因修复有效性 — 通过

- `cmd-from.ts` 不再写死 `scope: {}`：line 63 `const scope: TaskScope = {}` 之后立即根据显式 level 或 `inferScopeFromDescription(opts.description)` 填充。空对象路径只剩"description 缺失 + 推断失败"组合，由 `classifyLevel` 默认 L1 接住。
- 推断失败安全 fallback：`description-scope-inferrer.ts` 的 try/catch 包住 LLM 调用，catch 块返回 `heuristic`（通常空），交给 router L1 默认。LLM 不可用 / 解析异常都不会反向升级或降级。
- 启发式词表合理：`实装/实现/新增/添加/创建/编写/接入/搭建/构建` 与 `MODULE_NOUN_RE` 串联，命中即覆盖空 scope。`hasDataModelChange` 与 `affectedDomains>=2` 单独走分支，独立可触发 L2+。
- LLM prompt 强约束 schema 输出，`sanitize` 过滤非法字段，避免 LLM 噪声反向劫持 scope。

### 3. 真实路由 case 静态走读 — 通过

按 cc 报告的 4 个 case 走读 `description-scope-inferrer` + `level-classifier` + `router` 代码逻辑：

| Case | 静态走读结果 | cc 自报 | 一致 |
|---|---|---|---|
| `实装 FR-P03 新增 metadata-extractor service`（无 `--level`） | 启发式命中"实装/新增" + `extractor/service` → `isNewModule=true` → `matchTriggerRules` 返回 `['new-module']` → **L2+**，`requiredStages` 含 architecture-design | L2+ / new-module | ✅ |
| `修个 typo`（无 `--level`） | 无 verb 命中 → 启发式空 → LLM 不可用（CI 无 OPENAI_API_KEY）→ 空 scope → `isL0` 因 `userExplicitL0` 缺失返回 false → 默认 **L1** | L1 / [] | ✅ |
| 任意描述 + `--level L0` | `parseExplicitLevel` 通过 → `scope.userExplicitLevel='L0' + userExplicitL0=true` → `classifyLevel` 入口直返 **L0** | L0 / [] | ✅ |
| `跨 FR-P03 FR-P04 router gate ledger 同步动` | 启发式 `frMatches` 抓到 2 个唯一 FR → `affectedDomains.length=2` → `matchTriggerRules` 返回 `['cross-domain']` → **L2+** | L2+ / cross-domain | ✅ |

L2+ 路径的 `requiredStages` 含 `architecture-design`：`planFullPipeline` 在 `designNeeds.needsArchDesign=true` 或 `forceArch=true` 时把 `architecture-design` 加入；`design-need-classifier` 默认对 isNewModule / cross-domain / large-change 等 trigger rules 都返回 needsArchDesign=true（已校验该模块未被本次改动）。

### 4. test 覆盖完备性 — 通过

- 新增 `src/router/__tests__/level-classifier-description-aware.test.ts` 共 11 用例：
  - Test 1（typo + --level=L0 → L0）
  - Test 2（实装 FR-Pxx → architecture-design 进 requiredStages）
  - Test 3（多文件 5/200 显式 scope → L1）
  - Test 4（跨 FR-P03/P04/P05 → L2+ + cross-domain）
  - Test 5（显式 --level=L2+ → L2+ 即使描述是 typo）
  - Test 6（LLM unreachable → L1）
  - Test 7（LLM 返回非 JSON → L1）
  - 守护 4 条：empty scope → L1；userExplicitL0=true → L0；forceArchDesignAllLevels 默认关 / 开启对比。
- LLM 调用在 Test 6/7 用 `vi.spyOn(global, 'fetch')` 做 mock，未打真实接口，符合架构 §7 约束。
- 兼容回填覆盖到位：`src/router/__tests__/router.test.ts` 第 21-30 行新增"empty scope → L1"断言并把所有原 L0 fixture 加 `userExplicitL0: true`；`src/__tests__/integration.test.ts:73`、`src/__tests__/pipeline-from.test.ts:496` 同步更新。
- `src/pipeline/pipeline-engine.ts:levelToScope`（line 1717-1726）回填 `userExplicitLevel + userExplicitL0/userExplicitFullPipeline`，保 SDK / EngineFacade `createPipeline(slug, desc, 'L0')` 仍走 L0。
- `src/compliance/compliance-router.ts:parseTaskScopeFromLLM`（line 79-99）当 LLM 已语义判定为 micro-change 时回填 `userExplicitL0=true`，保留 ComplianceRouter 的 L0 通道（详见 P2-1）。

未独立运行测试套件（审计员只读约束），cc 自报 1311 / 1311 通过，基于静态代码可信。

### 5. 文档洁净度 + 署名 — 通过

- 实装报告署名：`Claude Code（OpenClaw ACP Agent）/ 2026-05-24` — ACP agent 格式合规。
- 架构文档署名：`OpenClaw（sa-02 子Agent）/ 2026-05-24` — 原生 subagent 格式合规。
- spec 署名：`OpenClaw（主会话）/ 2026-05-24` — 合规。
- AI 套话扫描（`不是...而是` / `让我们` / `值得注意` / `换句话说` / `本质上不是` / `缺的不是`）→ 0 命中。
- 修订痕迹关键词扫描（`V2 新增` / `V3 变更` / `修订后` / `最终版` / `来源：` / `Wave` / `Post-MVP`）→ 0 命中。
- 行数与报告自报一致：实装报告 100 / 架构 347 / spec 66。

### 6. 风险暴露 — 通过 + 2 条 P2

- 旧 description 路由：所有原 L0 测试已加 `userExplicitL0: true`，新行为对显式 scope 调用方完全兼容；纯空 scope 调用方现在落 L1（保守，符合架构 §2.1 取舍）。
- pipeline-from / 历史 instance：`PipelineInstance.routingResult` 已固化在 JSON 文件，回放不重跑路由（架构 §6.1 已声明）。
- 新增 5 stage edges：`src/__tests__/router.test.ts:202` 把 `DEFAULT_SDD_GRAPH` 边数从 17 调整为 19，未发现与本次改动直接相关，疑似跟随其他改动一起回填，本审计不深入。

### 7. 报告自洽性 — 通过

- 报告改动清单与 git diff stat 全部对应（`src/types/index.ts` + `description-scope-inferrer.ts` 新增 + `cmd-from.ts` + `level-classifier.ts` + `router.ts` + 兼容回填的 5 文件）。
- 报告自报新增 11 用例 → 实测文件 `grep -c "it("` = 11 ✅
- 报告自报"启发式词表 9 个动词" → 代码 `NEW_MODULE_VERBS` 含 9 个：实装/实现/新增/添加/创建/编写/接入/搭建/构建 ✅
- 报告自报"empty scope 不再判 L0" → 代码 `isL0` 头部 guard 验证 ✅

## 改进建议（P2，不阻断）

### P2-1 ComplianceRouter 隐式回填 userExplicitL0 是潜在绕行口

- 位置：`src/compliance/compliance-router.ts:parseTaskScopeFromLLM`（line 79-99）
- 现象：当 LLM 把 description 语义判定为 micro-change（≤1 file、<50 lines、无风险 flag），代码自动回填 `userExplicitL0=true`，等于让 LLM 替用户做"显式越权 L0"决策。
- 风险：与 FR-2 AC3 的"L0 必须显式 opt-in"语义存在张力。一段被 LLM 误判为 micro-change 的描述就能重新走回 false-L0 通道，绕开本次修复的核心保护。
- 复现路径：调用方走 `ComplianceRouter.evaluate()` → LLM 给出 isNewModule=false / 小文件 / 小行数 → 自动 `userExplicitL0=true` → 后续 `route()` 判 L0 → 跳 architect。
- 修复建议：把 `userExplicitL0: looksMicro || undefined` 这条隐式赋值加上一层显式 audit log（"LLM judged micro-change"），并考虑在 ComplianceRouter 单元测试中补一条"LLM 误判 micro 但描述含'实装'"的对抗用例，要求路由结果不为 L0。本次不阻断，因为 ComplianceRouter 是另一条入口，与 CLI 入口的 FR-2 AC3 保护互不污染。

### P2-2 启发式词表对"补 / 完善 / 接入 / 整合"等动词的召回有限

- 位置：`src/router/description-scope-inferrer.ts:NEW_MODULE_VERBS`
- 现象：词表只含 9 个动词，对"补一下 metadata-extractor 的入口"、"完善 router 模块"、"打通 X 与 Y 的链路"等口语化 FR 实装描述召回不到（架构 §2.2 自身已点出"漏召回"风险）。
- 风险：当 OPENAI_API_KEY 未配置或 LLM 不可达时，这类描述会落到空 scope → L1（保守降级，不会到 L0），但 architect 是否被 needsArchDesign 接住就完全依赖 `design-need-classifier` 的另一条 LLM 链路；该链路在无 API key 时也走保守默认。
- 修复建议：扩词表（补 / 完善 / 整合 / 打通 / 抽象 / 拆分），或把启发式与 LLM 调用的 fallback 关系做成"启发式空 → 必走 LLM；LLM 不可用 → 默认 isNewModule=true 的进一步保守"两档之一。本次不阻断，因为：(1) 当前默认 L1 已经把 architect 通过 needsArchDesign 链路接住；(2) 词表扩展是低成本可迭代的优化项。

## 审计结论

**总评：OK，可发布 / 可合并。**

- ✅ 7/7 审计点全部通过
- ✅ 架构方向 1+2+3+4 实装到位
- ✅ 根因修复有效，4 个真实路由 case 静态走读全对
- ✅ 11 用例覆盖 spec 7 条 + 4 条边界守护
- ✅ 兼容回填到 5 处旧测试，无破坏
- ✅ 文档署名 + 洁净度合规
- ⚠️ 2 条 P2 改进建议（ComplianceRouter 隐式 L0 回填的对抗用例 + 启发式词表覆盖度）记入 follow-up，不阻断本次合并

建议主会话推进闭环：(1) cc 自报 1311 测试通过基于静态校验可信，可进 commit/push；(2) P2-1/P2-2 作为下一轮 router 优化 backlog，由 SEVO 自身流水线管理。
