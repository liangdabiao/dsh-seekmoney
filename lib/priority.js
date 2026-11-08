// 优先级评分系统：需求强度 / 市场规模 / 竞争度 / 综合优先级。
// 移植自 SeekMoney-ai 的 lib/services/priority-scoring.ts（MIT，liangdabiao）。
// 全部确定性公式——算数不经过大模型，不会算错。

const round1 = (v) => Math.round(v * 10) / 10

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * 需求强度（0-5）：基于聚类占比 + 情绪加成
 * 占比 10% = 1 分，最高 5 分；情绪强度 0-5 最多贡献 1 分
 */
export function calculateDemandIntensity(clusterSize, totalSize, emotionalIntensity) {
  if (totalSize <= 0) return 0
  const sizeRatio = clusterSize / totalSize
  const sizeScore = Math.min(5, sizeRatio * 10)
  const emotionBoost = (Math.max(0, Math.min(5, emotionalIntensity)) / 5) * 1.0
  return round1(Math.min(5, sizeScore + emotionBoost))
}

/**
 * 市场规模（0-5）：数据维度得分 40% + LLM 评估的市场规模 60%
 */
export function calculateMarketSize(clusterSize, totalDataSize, llmMarketScore) {
  let dataScore = 2.5
  if (totalDataSize >= 50) {
    const sizeRatio = clusterSize / totalDataSize
    dataScore = Math.min(5, 2.0 + sizeRatio * 15)
    if (totalDataSize >= 200) dataScore = Math.min(5, dataScore + 0.5)
    else if (totalDataSize >= 100) dataScore = Math.min(5, dataScore + 0.3)
  }
  const llmScore = Math.max(0, Math.min(5, llmMarketScore))
  return round1(dataScore * 0.4 + llmScore * 0.6)
}

/**
 * 竞争度（0-5，反向指标）：连续函数 f(n) = 5/(1+n)
 * 0 个竞品 = 5.0（纯蓝海）；1 个 = 2.5；4 个 = 1.0；99 个 ≈ 0.05（红海）
 * 能体现 4 vs 100 的差距，又保留对 0 竞品的强奖励。
 */
export function calculateCompetition(existingSolutions) {
  // 过滤"待调研"、"解析失败"等无效方案
  const INVALID_MARKERS = ['待调研', '解析失败', 'API调用失败']
  const validCount = existingSolutions.filter(
    (s) => !INVALID_MARKERS.some((m) => String(s?.name || '').includes(m)),
  ).length
  return Math.round((5 / (1 + validCount)) * 100) / 100
}

/**
 * 综合优先级：需求 40% + 市场 30% + 竞争 30%
 * ≥3.5 High / ≥2.5 Medium / <2.5 Low
 */
export function calculatePriority(demandIntensity, marketSize, competition) {
  const overall = demandIntensity * 0.4 + marketSize * 0.3 + competition * 0.3
  let level
  if (overall >= 3.5) level = 'High'
  else if (overall >= 2.5) level = 'Medium'
  else level = 'Low'
  return {
    demand_intensity: demandIntensity,
    market_size: marketSize,
    competition,
    overall: round1(overall),
    level,
  }
}

/** 完整评分流程（一次性计算所有维度）
 *  入参必须是有限数字：情绪强度 / 市场分也在 0-5。
 *  之前这两个参数没校验，传 undefined / 字符串会算出 NaN，
 *  而 calculatePriority 里 NaN 落不进任何分支 → 静默给出 level: 'Low'（假结论）。
 *  这里显式抛错，由工具层转成可读的参数错误。 */
export function scoreCluster({ clusterSize, totalDataSize, emotionalIntensity, llmMarketScore, existingSolutions }) {
  for (const [key, value, min, max] of [
    ['clusterSize', clusterSize, 0, Infinity],
    ['totalDataSize', totalDataSize, 0, Infinity],
    ['emotionalIntensity', emotionalIntensity, 0, 5],
    ['llmMarketScore', llmMarketScore, 0, 5],
  ]) {
    if (!Number.isFinite(value)) throw new TypeError(`${key} 必须是数字（收到 ${JSON.stringify(value)}）`)
    if (value < min || value > max) throw new TypeError(`${key} 必须在 ${min}~${max} 之间（收到 ${value}）`)
  }
  if (clusterSize > totalDataSize) {
    throw new TypeError(`clusterSize（${clusterSize}）不能大于 totalDataSize（${totalDataSize}）——聚类内容条数不可能超过采集总量`)
  }
  if (!Array.isArray(existingSolutions)) throw new TypeError('existingSolutions 必须是数组')

  const demand = calculateDemandIntensity(clusterSize, totalDataSize, emotionalIntensity)
  const market = calculateMarketSize(clusterSize, totalDataSize, llmMarketScore)
  const competition = calculateCompetition(existingSolutions)
  return calculatePriority(demand, market, competition)
}

/** 数据质量分级（原项目：exploratory / preliminary / reliable） */
export function dataQuality(totalCount) {
  if (totalCount < 50) return { level: 'exploratory', label: '探索性', advice: '数据不足，建议进一步验证' }
  if (totalCount < 200) return { level: 'preliminary', label: '初步结论', advice: '适合初期研究' }
  return { level: 'reliable', label: '高置信度', advice: '统计显著' }
}
