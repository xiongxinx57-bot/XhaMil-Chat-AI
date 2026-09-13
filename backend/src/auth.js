import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, '..', 'data', 'sessions.json')

/** @type {Map<string, { username: string, createdAt: number }>} */
const sessions = new Map()

function ensureSessionDir() {
  const dir = path.dirname(SESSION_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadSessions() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    if (!raw || typeof raw !== 'object') return
    for (const [token, value] of Object.entries(raw)) {
      if (!token || !value?.username) continue
      sessions.set(token, {
        username: String(value.username),
        createdAt: Number(value.createdAt) || Date.now()
      })
    }
  } catch {
    // ignore corrupt session file
  }
}

function persistSessions() {
  try {
    ensureSessionDir()
    const obj = Object.fromEntries(sessions.entries())
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj), 'utf8')
  } catch {
    // best-effort
  }
}

loadSessions()

export function getBootId() {
  return 'persistent'
}

export function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, { username, createdAt: Date.now() })
  persistSessions()
  return token
}

export function getSession(token) {
  if (!token) return null
  const hit = sessions.get(token)
  if (hit) return hit
  // FastAdmin 等外部进程可能直接写入 sessions.json，未命中时再读盘
  loadSessions()
  return sessions.get(token) || null
}

export function revokeSession(token) {
  if (!token) return
  if (sessions.delete(token)) persistSessions()
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const session = getSession(token)
  if (!session) {
    return res.status(401).json({ code: 401, message: '请先登录管理后台', data: null })
  }
  req.admin = session
  next()
}
