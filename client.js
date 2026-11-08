// ============================================================================
// 用户痛点发现 · 浏览器半边。
// 两个标签：📖 找痛点流程（含「马上使用」+ 数据源说明）/ ⚙️ 设置（本插件自己的 TikHub token）。
// 本插件自带 key、自己调 TikHub：seekmoney_search / seekmoney_comments。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'seekmoney'
const BASE = 'seekmoney'

// 「马上使用」：开新对话并把调研指令填进输入框（不直接发送，用户补上主题再回车）。
// 走 Host 的 uiWorkspace.startSession（与「运营 Agent」「卖家工具箱」等同一套入口）：
//   startSession(sessionId?, { prompt, whenDraftExists: 'keep'|'replace'|'append' })
const USE_PROMPT = '使用‘痛点发现’插件 进行商机调研：'
let openInChat = null

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#0e7490' }),
    h('circle', { cx: 11, cy: 10, r: 4.5, stroke: '#fff', 'stroke-width': 1.6 }),
    h('path', { d: 'M14.5 14.5L19 19', stroke: '#ffd24a', 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
    h('path', { d: 'M9 9.5c.5-1 3.5-1 4 0', stroke: '#ffd24a', 'stroke-width': 1.2, 'stroke-linecap': 'round' }))
}

async function fetchJson(path, init) {
  const res = await fetch(BASE + path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

const STAGES = [
  ['🌐 多平台采集', 'seekmoney_search 按关键词搜小红书/抖音/TikTok/B站/YouTube/X/Reddit（TikHub 真实数据）'],
  ['🔬 语义聚类', 'Embedding + DBSCAN 自动发现主题簇；视频/评论分开聚类；<100 条可让模型直觉分组'],
  ['🔍 深度分析', '表面痛点 → 根本原因 → 用户场景 → 情感强度 0-5；现有方案 → 未满足需求 → 机会'],
  ['⚖️ 优先级评分', '需求 40% + 市场 30% + 竞争 30%（确定性公式，用 seekmoney_score 工具算）'],
  ['🚀 MVP 计划', '核心功能 → 验证假设 → 首批用户 → 成本估算 → 报告输出到工作区 reports/'],
]

function GuideTab() {
  const use = () => { if (openInChat) openInChat(USE_PROMPT) }
  return h('div', null,
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, '想找一个值得做的商机？'),
        h('div', { style: styles.ctaMuted },
          '点「马上使用」→ 开新对话，输入框已填好指令；补上要调研的方向（如：健身 App 用户的痛点）后回车即可。')),
      h('button', { style: styles.ctaButton, onClick: use, title: `填进对话：${USE_PROMPT}` }, '🚀 马上使用')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '数据从哪来（本插件自带 TikHub key）'),
      h('div', { style: styles.dataList },
        h('div', { style: styles.dataRow },
          h('span', { style: styles.dataTag }, '搜索'),
          h('span', null, 'seekmoney_search —— 小红书 · 抖音 · TikTok · B站 · YouTube · 微信视频号')),
        h('div', { style: styles.dataRow },
          h('span', { style: styles.dataTag }, '评论'),
          h('span', null, 'seekmoney_comments —— 同上 6 个渠道（评论是痛点金矿）')),
        h('div', { style: styles.dataRow },
          h('span', { style: styles.dataTag }, '未启用'),
          h('span', null, 'X (Twitter) · Reddit —— 参考实现里同样未启用')),
        h('div', { style: styles.dataRow },
          h('span', { style: styles.dataTag }, '兜底'),
          h('span', null, 'web_search / web_fetch，或请用户粘贴内容（缺口标 N/A）')),
        h('div', { style: { ...styles.muted, marginTop: 8, lineHeight: 1.8 } },
          'key 是本插件自己的：在「⚙️ 设置」里粘贴 TikHub token（存本机 $DSH_HOME/seekmoney/settings.json，不回显）。' +
            '没配 key 时工具会直接提示你去设置，不会向你要明文 token。'))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么找痛点'),
      h('div', { style: styles.stepList },
        '在对话里一句话即可：',
        h('div', { style: styles.quote }, '「帮我找健身 App 用户的痛点」'),
        h('div', { style: styles.quote }, '「分析小红书上关于猫咪自助理毛的讨论，找商机」'),
        '模型按 5 阶段流程采集 → 聚类 → 分析 → 评分 → 产出 MVP 计划与验证报告。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '5 阶段流程'),
      h('div', { style: styles.stageList },
        STAGES.map(([title, desc], i) => h('div', { key: title, style: styles.stageRow },
          h('span', { style: styles.stageNum }, `${i + 1}`),
          h('div', null, h('div', { style: styles.viewTitle }, title), h('div', { style: styles.muted }, desc)))))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '评分系统（确定性公式）'),
      h('div', { style: { ...styles.muted, lineHeight: 2 } },
        '需求强度 40%（聚类占比 + 情绪加成）+ 市场规模 30%（数据维度 + AI 评估）+ 竞争度 30%（5/(1+n) 连续函数）',
        h('br'), '综合 ≥3.5 = High / ≥2.5 = Medium / <2.5 = Low——评分用工具算，不算错')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '数据质量分级'),
      h('div', { style: styles.muted }, '<50 探索性 → 建议进一步验证 | 50-200 初步结论 → 适合初期研究 | ≥200 高置信度 → 统计显著')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚠️ 免责声明'),
      h('div', { style: styles.muted }, '本框架输出分析，不构成商业决策依据。数据来自社交媒体公开内容，请遵守平台规则。')))
}

// ---------- 设置：本插件自己的 TikHub token（存本机，永不上传/回显明文） ----------
function SettingsTab() {
  const [info, setInfo] = useState(null)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson('/api/config').then(setInfo).catch((e) => setError(e.message))
  }, [])

  const save = async () => {
    setError(''); setMsg('')
    if (!token.trim()) { setError('先粘贴 TikHub token。'); return }
    setBusy(true)
    try {
      const d = await fetchJson('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tikhubToken: token.trim() }),
      })
      setInfo(d.credentials); setToken('')
      setMsg('已保存（存本机，不会上传）。现在可以让模型用 seekmoney_search 采集真实数据了。')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const clear = async () => {
    setError(''); setMsg('')
    try {
      const d = await fetchJson('/api/config', { method: 'DELETE' })
      setInfo(d.credentials); setMsg('已清除本机保存的 token。')
    } catch (e) { setError(e.message) }
  }

  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚙️ TikHub token（本插件自己的 key）'),
      h('div', { style: styles.muted },
        info === null ? '加载中…' : info.configured ? `已配置 ✓（${info.tokenMasked}）` : '未配置。粘贴并保存后，seekmoney_search / seekmoney_comments 才能取真实数据。'),
      h('input', {
        type: 'password',
        placeholder: 'TikHub token',
        value: token,
        onChange: (e) => setToken(e.target.value),
        style: styles.input,
      }),
      h('div', { style: styles.row },
        h('button', { style: styles.button, onClick: save, disabled: busy }, busy ? '保存中…' : '保存'),
        info?.configured ? h('button', { style: styles.tab, onClick: clear }, '清除已存') : null),
      msg ? h('div', { style: styles.ok }, msg) : null,
      error ? h('div', { style: styles.error }, error) : null,
      h('div', { style: { ...styles.muted, fontSize: 12, lineHeight: 1.8, marginTop: 8 } },
        '获取：www.tikhub.io 注册 → 用户中心 API Token。',
        h('br'), '存在本机：$DSH_HOME/seekmoney/settings.json（任何接口都不回显明文）。',
        h('br'), '本插件用它自己调 TikHub，不依赖「小红书验证」等其它插件。')))
}

const TABS = [['guide', '📖 找痛点流程'], ['settings', '⚙️ 设置']]

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      TABS.map(([id, label]) => h('button', {
        key: id,
        style: tab === id ? styles.tabActive : styles.tab,
        onClick: () => setTab(id),
      }, label))),
    tab === 'guide' ? h(GuideTab) : h(SettingsTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  ctaCard: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: '#eff9fb', border: '1px solid #cfe9ef', borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  ctaText: { flex: 1, minWidth: 200 },
  ctaTitle: { fontWeight: 700, color: '#075263', marginBottom: 4 },
  ctaMuted: { color: '#7d8b8f', lineHeight: 1.7 },
  ctaButton: { padding: '10px 20px', border: 'none', borderRadius: 10, background: '#0e7490', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(14,116,144,.25)' },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#0e7490', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #0e7490', borderRadius: 8, background: '#e0f2f5', color: '#075263', fontWeight: 600, fontSize: 13 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d9d9de', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', marginTop: 8 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  dataList: { display: 'grid', gap: 6 },
  dataRow: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.7 },
  dataTag: { flexShrink: 0, background: '#e0f2f5', color: '#075263', borderRadius: 4, padding: '0 6px', fontSize: 11, fontWeight: 600 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#075263' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e0f2f5', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#075263' },
  stageList: { display: 'grid', gap: 8 },
  stageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  stageNum: { width: 22, height: 22, borderRadius: '50%', background: '#0e7490', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  viewTitle: { fontWeight: 600 },
  muted: { color: '#8a8a92' },
  ok: { color: '#1a7f37', marginTop: 6 },
  error: { color: '#c0392b', marginTop: 6 },
}

function apply(ctx) {
  // 一键入口：开新对话并预填「使用‘痛点发现’插件 进行商机调研：」（不直接发送）
  openInChat = (prompt) => {
    try {
      ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    } catch (err) {
      console.error('[seekmoney] 开新对话失败', err)
      alert('开新对话失败：' + ((err && err.message) || err))
    }
  }
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => '痛点发现' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply

