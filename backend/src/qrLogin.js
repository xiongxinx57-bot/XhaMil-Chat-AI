/**
 * 扫码登录会话（桌面展示二维码，App 扫码确认）。
 * Redis 可用时走 Redis；否则内存 Map 降级。
 * 二维码内容优先用 HTTPS（系统相机可读），兼容旧版 xhamil://login/...
 */
import crypto from 'crypto'
import { getPublicSiteUrl } from './config.js'
import { isRedisReady, redisDel, redisGetJson, redisKey, redisSetJson } from './redis.js'

const TTL_SEC = 120
const memorySessions = new Map()
const SESSION_ID_RE = /^[a-f0-9]{16,64}$/i

function nowMs() {
  return Date.now()
}

function makeSessionId() {
  return crypto.randomBytes(16).toString('hex')
}

export function buildQrLoginPayload(sessionId) {
  const id = String(sessionId || '').trim()
  const base = getPublicSiteUrl()
  if (base) return `${base}/qr/login/${id}`
  return `xhamil://login/${id}`
}

/** @returns {string|null} */
export function parseQrLoginPayload(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  let m = text.match(/^xhamil:\/\/login\/([a-f0-9]{16,64})$/i)
  if (m?.[1]) return m[1]
  m = text.match(/\/qr\/login\/([a-f0-9]{16,64})(?:[?#].*)?$/i)
  if (m?.[1]) return m[1]
  // 兼容纯 sessionId
  if (SESSION_ID_RE.test(text)) return text
  return null
}

function redisSessionKey(sessionId) {
  return redisKey('qrlogin', sessionId)
}

function pruneMemory() {
  const now = nowMs()
  for (const [id, s] of memorySessions) {
    if (!s || (Number(s.expiresAt) || 0) <= now) memorySessions.delete(id)
  }
}

async function saveSession(session) {
  const id = session.sessionId
  const ttl = Math.max(1, Math.ceil(((Number(session.expiresAt) || 0) - nowMs()) / 1000))
  if (isRedisReady()) {
    await redisSetJson(redisSessionKey(id), session, ttl)
  }
  memorySessions.set(id, session)
}

async function loadSession(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return null
  if (isRedisReady()) {
    const fromRedis = await redisGetJson(redisSessionKey(id))
    if (fromRedis) return fromRedis
  }
  pruneMemory()
  return memorySessions.get(id) || null
}

async function removeSession(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return
  memorySessions.delete(id)
  if (isRedisReady()) await redisDel(redisSessionKey(id))
}

function publicStatus(session) {
  const expired = !session || (Number(session.expiresAt) || 0) <= nowMs()
  if (!session || expired) {
    return {
      status: 'expired',
      deviceName: session?.deviceName || '',
      location: session?.location || ''
    }
  }
  const out = {
    status: session.status || 'pending',
    deviceName: session.deviceName || '',
    location: session.location || '',
    expiresAt: session.expiresAt,
    expireIn: Math.max(0, Math.ceil((Number(session.expiresAt) - nowMs()) / 1000))
  }
  if (session.scanner) {
    out.scanner = {
      userId: session.scanner.userId,
      nickname: session.scanner.nickname || '',
      username: session.scanner.username || '',
      avatarUrl: session.scanner.avatarUrl || ''
    }
  }
  if (session.status === 'confirmed' && session.auth) {
    out.token = session.auth.token
    out.user = session.auth.user
  }
  return out
}

export async function createQrLoginSession({ deviceName = '', location = '' } = {}) {
  const sessionId = makeSessionId()
  const expiresAt = nowMs() + TTL_SEC * 1000
  const session = {
    sessionId,
    payload: buildQrLoginPayload(sessionId),
    status: 'pending',
    deviceName: String(deviceName || 'Windows XhaMil').trim() || 'Windows XhaMil',
    location: String(location || '').trim(),
    createdAt: nowMs(),
    expiresAt,
    scanner: null,
    auth: null
  }
  await saveSession(session)
  return {
    sessionId,
    payload: session.payload,
    deviceName: session.deviceName,
    location: session.location,
    expiresAt,
    expireIn: TTL_SEC
  }
}

export async function getQrLoginStatus(sessionId) {
  const session = await loadSession(sessionId)
  if (!session) return { status: 'expired' }
  if ((Number(session.expiresAt) || 0) <= nowMs()) {
    await removeSession(sessionId)
    return publicStatus({ ...session, status: 'expired' })
  }
  return publicStatus(session)
}

export async function markQrLoginScanned(sessionId, user, extra = {}) {
  const session = await loadSession(sessionId)
  if (!session) {
    const err = new Error('二维码已失效，请刷新后重试')
    err.status = 410
    throw err
  }
  if ((Number(session.expiresAt) || 0) <= nowMs()) {
    await removeSession(sessionId)
    const err = new Error('二维码已过期，请刷新后重试')
    err.status = 410
    throw err
  }
  if (session.status === 'cancelled') {
    const err = new Error('该登录已取消')
    err.status = 409
    throw err
  }
  if (session.status === 'confirmed') {
    const err = new Error('该登录已确认')
    err.status = 409
    throw err
  }

  const nickname =
    String(user.nickname || user.username || '').trim() ||
    String(user.username || '用户').trim()
  session.status = 'scanned'
  session.scanner = {
    userId: Number(user.id || user.userId) || 0,
    nickname,
    username: String(user.username || '').trim(),
    avatarUrl: String(extra.avatarUrl || user.avatarUrl || user.avatar_url || '').trim()
  }
  if (extra.location) session.location = String(extra.location).trim()
  // 扫码后适当续期，方便确认
  session.expiresAt = Math.max(Number(session.expiresAt) || 0, nowMs() + 90 * 1000)
  await saveSession(session)
  return {
    sessionId: session.sessionId,
    status: 'scanned',
    deviceName: session.deviceName,
    location: session.location,
    scanner: session.scanner
  }
}

export async function confirmQrLogin(sessionId, auth) {
  const session = await loadSession(sessionId)
  if (!session) {
    const err = new Error('二维码已失效')
    err.status = 410
    throw err
  }
  if ((Number(session.expiresAt) || 0) <= nowMs()) {
    await removeSession(sessionId)
    const err = new Error('二维码已过期')
    err.status = 410
    throw err
  }
  if (session.status === 'cancelled') {
    const err = new Error('该登录已取消')
    err.status = 409
    throw err
  }
  session.status = 'confirmed'
  session.auth = {
    token: String(auth?.token || ''),
    user: auth?.user || null
  }
  session.expiresAt = nowMs() + 60 * 1000
  await saveSession(session)
  return true
}

export async function cancelQrLogin(sessionId, userId) {
  const session = await loadSession(sessionId)
  if (!session) return true
  if (session.scanner?.userId && Number(userId) && Number(session.scanner.userId) !== Number(userId)) {
    const err = new Error('无权取消该登录')
    err.status = 403
    throw err
  }
  session.status = 'cancelled'
  session.auth = null
  await saveSession(session)
  // 稍后再删，方便桌面轮询看到 cancelled
  setTimeout(() => {
    void removeSession(sessionId)
  }, 15_000)
  return true
}
