// 系统提示注入：痛点发现方法论摘要。
export const SYSTEM_RULES = `## 用户痛点发现方法论（seekmoney）

**5 阶段流程**：①多平台采集（抖音/小红书/TikTok/B站/YouTube/视频号）→ ②语义聚类（Embedding+DBSCAN，视频/评论分开）→ ③深度分析（表面痛点→根本原因→用户场景→情感强度 0-5 + 现有方案→未满足需求→机会）→ ④优先级评分（seekmoney_score 工具）→ ⑤MVP 计划与报告。

**数据通道（全部走 TikHub，本插件自带 key）**：①用 \`seekmoney_search\`（platform = douyin / tiktok / bilibili / youtube / xiaohongshu / wechat）搜内容；拿到 id 后用 \`seekmoney_comments\` 拉评论；twitter、reddit 在参考实现里未启用。没配 token 时工具会提示用户到本面板「⚙️ 设置」粘贴——**绝不向用户索要明文 key**。TikHub 全失败时才退 \`web_search\`/\`web_fetch\`，再不行请用户粘贴并把缺口标 N/A；禁止编造数据。

**优先级评分**（确定性，必须用工具）：需求强度 40%（聚类占比+情绪加成）+ 市场规模 30%（数据维度 40% + AI 评估 60%）+ 竞争度 30%（连续函数 5/(1+n)，0 竞品=5.0 纯蓝海）。≥3.5 High / ≥2.5 Medium。

**数据质量分级**：<50 exploratory（探索性）/ 50-200 preliminary（初步结论）/ ≥200 reliable（高置信度）。

**铁律**：评分必须用 seekmoney_score 工具（公式有精确权重）；先拿数据再下结论；现有方案过滤"待调研/解析失败"无效项；不构成商业决策依据。`

export function systemSection() {
  return {
    name: 'seekmoney:methodology',
    order: 110,
    text: SYSTEM_RULES,
  }
}
