import { WebSocketServer } from 'ws'
import {
  findUserById,
  findUserByUsernameLoose,
  getConversationConvType,
  getConversationMemberIds,
  getGroupOwnerUserId,
  getGroupChatDetail,
  sendGroupButlerDrawGuessSummary,
  sendMessage,
  addDrawGuessSessionScores,
  assertPublicRoomMicAllowed,
  assertPublicRoomChatAllowed,
  assertPublicRoomSlotAllowed
} from './db.js'
import { getUserSession, getUserSessionAsync, revokeUserSessionsByUserId } from './userAuth.js'
import {
  ackMessageDelivery,
  flushPendingDeliveries,
  queueMessageDelivery
} from './messageDelivery.js'
import { redisDelOnline, redisSetOnline } from './redis.js'
import { isPrivateCallDisabled } from './privateCallConfig.js'
import {
  getUserRestrictions,
  getVoiceCallRestrictionKey,
  getVoiceCallRestrictionMessage
} from './userRestrictions.js'
import {
  addRoomMessage,
  canRelayRtc,
  endRoom,
  getActiveRoom,
  getRoomSnapshot,
  joinRoom,
  leaveRoom,
  setParticipantMic,
  setRoomMusic,
  takeMicSlot,
  releaseMicSlot,
  startRoom,
  syncRoomMultiChatSettings,
  syncRoomMicBans,
  syncRoomRestrictions
} from './groupMultiChat.js'
import {
  addDrawGuessChat,
  addDrawGuessStroke,
  clearDrawGuessCanvas,
  endDrawGuessGame,
  getDrawGuessSnapshot,
  getDrawGuessParticipantUserIds,
  joinDrawGuessGame,
  leaveDrawGuessGame,
  pickDrawGuessWord,
  refreshDrawGuessTopic,
  setDrawGuessDrawingExpiredHandler,
  setDrawGuessGameFinishedHandler,
  submitDrawGuessGuess
} from './drawGuess.js'

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const banWatchByUsername = new Map()

/** @type {Map<number, Set<import('ws').WebSocket>>} */
const clientsByUser = new Map()

/** @type {Map<number, Map<number, Set<import('ws').WebSocket>>>} */
const conversationRooms = new Map()

function addClient(userId, ws) {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set())
  clientsByUser.get(userId).add(ws)
}

/** 当前有活跃 WebSocket 的用户 ID 集合 */
export function getOnlineUserIdSet() {
  const out = new Set()
  for (const [userId, set] of clientsByUser.entries()) {
    if (!set || !set.size) continue
    for (const ws of set) {
      if (ws.readyState === 1 /* OPEN */) {
        out.add(Number(userId))
        break
      }
    }
  }
  return out
}

export function isUserOnline(userId) {
  const id = Number(userId)
  if (!id) return false
  const set = clientsByUser.get(id)
  if (!set || !set.size) return false
  for (const ws of set) {
    if (ws.readyState === 1) return true
  }
  return false
}

function removeClient(ws) {
  const userId = ws.userId
  const convIds = ws.conversations ? [...ws.conversations] : []
  if (userId) {
    const set = clientsByUser.get(userId)
    if (set) {
      set.delete(ws)
      if (!set.size) clientsByUser.delete(userId)
    }
  }
  // 该用户已无其它在线连接时，才通知会话内对方「离开」（通话异常中断依赖此信令）
  const stillOnline = userId ? isUserOnline(userId) : false
  if (userId && !stillOnline) void redisDelOnline(userId)
  for (const convId of convIds) {
    leaveConversationRoom(ws, convId, { notify: !stillOnline })
  }
}

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function sendToUser(userId, payload) {
  const id = Number(userId)
  if (!id) return 0
  const set = clientsByUser.get(id)
  if (!set) return 0
  const msg = JSON.stringify(payload)
  let n = 0
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg)
      n++
    }
  }
  return n
}

function deliverChatMessage(userId, payload) {
  sendToUser(userId, payload)
  void queueMessageDelivery(userId, payload)
}

function getConversationPeers(conversationId, excludeUserId) {
  const room = conversationRooms.get(conversationId)
  if (!room) return []
  const exclude = Number(excludeUserId)
  const peers = []
  for (const [userId, sockets] of room.entries()) {
    if (Number(userId) === exclude) continue
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) peers.push({ userId: Number(userId), ws })
    }
  }
  return peers
}

function joinConversationRoom(ws, conversationId) {
  if (!ws.conversations) ws.conversations = new Set()
  ws.conversations.add(conversationId)

  if (!conversationRooms.has(conversationId)) {
    conversationRooms.set(conversationId, new Map())
  }
  const room = conversationRooms.get(conversationId)
  if (!room.has(ws.userId)) room.set(ws.userId, new Set())
  room.get(ws.userId).add(ws)

  const peers = getConversationPeers(conversationId, ws.userId)
  for (const peer of peers) {
    sendJson(ws, { type: 'peer-joined', conversationId, userId: peer.userId })
    sendJson(peer.ws, { type: 'peer-joined', conversationId, userId: ws.userId })
  }

  const multiChatRoom = getRoomSnapshot(conversationId)
  if (multiChatRoom) {
    sendJson(ws, { type: 'group-multi-chat-state', conversationId, room: multiChatRoom })
  }

  const drawGuessGame = getDrawGuessSnapshot(conversationId, ws.userId)
  if (drawGuessGame) {
    sendJson(ws, { type: 'draw-guess-state', conversationId, game: drawGuessGame })
  }

  void notifyGroupOwnerOnlineToPeers(conversationId, ws.userId)
}

async function notifyGroupOwnerOnlineToPeers(conversationId, userId) {
  try {
    const convType = await getConversationConvType(conversationId)
    if (convType !== 'group') return
    const ownerId = await getGroupOwnerUserId(conversationId)
    if (!ownerId || Number(ownerId) !== Number(userId)) return
    const peers = getConversationPeers(conversationId, userId)
    for (const peer of peers) {
      sendJson(peer.ws, { type: 'group-owner-online', conversationId })
    }
  } catch {
    /* ignore */
  }
}

function leaveConversationRoom(ws, conversationId, { notify = true } = {}) {
  if (ws.conversations) ws.conversations.delete(conversationId)
  const room = conversationRooms.get(conversationId)
  if (!room) return

  const userSockets = room.get(ws.userId)
  if (userSockets) {
    userSockets.delete(ws)
    if (!userSockets.size) room.delete(ws.userId)
  }
  if (!room.size) conversationRooms.delete(conversationId)

  if (notify) {
    const peers = getConversationPeers(conversationId, ws.userId)
    for (const peer of peers) {
      sendJson(peer.ws, { type: 'peer-left', conversationId, userId: ws.userId })
    }
  }
}

function relaySignal(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId || !ws.conversations?.has(conversationId)) return

  const peers = getConversationPeers(conversationId, ws.userId)
  for (const peer of peers) {
    sendJson(peer.ws, { ...msg, fromUserId: ws.userId })
  }
}

async function canUsePrivateVoiceCall(conversationId) {
  if (!isPrivateCallDisabled()) return true
  const convType = await getConversationConvType(conversationId)
  if (!convType) return false
  return convType === 'group'
}

function getUserCallRestriction(userId, callType) {
  const restrictions = getUserRestrictions(userId)
  const key = getVoiceCallRestrictionKey(callType)
  if (restrictions[key]) {
    return { blocked: true, message: getVoiceCallRestrictionMessage(callType) }
  }
  return { blocked: false, message: '' }
}

async function relayVoiceCallToMembers(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  const callRestriction = getUserCallRestriction(ws.userId, msg.callType)
  if (callRestriction.blocked) {
    sendJson(ws, {
      type: 'voice-call-error',
      conversationId,
      message: callRestriction.message
    })
    return
  }
  const allowed = await canUsePrivateVoiceCall(conversationId)
  if (!allowed) {
    sendJson(ws, {
      type: 'voice-call-error',
      conversationId,
      message: '私聊语音/视频通话功能已关闭'
    })
    return
  }
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = { ...msg, fromUserId: ws.userId }
  const selfId = Number(ws.userId)
  let delivered = 0
  for (const userId of memberIds) {
    const uid = Number(userId)
    // mysql bigint 常为 string，=== 会漏掉「排除自己」，邀请回环后主叫误报忙线
    if (!uid || uid === selfId) continue
    if (!isUserOnline(uid)) continue
    sendToUser(uid, payload)
    delivered += 1
  }
  // 私聊邀请：对方无任何在线长连接时立刻回执，避免空等响铃
  if (
    delivered === 0 &&
    String(msg.type || '') === 'voice-call-invite'
  ) {
    sendJson(ws, {
      type: 'voice-call-offline',
      conversationId,
      fromUserId: ws.userId
    })
  }
}

async function relayVoiceCallSignal(ws, msg) {
  const conversationId = Number(msg.conversationId)
  const callRestriction = getUserCallRestriction(ws.userId, msg.callType)
  if (callRestriction.blocked) {
    sendJson(ws, {
      type: 'voice-call-error',
      conversationId: conversationId || undefined,
      message: callRestriction.message
    })
    return
  }
  if (conversationId) {
    const allowed = await canUsePrivateVoiceCall(conversationId)
    if (!allowed) {
      sendJson(ws, {
        type: 'voice-call-error',
        conversationId,
        message: '私聊语音/视频通话功能已关闭'
      })
      return
    }
  }
  const targetUserId = Number(msg.toUserId)
  const payload = { ...msg, fromUserId: ws.userId }
  if (targetUserId) {
    sendToUser(targetUserId, payload)
    return
  }
  if (conversationId && ws.conversations?.has(conversationId)) {
    const peers = getConversationPeers(conversationId, ws.userId)
    if (peers.length) {
      for (const peer of peers) {
        sendJson(peer.ws, payload)
      }
      return
    }
  }
  if (conversationId) {
    await relayVoiceCallToMembers(ws, msg)
  }
}

async function broadcastToConversationMembers(conversationId, payload, excludeUserId = null) {
  const memberIds = await getConversationMemberIds(conversationId)
  const exclude = excludeUserId == null ? null : Number(excludeUserId)
  const sent = new Set()
  for (const userId of memberIds) {
    const uid = Number(userId)
    if (!uid || sent.has(uid)) continue
    if (exclude != null && uid === exclude) continue
    sent.add(uid)
    sendToUser(uid, payload)
  }
}

function broadcastToDrawGuessParticipants(conversationId, payload, excludeUserId = null) {
  for (const userId of getDrawGuessParticipantUserIds(conversationId)) {
    if (excludeUserId != null && userId === excludeUserId) continue
    sendToUser(userId, payload)
  }
}

async function broadcastDrawGuessState(conversationId) {
  const convId = Number(conversationId)
  const memberIds = await getConversationMemberIds(convId)
  for (const userId of memberIds) {
    const game = getDrawGuessSnapshot(convId, userId)
    if (!game) continue
    sendToUser(userId, {
      type: 'draw-guess-state',
      conversationId: convId,
      game
    })
  }
}

setDrawGuessDrawingExpiredHandler(async (conversationId) => {
  if (getDrawGuessSnapshot(conversationId)) {
    await broadcastDrawGuessState(conversationId)
  }
})

setDrawGuessGameFinishedHandler(async (payload) => {
  const convId = Number(payload?.conversationId)
  if (!convId) return
  if (payload?.scores) {
    await addDrawGuessSessionScores(convId, payload.scores).catch(() => {})
  }
  await broadcastToConversationMembers(convId, {
    type: 'draw-guess-clear',
    conversationId: convId,
    sessionId: payload.sessionId,
    summary: payload.summary || ''
  })
  const msg = await sendGroupButlerDrawGuessSummary(convId, payload.summary)
  if (msg) {
    await notifyNewMessage(convId, null, msg)
    const preview = String(msg.content || '').split('\n')[0] || '[群管家] 你画我猜成绩'
    await notifyConversationUpdate(convId, preview)
  }
})

async function handleDrawGuessJoin(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const user = await findUserById(ws.userId)
    if (!user) return
    joinDrawGuessGame(conversationId, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatar_url || user.avatarUrl || ''
    })
    await broadcastDrawGuessState(conversationId)
    const game = getDrawGuessSnapshot(conversationId, ws.userId)
    sendJson(ws, { type: 'draw-guess-joined', conversationId, game })
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '加入失败' })
  }
}

async function handleDrawGuessLeave(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  const result = leaveDrawGuessGame(conversationId, ws.userId)
  if (!result) return
  if (result.ended) {
    await broadcastToConversationMembers(conversationId, {
      type: 'draw-guess-clear',
      conversationId,
      sessionId: result.ended.sessionId
    })
    return
  }
  await broadcastDrawGuessState(conversationId)
}

async function handleDrawGuessEnd(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const ended = endDrawGuessGame(conversationId, ws.userId)
    if (!ended) return
    await broadcastToConversationMembers(conversationId, {
      type: 'draw-guess-clear',
      conversationId,
      sessionId: ended.sessionId
    })
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '结束失败' })
  }
}

async function handleDrawGuessPickWord(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    pickDrawGuessWord(conversationId, ws.userId, msg.word)
    await broadcastDrawGuessState(conversationId)
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '选词失败' })
  }
}

async function handleDrawGuessRefreshTopic(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    refreshDrawGuessTopic(conversationId, ws.userId)
    await broadcastDrawGuessState(conversationId)
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '刷新失败' })
  }
}

function handleDrawGuessStroke(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const rawList = Array.isArray(msg.strokes)
      ? msg.strokes
      : [msg.stroke || msg].filter((s) => s && typeof s === 'object' && ('x0' in s || 'x1' in s))
    const strokes = []
    for (const raw of rawList) {
      strokes.push(addDrawGuessStroke(conversationId, ws.userId, raw))
    }
    if (!strokes.length) return
    broadcastToDrawGuessParticipants(
      conversationId,
      {
        type: 'draw-guess-stroke',
        conversationId,
        stroke: strokes.length === 1 ? strokes[0] : undefined,
        strokes: strokes.length > 1 ? strokes : undefined
      },
      ws.userId
    )
  } catch (e) {
    console.error('[draw-guess-stroke]', e)
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '作画失败' })
  }
}

function handleDrawGuessClear(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    clearDrawGuessCanvas(conversationId, ws.userId)
    broadcastToDrawGuessParticipants(conversationId, {
      type: 'draw-guess-canvas-clear',
      conversationId
    })
  } catch (e) {
    console.error('[draw-guess-clear]', e)
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '清屏失败' })
  }
}

async function handleDrawGuessGuess(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const user = await findUserById(ws.userId)
    if (!user) return
    const result = submitDrawGuessGuess(conversationId, user, msg.content || msg.text)
    if (result?.finished) return
    await broadcastDrawGuessState(conversationId)
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '猜词失败' })
  }
}

async function handleDrawGuessChat(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const user = await findUserById(ws.userId)
    if (!user) return
    addDrawGuessChat(conversationId, user, msg.content || msg.text)
    await broadcastDrawGuessState(conversationId)
  } catch (e) {
    sendJson(ws, { type: 'draw-guess-error', conversationId, message: e.message || '发送失败' })
  }
}

async function handleGroupMultiChatJoin(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const user = await findUserById(ws.userId)
    if (!user) return
    const sessionUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatar_url || user.avatarUrl || ''
    }

    const room = joinRoom(conversationId, sessionUser)
    let snapshot = room
    if (
      room?.voiceSlotMode &&
      Number(room.ownerId) === Number(ws.userId) &&
      room.slots?.[0] == null
    ) {
      snapshot = takeMicSlot(conversationId, ws.userId, 0)
    }
    try {
      const group = await getGroupChatDetail(conversationId, ws.userId)
      snapshot =
        syncRoomMultiChatSettings(conversationId, {
          multiChatBackground: group.multiChatBackground || '',
          multiChatNotice: group.multiChatNotice || ''
        }) || room
    } catch {
      // ignore
    }
    if (snapshot?.voiceSlotMode) {
      snapshot = await syncRoomMicBans(conversationId) || snapshot
      snapshot = await syncRoomRestrictions(conversationId) || snapshot
    }
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-state',
      conversationId,
      room: snapshot
    })
    sendJson(ws, { type: 'group-multi-chat-joined', conversationId, room: snapshot })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '加入失败' })
  }
}

async function handleGroupMultiChatLeave(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  const result = leaveRoom(conversationId, ws.userId)
  if (!result) return
  if (result.ended) {
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-clear',
      conversationId,
      sessionId: result.ended.sessionId
    })
    return
  }
  await broadcastToConversationMembers(conversationId, {
    type: 'group-multi-chat-state',
    conversationId,
    room: result.room
  })
}

async function handleGroupMultiChatEnd(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const ended = endRoom(conversationId, ws.userId)
    if (!ended) return
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-clear',
      conversationId,
      sessionId: ended.sessionId
    })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '结束失败' })
  }
}

async function handleGroupMultiChatMessage(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    await assertPublicRoomChatAllowed(conversationId, ws.userId)
    const user = await findUserById(ws.userId)
    if (!user) return
    const message = addRoomMessage(conversationId, ws.userId, msg.content, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatar_url || user.avatarUrl || ''
    })
    const room = getRoomSnapshot(conversationId)
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-message',
      conversationId,
      message,
      room
    })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '发送失败' })
  }
}

async function handleGroupMultiChatMic(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const micOn = msg.micOn !== false
    if (micOn) {
      await assertPublicRoomMicAllowed(conversationId, ws.userId)
    }
    const room = setParticipantMic(conversationId, ws.userId, micOn)
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-state',
      conversationId,
      room
    })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '操作失败' })
  }
}

async function handleGroupMultiChatSlot(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    if (msg.release !== true) {
      await assertPublicRoomMicAllowed(conversationId, ws.userId)
      await assertPublicRoomSlotAllowed(conversationId, ws.userId)
    }
    const room = msg.release === true
      ? releaseMicSlot(conversationId, ws.userId)
      : takeMicSlot(conversationId, ws.userId, Number(msg.slotIndex))
    // releaseMicSlot 无旁听后等价 leaveRoom，可能返回 { ended, room }
    if (msg.release === true && room && typeof room === 'object' && ('ended' in room || 'room' in room)) {
      if (room.ended) {
        await broadcastToConversationMembers(conversationId, {
          type: 'group-multi-chat-clear',
          conversationId,
          sessionId: room.ended.sessionId
        })
        return
      }
      await broadcastToConversationMembers(conversationId, {
        type: 'group-multi-chat-state',
        conversationId,
        room: room.room
      })
      return
    }
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-state',
      conversationId,
      room
    })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '操作失败' })
  }
}

async function handleGroupMultiChatMusic(ws, msg) {
  const conversationId = Number(msg.conversationId)
  if (!conversationId) return
  try {
    const room = await setRoomMusic(conversationId, ws.userId, {
      url: msg.url,
      action: msg.action,
      title: msg.title,
      artist: msg.artist,
      coverUrl: msg.coverUrl,
      volume: msg.volume
    })
    await broadcastToConversationMembers(conversationId, {
      type: 'group-multi-chat-state',
      conversationId,
      room
    })
  } catch (e) {
    sendJson(ws, { type: 'group-multi-chat-error', conversationId, message: e.message || '操作失败' })
  }
}

function handleGroupMultiChatRtc(ws, msg) {
  const conversationId = Number(msg.conversationId)
  const toUserId = Number(msg.toUserId)
  const sessionId = String(msg.sessionId || '')
  if (!conversationId || !toUserId || !sessionId) return
  if (!canRelayRtc(conversationId, ws.userId, toUserId, sessionId)) return
  sendToUser(toUserId, {
    type: 'group-multi-chat-rtc',
    conversationId,
    sessionId,
    fromUserId: ws.userId,
    signalType: msg.signalType,
    offer: msg.offer,
    answer: msg.answer,
    candidate: msg.candidate
  })
}

function handleClientMessage(ws, raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }

  if (!ws.authenticated) return

  switch (msg.type) {
    case 'ping':
      sendJson(ws, { type: 'pong', ts: Date.now() })
      if (ws.userId) void redisSetOnline(ws.userId, 90)
      break
    case 'message-ack': {
      const mid = Number(msg.messageId || 0)
      const cid = Number(msg.conversationId || 0)
      if (ws.userId && mid) void ackMessageDelivery(ws.userId, cid, mid)
      break
    }
    case 'join':
      joinConversationRoom(ws, Number(msg.conversationId))
      break
    case 'leave':
      leaveConversationRoom(ws, Number(msg.conversationId))
      break
    case 'typing':
    case 'typing_stop': {
      const conversationId = Number(msg.conversationId)
      if (!conversationId || !ws.conversations?.has(conversationId)) break
      const signalType = msg.type === 'typing_stop' ? 'typing_stop' : 'typing'
      // 仅私聊转发「正在输入」；群聊忽略
      void (async () => {
        try {
          const convType = await getConversationConvType(conversationId)
          if (convType && convType !== 'direct') return
          const peers = getConversationPeers(conversationId, ws.userId)
          for (const peer of peers) {
            sendJson(peer.ws, {
              type: signalType,
              conversationId,
              userId: ws.userId
            })
          }
        } catch {
          /* ignore */
        }
      })()
      break
    }
    case 'rtc-offer':
    case 'rtc-answer':
    case 'rtc-ice':
      relaySignal(ws, msg)
      break
    case 'voice-call-invite':
      relayVoiceCallToMembers(ws, msg).catch(() => {})
      break
    case 'voice-call-accept':
    case 'voice-call-offer':
    case 'voice-call-answer':
    case 'voice-call-reject':
    case 'voice-call-cancel':
    case 'voice-call-end':
    case 'voice-call-ice':
    case 'voice-call-busy':
      relayVoiceCallSignal(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-join':
      handleGroupMultiChatJoin(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-leave':
      handleGroupMultiChatLeave(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-end':
      handleGroupMultiChatEnd(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-message':
      handleGroupMultiChatMessage(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-mic':
      handleGroupMultiChatMic(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-slot':
      handleGroupMultiChatSlot(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-music':
      handleGroupMultiChatMusic(ws, msg).catch(() => {})
      break
    case 'group-multi-chat-rtc':
      handleGroupMultiChatRtc(ws, msg)
      break
    case 'draw-guess-join':
      handleDrawGuessJoin(ws, msg).catch(() => {})
      break
    case 'draw-guess-leave':
      handleDrawGuessLeave(ws, msg).catch(() => {})
      break
    case 'draw-guess-end':
      handleDrawGuessEnd(ws, msg).catch(() => {})
      break
    case 'draw-guess-pick-word':
      handleDrawGuessPickWord(ws, msg).catch(() => {})
      break
    case 'draw-guess-refresh-topic':
      handleDrawGuessRefreshTopic(ws, msg).catch(() => {})
      break
    case 'draw-guess-stroke':
      handleDrawGuessStroke(ws, msg)
      break
    case 'draw-guess-clear':
      handleDrawGuessClear(ws, msg)
      break
    case 'draw-guess-guess':
      handleDrawGuessGuess(ws, msg).catch(() => {})
      break
    case 'draw-guess-chat':
      handleDrawGuessChat(ws, msg).catch(() => {})
      break
    default:
      break
  }
}

function banWatchKey(username) {
  return String(username || '').trim().toLowerCase()
}

function notifyBanWatch(username, banned) {
  const key = banWatchKey(username)
  if (!key) return
  const set = banWatchByUsername.get(key)
  if (!set) return
  const payload = JSON.stringify({
    type: banned ? 'account_banned' : 'account_unbanned',
    banned: !!banned
  })
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

function addBanWatchClient(username, ws) {
  const key = banWatchKey(username)
  if (!key) return
  if (!banWatchByUsername.has(key)) banWatchByUsername.set(key, new Set())
  banWatchByUsername.get(key).add(ws)
  ws.banWatchUsername = key
}

function removeBanWatchClient(ws) {
  const key = ws.banWatchUsername
  if (!key) return
  const set = banWatchByUsername.get(key)
  if (!set) return
  set.delete(ws)
  if (!set.size) banWatchByUsername.delete(key)
}

export function getConversationOnlineCount(conversationId) {
  const room = conversationRooms.get(Number(conversationId))
  if (!room) return 0
  return room.size
}

export async function notifyUserBanned(userId) {
  const id = Number(userId)
  if (!id) return
  const user = await findUserById(id)
  revokeUserSessionsByUserId(id)
  if (user?.username) notifyBanWatch(user.username, true)
  sendToUser(id, { type: 'account_banned', banned: true })
  const set = clientsByUser.get(id)
  if (!set) return
  const sockets = [...set]
  setTimeout(() => {
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.close(4403, 'banned')
    }
    clientsByUser.delete(id)
  }, 200)
}

export async function notifyUserUnbanned(userId) {
  const id = Number(userId)
  if (!id) return
  const user = await findUserById(id)
  if (user?.username) notifyBanWatch(user.username, false)
  sendToUser(id, { type: 'account_unbanned', banned: false })
}

function handleBanWatchConnection(ws, req) {
  const url = new URL(req.url || '/ws/ban-watch', 'http://localhost')
  const username = String(url.searchParams.get('username') || '').trim()
  if (!username) {
    ws.close(4400, 'username required')
    return
  }

  findUserByUsernameLoose(username)
    .then((user) => {
      if (!user) {
        ws.close(4404, 'not found')
        return
      }

      addBanWatchClient(user.username, ws)
      const banned = user.status === 'banned'
      sendJson(ws, {
        type: banned ? 'account_banned' : 'account_unbanned',
        banned
      })

      ws.on('close', () => removeBanWatchClient(ws))
      ws.on('error', () => removeBanWatchClient(ws))
    })
    .catch(() => ws.close(1011, 'error'))
}

function attachMainWsLifecycle(ws) {
  ws.on('close', () => {
    removeBanWatchClient(ws)
    removeClient(ws)
  })
  ws.on('error', () => {
    removeBanWatchClient(ws)
    removeClient(ws)
  })
}

async function authenticateMainWs(ws, token, req) {
  const session =
    (await getUserSessionAsync(String(token || '').trim())) ||
    getUserSession(String(token || '').trim())
  if (!session) {
    const err = new Error('unauthorized')
    err.code = 4401
    throw err
  }
  const user = await findUserById(session.userId)
  if (!user || user.status === 'banned') {
    const err = new Error('banned')
    err.code = 4403
    throw err
  }
  ws.authenticated = true
  ws.userId = session.userId
  ws.conversations = new Set()
  addClient(session.userId, ws)
  addBanWatchClient(user.username, ws)
  void redisSetOnline(session.userId, 90)
  sendJson(ws, { type: 'connected', userId: session.userId })
  // 重放未确认投递，降低断线/丢包漏消息
  void flushPendingDeliveries(session.userId, (payload) => sendToUser(session.userId, payload))
  return user
}

function handleMainConnection(ws, req) {
  ws.authenticated = false
  const url = new URL(req.url || '/ws', 'http://localhost')
  const legacyToken = url.searchParams.get('token') || ''
  let authTimer = null

  if (!legacyToken) {
    authTimer = setTimeout(() => {
      if (!ws.authenticated) ws.close(4401, 'auth timeout')
    }, 10000)
  }

  ws.on('message', (data) => {
    if (ws.authenticated) {
      handleClientMessage(ws, data.toString())
      return
    }
    if (legacyToken) return
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.type !== 'auth' || !msg.token) return
    authenticateMainWs(ws, msg.token, req)
      .then(() => {
        if (authTimer) clearTimeout(authTimer)
        attachMainWsLifecycle(ws)
      })
      .catch((e) => ws.close(e.code || 4401, e.message || 'unauthorized'))
  })

  ws.on('close', () => {
    if (authTimer) clearTimeout(authTimer)
  })

  if (legacyToken) {
    authenticateMainWs(ws, legacyToken, req)
      .then(() => attachMainWsLifecycle(ws))
      .catch((e) => ws.close(e.code || 4401, e.message || 'unauthorized'))
  }
}

export function attachRealtime(server) {
  const mainWss = new WebSocketServer({ noServer: true })
  const banWss = new WebSocketServer({ noServer: true })

  banWss.on('connection', handleBanWatchConnection)
  mainWss.on('connection', handleMainConnection)

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/'
    try {
      pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname
    } catch {
      socket.destroy()
      return
    }

    if (pathname === '/ws/ban-watch') {
      banWss.handleUpgrade(request, socket, head, (ws) => {
        banWss.emit('connection', ws, request)
      })
      return
    }

    if (pathname === '/ws') {
      mainWss.handleUpgrade(request, socket, head, (ws) => {
        mainWss.emit('connection', ws, request)
      })
      return
    }
  })

  return mainWss
}

export async function notifyMessageUpdated(conversationId, message) {
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = {
    type: 'message-update',
    conversationId,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      userId: message.userId,
      content: message.content || '',
      messageType: message.messageType,
      type: message.type || message.messageType,
      imageUrl: message.imageUrl || '',
      photoUrl: message.photoUrl || message.imageUrl || '',
      voiceUrl: message.voiceUrl,
      voiceDuration: message.voiceDuration,
      createdAt: message.createdAt,
      deletedAt: message.deletedAt,
      deleted: !!message.deleted || !!message.deletedAt,
      recalledByUserId: message.recalledByUserId ?? null,
      recalledByOwner: !!message.recalledByOwner,
      username: message.username,
      avatarUrl: message.avatarUrl
    }
  }

  for (const userId of memberIds) {
    sendToUser(userId, {
      ...payload,
      message: {
        ...payload.message,
        isSelf: userId === message.userId
      }
    })
  }
}

export async function notifyNewMessage(conversationId, senderUserId, message, mentionedUserIds = []) {
  const memberIds = await getConversationMemberIds(conversationId)
  const mentionSet = new Set(
    (Array.isArray(mentionedUserIds) ? mentionedUserIds : [])
      .map((id) => Number(id))
      .filter(Boolean)
  )
  const payload = {
    type: 'message',
    conversationId,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      userId: message.userId,
      content: message.content,
      messageType: message.messageType,
      type: message.type || message.messageType,
      imageUrl: message.imageUrl,
      photoUrl: message.photoUrl || message.imageUrl,
      voiceUrl: message.voiceUrl,
      voiceDuration: message.voiceDuration,
      createdAt: message.createdAt,
      username: message.username,
      nickname: message.nickname || message.username,
      avatarUrl: message.avatarUrl,
      isAi: !!message.isAi,
      aiBotId: message.aiBotId ?? null
    }
  }

  for (const userId of memberIds) {
    const uid = Number(userId)
    const isSelf = uid === Number(senderUserId)
    deliverChatMessage(uid, {
      ...payload,
      message: {
        ...payload.message,
        isSelf,
        mentionedMe: !isSelf && mentionSet.has(uid)
      }
    })
  }
}

export async function notifyGroupAiMessage(conversationId, message) {
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = {
    type: 'message',
    conversationId,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      userId: null,
      content: message.content,
      messageType: 'ai',
      type: 'ai',
      imageUrl: '',
      photoUrl: '',
      voiceUrl: '',
      voiceDuration: 0,
      createdAt: message.createdAt,
      username: message.username,
      nickname: message.nickname || message.username,
      avatarUrl: message.avatarUrl,
      isSelf: false,
      isAi: true,
      aiBotId: message.aiBotId ?? null
    }
  }
  for (const userId of memberIds) {
    deliverChatMessage(userId, payload)
  }
}

export async function notifyConversationUpdate(conversationId, lastMessage) {
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = { type: 'conversation-update', conversationId, lastMessage }
  for (const userId of memberIds) {
    sendToUser(userId, payload)
  }
}

export async function notifyGroupAnnouncementUpdated(conversationId, payload = {}) {
  const memberIds = await getConversationMemberIds(conversationId)
  const data = {
    announcement: payload.announcement || '',
    announcementImage: payload.announcementImage || '',
    announcementPinned: !!payload.announcementPinned,
    announcementPinnedMessageId: payload.announcementPinnedMessageId
      ? Number(payload.announcementPinnedMessageId)
      : null
  }
  const msg = { type: 'group-announcement-update', conversationId, ...data }
  for (const userId of memberIds) {
    sendToUser(userId, msg)
  }
}

export async function notifyGroupTitleUpdated(conversationId, title) {
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = { type: 'group-title-update', conversationId, title }
  for (const userId of memberIds) {
    sendToUser(userId, payload)
  }
}

export async function notifyGroupAvatarUpdated(conversationId, avatarUrl) {
  const memberIds = await getConversationMemberIds(conversationId)
  const payload = { type: 'group-avatar-update', conversationId, avatarUrl }
  for (const userId of memberIds) {
    sendToUser(userId, payload)
  }
}

export async function notifyGroupMemberNicknameUpdated(conversationId, payload = {}) {
  const memberIds = await getConversationMemberIds(conversationId)
  const data = {
    type: 'group-member-nickname-update',
    conversationId: Number(conversationId),
    userId: Number(payload.userId) || 0,
    groupNickname: String(payload.groupNickname || ''),
    displayName: String(payload.displayName || ''),
    nickname: String(payload.nickname || '')
  }
  for (const userId of memberIds) {
    sendToUser(userId, data)
  }
}

export async function notifyGroupAdminsUpdated(conversationId, group) {
  const memberIds = await getConversationMemberIds(conversationId)
  const admins = Array.isArray(group?.members)
    ? group.members.filter((m) => m.isAdmin && !m.isAi).map((m) => Number(m.id))
    : []
  const payload = {
    type: 'group-admins-update',
    conversationId: Number(conversationId),
    admins,
    members: group?.members || null
  }
  for (const userId of memberIds) {
    sendToUser(userId, payload)
  }
}

export function notifyGroupCreated(group) {
  if (!group?.id || !Array.isArray(group.memberIds)) return
  const payload = {
    type: 'group-created',
    conversation: {
      id: group.id,
      title: group.title,
      avatarUrl: group.avatarUrl,
      convType: 'group',
      groupCode: group.groupCode,
      memberCount: group.memberCount
    }
  }
  for (const userId of group.memberIds) {
    sendToUser(Number(userId), payload)
  }
}

export async function notifyFriendRequest(fromUserId, toUserId, result) {
  if (result?.relationStatus !== 'pending_sent') return
  sendToUser(Number(toUserId), {
    type: 'friend-request',
    fromUserId: Number(fromUserId),
    requestId: result.requestId,
    friend: result.friend
  })
}

export async function notifyGroupMultiChatSettingsUpdated(conversationId, payload = {}) {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-multi-chat-settings-update',
    conversationId: Number(conversationId),
    multiChatBackground: payload.multiChatBackground || '',
    multiChatNotice: payload.multiChatNotice || '',
    groupChatBackground: payload.groupChatBackground || ''
  })
}

export async function notifyGroupMuteUpdated(conversationId, groupMuted) {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-mute-update',
    conversationId: Number(conversationId),
    groupMuted: !!groupMuted
  })
}

export async function notifyGroupFileUploadPolicyUpdated(conversationId, fileUploadPolicy) {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-file-upload-policy-update',
    conversationId: Number(conversationId),
    fileUploadPolicy: String(fileUploadPolicy || 'all') === 'admins' ? 'admins' : 'all'
  })
}

export async function notifyAntiScreenshotUpdated(conversationId, payload = {}) {
  const convId = Number(conversationId)
  const scope = payload.scope === 'group' ? 'group' : 'direct'
  const actorUserId = payload.actorUserId != null ? Number(payload.actorUserId) : null
  const memberIds = await getConversationMemberIds(convId)
  for (const userId of memberIds) {
    let antiScreenshotSelf = !!payload.antiScreenshotSelf
    let antiScreenshotPeer = !!payload.antiScreenshotPeer
    let antiScreenshotActive = !!payload.antiScreenshotActive
    if (scope === 'group') {
      antiScreenshotSelf = !!payload.antiScreenshot
      antiScreenshotPeer = false
      antiScreenshotActive = !!payload.antiScreenshotActive
    } else if (actorUserId != null && Number(userId) !== actorUserId) {
      // 对端视角：自己的开关是 peer，对方的开关是 actor
      antiScreenshotSelf = !!payload.antiScreenshotPeer
      antiScreenshotPeer = !!payload.antiScreenshotSelf
      antiScreenshotActive = !!payload.antiScreenshotActive
    }
    sendToUser(userId, {
      type: 'anti-screenshot-update',
      conversationId: convId,
      scope,
      antiScreenshotSelf,
      antiScreenshotPeer,
      antiScreenshotActive,
      antiScreenshot: antiScreenshotActive
    })
  }
}

export async function notifyGroupButlerSettingsUpdated(conversationId, payload = {}) {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-butler-settings-update',
    conversationId: Number(conversationId),
    butlerEnabled: !!payload.butlerEnabled,
    butlerWelcome: payload.butlerWelcome || '',
    butlerWelcomeImage: payload.butlerWelcomeImage || '',
    butlerLeave: payload.butlerLeave || ''
  })
}

export async function notifyDrawGuessStarted(conversationId, game) {
  const convId = Number(conversationId)
  await broadcastDrawGuessState(convId)
  // Personalized ping so drawer-only fields (wordOptions/word) never leak or get wiped.
  const memberIds = await getConversationMemberIds(convId)
  for (const userId of memberIds) {
    const snap = getDrawGuessSnapshot(convId, userId) || game
    sendToUser(userId, {
      type: 'draw-guess-ping',
      conversationId: convId,
      game: snap
    })
  }
}

export async function notifyGroupMultiChatStarted(conversationId, room) {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-multi-chat-ping',
    conversationId: Number(conversationId),
    room
  })
}

export async function notifyGroupMultiChatClear(conversationId, sessionId = '') {
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-multi-chat-clear',
    conversationId: Number(conversationId),
    sessionId: String(sessionId || '')
  })
}

export async function notifyGroupMultiChatRoomState(conversationId, room) {
  if (!room) return
  await broadcastToConversationMembers(Number(conversationId), {
    type: 'group-multi-chat-state',
    conversationId: Number(conversationId),
    room
  })
}

export async function notifyFriendRequestResolved(responderUserId, result) {
  if (result?.relationStatus === 'friends' && result.friend?.id) {
    sendToUser(Number(result.friend.id), {
      type: 'friend-accepted',
      conversation: result.conversation,
      friend: result.friend
    })
    sendToUser(Number(responderUserId), {
      type: 'friend-accepted',
      conversation: result.conversation,
      friend: result.friend
    })
    return
  }
  sendToUser(Number(responderUserId), {
    type: 'notification-update'
  })
}

export async function notifyGroupJoinRequest(fromUserId, ownerId, result) {
  if (result?.relationStatus !== 'pending_sent') return
  sendToUser(Number(ownerId), {
    type: 'group-join-request',
    fromUserId: Number(fromUserId),
    requestId: result.requestId,
    conversationId: result.conversationId
  })
}

export async function notifyGroupJoinRequestResolved(responderUserId, result) {
  sendToUser(Number(responderUserId), { type: 'notification-update' })
  const applicantId = Number(result.applicantId || result.applicant?.id)
  if (!applicantId) return
  if (result.relationStatus === 'accepted') {
    sendToUser(applicantId, {
      type: 'group-join-accepted',
      conversation: result.conversation
    })
    return
  }
  if (result.relationStatus === 'rejected') {
    sendToUser(applicantId, { type: 'group-join-rejected', requestId: result.requestId })
  }
}

export function notifyGroupMemberKicked(userId, conversationId, { sessionId = '' } = {}) {
  const uid = Number(userId)
  const convId = Number(conversationId)
  if (!uid || !convId) return
  sendToUser(uid, {
    type: 'group-kicked',
    conversationId: convId
  })
  // 被踢者可能仍在语音浮层：单独推送 clear（broadcast 不会发给已移出成员）
  sendToUser(uid, {
    type: 'group-multi-chat-clear',
    conversationId: convId,
    sessionId: String(sessionId || ''),
    reason: 'kicked'
  })
}

/** 群解散：成员表已删，需按事先取出的 memberIds 推送 */
export function notifyGroupDissolved(conversationId, memberIds = []) {
  const convId = Number(conversationId)
  if (!convId) return
  const ids = [...new Set((memberIds || []).map((id) => Number(id)).filter(Boolean))]
  for (const uid of ids) {
    sendToUser(uid, {
      type: 'group-dissolved',
      conversationId: convId
    })
    sendToUser(uid, {
      type: 'group-multi-chat-clear',
      conversationId: convId,
      reason: 'dissolved'
    })
  }
}

export function notifyGroupMemberMuted(userId, conversationId, payload = {}) {
  sendToUser(Number(userId), {
    type: 'group-member-muted',
    conversationId: Number(conversationId),
    mutedUntil: payload.mutedUntil || null
  })
}

export function notifyGroupMentionRecipients(userIds, payload = {}) {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter(Boolean))]
  const conversationId = Number(payload.conversationId) || 0
  const fromName = String(payload.fromName || '').trim()
  const messageId = Number(payload.messageId) || 0
  for (const uid of ids) {
    sendToUser(uid, {
      type: 'mention-alert',
      conversationId,
      fromName,
      messageId
    })
    sendToUser(uid, { type: 'notification-update' })
  }
}

export { startRoom } from './groupMultiChat.js'
