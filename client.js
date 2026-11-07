// ============================================================================
// 用户痛点发现 · 浏览器半边（最小面板）。
// 两块：📖 5 阶段流程 + 评分系统说明。
// ============================================================================
const h = require('react').createElement
const { useState } = require('react')

const PANEL_ID = 'seekmoney'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#0e7490' }),
    h('circle', { cx: 11, cy: 10, r: 4.5, stroke: '#fff', 'stroke-width': 1.6 }),
    h('path', { d: 'M14.5 14.5L19 19', stroke: '#ffd24a', 'stroke-width': 1.8, 'stroke-linecap': 'round' }),
    h('path', { d: 'M9 9.5c.5-1 3.5-1 4 0', stroke: '#ffd24a', 'stroke-width': 1.2, 'stroke-linecap': 'round' }))
}

const STAGES = [
  ['🌐 多平台采集', '抖音 · 小红书 · TikTok · B站 · YouTube · X · Reddit——从用户真实讨论中找痛点'],
  ['🔬 语义聚类', 'Embedding + DBSCAN 自动发现主题簇；视频/评论分开聚类；<100 条可让模型直觉分组'],
  ['🔍 深度分析', '表面痛点 → 根本原因 → 用户场景 → 情感强度 0-5；现有方案 → 未满足需求 → 机会'],
  ['⚖️ 优先级评分', '需求 40% + 市场 30% + 竞争 30%（确定性公式，用 seekmoney_score 工具算）'],
  ['🚀 MVP 计划', '核心功能 → 验证假设 → 首批用户 → 成本估算 → 报告输出到工作区 reports/'],
]

const PLATFORMS = ['抖音', '小红书', 'TikTok', 'B站', 'YouTube', 'X (Twitter)', 'Reddit', '微信视频号']

function GuideTab() {
  return h('div', null,
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

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      h('button', { style: styles.tabActive }, '📖 找痛点流程')),
    h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#0e7490', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #0e7490', borderRadius: 8, background: '#e0f2f5', color: '#075263', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#075263' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e0f2f5', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#075263' },
  stageList: { display: 'grid', gap: 8 },
  stageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  stageNum: { width: 22, height: 22, borderRadius: '50%', background: '#0e7490', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  viewTitle: { fontWeight: 600 },
  muted: { color: '#8a8a92' },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => '痛点发现' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
