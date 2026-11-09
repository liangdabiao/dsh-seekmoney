// 各平台的 TikHub 采集通道（对齐参考实现 资料/SeekMoney-ai-main/lib/services/tikhub-client.ts）。
// 端点、HTTP 方法、参数名、响应取值路径都按参考实现逐个核对过：
//   douyin      POST /api/v1/douyin/search/fetch_general_search_v1
//   tiktok      GET  /api/v1/tiktok/web/fetch_general_search
//   bilibili    GET  /api/v1/bilibili/web/fetch_general_search
//   wechat      POST /api/v1/wechat_search/v2/fetch_search_videos   （视频号）
//   youtube     GET  /api/v1/youtube/web/search_video
//   xiaohongshu GET  /api/v1/xiaohongshu/app_v2/search_notes
//   twitter     GET  /api/v1/twitter/web/fetch_search_timeline      （参考实现里未启用，标实验）
//   reddit      GET  /api/v1/reddit/search_posts                    （参考实现里未启用，标实验）
// 所有渠道的数据都来自 TikHub，一个 key 走全部平台。

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
// 搜索结果里常带高亮标签（B站返回 <em class="keyword">租房</em>），去掉标签保留文字
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '')
const str = (v, max) => stripTags(v).slice(0, max)

const dig = (obj, path) => path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj)

/** 抖音/TikTok 的搜索结果常是「卡片」：{ type, aweme_info: {...} } —— 先拆壳 */
const unwrapCard = (item) => item?.aweme_info || item?.aweme_detail || item?.note || item || {}

/** 通用兜底：深度优先找第一个「像内容的对象数组」 */
function anyObjectArray(data) {
  const queue = [data]
  let guard = 0
  while (queue.length && guard++ < 600) {
    const node = queue.shift()
    if (!node || typeof node !== 'object') continue
    for (const value of Object.values(node)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value
      if (value && typeof value === 'object') queue.push(value)
    }
  }
  return []
}

export const PLATFORMS = {
  xiaohongshu: {
    label: '小红书',
    enabled: true,
    search: {
      method: 'GET',
      path: '/api/v1/xiaohongshu/app_v2/search_notes',
      params: (kw, page) => ({ keyword: kw, page }),
      // 参考实现：data.data.data.items[]，每条是 { note: {...} }
      extract: (data) => dig(data, 'data.data.items') || anyObjectArray(data),
    },
    comments: {
      method: 'GET',
      path: '/api/v1/xiaohongshu/app_v2/get_note_comments',
      params: (id, cursor) => (cursor ? { note_id: id, lastCursor: cursor } : { note_id: id }),
      extract: (data) => dig(data, 'data.comments') || anyObjectArray(data),
    },
    mapNote: (item) => {
      const n = item.note || item
      return {
        id: str(n.id || n.note_id, 40),
        title: str(n.title, 200),
        description: str(n.desc || n.description, 800),
        author: str(dig(n, 'user.nickname'), 60),
        liked: num(n.liked_count),
        collected: num(n.collected_count),
        comments: num(n.comments_count),
        url: n.id || n.note_id ? `https://www.xiaohongshu.com/explore/${n.id || n.note_id}` : '',
      }
    },
    mapComment: (c) => ({
      content: str(c.content || c.text, 600),
      author: str(dig(c, 'user.nickname'), 60),
      liked: num(c.like_count),
      ip: str(c.ip_location, 40),
    }),
  },

  douyin: {
    label: '抖音',
    enabled: true,
    search: {
      method: 'POST',
      path: '/api/v1/douyin/search/fetch_general_search_v1',
      body: (kw) => ({
        keyword: kw,
        cursor: 0,
        sort_type: '0',
        publish_time: '0',
        filter_duration: '0',
        content_type: '1',
        search_id: '',
        backtrace: '',
      }),
      extract: (data) => dig(data, 'data.data') || anyObjectArray(data),
    },
    comments: {
      method: 'GET',
      path: '/api/v1/douyin/app/v3/fetch_video_comments',
      params: (id, cursor) => ({ aweme_id: id, cursor: cursor || 0, count: 20 }),
      extract: (data) => dig(data, 'data.comments') || anyObjectArray(data),
    },
    mapNote: (item) => {
      const a = unwrapCard(item)
      return {
        id: str(a.aweme_id || a.awemeId || a.id, 40),
        title: str(a.desc || a.title, 300),
        description: str(a.desc, 800),
        author: str(dig(a, 'author.nickname'), 60),
        liked: num(dig(a, 'statistics.digg_count') ?? a.digg_count),
        views: num(dig(a, 'statistics.play_count')),
        collected: num(dig(a, 'statistics.collect_count')),
        comments: num(dig(a, 'statistics.comment_count') ?? a.comment_count),
        url: str(a.share_url || a.share_info?.share_url, 300),
      }
    },
    mapComment: (c) => ({
      content: str(c.text || c.content, 600),
      author: str(dig(c, 'user.nickname'), 60),
      liked: num(c.digg_count ?? c.like_count),
      ip: str(c.ip_label, 40),
    }),
  },

  tiktok: {
    label: 'TikTok',
    enabled: true,
    search: {
      method: 'GET',
      path: '/api/v1/tiktok/web/fetch_general_search',
      params: (kw) => ({ keyword: kw, offset: 0 }),
      extract: (data) => dig(data, 'data.data') || anyObjectArray(data),
    },
    comments: {
      method: 'GET',
      path: '/api/v1/tiktok/web/fetch_post_comment',
      params: (id, cursor) => ({ aweme_id: id, cursor: cursor || 0, count: 20 }),
      extract: (data) => dig(data, 'data.comments') || anyObjectArray(data),
    },
    mapNote: (item) => {
      const a = unwrapCard(item)
      return {
        id: str(a.aweme_id || a.id, 40),
        title: str(a.desc || a.title, 300),
        description: str(a.desc, 800),
        author: str(dig(a, 'author.nickname') || dig(a, 'author.unique_id'), 60),
        liked: num(dig(a, 'statistics.digg_count') ?? a.digg_count),
        views: num(dig(a, 'statistics.play_count')),
        collected: num(dig(a, 'statistics.collect_count')),
        comments: num(dig(a, 'statistics.comment_count')),
        url: str(a.share_url, 300),
      }
    },
    mapComment: (c) => ({
      content: str(c.text || c.content, 600),
      author: str(dig(c, 'user.nickname'), 60),
      liked: num(c.digg_count ?? c.like_count),
      ip: str(c.ip_label, 40),
    }),
  },

  bilibili: {
    label: 'B站',
    enabled: true,
    search: {
      method: 'GET',
      path: '/api/v1/bilibili/web/fetch_general_search',
      params: (kw, page, limit) => ({ keyword: kw, order: 'totalrank', page, page_size: Math.min(50, limit || 42), duration: 0 }),
      // 参考实现：data.data.data.result[]
      extract: (data) => dig(data, 'data.data.result') || dig(data, 'data.result') || anyObjectArray(data),
    },
    comments: {
      method: 'GET',
      path: '/api/v1/bilibili/app/fetch_video_comments',
      params: (id, cursor) => ({ av_id: id, mode: 3, next_offset: cursor || 1 }),
      extract: (data) => dig(data, 'data.data.replies') || dig(data, 'data.replies') || anyObjectArray(data),
    },
    mapNote: (item) => ({
      id: str(item.bvid || item.aid || item.id, 40),
      title: str(item.title, 200),
      description: str(item.description || item.desc, 800),
      author: str(item.author || dig(item, 'owner.name'), 60),
      liked: num(item.like),
      views: num(item.play),
      collected: num(item.favorites ?? item.favorite),
      comments: num(item.review ?? item.video_review),
      views: num(item.play),
      url: str(item.arcurl || item.url, 300) || (item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : ''),
    }),
    mapComment: (c) => ({
      content: str(dig(c, 'content.message') || c.message || c.content, 600),
      author: str(dig(c, 'member.uname') || dig(c, 'user.uname'), 60),
      liked: num(c.like ?? c.like_count),
      ip: str(dig(c, 'reply_control.location'), 40),
    }),
  },

  wechat: {
    label: '微信视频号',
    enabled: true,
    search: {
      method: 'POST',
      path: '/api/v1/wechat_search/v2/fetch_search_videos',
      body: (kw) => ({ keyword: kw }),
      // 实测返回：data.data.results.data[].subBoxes[].items[]（卡片嵌套），拍平成内容条目
      extract: (data) => {
        const cards = dig(data, 'data.results.data') || []
        const items = []
        for (const card of cards) {
          for (const box of card?.subBoxes || []) {
            for (const item of box?.items || []) items.push(item)
          }
        }
        return items.length ? items : anyObjectArray(data)
      },
    },
    // 实测 /api/v1/wechat_channels/fetch_comments 需要「数字 video id」，而搜索返回的是
    // exportId / docID，直接请求都 404 → 暂不接入评论（只做搜索），文档里写明。
    comments: null,
    mapNote: (item) => ({
      id: str(item.exportId || item.docID || item.id, 80),
      title: str(item.title || item.desc, 300),
      description: str(item.desc || item.title, 800),
      author: str(typeof item.source === 'string' ? item.source : item.source?.nickname || item.source?.name || item.nickname?.nickname, 60),
      liked: num(item.likeNum ?? item.like_count),
      collected: num(item.favCount),
      comments: num(item.commentCount ?? item.comment_count),
      views: 0,
      url: '',
    }),
    mapComment: (c) => ({
      content: str(c.content || dig(c, 'comment_content'), 600),
      author: str(c.nickname || dig(c, 'user.nickname'), 60),
      liked: num(c.like_count ?? c.like_num),
      ip: str(c.ip_location, 40),
    }),
  },

  youtube: {
    label: 'YouTube',
    enabled: true,
    search: {
      method: 'GET',
      path: '/api/v1/youtube/web/search_video',
      params: (kw) => ({ search_query: kw, language_code: 'en', country_code: 'us', need_format: true }),
      // 参考实现：data.data.videos[]（V3 格式化数据）
      extract: (data) => dig(data, 'data.videos') || dig(data, 'data.formatted_data.videos') || anyObjectArray(data),
    },
    // 实测：web_v2 的 need_format=true 只回 continuation_token；need_format=false 首屏只给
    // commentsHeaderRenderer + 二次 continuation，取评论要再跳一次 → 暂不接入（只做搜索）。
    comments: null,
    mapNote: (item) => ({
      id: str(item.video_id || item.id || item.videoId, 40),
      title: str(item.title, 200),
      description: str(item.description || item.desc || dig(item, 'snippet.description'), 800),
      author: str(item.author || item.channel_name || dig(item, 'channel.name') || dig(item, 'snippet.channelTitle'), 60),
      liked: num(item.like_count ?? item.likes),
      views: num(item.number_of_views ?? item.view_count ?? item.views),
      collected: num(item.favorite_count),
      comments: num(item.comment_count ?? item.comments),
      url: str(item.url || item.link, 300) || (item.video_id ? `https://www.youtube.com/watch?v=${item.video_id}` : ''),
    }),
    mapComment: (c) => ({
      content: str(
        (Array.isArray(c.contentText?.runs) ? c.contentText.runs.map((r) => r.text).join('') : '') ||
          c.contentText?.simpleText ||
          c.text ||
          c.content ||
          c.comment,
        600,
      ),
      author: str(c.authorText?.simpleText || c.author || dig(c, 'author.name'), 60),
      liked: num(c.voteCount?.simpleText ?? c.like_count ?? c.likeCount ?? c.vote_count),
      ip: '',
    }),
  },

  twitter: {
    label: 'X (Twitter)',
    enabled: false, // 参考实现同样未启用（避免用户误选后回退）
    search: {
      method: 'GET',
      path: '/api/v1/twitter/web/fetch_search_timeline',
      params: (kw, page) => (page > 1 ? { keyword: kw } : { keyword: kw }),
      extract: (data) => anyObjectArray(data),
    },
    mapNote: (item) => ({
      id: str(item.tweet_id || item.id || item.rest_id, 40),
      title: str(item.text || item.full_text || item.content, 300),
      description: str(item.text || item.full_text, 800),
      author: str(dig(item, 'author.screen_name') || dig(item, 'user.screen_name'), 60),
      liked: num(item.favorite_count ?? item.like_count),
      collected: num(item.bookmark_count),
      comments: num(item.reply_count ?? item.comment_count),
      url: str(item.url || item.tweet_url, 300),
    }),
  },

  reddit: {
    label: 'Reddit',
    enabled: false,
    search: {
      method: 'GET',
      path: '/api/v1/reddit/search_posts',
      params: (kw) => ({ keyword: kw, sort: 'relevance', time: 'month' }),
      extract: (data) => anyObjectArray(data),
    },
    mapNote: (item) => ({
      id: str(item.id || item.name, 40),
      title: str(item.title, 300),
      description: str(item.selftext || item.body, 800),
      author: str(item.author, 60),
      liked: num(item.score ?? item.ups),
      collected: num(item.saved),
      comments: num(item.num_comments),
      url: str(item.url || item.permalink, 300),
    }),
  },
}

/** 面板/工具用：真正启用的渠道（与参考实现 getEnabledSources 一致） */
export const PLATFORM_KEYS = Object.keys(PLATFORMS)
export const ENABLED_KEYS = PLATFORM_KEYS.filter((k) => PLATFORMS[k].enabled)

export function platformList(enabledOnly = false) {
  const keys = enabledOnly ? ENABLED_KEYS : Object.keys(PLATFORMS)
  return keys.map((k) => `${k}（${PLATFORMS[k].label}）`).join(' / ')
}

/** 兼容常见写法：xhs / 小红书 / B站 / 视频号 … */
export function platformOf(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const key = raw.toLowerCase()
  const alias = {
    xhs: 'xiaohongshu', red: 'xiaohongshu', rednote: 'xiaohongshu', 小红书: 'xiaohongshu',
    dy: 'douyin', 抖音: 'douyin', tikhub: 'douyin',
    tk: 'tiktok', 抖音国际版: 'tiktok',
    bili: 'bilibili', 'b站': 'bilibili', 哔哩哔哩: 'bilibili',
    yt: 'youtube', 油管: 'youtube', 优兔: 'youtube',
    wechat_channels: 'wechat', 视频号: 'wechat', 微信: 'wechat', weixin: 'wechat',
    x: 'twitter', 推特: 'twitter',
    rd: 'reddit', 红迪: 'reddit',
  }
  const resolved = PLATFORMS[key] ? key : alias[key] || alias[raw]
  return resolved && PLATFORMS[resolved] ? resolved : null
}






