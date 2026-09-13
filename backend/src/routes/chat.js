import { Router } from 'express'
import { CHAT_IMAGE_URL_PREFIX, VOICE_AUDIO_URL_PREFIX, GROUP_FILE_URL_PREFIX, CHAT_VIDEO_URL_PREFIX, MOMENTS_IMAGE_URL_PREFIX, MOMENTS_VIDEO_URL_PREFIX, MOMENTS_VIDEO_MAX_DURATION_SEC, REPORT_IMAGE_URL_PREFIX } from '../config.js'
import { fail, ok } from '../response.js'
import { resolvePlayableMusicUrl, resolveNeteaseCoverUrl, searchNeteaseMusic, extractNeteaseSongId } from '../musicSearch.js'
import {
  addFriend,
  createGroupChat,
  deleteFriendById,
  deleteGroupAnnouncement,
  getFriendRelationStatus,
  getUserProfile,
  findUserById,
  getGroupChatDetail,
  getGroupAnnouncements,
  getMessages,
  getNotificationsUnreadCount,
  listConversations,
  listFriends,
  listNotifications,
  clearNotificationsByType,
  markConversationReadForUser,
  listRecommendedUsersForFriend,
  quitGroupChat,
  recallMessage,
  respondFriendRequest,
  searchUsersForFriend,
  sendFriendRequest,
  sendFriendRequestByQuery,
  sendMessage,
  USER_SENDABLE_MESSAGE_TYPES,
  getOrCreateDirectConversation,
  notifyGroupMentionsForMessage,
  listConversationFiles,
  deleteConversationFile,
  purgeExpiredGroupFiles,
  assertGroupFileQuota,
  assertConversationMember,
  assertGroupFileUploadAllowed,
  handleGroupBannedWordViolation,
  triggerGroupAiReply,
  updateGroupAnnouncement,
  updateGroupAnnouncementPin,
  updateGroupButlerSettings,
  updateGroupButlerWelcomeImage,
  updateGroupMultiChatSettings,
  updateGroupMute,
  updateGroupFileUploadPolicy,
  updateGroupAntiScreenshot,
  updateDmAntiScreenshot,
  updateGroupName,
  setMyGroupNickname,
  addGroupMembers,
  setGroupAdmin,
  kickGroupMember,
  listGroupBlacklist,
  muteGroupMember,
  unmuteGroupMember,
  removeFromGroupBlacklist,
  requestJoinGroupByCode,
  respondGroupJoinRequest,
  searchGroupsForJoin,
  getGroupProfilePreview,
  getDrawGuessLeaderboard,
  listMomentsFeed,
  listUserMoments,
  createMoment,
  deleteMoment,
  toggleMomentLike,
  createMomentComment,
  deleteMomentComment,
  createUserReport,
  listPublicChatRoomsForUser,
  listPublicVoiceMeetingHistory,
  joinPublicChatRoom,
  leavePublicChatRoomMember,
  getPublicRoomMultiChatContext,
  createUserPublicVoiceRoom,
  endUserActiveEphemeralVoiceRoom,
  resolvePublicRoomHostAvatar,
  banPublicRoomMic,
  unbanPublicRoomMic,
  banPublicRoomSlot,
  unbanPublicRoomSlot,
  getGroupAiBotAssignment,
  getAiBotRecordById
} from '../db.js'
import {
  notifyConversationUpdate,
  notifyFriendRequest,
  notifyFriendRequestResolved,
  notifyGroupCreated,
  notifyGroupAnnouncementUpdated,
  notifyGroupAdminsUpdated,
  notifyGroupButlerSettingsUpdated,
  notifyGroupJoinRequest,
  notifyGroupJoinRequestResolved,
  notifyGroupMemberKicked,
  notifyGroupDissolved,
  notifyGroupMemberMuted,
  notifyGroupMentionRecipients,
  notifyGroupMultiChatSettingsUpdated,
  notifyGroupMuteUpdated,
  notifyGroupFileUploadPolicyUpdated,
  notifyAntiScreenshotUpdated,
  notifyGroupTitleUpdated,
  notifyGroupMemberNicknameUpdated,
  notifyGroupMultiChatRoomState,
  notifyGroupMultiChatStarted,
  notifyGroupMultiChatClear,
  notifyDrawGuessStarted,
  notifyMessageUpdated,
  notifyNewMessage,
  notifyGroupAiMessage,
  getConversationOnlineCount,
  getOnlineUserIdSet
} from '../realtime.js'
import {
  buildInviteContent,
  syncRoomMultiChatSettings,
  startRoom,
  ensurePublicVoiceSession,
  forceEndRoom,
  getVoiceSlotPreview,
  applyParticipantMicBan,
  applyParticipantSlotBan,
  syncRoomMicBans,
  syncRoomRestrictions,
  leaveRoom
} from '../groupMultiChat.js'
import {
  buildDrawGuessInviteContent,
  startDrawGuessGame
} from '../drawGuess.js'
import { getDrawGuessConfig, assertDrawGuessAllowed, isDrawGuessAllowedForConversation } from '../drawGuessConfig.js'
import { getGateGroupStatus, enterGateGroup } from '../gateGroup.js'
import { uploadChatPhoto, uploadChatVoice, uploadChatVideo, uploadUserAvatar, uploadVoiceToText, uploadGroupFile, uploadMomentPhoto, uploadMomentVideo, uploadReportPhoto } from '../upload.js'
import { decodeUploadFilename } from '../groupFiles.js'
import { scanFilePath } from '../fileSafety.js'
import { requireUser, requireUserOrQueryToken } from '../userAuth.js'
import { getVoiceToTextStatus, transcribeVoiceBuffer } from '../voiceToText.js'
import { synthesizeChatSpeech } from '../edgeTts.js'
import {
  getAmapClientStatus,
  searchAmapPlaces,
  aroundAmapPlaces,
  regeoAmap
} from '../amap.js'
import { Readable } from 'stream'
import fs from 'fs'

const router = Router()

const MESSAGE_SEND_WINDOW_MS = 60_000
const MESSAGE_SEND_MAX_PER_WINDOW = 20
const messageSendBuckets = new Map()

function assertMessageSendRate(userId, conversationId) {
  const key = `${userId}:${conversationId}`
  const now = Date.now()
  let bucket = messageSendBuckets.get(key)
  if (!bucket || now - bucket.start >= MESSAGE_SEND_WINDOW_MS) {
    bucket = { start: now, count: 0 }
    messageSendBuckets.set(key, bucket)
  }
  bucket.count += 1
  if (bucket.count > MESSAGE_SEND_MAX_PER_WINDOW) {
    const err = new Error('发送消息过于频繁，请稍后再试')
    err.status = 429
    throw err
  }
}

function parseUserMessagePayload(body = {}) {
  const rawType = String(body.type || body.messageType || 'text').toLowerCase()
  const messageType = rawType === 'image' ? 'photo' : rawType
  if (!USER_SENDABLE_MESSAGE_TYPES.has(messageType)) {
    const err = new Error('无效的消息类型')
    err.status = 403
    throw err
  }
  let content = body.content ?? body.text ?? ''
  if (content && typeof content === 'object') {
    content = JSON.stringify(content)
  }
  return {
    content,
    type: messageType,
    photoUrl: body.photoUrl ?? body.imageUrl ?? '',
    voiceUrl: body.voiceUrl ?? '',
    voiceDuration: body.voiceDuration ?? body.duration ?? 0,
    fileUrl: body.fileUrl ?? '',
    fileName: body.fileName ?? body.filename ?? '',
    fileSize: body.fileSize ?? body.size ?? 0
  }
}

function assertNoSpoofedIdentityFields(body, authUser) {
  if (!body || typeof body !== 'object' || !authUser) return

  for (const key of ['isSelf', 'deleted', 'deletedAt', 'deleted_at']) {
    if (key in body) {
      const err = new Error('请求包含不允许的字段')
      err.status = 403
      throw err
    }
  }

  if ('userId' in body || 'user_id' in body) {
    const claimed = body.userId ?? body.user_id
    if (claimed == null || Number(claimed) !== Number(authUser.id)) {
      const err = new Error('禁止伪造用户身份')
      err.status = 403
      throw err
    }
  }

  if ('username' in body) {
    const claimed = body.username
    if (claimed == null || !String(claimed).trim() || String(claimed).trim() !== String(authUser.username || '').trim()) {
      const err = new Error('禁止伪造用户身份')
      err.status = 403
      throw err
    }
  }

  if ('nickname' in body) {
    const claimed = body.nickname
    if (claimed == null || !String(claimed).trim() || String(claimed).trim() !== String(authUser.nickname || '').trim()) {
      const err = new Error('禁止伪造用户身份')
      err.status = 403
      throw err
    }
  }
}

function stampMessageAuthor(message, authUser) {
  if (!message || !authUser) return message
  message.userId = authUser.id
  message.username = authUser.username
  message.nickname = authUser.nickname || authUser.username
  message.avatarUrl = authUser.avatarUrl || message.avatarUrl || ''
  return message
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
    if (u.pathname.includes('/api/chat/multi-chat/music-stream')) return false
    return true
  } catch {
    return false
  }
}

function musicFetchHeaders(url) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'audio/*,*/*;q=0.8'
  }
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('163.com') || host.includes('126.net') || host.includes('126.com')) {
      headers.Referer = 'https://music.163.com/'
      headers.Origin = 'https://music.163.com'
    }
  } catch {
    // ignore
  }
  return headers
}

router.get('/chat/multi-chat/music-search', requireUser, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 1) return fail(res, 400, '请输入搜索关键词')
    if (q.length > 80) return fail(res, 400, '关键词过长')
    const list = await searchNeteaseMusic(q, 20)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 502, e.message || '音乐搜索失败')
  }
})

router.get('/chat/multi-chat/music-cover', requireUser, async (req, res) => {
  try {
    const raw = String(req.query.url || req.query.id || '').trim()
    const songId = extractNeteaseSongId(raw) || raw.replace(/\D/g, '')
    if (!songId) return fail(res, 400, '无效歌曲')
    const coverUrl = await resolveNeteaseCoverUrl(songId)
    if (!coverUrl) return fail(res, 502, '无法获取封面')
    return ok(res, { coverUrl })
  } catch (e) {
    return fail(res, 502, e.message || '获取封面失败')
  }
})

router.get('/chat/multi-chat/music-stream', requireUserOrQueryToken, async (req, res) => {
  try {
    const rawUrl = normalizeMusicUrl(req.query.url)
    if (!isSafeMusicUrl(rawUrl)) {
      return fail(res, 400, '无效的音乐链接')
    }
    let playUrl = rawUrl
    try {
      playUrl = await resolvePlayableMusicUrl(rawUrl)
    } catch (e) {
      return fail(res, 502, e.message || '无法解析播放地址')
    }
    if (!isSafeMusicUrl(playUrl)) {
      return fail(res, 502, '解析到的播放地址无效')
    }
    const headers = musicFetchHeaders(playUrl)
    if (req.headers.range) headers.Range = req.headers.range
    const upstream = await fetch(playUrl, {
      redirect: 'follow',
      headers
    })
    if (!upstream.ok) {
      return fail(res, 502, `音乐源返回 ${upstream.status}，请检查链接是否有效`)
    }
    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase()
    const looksLikeAudio =
      contentType.includes('audio') ||
      contentType.includes('octet-stream') ||
      contentType.includes('mpeg') ||
      contentType.includes('mp4') ||
      /\.(mp3|m4a|aac|ogg)(\?|$)/i.test(playUrl) ||
      /\.(mp3|m4a|aac|ogg)(\?|$)/i.test(String(upstream.url || ''))
    if (contentType.includes('text/html') || contentType.includes('application/json') || !looksLikeAudio) {
      return fail(res, 415, '链接不是可播放的音频，请换一首歌试试')
    }
    res.status(upstream.status === 206 ? 206 : 200)
    res.setHeader('Content-Type', contentType.split(';')[0] || 'audio/mpeg')
    res.setHeader('Cache-Control', 'private, max-age=120')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)
    const ranges = upstream.headers.get('accept-ranges')
    if (ranges) res.setHeader('Accept-Ranges', ranges)
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) res.setHeader('Content-Range', contentRange)
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res)
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.send(buf)
  } catch (e) {
    return fail(res, 500, e.message || '音乐加载失败')
  }
})

router.use(requireUser)

function messagePreview(message) {
  if (message.messageType === 'announcement') return '[群公告]'
  if (message.messageType === 'multi_chat_invite') return '[多人聊天]'
  if (message.messageType === 'draw_guess_invite') return '[你画我猜]'
  if (message.messageType === 'multi_chat_live') return '[直播]'
  if (message.messageType === 'chat_history') return '[聊天记录]'
  if (message.messageType === 'group_share') return '[群资料]'
  if (message.messageType === 'location') {
    try {
      const data = JSON.parse(String(message.content || ''))
      const title = String(data?.title || data?.name || '').trim()
      return title ? `[位置] ${title}` : '[位置]'
    } catch {
      return '[位置]'
    }
  }
  if (message.messageType === 'file') {
    const name = String(message.fileName || message.content || '').trim()
    if (name && !name.startsWith('{')) return `[文件] ${name}`
    return '[文件]'
  }
  if (message.messageType === 'photo_album') {
    try {
      const data = JSON.parse(String(message.content || ''))
      const n = Array.isArray(data?.urls) ? data.urls.length : 0
      return n > 0 ? `[图片]x${n}` : '[图片]'
    } catch {
      return '[图片]'
    }
  }
  if (message.messageType === 'video' || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(?:[?#]|$)/i.test(String(message.photoUrl || message.imageUrl || ''))) {
    return '[视频]'
  }
  if (message.messageType === 'ai') {
    const text = String(message.content || '').trim()
    if (!text) return '[AI]'
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  if (message.messageType === 'motion_photo') return '[实况图]'
  if (message.messageType === 'photo' || message.photoUrl) {
    const url = String(message.photoUrl || message.imageUrl || '')
    return /\.gif(?:[?#]|$)/i.test(url) ? '[GIF]' : '[图片]'
  }
  if (message.messageType === 'voice' || message.voiceUrl) return '[语音]'
  return message.content || ''
}

router.get('/friends', async (req, res) => {
  try {
    const list = await listFriends(req.user.userId)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载好友失败')
  }
})

router.get('/users/search', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    const list = await searchUsersForFriend(req.user.userId, req.query.q)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '搜索失败')
  }
})

router.get('/users/recommended', async (req, res) => {
  try {
    const list = await listRecommendedUsersForFriend(req.user.userId)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载推荐失败')
  }
})

router.post('/friends', async (req, res) => {
  try {
    const source = String(req.body?.source || '').trim()
    const targetUserId = Number(req.body?.targetUserId)
    if (targetUserId) {
      const result = await sendFriendRequest(req.user.userId, targetUserId, { source })
      await notifyFriendRequest(req.user.userId, targetUserId, result)
      return ok(res, result, result.message)
    }
    const query = String(req.body?.query || req.body?.chatNo || req.body?.username || '').trim()
    const result = await sendFriendRequestByQuery(req.user.userId, query)
    if (result.relationStatus === 'pending_sent' && result.friend?.id) {
      await notifyFriendRequest(req.user.userId, result.friend.id, result)
    }
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '申请失败')
  }
})

router.post('/friend/request', async (req, res) => {
  try {
    const targetUserId = Number(req.body?.targetUserId)
    if (!targetUserId) return fail(res, 400, '请指定用户')
    const source = String(req.body?.source || '').trim()
    const result = await sendFriendRequest(req.user.userId, targetUserId, { source })
    if (result.relationStatus === 'pending_sent') {
      await notifyFriendRequest(req.user.userId, targetUserId, result)
    }
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '申请失败')
  }
})

router.post('/friend/request/:requestId/respond', async (req, res) => {
  try {
    const requestId = Number(req.params.requestId)
    const action = String(req.body?.action || '').trim()
    const result = await respondFriendRequest(req.user.userId, requestId, action)
    await notifyFriendRequestResolved(req.user.userId, result)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '处理失败')
  }
})

router.get('/friend/status/:targetUserId', async (req, res) => {
  try {
    const targetUserId = Number(req.params.targetUserId)
    if (!targetUserId) return fail(res, 400, '无效的用户 ID')
    const status = await getFriendRelationStatus(req.user.userId, targetUserId)
    return ok(res, { status })
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

router.get('/users/:id/profile', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)
    if (!targetUserId) return fail(res, 400, '无效的用户 ID')
    const user = await getUserProfile(req.user.userId, targetUserId)
    return ok(res, { user })
  } catch (e) {
    return fail(res, 404, e.message || '用户不存在')
  }
})

router.post('/reports/photo', (req, res) => {
  uploadReportPhoto.single('photo')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传截图文件')
      const photoUrl = `${REPORT_IMAGE_URL_PREFIX}/${req.file.filename}`
      return ok(res, { photoUrl, filename: req.file.filename }, '截图上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传截图失败')
    }
  })
})

router.post('/reports', async (req, res) => {
  try {
    const result = await createUserReport(req.user.userId, {
      targetUserId: req.body?.targetUserId ?? req.body?.userId,
      momentId: req.body?.momentId,
      reason: req.body?.reason,
      detail: req.body?.detail ?? req.body?.content,
      imageUrl: req.body?.imageUrl ?? req.body?.photoUrl,
      imageUrls: req.body?.imageUrls ?? req.body?.photoUrls
    })
    if (result.notifyUserId) {
      notifyGroupMentionRecipients([result.notifyUserId])
    }
    return ok(res, { id: result.id }, result.message)
  } catch (e) {
    return fail(res, e.status || 400, e.message || '举报失败')
  }
})

router.get('/chat/gate-group/status', async (req, res) => {
  try {
    const status = await getGateGroupStatus(req.user.userId)
    return ok(res, status)
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

router.post('/chat/gate-group/enter', async (req, res) => {
  try {
    const result = await enterGateGroup(req.user.userId)
    if (result.welcomeMessage && result.conversation?.id) {
      await notifyNewMessage(result.conversation.id, null, result.welcomeMessage)
      await notifyConversationUpdate(result.conversation.id, messagePreview(result.welcomeMessage))
    }
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '进入失败')
  }
})

router.delete('/friend/:friendId', async (req, res) => {
  try {
    const friendId = Number(req.params.friendId)
    const result = await deleteFriendById(req.user.userId, friendId)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/notifications', async (req, res) => {
  try {
    const markRead = req.query.markRead === '1' || req.query.markRead === 'true'
    const markReadTypes = String(req.query.markReadTypes || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const list = await listNotifications(req.user.userId, {
      markRead,
      markReadTypes: markReadTypes.length ? markReadTypes : null
    })
    const counts = await getNotificationsUnreadCount(req.user.userId)
    return ok(res, { list, ...counts })
  } catch (e) {
    return fail(res, 500, e.message || '加载通知失败')
  }
})

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const counts = await getNotificationsUnreadCount(req.user.userId)
    return ok(res, counts)
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.post('/notifications/clear', async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim()
    const result = await clearNotificationsByType(req.user.userId, type)
    return ok(res, result, '已清除')
  } catch (e) {
    return fail(res, 400, e.message || '清除失败')
  }
})

router.post('/chat/group', async (req, res) => {
  try {
    const memberIds = req.body?.memberIds
    const name = req.body?.name || req.body?.groupName || ''
    const group = await createGroupChat(req.user.userId, memberIds, name)
    await notifyGroupCreated(group)
    // 兜底：部分端只监听 conversation-update，空预览会触发整表刷新
    try {
      await notifyConversationUpdate(group.id, '')
    } catch {
      /* ignore */
    }
    return ok(res, { group, conversation: group }, '创建成功')
  } catch (e) {
    const status = e.status || (/好友|至少/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '创建群聊失败')
  }
})

router.get('/conversations', async (req, res) => {
  try {
    const list = await listConversations(req.user.userId)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载会话失败')
  }
})

router.post('/conversations/direct', async (req, res) => {
  try {
    const peerUserId = Number(req.body?.peerUserId ?? req.body?.userId ?? 0)
    if (!peerUserId) return fail(res, 400, '无效的好友')
    const conversation = await getOrCreateDirectConversation(req.user.userId, peerUserId)
    return ok(res, { conversation })
  } catch (e) {
    const status = /好友|自己|不存在|不可用|无效/.test(e.message || '') ? 400 : 500
    return fail(res, status, e.message || '打开私聊失败')
  }
})

router.post('/conversations/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    await markConversationReadForUser(req.user.userId, id)
    return ok(res, { read: true })
  } catch (e) {
    const status = /无权|不存在|不在/.test(e.message || '') ? 403 : 500
    return fail(res, status, e.message || '标记已读失败')
  }
})

router.get('/conversations/:id/group', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    const group = await getGroupChatDetail(id, req.user.userId)
    group.drawGuessAvailable = isDrawGuessAllowedForConversation(id)
    const online = getOnlineUserIdSet()
    if (Array.isArray(group.members)) {
      group.members = group.members.map((m) => ({
        ...m,
        isOnline: !m.isAi && online.has(Number(m.id))
      }))
    }
    return ok(res, { group })
  } catch (e) {
    const status = /无权|不存在|不在/.test(e.message || '') ? 404 : 500
    return fail(res, status, e.message || '加载群信息失败')
  }
})

router.post('/chat/group/:id/quit', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const dissolve = req.body?.dissolve === true || req.body?.dissolve === 'true'
    const result = await quitGroupChat(id, req.user.userId, { dissolve })
    if (result.leaveMessage) {
      await notifyNewMessage(id, null, result.leaveMessage)
      await notifyConversationUpdate(id, messagePreview(result.leaveMessage))
    }
    if (result.dissolved && Array.isArray(result.memberIds)) {
      notifyGroupDissolved(id, result.memberIds)
    }
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|封禁|不在/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '操作失败')
  }
})

router.post('/chat/group/:id/members/:userId/admin', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const targetUserId = Number(req.params.userId)
    const isAdmin = req.body?.isAdmin !== undefined ? !!req.body.isAdmin : true
    if (!id || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await setGroupAdmin(id, req.user.userId, targetUserId, isAdmin)
    if (result.adminNoticeMessage) {
      await notifyNewMessage(id, null, result.adminNoticeMessage)
      await notifyConversationUpdate(id, messagePreview(result.adminNoticeMessage))
    }
    await notifyGroupAdminsUpdated(id, result.group)
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|封禁|不在|不能|无效/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.post('/chat/group/:id/members/:userId/kick', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const targetUserId = Number(req.params.userId)
    const blacklist = !!req.body?.blacklist
    if (!id || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await kickGroupMember(id, req.user.userId, targetUserId, { blacklist })
    if (result.leaveMessage) {
      await notifyNewMessage(id, null, result.leaveMessage)
      await notifyConversationUpdate(id, messagePreview(result.leaveMessage))
    }
    const afterLeave = leaveRoom(id, targetUserId)
    const sessionId = afterLeave?.ended?.sessionId || afterLeave?.room?.sessionId || ''
    await notifyGroupMemberKicked(targetUserId, id, { sessionId })
    if (afterLeave?.room) {
      await notifyGroupMultiChatRoomState(id, afterLeave.room)
    } else if (afterLeave?.ended) {
      await notifyGroupMultiChatClear(id, afterLeave.ended.sessionId)
    }
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|封禁|不在|不能/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '移除失败')
  }
})

router.post('/chat/group/:id/members/:userId/mute', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const targetUserId = Number(req.params.userId)
    const durationMinutes = Number(req.body?.durationMinutes)
    if (!id || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await muteGroupMember(id, req.user.userId, targetUserId, durationMinutes)
    if (result.muteMessage) {
      await notifyNewMessage(id, null, result.muteMessage)
      await notifyConversationUpdate(id, messagePreview(result.muteMessage))
    }
    await notifyGroupMemberMuted(targetUserId, id, { mutedUntil: result.mutedUntil })
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|封禁|不在|不能|禁言|时长/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '禁言失败')
  }
})

router.delete('/chat/group/:id/members/:userId/mute', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const targetUserId = Number(req.params.userId)
    if (!id || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await unmuteGroupMember(id, req.user.userId, targetUserId)
    if (result.unmuteMessage) {
      await notifyNewMessage(id, null, result.unmuteMessage)
      await notifyConversationUpdate(id, messagePreview(result.unmuteMessage))
    }
    await notifyGroupMemberMuted(targetUserId, id, { mutedUntil: null })
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|封禁|不在|不能|禁言|解除/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '解除禁言失败')
  }
})

router.get('/chat/group/:id/blacklist', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const list = await listGroupBlacklist(id, req.user.userId)
    return ok(res, { list })
  } catch (e) {
    const status = e.status || (/群主/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '加载黑名单失败')
  }
})

router.delete('/chat/group/:id/blacklist/:userId', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const targetUserId = Number(req.params.userId)
    if (!id || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await removeFromGroupBlacklist(id, req.user.userId, targetUserId)
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|不在/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '操作失败')
  }
})

router.get('/chat/group/:id/announcements', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const list = await getGroupAnnouncements(id, req.user.userId)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载公告失败')
  }
})

router.delete('/chat/group/:id/announcements/:messageId', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const messageId = Number(req.params.messageId)
    if (!id || !messageId) return fail(res, 400, '无效的参数')
    const result = await deleteGroupAnnouncement(id, req.user.userId, messageId)
    await notifyMessageUpdated(id, result.message)
    await notifyGroupAnnouncementUpdated(id, {
      announcement: result.announcement,
      announcementImage: result.announcementImage,
      announcementPinned: result.announcementPinned,
      announcementPinnedMessageId: result.announcementPinnedMessageId
    })
    return ok(res, result, '公告已删除')
  } catch (e) {
    const status = e.status || (/群主|无权|不存在|已删除/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '删除失败')
  }
})

router.put('/chat/group/:id/multi-chat/settings', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const group = await updateGroupMultiChatSettings(id, req.user.userId, {
      backgroundUrl: req.body?.backgroundUrl ?? req.body?.multiChatBackground,
      noticeText: req.body?.noticeText ?? req.body?.multiChatNotice,
      groupChatBackground: req.body?.groupChatBackground
    })
    await notifyGroupMultiChatSettingsUpdated(id, {
      multiChatBackground: group.multiChatBackground || '',
      multiChatNotice: group.multiChatNotice || '',
      groupChatBackground: group.groupChatBackground || ''
    })
    const room = syncRoomMultiChatSettings(id, {
      multiChatBackground: group.multiChatBackground || '',
      multiChatNotice: group.multiChatNotice || ''
    })
    if (room) await notifyGroupMultiChatRoomState(id, room)
    return ok(res, { group }, '已保存')
  } catch (e) {
    const status = e.status || (/群主|无效|最多/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '保存失败')
  }
})

router.put('/chat/group/:id/mute', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const muted = !!(req.body?.muted ?? req.body?.groupMuted)
    const result = await updateGroupMute(id, req.user.userId, muted)
    await notifyGroupMuteUpdated(id, result.groupMuted)
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|无权|不存在/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.put('/chat/group/:id/file-upload-policy', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const policy = req.body?.policy ?? req.body?.fileUploadPolicy ?? 'all'
    const result = await updateGroupFileUploadPolicy(id, req.user.userId, policy)
    await notifyGroupFileUploadPolicyUpdated(id, result.fileUploadPolicy)
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|管理|无权|不存在/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.put('/chat/group/:id/anti-screenshot', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const enabled = !!(req.body?.enabled ?? req.body?.antiScreenshot)
    const result = await updateGroupAntiScreenshot(id, req.user.userId, enabled)
    await notifyAntiScreenshotUpdated(id, {
      antiScreenshot: result.antiScreenshot,
      antiScreenshotActive: result.antiScreenshotActive,
      antiScreenshotSelf: result.antiScreenshot,
      antiScreenshotPeer: false,
      scope: 'group'
    })
    for (const tip of result.tipMessages || []) {
      await notifyNewMessage(id, null, tip)
    }
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|管理|无权|不存在/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.put('/chat/dm/:id/anti-screenshot', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    const enabled = !!(req.body?.enabled ?? req.body?.antiScreenshot)
    const result = await updateDmAntiScreenshot(id, req.user.userId, enabled)
    await notifyAntiScreenshotUpdated(id, {
      antiScreenshotSelf: result.antiScreenshotSelf,
      antiScreenshotPeer: result.antiScreenshotPeer,
      antiScreenshotActive: result.antiScreenshotActive,
      actorUserId: req.user.userId,
      scope: 'direct'
    })
    for (const tip of result.tipMessages || []) {
      await notifyNewMessage(id, null, tip)
    }
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/无权|不存在|仅私聊/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.put('/chat/group/:id/butler', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const result = await updateGroupButlerSettings(id, req.user.userId, {
      enabled: req.body?.enabled ?? req.body?.butlerEnabled,
      welcomeText: req.body?.welcomeText ?? req.body?.butlerWelcome,
      welcomeImageUrl: req.body?.welcomeImageUrl ?? req.body?.butlerWelcomeImage,
      leaveText: req.body?.leaveText ?? req.body?.butlerLeave
    })
    await notifyGroupButlerSettingsUpdated(id, {
      butlerEnabled: result.butlerEnabled,
      butlerWelcome: result.butlerWelcome,
      butlerWelcomeImage: result.butlerWelcomeImage,
      butlerLeave: result.butlerLeave
    })
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|无效|最多/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '保存失败')
  }
})

router.post('/chat/group/:id/butler/welcome-image', (req, res) => {
  uploadChatPhoto.single('photo')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      const id = Number(req.params.id)
      if (!id) return fail(res, 400, '无效的群 ID')
      if (!req.file) return fail(res, 400, '未上传图片文件')
      const imageUrl = `${CHAT_IMAGE_URL_PREFIX}/${req.file.filename}`
      const result = await updateGroupButlerWelcomeImage(id, req.user.userId, imageUrl)
      await notifyGroupButlerSettingsUpdated(id, {
        butlerWelcomeImage: result.butlerWelcomeImage
      })
      return ok(res, result, result.message)
    } catch (e) {
      const status = e.status || (/群主|无权|不存在|无效/.test(e.message || '') ? 403 : 500)
      return fail(res, status, e.message || '上传欢迎图片失败')
    }
  })
})

router.post('/chat/group/join', async (req, res) => {
  try {
    const groupCode = req.body?.groupCode ?? req.body?.code ?? ''
    const result = await requestJoinGroupByCode(req.user.userId, groupCode)
    if (result.relationStatus === 'pending_sent' && result.created) {
      const ownerId = Number(result.ownerId)
      if (ownerId) {
        await notifyGroupJoinRequest(req.user.userId, ownerId, result)
      }
    }
    return ok(res, result, result.message)
  } catch (e) {
    const status = /不存在|已在|封禁|无效/.test(e.message || '') ? 400 : 500
    return fail(res, status, e.message || '申请失败')
  }
})

router.post('/chat/group/join-request/:requestId/respond', async (req, res) => {
  try {
    const requestId = Number(req.params.requestId)
    const action = String(req.body?.action || '').trim()
    const result = await respondGroupJoinRequest(req.user.userId, requestId, action)
    if (result.relationStatus === 'accepted') {
      if (result.welcomeMessage) {
        await notifyNewMessage(result.conversation.id, null, result.welcomeMessage)
        await notifyConversationUpdate(result.conversation.id, messagePreview(result.welcomeMessage))
      }
    }
    await notifyGroupJoinRequestResolved(req.user.userId, result)
    return ok(res, result, result.message)
  } catch (e) {
    const status = /群主|无权|不存在|已处理/.test(e.message || '') ? 400 : 500
    return fail(res, status, e.message || '处理失败')
  }
})

router.get('/chat/group/search', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    const q = req.query.q ?? req.query.keyword ?? ''
    const list = await searchGroupsForJoin(req.user.userId, q)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '搜索失败')
  }
})

router.get('/chat/group/preview', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    const code = String(req.query.code || req.query.groupCode || '').trim()
    if (!code) return fail(res, 400, '请提供群号')
    const group = await getGroupProfilePreview(req.user.userId, code)
    return ok(res, { group })
  } catch (e) {
    const status = /不存在|无效/.test(e.message || '') ? 404 : 500
    return fail(res, status, e.message || '加载失败')
  }
})

router.post('/chat/group/:id/members', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const memberIds = req.body?.memberIds ?? req.body?.members ?? []
    const result = await addGroupMembers(id, req.user.userId, memberIds)
    for (const msg of result.welcomeMessages || []) {
      await notifyNewMessage(id, null, msg)
    }
    if (result.welcomeMessages?.length) {
      const last = result.welcomeMessages[result.welcomeMessages.length - 1]
      await notifyConversationUpdate(id, messagePreview(last))
    }
    return ok(res, result, '已添加成员')
  } catch (e) {
    const status = e.status || (/群主|好友|已在|请选择/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '添加失败')
  }
})

router.put('/chat/group/:id/announcement/pin', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const pinned = !!(req.body?.pinned ?? req.body?.announcementPinned)
    const messageId = Number(req.body?.messageId ?? req.body?.id ?? 0) || undefined
    const result = await updateGroupAnnouncementPin(id, req.user.userId, pinned, messageId)
    await notifyGroupAnnouncementUpdated(id, result)
    return ok(res, result, pinned ? '公告已置顶' : '已取消置顶')
  } catch (e) {
    const status = e.status || (/群主|无权|不存在|请先/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '设置失败')
  }
})

router.put('/chat/group/:id/announcement', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const announcement = req.body?.announcement ?? req.body?.content ?? ''
    const imageUrl = req.body?.imageUrl ?? req.body?.photoUrl ?? req.body?.announcementImage ?? ''
    const pinned = req.body?.pinned ?? req.body?.announcementPinned
    const messageId = Number(req.body?.messageId ?? req.body?.id ?? 0) || undefined
    const result = await updateGroupAnnouncement(
      id,
      req.user.userId,
      announcement,
      imageUrl,
      pinned === undefined ? undefined : !!pinned,
      messageId
    )
    if (result.chatMessage) {
      if (messageId) {
        await notifyMessageUpdated(id, result.chatMessage)
      } else {
        await notifyNewMessage(id, req.user.userId, result.chatMessage)
        await notifyConversationUpdate(id, messagePreview(result.chatMessage))
      }
    }
    await notifyGroupAnnouncementUpdated(id, {
      announcement: result.announcement,
      announcementImage: result.announcementImage,
      announcementPinned: result.announcementPinned,
      announcementPinnedMessageId: result.announcementPinnedMessageId
    })
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|无权|不存在|超过/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '发布失败')
  }
})

router.put('/chat/group/:id/name', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const name = req.body?.name ?? req.body?.title ?? ''
    const result = await updateGroupName(id, req.user.userId, name)
    await notifyGroupTitleUpdated(id, result.title)
    return ok(res, result, result.message)
  } catch (e) {
    const status = e.status || (/群主|无权|不存在|超过|不能为空/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '修改失败')
  }
})

router.put('/chat/group/:id/my-nickname', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的群 ID')
    const nickname = req.body?.nickname ?? req.body?.groupNickname ?? ''
    const result = await setMyGroupNickname(id, req.user.userId, nickname)
    await notifyGroupMemberNicknameUpdated(id, result)
    return ok(res, result, result.message)
  } catch (e) {
    const status =
      e.status ||
      (/无权|不存在|超过|敏感|违禁|不当/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '修改失败')
  }
})

router.post('/chat/group/:id/avatar', (_req, res) => {
  return fail(res, 403, '群头像由系统自动生成，不可更换')
})

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    const limit = Number(req.query.limit) || 50
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null
    const afterId = req.query.afterId ? Number(req.query.afterId) : null
    const result = await getMessages(id, req.user.userId, { limit, beforeId, afterId })
    if (!beforeId && !afterId) {
      await markConversationReadForUser(req.user.userId, id)
    }
    return ok(res, result)
  } catch (e) {
    const msg = e.message || '加载消息失败'
    const status = /无权|不存在|封禁/.test(msg) ? 403 : 500
    if (status === 500) console.error('[getMessages]', msg)
    return fail(res, status, msg)
  }
})

router.post('/chat/photo', (req, res) => {
  uploadChatPhoto.single('photo')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传照片文件')
      const photoUrl = `${CHAT_IMAGE_URL_PREFIX}/${req.file.filename}`
      return ok(res, {
        photoUrl,
        filename: req.file.filename
      }, '照片上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传照片失败')
    }
  })
})

router.post('/chat/video', (req, res) => {
  uploadChatVideo.single('video')(req, res, (err) => {
    if (err) {
      const msg = err.message || '上传失败'
      if (/File too large|LIMIT_FILE_SIZE/i.test(msg)) {
        return fail(res, 400, '单个视频不能超过 2GB')
      }
      return fail(res, 400, msg)
    }
    try {
      if (!req.file) return fail(res, 400, '未上传视频文件')
      const videoUrl = `${CHAT_VIDEO_URL_PREFIX}/${req.file.filename}`
      const duration = req.body?.duration ? parseFloat(req.body.duration) : 0
      return ok(res, {
        videoUrl,
        photoUrl: videoUrl,
        duration: Number.isFinite(duration) ? duration : 0,
        size: req.file.size || 0,
        filename: req.file.filename
      }, '视频上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传视频失败')
    }
  })
})

router.post('/chat/voice', (req, res) => {
  uploadChatVoice.single('voice')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传语音文件')
      const voiceUrl = `${VOICE_AUDIO_URL_PREFIX}/${req.file.filename}`
      const duration = req.body?.duration ? parseFloat(req.body.duration) : 0
      return ok(res, {
        voiceUrl,
        duration,
        filename: req.file.filename
      }, '语音上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传语音失败')
    }
  })
})

router.post('/chat/file', (req, res) => {
  uploadGroupFile.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.message || '上传失败'
      if (/File too large|LIMIT_FILE_SIZE/i.test(msg)) {
        return fail(res, 400, '单个文件不能超过 5GB')
      }
      return fail(res, 400, msg)
    }
    try {
      if (!req.file) return fail(res, 400, '未上传文件')
      const conversationId = Number(req.body?.conversationId || req.query?.conversationId || 0)
      if (!conversationId) {
        // 无会话则删除已落盘文件
        try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        return fail(res, 400, '缺少 conversationId')
      }
      await assertConversationMember(conversationId, req.user.userId)
      try {
        await assertGroupFileUploadAllowed(conversationId, req.user.userId)
      } catch (permErr) {
        try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        return fail(res, permErr.status || 403, permErr.message || '无权上传文件')
      }
      try {
        await assertGroupFileQuota(conversationId, req.file.size)
      } catch (quotaErr) {
        try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        return fail(res, 400, quotaErr.message || '空间不足')
      }
      const fromBody = decodeUploadFilename(
        String(req.body?.fileName || req.body?.filename || '').trim()
      )
      const fromMulter = decodeUploadFilename(req.file.originalname || '')
      const originalName = (fromBody || fromMulter || req.file.filename || '文件').slice(0, 255)
      const fileUrl = `${GROUP_FILE_URL_PREFIX}/${req.file.filename}`
      let fileSafety = 'unknown'
      try {
        fileSafety = scanFilePath(req.file.path, originalName).safety
      } catch {
        fileSafety = 'unknown'
      }
      return ok(res, {
        fileUrl,
        fileName: originalName,
        fileSize: req.file.size,
        filename: req.file.filename,
        fileSafety
      }, '文件上传成功')
    } catch (e) {
      try { if (req.file?.path) fs.unlinkSync(req.file.path) } catch { /* ignore */ }
      const status = /无权|不存在|封禁/.test(e.message || '') ? 403 : 500
      return fail(res, status, e.message || '上传文件失败')
    }
  })
})

router.get('/conversations/:id/files', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    const data = await listConversationFiles(id, req.user.userId, {
      query: req.query.q || req.query.query || ''
    })
    return ok(res, data)
  } catch (e) {
    const msg = e.message || '加载群文件失败'
    const status = /无权|不存在|封禁/.test(msg) ? 403 : 500
    return fail(res, status, msg)
  }
})

router.delete('/conversations/:id/files/:messageId', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const messageId = Number(req.params.messageId)
    if (!id || !messageId) return fail(res, 400, '无效的参数')
    const data = await deleteConversationFile(id, req.user.userId, messageId)
    return ok(res, data, '已删除群文件')
  } catch (e) {
    const msg = e.message || '删除群文件失败'
    const status = /无权|仅群主|不存在|封禁|不是群文件/.test(msg) ? 403 : 400
    return fail(res, status, msg)
  }
})

router.get('/chat/voice-to-text/status', (req, res) => {
  try {
    return ok(res, getVoiceToTextStatus(), 'ok')
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

/** 发送位置：高德服务是否已在后台配置 */
router.get('/location/status', (req, res) => {
  try {
    return ok(res, getAmapClientStatus(), 'ok')
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

/** 地点关键字搜索（Key 留在服务端） */
router.get('/location/places/search', async (req, res) => {
  try {
    const keyword = String(req.query.q || req.query.keyword || '').trim()
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    const city = String(req.query.city || '').trim()
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize || req.query.limit) || 20
    const around = String(req.query.around || '1') !== '0'
    const data = await searchAmapPlaces({
      keyword,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      city,
      page,
      pageSize,
      around
    })
    return ok(res, data, 'ok')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '地点搜索失败')
  }
})

/** 周边地点（可无关键字） */
router.get('/location/places/around', async (req, res) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    const keyword = String(req.query.q || req.query.keyword || '').trim()
    const radius = Number(req.query.radius) || 2000
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize || req.query.limit) || 25
    const data = await aroundAmapPlaces({
      lat,
      lng,
      keyword,
      radius,
      page,
      pageSize
    })
    return ok(res, data, 'ok')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '周边地点失败')
  }
})

/** 逆地理编码 */
router.get('/location/regeo', async (req, res) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    const data = await regeoAmap({ lat, lng })
    return ok(res, data, 'ok')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '逆地理失败')
  }
})

router.post('/chat/voice-to-text', (req, res) => {
  uploadVoiceToText.single('voice')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file?.buffer?.length) return fail(res, 400, '未上传语音文件')
      const text = await transcribeVoiceBuffer(req.file.buffer, {
        filename: req.file.originalname || req.file.filename || 'voice.wav',
        mime: req.file.mimetype || 'audio/wav'
      })
      return ok(res, { text }, '转写成功')
    } catch (e) {
      const status = Number(e?.status) || 500
      return fail(res, status, e.message || '语音转文字失败')
    }
  })
})

/** 文字合成语音：AI 以服务端该 bot 配置的音色为准（避免客户端缓存旧值） */
router.post('/chat/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim()
    if (!text) return fail(res, 400, '没有可合成的文字')
    if (text.length > 1200) return fail(res, 400, '文字过长')
    const isAi = !!(req.body?.isAi ?? req.body?.expressive)
    let voiceId = String(
      req.body?.voiceId || req.body?.voicePreset || req.body?.preset || ''
    ).trim()

    if (isAi) {
      const botId = Number(req.body?.botId || req.body?.aiBotId || 0)
      const conversationId = Number(req.body?.conversationId || 0)
      let serverVoice = ''
      if (botId > 0) {
        const bot = await getAiBotRecordById(botId)
        if (bot?.ttsVoiceId) serverVoice = String(bot.ttsVoiceId).trim()
      }
      if (!serverVoice && conversationId > 0) {
        const bot = await getGroupAiBotAssignment(conversationId)
        if (bot?.ttsVoiceId) serverVoice = String(bot.ttsVoiceId).trim()
      }
      // 服务端配置优先，保证与后台选择一致
      if (serverVoice) voiceId = serverVoice
    }

    const result = await synthesizeChatSpeech(text, {
      isAi,
      voiceId: voiceId || undefined
    })
    return ok(res, result, '合成成功')
  } catch (e) {
    return fail(res, 500, e.message || '语音合成失败')
  }
})

router.post('/conversations/:id/draw-guess/start', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')

    const group = await getGroupChatDetail(id, req.user.userId)
    if (!group.isOwner) return fail(res, 403, '仅群主可开启你画我猜')

    const user = await findUserById(req.user.userId)
    if (!user) return fail(res, 401, '请先登录')

    if (!getDrawGuessConfig().enabled) {
      return fail(res, 403, '你画我猜功能暂未开放')
    }
    assertDrawGuessAllowed(id)

    const maxPlayers = Number(req.body?.maxPlayers ?? req.body?.playerCount)
    const game = startDrawGuessGame(id, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatar_url || user.avatarUrl || ''
    }, maxPlayers)

    const inviteContent = buildDrawGuessInviteContent(game.sessionId, game.starterName, game.maxPlayers)
    const message = await sendMessage(
      id,
      req.user.userId,
      { type: 'draw_guess_invite', content: inviteContent },
      { allowSystemType: true }
    )
    await notifyNewMessage(id, req.user.userId, message)
    await notifyConversationUpdate(id, messagePreview(message))
    await notifyDrawGuessStarted(id, game)

    return ok(res, { game, message: { ...message, isSelf: true } })
  } catch (e) {
    const msg = e.message || '开启失败'
    const status = /未开放|暂未开放/.test(msg) ? 403 : /已在进行中|无效|无权|不存在/.test(msg) ? 400 : 500
    return fail(res, status, msg)
  }
})

router.get('/conversations/:id/draw-guess/leaderboard', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')
    if (!isDrawGuessAllowedForConversation(id)) {
      return ok(res, { list: [] })
    }
    const list = await getDrawGuessLeaderboard(id, req.user.userId, 100)
    return ok(res, { list })
  } catch (e) {
    const status = /无权|不存在|不在/.test(e.message || '') ? 404 : 500
    return fail(res, status, e.message || '加载排行榜失败')
  }
})

router.post('/conversations/:id/multi-chat/start', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')

    const group = await getGroupChatDetail(id, req.user.userId)
    if (!group.isOwner) return fail(res, 403, '仅群主可开启多人聊天')

    const user = await findUserById(req.user.userId)
    if (!user) return fail(res, 401, '请先登录')

    const room = startRoom(
      id,
      {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatar_url || user.avatarUrl || ''
      },
      {
        multiChatBackground: group.multiChatBackground || '',
        multiChatNotice: group.multiChatNotice || ''
      }
    )

    const inviteContent = buildInviteContent(room.sessionId, room.starterName, room.multiChatBackground)
    const message = await sendMessage(
      id,
      req.user.userId,
      { type: 'multi_chat_invite', content: inviteContent },
      { allowSystemType: true }
    )
    await notifyNewMessage(id, req.user.userId, message)
    await notifyConversationUpdate(id, messagePreview(message))

    await notifyGroupMultiChatStarted(id, room)

    return ok(res, { room, message: { ...message, isSelf: true } })
  } catch (e) {
    const status = /仅群主|已在进行中|无效/.test(e.message || '') ? 400 : 500
    return fail(res, status, e.message || '开启失败')
  }
})

const PUBLIC_VOICE_BG_PRESETS = [
  { id: 'voice-room', name: '语音房 1', url: '/media/Official Images/Voice Room.jpeg' },
  { id: 'voice-room-2', name: '语音房 2', url: '/media/Official Images/Voice Room2.jpeg' },
  { id: 'voice-room-3', name: '语音房 3', url: '/media/Official Images/Voice Room3.jpeg' },
  { id: 'voice-room-4', name: '语音房 4', url: '/media/Official Images/Voice Room4.jpeg' },
  { id: 'voice-room-5', name: '月夜', url: '/media/Official Images/Voice Room5.png' }
]

async function attachPublicVoiceSession(req, joinResult) {
  const convId = Number(joinResult.conversation?.id)
  if (!convId) throw new Error('加入失败')

  const user = await findUserById(req.user.userId)
  if (!user) throw new Error('请先登录')

  const ctx = await getPublicRoomMultiChatContext(convId)
  const owner = await findUserById(ctx?.ownerId)
  if (!owner) throw new Error('房间配置异常')

  const sessionUser = {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatar_url || user.avatarUrl || ''
  }
  const ownerUser = {
    id: owner.id,
    username: owner.username,
    nickname: owner.nickname,
    avatarUrl: owner.avatar_url || owner.avatarUrl || ''
  }
  const voiceSlotMode = String(ctx?.roomType || '').toLowerCase() === 'voice'
  const { room } = ensurePublicVoiceSession(convId, ownerUser, sessionUser, {
    voiceSlotMode,
    maxCapacity: ctx?.maxCapacity,
    multiChatBackground: ctx?.multiChatBg || joinResult.backgroundUrl || '',
    multiChatNotice: ctx?.multiChatNotice || ''
  })

  let activeRoom = room
  if (voiceSlotMode && room) {
    try {
      const synced = await syncRoomMicBans(convId)
      if (synced) activeRoom = synced
      const syncedRestrictions = await syncRoomRestrictions(convId)
      if (syncedRestrictions) activeRoom = syncedRestrictions
    } catch {
      // 同步禁麦失败不阻断进房
    }
    // 房间状态已在 HTTP 响应里返回；WS 广播异步发出以加快创建
    void notifyGroupMultiChatRoomState(convId, activeRoom).catch(() => {})
  }

  return { ...joinResult, room: activeRoom }
}

async function handleListPublicChatRooms(_req, res) {
  try {
    const list = await listPublicChatRoomsForUser()
    const enriched = await Promise.all(
      list.map(async (room) => {
        const slotPreview = await getVoiceSlotPreview(room.conversationId, 9)
        const hostId = Number(room.hostUserId) || 0
        const hostAvatar = await resolvePublicRoomHostAvatar(room)
        const slot0 = slotPreview[0]
        let hostMicOn = false
        let hostMicBanned = false
        if (slot0 && Number(slot0.userId) === hostId) {
          hostMicOn = !!slot0.micOn
          hostMicBanned = !!slot0.micBanned
        } else {
          const hostEntry = slotPreview.find(
            (item, idx) => item && Number(item.userId) === hostId && idx > 0
          )
          hostMicOn = !!hostEntry?.micOn
          hostMicBanned = !!hostEntry?.micBanned
        }
        slotPreview[0] = {
          userId: hostId,
          avatarUrl: hostAvatar,
          micOn: hostMicOn,
          micBanned: hostMicBanned
        }
        return { ...room, hostAvatarUrl: hostAvatar, slotPreview }
      })
    )
    return ok(res, { list: enriched })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
}

async function handleListPublicVoiceMeetingHistory(req, res) {
  try {
    const list = await listPublicVoiceMeetingHistory(req.user.userId)
    const enriched = await Promise.all(
      list.map(async (room) => {
        const hostAvatar = await resolvePublicRoomHostAvatar(room)
        return { ...room, hostAvatarUrl: hostAvatar || room.hostAvatarUrl }
      })
    )
    return ok(res, { list: enriched })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
}

function handlePublicVoicePresets(_req, res) {
  return ok(res, {
    backgrounds: PUBLIC_VOICE_BG_PRESETS,
    icons: [
      { id: 'group', name: '默认群头像', url: '/media/Official Images/avatar 2.png' },
      { id: 'official', name: '官方 Logo', url: '/media/Official Images/XhaMilAI.jpg' }
    ]
  })
}

async function handleCreatePublicChatRoom(req, res) {
  try {
    const { room: created, replaced } = await createUserPublicVoiceRoom(req.user.userId, req.body || {})
    if (replaced?.convId && replaced.sessionId) {
      await notifyGroupMultiChatClear(replaced.convId, replaced.sessionId)
    }
    const joinResult = await joinPublicChatRoom(req.user.userId, created.id, null)
    const payload = await attachPublicVoiceSession(req, joinResult)
    const message = replaced
      ? '已结束旧房间，新语音房已创建'
      : payload.message || joinResult.message || ''
    return ok(res, { ...payload, message, roomMeta: created, replacedPrevious: !!replaced })
  } catch (e) {
    const status = Number(e.status) || (/已有|无效/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '创建失败')
  }
}

async function handleLeavePublicChatRoom(req, res) {
  try {
    const conversationId = Number(req.body?.conversationId)
    if (!conversationId) return fail(res, 400, '无效的会话 ID')
    const result = await leavePublicChatRoomMember(req.user.userId, conversationId)
    if (result.deleted) {
      // archivePublicChatRoom 内已 forceEnd；若带回 sessionId 则广播清理
      const sessionId = result.sessionId || forceEndRoom(conversationId)?.sessionId
      if (sessionId) {
        await notifyGroupMultiChatClear(conversationId, sessionId)
      }
    }
    return ok(res, result)
  } catch (e) {
    return fail(res, 400, e.message || '离开失败')
  }
}

async function handleJoinPublicChatRoom(req, res) {
  try {
    const roomId = Number(req.params.id)
    if (!roomId) return fail(res, 400, '无效的房间 ID')

    const user = await findUserById(req.user.userId)
    if (!user) return fail(res, 401, '请先登录')

    const joinResult = await joinPublicChatRoom(req.user.userId, roomId, req.body?.password)
    const payload = await attachPublicVoiceSession(req, joinResult)
    return ok(res, payload)
  } catch (e) {
    const status = Number(e.status) || (/密码|已满|禁止|封禁/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '加入失败')
  }
}

async function handleEndMyEphemeralVoiceRoom(req, res) {
  try {
    const result = await endUserActiveEphemeralVoiceRoom(req.user.userId)
    if (result.ended && result.conversationId && result.sessionId) {
      await notifyGroupMultiChatClear(result.conversationId, result.sessionId)
    }
    return ok(res, result, result.message || '')
  } catch (e) {
    return fail(res, 400, e.message || '结束失败')
  }
}

async function handleBanPublicRoomMic(req, res) {
  try {
    const targetUserId = Number(req.params.userId)
    const conversationId = Number(req.body?.conversationId)
    const durationMinutes = Number(req.body?.durationMinutes || 24 * 60)
    if (!conversationId || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await banPublicRoomMic(conversationId, req.user.userId, targetUserId, durationMinutes)
    let room = applyParticipantMicBan(conversationId, targetUserId, true)
    if (room) await notifyGroupMultiChatRoomState(conversationId, room)
    return ok(res, { ...result, room }, '已禁言')
  } catch (e) {
    return fail(res, /房主|管理员|不能|不在|无效/.test(e.message || '') ? 400 : 500, e.message || '禁言失败')
  }
}

async function handleUnbanPublicRoomMic(req, res) {
  try {
    const targetUserId = Number(req.params.userId)
    const conversationId = Number(req.body?.conversationId)
    if (!conversationId || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await unbanPublicRoomMic(conversationId, req.user.userId, targetUserId)
    let room = applyParticipantMicBan(conversationId, targetUserId, false)
    if (room) await notifyGroupMultiChatRoomState(conversationId, room)
    return ok(res, { ...result, room }, '已解除禁言')
  } catch (e) {
    return fail(res, /房主|管理员|不能|不在|无效/.test(e.message || '') ? 400 : 500, e.message || '解除禁言失败')
  }
}

async function handleBanPublicRoomSlot(_req, res) {
  return fail(res, 400, '已取消禁止上麦，进房将自动上麦')
}

async function handleUnbanPublicRoomSlot(_req, res) {
  return fail(res, 400, '已取消禁止上麦')
}

async function handleKickPublicRoomMember(req, res) {
  try {
    const targetUserId = Number(req.params.userId)
    const conversationId = Number(req.body?.conversationId)
    const blacklist = !!req.body?.blacklist
    if (!conversationId || !targetUserId) return fail(res, 400, '无效的参数')
    const result = await kickGroupMember(conversationId, req.user.userId, targetUserId, { blacklist })
    if (result.leaveMessage) {
      await notifyNewMessage(conversationId, null, result.leaveMessage)
      await notifyConversationUpdate(conversationId, messagePreview(result.leaveMessage))
    }
    const afterLeave = leaveRoom(conversationId, targetUserId)
    const sessionId = afterLeave?.ended?.sessionId || afterLeave?.room?.sessionId || ''
    await notifyGroupMemberKicked(targetUserId, conversationId, { sessionId })
    const room = afterLeave?.room ?? null
    if (room) {
      await notifyGroupMultiChatRoomState(conversationId, room)
    } else if (afterLeave?.ended) {
      await notifyGroupMultiChatClear(conversationId, afterLeave.ended.sessionId)
    }
    return ok(res, { ...result, room }, result.message)
  } catch (e) {
    return fail(res, /群主|房主|管理员|不能|不在|无效|封禁/.test(e.message || '') ? 400 : 500, e.message || '移除失败')
  }
}

for (const prefix of ['/chat/public-rooms', '/public-chat-rooms']) {
  router.get(prefix, handleListPublicChatRooms)
  router.get(`${prefix}/presets`, handlePublicVoicePresets)
  router.get(`${prefix}/history`, handleListPublicVoiceMeetingHistory)
  router.post(`${prefix}/create`, handleCreatePublicChatRoom)
  router.post(`${prefix}/end-mine`, handleEndMyEphemeralVoiceRoom)
  router.post(`${prefix}/leave`, handleLeavePublicChatRoom)
  router.post(`${prefix}/:id/join`, handleJoinPublicChatRoom)
  router.post(`${prefix}/members/:userId/mic-ban`, handleBanPublicRoomMic)
  router.delete(`${prefix}/members/:userId/mic-ban`, handleUnbanPublicRoomMic)
  router.post(`${prefix}/members/:userId/slot-ban`, handleBanPublicRoomSlot)
  router.delete(`${prefix}/members/:userId/slot-ban`, handleUnbanPublicRoomSlot)
  router.post(`${prefix}/members/:userId/kick`, handleKickPublicRoomMember)
}

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的会话 ID')

    const authUser = req.authUser || { id: req.user.userId }
    assertNoSpoofedIdentityFields(req.body, authUser)
    assertMessageSendRate(authUser.id, id)
    const payload = parseUserMessagePayload(req.body)

    const message = await sendMessage(id, authUser.id, payload)
    stampMessageAuthor(message, authUser)
    const msgType = String(message.messageType || message.type || 'text').toLowerCase()
    const rawContent = String(payload.content ?? payload.text ?? '').trim()
    let mentionedUserIds = []
    if (msgType === 'text' && message.content) {
      mentionedUserIds = await notifyGroupMentionsForMessage(
        id,
        authUser.id,
        message.content
      )
    }
    await notifyNewMessage(id, authUser.id, message, mentionedUserIds)
    if (mentionedUserIds.length) {
      notifyGroupMentionRecipients(mentionedUserIds, {
        conversationId: id,
        fromName: message.nickname || message.username || '',
        messageId: message.id
      })
    }
    await notifyConversationUpdate(id, messagePreview(message))

    const violation = await handleGroupBannedWordViolation(
      id,
      authUser.id,
      rawContent,
      msgType
    )
    if (violation?.butlerMessage) {
      const butlerMentioned = await notifyGroupMentionsForMessage(
        id,
        null,
        violation.butlerMessage.content
      )
      await notifyNewMessage(id, null, violation.butlerMessage, butlerMentioned)
      if (butlerMentioned.length) {
        notifyGroupMentionRecipients(butlerMentioned, {
          conversationId: id,
          fromName: violation.butlerMessage?.nickname || violation.butlerMessage?.username || '',
          messageId: violation.butlerMessage?.id || 0
        })
      }
      await notifyConversationUpdate(id, messagePreview(violation.butlerMessage))
      if (violation.action === 'mute' && violation.mutedUntil && violation.mentionedUserId) {
        await notifyGroupMemberMuted(violation.mentionedUserId, id, {
          mutedUntil: violation.mutedUntil
        })
      }
    }

    void triggerGroupAiReply(id, authUser.id, message)
      .then(async (aiMessage) => {
        if (!aiMessage) return
        await notifyGroupAiMessage(id, aiMessage)
        await notifyConversationUpdate(id, messagePreview(aiMessage))
      })
      .catch((err) => {
        console.error('[group-ai-bot]', err.message || err)
      })

    return ok(res, { message: { ...message, isSelf: true } })
  } catch (e) {
    const status = e.status || (/不能为空|无效|HTML|脚本/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '发送失败')
  }
})

router.delete('/conversations/:id/messages/:messageId', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const messageId = Number(req.params.messageId)
    if (!id || !messageId) return fail(res, 400, '无效的参数')

    const result = await recallMessage(id, req.user.userId, messageId)
    await notifyMessageUpdated(id, result.message)
    await notifyConversationUpdate(id, result.lastMessage)
    return ok(res, {
      message: result.message,
      lastMessage: result.lastMessage
    }, '已撤回')
  } catch (e) {
    const status = Number(e.status) || (/不存在|无效|已撤回|只能撤回|不支持|超过/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '撤回失败')
  }
})

router.get('/moments/feed', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30
    const beforeId = Number(req.query.beforeId) || 0
    const list = await listMomentsFeed(req.user.userId, { limit, beforeId })
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载说说失败')
  }
})

router.get('/moments/user/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    if (!userId) return fail(res, 400, '无效的用户')
    const limit = Number(req.query.limit) || 30
    const beforeId = Number(req.query.beforeId) || 0
    const list = await listUserMoments(req.user.userId, userId, { limit, beforeId })
    return ok(res, { list, userId })
  } catch (e) {
    const status = Number(e.status) || (/好友/.test(e.message || '') ? 403 : 500)
    return fail(res, status, e.message || '加载说说失败')
  }
})

router.post('/moments/photo', (req, res) => {
  uploadMomentPhoto.single('photo')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传照片文件')
      const photoUrl = `${MOMENTS_IMAGE_URL_PREFIX}/${encodeURIComponent(req.file.filename)}`
      return ok(res, { photoUrl, filename: req.file.filename }, '照片上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传照片失败')
    }
  })
})

router.post('/moments/video', (req, res) => {
  uploadMomentVideo.single('video')(req, res, (err) => {
    if (err) {
      const msg = err.message || '上传失败'
      if (/File too large|LIMIT_FILE_SIZE/i.test(msg)) {
        return fail(res, 400, '单个视频不能超过 2GB')
      }
      return fail(res, 400, msg)
    }
    try {
      if (!req.file) return fail(res, 400, '未上传视频文件')
      const duration = req.body?.duration ? parseFloat(req.body.duration) : 0
      const safeDuration = Number.isFinite(duration) ? duration : 0
      if (safeDuration > MOMENTS_VIDEO_MAX_DURATION_SEC) {
        try {
          fs.unlinkSync(req.file.path)
        } catch {
          // ignore
        }
        return fail(res, 400, '视频不能超过 2 分钟')
      }
      const videoUrl = `${MOMENTS_VIDEO_URL_PREFIX}/${encodeURIComponent(req.file.filename)}`
      return ok(
        res,
        {
          videoUrl,
          photoUrl: videoUrl,
          duration: safeDuration,
          size: req.file.size || 0,
          filename: req.file.filename
        },
        '视频上传成功'
      )
    } catch (e) {
      return fail(res, 500, e.message || '上传视频失败')
    }
  })
})

router.post('/moments', async (req, res) => {
  try {
    const moment = await createMoment(req.user.userId, {
      content: req.body?.content,
      images: req.body?.images,
      media: req.body?.media,
      mentionUserIds: req.body?.mentionUserIds,
      visibility: req.body?.visibility
    })
    const mentioned = Array.isArray(moment.mentionedUserIds) ? moment.mentionedUserIds : []
    if (mentioned.length) notifyGroupMentionRecipients(mentioned)
    return ok(res, { moment }, '发表成功')
  } catch (e) {
    const status =
      Number(e.status) ||
      (/禁止发布说说|限制发布说说/.test(e.message || '')
        ? 403
        : /不能为空|过长|填写|HTML|脚本|无效|超过|分钟/.test(e.message || '')
          ? 400
          : 500)
    return fail(res, status, e.message || '发表失败')
  }
})

router.delete('/moments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const result = await deleteMoment(req.user.userId, id)
    return ok(res, result, '已删除')
  } catch (e) {
    const status = Number(e.status) || (/不存在|只能删除/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '删除失败')
  }
})

router.post('/moments/:id/like', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const result = await toggleMomentLike(req.user.userId, id)
    return ok(res, result, result.liked ? '已点赞' : '已取消点赞')
  } catch (e) {
    const status = Number(e.status) || (/不存在|好友|无效/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '点赞失败')
  }
})

router.post('/moments/:id/comments', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const comment = await createMomentComment(req.user.userId, id, {
      content: req.body?.content,
      replyToUserId: req.body?.replyToUserId
    })
    return ok(res, { comment }, '评论成功')
  } catch (e) {
    const status = Number(e.status) || (/不能为空|过长|不存在|好友|HTML|脚本|无效/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '评论失败')
  }
})

router.delete('/moments/comments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const result = await deleteMomentComment(req.user.userId, id)
    return ok(res, result, '已删除评论')
  } catch (e) {
    const status = Number(e.status) || (/不存在|无权/.test(e.message || '') ? 400 : 500)
    return fail(res, status, e.message || '删除评论失败')
  }
})

export default router
