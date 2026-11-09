---
name: seekmoney-pain-finder
description: 用户痛点发现与商机验证方法论。当用户要求「找商机」「发现用户痛点」「市场机会分析」「验证产品想法」「痛点调研」「多平台内容分析」（抖音/小红书/TikTok/B站/YouTube/X/Reddit）时使用。基于语义聚类（Embedding+DBSCAN）与优先级评分系统（需求40%+市场30%+竞争30%）的结构化分析流程。使用 seekmoney_score 工具做确定性评分。
---

# 用户痛点发现与商机验证

你的职责：从社交媒体内容中发现用户核心痛点，按**语义聚类 → 深度分析 → 优先级评分**的结构化流程产出商机验证报告。

## 分析流程（5 阶段）

### 阶段 1：多平台数据采集（全部走 TikHub，本插件自带 key）

各渠道的数据**全部来自 TikHub**（对齐参考实现 SeekMoney-ai 的 `tikhub-client`）：

| 平台 | platform 参数 | 搜索（seekmoney_search） | 评论（seekmoney_comments） |
|---|---|---|---|
| 抖音 | `douyin` | POST `douyin/search/fetch_general_search_v1` | ✅ GET `douyin/app/v3/fetch_video_comments` |
| B站 | `bilibili` | GET `bilibili/web/fetch_general_search` | ✅ GET `bilibili/app/fetch_video_comments` |
| 小红书 | `xiaohongshu` | GET `xiaohongshu/app_v2/search_notes` | ✅ GET `xiaohongshu/app_v2/get_note_comments` |
| TikTok | `tiktok` | GET `tiktok/web/fetch_general_search`（实测 400，要 search_id） | 未验证 |
| YouTube | `youtube` | GET `youtube/web/search_video` | ❌ 需二次 continuation，未接入 |
| 微信视频号 | `wechat` | POST `wechat_search/v2/fetch_search_videos` | ❌ 拿不到数字 video id，未接入 |
| X (Twitter) | `twitter` | 端点存在但参考实现未启用 | — |
| Reddit | `reddit` | 端点存在但参考实现未启用 | — |

**实测状态（本机验证过）**：小红书 / 抖音 / B站 / YouTube / 微信视频号 都能拿到数据与评论；TikTok 的 `tiktok/web/fetch_general_search` 目前返回 400（端点要 search_id），遇到直接换抖音或小红书。

**取数规则**

1. 先用 `seekmoney_search(platform, keyword)` 搜内容——抖音/小红书先跑，需要海外视角再加 TikTok/YouTube。
2. 拿到 `id` 后，用 `seekmoney_comments(platform, item_id)` 拉评论。评论是痛点的金矿，**不要只读标题**。
3. **token 是本插件自己的**：没配时工具会直接告诉你「到面板「⚙️ 设置」粘贴」。**绝不向用户索要明文 key**，也不要现写 Python 脚本去连 TikHub。
4. TikHub 全失败（网络/额度）时才退 `web_search`/`web_fetch`；仍拿不到就请用户粘贴内容，或在报告里把缺口标 **N/A**。
5. 禁止编造笔记/评论/互动量——工具返回什么就用什么，返回 0 条就说明 0 条。

### 阶段 2：语义聚类

把采集到的内容按语义分组（同主题的痛点聚在一起）：

- **Embedding 表示**：用宿主模型把每条内容转成向量（语义相近的内容向量距离近）
- **DBSCAN 密度聚类**：自动发现主题簇，不需要预设簇数
- **视频/评论分开聚类**：避免语义层次混淆
- **实现方式**：沙箱 `pip install density-clustering` 后用 Python，或让宿主模型按主题直觉分组（小数据集 < 100 条时直觉分组足够）

### 阶段 3：深度 AI 分析

对每个聚类簇做四层分析：
1. **表面痛点**：用户在抱怨什么
2. **根本原因**：为什么会这样
3. **用户场景**：什么情况下遇到
4. **情感强度**：0-5 分（5=情绪激烈）

再加市场分析：
- **现有方案**：用户现在怎么解决这个问题（列名称+局限）
- **未满足需求**：现有方案没覆盖的
- **机会分析**：差异化切入点

### 阶段 4：优先级评分（确定性计算）

**必须用 `seekmoney_score` 工具评分，不要手算**（公式有精确权重）：

- 需求强度（40%）：聚类占比 + 情绪加成
- 市场规模（30%）：数据维度 40% + AI 评估 60%
- 竞争度（30%）：连续函数 5/(1+n)，0 竞品=纯蓝海
- 综合 ≥3.5 High / ≥2.5 Medium / <2.5 Low

### 阶段 5：MVP 计划与报告

对 High/Medium 优先级的痛点产出：
- **核心功能**：MVP 必须有的 3~5 个功能
- **验证假设**：先验证什么（最便宜的验证方式）
- **首批用户**：去哪里找前 100 个用户
- **成本估算**：开发/运营粗估

报告输出到工作区 `reports/seekmoney-<主题>.md`，附数据质量分级。

## 数据质量分级

| 等级 | 条件 | 含义 |
|---|---|---|
| exploratory | < 50 条 | 探索性，建议进一步验证 |
| preliminary | 50-200 条 | 初步结论，适合初期研究 |
| reliable | ≥ 200 条 | 高置信度，统计显著 |

## 铁律

1. **评分必须用工具**——`seekmoney_score` 的公式有精确权重，手算会错。
2. **先拿数据再下结论**——所有痛点必须有原文依据。
3. **数据缺口写 N/A**——不编造笔记/评论数据。
4. **现有方案要过滤无效项**——"待调研"/"解析失败"不算竞品。
5. **不构成商业决策依据**——报告附免责声明。


