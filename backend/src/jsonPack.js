import fs from 'fs'
import path from 'path'
import { JSON_DIR, CONFIG_PATH, DEFAULT_CONFIG, loadConfig } from './config.js'

export const JSON_PACK_FORMAT = 'xhamil-json-pack'
export const JSON_PACK_VERSION = 1
export const IMPORT_JSON_PACK_CONFIRM_PHRASE = '我已确认导入并覆盖配置'
export const CLEAR_JSON_PACK_CONFIRM_PHRASE = '我已确认清理全部配置'

/** 允许打包的 json/ 文件（仅白名单） */
export const JSON_PACK_FILES = ['config.json', 'changelog.json']

const SECRET_TOP_KEYS = [
  'smtpPassword',
  'geetestCaptchaKey',
  'voiceToTextApiKey',
  'siliconflowApiKey',
  'groqApiKey',
  'aliyunAccessKeyId',
  'aliyunAccessKeySecret',
  'aliyunSmsAccessKeyId',
  'aliyunSmsAccessKeySecret',
  'amapWebApiKey'
]

function ensureJsonDir() {
  fs.mkdirSync(JSON_DIR, { recursive: true })
}

function safePackName(name) {
  const base = path.basename(String(name || ''))
  if (!JSON_PACK_FILES.includes(base)) return ''
  return base
}

function readJsonFile(name) {
  const file = path.join(JSON_DIR, name)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`读取 ${name} 失败：${e.message || e}`)
  }
}

function writeJsonFile(name, data) {
  ensureJsonDir()
  const file = path.join(JSON_DIR, name)
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/** 发给别人部署时默认清空密钥/密码，避免把生产机密带走 */
export function scrubConfigSecrets(config) {
  if (!config || typeof config !== 'object') return config
  const out = structuredClone(config)
  if (out.admin && typeof out.admin === 'object') {
    out.admin = { ...out.admin, password: '' }
  }
  if (out.database && typeof out.database === 'object') {
    out.database = {
      ...out.database,
      host: '127.0.0.1',
      user: 'root',
      password: '',
      database: out.database.database || 'xhamil_chat'
    }
  }
  if (out.turnstile && typeof out.turnstile === 'object') {
    out.turnstile = { ...out.turnstile, secretKey: '' }
  }
  for (const key of SECRET_TOP_KEYS) {
    if (key in out) out[key] = ''
  }
  return out
}

export function listJsonPackFiles() {
  ensureJsonDir()
  return JSON_PACK_FILES.map((name) => {
    const file = path.join(JSON_DIR, name)
    const exists = fs.existsSync(file)
    let size = 0
    let mtime = null
    if (exists) {
      const st = fs.statSync(file)
      size = st.size
      mtime = st.mtime.toISOString()
    }
    return {
      name,
      exists,
      size,
      sizeText: exists ? `${(size / 1024).toFixed(1)} KB` : '—',
      mtime,
      desc: name === 'config.json' ? '系统配置' : name === 'changelog.json' ? '更新日志' : name
    }
  })
}

/**
 * 导出 json/ 配置包
 * @param {{ includeSecrets?: boolean, files?: string[] }} opts
 */
export function exportJsonPack({ includeSecrets = false, files } = {}) {
  ensureJsonDir()
  let wanted
  if (Array.isArray(files) && files.length) {
    wanted = files.map(safePackName).filter(Boolean)
  } else if (typeof files === 'string' && files.trim()) {
    wanted = files
      .split(',')
      .map((s) => safePackName(s.trim()))
      .filter(Boolean)
  } else {
    wanted = [...JSON_PACK_FILES]
  }
  if (!wanted.length) throw new Error('请至少选择一个配置文件')

  const outFiles = {}
  const meta = {}
  for (const name of wanted) {
    const data = readJsonFile(name)
    if (data == null) {
      meta[name] = { exists: false }
      continue
    }
    let payload = data
    if (name === 'config.json' && !includeSecrets) {
      payload = scrubConfigSecrets(data)
    }
    outFiles[name] = payload
    meta[name] = { exists: true, scrubbed: name === 'config.json' && !includeSecrets }
  }

  return {
    format: JSON_PACK_FORMAT,
    version: JSON_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    includeSecrets: !!includeSecrets,
    fileOrder: wanted,
    fileMeta: meta,
    files: outFiles
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * 导入 json/ 配置包
 * @param {object} payload
 * @param {{ mode?: 'replace'|'merge' }} opts
 */
export async function importJsonPack(payload, { mode = 'replace' } = {}) {
  if (!payload || payload.format !== JSON_PACK_FORMAT) {
    throw new Error('无效的配置包：缺少 format=xhamil-json-pack')
  }
  const filesObj = payload.files && typeof payload.files === 'object' ? payload.files : null
  if (!filesObj) throw new Error('无效的配置包：缺少 files')

  const importMode = String(mode || 'replace').toLowerCase() === 'merge' ? 'merge' : 'replace'
  const order =
    Array.isArray(payload.fileOrder) && payload.fileOrder.length
      ? payload.fileOrder.map(safePackName).filter(Boolean)
      : Object.keys(filesObj).map(safePackName).filter(Boolean)
  const names = [...new Set(order.filter((n) => Object.prototype.hasOwnProperty.call(filesObj, n)))]
  if (!names.length) throw new Error('配置包中没有可导入的文件')

  ensureJsonDir()
  const written = []
  for (const name of names) {
    const incoming = filesObj[name]
    if (incoming == null || typeof incoming !== 'object') {
      throw new Error(`${name} 内容无效`)
    }
    let next = incoming
    if (importMode === 'merge') {
      const current = readJsonFile(name)
      next = current ? deepMerge(current, incoming) : incoming
    }
    writeJsonFile(name, next)
    written.push(name)
  }

  // 若写了 config 且库密码齐全，尝试按新库配置重连（失败不阻断导入）
  let dbReconnect = null
  if (written.includes('config.json')) {
    try {
      const cfg = loadConfig()
      const hasDb =
        cfg.database?.host &&
        cfg.database?.user &&
        cfg.database?.database &&
        String(cfg.database?.password || '').length > 0
      if (hasDb) {
        const { setDatabaseConfig } = await import('./db.js')
        dbReconnect = await setDatabaseConfig({
          host: cfg.database.host,
          port: cfg.database.port,
          user: cfg.database.user,
          password: cfg.database.password,
          database: cfg.database.database,
          charset: cfg.database.charset
        })
      } else {
        dbReconnect = {
          skipped: true,
          message: '配置已写入；数据库密码为空，请在后台重新填写并连接'
        }
      }
    } catch (e) {
      dbReconnect = { ok: false, message: e.message || String(e) }
    }
  }

  return {
    success: true,
    mode: importMode,
    written,
    configPath: CONFIG_PATH,
    dbReconnect,
    message: `已${importMode === 'replace' ? '覆盖' : '合并'}导入：${written.join('、')}`
  }
}

/** 清理 json/ 配置包：config 恢复默认，changelog 清空 */
export async function clearAllJsonPack() {
  ensureJsonDir()
  const nextConfig = structuredClone(DEFAULT_CONFIG)
  // 保留当前后台入口码，避免清理后立刻进不了后台
  try {
    const cur = loadConfig()
    if (cur?.admin?.entryCode) {
      nextConfig.admin = { ...nextConfig.admin, entryCode: cur.admin.entryCode }
    }
  } catch {
    /* ignore */
  }
  writeJsonFile('config.json', nextConfig)
  writeJsonFile('changelog.json', { entries: [] })

  let dbClosed = false
  try {
    const { closeDatabase } = await import('./db.js')
    if (typeof closeDatabase === 'function') {
      await closeDatabase()
      dbClosed = true
    }
  } catch {
    /* ignore */
  }

  return {
    success: true,
    cleared: ['config.json', 'changelog.json'],
    files: listJsonPackFiles(),
    dbClosed,
    message: '已清理全部配置：config.json 恢复默认，changelog.json 已清空（后台入口码已保留）'
  }
}
