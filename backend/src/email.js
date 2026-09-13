import nodemailer from 'nodemailer'
import { loadConfig, saveConfig } from './config.js'
import { normalizeMailLogoPath, resolveMailLogoUrl } from './emailLogo.js'
import { normalizeEmailTemplateId, renderVerificationEmailHtml } from './emailTemplates.js'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export { normalizeEmail }

export function isValidEmail(value) {
  const s = normalizeEmail(value)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120
}

export function getSmtpSettings(config = loadConfig()) {
  const host = String(config.smtpHost || '').trim()
  const port = parseInt(String(config.smtpPort != null ? config.smtpPort : 465), 10)
  const user = String(config.smtpUser || '').trim()
  const pass = String(config.smtpPassword || '').trim()
  const from = String(config.smtpFrom || user || '').trim()
  const fromName = String(config.smtpFromName || '').trim()
  const subjectTpl = String(config.smtpMailTitle || '注册验证码').trim() || '注册验证码'
  const bodyTpl =
    String(config.smtpMailBody || '您的注册验证码是：{{code}}，{{min}}分钟内有效。').trim() ||
    '验证码：{{code}}'
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    pass,
    from,
    fromName,
    subjectTpl,
    bodyTpl,
    mailLogo: normalizeMailLogoPath(config.smtpMailLogo)
  }
}

export function isSmtpReady(config = loadConfig()) {
  const s = getSmtpSettings(config)
  return !!(s.user && s.pass && s.from)
}

export function mergeSmtpSettingsFromBody(body, config = loadConfig()) {
  const s = getSmtpSettings(config)
  const b = body && typeof body === 'object' ? body : {}
  if (String(b.smtpHost || '').trim()) s.host = String(b.smtpHost).trim()
  if (b.smtpPort != null && String(b.smtpPort).trim() !== '') {
    const p = parseInt(String(b.smtpPort), 10)
    if (Number.isFinite(p) && p > 0) s.port = p
  }
  if (String(b.smtpUser || '').trim()) s.user = String(b.smtpUser).trim()
  if (String(b.smtpPassword || '').trim()) s.pass = String(b.smtpPassword).trim()
  if (String(b.smtpFrom || '').trim()) s.from = String(b.smtpFrom).trim()
  if (b.smtpFromName !== undefined) s.fromName = String(b.smtpFromName || '').trim()
  if (String(b.smtpMailTitle || '').trim()) s.subjectTpl = String(b.smtpMailTitle).trim()
  if (String(b.smtpMailBody || '').trim()) s.bodyTpl = String(b.smtpMailBody).trim()
  if (b.smtpMailLogo !== undefined) s.mailLogo = normalizeMailLogoPath(b.smtpMailLogo)
  return s
}

export function getEmailSmtpConfigPublic(config = loadConfig()) {
  return {
    smtpHost: String(config.smtpHost || '').trim(),
    smtpPort: parseInt(String(config.smtpPort != null ? config.smtpPort : 465), 10) || 465,
    smtpUser: String(config.smtpUser || '').trim(),
    hasSmtpPassword: !!(config.smtpPassword && String(config.smtpPassword).trim()),
    smtpFrom: String(config.smtpFrom || '').trim(),
    smtpFromName: String(config.smtpFromName || '').trim(),
    smtpMailTitle: String(config.smtpMailTitle || '注册验证码').trim() || '注册验证码',
    smtpMailBody:
      String(config.smtpMailBody || '您的注册验证码是：{{code}}，{{min}}分钟内有效。').trim(),
    smtpMailTemplate: normalizeEmailTemplateId(config.smtpMailTemplate),
    smtpMailLogo: normalizeMailLogoPath(config.smtpMailLogo),
    publicSiteUrl: String(config.publicSiteUrl || '').trim(),
    emailVerificationEnabled: config.emailVerificationEnabled === true,
    isConfigured: isSmtpReady(config)
  }
}

export function saveEmailSmtpConfig(body = {}) {
  const current = loadConfig()
  const next = { ...current }
  const b = body || {}
  if (b.smtpHost !== undefined) next.smtpHost = String(b.smtpHost || '').trim()
  if (b.smtpPort !== undefined) {
    const p = parseInt(String(b.smtpPort), 10)
    next.smtpPort = Number.isFinite(p) && p > 0 ? p : 465
  }
  if (b.smtpUser !== undefined) next.smtpUser = String(b.smtpUser || '').trim()
  if (b.smtpPassword !== undefined && String(b.smtpPassword).trim() !== '') {
    next.smtpPassword = String(b.smtpPassword).trim()
  }
  if (b.smtpFrom !== undefined) next.smtpFrom = String(b.smtpFrom || '').trim()
  if (b.smtpFromName !== undefined) next.smtpFromName = String(b.smtpFromName || '').trim()
  if (b.smtpMailTitle !== undefined) {
    next.smtpMailTitle = String(b.smtpMailTitle || '').trim() || '注册验证码'
  }
  if (b.smtpMailBody !== undefined) next.smtpMailBody = String(b.smtpMailBody || '').trim()
  if (b.smtpMailTemplate !== undefined) {
    next.smtpMailTemplate = normalizeEmailTemplateId(b.smtpMailTemplate)
  }
  if (b.smtpMailLogo !== undefined) {
    next.smtpMailLogo = normalizeMailLogoPath(b.smtpMailLogo).slice(0, 256)
  }
  if (b.publicSiteUrl !== undefined) {
    next.publicSiteUrl = String(b.publicSiteUrl || '').trim().slice(0, 256)
  }
  if (b.emailVerificationEnabled !== undefined) {
    next.emailVerificationEnabled = b.emailVerificationEnabled === true
  }
  saveConfig(next)
  return getEmailSmtpConfigPublic(next)
}

export async function sendMailWithSmtpSettings(toAddr, code, validMin, settings, templateId, config = loadConfig()) {
  const s = settings
  if (!(s.user && s.pass && s.from)) {
    throw new Error('SMTP 配置不完整：需要发件账号、授权码与发件邮箱')
  }
  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass }
  })
  const subj = s.subjectTpl.replace(/\{\{code\}\}/g, code).replace(/\{\{min\}\}/g, String(validMin))
  const text = s.bodyTpl.replace(/\{\{code\}\}/g, code).replace(/\{\{min\}\}/g, String(validMin))
  const html = renderVerificationEmailHtml(templateId, {
    code,
    validMin,
    brand: s.fromName || 'XhaMil Chat',
    logo: s.mailLogo || '',
    logoUrl: resolveMailLogoUrl(s.mailLogo, {
      publicSiteUrl: String(config.publicSiteUrl || '').trim()
    })
  })
  const fromHeader = s.fromName ? `"${s.fromName.replace(/"/g, '')}" <${s.from}>` : s.from
  await transporter.sendMail({
    from: fromHeader,
    to: toAddr,
    subject: subj,
    text,
    html
  })
}

export async function sendVerificationEmail(toAddr, code, validMin = 5, config = loadConfig()) {
  const tpl = normalizeEmailTemplateId(config.smtpMailTemplate)
  return sendMailWithSmtpSettings(toAddr, code, validMin, getSmtpSettings(config), tpl, config)
}

export async function testEmailSmtpSend(body = {}) {
  const to = normalizeEmail(body.to)
  if (!isValidEmail(to)) {
    throw new Error('收件邮箱格式不正确')
  }
  const s = mergeSmtpSettingsFromBody(body)
  if (!(s.user && s.pass && s.from)) {
    throw new Error('请填写发件账号、发件邮箱与 SMTP 授权码')
  }
  const tpl = normalizeEmailTemplateId(body.smtpMailTemplate)
  const baseConfig = loadConfig()
  const sendConfig = {
    ...baseConfig,
    ...(body.publicSiteUrl !== undefined ? { publicSiteUrl: body.publicSiteUrl } : {})
  }
  await sendMailWithSmtpSettings(to, '000000', 5, s, tpl, sendConfig)
}
