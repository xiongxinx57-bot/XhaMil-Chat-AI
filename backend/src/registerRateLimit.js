import { getClientIp, normalizeRegisterIp } from './clientIp.js'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const MAX_PER_MINUTE = 3
const MAX_PER_HOUR = 10

/** @type {Map<string, { minuteStart: number, minuteCount: number, hourStart: number, hourCount: number }>} */
const buckets = new Map()

function clientKey(req) {
  return normalizeRegisterIp(getClientIp(req)) || '0.0.0.0'
}

function bumpBucket(key) {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { minuteStart: now, minuteCount: 0, hourStart: now, hourCount: 0 }
  }
  if (now - bucket.minuteStart >= MINUTE_MS) {
    bucket.minuteStart = now
    bucket.minuteCount = 0
  }
  if (now - bucket.hourStart >= HOUR_MS) {
    bucket.hourStart = now
    bucket.hourCount = 0
  }
  bucket.minuteCount += 1
  bucket.hourCount += 1
  buckets.set(key, bucket)
  return bucket
}

export function assertRegisterBurstLimit(req, label = 'register') {
  const key = clientKey(req)
  const bucket = bumpBucket(key)
  if (bucket.minuteCount > MAX_PER_MINUTE) {
    console.warn(`[rate-limit] ${label} blocked (minute) ip=${key} count=${bucket.minuteCount}`)
    const err = new Error('注册过于频繁，请1分钟后再试')
    err.status = 429
    throw err
  }
  if (bucket.hourCount > MAX_PER_HOUR) {
    console.warn(`[rate-limit] ${label} blocked (hour) ip=${key} count=${bucket.hourCount}`)
    const err = new Error('今日注册次数已达上限，请稍后再试')
    err.status = 429
    throw err
  }
}

const BLOCKED_USERNAME_RE = /^(bot|zombie|spam|testbot|fake|testuser)_/i

export function assertAllowedRegisterUsername(username) {
  const name = String(username || '').trim()
  if (BLOCKED_USERNAME_RE.test(name)) {
    const err = new Error('该账户名不可用')
    err.status = 400
    throw err
  }
}
