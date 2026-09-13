import { loadConfig, saveConfig } from './config.js'
import { directJoinGroupByCode, findGroupByCodeForGate, isGroupMember } from './db.js'
import { adminNumericFormatError, isAdminNumericCode } from './idCodes.js'

export const DEFAULT_GATE_TITLE = '欢迎加入聊天室'
export const DEFAULT_GATE_CONTENT =
  '本功能适用于开发者交流或校园聊天室场景。确认后将直接进入指定群聊，无需额外申请。'
export const DEFAULT_GATE_CONFIRM = '进入'
export const DEFAULT_GATE_CANCEL = '退出'

function normalizeText(value, fallback, maxLen, label) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (text.length > maxLen) throw new Error(`${label}不能超过 ${maxLen} 个字符`)
  return text
}

function normalizeGroupCode(value) {
  return String(value ?? '').trim()
}

export function getGateGroupConfig(config = loadConfig()) {
  return {
    enabled: !!config.gateGroupEnabled,
    groupCode: normalizeGroupCode(config.gateGroupCode),
    title: normalizeText(config.gateGroupTitle, DEFAULT_GATE_TITLE, 64, '弹窗标题'),
    content: normalizeText(config.gateGroupContent, DEFAULT_GATE_CONTENT, 500, '弹窗内容'),
    confirmText: normalizeText(config.gateGroupConfirmText, DEFAULT_GATE_CONFIRM, 16, '确认按钮'),
    cancelText: normalizeText(config.gateGroupCancelText, DEFAULT_GATE_CANCEL, 16, '取消按钮')
  }
}

export function getGateGroupAdminConfig(config = loadConfig()) {
  return getGateGroupConfig(config)
}

export async function saveGateGroupConfig(body = {}) {
  const current = getGateGroupConfig()
  const enabled = body.enabled !== undefined ? !!body.enabled : current.enabled
  const groupCode =
    body.groupCode !== undefined ? normalizeGroupCode(body.groupCode) : current.groupCode
  const title =
    body.title !== undefined
      ? normalizeText(body.title, DEFAULT_GATE_TITLE, 64, '弹窗标题')
      : current.title
  const content =
    body.content !== undefined
      ? normalizeText(body.content, DEFAULT_GATE_CONTENT, 500, '弹窗内容')
      : current.content
  const confirmText =
    body.confirmText !== undefined
      ? normalizeText(body.confirmText, DEFAULT_GATE_CONFIRM, 16, '确认按钮')
      : current.confirmText
  const cancelText =
    body.cancelText !== undefined
      ? normalizeText(body.cancelText, DEFAULT_GATE_CANCEL, 16, '取消按钮')
      : current.cancelText

  if (enabled) {
    if (!groupCode) throw new Error('启用入群门禁时请填写群号')
    if (!isAdminNumericCode(groupCode)) throw new Error(adminNumericFormatError('群号'))
    const group = await findGroupByCodeForGate(groupCode)
    if (!group) throw new Error('群号不存在，请检查后重试')
    if (group.banned) throw new Error('该群聊已被封禁，无法作为门禁群')
  }

  saveConfig({
    gateGroupEnabled: enabled,
    gateGroupCode: groupCode,
    gateGroupTitle: title,
    gateGroupContent: content,
    gateGroupConfirmText: confirmText,
    gateGroupCancelText: cancelText
  })
  return getGateGroupConfig()
}

export async function getGateGroupStatus(userId) {
  const cfg = getGateGroupConfig()
  const base = {
    enabled: cfg.enabled,
    required: false,
    isMember: true,
    title: cfg.title,
    content: cfg.content,
    confirmText: cfg.confirmText,
    cancelText: cfg.cancelText
  }
  if (!cfg.enabled || !cfg.groupCode) return base

  const group = await findGroupByCodeForGate(cfg.groupCode)
  if (!group) {
    return { ...base, misconfigured: true }
  }

  const isMember = await isGroupMember(group.id, userId)
  return {
    ...base,
    required: !isMember,
    isMember,
    groupTitle: group.title || '群聊'
  }
}

export async function enterGateGroup(userId) {
  const cfg = getGateGroupConfig()
  if (!cfg.enabled || !cfg.groupCode) throw new Error('入群门禁未启用')
  return directJoinGroupByCode(userId, cfg.groupCode)
}
