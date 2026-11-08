# dsh-seekmoney · 用户痛点发现器

DeepSeek Harness（dsh）插件：**从社交媒体找商机，发现用户核心痛点**——5 阶段流程（多平台采集 → 语义聚类 → 深度分析 → 优先级评分 → MVP 计划）+ 确定性优先级评分系统（需求 40% + 市场 30% + 竞争 30%）。纯确定性评分零 API key。

方法论来自 [SeekMoney-ai](https://github.com/liangdabiao/SeekMoney-ai)（MIT，liangdabiao）。

## 装上以后有什么

| 能力 | 说明 |
|---|---|
| `seekmoney-pain-finder` 技能 | 5 阶段痛点发现方法论：多平台采集（抖音/小红书/TikTok/B站/YouTube/X/Reddit）→ 语义聚类（Embedding+DBSCAN）→ 深度分析（表面痛点→根本原因→场景→情感强度）→ 优先级评分 → MVP 计划 |
| `seekmoney_score` 工具 | **确定性优先级评分**：需求强度 40%（聚类占比+情绪加成）+ 市场规模 30%（数据维度 40% + AI 评估 60%）+ 竞争度 30%（连续函数 5/(1+n)，0 竞品=5.0 纯蓝海）。综合 ≥3.5 High / ≥2.5 Medium |
| `seekmoney_quality` 工具 | 数据质量分级：<50 exploratory / 50-200 preliminary / ≥200 reliable |
| 侧栏「痛点发现」面板 | 5 阶段流程速览 + 评分系统说明 + 数据质量分级 + 免责声明 |

## 使用

对话里一句话：**「帮我找健身 App 用户的痛点」**或**「分析小红书上关于猫咪自助理毛的讨论，找商机」**。

模型按 5 阶段流程执行 → 报告输出到工作区 `reports/seekmoney-<主题>.md`（附数据质量分级与免责声明）。

## 核心公式（确定性）

- **需求强度**：聚类占比 × 10（封顶 5）+ 情绪强度/5（最多 1 分）
- **市场规模**：数据维度得分 × 40% + AI 评估 × 60%
- **竞争度**：5/(1+有效竞品数)——连续函数能区分 4 vs 100 个竞品的差距
- **综合**：需求 40% + 市场 30% + 竞争 30%

**评分必须用工具**——公式有精确权重，手算会错。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：18 个单测（需求强度/市场规模阶梯/竞争度连续函数/无效方案过滤/40-30-30 加权/蓝海红海端到端/数据分级/工具 schema/技能铁律/systemPrompt/许可 + 3 个评分回归：非数字入参不再算成 NaN 并假装 Low、工具层坏入参给可读错误、正常入参给出确定结论 + 3 个数据通道守卫：技能 addendum 指向 `xhs_search`/`web_search`、技能正文禁止索要 key、系统提示写明"本插件不需要 API key"）
- `npm run selftest`：评分端到端（蓝海 High/红海 Low）+ 数据分级 + 技能 + 泄露 key 扫描 + 面板 API
- `npm run build`：打包 dist/client.js + 三大自检（含 treeShaking:false）


## 安装

```bash
# 从 GitHub 装（dist/client.js 已入库，装完即有面板）
dsh plugin --profile web add github:liangdabiao/dsh-seekmoney

# 钉版本
dsh plugin --profile web add github:liangdabiao/dsh-seekmoney#v0.1.1
```

> ⚠️ 本包**没有发布到 npm**，`dsh plugin add dsh-seekmoney` 会失败——请用上面的 `github:` 形式。
>
> `dist/client.js` 是入库文件：dsh 宿主直接消费已构建的客户端 bundle（`package.json` → `exports["./client"]`），缺它会导致插件激活失败、侧栏「痛点发现」面板不出现。改完源码记得 `npm run build` 再提交。

## 一键开始

面板顶部有 **🚀 马上使用** 按钮：点了会开一个新对话，输入框里已经填好

```
使用‘痛点发现’插件 进行商机调研：
```

补上要调研的方向（如：健身 App 用户的痛点）后回车即可。

## 许可

MIT（liangdabiao）
## 数据从哪来（全部走 TikHub，本插件自带 key）

对齐参考实现 [SeekMoney-ai](https://github.com/liangdabiao) 的 	ikhub-client，6 个渠道都由 TikHub 提供数据：

| 渠道 | platform | 搜索端点 | 评论端点 |
|---|---|---|---|
| 小红书 | xiaohongshu | GET xiaohongshu/app_v2/search_notes | GET xiaohongshu/app_v2/get_note_comments |
| 抖音 | douyin | POST douyin/search/fetch_general_search_v1 | GET douyin/web/fetch_video_comments |
| TikTok | 	iktok | GET 	iktok/web/fetch_general_search | GET 	iktok/web/fetch_post_comment |
| B站 | ilibili | GET ilibili/web/fetch_general_search | GET ilibili/app/fetch_video_comments |
| YouTube | youtube | GET youtube/web/search_video | GET youtube/web/get_video_comments |
| 微信视频号 | wechat | POST wechat_search/v2/fetch_search_videos | GET wechat_channels/v2/fetch_video_comments |

X (Twitter) / Reddit 的端点参考实现里同样未启用，本插件也不启用。

**key 在哪配**：本插件面板「⚙️ 设置」→ 粘贴 TikHub token（api.tikhub.io 注册）。
存在本机  + "\$DSH_HOME/seekmoney/settings.json\" + @，任何接口都只回掩码、不回明文；也可以走插件 Config 的  + "	ikhubToken" + @ 或环境变量  + "TIKHUB_TOKEN" + @。
没配 key 时工具会直接提示去「⚙️ 设置」，**不会向用户索要明文 token**。

工具： + "seekmoney_search(platform, keyword)" + @ 搜内容 →  + "seekmoney_comments(platform, item_id)" + @ 拉评论 →  + "seekmoney_score" + @ 打分。TikHub 全失败时才退  + "web_search" + @/ + "web_fetch" + @，仍拿不到就请用户粘贴并把缺口标 N/A。
