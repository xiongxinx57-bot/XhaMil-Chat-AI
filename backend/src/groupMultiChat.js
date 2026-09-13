import { maskBannedWords } from './bannedWords.js'
import { assertChatMessageContent } from './xssGuard.js'
import { canControlPublicRoomMusic } from './db.js'
import { encodeMediaPathUrl, normalizeAvatarUrl } from './config.js'
import { extractNeteaseSongId, resolveNeteaseCoverUrl } from './musicSearch.js'

const MAX_GROUP_MULTI_CHAT = 6
const MAX_MIC_SLOTS = 9
const DEFAULT_VOICE_ROOM_CAPACITY = 20
const MAX_MESSAGES = 120
const SLOT_COUNT = MAX_MIC_SLOTS

function resolveRoomMaxParticipants(room) {
  if (room?.voiceSlotMode) {
    // 无旁听：在房人数不超过麦位数
    const cap = Number(room.maxCapacity)
    const configured = cap > 0 ? cap : DEFAULT_VOICE_ROOM_CAPACITY
    return Math.min(configured, MAX_MIC_SLOTS)
  }
  return MAX_GROUP_MULTI_CHAT
}

function emptySlots() {
  return Array(SLOT_COUNT).fill(null)
}

/** @type {Map<number, object>} */
const rooms = new Map()

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function mapUserInfo(user, { micOn = true, micBanned = false, slotBanned = false, chatBanned = false } = {}) {
  const avatarRaw = normalizeAvatarUrl(user?.avatarUrl || user?.avatar_url || '')
  const banned = !!micBanned
  const slotBlock = !!slotBanned
  return {
    id: Number(user.id),
    username: user.username || '',
    nickname: user.nickname || user.username || '用户',
    avatarUrl: encodeMediaPathUrl(avatarRaw) || avatarRaw,
    micOn: banned || slotBlock ? false : !!micOn,
    micBanned: banned,
    slotBanned: slotBlock,
    chatBanned: !!chatBanned
  }
}

function enrichParticipants(room) {
  const slots = room.slots || emptySlots()
  return [...room.participants.values()].map((p) => {
    const slotIndex = slots.findIndex((id) => Number(id) === Number(p.id))
    return {
      ...p,
      // 已取消禁止上麦
      slotBanned: false,
      slotIndex: slotIndex >= 0 ? slotIndex : null
    }
  })
}

function clearUserSlot(room, userId) {
  if (!room?.slots) return
  const uid = Number(userId)
  const idx = room.slots.findIndex((id) => Number(id) === uid)
  if (idx >= 0) room.slots[idx] = null
}

function addWelcomeMessage(room, user) {
  const info = mapUserInfo(user)
  const displayName = info.nickname || info.username || '用户'
  const msg = {
    userId: 0,
    content: `欢迎${displayName}进入`,
    nickname: '公告',
    username: '公告',
    avatarUrl: '',
    system: true,
    systemType: 'welcome',
    ts: Date.now()
  }
  room.messages.push(msg)
  if (room.messages.length > MAX_MESSAGES) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES)
  }
  return msg
}

function firstFreeSlotIndex(room) {
  if (!room?.slots) return -1
  return room.slots.findIndex((id) => id == null)
}

function seatUser(room, userId, slotIndex, { micOn = true } = {}) {
  const uid = Number(userId)
  const idx = Number(slotIndex)
  if (!room?.slots || !Number.isInteger(idx) || idx < 0 || idx >= SLOT_COUNT) return false
  if (room.slots[idx] != null && Number(room.slots[idx]) !== uid) return false
  clearUserSlot(room, uid)
  room.slots[idx] = uid
  const participant = room.participants.get(uid)
  if (participant) {
    if (participant.micBanned) {
      participant.micOn = false
    } else {
      participant.micOn = !!micOn
    }
  }
  return true
}

function serializeRoom(room) {
  return {
    sessionId: room.sessionId,
    conversationId: room.conversationId,
    ownerId: room.ownerId,
    starterName: room.starterName,
    multiChatBackground: room.multiChatBackground || '',
    multiChatNotice: room.multiChatNotice || '',
    voiceSlotMode: !!room.voiceSlotMode,
    maxCapacity: room.voiceSlotMode ? resolveRoomMaxParticipants(room) : MAX_GROUP_MULTI_CHAT,
    slots: room.voiceSlotMode ? [...(room.slots || emptySlots())] : undefined,
    // 已取消旁听：始终为 0，保留字段兼容旧客户端
    listenerCount: 0,
    participants: enrichParticipants(room),
    messages: room.messages.slice(-50),
    music: serializeMusic(room.music)
  }
}

function emptyMusic() {
  return { url: '', title: '', artist: '', coverUrl: '', playing: false, position: 0, startedAt: 0, volume: 0.9 }
}

function serializeMusic(music) {
  if (!music?.url) return emptyMusic()
  return {
    url: String(music.url || ''),
    title: String(music.title || ''),
    artist: String(music.artist || ''),
    coverUrl: String(music.coverUrl || ''),
    playing: !!music.playing,
    position: Number(music.position) || 0,
    startedAt: music.playing ? Number(music.startedAt) || 0 : 0,
    volume: Math.min(1, Math.max(0, Number(music.volume ?? 0.9) || 0.9))
  }
}

function musicElapsed(music) {
  if (!music?.url) return 0
  if (!music.playing) return Number(music.position) || 0
  const base = Number(music.position) || 0
  const started = Number(music.startedAt) || 0
  return base + Math.max(0, (Date.now() - started) / 1000)
}

export function getActiveRoom(conversationId) {
  return rooms.get(Number(conversationId)) || null
}

export function getRoomSnapshot(conversationId) {
  const room = getActiveRoom(conversationId)
  return room ? serializeRoom(room) : null
}

/** 语音房列表卡片：主持位 + 两排各 4 麦（与房内一致，共 9 位） */
export async function getVoiceSlotPreview(conversationId, count = 9) {
  const room = getActiveRoom(Number(conversationId))
  const n = Math.max(0, Number(count) || 9)
  if (!room?.voiceSlotMode) return Array(n).fill(null)
  const { findUserById } = await import('./db.js')
  const slots = room.slots || emptySlots()
  const result = []
  for (let i = 0; i < n; i++) {
    const uid = slots[i]
    if (uid == null) {
      result.push(null)
      continue
    }
    const uidNum = Number(uid)
    const p = room.participants.get(uidNum)
    let avatarRaw = String(p?.avatarUrl || '').trim()
    if (!avatarRaw) {
      try {
        const user = await findUserById(uidNum)
        avatarRaw = String(user?.avatar_url || user?.avatarUrl || '').trim()
      } catch {
        avatarRaw = ''
      }
    }
    const normalized = normalizeAvatarUrl(avatarRaw)
    result.push({
      userId: uidNum,
      avatarUrl: encodeMediaPathUrl(normalized) || normalized,
      micOn: p ? !!p.micOn : false,
      micBanned: p ? !!p.micBanned : false
    })
  }
  return result
}

export function startRoom(conversationId, ownerUser, chatSettings = {}) {
  const convId = Number(conversationId)
  const ownerId = Number(ownerUser?.id)
  if (!convId || !ownerId) throw new Error('无效的参数')
  if (rooms.has(convId)) throw new Error('多人聊天已在进行中')

  const voiceSlotMode = !!chatSettings.voiceSlotMode
  const info = mapUserInfo(ownerUser, { micOn: !voiceSlotMode })
  const room = {
    sessionId: createSessionId(),
    conversationId: convId,
    ownerId,
    starterName: info.nickname || info.username || '群主',
    multiChatBackground: String(chatSettings.multiChatBackground || ''),
    multiChatNotice: String(chatSettings.multiChatNotice || ''),
    voiceSlotMode,
    maxCapacity: voiceSlotMode
      ? Math.min(
          Math.max(1, Number(chatSettings.maxCapacity) || DEFAULT_VOICE_ROOM_CAPACITY),
          MAX_MIC_SLOTS
        )
      : MAX_GROUP_MULTI_CHAT,
    slots: voiceSlotMode ? emptySlots() : null,
    participants: new Map([[ownerId, info]]),
    messages: [],
    music: emptyMusic()
  }
  if (voiceSlotMode) {
    room.slots[0] = ownerId
    info.micOn = true
  }
  rooms.set(convId, room)
  addWelcomeMessage(room, ownerUser)
  return serializeRoom(room)
}

export function syncRoomMultiChatSettings(conversationId, { multiChatBackground, multiChatNotice } = {}) {
  const room = getActiveRoom(conversationId)
  if (!room) return null
  if (multiChatBackground !== undefined) {
    room.multiChatBackground = String(multiChatBackground || '')
  }
  if (multiChatNotice !== undefined) {
    room.multiChatNotice = String(multiChatNotice || '')
  }
  return serializeRoom(room)
}

export function joinRoom(conversationId, user) {
  const convId = Number(conversationId)
  const uid = Number(user?.id)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  const wasAlreadyIn = room.participants.has(uid)
  if (!wasAlreadyIn) {
    const maxParticipants = resolveRoomMaxParticipants(room)
    if (room.participants.size >= maxParticipants) {
      throw new Error(
        room.voiceSlotMode
          ? `语音房已满（最多${maxParticipants}个麦位）`
          : '房间已满（最多6人）'
      )
    }
    if (room.voiceSlotMode && firstFreeSlotIndex(room) < 0) {
      throw new Error(`麦位已满（最多${MAX_MIC_SLOTS}人）`)
    }
  }
  const prev = room.participants.get(uid)
  const defaultMicOn = !room.voiceSlotMode
  const info = mapUserInfo(user, {
    micOn: wasAlreadyIn && prev?.micOn !== undefined ? !!prev.micOn : defaultMicOn,
    micBanned: !!prev?.micBanned,
    slotBanned: !!prev?.slotBanned,
    chatBanned: !!prev?.chatBanned
  })
  room.participants.set(uid, info)
  if (!wasAlreadyIn) addWelcomeMessage(room, user)

  // 语音房无旁听：进房即占空麦位
  if (room.voiceSlotMode) {
    const onSlot = (room.slots || []).some((id) => id != null && Number(id) === uid)
    if (!onSlot) {
      const freeIdx = firstFreeSlotIndex(room)
      if (freeIdx < 0) {
        room.participants.delete(uid)
        throw new Error(`麦位已满（最多${MAX_MIC_SLOTS}人）`)
      }
      seatUser(room, uid, freeIdx, { micOn: true })
    }
  }
  return serializeRoom(room)
}

export function leaveRoom(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const room = getActiveRoom(convId)
  if (!room) return null

  clearUserSlot(room, uid)
  room.participants.delete(uid)
  const ownerLeft = uid === room.ownerId
  const shouldEnd =
    room.participants.size === 0 || (ownerLeft && !room.voiceSlotMode)
  if (shouldEnd) {
    const ended = { sessionId: room.sessionId, conversationId: convId, ownerId: room.ownerId }
    rooms.delete(convId)
    return { ended, room: null }
  }
  return { ended: null, room: serializeRoom(room) }
}

export function forceEndRoom(conversationId) {
  const convId = Number(conversationId)
  const room = getActiveRoom(convId)
  if (!room) return null
  const ended = { sessionId: room.sessionId, conversationId: convId, ownerId: room.ownerId }
  rooms.delete(convId)
  return ended
}

export function endRoom(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const room = getActiveRoom(convId)
  if (!room) return null
  if (uid !== room.ownerId) throw new Error('仅群主可结束多人聊天')
  const ended = { sessionId: room.sessionId, conversationId: convId, ownerId: room.ownerId }
  rooms.delete(convId)
  return ended
}

export function addRoomMessage(conversationId, userId, content, user) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const raw = String(content || '').trim()
  assertChatMessageContent(raw)
  const text = maskBannedWords(raw)
  if (!text) throw new Error('消息不能为空')
  if (text.length > 500) throw new Error('消息过长')

  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  if (!room.participants.has(uid)) throw new Error('请先加入多人聊天')

  const info = mapUserInfo(user)
  const msg = {
    userId: uid,
    content: text,
    nickname: info.nickname,
    username: info.username,
    avatarUrl: info.avatarUrl,
    ts: Date.now()
  }
  room.messages.push(msg)
  if (room.messages.length > MAX_MESSAGES) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES)
  }
  return msg
}

export function setParticipantMic(conversationId, userId, micOn) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  const participant = room.participants.get(uid)
  if (!participant) throw new Error('请先加入多人聊天')
  // 语音房：闭麦/开麦只切换麦克风，不占用/释放麦位（下麦走 releaseMicSlot）
  if (room.voiceSlotMode) {
    const onSlot = (room.slots || []).some((id) => id != null && Number(id) === uid)
    if (!onSlot) {
      if (micOn) throw new Error('请先上麦')
      participant.micOn = false
      return serializeRoom(room)
    }
    if (micOn && participant.micBanned) throw new Error('你已被禁言，暂时无法开麦')
    participant.micOn = !!micOn
    return serializeRoom(room)
  }
  participant.micOn = !!micOn
  return serializeRoom(room)
}

export function takeMicSlot(conversationId, userId, slotIndex) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const idx = Number(slotIndex)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  if (!room.voiceSlotMode) throw new Error('当前房间不支持麦位')
  if (!room.participants.has(uid)) throw new Error('请先加入多人聊天')
  if (!Number.isInteger(idx) || idx < 0 || idx >= SLOT_COUNT) throw new Error('无效的麦位')
  if (room.slots[idx] != null && Number(room.slots[idx]) !== uid) throw new Error('该麦位已有人')

  clearUserSlot(room, uid)
  room.slots[idx] = uid
  const participant = room.participants.get(uid)
  if (participant.micBanned) throw new Error('你已被禁言，暂时无法开麦')
  participant.micOn = true
  return serializeRoom(room)
}

export function applyParticipantMicBan(conversationId, targetUserId, banned) {
  const convId = Number(conversationId)
  const target = Number(targetUserId)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  const participant = room.participants.get(target)
  if (!participant) throw new Error('用户不在房间')
  participant.micBanned = !!banned
  if (participant.micBanned) participant.micOn = false
  return serializeRoom(room)
}

export function applyParticipantSlotBan(conversationId, targetUserId, { slotBanned, chatBanned }) {
  const convId = Number(conversationId)
  const target = Number(targetUserId)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  const participant = room.participants.get(target)
  if (!participant) throw new Error('用户不在房间')
  // 已取消「禁止上麦」：仅保留文字禁言标记
  participant.slotBanned = false
  participant.chatBanned = !!chatBanned
  return serializeRoom(room)
}

export async function syncRoomMicBans(conversationId) {
  const convId = Number(conversationId)
  const room = getActiveRoom(convId)
  if (!room?.voiceSlotMode) return room ? serializeRoom(room) : null
  const { getPublicChatRoomRowByConversation, getActiveMicBanUserIds } = await import('./publicChatRoomsDb.js')
  const roomRow = await getPublicChatRoomRowByConversation(convId)
  if (!roomRow) return serializeRoom(room)
  const bannedIds = await getActiveMicBanUserIds(roomRow.roomId)
  for (const participant of room.participants.values()) {
    const banned = bannedIds.has(Number(participant.id))
    participant.micBanned = banned
    if (banned) participant.micOn = false
  }
  return serializeRoom(room)
}

export async function syncRoomRestrictions(conversationId) {
  const convId = Number(conversationId)
  const room = getActiveRoom(convId)
  if (!room?.voiceSlotMode) return room ? serializeRoom(room) : null
  const { getPublicChatRoomRowByConversation, getActiveRestrictionMap } = await import('./publicChatRoomsDb.js')
  const roomRow = await getPublicChatRoomRowByConversation(convId)
  if (!roomRow) return serializeRoom(room)
  const restrictionMap = await getActiveRestrictionMap(roomRow.roomId)
  for (const participant of room.participants.values()) {
    const r = restrictionMap.get(Number(participant.id)) || { slotBanned: false, chatBanned: false }
    // 已取消「禁止上麦」，历史 slot 限制不再踢人
    participant.slotBanned = false
    participant.chatBanned = !!r.chatBanned
  }
  return serializeRoom(room)
}

export function removeParticipantFromRoom(conversationId, targetUserId) {
  const convId = Number(conversationId)
  const target = Number(targetUserId)
  const room = getActiveRoom(convId)
  if (!room) return null
  if (!room.participants.has(target)) return serializeRoom(room)
  clearUserSlot(room, target)
  room.participants.delete(target)
  return serializeRoom(room)
}

export function releaseMicSlot(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  if (!room.voiceSlotMode) throw new Error('当前房间不支持麦位')
  const participant = room.participants.get(uid)
  if (!participant) throw new Error('请先加入多人聊天')
  // 无旁听：下麦即离开语音房
  return leaveRoom(convId, uid)
}

function normalizeMusicUrl(raw) {
  const input = String(raw || '').trim()
  if (!input) return ''
  try {
    const u = new URL(input)
    if (u.hostname.toLowerCase().includes('163.com') && u.searchParams.has('id')) {
      const idRaw = u.searchParams.get('id') || ''
      const match = idRaw.match(/^(\d+)/)
      if (match) u.searchParams.set('id', match[1])
    }
    return u.toString()
  } catch {
    return input
  }
}

function isSafeMusicUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false
    }
    if (/\.html?$/i.test(u.pathname) && !/music\.163\.com/i.test(host)) return false
    return true
  } catch {
    return false
  }
}

export async function setRoomMusic(conversationId, userId, payload = {}) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const room = getActiveRoom(convId)
  if (!room) throw new Error('多人聊天已结束')
  let allowed = uid === room.ownerId
  if (!allowed) {
    allowed = await canControlPublicRoomMusic(convId, uid)
  }
  if (!allowed) throw new Error('无权控制背景音乐')
  if (!room.participants.has(uid)) throw new Error('请先加入多人聊天')

  if (!room.music) room.music = emptyMusic()
  const music = room.music
  const action = String(payload.action || 'play').toLowerCase()

  if (action === 'stop') {
    room.music = emptyMusic()
    return serializeRoom(room)
  }

  const urlInput = payload.url !== undefined ? normalizeMusicUrl(payload.url) : music.url
  if (urlInput && !/^https?:\/\/.+/i.test(urlInput)) {
    throw new Error('请输入有效的音乐链接（http/https）')
  }
  if (urlInput && !isSafeMusicUrl(urlInput)) {
    throw new Error('请填写有效的音乐直链，不能使用本页或本地地址')
  }
  if (urlInput && /music\.163\.com/i.test(urlInput) && !/[?&]id=\d+/i.test(urlInput)) {
    throw new Error('网易云链接需包含 ?id=歌曲ID')
  }
  if (urlInput.length > 2048) throw new Error('音乐链接过长')

  if (action === 'pause') {
    if (music.playing) {
      music.position = musicElapsed(music)
    }
    music.playing = false
    music.startedAt = 0
    return serializeRoom(room)
  }

  if (action === 'volume') {
    const v = Number(payload.volume)
    if (!Number.isFinite(v)) throw new Error('无效的音量')
    music.volume = Math.min(1, Math.max(0, v))
    return serializeRoom(room)
  }

  if (action === 'play') {
    if (!urlInput) throw new Error('请先填写音乐地址')
    const urlChanged = urlInput !== music.url
    if (urlChanged) {
      music.url = urlInput
      music.position = 0
      music.coverUrl = ''
    }
    if (payload.title !== undefined) {
      music.title = String(payload.title || '').slice(0, 120)
    }
    if (payload.artist !== undefined) {
      music.artist = String(payload.artist || '').slice(0, 160)
    }
    if (payload.coverUrl !== undefined) {
      const incoming = String(payload.coverUrl || '').trim()
      if (incoming) music.coverUrl = incoming.slice(0, 500)
    }
    if (!music.coverUrl) {
      const songId = extractNeteaseSongId(urlInput)
      if (songId) {
        try {
          music.coverUrl = await resolveNeteaseCoverUrl(songId)
        } catch {
          // 封面解析失败不影响播放
        }
      }
    }
    if (music.volume == null || !Number.isFinite(Number(music.volume))) {
      music.volume = 0.9
    }
    music.playing = true
    music.startedAt = Date.now()
    return serializeRoom(room)
  }

  throw new Error('无效的音乐操作')
}

export function buildInviteContent(sessionId, starterName, backgroundUrl = '') {
  return JSON.stringify({
    sessionId: String(sessionId || ''),
    starterName: String(starterName || '群主').slice(0, 80),
    backgroundUrl: String(backgroundUrl || '').slice(0, 500),
    active: true
  })
}

export function parseInviteContent(content) {
  try {
    const data = JSON.parse(String(content || ''))
    if (data && typeof data === 'object') return data
  } catch {
    // ignore
  }
  return { sessionId: '', starterName: '群主', active: false }
}

export function canRelayRtc(conversationId, fromUserId, toUserId, sessionId) {
  const room = getActiveRoom(conversationId)
  if (!room || String(room.sessionId) !== String(sessionId || '')) return false
  const from = Number(fromUserId)
  const to = Number(toUserId)
  return room.participants.has(from) && room.participants.has(to)
}

export function getActiveRoomOnlineCount(conversationId) {
  const room = getActiveRoom(conversationId)
  return room ? room.participants.size : 0
}

/** 公共语音房：若无进行中的多人聊天则自动开启，并将用户加入 */
export function ensurePublicVoiceSession(conversationId, ownerUser, joiningUser, chatSettings = {}) {
  const convId = Number(conversationId)
  if (!convId || !ownerUser?.id || !joiningUser?.id) throw new Error('无效的参数')

  let started = false
  let snapshot = getRoomSnapshot(convId)
  if (!snapshot) {
    snapshot = startRoom(convId, ownerUser, chatSettings)
    started = true
  } else {
    const room = getActiveRoom(convId)
    if (room && chatSettings.voiceSlotMode && !room.voiceSlotMode) {
      room.voiceSlotMode = true
      room.slots = emptySlots()
      room.maxCapacity = Math.min(
        Math.max(
          1,
          Number(chatSettings.maxCapacity) || Number(room.maxCapacity) || DEFAULT_VOICE_ROOM_CAPACITY
        ),
        MAX_MIC_SLOTS
      )
      for (const participant of room.participants.values()) {
        participant.micOn = false
      }
      // 已在房的人立刻占麦，满则踢出多出的人（无旁听）
      const keep = [...room.participants.values()]
      for (const p of keep) {
        const freeIdx = firstFreeSlotIndex(room)
        if (freeIdx < 0) {
          room.participants.delete(p.id)
          continue
        }
        seatUser(room, p.id, freeIdx, { micOn: Number(p.id) === Number(room.ownerId) })
      }
      snapshot = serializeRoom(room)
    } else if (room && chatSettings.voiceSlotMode && chatSettings.maxCapacity != null) {
      room.maxCapacity = Math.min(
        Math.max(1, Number(chatSettings.maxCapacity) || DEFAULT_VOICE_ROOM_CAPACITY),
        MAX_MIC_SLOTS
      )
      snapshot = serializeRoom(room)
    } else if (
      !String(snapshot.multiChatBackground || '').trim() &&
      String(chatSettings.multiChatBackground || '').trim()
    ) {
      snapshot = syncRoomMultiChatSettings(convId, {
        multiChatBackground: chatSettings.multiChatBackground,
        multiChatNotice: chatSettings.multiChatNotice
      })
    }
  }

  const uid = Number(joiningUser.id)
  if (!snapshot.participants?.some((p) => Number(p.id) === uid)) {
    snapshot = joinRoom(convId, joiningUser)
  }

  const room = getActiveRoom(convId)
  if (room?.voiceSlotMode && Number(room.ownerId) === uid && room.slots?.[0] == null) {
    snapshot = takeMicSlot(convId, uid, 0)
  }

  return { room: snapshot, started }
}
