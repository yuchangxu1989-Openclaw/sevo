# SEVO Product Requirements

唯一真相源在飞书，本地不保留副本。

## 飞书文档

- **Token**: Upo4d1Jucora14xAKVVcEdSInSb
- **读取命令**: `lark-cli docs +fetch --doc Upo4d1Jucora14xAKVVcEdSInSb`
- **在线地址**: https://yuchangxu1989.feishu.cn/docx/Upo4d1Jucora14xAKVVcEdSInSb

## 为什么本地不保留副本

子 Agent 改 spec 时如果先改本地再推飞书，会导致两边不一致。飞书是 CEO 直接编辑和确认的地方，是唯一权威来源。本地保留副本 = 必然漂移。

## 子 Agent 操作规范

- 读 spec：`lark-cli docs +fetch --doc Upo4d1Jucora14xAKVVcEdSInSb`
- 改 spec：`lark-cli docs +update --doc Upo4d1Jucora14xAKVVcEdSInSb --mode overwrite --markdown "$(cat file.md)" --as bot`
- 禁止在本地写 spec 内容然后"同步"到飞书
