// 用户痛点发现 · Host 半边。
// 工具：seekmoney_search（TikHub 多平台搜索）+ seekmoney_comments（拉评论）
//       + seekmoney_score（确定性优先级评分）+ seekmoney_quality（数据质量分级）。
// 技能：seekmoney-pain-finder（5 阶段方法论）。
// 密钥：本插件自带 tikhubToken（面板「⚙️ 设置」或插件 Config），不依赖其它插件。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { scoreCluster, dataQuality } from '../lib/priority.js'
import { registerApi } from '../lib/api.js'
import { searchPlatform, fetchComments, TikHubError } from '../lib/tikhub.js'
import { PLATFORM_KEYS, ENABLED_KEYS, PLATFORMS, platformList } from '../lib/platforms.js'
import { resolveToken } from '../lib/settings.js'
import { systemSection } from './systemPrompt.js'

export const name = 'seekmoney'

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入痛点发现方法论到系统提示'),
  tikhubToken: Schema.string().default('')
    .description('TikHub API token（也可在面板「⚙️ 设置」里粘贴，存本机 $DSH_HOME/seekmoney/settings.json）'),
})

const configRef = { config: Config }

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

export const seekmoneySearchTool = {
  name: 'seekmoney_search',
  description:
    '多平台真实内容搜索（TikHub，一个 key 打通全部渠道）：按关键词搜小红书/抖音/TikTok/B站/YouTube/微信视频号 的笔记与视频，' +
    '返回「用户原话」（标题/正文 + 作者 + 互动量 + 链接 + id）。痛点发现流程第①步（多平台采集）就用它，' +
    '拿到 id 后可再用 seekmoney_comments 拉评论。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['platform', 'keyword'],
    properties: {
      platform: str(
        `平台（已启用：${ENABLED_KEYS.map((k) => `${k}=${PLATFORMS[k].label}`).join(' / ')}；twitter/reddit 参考实现里未启用）`,
        { enum: PLATFORM_KEYS },
      ),
      keyword: str('搜索词，如「猫咪 自助理毛」「健身 App 痛点」'),
      page: num('页码，从 1 开始（默认 1）'),
      limit: num('返回条数（默认 20，最多 50）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    const platform = String(args.platform || '')
    const keyword = String(args.keyword || '').trim()
    if (!keyword) return result(false, 'keyword 不能为空')
    const page = Number.isFinite(args.page) && args.page > 0 ? Math.floor(args.page) : 1
    const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(50, Math.floor(args.limit))) : 20
    try {
      const out = await searchPlatform(configRef.config, platform, keyword, { page, limit })
      if (out.count === 0) {
        return result(
          true,
          `${out.label} 搜「${keyword}」没有解析出内容（可能无结果或页面结构变化）。可换关键词/换平台，或让用户粘贴内容。`,
          out.rawSample ? `原始返回片段：\n${out.rawSample}` : '',
        )
      }
      const lines = out.items.map(
        (n, i) =>
          `${i + 1}. [liked ${n.liked}${n.collected ? ` · collected ${n.collected}` : ''} · comments ${n.comments}] ` +
          `${n.title || n.description || '(无标题)'}${n.author ? ` —— @${n.author}` : ''}` +
          `${n.id ? `\n   id: ${n.id}` : ''}${n.url ? `\n   ${n.url}` : ''}`,
      )
      return result(
        true,
        `${out.label} 搜「${keyword}」第 ${page} 页，拿到 ${out.count} 条（TikHub 真实数据）。`,
        lines.join('\n'),
      )
    } catch (err) {
      return result(false, err instanceof TikHubError ? err.message : `搜索失败：${err.message}`)
    }
  },
}

export const seekmoneyCommentsTool = {
  name: 'seekmoney_comments',
  description:
    '拉某条内容的评论（TikHub，本插件自带 token）：小红书 / 抖音 / TikTok / B站 / YouTube / 微信视频号。评论是痛点的金矿——' +
    '先用 seekmoney_search 拿到 id，再用它取评论原话（正文 + 作者 + 点赞 + IP 属地）。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['platform', 'item_id'],
    properties: {
      platform: str(
        `平台（评论已接入：${PLATFORM_KEYS.filter((k) => PLATFORMS[k].comments).join(' / ')}）`,
        { enum: PLATFORM_KEYS },
      ),
      item_id: str('内容 id（seekmoney_search 返回的 id，如小红书 note_id / 抖音 aweme_id）'),
      cursor: str('翻页游标（可选）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    const platform = String(args.platform || '')
    const itemId = String(args.item_id || '').trim()
    if (!itemId) return result(false, 'item_id 不能为空')
    try {
      const out = await fetchComments(configRef.config, platform, itemId, { cursor: String(args.cursor || '') })
      if (out.count === 0) {
        return result(true, `${out.label} 的这条内容没解析出评论（可能未开评论或结构变化）。`, out.rawSample ? `原始返回片段：\n${out.rawSample}` : '')
      }
      const lines = out.items.map((c, i) => `${i + 1}. [liked ${c.liked}${c.ipLocation ? ` · ${c.ipLocation}` : ''}] ${c.content}${c.author ? ` —— @${c.author}` : ''}`)
      return result(true, `${out.label} 评论 ${out.count} 条（TikHub 真实数据）。`, lines.join('\n'))
    } catch (err) {
      return result(false, err instanceof TikHubError ? err.message : `拉评论失败：${err.message}`)
    }
  },
}

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
    // 这两个分项之前没校验：传 undefined/字符串会算出 NaN，再被判成 level: 'Low'（假结论）。
    if (!Number.isFinite(args.emotional_intensity)) {
      return result(false, `emotional_intensity 必须是 0~5 的数字（收到 ${JSON.stringify(args.emotional_intensity)}）。按第 ③ 步的情感强度填，例如 3.5；不确定就填 3。`)
    }
    if (!Number.isFinite(args.llm_market_score)) {
      return result(false, `llm_market_score 必须是 0~5 的数字（收到 ${JSON.stringify(args.llm_market_score)}）。按 ③ 步对市场潜力的判断填，例如 3；不确定就填 3。`)
    }
    if (args.emotional_intensity < 0 || args.emotional_intensity > 5) {
      return result(false, `emotional_intensity 超出 0~5（收到 ${args.emotional_intensity}）。`)
    }
    if (args.llm_market_score < 0 || args.llm_market_score > 5) {
      return result(false, `llm_market_score 超出 0~5（收到 ${args.llm_market_score}）。`)
    }
    if (args.cluster_size > args.total_data_size) {
      return result(false, `cluster_size（${args.cluster_size}）不能大于 total_data_size（${args.total_data_size}）——聚类内容条数不可能超过采集总量，请检查两个数字。`)
    }

    let score
    try {
      score = scoreCluster({
        clusterSize: args.cluster_size,
        totalDataSize: args.total_data_size,
        emotionalIntensity: args.emotional_intensity,
        llmMarketScore: args.llm_market_score,
        existingSolutions: solutions,
      })
    } catch (err) {
      return result(false, `评分失败：${err.message}`)
    }
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
  configRef.config = config
  ctx.skills.registerProvider(() => createSkillProvider([join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]))
  ctx.tools.register(seekmoneySearchTool)
  ctx.tools.register(seekmoneyCommentsTool)
  ctx.tools.register(seekmoneyScoreTool)
  ctx.tools.register(seekmoneyQualityTool)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }
  ctx.effect(() => registerApi(ctx, config), `${name}: routes`)
}

export const TOOLS = [seekmoneySearchTool, seekmoneyCommentsTool, seekmoneyScoreTool, seekmoneyQualityTool]

/** 供面板/健康检查：token 是否已配置（只回布尔） */
export function tokenConfigured(config = configRef.config) {
  return Boolean(resolveToken(config))
}
