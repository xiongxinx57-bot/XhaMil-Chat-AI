import { DEFAULT_GROUP_AVATAR_URL, encodeMediaPathUrl, normalizeAvatarUrl } from './config.js'
import { hashPassword, verifyPassword } from './userAuth.js'
import { generateRandomVoiceRoomCode, isValidVoiceRoomCode } from './idCodes.js'

const DEFAULT_PUBLIC_ROOM_BG = '/media/Official Images/chatBg.jpeg'
const DEFAULT_PUBLIC_VOICE_ROOM_BG = '/media/Official Images/Voice Room.jpeg'

async function deps() {
  return import('./db.js')
}

function normalizePublicRoomType(raw) {
  return String(raw || '').trim().toLowerCase() === 'voice' ? 'voice' : 'chat'
}

async function generateUniqueVoiceRoomCode(pool) {
  for (let i = 0; i < 48; i++) {
    const code = generateRandomVoiceRoomCode()
    if (!isValidVoiceRoomCode(code)) continue
    const [rows] = await pool.query(
      'SELECT id FROM public_chat_rooms WHERE room_code = ? LIMIT 1',
      [code]
    )
    if (!rows.length) return code
  }
  throw new Error('无法生成唯一房间号，请重试')
}

function mapPublicChatRoomRow(row, { includePassword = false } = {}) {
  if (!row) return null
  const hostAvatar =
    encodeMediaPathUrl(
      normalizeAvatarUrl(String(row.hostAvatarRaw || row.host_avatar_url || '').trim())
    ) || ''
  const iconFromRow = row.icon_url ? encodeMediaPathUrl(row.icon_url) : ''
  const item = {
    id: Number(row.id),
    title: row.title || '多人聊天',
    entryHint: row.entry_hint || '点击进入',
    roomType: normalizePublicRoomType(row.room_type),
    backgroundUrl:
      encodeMediaPathUrl(row.background_url) ||
      encodeMediaPathUrl(
        normalizePublicRoomType(row.room_type) === 'voice'
          ? DEFAULT_PUBLIC_VOICE_ROOM_BG
          : DEFAULT_PUBLIC_ROOM_BG
      ),
    iconUrl: iconFromRow || hostAvatar || encodeMediaPathUrl(DEFAULT_GROUP_AVATAR_URL),
    hasPassword: !!row.password_hash,
    conversationId: Number(row.conversation_id),
    roomCode: String(row.room_code || '').trim(),
    maxCapacity: Math.max(
      0,
      Number(row.max_capacity) ||
        (normalizePublicRoomType(row.room_type) === 'voice' ? 20 : 6)
    ),
    sortOrder: Number(row.sort_order) || 0,
    enabled: row.enabled == null ? true : !!row.enabled,
    creatorUserId: row.creator_user_id != null ? Number(row.creator_user_id) : null,
    isEphemeral: !!row.is_ephemeral,
    creatorNickname: row.creatorNickname || row.creator_nickname || '',
    hostUserId: Number(row.hostUserId ?? row.creator_user_id ?? row.conversationOwnerId) || 0,
    hostNickname: row.hostNickname || row.creatorNickname || row.creator_nickname || '',
    hostAvatarUrl: hostAvatar,
    groupCode: row.group_code || '',
    memberCount: row.memberCount != null ? Number(row.memberCount) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at || null
  }
  if (includePassword) item.passwordHash = row.password_hash || null
  return item
}

async function getDefaultPublicRoomOwnerUserId() {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const [rows] = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1')
  if (!rows.length) throw new Error('系统中暂无用户，无法创建聊天室')
  return Number(rows[0].id)
}

async function createSystemGroupForPublicRoom(ownerId, title, backgroundUrl, { multiChatBg = null } = {}) {
  const { getMysqlPool } = await deps()
  const pool = getMysqlPool()
  const owner = Number(ownerId)
  if (!owner) throw new Error('无效的房间管理员')
  const roomTitle = String(title || '多人聊天').trim() || '多人聊天'
  if (roomTitle.length > 96) throw new Error('标题不能超过 96 字')
  const bg = String(backgroundUrl || DEFAULT_PUBLIC_ROOM_BG).trim() || DEFAULT_PUBLIC_ROOM_BG
  const voiceBg = String(multiChatBg || bg).trim() || bg
  const { generateUniqueGroupCode } = await deps()
  const groupCode = await generateUniqueGroupCode()

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [convResult] = await conn.query(
      `INSERT INTO conversations (title, avatar_url, last_message, conv_type, owner_id, group_code, banned, group_chat_bg, multi_chat_bg)
       VALUES (?, ?, ?, 'group', ?, ?, 0, ?, ?)`,
      [roomTitle, '', '', owner, groupCode, bg, voiceBg]
    )
    const convId = convResult.insertId
    await conn.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [
      convId,
      owner
    ])
    await conn.commit()
    try {
      const { refreshGroupCompositeAvatar } = await deps()
      await refreshGroupCompositeAvatar(convId, { force: true })
    } catch (e) {
      console.warn('[group-avatar] public room mosaic failed', e?.message || e)
    }
    return { id: convId, groupCode, title: roomTitle, backgroundUrl: bg }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

async function fetchPublicChatRoomRow(roomId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const [rows] = await pool.query(
    `SELECT p.*, c.group_code, c.owner_id AS conversationOwnerId,
            u.nickname AS creatorNickname,
            COALESCE(p.creator_user_id, c.owner_id) AS hostUserId,
            hu.nickname AS hostNickname,
            hu.avatar_url AS hostAvatarRaw,
            (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = p.conversation_id) AS memberCount
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     LEFT JOIN users u ON u.id = p.creator_user_id
     LEFT JOIN users hu ON hu.id = COALESCE(p.creator_user_id, c.owner_id)
     WHERE p.id = ? LIMIT 1`,
    [Number(roomId)]
  )
  return rows[0] || null
}

const PUBLIC_ROOM_LIST_SQL = `
  SELECT p.*, c.group_code, c.owner_id AS conversationOwnerId,
         u.nickname AS creatorNickname,
         COALESCE(p.creator_user_id, c.owner_id) AS hostUserId,
         hu.nickname AS hostNickname,
         hu.avatar_url AS hostAvatarRaw,
         (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = p.conversation_id) AS memberCount
  FROM public_chat_rooms p
  JOIN conversations c ON c.id = p.conversation_id
  LEFT JOIN users u ON u.id = p.creator_user_id
  LEFT JOIN users hu ON hu.id = COALESCE(p.creator_user_id, c.owner_id)
`

export async function listPublicChatRoomsForUser() {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const [rows] = await pool.query(
    `${PUBLIC_ROOM_LIST_SQL}
     WHERE c.banned = 0 AND p.room_type = 'voice' AND p.enabled = 1
     ORDER BY p.is_ephemeral DESC, p.sort_order ASC, p.id DESC`
  )
  return rows.map((row) => mapPublicChatRoomRow(row))
}

/** 当前用户相关的已结束会议（创建过或进过） */
export async function listPublicVoiceMeetingHistory(userId, { limit = 80 } = {}) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const uid = Number(userId)
  if (!uid) return []
  const lim = Math.max(1, Math.min(200, Number(limit) || 80))
  const [rows] = await pool.query(
    `${PUBLIC_ROOM_LIST_SQL}
     WHERE c.banned = 0 AND p.room_type = 'voice' AND p.enabled = 0
       AND (
         p.creator_user_id = ?
         OR EXISTS (
           SELECT 1 FROM public_voice_meeting_visits v
           WHERE v.room_id = p.id AND v.user_id = ?
         )
         OR EXISTS (
           SELECT 1 FROM conversation_members cm
           WHERE cm.conversation_id = p.conversation_id AND cm.user_id = ?
         )
       )
     ORDER BY COALESCE(p.ended_at, p.updated_at, p.created_at) DESC, p.id DESC
     LIMIT ${lim}`,
    [uid, uid, uid]
  )
  return rows.map((row) => mapPublicChatRoomRow(row))
}

export async function recordPublicVoiceMeetingVisit(roomId, userId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const rid = Number(roomId)
  const uid = Number(userId)
  if (!rid || !uid) return
  await pool.query(
    `INSERT INTO public_voice_meeting_visits (room_id, user_id, joined_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE joined_at = joined_at`,
    [rid, uid]
  )
}

/** 结束会议：归档保留历史，不再硬删除 */
export async function archivePublicChatRoom(roomId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  if (!id) throw new Error('无效的房间 ID')
  const existing = await fetchPublicChatRoomRow(id)
  if (!existing) throw new Error('聊天室不存在')
  const convId = Number(existing.conversation_id)
  const { forceEndRoom } = await import('./groupMultiChat.js')
  const ended = forceEndRoom(convId)
  await pool.query(
    'UPDATE public_chat_rooms SET enabled = 0, ended_at = COALESCE(ended_at, NOW()) WHERE id = ?',
    [id]
  )
  return {
    success: true,
    message: '会议已结束',
    conversationId: convId,
    sessionId: ended?.sessionId || null,
    roomId: id
  }
}

/** 主持麦：优先房主用户头像，其次创建房间时选择的 icon */
export async function resolvePublicRoomHostAvatar(room) {
  const hostId = Number(room?.hostUserId) || 0
  let avatar = String(room?.hostAvatarUrl || '').trim()
  if (!avatar && hostId) {
    const { findUserById } = await deps()
    const user = await findUserById(hostId)
    const raw = String(user?.avatar_url || user?.avatarUrl || '').trim()
    avatar = encodeMediaPathUrl(normalizeAvatarUrl(raw)) || normalizeAvatarUrl(raw)
  }
  if (!avatar) {
    avatar = String(room?.iconUrl || '').trim()
  }
  if (!avatar) {
    avatar = encodeMediaPathUrl(normalizeAvatarUrl(''))
  }
  return avatar
}

export async function listPublicChatRoomsForAdmin() {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const [rows] = await pool.query(
    `${PUBLIC_ROOM_LIST_SQL}
     ORDER BY p.is_ephemeral DESC, p.sort_order ASC, p.id DESC`
  )
  return rows.map((row) => mapPublicChatRoomRow(row))
}

export async function createPublicChatRoom(input = {}) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const roomType = 'voice'
  const title = String(input.title || '语音房').trim() || '语音房'
  const entryHint = String(input.entryHint || input.entry_hint || '点击进入').trim() || '点击进入'
  const defaultBg = DEFAULT_PUBLIC_VOICE_ROOM_BG
  const backgroundUrl =
    encodeMediaPathUrl(String(input.backgroundUrl || input.background_url || defaultBg).trim()) ||
    encodeMediaPathUrl(defaultBg)
  const iconRaw = String(input.iconUrl || input.icon_url || '').trim()
  const iconUrl = iconRaw ? encodeMediaPathUrl(iconRaw) || null : null
  const maxCapacity = Math.max(0, Math.min(500, Number(input.maxCapacity ?? input.max_capacity ?? 20) || 20))
  const sortOrder = Number(input.sortOrder ?? input.sort_order ?? 0) || 0
  const enabled = input.enabled === false || input.enabled === 0 ? 0 : 1
  const password = String(input.password || '').trim()
  const ownerUserId =
    Number(input.ownerUserId || input.owner_user_id) || (await getDefaultPublicRoomOwnerUserId())

  const group = await createSystemGroupForPublicRoom(ownerUserId, title, backgroundUrl, {
    multiChatBg: backgroundUrl
  })
  const passwordHash = password ? hashPassword(password) : null
  const roomCode = await generateUniqueVoiceRoomCode(pool)

  const [result] = await pool.query(
    `INSERT INTO public_chat_rooms
      (title, entry_hint, room_type, background_url, icon_url, password_hash, conversation_id, room_code, max_capacity, sort_order, enabled, creator_user_id, is_ephemeral)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      entryHint,
      roomType,
      backgroundUrl,
      iconUrl,
      passwordHash,
      group.id,
      roomCode,
      maxCapacity,
      sortOrder,
      enabled,
      null,
      0
    ]
  )

  const row = await fetchPublicChatRoomRow(result.insertId)
  return mapPublicChatRoomRow(row)
}

async function teardownUserEphemeralRoom(roomRow) {
  const convId = Number(roomRow?.conversation_id)
  const roomId = Number(roomRow?.id)
  if (!convId || !roomId) return null
  const archived = await archivePublicChatRoom(roomId)
  return {
    convId,
    sessionId: archived?.sessionId || null,
    roomId
  }
}

/** 结束并删除用户未关播的个人 ephemeral 语音房 */
export async function endUserActiveEphemeralVoiceRoom(userId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的参数')

  const [activeRows] = await pool.query(
    `SELECT p.id
     FROM public_chat_rooms p
     WHERE p.creator_user_id = ? AND p.is_ephemeral = 1 AND p.enabled = 1
     LIMIT 1`,
    [uid]
  )
  if (!activeRows.length) {
    return { ended: false, message: '' }
  }
  const existing = await fetchPublicChatRoomRow(activeRows[0].id)
  if (!existing) {
    return { ended: false, message: '' }
  }
  const torn = await teardownUserEphemeralRoom(existing)
  return {
    ended: true,
    message: '已结束未关播的语音房',
    conversationId: torn?.convId || Number(existing.conversation_id) || 0,
    sessionId: torn?.sessionId || null,
    roomId: torn?.roomId || Number(existing.id) || 0
  }
}

export async function createUserPublicVoiceRoom(userId, input = {}) {
  const { assertConnected, getMysqlPool, findUserById } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的参数')

  const user = await findUserById(uid)
  if (!user) throw new Error('用户不存在')

  const [activeRows] = await pool.query(
    `SELECT p.id
     FROM public_chat_rooms p
     WHERE p.creator_user_id = ? AND p.is_ephemeral = 1 AND p.enabled = 1
     LIMIT 1`,
    [uid]
  )
  let replaced = null
  if (activeRows.length) {
    const existing = await fetchPublicChatRoomRow(activeRows[0].id)
    if (existing) {
      replaced = await teardownUserEphemeralRoom(existing)
    }
  }

  const nickname = String(user.nickname || user.username || '用户').trim() || '用户'
  const title = String(input.title || `${nickname}的会议`).trim() || `${nickname}的会议`
  const entryHint = String(input.entryHint || input.entry_hint || '点击进入').trim() || '点击进入'
  const defaultBg = DEFAULT_PUBLIC_VOICE_ROOM_BG
  const backgroundUrl =
    encodeMediaPathUrl(String(input.backgroundUrl || input.background_url || defaultBg).trim()) ||
    encodeMediaPathUrl(defaultBg)
  const iconUrlRaw = String(input.iconUrl || input.icon_url || user.avatar_url || '').trim()
  const iconUrl = iconUrlRaw ? encodeMediaPathUrl(iconUrlRaw) : null
  const maxCapacity = Math.max(2, Math.min(500, Number(input.maxCapacity ?? input.max_capacity ?? 20) || 20))

  const group = await createSystemGroupForPublicRoom(uid, title, backgroundUrl, {
    multiChatBg: backgroundUrl
  })
  const roomCode = await generateUniqueVoiceRoomCode(pool)

  const [result] = await pool.query(
    `INSERT INTO public_chat_rooms
      (title, entry_hint, room_type, background_url, icon_url, password_hash, conversation_id, room_code, max_capacity, sort_order, enabled, creator_user_id, is_ephemeral)
     VALUES (?, ?, 'voice', ?, ?, NULL, ?, ?, ?, 0, 1, ?, 1)`,
    [title, entryHint, backgroundUrl, iconUrl, group.id, roomCode, maxCapacity, uid]
  )

  const row = await fetchPublicChatRoomRow(result.insertId)
  return {
    room: mapPublicChatRoomRow(row),
    replaced
  }
}

export async function updatePublicChatRoom(roomId, input = {}) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  if (!id) throw new Error('无效的房间 ID')
  const existing = await fetchPublicChatRoomRow(id)
  if (!existing) throw new Error('聊天室不存在')

  const title = input.title != null ? String(input.title).trim() || '多人聊天' : existing.title
  const entryHint =
    input.entryHint != null || input.entry_hint != null
      ? String(input.entryHint ?? input.entry_hint).trim() || '点击进入'
      : existing.entry_hint
  const roomType = 'voice'
  const defaultBg = DEFAULT_PUBLIC_VOICE_ROOM_BG
  const backgroundUrl =
    input.backgroundUrl != null || input.background_url != null
      ? encodeMediaPathUrl(String(input.backgroundUrl ?? input.background_url).trim()) ||
        encodeMediaPathUrl(defaultBg)
      : encodeMediaPathUrl(existing.background_url) || encodeMediaPathUrl(defaultBg)
  const iconUrl =
    input.iconUrl != null || input.icon_url != null
      ? encodeMediaPathUrl(String(input.iconUrl ?? input.icon_url).trim()) || null
      : existing.icon_url
        ? encodeMediaPathUrl(existing.icon_url)
        : null
  const maxCapacity =
    input.maxCapacity != null || input.max_capacity != null
      ? Math.max(0, Math.min(500, Number(input.maxCapacity ?? input.max_capacity) || 0))
      : Number(existing.max_capacity) || 20
  const sortOrder =
    input.sortOrder != null || input.sort_order != null
      ? Number(input.sortOrder ?? input.sort_order) || 0
      : Number(existing.sort_order) || 0
  const enabled =
    input.enabled === false || input.enabled === 0
      ? 0
      : input.enabled === true || input.enabled === 1
        ? 1
        : existing.enabled

  let passwordHash = existing.password_hash
  if (input.clearPassword === true || input.clear_password === true) {
    passwordHash = null
  } else if (input.password != null && String(input.password).trim()) {
    passwordHash = hashPassword(String(input.password).trim())
  }

  await pool.query(
    `UPDATE public_chat_rooms
     SET title = ?, entry_hint = ?, room_type = ?, background_url = ?, icon_url = ?, password_hash = ?,
         max_capacity = ?, sort_order = ?, enabled = ?
     WHERE id = ?`,
    [title, entryHint, roomType, backgroundUrl, iconUrl, passwordHash, maxCapacity, sortOrder, enabled, id]
  )

  const [convRows] = await pool.query(
    'SELECT multi_chat_bg FROM conversations WHERE id = ? LIMIT 1',
    [Number(existing.conversation_id)]
  )
  const prevMultiChatBg = convRows[0]?.multi_chat_bg || ''
  await pool.query('UPDATE conversations SET title = ?, group_chat_bg = ?, multi_chat_bg = ? WHERE id = ?', [
    title,
    backgroundUrl,
    backgroundUrl || prevMultiChatBg,
    Number(existing.conversation_id)
  ])

  const row = await fetchPublicChatRoomRow(id)
  return mapPublicChatRoomRow(row)
}

export async function deletePublicChatRoom(roomId) {
  const { assertConnected, getMysqlPool, deleteGroupById } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  if (!id) throw new Error('无效的房间 ID')
  const existing = await fetchPublicChatRoomRow(id)
  if (!existing) throw new Error('聊天室不存在')
  await pool.query('DELETE FROM public_chat_room_admins WHERE room_id = ?', [id])
  await deleteGroupById(Number(existing.conversation_id))
  return { success: true, message: '聊天室已删除' }
}

export async function canControlPublicRoomMusic(conversationId, userId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const convId = Number(conversationId)
  const uid = Number(userId)
  if (!convId || !uid) return false

  const [roomRows] = await pool.query(
    `SELECT p.id AS roomId, c.owner_id AS ownerId
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE p.conversation_id = ? LIMIT 1`,
    [convId]
  )
  if (!roomRows.length) return false

  const row = roomRows[0]
  if (Number(row.ownerId) === uid) return true

  const [adminRows] = await pool.query(
    'SELECT 1 FROM public_chat_room_admins WHERE room_id = ? AND user_id = ? LIMIT 1',
    [Number(row.roomId), uid]
  )
  return adminRows.length > 0
}

export async function getPublicChatRoomRowByConversation(conversationId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const convId = Number(conversationId)
  if (!convId) return null
  const [rows] = await pool.query(
    `SELECT p.id AS roomId, p.conversation_id AS conversationId, p.is_ephemeral AS isEphemeral,
            p.creator_user_id AS creatorUserId, c.owner_id AS ownerId
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE p.conversation_id = ? LIMIT 1`,
    [convId]
  )
  return rows[0] || null
}

export async function getPublicRoomMicBanDetails(roomId, userId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  const uid = Number(userId)
  if (!id || !uid) return { banned: false }
  const [rows] = await pool.query(
    `SELECT banned_until AS bannedUntil,
            GREATEST(1, TIMESTAMPDIFF(MINUTE, NOW(), banned_until)) AS minutesRemaining
     FROM public_chat_room_mic_bans
     WHERE room_id = ? AND user_id = ? AND banned_until > NOW() LIMIT 1`,
    [id, uid]
  )
  if (!rows.length) return { banned: false }
  const minutesRemaining = Math.max(1, Number(rows[0].minutesRemaining) || 1)
  return {
    banned: true,
    minutesRemaining,
    bannedUntil: rows[0].bannedUntil,
    message: `你已被禁言 ${minutesRemaining} 分钟，暂时无法上麦`
  }
}

export async function assertPublicRoomMicAllowed(conversationId, userId) {
  const roomRow = await getPublicChatRoomRowByConversation(conversationId)
  if (!roomRow) return
  const details = await getPublicRoomMicBanDetails(roomRow.roomId, userId)
  if (details.banned) throw new Error(details.message)
}

export async function assertCanModeratePublicRoom(conversationId, actorId, targetUserId) {
  const roomRow = await getPublicChatRoomRowByConversation(conversationId)
  if (!roomRow) throw new Error('不是公共语音房')
  const actor = Number(actorId)
  const target = Number(targetUserId)
  if (!actor || !target) throw new Error('无效的参数')
  if (actor === target) throw new Error('不能对自己操作')
  const ownerId = Number(roomRow.ownerId)
  const creatorId = Number(roomRow.creatorUserId)
  if (target === ownerId || (creatorId > 0 && target === creatorId)) {
    throw new Error('不能对房主操作')
  }
  if (actor === ownerId || (creatorId > 0 && actor === creatorId)) return roomRow
  const canAdmin = await canControlPublicRoomMusic(conversationId, actor)
  if (!canAdmin) throw new Error('仅房主或管理员可操作')
  return roomRow
}

export async function getActiveMicBanUserIds(roomId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  if (!id) return new Set()
  const [rows] = await pool.query(
    `SELECT user_id AS userId FROM public_chat_room_mic_bans
     WHERE room_id = ? AND banned_until > NOW()`,
    [id]
  )
  return new Set(rows.map((r) => Number(r.userId)).filter((uid) => uid > 0))
}

export async function banPublicRoomMic(conversationId, actorId, targetUserId, durationMinutes = 24 * 60) {
  const roomRow = await assertCanModeratePublicRoom(conversationId, actorId, targetUserId)
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const minutes = Math.max(1, Math.min(Math.round(Number(durationMinutes) || 60), 60 * 24 * 30))
  await pool.query(
    `INSERT INTO public_chat_room_mic_bans (room_id, user_id, banned_until, created_by)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
     ON DUPLICATE KEY UPDATE
       banned_until = DATE_ADD(NOW(), INTERVAL ? MINUTE),
       created_by = VALUES(created_by),
       created_at = NOW()`,
    [Number(roomRow.roomId), Number(targetUserId), minutes, Number(actorId), minutes]
  )
  return { roomId: Number(roomRow.roomId), targetUserId: Number(targetUserId), durationMinutes: minutes }
}

export async function unbanPublicRoomMic(conversationId, actorId, targetUserId) {
  const roomRow = await assertCanModeratePublicRoom(conversationId, actorId, targetUserId)
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  await pool.query(
    'DELETE FROM public_chat_room_mic_bans WHERE room_id = ? AND user_id = ?',
    [Number(roomRow.roomId), Number(targetUserId)]
  )
  return { roomId: Number(roomRow.roomId), targetUserId: Number(targetUserId) }
}

export async function getActiveRestrictionMap(roomId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  if (!id) return new Map()
  const [rows] = await pool.query(
    `SELECT user_id AS userId, chat_banned AS chatBanned
     FROM public_chat_room_member_restrictions
     WHERE room_id = ? AND banned_until > NOW()`,
    [id]
  )
  const out = new Map()
  for (const row of rows) {
    const uid = Number(row.userId)
    if (!uid) continue
    out.set(uid, {
      slotBanned: true,
      chatBanned: !!row.chatBanned || Number(row.chatBanned) === 1
    })
  }
  return out
}

export async function getPublicRoomRestrictionDetails(roomId, userId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const id = Number(roomId)
  const uid = Number(userId)
  if (!id || !uid) return { slotBanned: false, chatBanned: false }
  const [rows] = await pool.query(
    `SELECT chat_banned AS chatBanned,
            GREATEST(1, TIMESTAMPDIFF(MINUTE, NOW(), banned_until)) AS minutesRemaining
     FROM public_chat_room_member_restrictions
     WHERE room_id = ? AND user_id = ? AND banned_until > NOW() LIMIT 1`,
    [id, uid]
  )
  if (!rows.length) return { slotBanned: false, chatBanned: false }
  const chatBanned = !!rows[0].chatBanned || Number(rows[0].chatBanned) === 1
  const minutesRemaining = Math.max(1, Number(rows[0].minutesRemaining) || 1)
  return {
    slotBanned: true,
    chatBanned,
    minutesRemaining,
    message: chatBanned
      ? `你已被禁止上麦和文字聊天 ${minutesRemaining} 分钟`
      : `你已被禁止上麦 ${minutesRemaining} 分钟`
  }
}

export async function assertPublicRoomSlotAllowed(conversationId, userId) {
  // 已取消「禁止上麦」：进房必须上麦，不再拦截占麦
}

export async function assertPublicRoomChatAllowed(conversationId, userId) {
  const roomRow = await getPublicChatRoomRowByConversation(conversationId)
  if (!roomRow) return
  const details = await getPublicRoomRestrictionDetails(roomRow.roomId, userId)
  if (details.chatBanned) throw new Error(details.message)
}

export async function banPublicRoomSlot(
  conversationId,
  actorId,
  targetUserId,
  durationMinutes = 24 * 60,
  chatBanned = false
) {
  const roomRow = await assertCanModeratePublicRoom(conversationId, actorId, targetUserId)
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const minutes = Math.max(1, Math.min(Math.round(Number(durationMinutes) || 60), 60 * 24 * 30))
  const chat = chatBanned ? 1 : 0
  await pool.query(
    `INSERT INTO public_chat_room_member_restrictions (room_id, user_id, chat_banned, banned_until, created_by)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
     ON DUPLICATE KEY UPDATE
       chat_banned = VALUES(chat_banned),
       banned_until = DATE_ADD(NOW(), INTERVAL ? MINUTE),
       created_by = VALUES(created_by),
       created_at = NOW()`,
    [Number(roomRow.roomId), Number(targetUserId), chat, minutes, Number(actorId), minutes]
  )
  return {
    roomId: Number(roomRow.roomId),
    targetUserId: Number(targetUserId),
    durationMinutes: minutes,
    chatBanned: !!chatBanned
  }
}

export async function unbanPublicRoomSlot(conversationId, actorId, targetUserId) {
  const roomRow = await assertCanModeratePublicRoom(conversationId, actorId, targetUserId)
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  await pool.query(
    'DELETE FROM public_chat_room_member_restrictions WHERE room_id = ? AND user_id = ?',
    [Number(roomRow.roomId), Number(targetUserId)]
  )
  return { roomId: Number(roomRow.roomId), targetUserId: Number(targetUserId) }
}

export async function joinPublicChatRoom(userId, roomId, password) {
  const { assertConnected, getMysqlPool, isGroupMember, isUserGroupBlacklisted } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const uid = Number(userId)
  const id = Number(roomId)
  if (!uid || !id) throw new Error('无效的参数')

  const [rows] = await pool.query(
    `SELECT p.*, c.title AS convTitle, c.banned, c.group_code, c.owner_id AS convOwnerId
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE p.id = ? AND p.enabled = 1 LIMIT 1`,
    [id]
  )
  if (!rows.length) {
    const err = new Error('聊天室不存在或已关闭')
    err.status = 404
    throw err
  }
  const room = rows[0]
  if (room.banned) throw new Error('该聊天房已被封禁')

  const convId = Number(room.conversation_id)
  const title = room.title || room.convTitle || '多人聊天'

  if (await isUserGroupBlacklisted(convId, uid)) {
    throw new Error('您已被禁止进入此语音房')
  }

  if (room.password_hash) {
    const pwd = String(password || '').trim()
    if (!pwd) {
      const err = new Error('请输入房间密码')
      err.status = 401
      throw err
    }
    if (!verifyPassword(pwd, room.password_hash)) {
      const err = new Error('密码错误')
      err.status = 403
      throw err
    }
  }

  if (await isGroupMember(convId, uid)) {
    await recordPublicVoiceMeetingVisit(id, uid)
    return {
      conversation: { id: convId, title, convType: 'group' },
      relationStatus: 'member',
      isPublicRoom: true,
      isEphemeral: !!room.is_ephemeral,
      roomType: normalizePublicRoomType(room.room_type),
      backgroundUrl: encodeMediaPathUrl(room.background_url || ''),
      canControlMusic: await canControlPublicRoomMusic(convId, uid),
      message: ''
    }
  }

  const maxCapacity = Math.max(0, Number(room.max_capacity) || 0)
  if (maxCapacity > 0) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM conversation_members WHERE conversation_id = ?',
      [convId]
    )
    const memberCount = Number(countRows[0]?.cnt) || 0
    if (memberCount >= maxCapacity) {
      throw new Error(
        normalizePublicRoomType(room.room_type) === 'voice'
          ? `语音房已满（最多${maxCapacity}人）`
          : '聊天室已满'
      )
    }
  }

  await pool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [
    convId,
    uid
  ])
  await recordPublicVoiceMeetingVisit(id, uid)
  return {
    conversation: { id: convId, title, convType: 'group' },
    relationStatus: 'joined',
    welcomeMessage: null,
    isPublicRoom: true,
    isEphemeral: !!room.is_ephemeral,
    roomType: normalizePublicRoomType(room.room_type),
    backgroundUrl: encodeMediaPathUrl(room.background_url || ''),
    canControlMusic: await canControlPublicRoomMusic(convId, uid),
    message: normalizePublicRoomType(room.room_type) === 'voice' ? '已进入语音房' : '已进入聊天室'
  }
}

export async function isPublicRoomConversation(conversationId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const convId = Number(conversationId)
  if (!convId) return false
  const [rows] = await pool.query(
    'SELECT 1 FROM public_chat_rooms WHERE conversation_id = ? LIMIT 1',
    [convId]
  )
  return rows.length > 0
}

export async function leavePublicChatRoomMember(userId, conversationId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const uid = Number(userId)
  const convId = Number(conversationId)
  if (!uid || !convId) throw new Error('无效的参数')

  const [roomRows] = await pool.query(
    `SELECT p.id, p.is_ephemeral, p.creator_user_id, c.owner_id AS ownerId
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE p.conversation_id = ? LIMIT 1`,
    [convId]
  )
  if (!roomRows.length) throw new Error('不是公共语音房')

  const room = roomRows[0]
  const roomId = Number(room.id)
  const isEphemeral = !!room.is_ephemeral
  const creatorId = Number(room.creator_user_id) || Number(room.ownerId)

  if (isEphemeral && uid === creatorId) {
    const archived = await archivePublicChatRoom(roomId)
    return {
      success: true,
      message: '会议已结束',
      deleted: true,
      archived: true,
      roomId,
      conversationId: convId,
      sessionId: archived?.sessionId || null
    }
  }

  await pool.query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
    convId,
    uid
  ])
  return { success: true, message: '已离开语音房', deleted: false }
}

export async function getPublicRoomMultiChatContext(conversationId) {
  const { assertConnected, getMysqlPool } = await deps()
  assertConnected()
  const pool = getMysqlPool()
  const convId = Number(conversationId)
  const [rows] = await pool.query(
    `SELECT p.room_type AS roomType, p.max_capacity AS maxCapacity, p.background_url AS publicRoomBg,
            c.owner_id AS ownerId, c.multi_chat_bg AS multiChatBg, c.multi_chat_notice AS multiChatNotice
     FROM public_chat_rooms p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE p.conversation_id = ? LIMIT 1`,
    [convId]
  )
  const row = rows[0]
  if (!row) return null
  const bgRaw = String(row.multiChatBg || row.publicRoomBg || '').trim()
  return {
    roomType: row.roomType,
    ownerId: row.ownerId,
    maxCapacity: Math.max(0, Number(row.maxCapacity) || 20),
    multiChatBg: encodeMediaPathUrl(bgRaw) || encodeMediaPathUrl(String(row.publicRoomBg || '').trim()),
    multiChatNotice: row.multiChatNotice || ''
  }
}
