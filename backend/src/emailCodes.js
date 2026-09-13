import crypto from 'crypto'
import { loadConfig } from './config.js'
import { isSmtpReady, isValidEmail, normalizeEmail, sendVerificationEmail } from './email.js'
import { verifyGeetestFromRequestBody, resolveGeetestEnabled } from './geetest.js'
import { findUserByEmail } from './db.js'
import { getClientIp } from './clientIp.js'

const CODE_LENGTH = 6
const CODE_TTL_MS = 5 * 60 * 1000
const SEND_INTERVAL_MS = 60 * 1000
const MAX_PER_EMAIL_HOUR = 10
const MAX_PER_IP_HOUR = 30

/** @type {Record<string, { code: string, expiresAt: number, createdAt: number }>} */
const codes = {}
const lastSentByEmail = {}
/** @type {Record<string, { windowStart: number, count: number }>} */
const hourlyByEmail = {}
/** @type {Record<string, { windowStart: number, count: number }>} */
const hourlyByIp = {}

function cleanExpiredCodes() {
  const now = Date.now()
  for (const key of Object.keys(codes)) {
    if (codes[key].expiresAt <= now) delete codes[key]
  }
}

function bumpHourly(bucket, now) {
  if (!bucket.windowStart || now - bucket.windowStart > 60 * 60 * 1000) {
    bucket.windowStart = now
    bucket.count = 0
  }
  bucket.count += 1
  return bucket
}

function randomCode() {
  const min = 10 ** (CODE_LENGTH - 1)
  const max = 10 ** CODE_LENGTH
  return String(crypto.randomInt(min, max))
}

async function prepareEmailSend(req) {
  const config = loadConfig()
  if (config.emailVerificationEnabled !== true) {
    const err = new Error('邮箱验证未开启')
    err.status = 403
    throw err
  }
  if (!isSmtpReady(config)) {
    const err = new Error('发信未配置，请在管理后台填写邮箱 SMTP')
    err.status = 500
    throw err
  }

  if (resolveGeetestEnabled(config)) {
    const gr = await verifyGeetestFromRequestBody(req.body)
    if (!gr.ok) {
      const err = new Error(gr.message || '请完成行为验证')
      err.status = 400
      throw err
    }
  }

  cleanExpiredCodes()
  const email = normalizeEmail(req.body?.email)
  if (!isValidEmail(email)) {
    const err = new Error('邮箱格式不正确')
    err.status = 400
    throw err
  }
  return { config, email }
}

async function assertEmailSendGate(req, email) {
  const now = Date.now()
  const lastSent = lastSentByEmail[email] || 0
  if (now - lastSent < SEND_INTERVAL_MS) {
    const waitSec = Math.ceil((SEND_INTERVAL_MS - (now - lastSent)) / 1000)
    const err = new Error(`发送过于频繁，请${waitSec}秒后再试`)
    err.status = 429
    throw err
  }

  const emailBucket = bumpHourly(hourlyByEmail[email] || { windowStart: now, count: 0 }, now)
  if (emailBucket.count > MAX_PER_EMAIL_HOUR) {
    const err = new Error('该邮箱发送次数过多，请1小时后再试')
    err.status = 429
    throw err
  }
  hourlyByEmail[email] = emailBucket

  const ip = getClientIp(req)
  const ipBucket = bumpHourly(hourlyByIp[ip] || { windowStart: now, count: 0 }, now)
  if (ipBucket.count > MAX_PER_IP_HOUR) {
    const err = new Error('发送次数过多，请1小时后再试')
    err.status = 429
    throw err
  }
  hourlyByIp[ip] = ipBucket
}

async function deliverEmailCode(email, config) {
  const code = randomCode()
  const validMin = Math.max(1, Math.floor(CODE_TTL_MS / 60000))
  codes[email] = { code, createdAt: Date.now(), expiresAt: Date.now() + CODE_TTL_MS }
  try {
    await sendVerificationEmail(email, code, validMin, config)
  } catch (e) {
    delete codes[email]
    console.error('[email] 发送验证码失败:', e.message)
    const err = new Error('邮件发送失败，请检查 SMTP 配置')
    err.status = 500
    throw err
  }
  lastSentByEmail[email] = Date.now()
}

export async function sendRegisterEmailCode(req) {
  const { config, email } = await prepareEmailSend(req)
  const existing = await findUserByEmail(email)
  if (existing) {
    const err = new Error('该邮箱已被注册，每个邮箱只能绑定一个账号')
    err.status = 409
    throw err
  }
  await assertEmailSendGate(req, email)
  await deliverEmailCode(email, config)
}

export async function sendLoginEmailCode(req) {
  const { config, email } = await prepareEmailSend(req)
  const existing = await findUserByEmail(email)
  if (!existing) {
    const err = new Error('该邮箱未注册')
    err.status = 404
    throw err
  }
  if (existing.status === 'banned') {
    const err = new Error('账号已被封禁')
    err.status = 403
    throw err
  }
  await assertEmailSendGate(req, email)
  await deliverEmailCode(email, config)
}

export function verifyRegisterEmailCode(email, code) {
  cleanExpiredCodes()
  const normalized = normalizeEmail(email)
  const input = String(code || '').trim()
  if (!isValidEmail(normalized)) {
    return { ok: false, message: '邮箱格式不正确' }
  }
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(input)) {
    return { ok: false, message: `验证码应为${CODE_LENGTH}位数字` }
  }
  const stored = codes[normalized]
  if (!stored) return { ok: false, message: '验证码无效或已过期，请重新获取' }
  if (stored.expiresAt <= Date.now()) {
    delete codes[normalized]
    return { ok: false, message: '验证码已过期，请重新获取' }
  }
  if (stored.code !== input) return { ok: false, message: '验证码错误' }
  return { ok: true }
}

export function consumeRegisterEmailCode(email) {
  const normalized = normalizeEmail(email)
  delete codes[normalized]
}
