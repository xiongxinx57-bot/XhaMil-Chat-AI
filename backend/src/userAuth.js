import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { findUserById } from './db.js'
import { fail, failBanned } from './response.js'
import { isRedisReady, redisDel, redisGetJson, redisKey, redisSetJson } from './redis.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, '..', 'data', 'user-sessions.json')
const SESSION_TTL_SEC = 30 * 24 * 3600

/** @type {Map<string, { userId: number, username: string, nickname: string, createdAt: number }>} */
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
      if (!token || !value?.userId) continue
      sessions.set(token, {
        userId: Number(value.userId),
        username: String(value.username || ''),
        nickname: String(value.nickname || ''),
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

function sessionRedisKey(token) {
  return redisKey('sess', token)
}

async function writeSessionRedis(token, session) {
  await redisSetJson(sessionRedisKey(token), session, SESSION_TTL_SEC)
}

async function deleteSessionRedis(token) {
  await redisDel(sessionRedisKey(token))
}

loadSessions()

export function createUserSession(user) {
  const token = crypto.randomBytes(24).toString('hex')
  const session = {
    userId: Number(user?.id || user?.userId) || 0,
    username: user.username,
    nickname: user.nickname,
    createdAt: Date.now()
  }
  if (!session.userId) {
    throw new Error('无法创建会话：缺少用户 ID')
  }
  sessions.set(token, session)
  persistSessions()
  void writeSessionRedis(token, session)
  return token
}

export function getUserSession(token) {
  if (!token) return null
  return sessions.get(token) || null
}

/** 内存未命中时查 Redis（HTTP/WS 异步路径可用） */
export async function getUserSessionAsync(token) {
  if (!token) return null
  const hit = sessions.get(token)
  if (hit) return hit
  if (!isRedisReady()) return null
  const remote = await redisGetJson(sessionRedisKey(token))
  if (!remote?.userId) return null
  const session = {
    userId: Number(remote.userId),
    username: String(remote.username || ''),
    nickname: String(remote.nickname || ''),
    createdAt: Number(remote.createdAt) || Date.now()
  }
  sessions.set(token, session)
  return session
}

export function revokeUserSession(token) {
  if (!token) return
  if (sessions.delete(token)) persistSessions()
  void deleteSessionRedis(token)
}

export function revokeUserSessionsByUserId(userId) {
  const id = Number(userId)
  if (!id) return
  let changed = false
  for (const [token, session] of sessions.entries()) {
    if (Number(session.userId) === id) {
      sessions.delete(token)
      void deleteSessionRedis(token)
      changed = true
    }
  }
  if (changed) persistSessions()
}

export function syncUserSessionsByUserId(userId, { username, nickname } = {}) {
  const id = Number(userId)
  if (!id) return
  let changed = false
  for (const [token, session] of sessions.entries()) {
    if (Number(session.userId) !== id) continue
    if (username !== undefined) {
      session.username = username
      changed = true
    }
    if (nickname !== undefined) {
      session.nickname = nickname
      changed = true
    }
    if (changed) void writeSessionRedis(token, session)
  }
  if (changed) persistSessions()
}

export function requireUser(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  getUserSessionAsync(token)
    .then((session) => {
      if (!session) {
        return fail(res, 401, '请先登录')
      }
      return findUserById(session.userId).then((user) => {
        if (!user) {
          revokeUserSession(token)
          return fail(res, 401, '请先登录')
        }
        if (user.status === 'banned') {
          revokeUserSession(token)
          return failBanned(res)
        }
        req.user = session
        req.authUser = {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarUrl: user.avatar_url || user.avatarUrl || ''
        }
        req.authToken = token
        next()
      })
    })
    .catch(() => fail(res, 500, '服务器错误'))
}

export function requireUserOrQueryToken(req, res, next) {
  const header = req.headers.authorization || ''
  let token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) token = String(req.query.token || '').trim()
  getUserSessionAsync(token)
    .then((session) => {
      if (!session) {
        return fail(res, 401, '请先登录')
      }
      return findUserById(session.userId).then((user) => {
        if (!user) {
          revokeUserSession(token)
          return fail(res, 401, '请先登录')
        }
        if (user.status === 'banned') {
          revokeUserSession(token)
          return failBanned(res)
        }
        req.user = session
        req.authUser = {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarUrl: user.avatar_url || user.avatarUrl || ''
        }
        req.authToken = token
        next()
      })
    })
    .catch(() => fail(res, 500, '服务器错误'))
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex')
  if (hash.length !== attempt.length) return false
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'))
}
