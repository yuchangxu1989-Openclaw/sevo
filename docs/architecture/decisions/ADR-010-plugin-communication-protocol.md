# ADR-010: SEVO OpenClaw 插件通信协议

OpenClaw（sa-01 子Agent）| 2026-04-21

## 状态
已接受

## 上下文
sevo-pipeline 插件需要在 subagent completion event 中识别"这个 completion 属于哪个 SEVO pipeline 的哪个 stage"。OpenClaw 的 sessions_spawn API 没有 metadata 透传字段，可选方案有限。

## 备选方案

### A. Label 协议
在 sessions_spawn 的 label 参数中编码 pipeline 信息：`sevo:<pipelineId>:<stageId>:<attempt>`。

优势：
- 零侵入，不需要修改 OpenClaw core
- label 在 subagent_ended event 中可靠传递（aco-run-watchdog 已验证）
- 人类可读，调试友好

劣势：
- label 长度有限（实测 ~200 字符，够用）
- 如果主会话手动 spawn 时覆盖 label，关联断裂

### B. 看板 metadata 关联
在 subagent-task-board.json 的 task.meta 中写入 pipeline 信息。

优势：
- 结构化数据，不受 label 长度限制

劣势：
- 需要在 spawn 前写看板（时序耦合）
- aco-run-watchdog 可能覆盖 meta 字段
- 增加看板读写竞争

### C. 独立映射表
维护 `sessionKey → pipelineId+stageId` 的映射文件。

优势：
- 完全解耦

劣势：
- 多一个状态文件要维护
- spawn 和 completion 之间的 sessionKey 可能变化（ACP 场景）

## 决策
选择方案 A（Label 协议），辅以方案 C 作为 fallback。

理由：
1. Label 是 OpenClaw 已有的、经过验证的关联机制
2. 插件通过 before_tool_call hook 自动注入 label，不依赖主会话手动填写
3. 极端情况下（label 丢失），从 active-pipelines.json + 看板 title 做模糊匹配

## 后果
- 所有 SEVO 相关的 spawn 必须带 `sevo:` 前缀 label
- 插件需要在 before_tool_call 中路由 sessions_spawn 并注入 label
- 非 SEVO 任务的 label 不受影响（不以 `sevo:` 开头的直接跳过）
