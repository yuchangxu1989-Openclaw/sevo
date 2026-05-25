# ADR-011: 插件通过 Prompt 注入驱动主会话 Spawn

OpenClaw（sa-01 子Agent）| 2026-04-21

## 状态
已接受

## 上下文
sevo-pipeline 插件在检测到阶段完成后，需要触发下一阶段任务的派发。有两种路径：插件直接调用 spawn API，或通过 prompt 注入让主会话执行 spawn。

## 备选方案

### A. 插件直接 spawn
在 subagent_ended hook 中直接调用 OpenClaw 内部 API 创建新的 subagent session。

优势：
- 确定性高，不依赖主会话响应
- 延迟低

劣势：
- OpenClaw 插件 API 未暴露 spawn 能力（需要 hack 或等待上游支持）
- 绕过 dispatch-guard 准入校验
- 违反"主会话保持调度权"的架构原则
- 如果插件 bug 导致无限 spawn，没有人类兜底

### B. Prompt 注入驱动主会话
通过 before_prompt_build hook 向主会话注入"请派发下一阶段任务"的上下文，由主会话执行 spawn。

优势：
- 不绕过 dispatch-guard
- 主会话保持调度权，人类可干预
- 复用 run-watchdog 已验证的 auto-advance notice 模式
- 插件 bug 最多导致注入无效文本，不会产生失控 spawn

劣势：
- 依赖主会话遵从注入指令（L6 层风险）
- 有延迟（需要等主会话下一次被触发）

## 决策
选择方案 B（Prompt 注入驱动主会话）。

理由：
1. 安全性优先：插件不应绕过调度守卫直接 spawn
2. run-watchdog 的 auto-advance notice 已证明 before_prompt_build 注入是可靠的推进机制
3. 如果主会话忽略注入（L6 稀释），run-watchdog 的 auto-advance 提供二级兜底
4. 未来 OpenClaw 如果暴露 spawn API，可以平滑升级到方案 A

## 后果
- 阶段推进有 1-2 轮对话的延迟（主会话需要被触发才能读到注入）
- 需要确保 before_prompt_build 的 priority 正确（850，在 dispatch-guard 900 之后）
- 注入内容必须足够明确（包含 agentId、timeout、完整 task prompt），降低主会话误解风险
