// 用户痛点发现 · 技能快照提供方。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  let description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') || null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) break
        collected.push(lines[i].replace(/^\s+/, ''))
      }
      description = collected.join(' ').trim()
    }
  }
  return name && description ? { name, description, body: text.slice(m[0].length) } : null
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (parsed) out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name })
  }
  return out
}

function addendum(skill) {
  return [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`。`,
    '- **优先级评分必须用 `seekmoney_score` 工具**——公式有精确权重（需求 40% + 市场 30% + 竞争 30%，竞争度 = 5/(1+n) 连续函数），手算会错。',
    '- **数据采集（本插件自身不需要任何 API key）**：',
    '  - 小红书 → `xhs_search` / `xhs_comments`（TikHub，token 由「小红书验证」插件持有并已在面板配置，不要向用户索要 key）；',
    '  - 抖音 / TikTok / B站 / YouTube / X / Reddit → `web_search` + `web_fetch`；',
    '  - 都拿不到 → 请用户粘贴内容，或在报告里把缺口标 N/A；装了 `dsh-tikhub-api` 插件时也可优先用它的端点工具。',
    '- **语义聚类**：沙箱 `pip install density-clustering` 后用 Python；<100 条小数据集让宿主模型按主题直觉分组即可。',
    '- **报告输出到当前工作区**（`reports/seekmoney-<主题>.md`），不要往插件安装目录写文件。',
    '- 不构成商业决策依据。',
    '',
  ].join('\n')
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'seekmoney',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
  })

  return {
    name: 'seekmoney',
    async list() {
      return list.flatMap(readDir).map(candidate)
    },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}

export { readDir, addendum }
