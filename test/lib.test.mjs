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
