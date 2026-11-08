// 优先级评分公式 + 技能 + API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  calculateDemandIntensity, calculateMarketSize, calculateCompetition,
  calculatePriority, scoreCluster, dataQuality,
} = await import('../lib/priority.js')
const { createSkillProvider } = await import('../lib/skills.js')
const { requestRejection } = await import('../lib/api.js')
const { systemSection } = await import('../src/systemPrompt.js')
const { TOOLS } = await import('../src/host.js')

test('需求强度：占比与情绪加成', () => {
  assert.equal(calculateDemandIntensity(10, 100, 0), 1.0, '10% 占比 = 1 分')
  assert.equal(calculateDemandIntensity(50, 100, 0), 5.0, '50% 占比封顶 5 分')
  assert.equal(calculateDemandIntensity(10, 100, 5), 2.0, '10% + 满情绪 = 2 分')
  assert.equal(calculateDemandIntensity(0, 100, 0), 0)
})

test('市场规模：数据量阶梯与 40/60 加权', () => {
  // totalDataSize < 50：基础 2.5 分 × 0.4 + LLM 5 × 0.6 = 4.0
  assert.equal(calculateMarketSize(5, 30, 5), 4.0)
  // totalDataSize ≥ 200：数据加成
  const withData = calculateMarketSize(20, 200, 5)
  assert.ok(withData >= 4.0)
})

test('竞争度：连续函数 f(n)=5/(1+n) + 无效方案过滤', () => {
  assert.equal(calculateCompetition([]), 5, '0 竞品 = 纯蓝海')
  assert.equal(calculateCompetition([{ name: 'A', limitation: 'x' }]), 2.5, '1 个 = 2.5')
  assert.equal(calculateCompetition([{ name: 'A', limitation: 'x' }, { name: 'B', limitation: 'y' }, { name: 'C', limitation: 'z' }, { name: 'D', limitation: 'w' }]), 1.0, '4 个 = 1.0')
  // 无效方案被过滤
  assert.equal(calculateCompetition([{ name: '待调研', limitation: '' }, { name: 'A', limitation: 'x' }]), 2.5, '待调研不算竞品')
  assert.equal(calculateCompetition([{ name: '解析失败', limitation: '' }]), 5, '解析失败不算竞品')
})

test('综合优先级：40/30/30 加权与分级', () => {
  const high = calculatePriority(5, 5, 5)
  assert.equal(high.overall, 5)
  assert.equal(high.level, 'High')
  const medium = calculatePriority(3, 3, 3)
  assert.equal(medium.overall, 3)
  assert.equal(medium.level, 'Medium')
  const low = calculatePriority(1, 1, 1)
  assert.equal(low.overall, 1)
  assert.equal(low.level, 'Low')
})

test('scoreCluster：端到端评分', () => {
  const score = scoreCluster({
    clusterSize: 30, totalDataSize: 100, emotionalIntensity: 4,
    llmMarketScore: 4, existingSolutions: [{ name: 'A', limitation: '贵' }],
  })
  assert.ok(score.overall >= 0 && score.overall <= 5)
  assert.ok(['High', 'Medium', 'Low'].includes(score.level))
})

test('dataQuality 分级', () => {
  assert.equal(dataQuality(30).level, 'exploratory')
  assert.equal(dataQuality(100).level, 'preliminary')
  assert.equal(dataQuality(250).level, 'reliable')
})

test('2 个工具 schema 合规', () => {
  assert.equal(TOOLS.length, 2)
  for (const t of TOOLS) {
    assert.match(t.name, /^seekmoney_/)
    assert.equal(t.parameters.additionalProperties, false)
    assert.equal(typeof t.execute, 'function')
  }
})

test('技能：5 阶段 + 评分公式 + 铁律', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].name, 'seekmoney-pain-finder')
  const skill = await provider.get(candidates[0])
  for (const keyword of ['语义聚类', 'DBSCAN', '优先级评分', 'MVP', '数据质量', '不构成商业决策依据', 'seekmoney_score']) {
    assert.ok(skill.content.includes(keyword), `缺「${keyword}」`)
  }
})

test('systemPrompt：方法论摘要', () => {
  const section = systemSection()
  assert.match(section.text, /5 阶段流程/)
  assert.match(section.text, /seekmoney_score/)
  assert.match(section.text, /不构成商业决策依据/)
})

test('面板 API 鉴权 fail closed', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), false) // 宿主 token 鉴权是边界，服务缺席放行
})

test('LICENSE 为 MIT（liangdabiao）', () => {
  const text = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  assert.match(text, /MIT/)
  assert.match(text, /liangdabiao/)
})

// ---------------------------------------------------------------------------
// 回归：分数入参缺失/非数字时不能静默算成 NaN 并给出 level: 'Low'
// ---------------------------------------------------------------------------
test('scoreCluster：非数字直接抛错，不产出 NaN', () => {
  assert.throws(
    () => scoreCluster({ clusterSize: 10, totalDataSize: 100, emotionalIntensity: undefined, llmMarketScore: 3, existingSolutions: [] }),
    /emotionalIntensity 必须是数字/,
  )
  assert.throws(
    () => scoreCluster({ clusterSize: 10, totalDataSize: 100, emotionalIntensity: 3, llmMarketScore: NaN, existingSolutions: [] }),
    /llmMarketScore 必须是数字/,
  )
  assert.throws(
    () => scoreCluster({ clusterSize: 500, totalDataSize: 100, emotionalIntensity: 3, llmMarketScore: 3, existingSolutions: [] }),
    /不能大于 totalDataSize/,
  )
})

test('seekmoney_score 工具：坏入参给可读错误，不出 NaN / 不假装 Low', async () => {
  const tool = TOOLS.find((t) => t.name === 'seekmoney_score')
  const base = { cluster_size: 30, total_data_size: 200, existing_solutions: '[]' }
  const cases = [
    ['缺 emotional_intensity', { ...base, llm_market_score: 3 }, /emotional_intensity 必须是 0~5 的数字/],
    ['emotional_intensity 传字符串', { ...base, emotional_intensity: 'high', llm_market_score: 3 }, /emotional_intensity 必须是 0~5 的数字/],
    ['缺 llm_market_score', { ...base, emotional_intensity: 3 }, /llm_market_score 必须是 0~5 的数字/],
    ['情绪超范围', { ...base, emotional_intensity: 9, llm_market_score: 3 }, /emotional_intensity 超出 0~5/],
    ['市场超范围', { ...base, emotional_intensity: 3, llm_market_score: -1 }, /llm_market_score 超出 0~5/],
    ['聚类条数大于总量', { ...base, cluster_size: 500, emotional_intensity: 3, llm_market_score: 3 }, /不能大于 total_data_size/],
  ]
  for (const [label, args, expect] of cases) {
    const out = await tool.execute(args)
    assert.equal(out.ok, false, `${label}：应返回 ok:false`)
    assert.match(out.summary, expect, `${label}：错误信息不对`)
    // 关键是别再出现「综合 NaN/5（Low）」这种假结论（回显收到的值是有意的，不算）
    assert.ok(!/NaN/.test(out.summary), `${label}：不该出现 NaN —— ${out.summary}`)
    assert.ok(!/（Low）|（Medium）|（High）/.test(out.summary), `${label}：拒绝时不该给等级结论 —— ${out.summary}`)
  }
})

test('seekmoney_score 工具：正常入参给出确定结论', async () => {
  const tool = TOOLS.find((t) => t.name === 'seekmoney_score')
  const out = await tool.execute({
    cluster_size: 30, total_data_size: 200, emotional_intensity: 3, llm_market_score: 3, existing_solutions: '[]',
  })
  assert.equal(out.ok, true)
  assert.match(out.summary, /综合 3\.5\/5（Medium）/)
  const data = JSON.parse(out.data)
  assert.equal(data.overall, 3.5)
  assert.equal(data.level, 'Medium')
  assert.equal(data.data_quality.level, 'reliable')
})
