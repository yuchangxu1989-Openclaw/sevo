---
name: specify
description: "Run the SEVO specify stage to produce Spec artifacts. Use when 用户说写需求规格、定义需求、明确范围、出 spec，or say specify stage, write requirements, define scope."
hooks:
  bootstrap: scripts/inject.ts
---

# SpecSkill

需求规格 / run the specify stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`specify`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。

## 主动澄清协议

Spec 产出前必须执行模糊检测，发现以下信号时触发澄清流程：

1. **检测维度**：
   - 验收标准缺失或不可验证
   - 边界条件未定义（输入范围、异常路径、并发场景）
   - 术语首次出现但未给出定义
   - 依赖未声明（上游工件、外部服务、运行时假设）

2. **澄清问题结构**：
   - 问题描述：哪里模糊、为什么模糊
   - 模糊类型：纠偏 / 方法 / 决策 / 边界 / 经验 / 元认知
   - 影响范围：波及哪些 FR/AC
   - 建议选项（如有）

3. **收敛规则**：
   - 澄清回复必须当场写回 Spec Package 对应位置
   - 收敛结论按知识类型沉淀：纠偏→事实、方法→方法论记录、决策→ADR 候选、边界→约束条件、经验→experience 知识（沉淀到经验库 / lessons learned）、元认知→meta 知识（沉淀到方法论 / 流程改进建议）
   - 不留在对话或临时文件中
