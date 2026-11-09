// 面板数据面：/seekmoney 前缀路由（健康 + 技能目录 + TikHub token 配置）。
// 每请求鉴权三件套：connection.requestRejection + Origin 同源 + sec-fetch-site。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDir } from './skills.js'
import { getSettings, saveSettings, clearSettings, maskSettings, resolveToken } from './settings.js'
import { PLATFORMS, PLATFORM_KEYS } from './platforms.js'

const BASE = '/seekmoney'
const SKILL_DIRS = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

function readJson(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') {
      return reject(Object.assign(new Error('拒绝跨站请求'), { status: 403 }))
    }
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      return reject(Object.assign(new Error('Origin 与 Host 不同源'), { status: 403 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > max) { req.destroy(); return reject(Object.assign(new Error('请求体过大'), { status: 413 })) }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

export function registerApi(ctx, config = {}) {
  const credentials = () => maskSettings()
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'

        if (path === '/api/health' && req.method === 'GET') {
          // token 只报告是否已配置（面板 settings / 插件 Config / 环境变量任一来源），绝不回显
          return json(res, 200, {
            ok: true,
            tikhub: Boolean(resolveToken(config)),
            credentials: credentials(),
            platforms: PLATFORM_KEYS.map((k) => ({ key: k, label: PLATFORMS[k].label, enabled: PLATFORMS[k].enabled, comments: Boolean(PLATFORMS[k].comments) })),
          })
        }
        if (path === '/api/config' && req.method === 'GET') {
          return json(res, 200, credentials())
        }
        if (path === '/api/config' && req.method === 'POST') {
          const body = await readJson(req)
          const token = String(body.tikhubToken || '').trim()
          if (!token) return json(res, 400, { error: 'token 不能为空' })
          if (token.length < 16) return json(res, 400, { error: 'token 太短，看起来不像 TikHub token' })
          return json(res, 200, { ok: true, credentials: saveSettings({ tikhubToken: token }) })
        }
        if (path === '/api/config' && req.method === 'DELETE') {
          clearSettings()
          return json(res, 200, { ok: true, credentials: credentials() })
        }
        if (path === '/api/skills' && req.method === 'GET') {
          const skills = SKILL_DIRS.flatMap((dir) => readDir(dir)).map((s) => ({ name: s.name, description: s.description }))
          return json(res, 200, { count: skills.length, skills })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, typeof err?.status === 'number' ? err.status : 500, { error: err?.message || '内部错误' })
      }
    },
  })
}

export { getSettings }

