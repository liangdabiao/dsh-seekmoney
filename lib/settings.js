// 痛点发现 · 面板侧密钥配置（$DSH_HOME/seekmoney/settings.json）。
// 本插件自带一把 TikHub token，自己干活，不依赖其它插件。
// 安全：HTTP 接口只回掩码与是否已配置，绝不回明文。
import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'seekmoney')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

function load() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function save(settings) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${SETTINGS_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(tmp, SETTINGS_FILE)
  try { chmodSync(SETTINGS_FILE, 0o600) } catch { /* Windows 上忽略 */ }
}

export function getSettings() {
  const s = load()
  return { tikhubToken: typeof s.tikhubToken === 'string' ? s.tikhubToken : '' }
}

export function saveSettings({ tikhubToken }) {
  const next = {
    tikhubToken: typeof tikhubToken === 'string' && tikhubToken.trim() ? tikhubToken.trim() : getSettings().tikhubToken,
  }
  save(next)
  return maskSettings(next)
}

export function clearSettings() {
  save({ tikhubToken: '' })
  return maskSettings({ tikhubToken: '' })
}

/** 生效 token：面板 settings.json 优先 → 插件 Config → 环境变量 TIKHUB_TOKEN */
export function resolveToken(config = {}) {
  const s = getSettings()
  return (typeof s.tikhubToken === 'string' && s.tikhubToken)
    || (typeof config?.tikhubToken === 'string' && config.tikhubToken)
    || process.env.TIKHUB_TOKEN
    || ''
}

export function maskSettings(s = getSettings()) {
  const t = s.tikhubToken || ''
  return {
    configured: Boolean(t),
    tokenMasked: t ? `${t.slice(0, 4)}****${t.slice(-4)}` : '',
    file: SETTINGS_FILE,
  }
}

export { SETTINGS_FILE, DATA_DIR }
