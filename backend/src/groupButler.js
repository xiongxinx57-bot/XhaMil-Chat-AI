import { DEFAULT_GROUP_AVATAR_URL } from './config.js'

export const BUTLER_NAME = '群管家'
export const BUTLER_AVATAR_URL = DEFAULT_GROUP_AVATAR_URL
export const DEFAULT_BUTLER_WELCOME = '欢迎进入群聊'
export const DEFAULT_BUTLER_LEAVE = '远走高飞了'

export function formatButlerWelcome(template, nickname) {
  const name = String(nickname || '新成员').trim() || '新成员'
  const tpl = String(template || DEFAULT_BUTLER_WELCOME).trim() || DEFAULT_BUTLER_WELCOME
  if (/\{昵称\}|\{nickname\}/i.test(tpl)) {
    return tpl.replace(/\{昵称\}/g, name).replace(/\{nickname\}/gi, name)
  }
  return `${name} ${tpl}`.trim()
}

export function formatButlerLeaveNotice(nickname, template) {
  const name = String(nickname || '某成员').trim() || '某成员'
  const tpl = String(template || DEFAULT_BUTLER_LEAVE).trim() || DEFAULT_BUTLER_LEAVE
  if (/\{昵称\}|\{nickname\}/i.test(tpl)) {
    return tpl.replace(/\{昵称\}/g, name).replace(/\{nickname\}/gi, name)
  }
  return `${name} ${tpl}`.trim()
}

export function formatMuteDurationLabel(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 0))
  if (m < 60) return `${m}分钟`
  if (m < 60 * 24) {
    const hours = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${hours}小时${rest}分钟` : `${hours}小时`
  }
  const days = Math.floor(m / (60 * 24))
  const restHours = Math.floor((m % (60 * 24)) / 60)
  return restHours ? `${days}天${restHours}小时` : `${days}天`
}

export function formatButlerMemberMuteNotice(nickname, durationLabel) {
  const name = String(nickname || '某成员').trim() || '某成员'
  const duration = String(durationLabel || '').trim() || '一段时间'
  return `${name}被群主禁言${duration}`
}

export function formatButlerMemberUnmuteNotice(nickname) {
  const name = String(nickname || '某成员').trim() || '某成员'
  return `${name}被群主解除禁言`
}

export function formatButlerMemberSetAdminNotice(nickname) {
  const name = String(nickname || '某成员').trim() || '某成员'
  return `${name}被群主设置为管理员`
}

export function formatButlerMemberRemoveAdminNotice(nickname) {
  const name = String(nickname || '某成员').trim() || '某成员'
  return `${name}被群主取消管理员`
}

export function formatButlerAtMention(nickname) {
  const name = String(nickname || '某成员').trim() || '某成员'
  return `@${name}`
}

export function formatButlerBannedWordWarning(nickname) {
  return `${formatButlerAtMention(nickname)} 请勿输入涉及政治、领导人、色情、谣言等违禁词汇，违规将封禁账号`
}

export function formatButlerBannedWordSystemMuteNotice(nickname, minutes = 10) {
  const duration = formatMuteDurationLabel(minutes)
  return `${formatButlerAtMention(nickname)} 你已被系统禁言${duration}`
}

export function formatButlerAiAssignedNotice(botName) {
  const name = String(botName || 'AI').trim() || 'AI'
  return `此群已被分配 AI「${name}」`
}

export function mapButlerMessageRow(row, viewerUserId) {
  const messageType = 'butler'
  const imageUrl = row.image_url || row.imageUrl || ''
  return {
    id: row.id,
    conversationId: row.conversationId ?? row.conversation_id,
    userId: null,
    content: row.content || '',
    messageType,
    type: messageType,
    imageUrl,
    photoUrl: imageUrl,
    voiceUrl: '',
    voiceDuration: 0,
    isSelf: false,
    createdAt: row.createdAt ?? row.created_at,
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    deleted: !!(row.deletedAt ?? row.deleted_at),
    username: BUTLER_NAME,
    nickname: BUTLER_NAME,
    avatarUrl: BUTLER_AVATAR_URL
  }
}
