// 用户痛点发现 · Host 半边。
// 工具：seekmoney_score（确定性优先级评分）+ seekmoney_quality（数据质量分级）。
// 技能：seekmoney-pain-finder（5 阶段方法论）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { scoreCluster, dataQuality } from '../lib/priority.js'
import { registerApi } from '../lib/api.js'
import { systemSection } from './systemPrompt.js'

export const name = 'seekmoney'

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入痛点发现方法论到系统提示'),
})

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object', additionalProperties: false, required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string' },
      data: { type: 'string' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

export const seekmoneyScoreTool = {
  name: 'seekmoney_score',
  description:
    '商机优先级评分（确定性计算，不算错）：需求强度（聚类占比+情绪加成）40% + 市场规模（数据维度+LLM评估）30% + 竞争度（连续函数 5/(1+n)，过滤无效方案）30%。综合 ≥3.5 High / ≥2.5 Medium / <2.5 Low。痛点发现流程阶段 4 必用。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['cluster_size', 'total_data_size', 'emotional_intensity', 'llm_market_score', 'existing_solutions'],
    properties: {
      cluster_size: num('该聚类簇的内容条数'),
      total_data_size: num('采集的总内容条数'),
      emotional_intensity: num('情绪强度 0-5（5=情绪激烈）'),
      llm_market_score: num('你评估的市场规模 0-5（基于聚类内容的市场潜力判断）'),
      existing_solutions: str('现有解决方案 JSON 数组，如 [{"name":"方案A","limitation":"价格贵"}]。待调研/解析失败的会被自动过滤'),
    },
  },
  timeoutMs: 10_000,
  output: OUTPUT,
  async execute(args) {
    let solutions
    try { solutions = JSON.parse(args.existing_solutions) } catch (e) {
      return result(false, `existing_solutions 不是合法 JSON: ${e.message}`)
    }
    if (!Array.isArray(solutions)) return result(false, 'existing_solutions 必须是数组')
    if (!Number.isFinite(args.cluster_size) || args.cluster_size <= 0) return result(false, 'cluster_size 必须是正数')
    if (!Number.isFinite(args.total_data_size) || args.total_data_size <= 0) return result(false, 'total_data_size 必须是正数')

    const score = scoreCluster({
      clusterSize: args.cluster_size,
      totalDataSize: args.total_data_size,
      emotionalIntensity: args.emotional_intensity,
      llmMarketScore: args.llm_market_score,
      existingSolutions: solutions,
    })
    const quality = dataQuality(args.total_data_size)

    return result(
      true,
      `优先级评分完成：综合 ${score.overall}/5（${score.level}）——需求 ${score.demand_intensity} · 市场 ${score.market_size} · 竞争度 ${score.competition}（5=蓝海）。数据质量：${quality.label}（${quality.advice}）。`,
      JSON.stringify({ ...score, data_quality: quality }, null, 1),
    )
  },
}

export const seekmoneyQualityTool = {
  name: 'seekmoney_quality',
  description: '数据质量分级：exploratory（<50 探索性）/ preliminary（50-200 初步结论）/ reliable（≥200 高置信度）。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['total_count'],
    properties: { total_count: num('采集的总内容条数') },
  },
  timeoutMs: 10_000,
  output: OUTPUT,
  async execute(args) {
    const q = dataQuality(args.total_count)
    return result(true, `数据质量：${q.label}（${q.level}）。${q.advice}。`, JSON.stringify(q, null, 1))
  },
}

export function apply(ctx, config) {
  ctx.skills.registerProvider(() => createSkillProvider([join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]))
  ctx.tools.register(seekmoneyScoreTool)
  ctx.tools.register(seekmoneyQualityTool)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }
  ctx.effect(() => registerApi(ctx), `${name}: routes`)
}

export const TOOLS = [seekmoneyScoreTool, seekmoneyQualityTool]
