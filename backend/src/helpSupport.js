import { loadConfig, saveConfig } from './config.js'

export const DEFAULT_HELP_TITLE = '帮助与客服'
export const DEFAULT_HELP_CONTENT = '如有问题请联系客服。'

function normalizeText(value, fallback, maxLen, label) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (text.length > maxLen) throw new Error(`${label}不能超过 ${maxLen} 个字符`)
  return text
}

function normalizeContact(value) {
  const text = String(value ?? '').trim()
  if (text.length > 32) throw new Error('联系方式不能超过 32 个字符')
  return text
}

function normalizeOptionalText(value, maxLen, label) {
  const text = String(value ?? '').trim()
  if (text.length > maxLen) throw new Error(`${label}不能超过 ${maxLen} 个字符`)
  return text
}

export function getHelpSupportConfig(config = loadConfig()) {
  const rawContent = config.helpSupportContent
  const content =
    rawContent === undefined || rawContent === null
      ? DEFAULT_HELP_CONTENT
      : normalizeOptionalText(rawContent, 300, '弹窗说明')

  return {
    title: normalizeText(config.helpSupportTitle, DEFAULT_HELP_TITLE, 64, '弹窗标题'),
    content,
    qq: normalizeContact(config.helpSupportQq),
    wechat: normalizeContact(config.helpSupportWechat)
  }
}

export function getHelpSupportPublic(config = loadConfig()) {
  return getHelpSupportConfig(config)
}

export function saveHelpSupportConfig(body = {}) {
  const current = getHelpSupportConfig()
  const title =
    body.title !== undefined
      ? normalizeText(body.title, DEFAULT_HELP_TITLE, 64, '弹窗标题')
      : current.title
  const content =
    body.content !== undefined
      ? normalizeOptionalText(body.content, 300, '弹窗说明')
      : current.content
  const qq = body.qq !== undefined ? normalizeContact(body.qq) : current.qq
  const wechat = body.wechat !== undefined ? normalizeContact(body.wechat) : current.wechat

  saveConfig({
    helpSupportTitle: title,
    helpSupportContent: content,
    helpSupportQq: qq,
    helpSupportWechat: wechat
  })
  return getHelpSupportConfig()
}
