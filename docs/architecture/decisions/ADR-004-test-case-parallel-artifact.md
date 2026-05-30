# ADR-004: 测试用例作为独立工件并行产出

状态：已采纳 | 2026-04-19

## 上下文

phase2-inputs.md 指出 Spec Review 通过后缺少测试用例并行编写活动。测试用例需要在 Implement 前可用，但不应阻塞 Contract 设计。需要明确测试用例在管线中的位置、触发时机、完成门禁和消费路径。

## 决策

测试用例作为独立工件（Test Case Document），由质量审计角色在 Spec Review Gate 通过后与 Contract 并行编写。Test Case Document 不属于 Contract Package，不阻塞 Contract Review Gate。Implement 阶段开发者获取 Test Case Document 作为自测参考，Review 和 Regression 阶段引用其中用例。

## 替代方案

| 方案 | 优势 | 放弃原因 |
|------|------|---------|
| 测试用例写入 Spec Package | 集中管理 | 混淆需求规格与测试设计的职责边界 |
| 测试用例写入 Contract Package | 与架构方案一起交付 | 阻塞 Contract 完成，增加架构师负担 |
| Implement 阶段再写测试用例 | 延迟投入 | 开发者缺少自测参考，Review 阶段无用例可引用 |

## 后果

- Spec Review Gate 通过后，Pipeline Orchestrator 同时激活 Contract 和 Test Case Authoring 两个阶段。
- Test Case Authoring 完成不阻塞 Contract Review Gate，但必须在 Implement 阶段激活前可用。若 Test Case Authoring 尚未完成，Pipeline Orchestrator 将 Implement 置为 blocked 直到 Test Case Document 就绪。
- 初期极简：每个高优先级 FR 的 AC 对应一条测试用例，后期可专项扩展。
- 存储位置：`{project}/docs/test-cases/`，由宿主适配层决定具体路径。
- Review 阶段审计员参考测试用例辅助评审，但测试用例不代表全部审计项。
