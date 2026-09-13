/** 与后端 config.DEFAULT_AVATAR_URL 一致 */
export const DEFAULT_AVATAR_URL = '/media/Official Images/image.png'

/**
 * 把后端返回的 /media/... 头像路径转成可请求 URL（开发态走 Vite 代理）
 */
export function mediaUrl(url?: string | null): string {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  // 对路径分段编码，保留 /
  return path
    .split('/')
    .map((seg, idx) => {
      if (idx === 0) return ''
      try {
        return encodeURIComponent(decodeURIComponent(seg))
      } catch {
        return encodeURIComponent(seg)
      }
    })
    .join('/')
}

/** 用户头像：无图时回落默认头像（不要用文字头像） */
export function avatarSrc(url?: string | null): string {
  return mediaUrl(url) || mediaUrl(DEFAULT_AVATAR_URL)
}

export function isPhoneUser(user: {
  lastClientType?: string | null
  lastDeviceModel?: string | null
  lastDeviceInfo?: unknown
  lastDeviceAt?: string | null
}): boolean {
  return (
    user.lastClientType === 'android' ||
    !!user.lastDeviceModel ||
    !!user.lastDeviceInfo ||
    !!user.lastDeviceAt
  )
}

export type UserRestrictions = {
  addFriend: boolean
  createGroup: boolean
  voiceCall: boolean
  videoCall: boolean
  postMoment?: boolean
  postMomentUntil?: string | null
  postMomentPermanent?: boolean
  chatMute?: boolean
  chatMuteUntil?: string | null
  chatMutePermanent?: boolean
}

export const USER_RESTRICTION_LABELS: Record<
  'addFriend' | 'createGroup' | 'voiceCall' | 'videoCall' | 'postMoment' | 'chatMute',
  string
> = {
  addFriend: '禁止加好友',
  createGroup: '禁止建群',
  voiceCall: '禁止语音通话',
  videoCall: '禁止视频通话',
  postMoment: '禁止发说说',
  chatMute: '全站禁言（聊天/说说/评论）'
}

export function emptyRestrictions(): UserRestrictions {
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

export function hasAnyRestriction(restrictions?: Partial<UserRestrictions> | null) {
  if (!restrictions) return false
  return (
    !!restrictions.addFriend ||
    !!restrictions.createGroup ||
    !!restrictions.voiceCall ||
    !!restrictions.videoCall ||
    !!restrictions.postMoment ||
    !!restrictions.chatMute
  )
}
