// TikHub 客户端（本插件自带 token，一个 key 打通全部渠道）。
// 端点/方法/参数/取值路径对齐参考实现 资料/SeekMoney-ai-main/lib/services/tikhub-client.ts：
//   douyin 搜索是 POST + JSON body；wechat 搜索也是 POST；其余 GET + query。
// 错误处理：401/403 给认证提示（指向本面板「⚙️ 设置」），429 按 retry-after 退避，
// 网络错误指数退避；token 缺失直接抛（不进重试循环，也不包装成"网络失败"）。
import { setTimeout as sleep } from 'node:timers/promises'
import { PLATFORMS, platformOf, platformList } from './platforms.js'
import { resolveToken } from './settings.js'

const BASE_URL = 'https://api.tikhub.io'

export class TikHubError extends Error {}

function requireToken(config) {
  const token = resolveToken(config)
  if (!token) {
    throw new TikHubError(
      'TikHub token 未配置：在本插件面板「⚙️ 设置」标签粘贴即可（api.tikhub.io 注册）。' +
        '痛点发现插件用自己的 token 调 TikHub，不依赖其它插件。',
    )
  }
  return token
}

/**
 * 统一请求：按平台的 method 走 GET（query）或 POST（JSON body）。
 * TikHub 的响应统一是 { code, message, data, cache_url }，code !== 200 视为失败。
 */
async function call(config, spec, queryOrBody, { maxRetries = 3, fetchImpl = fetch } = {}) {
  const token = requireToken(config)
  const method = spec.method || 'GET'
  let url = `${BASE_URL}${spec.path}`
  let body
  if (method === 'GET') {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(queryOrBody || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    ).toString()
    if (query) url += `?${query}`
  } else {
    body = JSON.stringify(queryOrBody || {})
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let res
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      if (attempt < maxRetries - 1) { await sleep(2 ** attempt * 1000); continue }
      throw new TikHubError(`TikHub 请求失败（网络）：${err.message}。检查网络/代理，或稍后重试。`)
    }
    if (res.status === 429) {
      const wait = Number(res.headers?.get?.('retry-after') || 5) + 1
      if (attempt < maxRetries - 1) { await sleep(wait * 1000); continue }
      throw new TikHubError('TikHub 限流（429）：重试后仍失败，稍后再试或降低频率。')
    }
    if (res.status === 401 || res.status === 403) {
      throw new TikHubError('TikHub 认证失败（401/403）：token 无效或过期，请到本面板「⚙️ 设置」重新粘贴。')
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new TikHubError(`TikHub HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = await res.json()
    // TikHub 业务码：code 非 200/0 时把 message 带出来，方便模型判断
    if (json && typeof json.code === 'number' && json.code !== 200 && json.code !== 0) {
      throw new TikHubError(`TikHub 返回 code ${json.code}：${json.message || '无 message'}`)
    }
    return json
  }
}

/** 搜内容（笔记/视频/帖子）：返回用户原话 + 互动量 + 链接 + id */
export async function searchPlatform(config, platform, keyword, { page = 1, limit = 20, fetchImpl = fetch } = {}) {
  const key = platformOf(platform)
  if (!key) throw new TikHubError(`未知平台：${platform}（可用：${platformList()}）`)
  const spec = PLATFORMS[key]
  if (!spec.enabled) {
    throw new TikHubError(`${spec.label} 渠道在参考实现里未启用（端点不稳定），建议换 抖音/TikTok/B站/YouTube/小红书/视频号。`)
  }
  const input = spec.search.body ? spec.search.body(keyword, page, limit) : spec.search.params(keyword, page, limit)
  const data = await call(config, spec.search, input, { fetchImpl })
  const raw = spec.search.extract(data) || []
  const items = raw
    .slice(0, limit)
    .map((item) => spec.mapNote(item))
    .filter((n) => n.title || n.description || n.id)
  const out = {
    platform: key,
    label: spec.label,
    keyword,
    page,
    count: items.length,
    items,
  }
  if (items.length === 0) out.rawSample = JSON.stringify(data).slice(0, 1000)
  return out
}

/** 拉某条内容的评论（评论是痛点的金矿） */
export async function fetchComments(config, platform, itemId, { cursor = '', fetchImpl = fetch } = {}) {
  const key = platformOf(platform)
  if (!key) throw new TikHubError(`未知平台：${platform}（可用：${platformList()}）`)
  const spec = PLATFORMS[key]
  if (!spec.comments) throw new TikHubError(`${spec.label} 的评论端点本插件暂未接入；用 seekmoney_search 取正文，或让用户粘贴评论。`)
  if (!spec.mapComment) throw new TikHubError(`${spec.label} 的评论暂未做字段归一化。`)
  const data = await call(config, spec.comments, spec.comments.params(itemId, cursor), { fetchImpl })
  const raw = spec.comments.extract(data) || []
  const items = raw.map((c) => spec.mapComment(c)).filter((c) => c.content)
  const out = { platform: key, label: spec.label, itemId, count: items.length, items }
  if (items.length === 0) out.rawSample = JSON.stringify(data).slice(0, 1000)
  return out
}

export { BASE_URL }
