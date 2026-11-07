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

- `npm test`：11 个单测（需求强度/市场规模阶梯/竞争度连续函数/无效方案过滤/40-30-30 加权/蓝海红海端到端/数据分级/工具 schema/技能铁律/systemPrompt/许可）
- `npm run selftest`：评分端到端（蓝海 High/红海 Low）+ 数据分级 + 技能 + 泄露 key 扫描 + 面板 API
- `npm run build`：打包 dist/client.js + 三大自检（含 treeShaking:false）

## 许可

MIT（liangdabiao）
