# ADR-004-Web: Web 层 API 风格选择

状态：已采纳 | 2026-04-20

## 上下文

SEVO 新增用户侧 Web 层后，需要一套稳定的对外接口来支撑项目总览、FR 详情、待办队列、门禁审批、澄清回复、质量摘要和工件预览。接口既要覆盖 UFR-01~UFR-08、UFR-13，又要保持对引擎层对象的解耦，不能把前端绑死在某个框架的数据获取方式上。

可选方案主要有三类：
- REST 资源接口：以项目、FR、门禁、待办、通知、工件为资源边界。
- GraphQL：前端按需组装字段，一次请求聚合多资源。
- 直接暴露引擎层 JSON / 文件：前端直接读取 PipelineInstance、StageRecord 等底层对象。

## 决策

Wave 1 的 Web 层 API 采用 REST 资源接口为主，按 Query API、Command API、Preview API、Event Stream API 分层定义：
- Query API：返回聚合后的只读 View Model，服务项目总览、FR 详情、质量摘要、工件索引、FR 全景。
- Command API：承载门禁审批、澄清回复、暂停/恢复/取消 FR 等状态变更。
- Preview API：专门负责 Markdown/报告预览，避免大文档拖慢主查询接口。
- Event Stream API：作为实时状态推送通道。

GraphQL 不作为 Wave 1 默认对外契约，只保留为后续只读聚合扩展点。前端禁止直接读取 pipelines 目录或直接消费引擎内部 JSON 结构。

## 替代方案

| 方案 | 优势 | 放弃原因 |
|------|------|---------|
| GraphQL 作为主接口 | 前端一次请求拿全字段，适合复杂聚合页 | 命令与审批动作仍需单独设计；Wave 1 维护成本高，缓存与鉴权复杂度增加 |
| 直接暴露引擎层 JSON / 文件 | 开发最快、零 BFF | 前端与引擎内部 schema 强耦合，权限控制粗糙，无法形成稳定用户侧契约 |
| 单一万能接口 | 服务端实现简单 | 资源边界不清，首页、详情页、工件预览互相拖累，难以演进 |

## 后果

- UFR-01~UFR-08、UFR-13 都有清晰的资源边界和命令边界，接口职责稳定。
- 前端框架可替换，只要继续消费 REST + SSE 契约即可，不影响引擎层。
- 服务端需要维护投影装配逻辑，把 StageRecord、GateVerdict、ClarificationRecord 组装为 View Model。
- 若后续出现更重的聚合查询场景，可在 REST 之上追加 GraphQL 只读层，而不破坏已有命令接口。
