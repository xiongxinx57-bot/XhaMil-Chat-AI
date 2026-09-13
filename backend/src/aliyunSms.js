import crypto from 'crypto'
import { loadConfig, saveConfig } from './config.js'

const ENDPOINT = 'https://dypnsapi.aliyuncs.com/'
const API_VERSION = '2017-05-25'

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

function isoTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function buildSignedParams(action, businessParams, config) {
  const accessKeyId = String(config.aliyunSmsAccessKeyId || '').trim()
  const accessKeySecret = String(config.aliyunSmsAccessKeySecret || '').trim()
  if (!accessKeyId || !accessKeySecret) {
    const err = new Error('短信服务未配置 AccessKey')
    err.status = 500
    throw err
  }
  const params = {
    Format: 'JSON',
    Version: API_VERSION,
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: isoTimestamp(),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Action: action,
    ...businessParams
  }
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonical)}`
  const signature = crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
  params.Signature = signature
  return params
}

async function callDypns(action, businessParams, config = loadConfig()) {
  const params = buildSignedParams(action, businessParams, config)
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) body.append(k, String(v))
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const text = await resp.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const err = new Error('短信服务响应异常')
    err.status = 502
    throw err
  }
  return data
}

export function isAliyunSmsConfigured(config = loadConfig()) {
  return !!(
    String(config.aliyunSmsAccessKeyId || '').trim() &&
    String(config.aliyunSmsAccessKeySecret || '').trim() &&
    String(config.aliyunSmsSignName || '').trim() &&
    String(config.aliyunSmsTemplateCode || '').trim()
  )
}

export function isSmsVerificationEnabled(config = loadConfig()) {
  return config.smsVerificationEnabled === true && isAliyunSmsConfigured(config)
}

/** 管理后台可读的短信配置（密钥脱敏） */
export function getAliyunSmsConfigPublic(config = loadConfig()) {
  return {
    smsVerificationEnabled: config.smsVerificationEnabled === true,
    /** 对 App 实际生效（开关开且阿里云已配齐） */
    smsEffective: isSmsVerificationEnabled(config),
    aliyunSmsAccessKeyId: String(config.aliyunSmsAccessKeyId || '').trim(),
    hasAccessKeySecret: !!(
      config.aliyunSmsAccessKeySecret && String(config.aliyunSmsAccessKeySecret).trim()
    ),
    aliyunSmsSignName: String(config.aliyunSmsSignName || '').trim(),
    aliyunSmsTemplateCode: String(config.aliyunSmsTemplateCode || '').trim(),
    aliyunSmsCodeValidMin: Math.max(1, Number(config.aliyunSmsCodeValidMin) || 5),
    aliyunSmsCodeLength: Math.max(4, Math.min(8, Number(config.aliyunSmsCodeLength) || 6)),
    isConfigured: isAliyunSmsConfigured(config)
  }
}

/** 管理后台保存阿里云短信 + 开关 */
export function saveAliyunSmsConfig(body = {}) {
  const current = loadConfig()
  const next = { ...current }
  const b = body || {}

  if (b.aliyunSmsAccessKeyId !== undefined) {
    next.aliyunSmsAccessKeyId = String(b.aliyunSmsAccessKeyId || '').trim()
  }
  if (b.aliyunSmsAccessKeySecret !== undefined && String(b.aliyunSmsAccessKeySecret).trim() !== '') {
    next.aliyunSmsAccessKeySecret = String(b.aliyunSmsAccessKeySecret).trim()
  }
  if (b.aliyunSmsSignName !== undefined) {
    next.aliyunSmsSignName = String(b.aliyunSmsSignName || '').trim()
  }
  if (b.aliyunSmsTemplateCode !== undefined) {
    next.aliyunSmsTemplateCode = String(b.aliyunSmsTemplateCode || '').trim()
  }
  if (b.aliyunSmsCodeValidMin !== undefined) {
    const m = parseInt(String(b.aliyunSmsCodeValidMin), 10)
    next.aliyunSmsCodeValidMin = Number.isFinite(m) && m > 0 ? Math.min(30, m) : 5
  }
  if (b.aliyunSmsCodeLength !== undefined) {
    const len = parseInt(String(b.aliyunSmsCodeLength), 10)
    next.aliyunSmsCodeLength =
      Number.isFinite(len) && len >= 4 && len <= 8 ? len : 6
  }
  if (b.smsVerificationEnabled !== undefined) {
    if (b.smsVerificationEnabled === true && !isAliyunSmsConfigured(next)) {
      const err = new Error('请先配齐 AccessKey、签名与模板后再开放短信入口')
      err.status = 400
      throw err
    }
    next.smsVerificationEnabled = b.smsVerificationEnabled === true
  }

  saveConfig(next)
  return getAliyunSmsConfigPublic(next)
}

/** 中国大陆手机号 */
export function normalizePhone(input) {
  let s = String(input || '').trim().replace(/[\s-]/g, '')
  if (s.startsWith('+86')) s = s.slice(3)
  if (s.startsWith('86') && s.length === 13) s = s.slice(2)
  return s
}

export function isValidCnPhone(phone) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(phone))
}

/**
 * 发送注册短信验证码（阿里云号码认证 SendSmsVerifyCode）
 * 使用 ##code## 由阿里云生成，后续用 CheckSmsVerifyCode 核验
 */
export async function sendAliyunSmsVerifyCode(phone, config = loadConfig()) {
  const phoneNumber = normalizePhone(phone)
  if (!isValidCnPhone(phoneNumber)) {
    const err = new Error('请输入有效手机号')
    err.status = 400
    throw err
  }
  if (!isAliyunSmsConfigured(config)) {
    const err = new Error('短信服务未配置完整')
    err.status = 500
    throw err
  }
  const validMin = Math.max(1, Number(config.aliyunSmsCodeValidMin) || 5)
  const data = await callDypns(
    'SendSmsVerifyCode',
    {
      PhoneNumber: phoneNumber,
      SignName: String(config.aliyunSmsSignName).trim(),
      TemplateCode: String(config.aliyunSmsTemplateCode).trim(),
      TemplateParam: JSON.stringify({ code: '##code##', min: String(validMin) }),
      CodeLength: String(Math.max(4, Math.min(8, Number(config.aliyunSmsCodeLength) || 6))),
      ValidTime: String(validMin * 60),
      Interval: '60',
      CodeType: '1',
      DuplicatePolicy: '1',
      CountryCode: '86'
    },
    config
  )
  if (String(data.Code || '').toUpperCase() !== 'OK') {
    console.error('[aliyun-sms] SendSmsVerifyCode failed:', data.Code, data.Message)
    const err = new Error(data.Message || '短信发送失败')
    err.status = 400
    throw err
  }
  return { phone: phoneNumber }
}

/** 核验短信验证码 */
export async function checkAliyunSmsVerifyCode(phone, code, config = loadConfig()) {
  const phoneNumber = normalizePhone(phone)
  const verifyCode = String(code || '').trim()
  if (!isValidCnPhone(phoneNumber)) {
    return { ok: false, message: '请输入有效手机号' }
  }
  if (!/^\d{4,8}$/.test(verifyCode)) {
    return { ok: false, message: '请输入短信验证码' }
  }
  if (!isAliyunSmsConfigured(config)) {
    return { ok: false, message: '短信服务未配置完整' }
  }
  try {
    const data = await callDypns(
      'CheckSmsVerifyCode',
      {
        PhoneNumber: phoneNumber,
        VerifyCode: verifyCode,
        CountryCode: '86'
      },
      config
    )
    if (String(data.Code || '').toUpperCase() !== 'OK') {
      return { ok: false, message: data.Message || '验证码校验失败' }
    }
    const result = String(data.Model?.VerifyResult || data.Model?.verifyResult || '').toUpperCase()
    if (result !== 'PASS') {
      return { ok: false, message: '验证码错误或已过期' }
    }
    return { ok: true, phone: phoneNumber }
  } catch (e) {
    console.error('[aliyun-sms] CheckSmsVerifyCode error:', e.message)
    return { ok: false, message: e.message || '验证码校验失败' }
  }
}
