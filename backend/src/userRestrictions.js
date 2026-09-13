import { loadConfig, saveConfig } from './config.js'

export const USER_RESTRICTION_KEYS = [
  'addFriend',
  'createGroup',
  'voiceCall',
  'videoCall',
  'postMoment',
  'chatMute'
]

const RESTRICTION_MESSAGES = {
  addFriend: '您的账号已被禁止添加好友',
  createGroup: '您的账号已被禁止创建群聊',
  voiceCall: '您的账号已被禁止语音通话',
  videoCall: '您的账号已被禁止视频通话',
  postMoment: '您的账号已被禁止发布说说',
  chatMute: '您的账号已被禁言，暂时无法发言'
}

const BOOL_KEYS = ['addFriend', 'createGroup', 'voiceCall', 'videoCall']

function emptyRestrictions() {
  return {
    addFriend: false,
    createGroup: false,
    voiceCall: false,
    videoCall: false,
    postMoment: false,
    postMomentUntil: null,
    postMomentPermanent: false,
    chatMute: false,
    chatMuteUntil: null,
    chatMutePermanent: false
  }
}

function legacyGroupCreationBanned(userId, cfg = loadConfig()) {
  const list = Array.isArray(cfg.groupCreationBannedUserIds) ? cfg.groupCreationBannedUserIds : []
  return list.map(String).includes(String(userId))
}

function parseUntilMs(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const ms = Date.parse(String(raw))
  return Number.isFinite(ms) ? ms : null
}

export function formatUntilLabel(untilIso) {
  const ms = parseUntilMs(untilIso)
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resolveTimedFlag(rawEnabled, untilRaw) {
  const untilMs = parseUntilMs(untilRaw)
  let enabled = !!rawEnabled
  let until = null
  let permanent = false
  if (enabled) {
    if (untilMs == null) {
      permanent = true
      until = null
    } else if (untilMs <= Date.now()) {
      enabled = false
    } else {
      until = new Date(untilMs).toISOString()
    }
  }
  return { enabled, until, permanent }
}

export function getUserRestrictions(userId, cfg = loadConfig()) {
  const id = String(userId)
  const map = cfg.userRestrictions && typeof cfg.userRestrictions === 'object' ? cfg.userRestrictions : {}
  const raw = map[id] && typeof map[id] === 'object' ? map[id] : {}

  const post = resolveTimedFlag(raw.postMoment, raw.postMomentUntil)
  const mute = resolveTimedFlag(raw.chatMute, raw.chatMuteUntil)

  return {
    addFriend: !!raw.addFriend,
    createGroup: !!raw.createGroup || legacyGroupCreationBanned(id, cfg),
    voiceCall: !!raw.voiceCall,
    videoCall: !!raw.videoCall,
    postMoment: post.enabled,
    postMomentUntil: post.until,
    postMomentPermanent: post.permanent,
    chatMute: mute.enabled,
    chatMuteUntil: mute.until,
    chatMutePermanent: mute.permanent
  }
}

function applyTimedPatch(next, prefix, patch) {
  const flagKey = prefix
  const untilKey = `${prefix}Until`
  const permanentKey = `${prefix}Permanent`

  // 明确关闭时，忽略仍带上的到期时间，避免「关掉开关却解不了」
  if (patch[flagKey] === false) {
    next[flagKey] = false
    next[untilKey] = null
    next[permanentKey] = false
    return
  }

  if (patch[flagKey] !== undefined) next[flagKey] = !!patch[flagKey]

  if (patch[untilKey] !== undefined) {
    if (patch[untilKey] === null || patch[untilKey] === '') {
      next[untilKey] = null
      if (next[flagKey]) next[permanentKey] = true
    } else {
      const ms = parseUntilMs(patch[untilKey])
      if (!ms || ms <= Date.now()) {
        next[flagKey] = false
        next[untilKey] = null
        next[permanentKey] = false
      } else {
        next[flagKey] = true
        next[untilKey] = new Date(ms).toISOString()
        next[permanentKey] = false
      }
    }
  }

  if (patch[permanentKey] === true) {
    next[flagKey] = true
    next[untilKey] = null
    next[permanentKey] = true
  }

  if (!next[flagKey]) {
    next[untilKey] = null
    next[permanentKey] = false
  }
}

export function setUserRestrictions(userId, patch = {}) {
  const id = String(userId)
  if (!id || id === '0') throw new Error('无效的用户 ID')

  const cfg = loadConfig()
  const map =
    cfg.userRestrictions && typeof cfg.userRestrictions === 'object'
      ? { ...cfg.userRestrictions }
      : {}
  const current = getUserRestrictions(id, cfg)
  const next = { ...emptyRestrictions(), ...current }

  for (const key of BOOL_KEYS) {
    if (patch[key] !== undefined) next[key] = !!patch[key]
  }

  applyTimedPatch(next, 'postMoment', patch)
  applyTimedPatch(next, 'chatMute', patch)

  const stored = {}
  for (const key of BOOL_KEYS) {
    if (next[key]) stored[key] = true
  }
  if (next.postMoment) {
    stored.postMoment = true
    if (next.postMomentUntil) stored.postMomentUntil = next.postMomentUntil
  }
  if (next.chatMute) {
    stored.chatMute = true
    if (next.chatMuteUntil) stored.chatMuteUntil = next.chatMuteUntil
  }

  if (Object.keys(stored).length) map[id] = stored
  else delete map[id]

  let groupCreationBannedUserIds = Array.isArray(cfg.groupCreationBannedUserIds)
    ? cfg.groupCreationBannedUserIds.map(String)
    : []
  if (next.createGroup) {
    if (!groupCreationBannedUserIds.includes(id)) groupCreationBannedUserIds.push(id)
  } else {
    groupCreationBannedUserIds = groupCreationBannedUserIds.filter((x) => x !== id)
  }

  saveConfig({ userRestrictions: map, groupCreationBannedUserIds })
  return { userId: Number(id), restrictions: getUserRestrictions(id) }
}

/** banDays > 0 限时；banDays < 0 永久；banDays === 0 解除 */
export function setPostMomentBan(userId, banDays) {
  const days = Number(banDays)
  if (!Number.isFinite(days)) throw new Error('无效的禁发天数')
  if (days === 0) {
    return setUserRestrictions(userId, { postMoment: false, postMomentUntil: null })
  }
  if (days < 0) {
    return setUserRestrictions(userId, { postMoment: true, postMomentPermanent: true })
  }
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  return setUserRestrictions(userId, { postMoment: true, postMomentUntil: until })
}

/**
 * 全站禁言：群聊 / 私聊 / 发说说 / 说说评论
 * banDays > 0 限时；banDays < 0 永久；banDays === 0 解除
 */
export function setChatMuteBan(userId, banDays) {
  const days = Number(banDays)
  if (!Number.isFinite(days)) throw new Error('无效的禁言天数')
  if (days === 0) {
    return setUserRestrictions(userId, { chatMute: false, chatMuteUntil: null })
  }
  if (days < 0) {
    return setUserRestrictions(userId, { chatMute: true, chatMutePermanent: true })
  }
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  return setUserRestrictions(userId, { chatMute: true, chatMuteUntil: until })
}

export function removeUserRestrictions(userId) {
  return setUserRestrictions(userId, {
    addFriend: false,
    createGroup: false,
    voiceCall: false,
    videoCall: false,
    postMoment: false,
    postMomentUntil: null,
    chatMute: false,
    chatMuteUntil: null
  })
}

export function assertUserRestrictionAllowed(userId, key) {
  if (!USER_RESTRICTION_KEYS.includes(key)) return
  const restrictions = getUserRestrictions(userId)
  if (!restrictions[key]) return
  let message = RESTRICTION_MESSAGES[key] || '该功能已被限制'
  if (key === 'postMoment') {
    if (restrictions.postMomentPermanent || !restrictions.postMomentUntil) {
      message = '您的账号已被永久禁止发布说说'
    } else {
      message = `您的账号已被限制发布说说，解禁时间：${formatUntilLabel(restrictions.postMomentUntil)}`
    }
  } else if (key === 'chatMute') {
    if (restrictions.chatMutePermanent || !restrictions.chatMuteUntil) {
      message = '您的账号已被永久禁言，无法在群聊、私聊、说说中发言'
    } else {
      message = `您的账号已被禁言，解禁时间：${formatUntilLabel(restrictions.chatMuteUntil)}`
    }
  }
  const err = new Error(message)
  err.status = 403
  throw err
}

export function getVoiceCallRestrictionKey(callType) {
  return String(callType || '').trim().toLowerCase() === 'video' ? 'videoCall' : 'voiceCall'
}

export function getVoiceCallRestrictionMessage(callType) {
  return RESTRICTION_MESSAGES[getVoiceCallRestrictionKey(callType)]
}
