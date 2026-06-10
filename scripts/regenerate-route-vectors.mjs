/**
 * Regenerate route-vectors.json with real volcengine-ark embeddings.
 * Adds Chinese samples for cross-lingual coverage.
 * Usage: node projects/sevo/scripts/regenerate-route-vectors.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OPENCLAW_CONFIG_PATH = resolve(process.env.HOME ?? '/root', '.openclaw', 'openclaw.json');
const ROUTE_VECTORS_PATH = resolve(import.meta.dirname, '..', 'data', 'route-vectors.json');

const CHINESE_SAMPLES = [
  { id: 'trigger-zh-01', scenario: 'pipeline-trigger', text: '开发一个新功能并完成规格说明、实现、审查和发布全流程。', route: { shouldTrigger: true, level: 2 } },
  { id: 'trigger-zh-02', scenario: 'pipeline-trigger', text: '修改项目源代码实现请求的行为变更并验证结果。', route: { shouldTrigger: true, level: 2 } },
  { id: 'trigger-zh-03', scenario: 'pipeline-trigger', text: '修复线上缺陷，编写回归测试，独立审查后发布。', route: { shouldTrigger: true, level: 2 } },
  { id: 'trigger-zh-04', scenario: 'pipeline-trigger', text: '重构多个模块的工作流并验证重构后行为不变。', route: { shouldTrigger: true, level: 2 } },
  { id: 'trigger-zh-05', scenario: 'pipeline-trigger', text: '先写测试再实现需求变更，验证用户可见结果正确。', route: { shouldTrigger: true, level: 2 } },
  { id: 'stage-spec-zh-01', scenario: 'stage:spec', text: '定义需求范围、边界、验收标准和用户验证条件。', route: { stage: 'spec' } },
  { id: 'stage-spec-zh-02', scenario: 'stage:spec', text: '把模糊的需求转化为完整的开发规格说明。', route: { stage: 'spec' } },
  { id: 'stage-spec-zh-03', scenario: 'stage:spec', text: '补充缺失的功能需求、验收标准和验证证据要求。', route: { stage: 'spec' } },
  { id: 'stage-spec-zh-04', scenario: 'stage:spec', text: '在实现开始前创建产品需求条目。', route: { stage: 'spec' } },
  { id: 'stage-spec-zh-05', scenario: 'stage:spec', text: '更新需求文档，添加可度量的验收标准。', route: { stage: 'spec' } },
  { id: 'stage-plan-zh-01', scenario: 'stage:plan', text: '在实现前规划架构和交互方案。', route: { stage: 'plan' } },
  { id: 'stage-plan-zh-02', scenario: 'stage:plan', text: '设计系统结构、数据流、集成边界和上线方案。', route: { stage: 'plan' } },
  { id: 'stage-plan-zh-03', scenario: 'stage:plan', text: '评估技术可行性并产出设计决策。', route: { stage: 'plan' } },
  { id: 'stage-plan-zh-04', scenario: 'stage:plan', text: '准备实现计划，列出风险、依赖和架构说明。', route: { stage: 'plan' } },
  { id: 'stage-plan-zh-05', scenario: 'stage:plan', text: '确定组件交互方式后再修改代码。', route: { stage: 'plan' } },
  { id: 'stage-implement-zh-01', scenario: 'stage:implement', text: '实现审批通过的变更，编辑范围限制在请求范围内。', route: { stage: 'implement' } },
  { id: 'stage-implement-zh-02', scenario: 'stage:implement', text: '编写测试和生产代码以满足验收标准。', route: { stage: 'implement' } },
  { id: 'stage-implement-zh-03', scenario: 'stage:implement', text: '修改应用行为并在本地验证实现效果。', route: { stage: 'implement' } },
  { id: 'stage-implement-zh-04', scenario: 'stage:implement', text: '修复缺陷并更新受影响的源文件。', route: { stage: 'implement' } },
  { id: 'stage-implement-zh-05', scenario: 'stage:implement', text: '完成编码任务并提供覆盖率证据。', route: { stage: 'implement' } },
  { id: 'stage-review-zh-01', scenario: 'stage:review', text: '审查已完成的实现，检查正确性、安全性和规格覆盖。', route: { stage: 'review' } },
  { id: 'stage-review-zh-02', scenario: 'stage:review', text: '审计代码变更，识别发布前的阻断问题。', route: { stage: 'review' } },
  { id: 'stage-review-zh-03', scenario: 'stage:review', text: '检查实现是否满足所有验收标准。', route: { stage: 'review' } },
  { id: 'stage-review-zh-04', scenario: 'stage:review', text: '对差异进行回归、缺失测试和不安全行为检查。', route: { stage: 'review' } },
  { id: 'stage-review-zh-05', scenario: 'stage:review', text: '运行审查门控并列出需要修复的问题。', route: { stage: 'review' } },
  { id: 'stage-fix-zh-01', scenario: 'stage:fix', text: '修复审查发现的阻断问题并返回重新验证。', route: { stage: 'fix' } },
  { id: 'stage-fix-zh-02', scenario: 'stage:fix', text: '处理实现中的审计失败项。', route: { stage: 'fix' } },
  { id: 'stage-fix-zh-03', scenario: 'stage:fix', text: '修复回归问题，保持修正在批准范围内。', route: { stage: 'fix' } },
  { id: 'stage-fix-zh-04', scenario: 'stage:fix', text: '解决上一个门控的 P0 和 P1 问题。', route: { stage: 'fix' } },
  { id: 'stage-fix-zh-05', scenario: 'stage:fix', text: '对审查发现应用后续补丁。', route: { stage: 'fix' } },
  { id: 'stage-publish-zh-01', scenario: 'stage:publish', text: '将验证通过的包或交付物发布到配置的目标。', route: { stage: 'publish' } },
  { id: 'stage-publish-zh-02', scenario: 'stage:publish', text: '准备发布说明、版本号、制品路由和发布证据。', route: { stage: 'publish' } },
  { id: 'stage-publish-zh-03', scenario: 'stage:publish', text: '审查和回归通过后发布已完成的变更。', route: { stage: 'publish' } },
  { id: 'stage-publish-zh-04', scenario: 'stage:publish', text: '完成包发布，所有质量门控通过后执行。', route: { stage: 'publish' } },
  { id: 'stage-publish-zh-05', scenario: 'stage:publish', text: '创建发布并记录已发布制品的位置。', route: { stage: 'publish' } },
  { id: 'stage-verify-zh-01', scenario: 'stage:verify', text: '从用户视角验证已发布或已部署的结果。', route: { stage: 'verify' } },
  { id: 'stage-verify-zh-02', scenario: 'stage:verify', text: '运行发布后验证，证明核心工作流产出有用结果。', route: { stage: 'verify' } },
  { id: 'stage-verify-zh-03', scenario: 'stage:verify', text: '在干净环境中检查最终交付物。', route: { stage: 'verify' } },
  { id: 'stage-verify-zh-04', scenario: 'stage:verify', text: '确认新用户可以安装、运行并观察到预期结果。', route: { stage: 'verify' } },
  { id: 'stage-verify-zh-05', scenario: 'stage:verify', text: '对已交付的能力进行冒烟测试和真实数据检查。', route: { stage: 'verify' } },
];

function readEmbeddingConfig() {
  if (!existsSync(OPENCLAW_CONFIG_PATH)) throw new Error(`openclaw.json not found at ${OPENCLAW_CONFIG_PATH}`);
  const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  const memSearch = cfg?.agents?.defaults?.memorySearch;
  if (memSearch?.remote?.baseUrl) {
    return {
      baseUrl: memSearch.remote.baseUrl.replace(/\/+$/, ''),
      apiKey: memSearch.remote.apiKey || 'local',
      model: memSearch.model || 'doubao-embedding-vision-251215',
    };
  }
  const provider = cfg?.models?.providers?.['volcengine-ark'];
  if (!provider?.apiKey || !provider?.baseUrl) throw new Error('volcengine-ark provider not configured');
  const model = provider.model || provider.models?.[0]?.id;
  if (!model) throw new Error('no embedding model found in volcengine-ark config');
  return { baseUrl: provider.baseUrl.replace(/\/+$/, ''), apiKey: provider.apiKey, model };
}

async function embedBatch(texts, config) {
  const url = `${config.baseUrl}/embeddings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${body}`);
  }
  const data = await response.json();
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

async function main() {
  const config = readEmbeddingConfig();
  console.log(`Provider: volcengine-ark, model: ${config.model}`);
  console.log(`Reading ${ROUTE_VECTORS_PATH}...`);

  const db = JSON.parse(readFileSync(ROUTE_VECTORS_PATH, 'utf8'));
  const existingSamples = db.samples.filter(s => !s.id.includes('-zh-'));
  console.log(`English samples: ${existingSamples.length}`);
  console.log(`Chinese samples to add: ${CHINESE_SAMPLES.length}`);

  const allSamples = [...existingSamples, ...CHINESE_SAMPLES];
  const BATCH_SIZE = 10;
  const allVectors = [];

  for (let i = 0; i < allSamples.length; i += BATCH_SIZE) {
    const batch = allSamples.slice(i, i + BATCH_SIZE);
    const texts = batch.map(s => s.text.slice(0, 4000));
    console.log(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allSamples.length / BATCH_SIZE)} (${texts.length} texts)...`);
    const vectors = await embedBatch(texts, config);
    allVectors.push(...vectors);
    if (i + BATCH_SIZE < allSamples.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`Got ${allVectors.length} vectors, dimension: ${allVectors[0]?.length}`);

  const now = new Date().toISOString();
  const updatedSamples = allSamples.map((sample, idx) => ({
    ...sample,
    vector: allVectors[idx],
    model: config.model,
    updatedAt: now,
  }));

  const updatedDb = {
    version: 1,
    updatedAt: now,
    providerId: 'volcengine-ark',
    model: config.model,
    thresholds: db.thresholds || { direct: 0.85, fallback: 0.6 },
    samples: updatedSamples,
  };

  writeFileSync(ROUTE_VECTORS_PATH, JSON.stringify(updatedDb, null, 2) + '\n', 'utf8');
  console.log(`Written ${updatedSamples.length} samples to ${ROUTE_VECTORS_PATH}`);
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
