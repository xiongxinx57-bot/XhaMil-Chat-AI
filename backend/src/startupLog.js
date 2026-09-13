import dns from 'dns/promises'

const useColor = Boolean(process.stdout.isTTY)
const W = 66

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[97m'
}

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const statusRows = []

function paint(code, text) {
  if (!useColor) return text
  return `${code}${text}${c.reset}`
}

function vis(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '').length
}

function pad(text, width) {
  const s = String(text)
  return s + ' '.repeat(Math.max(0, width - vis(s)))
}

function line(text = '') {
  console.log(text)
}

function sectionTitle(label) {
  const prefix = `  ┌─ ${label} `
  const dashes = Math.max(0, W - vis(prefix) - 1)
  line(`${paint(c.gray, prefix)}${paint(c.gray, '─'.repeat(dashes))}${paint(c.gray, '┐')}`)
}

function sectionEnd() {
  line(`  ${paint(c.gray, `└${'─'.repeat(W - 2)}┘`)}`)
}

function row(content) {
  line(`  ${paint(c.gray, '│')} ${pad(content, W - 4)} ${paint(c.gray, '│')}`)
}

function kv(label, value, valueColor = c.cyan) {
  row(`${paint(c.gray, label.padEnd(10, ' '))} ${paint(valueColor, value)}`)
}

function formatTime() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function subtleGradient(text) {
  if (!useColor) return text
  const stops = [c.blue, c.cyan, c.white]
  return [...text]
    .map((ch, i) =>
      ch === ' '
        ? ch
        : paint(stops[Math.min(stops.length - 1, Math.floor((i / Math.max(text.length, 1)) * stops.length))], ch)
    )
    .join('')
}

function badge(ok) {
  return ok ? paint(c.green, ' OK  ') + paint(c.dim, '·') : paint(c.red, ' ERR ') + paint(c.dim, '·')
}

function printHeader() {
  line()
  line(`  ${paint(c.gray, '╭' + '─'.repeat(W - 2) + '╮')}`)
  line(
    `  ${paint(c.gray, '│')} ${pad(subtleGradient('XhaMil') + paint(c.gray, '  ') + paint(c.bold + c.white, 'Chat Server'), W - 4)} ${paint(c.gray, '│')}`
  )
  line(
    `  ${paint(c.gray, '│')} ${pad(paint(c.dim, '企业级即时通讯 · 实时信令 · WebRTC'), W - 4)} ${paint(c.gray, '│')}`
  )
  line(`  ${paint(c.gray, '╰' + '─'.repeat(W - 2) + '╯')}`)
  line(
    `  ${paint(c.dim, formatTime())}    ${paint(c.gray, '运行时')} ${paint(c.white, process.version)}    ${paint(c.gray, '环境')} ${paint(c.white, process.env.NODE_ENV || 'development')}`
  )
  line()
}

export function printBanner() {
  printHeader()
}

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail]
 */
export function logStatus(name, ok, detail = '') {
  statusRows.push({ name, ok, detail: detail || '' })
}

export function flushStatusPanel() {
  if (!statusRows.length) return

  sectionTitle('系统检测')
  for (const item of statusRows) {
    const label = paint(c.white, pad(item.name, 14))
    const state = item.ok ? paint(c.green, '在线') : paint(c.red, '离线')
    const detail = item.detail ? paint(c.dim, item.detail) : paint(c.dim, '—')
    row(`${badge(item.ok)} ${label} ${state}  ${detail}`)
  }
  sectionEnd()
  line()
  statusRows.length = 0
}

export function logDivider() {
  line()
}

/**
 * @param {{ adminUrl: string, localAdminUrl?: string, adminEntryFile?: string, dbConnected: boolean, listen?: string }} opts
 */
export function printReady({
  adminUrl,
  localAdminUrl = '',
  adminEntryFile = '',
  dbConnected,
  listen = ''
}) {
  flushStatusPanel()

  line(`  ${paint(c.green, '●')} ${paint(c.bold + c.white, '服务已就绪')}${listen ? paint(c.dim, `  ·  ${listen}`) : ''}`)
  line()

  sectionTitle('服务入口')
  if (adminEntryFile) {
    kv('管理入口', adminEntryFile, c.yellow)
  }
  kv('后台地址', adminUrl)
  if (localAdminUrl && localAdminUrl !== adminUrl) {
    kv('本机调试', localAdminUrl, c.dim)
  }
  sectionEnd()
  line()

  line(
    `  ${paint(c.dim, '安全策略')}  ${paint(c.gray, '/admin 已禁用')}  ${paint(c.dim, '·')}  ${paint(c.gray, '随机化后台路径')}`
  )
  line()

  if (!dbConnected) {
    line(
      `  ${paint(c.yellow, '●')} ${paint(c.yellow, '数据库不可用')}  ${paint(c.dim, '→ 请配置 json/config.json · database')}`
    )
    line()
  }
}

/** @param {string} [host] */
export async function checkStunHost(host = 'stun.l.google.com') {
  try {
    await dns.lookup(host)
    return { ok: true, host }
  } catch (e) {
    return { ok: false, host, error: e?.message || 'DNS 解析失败' }
  }
}
