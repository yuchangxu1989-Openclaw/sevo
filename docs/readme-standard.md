# SEVO README 撰写规范

本文档是 SEVO 受管项目 README 的结构与质量标准。README 面向首次接触项目的外部用户，目标是在最短路径内说明产品是什么、如何体验、能得到什么结果、什么情况下适合使用。

## 1. 文档定位与适用范围

README 是项目的用户入口，不是内部研发记录、阶段日志或理念长文。

适用范围：所有由 SEVO 管理、需要对外交付或独立仓库同步的项目 README，尤其是 CLI、Agent 流水线、控制面、知识层、Web 控制台这类抽象产品。

读者默认是第一次打开仓库的陌生用户。写法必须先解决理解和上手，再展开架构、理念和生产配置。

## 2. 首屏必须包含的 5 个元素

首屏按以下顺序组织：

1. **Logo / banner / 产品名**：首屏第一块必须让用户知道这是一个可识别产品，不是内部说明文档。没有成熟品牌图时，至少用居中 H1 和一行导航替代。
2. **一句话 tagline**：12-18 个英文词或 1 行中文，同时说明对象、动作、结果。不要先讲理念、历史或生态关系。
3. **3-5 个可信度 badges 或 proof chips**：优先使用 license、npm version/downloads、test count/build status、GitHub stars、docs、Discord/社群。没有真实数据不得编造；可以使用可验证 proof chip，例如测试数量或通过状态。
4. **2-3 句产品定义**：第一句说明它是什么；第二句说明它替代或补强什么现有工作流；第三句说明用户跑完后得到什么结果。
5. **Quickstart 代码块**：首屏内或首屏后第一屏必须出现。用户不应读完多段理念才看到可执行命令。

## 3. tagline 写法公式

英文公式：

```text
[产品名] is a [具体类别] for [目标用户/系统] that [核心动作] so [可验证结果].
```

中文公式：

```text
[产品名] 是给 [目标用户/系统] 用的 [具体类别]，把 [痛点动作] 变成 [可验证结果]。
```

质量要求：

- 只保留一个主谓宾，不堆叠抽象名词。
- 避免让“自主进化”“治理内核”等理念先行；理念放到 Why 或 Architecture。
- 可以对标，但句子不能依赖竞品名才能成立。

SEVO 推荐 tagline：

```text
SEVO is a spec-to-release pipeline for AI coding agents that turns vague requests into reviewed, tested, user-verifiable delivery.
```

## 4. Quickstart 约束

Quickstart 必须满足以下约束：

- **最多 4 步**。超过 4 步时拆成 `Quickstart` 和 `Production setup`。
- **第一步必须是可复制命令**，不是“阅读文档”或“安装前准备”。优先使用 `npm install -g ...`、`npx ... demo`、`docker run ...` 这类命令。
- **必须包含一个无外部凭据的体验路径**，例如 `sevo demo`。如果正式使用需要 LLM provider，把 provider 配置放到 Quickstart 后的 `Production setup`。
- **必须写明运行结果**：运行后会打开什么页面、生成什么文件、看到什么状态，不能只列命令。

## 5. 对比表原则

README 中的对比表用于帮助用户选择，不用于攻击竞品。

原则：

1. 先按用户选择维度比较，不先评价谁更强。
2. 只比较可证实差异：安装路径、运行形态、是否自托管、是否需要多 agent、是否有门禁、是否有可追溯 ledger。
3. 避免“更强、更智能、更企业级”这类空泛形容词；改写成可验证问题，例如“是否有独立审计”“是否发布后差距扫描”“是否单 agent 可运行”。
4. 竞品点名必须少而准，且有明确技术差异或 benchmark 支撑。没有数据时用“何时选 X / 何时选本项目”的选择表。
5. 推荐使用选择表字段：`Use this when`、`Not for`、`First command`、`Output artifact`、`Requires provider?`。

## 6. 视觉最低要求

最低可接受标准：首屏居中产品名，加 1 张架构/流程 SVG 或终端录屏 GIF。

SEVO README 必须包含：

- 14 阶段流水线压缩图。
- `sevo demo` 终端输出截图或 GIF。
- 能说明“请求如何进入流水线、阶段如何推进、证据如何沉淀”的图，而不是只放 logo。

抽象系统尤其需要图或动态演示降低理解成本。只放 logo 不合格。

## 7. 推荐 README 主体顺序

默认按以下顺序组织：

1. Hero：Logo/名称 + tagline + badges + links。
2. 2-3 句产品定义。
3. Quickstart：4 步以内，可复制，可无凭据体验。
4. What you get：3-5 个结果导向 bullets。
5. How it works：一张图 + 4-6 个模块。
6. When to use / not use：选择表。
7. Comparison / positioning：只放可证实差异。
8. Production setup：provider、权限、配置、CI/部署。
9. Docs / examples / community / license。

## 8. SEVO README 骨架示例

```markdown
# SEVO

> Spec-to-release pipeline for AI coding agents that turns vague requests into reviewed, tested, user-verifiable delivery.

[Docs] [Quickstart] [Demo] [npm] [License] [Tests]

SEVO gives coding agents a delivery process, not just a prompt. It pushes each change through spec, review, implementation, audit, smoke testing, UX checks, release verification, and post-release gap scanning.

## Quickstart

```bash
npm install -g sevo-pipeline
sevo demo
```

`sevo demo` runs a local end-to-end walkthrough without an LLM provider.

## Use SEVO when

- You need a repeatable delivery gate for coding agents.
- Requirements drift between prompt, code, review, and release.
- Build success alone is not enough proof.

## What SEVO enforces

- Specify before implement.
- Independent audit instead of self-grading.
- Evidence-gated stage transitions.
- Release followed by endgame convergence checks.
- Single-agent fallback when no team is available.

## How it works

[14-stage pipeline diagram]

Request → Spec → Review → Contract → Implement → Audit → Smoke → UX → Regression → Gate → Deploy → Verify → Ledger.

## SEVO vs normal coding-agent workflow

| Question | Normal workflow | SEVO |
|---|---|---|
| Before coding | Prompt interpretation | Structured spec + gate |
| Review model | Same loop often reviews itself | Independent audit role |
| Proof of success | Build/test output | Smoke + UX + regression + gap scan |
| After release | Usually stops | Endgame convergence loop |

## Production setup

Run `sevo init`, `sevo doctor`, `sevo project create`, and `sevo fr add`. Production runs need a configured LLM provider; `sevo demo` does not.

## Docs and community

- Full docs: ./docs
- Architecture: ./docs/architecture
- Issues: GitHub Issues
- License: MIT
```

## 9. 禁止事项

- 禁止在 README 正文写调研过程、修改记录、版本迁移说明或“本次重写”。
- 禁止伪造 badges、benchmark、下载量、测试数量或社区规模。
- 禁止用理念章节压过 Quickstart。
- 禁止只写内部运行方式，不写陌生用户第一步。
- 禁止让 README 示例命令依赖本机隐藏状态、内部路径或未声明凭据。
