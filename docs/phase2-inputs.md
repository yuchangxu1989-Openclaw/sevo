# SEVO Phase 2 架构设计输入

Phase 1（需求规格）已完成。本文件记录进入 Phase 2（架构设计）前发现的流程缺失和待解决项，arc42 必须逐条覆盖。

## 流程缺失

### 1. 测试用例并行编写

Spec Review 通过后，管线当前只定义了串行路径：Contract（架构设计）→ Implement → Review → Regression。

缺失的并行活动：Spec Review 通过后，质量角色应并行编写测试用例（独立文档），与架构师写 Contract 同时进行。

待架构设计明确的问题：
- 测试用例在管线中的精确触发时机和完成门禁
- 测试用例与 Contract Package 的关系（独立产物，不属于 Contract Package）
- Implement 阶段开发者如何获取和使用测试用例做自测
- Regression 阶段如何引用测试用例做回归
- Review 阶段审计员如何参考测试用例（仅参考，不代表全部审计项）
- 测试用例的最小结构定义（初期极简，每个 AC 对应一条用例）
- 测试用例的存储位置和版本管理

### 2.（待补充）

Phase 1 → Phase 2 过程中发现的其他流程缺失，持续追加到这里。
