/**
 * Redis 可选依赖：enabled=false 或连不上时全部 no-op，业务走内存/JSON。
 */
import { createClient } from 'redis'
import { loadConfig } from './config.js'

/** @type {import('redis').RedisClientType | null} */
let client = null
let ready = false
let connecting = false
let prefix = 'xhamil:'

export function isRedisReady() {
  return ready && !!client
}

export function redisKey(...parts) {
  const body = parts
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(':')
  return `${prefix}${body}`
}

function cfg() {
  try {
    return loadConfig()?.redis || {}
  } catch {
    return {}
  }
}

export async function initRedis() {
  if (connecting || ready) return isRedisReady()
  const redisCfg = cfg()
  const enabled = redisCfg.enabled !== false && redisCfg.enabled !== 0 && redisCfg.enabled !== '0'
  prefix = String(redisCfg.keyPrefix || 'xhamil:').trim() || 'xhamil:'
  if (!enabled) {
    ready = false
    client = null
    return false
  }

  connecting = true
  const urlFromCfg = String(redisCfg.url || '').trim()
  const host = String(redisCfg.host || '127.0.0.1').trim() || '127.0.0.1'
  const port = Number(redisCfg.port || 6379) || 6379
  const password = String(redisCfg.password || '').trim()
  const db = Number(redisCfg.db || 0) || 0
  const url =
    urlFromCfg ||
    (password
      ? `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`
      : `redis://${host}:${port}/${db}`)
  try {
    const c = createClient({
      url,
      socket: {
        connectTimeout: 4000,
        reconnectStrategy: (retries) => {
          if (retries > 12) return false
          return Math.min(1000 * 2 ** retries, 15_000)
        }
      }
    })
    c.on('error', (err) => {
      if (ready) console.warn('[redis]', err?.message || err)
    })
    c.on('end', () => {
      ready = false
    })
    await c.connect()
    client = c
    ready = true
    connecting = false
    return true
  } catch (e) {
    connecting = false
    ready = false
    client = null
    console.warn('[redis] 未连接，会话/投递走内存:', e?.message || e)
    return false
  }
}

export async function closeRedis() {
  ready = false
  const c = client
  client = null
  if (!c) return
  try {
    await c.quit()
  } catch {
    try {
      c.disconnect()
    } catch {
      /* ignore */
    }
  }
}

export async function redisGetJson(key) {
  if (!isRedisReady()) return null
  try {
    const raw = await client.get(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function redisSetJson(key, value, ttlSec = 0) {
  if (!isRedisReady()) return false
  try {
    const body = JSON.stringify(value)
    const ttl = Number(ttlSec) || 0
    if (ttl > 0) await client.set(key, body, { EX: ttl })
    else await client.set(key, body)
    return true
  } catch {
    return false
  }
}

export async function redisDel(...keys) {
  if (!isRedisReady()) return 0
  const list = keys.map((k) => String(k || '')).filter(Boolean)
  if (!list.length) return 0
  try {
    return await client.del(list)
  } catch {
    return 0
  }
}

export async function redisZAdd(key, score, member, ttlSec = 0) {
  if (!isRedisReady()) return false
  try {
    await client.zAdd(key, { score: Number(score) || 0, value: String(member) })
    const ttl = Number(ttlSec) || 0
    if (ttl > 0) await client.expire(key, ttl)
    return true
  } catch {
    return false
  }
}

export async function redisZRem(key, ...members) {
  if (!isRedisReady()) return 0
  const list = members.map((m) => String(m || '')).filter(Boolean)
  if (!list.length) return 0
  try {
    return await client.zRem(key, list)
  } catch {
    return 0
  }
}

/** @returns {Promise<Array<{ value: string, score: number }>>} */
export async function redisZRangeWithScores(key, start = 0, stop = -1) {
  if (!isRedisReady()) return []
  try {
    const rows = await client.zRangeWithScores(key, start, stop)
    return (rows || []).map((r) => ({
      value: String(r.value),
      score: Number(r.score) || 0
    }))
  } catch {
    return []
  }
}

export async function redisSetOnline(userId, ttlSec = 90) {
  const uid = Number(userId)
  if (!uid || !isRedisReady()) return false
  try {
    const key = redisKey('online', String(uid))
    const ttl = Math.max(15, Number(ttlSec) || 90)
    await client.set(key, '1', { EX: ttl })
    return true
  } catch {
    return false
  }
}

export async function redisDelOnline(userId) {
  const uid = Number(userId)
  if (!uid) return 0
  return redisDel(redisKey('online', String(uid)))
}

export async function redisIsOnline(userId) {
  const uid = Number(userId)
  if (!uid || !isRedisReady()) return false
  try {
    const v = await client.get(redisKey('online', String(uid)))
    return !!v
  } catch {
    return false
  }
}
