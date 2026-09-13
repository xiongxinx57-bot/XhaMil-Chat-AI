/**
 * 消息投递缓冲：WS 推送后等待客户端 message-ack；
 * 重连时重放未确认消息，降低「在线却丢包」与短暂离线漏消息。
 */
import {
  isRedisReady,
  redisDel,
  redisGetJson,
  redisKey,
  redisSetJson,
  redisZAdd,
  redisZRangeWithScores,
  redisZRem
} from './redis.js'

const MAX_PENDING_PER_USER = 200
const PENDING_TTL_SEC = 72 * 3600

/** @type {Map<number, Map<string, { payload: object, at: number }>>} */
const memoryPending = new Map()

function pendingMember(conversationId, messageId) {
  return `${Number(conversationId)}:${Number(messageId)}`
}

function parseMember(member) {
  const [cid, mid] = String(member).split(':')
  return { conversationId: Number(cid) || 0, messageId: Number(mid) || 0 }
}

function memMap(userId) {
  const id = Number(userId)
  if (!memoryPending.has(id)) memoryPending.set(id, new Map())
  return memoryPending.get(id)
}

function trimMem(userId) {
  const map = memMap(userId)
  if (map.size <= MAX_PENDING_PER_USER) return
  const keys = [...map.keys()]
  const drop = keys.length - MAX_PENDING_PER_USER
  for (let i = 0; i < drop; i++) map.delete(keys[i])
}

export async function queueMessageDelivery(userId, payload) {
  const uid = Number(userId)
  const msg = payload?.message
  const mid = Number(msg?.id || 0)
  const cid = Number(payload?.conversationId || msg?.conversationId || 0)
  if (!uid || !mid || !cid || payload?.type !== 'message') return

  const member = pendingMember(cid, mid)
  const entry = { payload, at: Date.now() }
  const map = memMap(uid)
  map.set(member, entry)
  trimMem(uid)

  const zkey = redisKey('pending', String(uid))
  const pkey = redisKey('pendmsg', String(uid), member)
  await redisSetJson(pkey, payload, PENDING_TTL_SEC)
  await redisZAdd(zkey, mid, member, PENDING_TTL_SEC)
}

export async function ackMessageDelivery(userId, conversationId, messageId) {
  const uid = Number(userId)
  const mid = Number(messageId)
  const cid = Number(conversationId)
  if (!uid || !mid) return

  const member = pendingMember(cid || 0, mid)
  const map = memoryPending.get(uid)
  if (map) {
    // 允许只传 messageId：扫一遍删
    if (cid) map.delete(member)
    else {
      for (const k of [...map.keys()]) {
        if (k.endsWith(`:${mid}`)) map.delete(k)
      }
    }
    if (!map.size) memoryPending.delete(uid)
  }

  if (!isRedisReady()) return
  const zkey = redisKey('pending', String(uid))
  if (cid) {
    await redisZRem(zkey, member)
    await redisDel(redisKey('pendmsg', String(uid), member))
  } else {
    const rows = await redisZRangeWithScores(zkey, 0, -1)
    for (const row of rows) {
      if (String(row.value).endsWith(`:${mid}`)) {
        await redisZRem(zkey, row.value)
        await redisDel(redisKey('pendmsg', String(uid), row.value))
      }
    }
  }
}

/**
 * @param {number} userId
 * @param {(payload: object) => void} sendFn
 */
export async function flushPendingDeliveries(userId, sendFn) {
  const uid = Number(userId)
  if (!uid || typeof sendFn !== 'function') return 0
  let n = 0

  const map = memoryPending.get(uid)
  if (map?.size) {
    for (const { payload } of map.values()) {
      try {
        sendFn(payload)
        n++
      } catch {
        /* ignore */
      }
    }
  }

  if (isRedisReady()) {
    const zkey = redisKey('pending', String(uid))
    const rows = await redisZRangeWithScores(zkey, 0, -1)
    for (const row of rows) {
      const member = row.value
      if (map?.has(member)) continue
      const payload =
        (await redisGetJson(redisKey('pendmsg', String(uid), member))) || null
      if (!payload) {
        const { conversationId, messageId } = parseMember(member)
        if (conversationId && messageId) {
          // 无正文则跳过，清脏数据
          await redisZRem(zkey, member)
        }
        continue
      }
      try {
        sendFn(payload)
        n++
      } catch {
        /* ignore */
      }
    }
  }

  return n
}
