import { loadConfig } from './config.js'
import { verifyGeetestFromRequestBody, resolveGeetestEnabled } from './geetest.js'
import {
  checkAliyunSmsVerifyCode,
  isSmsVerificationEnabled,
  isValidCnPhone,
  normalizePhone,
  sendAliyunSmsVerifyCode
} from './aliyunSms.js'
import { findUserByPhone } from './db.js'
import { getClientIp } from './clientIp.js'

const SEND_INTERVAL_MS = 60 * 1000
const MAX_PER_PHONE_HOUR = 8
const MAX_PER_IP_HOUR = 30

const lastSentByPhone = {}
/** @type {Record<string, { windowStart: number, count: number }>} */
const hourlyByPhone = {}
/** @type {Record<string, { windowStart: number, count: number }>} */
const hourlyByIp = {}

function bumpHourly(bucket, now) {
  if (!bucket.windowStart || now - bucket.windowStart > 60 * 60 * 1000) {
    bucket.windowStart = now
    bucket.count = 0
  }
  bucket.count += 1
  return bucket
}

async function assertSmsSendGate(req, phone) {
  const now = Date.now()
  const lastSent = lastSentByPhone[phone] || 0
  if (now - lastSent < SEND_INTERVAL_MS) {
    const waitSec = Math.ceil((SEND_INTERVAL_MS - (now - lastSent)) / 1000)
    const err = new Error(`发送过于频繁，请${waitSec}秒后再试`)
    err.status = 429
    throw err
  }

  const phoneBucket = bumpHourly(hourlyByPhone[phone] || { windowStart: now, count: 0 }, now)
  if (phoneBucket.count > MAX_PER_PHONE_HOUR) {
    const err = new Error('该手机号发送次数过多，请1小时后再试')
    err.status = 429
    throw err
  }
  hourlyByPhone[phone] = phoneBucket

  const ip = getClientIp(req)
  const ipBucket = bumpHourly(hourlyByIp[ip] || { windowStart: now, count: 0 }, now)
  if (ipBucket.count > MAX_PER_IP_HOUR) {
    const err = new Error('发送次数过多，请1小时后再试')
    err.status = 429
    throw err
  }
  hourlyByIp[ip] = ipBucket
}

async function prepareSmsSend(req) {
  const config = loadConfig()
  if (!isSmsVerificationEnabled(config)) {
    const err = new Error('短信验证未开启')
    err.status = 403
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

  const phone = normalizePhone(req.body?.phone || req.body?.mobile)
  if (!isValidCnPhone(phone)) {
    const err = new Error('请输入有效手机号')
    err.status = 400
    throw err
  }
  return { config, phone }
}

export async function sendRegisterSmsCode(req) {
  const { config, phone } = await prepareSmsSend(req)
  const existing = await findUserByPhone(phone)
  if (existing) {
    const err = new Error('该手机号已被注册')
    err.status = 409
    throw err
  }
  await assertSmsSendGate(req, phone)
  await sendAliyunSmsVerifyCode(phone, config)
  lastSentByPhone[phone] = Date.now()
}

export async function sendLoginSmsCode(req) {
  const { config, phone } = await prepareSmsSend(req)
  const existing = await findUserByPhone(phone)
  if (!existing) {
    const err = new Error('该手机号未注册')
    err.status = 404
    throw err
  }
  if (existing.status === 'banned') {
    const err = new Error('账号已被封禁')
    err.status = 403
    throw err
  }
  await assertSmsSendGate(req, phone)
  await sendAliyunSmsVerifyCode(phone, config)
  lastSentByPhone[phone] = Date.now()
}

export async function verifyRegisterSmsCode(phone, code) {
  const config = loadConfig()
  if (!isSmsVerificationEnabled(config)) {
    return { ok: false, message: '短信验证未开启' }
  }
  return checkAliyunSmsVerifyCode(phone, code, config)
}

export async function verifyLoginSmsCode(phone, code) {
  return verifyRegisterSmsCode(phone, code)
}
