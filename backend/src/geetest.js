import crypto from 'crypto'
import { loadConfig, saveConfig } from './config.js'
import { isSmtpReady } from './email.js'
import { isAliyunSmsConfigured, isSmsVerificationEnabled } from './aliyunSms.js'

const GEETEST_VALIDATE_HOST = 'http://gcaptcha4.geetest.com'

export function hasGeetestSecrets(config = loadConfig()) {
  return !!(
    String(config.geetestCaptchaId || '').trim() &&
    String(config.geetestCaptchaKey || '').trim()
  )
}

/** 前台发码/注册等是否应弹出极验 */
export function resolveGeetestEnabled(config = loadConfig()) {
  if (!hasGeetestSecrets(config)) return false
  if (config.geetestEnabled === true) return true
  // 邮箱/短信验证已开且极验已配全时，发码默认走极验
  if (config.emailVerificationEnabled === true) return true
  if (isSmsVerificationEnabled(config)) return true
  return false
}

export function getPublicVerificationFlags(config = loadConfig()) {
  const configured = hasGeetestSecrets(config)
  const smsOn = isSmsVerificationEnabled(config)
  const emailOn = config.emailVerificationEnabled === true
  return {
    geetestEnabled: resolveGeetestEnabled(config),
    geetestConfigured: configured,
    geetestCaptchaId: String(config.geetestCaptchaId || '').trim(),
    emailVerificationEnabled: emailOn,
    smsVerificationEnabled: smsOn,
    /** 注册页默认通道：有短信则优先短信 */
    defaultRegisterMode: smsOn ? 'sms' : emailOn ? 'email' : 'sms',
    smtpConfigured: isSmtpReady(config),
    smsConfigured: isAliyunSmsConfigured(config)
  }
}

export function getGeetestConfigPublic(config = loadConfig()) {
  return {
    captchaId: String(config.geetestCaptchaId || '').trim(),
    hasCaptchaKey: !!(config.geetestCaptchaKey && String(config.geetestCaptchaKey).trim()),
    geetestEnabled: config.geetestEnabled === true,
    isConfigured: hasGeetestSecrets(config)
  }
}

export function saveGeetestConfig(body = {}) {
  const current = loadConfig()
  const next = { ...current }
  const b = body || {}

  if (b.captchaId !== undefined) {
    const id = String(b.captchaId || '').trim()
    if (!id) throw new Error('请输入验证 ID')
    if (id.includes('@')) {
      throw new Error('验证 ID 格式不正确：请填写极验控制台的 CAPTCHA_ID，不是邮箱地址')
    }
    next.geetestCaptchaId = id
  }
  if (b.captchaKey !== undefined && String(b.captchaKey).trim() !== '') {
    next.geetestCaptchaKey = String(b.captchaKey).trim()
  }
  if (b.geetestEnabled !== undefined) {
    if (b.geetestEnabled === true && !hasGeetestSecrets(next)) {
      throw new Error('未完成极验配置，不能开启行为验证')
    }
    next.geetestEnabled = b.geetestEnabled === true
  } else if (hasGeetestSecrets(next)) {
    next.geetestEnabled = true
  }

  saveConfig(next)
  return getGeetestConfigPublic(next)
}

export function saveVerificationFlags(body = {}) {
  const current = loadConfig()
  const next = { ...current }
  const b = body || {}

  if (b.geetestEnabled !== undefined) {
    if (b.geetestEnabled === true && !hasGeetestSecrets(next)) {
      throw new Error('未完成极验配置，不能开启行为验证')
    }
    next.geetestEnabled = b.geetestEnabled === true
  }
  if (b.emailVerificationEnabled !== undefined) {
    next.emailVerificationEnabled = b.emailVerificationEnabled === true
  }
  if (b.smsVerificationEnabled !== undefined) {
    if (b.smsVerificationEnabled === true && !isAliyunSmsConfigured(next)) {
      throw new Error('请先配齐阿里云短信后再开放短信注册入口')
    }
    next.smsVerificationEnabled = b.smsVerificationEnabled === true
  }

  saveConfig(next)
  return getPublicVerificationFlags(next)
}

/**
 * 极验 4.0 服务端二次校验（登录、发码、注册复用）
 * 开启极验时严格校验，不再异常放行
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function verifyGeetestFromRequestBody(body) {
  const { lot_number, captcha_output, pass_token, gen_time } = body || {}
  if (!lot_number || !captcha_output || !pass_token || gen_time == null) {
    return { ok: false, message: '请完成行为验证' }
  }

  const cfg = loadConfig()
  const captchaId = String(cfg.geetestCaptchaId || '').trim()
  const captchaKey = String(cfg.geetestCaptchaKey || '').trim()
  if (!captchaId || !captchaKey) {
    console.error('[geetest] 已要求人机验证但未配置 CAPTCHA_ID/KEY')
    return { ok: false, message: '极验未配置完整，请联系管理员' }
  }

  try {
    const signToken = crypto
      .createHmac('sha256', captchaKey)
      .update(String(lot_number), 'utf8')
      .digest('hex')
    const params = new URLSearchParams({
      lot_number: String(lot_number),
      captcha_output: String(captcha_output),
      pass_token: String(pass_token),
      gen_time: String(gen_time),
      sign_token: signToken
    })
    const verifyUrl = `${GEETEST_VALIDATE_HOST}/validate?captcha_id=${encodeURIComponent(captchaId)}&${params}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let response
    try {
      response = await fetch(verifyUrl, { method: 'POST', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (response.status !== 200) {
      console.error('[geetest] 校验 HTTP 异常:', response.status)
      return { ok: false, message: '行为验证服务异常，请稍后重试' }
    }
    const result = await response.json().catch(() => null)
    if (result && result.result === 'success') {
      return { ok: true }
    }
    const reason = result && result.reason ? `：${result.reason}` : ''
    return { ok: false, message: `行为验证未通过${reason}` }
  } catch (e) {
    console.error('[geetest] 校验异常:', e.message)
    return { ok: false, message: '行为验证失败，请重试' }
  }
}
