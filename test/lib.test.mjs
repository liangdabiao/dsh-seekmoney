// 优先级评分公式 + 技能 + API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  calculateDemandIntensity, calculateMarketSize, calculateCompetition,
  calculatePriority, scoreCluster, dataQuality,
} = await import('../lib/priority.js')
const { createSkillProvider } = await import('../lib/skills.js')
const { PLATFORMS, PLATFORM_KEYS, ENABLED_KEYS, platformOf } = await import('../lib/platforms.js')
const { searchPlatform, fetchComments } = await import('../lib/tikhub.js')
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

test('4 个工具 schema 合规', () => {
  assert.equal(TOOLS.length, 4)
  assert.deepEqual(
    TOOLS.map((t) => t.name).sort(),
    ['seekmoney_comments', 'seekmoney_quality', 'seekmoney_score', 'seekmoney_search'],
  )
  for (const t of TOOLS) {
    assert.match(t.name, /^seekmoney_/)
    assert.equal(t.parameters.additionalProperties, false)
    assert.equal(typeof t.execute, 'function')
    assert.equal(typeof t.description, 'string')
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

// ---------------------------------------------------------------------------
// 数据通道：全部走 TikHub（本插件自带 key），端点/方法对齐参考实现 SeekMoney-ai
// ---------------------------------------------------------------------------
test('渠道表：6 个启用渠道，端点/方法与参考实现一致，douyin+wechat 是 POST', () => {
  assert.deepEqual(ENABLED_KEYS.sort(), ['bilibili', 'douyin', 'tiktok', 'wechat', 'xiaohongshu', 'youtube'])
  const expected = {
    xiaohongshu: ['GET', '/api/v1/xiaohongshu/app_v2/search_notes', '/api/v1/xiaohongshu/app_v2/get_note_comments'],
    douyin: ['POST', '/api/v1/douyin/search/fetch_general_search_v1', '/api/v1/douyin/web/fetch_video_comments'],
    tiktok: ['GET', '/api/v1/tiktok/web/fetch_general_search', '/api/v1/tiktok/web/fetch_post_comment'],
    bilibili: ['GET', '/api/v1/bilibili/web/fetch_general_search', '/api/v1/bilibili/app/fetch_video_comments'],
    wechat: ['POST', '/api/v1/wechat_search/v2/fetch_search_videos', '/api/v1/wechat_channels/v2/fetch_video_comments'],
    youtube: ['GET', '/api/v1/youtube/web/search_video', '/api/v1/youtube/web/get_video_comments'],
  }
  for (const [key, [method, searchPath, commentsPath]] of Object.entries(expected)) {
    assert.equal(PLATFORMS[key].search.method, method, `${key} 搜索方法`)
    assert.equal(PLATFORMS[key].search.path, searchPath, `${key} 搜索端点`)
    assert.equal(PLATFORMS[key].comments.path, commentsPath, `${key} 评论端点`)
    assert.equal(typeof PLATFORMS[key].search.extract, 'function')
    assert.equal(typeof PLATFORMS[key].mapNote, 'function')
    assert.equal(typeof PLATFORMS[key].mapComment, 'function')
  }
  // 参考实现里 twitter / reddit 未启用
  assert.equal(PLATFORMS.twitter.enabled, false)
  assert.equal(PLATFORMS.reddit.enabled, false)
  assert.deepEqual(PLATFORM_KEYS, Object.keys(PLATFORMS))
})

test('平台别名：小红书/tikhub/视频号 都能识别；未知平台报错列出可用', async () => {
  assert.equal(platformOf('小红书'), 'xiaohongshu')
  assert.equal(platformOf('xhs'), 'xiaohongshu')
  assert.equal(platformOf('抖音'), 'douyin')
  assert.equal(platformOf('tikhub'), 'douyin')
  assert.equal(platformOf('B站'), 'bilibili')
  assert.equal(platformOf('视频号'), 'wechat')
  assert.equal(platformOf('火星'), null)
  await assert.rejects(
    () => searchPlatform({}, '火星', 'x', { fetchImpl: () => { throw new Error('不该发请求') } }),
    /未知平台：火星/,
  )
})

test('缺 token：不进网络、直接提示去面板「⚙️ 设置」', async () => {
  let called = 0
  const fetchImpl = () => { called++; return Promise.resolve({ ok: true, status: 200, json: async () => ({}) }) }
  await assert.rejects(
    () => searchPlatform({ tikhubToken: '' }, 'xiaohongshu', '猫咪', { fetchImpl }),
    /TikHub token 未配置.*⚙️ 设置/,
  )
  assert.equal(called, 0, '没 token 时一个请求都不该发')
})

test('小红书搜索：按 data.data.items[].note 归一化，带 explore 链接', async () => {
  const payload = {
    code: 200,
    data: {
      data: {
        items: [
          {
            note: {
              id: 'abc123',
              title: '猫咪自助理毛实测',
              desc: '买了三个月，说说真实感受…',
              liked_count: 1234,
              collected_count: 88,
              comments_count: 56,
              user: { nickname: '猫奴A', userid: 'u1' },
            },
          },
        ],
      },
    },
  }
  let seenUrl = ''
  const fetchImpl = async (url, init) => {
    seenUrl = `${init.method} ${url}`
    return { ok: true, status: 200, json: async () => payload, headers: { get: () => null } }
  }
  const out = await searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'xiaohongshu', '猫咪 自助理毛', { fetchImpl })
  assert.equal(out.count, 1)
  assert.equal(out.items[0].id, 'abc123')
  assert.equal(out.items[0].author, '猫奴A')
  assert.equal(out.items[0].liked, 1234)
  assert.equal(out.items[0].collected, 88)
  assert.equal(out.items[0].comments, 56)
  assert.match(out.items[0].url, /^https:\/\/www\.xiaohongshu\.com\/explore\/abc123$/)
  assert.match(seenUrl, /^GET .*xiaohongshu\/app_v2\/search_notes\?keyword=/)
})

test('抖音搜索：走 POST + JSON body（参考实现就是 POST）', async () => {
  let seen = null
  const fetchImpl = async (url, init) => {
    seen = { url, method: init.method, body: init.body && JSON.parse(init.body) }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          data: [
            // 实测形状：卡片 { type, aweme_info: {...} }
            {
              type: 1,
              aweme_info: {
                aweme_id: '7300000000000000000',
                desc: '健身 App 打卡三个月，坑真多',
                author: { nickname: '阿强' },
                statistics: { digg_count: 99, comment_count: 7 },
              },
            },
          ],
        },
      }),
      headers: { get: () => null },
    }
  }
  const out = await searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'douyin', '健身 App 痛点', { fetchImpl })
  assert.equal(seen.method, 'POST')
  assert.match(seen.url, /douyin\/search\/fetch_general_search_v1$/)
  assert.equal(seen.body.keyword, '健身 App 痛点')
  assert.equal(seen.body.content_type, '1')
  assert.equal(out.items[0].id, '7300000000000000000')
  assert.equal(out.items[0].author, '阿强')
  assert.equal(out.items[0].liked, 99)
})

test('B站搜索：按 data.data.result[] 归一化（带 bvid 链接）', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: 200,
      data: { data: { result: [{ bvid: 'BV1xx411c7mD', title: 'B站长视频痛点合集', author: 'UP主A', play: 1000, review: 20, like: 300 }] } },
    }),
    headers: { get: () => null },
  })
  const out = await searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'bilibili', '痛点', { fetchImpl })
  assert.equal(out.items[0].id, 'BV1xx411c7mD')
  assert.equal(out.items[0].title, 'B站长视频痛点合集')
  assert.equal(out.items[0].comments, 20)
  assert.match(out.items[0].url, /bilibili\.com\/video\/BV1xx411c7mD/)
})

test('评论：小红书按 data.comments[] 归一化（正文/作者/点赞）', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: 200,
      data: { comments: [{ id: 'c1', content: '这个我也踩过坑，毛根本推不动', user: { nickname: '用户B' }, like_count: 12 }] },
    }),
    headers: { get: () => null },
  })
  const out = await fetchComments({ tikhubToken: 'tok_test_long_enough' }, 'xiaohongshu', 'abc123', { fetchImpl })
  assert.equal(out.count, 1)
  assert.match(out.items[0].content, /踩过坑/)
  assert.equal(out.items[0].author, '用户B')
  assert.equal(out.items[0].liked, 12)
})

test('未启用渠道（twitter）：直接报错，不发请求', async () => {
  let called = 0
  await assert.rejects(
    () => searchPlatform({ tikhubToken: 'tok' }, 'twitter', 'saas', { fetchImpl: () => { called++; return Promise.resolve({}) } }),
    /未启用/,
  )
  assert.equal(called, 0)
})

test('401/403：提示重新粘贴 token，不重试', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: false, status: 401, text: async () => 'unauthorized', headers: { get: () => null } } }
  await assert.rejects(
    () => searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'youtube', 'pain', { fetchImpl }),
    /认证失败（401\/403）.*⚙️ 设置/,
  )
  assert.equal(calls, 1, '认证失败不该重试')
})

test('设置：存本机、掩码返回、清除生效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seekmoney-'))
  process.env.DSH_HOME = dir
  // 重新导入，让 settings 模块用新的 DSH_HOME
  return import(`../lib/settings.js?cache=${Date.now()}`).then((m) => {
    assert.equal(m.maskSettings().configured, false)
    const masked = m.saveSettings({ tikhubToken: 'tk_abcdefghijklmnop' })
    assert.equal(masked.configured, true)
    assert.match(masked.tokenMasked, /^tk_a\*\*\*\*mnop$/)
    assert.ok(!JSON.stringify(masked).includes('abcdefghij'), '掩码里不能出现中间明文')
    assert.equal(m.resolveToken({}), 'tk_abcdefghijklmnop')
    m.clearSettings()
    assert.equal(m.getSettings().tikhubToken, '')
  })
})

// ---------------------------------------------------------------------------
// 文档一致性：技能/系统提示必须指向本插件自己的工具，不许再借别的插件的 key
// ---------------------------------------------------------------------------
test('技能 addendum：指向 seekmoney_search / seekmoney_comments 与「⚙️ 设置」', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const c = (await provider.list())[0]
  const skill = await provider.get(c)
  assert.match(skill.content, /seekmoney_search/)
  assert.match(skill.content, /seekmoney_comments/)
  assert.match(skill.content, /本插件自带 key/)
  assert.match(skill.content, /⚙️ 设置/)
  assert.ok(!/xhs_search/.test(skill.content), '不该再指向别的插件的工具')
  assert.ok(!/需要用户自己的 key/.test(skill.content))
})

test('技能正文：阶段 1 给出各平台 platform 参数与端点表', () => {
  const text = readFileSync(join(ROOT, 'skills', 'seekmoney-pain-finder', 'SKILL.md'), 'utf8')
  for (const key of ['douyin', 'tiktok', 'bilibili', 'youtube', 'xiaohongshu', 'wechat']) {
    assert.ok(text.includes(key), `缺平台 ${key}`)
  }
  assert.match(text, /全部走 TikHub/)
  assert.match(text, /绝不向用户索要明文 key/)
  assert.match(text, /禁止编造/)
})

test('systemPrompt：写明全部渠道走 TikHub + 本插件自带 key', () => {
  const section = systemSection()
  assert.match(section.text, /全部走 TikHub，本插件自带 key/)
  assert.match(section.text, /seekmoney_search/)
  assert.match(section.text, /seekmoney_comments/)
  assert.ok(!/xhs_search/.test(section.text))
})



test('微信视频号：拍平 subBoxes.items[] 并去掉 <em> 高亮标签', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: 200,
      data: {
        results: {
          data: [
            {
              subBoxes: [
                {
                  items: [
                    {
                      exportId: 'export/abc',
                      docID: 'doc1',
                      title: '全球前十<em class="highlight">保温杯</em>品牌测评',
                      source: '测评号',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }),
    headers: { get: () => null },
  })
  const out = await searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'wechat', '保温杯', { fetchImpl })
  assert.equal(out.count, 1)
  assert.equal(out.items[0].id, 'export/abc')
  assert.ok(!out.items[0].title.includes('<em'), '标题不该带 HTML 标签')
  assert.match(out.items[0].title, /保温杯品牌测评/)
})

test('B站：标题里的 <em class="keyword"> 高亮标签会被清掉', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: 200,
      data: { data: { result: [{ bvid: 'BV1aa', title: '<em class="keyword">租房</em>踩坑指南', author: 'UP', review: 5 }] } },
    }),
    headers: { get: () => null },
  })
  const out = await searchPlatform({ tikhubToken: 'tok_test_long_enough' }, 'bilibili', '租房', { fetchImpl })
  assert.equal(out.items[0].title, '租房踩坑指南')
})
