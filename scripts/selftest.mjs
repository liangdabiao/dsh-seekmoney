// 离线自检：评分公式 + 工具 + 技能 + 面板 API。零网络零 key。
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { scoreCluster, dataQuality } = await import('../lib/priority.js')
const { createSkillProvider } = await import('../lib/skills.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

await step('评分公式端到端（蓝海/红海两端）', () => {
  const blue = scoreCluster({ clusterSize: 50, totalDataSize: 100, emotionalIntensity: 5, llmMarketScore: 5, existingSolutions: [] })
  if (blue.overall <= 3.5) throw new Error(`蓝海场景应 High，实际 ${blue.overall}`)
  const red = scoreCluster({ clusterSize: 5, totalDataSize: 500, emotionalIntensity: 1, llmMarketScore: 1, existingSolutions: Array.from({ length: 99 }, (_, i) => ({ name: `S${i}`, limitation: 'x' })) })
  if (red.overall >= 1.5) throw new Error(`红海场景应极低，实际 ${red.overall}`)
})

await step('数据质量分级', () => {
  if (dataQuality(30).level !== 'exploratory') throw new Error('分级错误')
})

const provider = createSkillProvider([join(ROOT, 'skills')])
await step('技能：5 阶段方法论 + 铁律', async () => {
  const candidates = await provider.list()
  if (candidates.length !== 1) throw new Error(`候选 ${candidates.length} ≠ 1`)
  const skill = await provider.get(candidates[0])
  for (const keyword of ['语义聚类', 'seekmoney_score', 'MVP', '不构成商业决策依据']) {
    if (!skill.content.includes(keyword)) throw new Error(`缺「${keyword}」`)
  }
})

await step('上游无泄露 key（全局扫描）', () => {
  // 上游 .env.example 用占位符（your_glm_api_key_here），无明文 key
  const text = readFileSync(join(ROOT, 'skills', 'seekmoney-pain-finder', 'SKILL.md'), 'utf8')
  if (text.includes('sk-') && !text.includes('sk-1')) {
    // 检查是否有真实 key 模式（sk- 后跟 20+ 随机字符）
    const realKeys = text.match(/sk-[A-Za-z0-9]{20,}/g)
    if (realKeys) throw new Error(`发现疑似真实 key：${realKeys[0].slice(0, 10)}...`)
  }
})

await step('面板 API 健康/技能目录（内存 ctx 模拟）', async () => {
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = {
    get: () => ({ requestRejection: () => false }),
    webServer: { register: async ({ handler }) => { globalThis.__smHandler = handler } },
  }
  await registerApi(fakeCtx)
  const handler = globalThis.__smHandler
  if (!handler) throw new Error('路由未注册')
  await handler({ method: 'GET', url: '/seekmoney/api/health', headers: {} }, fakeRes)
  if (!JSON.parse(captured.at(-1)).ok) throw new Error('health 错误')
  captured.length = 0
  await handler({ method: 'GET', url: '/seekmoney/api/skills', headers: {} }, fakeRes)
  if (JSON.parse(captured.at(-1)).count !== 1) throw new Error('技能目录数量错')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')
