# Router Level Classifier 修复

OpenClaw（主会话）/ 2026-05-24

## 用户人群
SEVO 流水线使用者（包括 OpenClaw 主会话、所有受管项目研发 Agent）。

## 痛点
当前 SEVO `sevo from <slug> spec --description "xxx"` 命令把 description 收下了从不喂给路由，CLI 入口写死 `scope: {}`，导致 `isL0` 守卫的「全 false flag + 默认值」分支必中。所有 FR 实装类任务被误判 L0，跳过 architecture-design，编码 Agent 边写边猜架构，产出超时或埋雷。

实证 badcase（2026-05-24）：4 路 KIVO P 域 FR 实装 + arc42 架构补丁全被路由判 L0，hermes / opencode 30min 超时 0 输出。

## 原始需求
让 SEVO 路由识别 description 里的实装信号，FR 实装类任务必须走 architect。同时保留真 L0（typo / 注释 / 单行修复）走快速通道。

## 用户体验流
1. 用户跑 `sevo from <slug> spec --description "实装 FR-XXX"` 
2. SEVO 路由读 description，启发式 + LLM 推断 isNewModule=true / estimatedFiles>=2 → 判 L1
3. requiredStages 含 architecture-design，下游派 sa 出架构后再派编码 Agent
4. 用户跑 `sevo from <slug> spec --description "修个 typo" --level L0` 时显式越权直降 L0
5. LLM 推断失败 / description 缺失 → 默认 L1（保守）

## 功能需求

### FR-1 description 推断 scope
路由判定前调用 description-scope-inferrer 模块从 description 推断 TaskScope（isNewModule、estimatedFiles、estimatedLines、affectedDomains、hasDataModelChange）。

### AC
- AC1 启发式：description 含「实装 / 实现 / 新增 / 添加 / 创建 / 编写」+ 模块名 → isNewModule=true
- AC2 启发式：description 含多个模块名 / 跨多个 FR → 多 domain
- AC3 LLM 兜底：启发式不命中时调用 penguin-main/claude-opus-4-7 推断
- AC4 LLM 失败 → 返回 L1 默认
- AC5 JSON 解析异常 → 返回 L1 默认

### FR-2 强默认 L1
CLI 入口 TaskScope 不全时强默认 L1（含 architect）。

### AC
- AC1 cmd-from.ts 不再写死 `scope: {}`
- AC2 推断失败 / description 缺失 → 走 L1 路径
- AC3 isL0 函数加额外 guard：必须 scope.userExplicitL0=true 才判 L0

### FR-3 显式 --level 越权
CLI 加 `--level <level>` 入参（valid: L0/L1/L2+），用户主动指定时尊重。

### AC
- AC1 `--level=L0` → 直接 L0（绕开推断）
- AC2 `--level=L2+` → 强制 L2+（即使描述是 typo）
- AC3 入参解析与 description 推断顺序：显式 --level 优先

### FR-4 ProjectConfig.forceArchDesignAllLevels
项目级开关，默认关闭。开启后即使 L0 也强制走 architect。

### AC
- AC1 ProjectConfig 新增 `forceArchDesignAllLevels?: boolean` 字段
- AC2 默认 false，向后兼容
- AC3 开启后 L0 routing requiredStages 含 architecture-design

## 测试用例
1. typo 修复 + `--level=L0` → L0
2. 「实装 FR-Pxx」描述 → L1
3. 多文件改动描述 → L1
4. 跨 domain 描述 → L2+
5. 显式 `--level=L2+` → L2+（即使描述是 typo）
6. LLM 失败 → 默认 L1
7. 解析异常 → 默认 L1
