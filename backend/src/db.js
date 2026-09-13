import mysql from 'mysql2/promise'
import crypto from 'crypto'
import { loadConfig, saveConfig, DEFAULT_AVATAR_URL, LEGACY_DEFAULT_AVATAR_URL, DEFAULT_GROUP_AVATAR_URL, LEGACY_GROUP_AVATAR_URL, DEFAULT_AVATAR_FRAME_URL, LEGACY_DEFAULT_AVATAR_FRAME_URL, AVATAR_FRAME_DIR, AVATAR_FRAME_URL_PREFIX, DEFAULT_AVATAR_FRAME_FILENAME, canonicalizeAvatarFrameUrl, encodeMediaPathUrl, normalizeAvatarUrl, normalizeGroupAvatarUrl, avatarMediaFileExists, isAllowedUserPhotoUrl, isAllowedUserVideoUrl, isAllowedUserFileUrl, isAllowedExternalStickerUrl, pickRandomDefaultAvatarUrl, pickDefaultAvatarUrlForSeed, GROUP_FILE_QUOTA_BYTES, GROUP_FILE_MAX_BYTES, GROUP_FILE_RETENTION_MS, GROUP_FILE_RETENTION_DAYS, DIRECT_FILE_RETENTION_MS, DIRECT_FILE_RETENTION_DAYS, GROUP_FILE_URL_PREFIX } from './config.js'
import { ensureLocalExternalSticker } from './stickerCache.js'
import { hashPassword, verifyPassword } from './userAuth.js'
import { normalizeAvatarPath, safeDeleteAvatarFile, listAvatarFiles, deleteAvatarFileForAdmin } from './avatar.js'
import {
  composeGroupMosaicToFile,
  isAutoManagedGroupAvatar,
  isGroupMosaicAvatar,
  isPlaceholderGroupAvatar,
  mosaicAvatarUrlForGroup,
  mosaicLocalPathForGroup
} from './groupAvatarMosaic.js'
import { deleteChatPhoto } from './chatPhotos.js'
import { deleteMomentsPhotosByUrls } from './momentsPhotos.js'
import { deleteMomentsVideoByUrl } from './momentsVideos.js'
import {
  BUTLER_NAME,
  DEFAULT_BUTLER_WELCOME,
  DEFAULT_BUTLER_LEAVE,
  formatButlerWelcome,
  formatButlerLeaveNotice,
  formatButlerMemberMuteNotice,
  formatButlerMemberUnmuteNotice,
  formatButlerMemberSetAdminNotice,
  formatButlerMemberRemoveAdminNotice,
  formatButlerBannedWordWarning,
  formatButlerBannedWordSystemMuteNotice,
  formatButlerAiAssignedNotice,
  formatMuteDurationLabel,
  mapButlerMessageRow
} from './groupButler.js'
import {
  mapAiMessageRow,
  isBotMentioned,
  stripBotMentions,
  callAiChatCompletion,
  excludeCurrentUserFromHistory,
  maskApiKey,
  parseMentionNames,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  normalizeDeepseekModel,
  normalizeDeepseekBaseUrl,
  normalizeReplyDelayRange,
  resolveReplyDelayMs,
  sleep
} from './groupAiBot.js'
import { normalizeTtsVoiceId, voiceLabelById } from './voiceCatalog.js'
import {
  GROUP_CODE_MAX_LENGTH,
  adminNumericFormatError,
  generateRandomChatNoValue,
  generateRandomGroupCodeDigits,
  groupCodeFormatError,
  isAdminNumericCode,
  isValidGroupCode
} from './idCodes.js'
import { resolveMentionedUserIdsFromMembers } from './groupMentions.js'
import { resolveIpCity, resolveIpMeta } from './ipLocation.js'
import fs from 'fs'
import path from 'path'
import { CHAT_IMAGE_DIR, CHAT_IMAGE_URL_PREFIX, REPORT_IMAGE_URL_PREFIX } from './config.js'
import {
  decodeUploadFilename,
  deleteGroupFileOnDisk,
  groupFileUrlToFilename,
  groupFileUrlVariants,
  listGroupFilesOnDisk
} from './groupFiles.js'
import { normalizeFileSafety, scanGroupFileUrl } from './fileSafety.js'
import {
  maskMessageContent,
  maskBannedWords,
  containsBannedWords,
  findMatchedBannedWords,
  getBannedWordsConfig,
  shouldMaskMessageType
} from './bannedWords.js'
import { findSmartMatchedWords, getSmartDetectMeta, getSmartDetectWords } from './smartContentDetect.js'
import {
  assertNoXssPayload,
  assertChatMessageContent,
  assertUserDisplayName,
  assertGroupDisplayName
} from './xssGuard.js'
import { assertAllowedRegisterUsername } from './registerRateLimit.js'
import {
  assertUserRestrictionAllowed,
  getUserRestrictions,
  removeUserRestrictions,
  setUserRestrictions,
  setPostMomentBan,
  setChatMuteBan,
  formatUntilLabel
} from './userRestrictions.js'
import { buildBrowserInsights, detectBrowserKey } from './browserDetect.js'

let mysqlPool = null
let activeConfig = null
let connectPromise = null

export const BUSINESS_TABLES = [
  'users',
  'conversations',
  'conversation_members',
  'messages',
  'friendships',
  'friend_requests',
  'group_join_requests',
  'group_blacklist',
  'notifications',
  'ai_bots',
  'group_ai_bots',
  'public_chat_rooms',
  'public_chat_room_admins',
  'public_chat_room_mic_bans',
  'public_chat_room_member_restrictions',
  'moments',
  'moment_likes',
  'moment_comments',
  'user_reports',
  'draw_guess_group_scores',
  'avatar_frames',
  'avatar_frame_activation_codes',
  'user_avatar_frames',
  'chat_bubbles',
  'bubble_activation_codes',
  'user_chat_bubbles'
]

const BUSINESS_TABLE_DESCRIPTIONS = {
  users: '用户账号',
  conversations: '聊天会话',
  conversation_members: '会话成员',
  messages: '聊天消息',
  friendships: '好友关系',
  friend_requests: '好友申请',
  group_join_requests: '入群申请',
  group_blacklist: '群黑名单',
  notifications: '系统通知',
  ai_bots: 'AI 机器人',
  group_ai_bots: '群 AI 机器人',
  public_chat_rooms: '公共聊天室',
  public_chat_room_admins: '聊天室管理员',
  public_chat_room_mic_bans: '聊天室禁麦',
  public_chat_room_member_restrictions: '聊天室成员限制',
  moments: '说说动态',
  moment_likes: '说说点赞',
  moment_comments: '说说评论',
  user_reports: '用户举报',
  draw_guess_group_scores: '你画我猜积分',
  avatar_frames: '头像框目录',
  avatar_frame_activation_codes: '头像框激活码',
  user_avatar_frames: '用户已解锁头像框',
  chat_bubbles: '聊天气泡目录',
  bubble_activation_codes: '气泡激活码',
  user_chat_bubbles: '用户已解锁气泡'
}

const MYSQL_CREATE = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_no BIGINT UNSIGNED NULL DEFAULT NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  nickname VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  avatar_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  last_message VARCHAR(500) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_cm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friendships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  friend_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_friendship (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_friend_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friend_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_user_id INT NOT NULL,
  to_user_id INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fr_to_status (to_user_id, status),
  INDEX idx_fr_from_status (from_user_id, status),
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL DEFAULT '',
  content VARCHAR(500) NOT NULL DEFAULT '',
  related_id INT NULL,
  actor_user_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  image_url TEXT NULL,
  voice_url TEXT NULL,
  voice_duration DOUBLE NULL DEFAULT NULL,
  is_self TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_messages_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

function isMysqlConfigured(dbCfg = loadConfig().database) {
  return !!(dbCfg?.type === 'mysql' && dbCfg.host && dbCfg.user && dbCfg.database)
}

function createPool(dbCfg) {
  return mysql.createPool({
    host: dbCfg.host || '127.0.0.1',
    port: Number(dbCfg.port || 3306),
    user: dbCfg.user || 'root',
    password: dbCfg.password || '',
    database: dbCfg.database,
    charset: dbCfg.charset || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // 远程库空闲连接易被掐断，短空闲回收后按需重建
    idleTimeout: 30000,
    maxIdle: 5
  })
}

async function runCreateStatements(pool) {
  await assertMysqlSchemaCompatible(pool)
  const statements = MYSQL_CREATE.split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const sql of statements) {
    await pool.query(sql)
  }
  await migrateUsersTable(pool)
  await migrateMessagesTable(pool)
  await backfillFileSafety(pool)
  await migrateConversationsTable(pool)
  await migrateFriendSocialTables(pool)
  await migrateAiBotTables(pool)
  await migrateConversationMembersTable(pool)
  await migrateGroupBlacklistTable(pool)
  await migrateDrawGuessScoresTable(pool)
  await migratePublicChatRoomsTable(pool)
  await migrateAvatars(pool)
  await migrateAvatarFramesTable(pool)
  await migrateChatBubblesTable(pool)
  await migrateMomentsTable(pool)
  await migrateUserReportsTable(pool)
}

/** 拒绝接入与当前业务不兼容的旧库（例如社区/帖子项目） */
async function assertMysqlSchemaCompatible(pool) {
  const [tables] = await pool.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`
  )
  const names = new Set(tables.map((r) => String(r.name || '').toLowerCase()))
  if (!names.has('users')) return

  const [idCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'id'")
  const idType = String(idCols[0]?.Type || '').toLowerCase()
  if (idType && !idType.startsWith('int') && !idType.startsWith('bigint')) {
    throw new Error(
      '当前数据库 users.id 不是整数，与 XhaMil Chat 不兼容。请在 MySQL 新建一个空库后再填写到后台，不要复用旧社区/帖子项目的库。'
    )
  }

  // 旧社区特征表存在、且缺少本项目会话成员表时，基本可判定为错库
  const legacyMarks = ['posts', 'chat_messages', 'follows', 'post_likes'].filter((t) =>
    names.has(t)
  )
  const hasChatCore = names.has('conversation_members') || names.has('messages')
  if (legacyMarks.length >= 2 && !hasChatCore) {
    throw new Error(
      `检测到旧项目表（${legacyMarks.join('、')}），与 XhaMil Chat 结构冲突。请新建空数据库后重新配置。`
    )
  }
}

async function migrateUserReportsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_id INT NOT NULL,
      target_user_id INT NOT NULL,
      reason VARCHAR(64) NOT NULL,
      detail VARCHAR(1000) NOT NULL DEFAULT '',
      images_json TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      admin_note VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      handled_at DATETIME NULL DEFAULT NULL,
      INDEX idx_user_reports_created (created_at),
      INDEX idx_user_reports_target (target_user_id, created_at),
      INDEX idx_user_reports_status (status, created_at),
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [imagesCol] = await pool.query('SHOW COLUMNS FROM user_reports LIKE ?', ['images_json'])
  if (imagesCol.length === 0) {
    await pool.query('ALTER TABLE user_reports ADD COLUMN images_json TEXT NULL AFTER detail')
  }
  const [momentCol] = await pool.query('SHOW COLUMNS FROM user_reports LIKE ?', ['moment_id'])
  if (momentCol.length === 0) {
    await pool.query('ALTER TABLE user_reports ADD COLUMN moment_id INT NULL AFTER target_user_id')
    await pool.query('ALTER TABLE user_reports ADD INDEX idx_user_reports_moment (moment_id)')
  }
  await cleanupSystemAdminAccount(pool)
}

async function cleanupSystemAdminAccount(pool) {
  const [rows] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [
    '__system_admin__'
  ])
  const adminId = Number(rows[0]?.id)
  if (!adminId) return
  const [convs] = await pool.query(
    `SELECT DISTINCT c.id
     FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
     WHERE c.conv_type IS NULL OR c.conv_type = 'direct'`,
    [adminId]
  )
  const ids = convs.map((row) => Number(row.id)).filter(Boolean)
  if (ids.length) {
    await pool.query('DELETE FROM messages WHERE conversation_id IN (?)', [ids])
    await pool.query('DELETE FROM conversation_members WHERE conversation_id IN (?)', [ids])
    await pool.query('DELETE FROM conversations WHERE id IN (?)', [ids])
  }
  await pool.query('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', [adminId, adminId])
  await pool.query(
    'DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?',
    [adminId, adminId]
  )
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [adminId])
  } catch (e) {
    console.warn('[cleanup-system-admin]', e?.message || e)
  }
}

async function migrateMomentsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS moments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      content TEXT NOT NULL,
      images_json TEXT NOT NULL,
      visibility VARCHAR(16) NOT NULL DEFAULT 'friends',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_moments_user_created (user_id, created_at),
      INDEX idx_moments_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS moment_likes (
      moment_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (moment_id, user_id),
      INDEX idx_moment_likes_user (user_id),
      FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS moment_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      moment_id INT NOT NULL,
      user_id INT NOT NULL,
      content VARCHAR(500) NOT NULL,
      reply_to_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_moment_comments_moment (moment_id, id),
      FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function migratePublicChatRoomsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_chat_rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(96) NOT NULL DEFAULT '多人聊天',
      entry_hint VARCHAR(64) NOT NULL DEFAULT '点击进入',
      room_type VARCHAR(16) NOT NULL DEFAULT 'chat',
      background_url VARCHAR(512) NOT NULL DEFAULT '',
      icon_url VARCHAR(512) NULL DEFAULT NULL,
      password_hash VARCHAR(255) NULL DEFAULT NULL,
      conversation_id INT NOT NULL,
      max_capacity INT NOT NULL DEFAULT 6,
      sort_order INT NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pcr_conv (conversation_id),
      INDEX idx_pcr_enabled_sort (enabled, sort_order, id),
      INDEX idx_pcr_room_type (room_type, enabled, sort_order),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [roomTypeCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['room_type'])
  if (roomTypeCol.length === 0) {
    await pool.query(
      "ALTER TABLE public_chat_rooms ADD COLUMN room_type VARCHAR(16) NOT NULL DEFAULT 'chat' AFTER entry_hint"
    )
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD INDEX idx_pcr_room_type (room_type, enabled, sort_order)'
    ).catch(() => {})
  }
  const [pwdHashCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['password_hash'])
  if (pwdHashCol.length > 0) {
    const colType = String(pwdHashCol[0].Type || '')
    const sizeMatch = colType.match(/varchar\((\d+)\)/i)
    if (sizeMatch && Number(sizeMatch[1]) < 255) {
      await pool.query(
        'ALTER TABLE public_chat_rooms MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL'
      )
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_chat_room_admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pcra_room_user (room_id, user_id),
      INDEX idx_pcra_room (room_id),
      INDEX idx_pcra_user (user_id),
      FOREIGN KEY (room_id) REFERENCES public_chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(
    "UPDATE public_chat_rooms SET max_capacity = 20 WHERE room_type = 'voice' AND max_capacity <= 6"
  ).catch(() => {})
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_chat_room_mic_bans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      user_id INT NOT NULL,
      banned_until DATETIME NOT NULL,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pcrmb_room_user (room_id, user_id),
      INDEX idx_pcrmb_until (banned_until),
      FOREIGN KEY (room_id) REFERENCES public_chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_chat_room_member_restrictions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      user_id INT NOT NULL,
      chat_banned TINYINT(1) NOT NULL DEFAULT 0,
      banned_until DATETIME NOT NULL,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pcrmr_room_user (room_id, user_id),
      INDEX idx_pcrmr_until (banned_until),
      FOREIGN KEY (room_id) REFERENCES public_chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [creatorCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['creator_user_id'])
  if (creatorCol.length === 0) {
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD COLUMN creator_user_id INT NULL DEFAULT NULL AFTER enabled'
    ).catch(() => {})
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD INDEX idx_pcr_creator (creator_user_id, is_ephemeral, enabled)'
    ).catch(() => {})
  }
  const [ephemeralCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['is_ephemeral'])
  if (ephemeralCol.length === 0) {
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD COLUMN is_ephemeral TINYINT(1) NOT NULL DEFAULT 0 AFTER creator_user_id'
    ).catch(() => {})
  }
  const [roomCodeCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['room_code'])
  if (roomCodeCol.length === 0) {
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD COLUMN room_code VARCHAR(5) NULL DEFAULT NULL AFTER conversation_id'
    ).catch(() => {})
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD UNIQUE KEY uk_pcr_room_code (room_code)'
    ).catch(() => {})
  }
  const [endedAtCol] = await pool.query('SHOW COLUMNS FROM public_chat_rooms LIKE ?', ['ended_at'])
  if (endedAtCol.length === 0) {
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD COLUMN ended_at DATETIME NULL DEFAULT NULL AFTER updated_at'
    ).catch(() => {})
    await pool.query(
      'ALTER TABLE public_chat_rooms ADD INDEX idx_pcr_ended (ended_at)'
    ).catch(() => {})
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_voice_meeting_visits (
      room_id INT NOT NULL,
      user_id INT NOT NULL,
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id),
      INDEX idx_pvmv_user (user_id, joined_at),
      FOREIGN KEY (room_id) REFERENCES public_chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await backfillPublicVoiceRoomCodes(pool)
}

async function backfillPublicVoiceRoomCodes(pool) {
  const { generateRandomVoiceRoomCode, isValidVoiceRoomCode } = await import('./idCodes.js')
  const [rows] = await pool.query(
    `SELECT id, room_code FROM public_chat_rooms
     WHERE room_code IS NULL OR room_code = '' OR CHAR_LENGTH(room_code) <> 5`
  )
  for (const row of rows) {
    let code = ''
    for (let i = 0; i < 40; i++) {
      const candidate = generateRandomVoiceRoomCode()
      if (!isValidVoiceRoomCode(candidate)) continue
      const [hit] = await pool.query(
        'SELECT id FROM public_chat_rooms WHERE room_code = ? AND id <> ? LIMIT 1',
        [candidate, Number(row.id)]
      )
      if (!hit.length) {
        code = candidate
        break
      }
    }
    if (!code) continue
    await pool.query('UPDATE public_chat_rooms SET room_code = ? WHERE id = ?', [code, Number(row.id)])
  }
}

async function migrateDrawGuessScoresTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draw_guess_group_scores (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      total_score INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id, user_id),
      INDEX idx_dg_scores_conv (conversation_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function migrateGroupBlacklistTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_blacklist (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id, user_id),
      INDEX idx_gb_user (user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function migrateConversationMembersTable(pool) {
  const [mutedUntilCol] = await pool.query('SHOW COLUMNS FROM conversation_members LIKE ?', [
    'muted_until'
  ])
  if (mutedUntilCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN muted_until DATETIME NULL DEFAULT NULL AFTER joined_at'
    )
  }
  const [isAdminCol] = await pool.query('SHOW COLUMNS FROM conversation_members LIKE ?', ['is_admin'])
  if (isAdminCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER muted_until'
    )
  }
  const [bannedWordWarnedCol] = await pool.query('SHOW COLUMNS FROM conversation_members LIKE ?', [
    'banned_word_warned'
  ])
  if (bannedWordWarnedCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN banned_word_warned TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin'
    )
  }
  const [antiScreenshotMemberCol] = await pool.query(
    'SHOW COLUMNS FROM conversation_members LIKE ?',
    ['anti_screenshot']
  )
  if (antiScreenshotMemberCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN anti_screenshot TINYINT(1) NOT NULL DEFAULT 0 AFTER banned_word_warned'
    )
  }
  const [lastReadCol] = await pool.query('SHOW COLUMNS FROM conversation_members LIKE ?', [
    'last_read_at'
  ])
  if (lastReadCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN last_read_at DATETIME NULL DEFAULT NULL AFTER anti_screenshot'
    )
    await pool.query(
      `UPDATE conversation_members cm
       JOIN conversations c ON c.id = cm.conversation_id
       SET cm.last_read_at = COALESCE(
         (SELECT MAX(m.created_at) FROM messages m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL),
         c.updated_at
       )
       WHERE cm.last_read_at IS NULL`
    )
  }
  const [groupNickCol] = await pool.query('SHOW COLUMNS FROM conversation_members LIKE ?', [
    'group_nickname'
  ])
  if (groupNickCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversation_members ADD COLUMN group_nickname VARCHAR(32) NULL DEFAULT NULL AFTER last_read_at'
    )
  }
}

async function getGroupOwnerId(conversationId) {
  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, conv_type AS convType, banned FROM conversations WHERE id = ? LIMIT 1`,
    [Number(conversationId)]
  )
  if (!rows.length || rows[0].convType !== 'group') return null
  return rows[0]
}

export async function getGroupOwnerUserId(conversationId) {
  const row = await getGroupOwnerId(conversationId)
  const ownerId = Number(row?.ownerId)
  return ownerId || null
}

async function isGroupMemberAdmin(conversationId, userId) {
  const [rows] = await mysqlPool.query(
    `SELECT is_admin AS isAdmin FROM conversation_members
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [Number(conversationId), Number(userId)]
  )
  return !!(rows[0]?.isAdmin ?? rows[0]?.is_admin)
}

async function assertGroupModerator(conversationId, userId, actionLabel = '操作') {
  const group = await getGroupOwnerId(conversationId)
  if (!group) throw new Error('群聊不存在')
  if (group.banned) throw new Error('该群聊已被封禁')
  const uid = Number(userId)
  if (Number(group.ownerId) === uid) return group
  const isAdmin = await isGroupMemberAdmin(conversationId, uid)
  if (!isAdmin) {
    const err = new Error(`仅群主或管理员可${actionLabel}`)
    err.status = 403
    throw err
  }
  return group
}

async function assertGroupOwner(conversationId, userId, actionLabel = '操作') {
  const group = await getGroupOwnerId(conversationId)
  if (!group) throw new Error('群聊不存在')
  if (group.banned) throw new Error('该群聊已被封禁')
  if (Number(group.ownerId) !== Number(userId)) {
    const err = new Error(`仅群主可${actionLabel}`)
    err.status = 403
    throw err
  }
  return group
}

async function assertCanModerateTarget(conversationId, actorId, targetId) {
  const group = await assertGroupModerator(conversationId, actorId, '管理成员')
  const target = Number(targetId)
  const actor = Number(actorId)
  if (!target || actor === target) throw new Error('无效的目标成员')
  if (target === Number(group.ownerId)) throw new Error('不能对群主执行此操作')
  const [memberRows] = await mysqlPool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [Number(conversationId), target]
  )
  if (!memberRows.length) throw new Error('该成员不在群内')
  if (Number(group.ownerId) !== actor) {
    const targetIsAdmin = await isGroupMemberAdmin(conversationId, target)
    if (targetIsAdmin) throw new Error('管理员不能管理其他管理员')
  }
  return group
}

async function migrateFriendSocialTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_user_id INT NOT NULL,
      to_user_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fr_to_status (to_user_id, status),
      INDEX idx_fr_from_status (from_user_id, status),
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(32) NOT NULL,
      title VARCHAR(128) NOT NULL DEFAULT '',
      content VARCHAR(500) NOT NULL DEFAULT '',
      related_id INT NULL,
      actor_user_id INT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notif_user (user_id, is_read),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [clearedCol] = await pool.query('SHOW COLUMNS FROM notifications LIKE ?', ['cleared'])
  if (clearedCol.length === 0) {
    await pool.query(
      'ALTER TABLE notifications ADD COLUMN cleared TINYINT(1) NOT NULL DEFAULT 0 AFTER is_read'
    )
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_join_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_gjr_conv_status (conversation_id, status),
      INDEX idx_gjr_user_status (user_id, status),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function migrateConversationsTable(pool) {
  const [typeCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['conv_type'])
  if (typeCol.length === 0) {
    await pool.query(
      "ALTER TABLE conversations ADD COLUMN conv_type VARCHAR(16) NOT NULL DEFAULT 'direct' AFTER title"
    )
  }
  const [ownerCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['owner_id'])
  if (ownerCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN owner_id INT NULL AFTER conv_type')
  }
  const [codeCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['group_code'])
  if (codeCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN group_code VARCHAR(20) NULL AFTER owner_id')
  }
  const [bannedCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['banned'])
  if (bannedCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN banned TINYINT(1) NOT NULL DEFAULT 0 AFTER group_code'
    )
  }
  const [createdCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['created_at'])
  if (createdCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER banned'
    )
  }
  const [announceCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['announcement'])
  if (announceCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN announcement TEXT NULL AFTER banned')
  }
  const [announceImgCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['announcement_image'])
  if (announceImgCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN announcement_image VARCHAR(500) NULL AFTER announcement')
  }
  const [announcePinCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['announcement_pinned'])
  if (announcePinCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN announcement_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER announcement_image'
    )
  }
  const [announcePinMsgCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', [
    'announcement_pinned_message_id'
  ])
  if (announcePinMsgCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN announcement_pinned_message_id BIGINT NULL AFTER announcement_pinned'
    )
  }
  const [multiChatBgCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['multi_chat_bg'])
  if (multiChatBgCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN multi_chat_bg VARCHAR(500) NULL AFTER announcement_pinned_message_id'
    )
  }
  const [multiChatNoticeCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['multi_chat_notice'])
  if (multiChatNoticeCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN multi_chat_notice TEXT NULL AFTER multi_chat_bg')
  }
  const [groupChatBgCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['group_chat_bg'])
  if (groupChatBgCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN group_chat_bg VARCHAR(500) NULL AFTER multi_chat_notice'
    )
  }
  const [groupMutedCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['group_muted'])
  if (groupMutedCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN group_muted TINYINT(1) NOT NULL DEFAULT 0 AFTER multi_chat_notice'
    )
  }
  const [fileUploadPolicyCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', [
    'file_upload_policy'
  ])
  if (fileUploadPolicyCol.length === 0) {
    await pool.query(
      "ALTER TABLE conversations ADD COLUMN file_upload_policy VARCHAR(16) NOT NULL DEFAULT 'all' AFTER group_muted"
    )
  }
  const [butlerEnabledCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['butler_enabled'])
  if (butlerEnabledCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN butler_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER file_upload_policy'
    )
  }
  const [butlerWelcomeCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['butler_welcome'])
  if (butlerWelcomeCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN butler_welcome TEXT NULL AFTER butler_enabled')
  }
  const [butlerWelcomeImageCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', [
    'butler_welcome_image'
  ])
  if (butlerWelcomeImageCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN butler_welcome_image VARCHAR(500) NULL AFTER butler_welcome'
    )
  }
  const [butlerLeaveCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', ['butler_leave'])
  if (butlerLeaveCol.length === 0) {
    await pool.query('ALTER TABLE conversations ADD COLUMN butler_leave TEXT NULL AFTER butler_welcome_image')
  }
  const [antiScreenshotCol] = await pool.query('SHOW COLUMNS FROM conversations LIKE ?', [
    'anti_screenshot'
  ])
  if (antiScreenshotCol.length === 0) {
    await pool.query(
      'ALTER TABLE conversations ADD COLUMN anti_screenshot TINYINT(1) NOT NULL DEFAULT 0 AFTER butler_leave'
    )
  }
  const [idxRows] = await pool.query(
    "SHOW INDEX FROM conversations WHERE Key_name = 'uniq_conversations_group_code'"
  )
  if (idxRows.length === 0) {
    try {
      await pool.query(
        'ALTER TABLE conversations ADD UNIQUE INDEX uniq_conversations_group_code (group_code)'
      )
    } catch (e) {
      console.warn('[db] group_code 唯一索引创建失败:', e.message)
    }
  }
  const [updatedIdx] = await pool.query(
    "SHOW INDEX FROM conversations WHERE Key_name = 'idx_conversations_updated'"
  )
  if (updatedIdx.length === 0) {
    try {
      await pool.query(
        'ALTER TABLE conversations ADD INDEX idx_conversations_updated (updated_at DESC)'
      )
    } catch (e) {
      console.warn('[db] conversations.updated_at 索引创建失败:', e.message)
    }
  }
  const [cmConvUserIdx] = await pool.query(
    "SHOW INDEX FROM conversation_members WHERE Key_name = 'idx_cm_conv_user'"
  )
  if (cmConvUserIdx.length === 0) {
    try {
      await pool.query(
        'ALTER TABLE conversation_members ADD INDEX idx_cm_conv_user (conversation_id, user_id)'
      )
    } catch (e) {
      console.warn('[db] conversation_members 复合索引创建失败:', e.message)
    }
  }
  await backfillMissingGroupCodes(pool)
}

async function generateUniqueGroupCodeWithPool(pool) {
  for (let i = 0; i < 20; i++) {
    const code = generateRandomGroupCodeDigits()
    const [rows] = await pool.query('SELECT id FROM conversations WHERE group_code = ? LIMIT 1', [code])
    if (!rows.length) return code
  }
  const fallback = generateRandomGroupCodeDigits(GROUP_CODE_MAX_LENGTH)
  const [rows] = await pool.query('SELECT id FROM conversations WHERE group_code = ? LIMIT 1', [fallback])
  if (!rows.length) return fallback
  return `${fallback}${Math.floor(Math.random() * 10)}`.slice(0, GROUP_CODE_MAX_LENGTH)
}

async function backfillMissingGroupCodes(pool) {
  const [rows] = await pool.query(
    "SELECT id FROM conversations WHERE conv_type = 'group' AND (group_code IS NULL OR TRIM(group_code) = '')"
  )
  for (const row of rows) {
    const code = await generateUniqueGroupCodeWithPool(pool)
    await pool.query('UPDATE conversations SET group_code = ? WHERE id = ?', [code, row.id])
  }
}

async function migrateMessagesTable(pool) {
  const [typeCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['message_type'])
  if (typeCol.length === 0) {
    await pool.query(
      "ALTER TABLE messages ADD COLUMN message_type VARCHAR(32) NOT NULL DEFAULT 'text' AFTER content"
    )
  } else {
    const colType = String(typeCol[0].Type || '').toLowerCase()
    const match = colType.match(/varchar\((\d+)\)/)
    if (match && Number(match[1]) < 32) {
      await pool.query(
        "ALTER TABLE messages MODIFY COLUMN message_type VARCHAR(32) NOT NULL DEFAULT 'text'"
      )
    }
  }
  const [imgCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['image_url'])
  if (imgCol.length === 0) {
    await pool.query('ALTER TABLE messages ADD COLUMN image_url TEXT NULL AFTER message_type')
  }
  const [voiceUrlCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['voice_url'])
  if (voiceUrlCol.length === 0) {
    await pool.query('ALTER TABLE messages ADD COLUMN voice_url TEXT NULL AFTER image_url')
  }
  const [voiceDurCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['voice_duration'])
  if (voiceDurCol.length === 0) {
    await pool.query(
      'ALTER TABLE messages ADD COLUMN voice_duration DOUBLE NULL DEFAULT NULL AFTER voice_url'
    )
  }
  const [fileUrlCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['file_url'])
  if (fileUrlCol.length === 0) {
    await pool.query('ALTER TABLE messages ADD COLUMN file_url TEXT NULL AFTER voice_duration')
  }
  const [fileNameCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['file_name'])
  if (fileNameCol.length === 0) {
    await pool.query(
      'ALTER TABLE messages ADD COLUMN file_name VARCHAR(255) NULL DEFAULT NULL AFTER file_url'
    )
  }
  const [fileSizeCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['file_size'])
  if (fileSizeCol.length === 0) {
    await pool.query(
      'ALTER TABLE messages ADD COLUMN file_size BIGINT NULL DEFAULT NULL AFTER file_name'
    )
  }
  const [fileSafetyCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['file_safety'])
  if (fileSafetyCol.length === 0) {
    await pool.query(
      "ALTER TABLE messages ADD COLUMN file_safety VARCHAR(16) NOT NULL DEFAULT 'unknown' AFTER file_size"
    )
  }
  const [deletedCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['deleted_at'])
  if (deletedCol.length === 0) {
    await pool.query(
      'ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER created_at'
    )
  }
  const [recalledByCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['recalled_by_user_id'])
  if (recalledByCol.length === 0) {
    await pool.query(
      'ALTER TABLE messages ADD COLUMN recalled_by_user_id INT NULL DEFAULT NULL AFTER deleted_at'
    )
  }
  const [aiBotCol] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', ['ai_bot_id'])
  if (aiBotCol.length === 0) {
    await pool.query('ALTER TABLE messages ADD COLUMN ai_bot_id INT NULL DEFAULT NULL AFTER user_id')
  }
  try {
    const [userIdx] = await pool.query("SHOW INDEX FROM messages WHERE Key_name = 'idx_messages_user'")
    if (userIdx.length === 0) {
      await pool.query('ALTER TABLE messages ADD INDEX idx_messages_user (user_id, id)')
    }
  } catch (e) {
    console.warn('[migrate] messages user index:', e?.message || e)
  }
}

async function backfillFileSafety(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT id, file_url, file_name
       FROM messages
       WHERE message_type = 'file'
         AND deleted_at IS NULL
         AND file_url IS NOT NULL
         AND (file_safety IS NULL OR file_safety = '' OR file_safety = 'unknown')
       ORDER BY id DESC
       LIMIT 120`
    )
    for (const row of rows) {
      try {
        const scanned = scanGroupFileUrl(row.file_url, row.file_name || '')
        const safety = normalizeFileSafety(scanned.safety)
        if (safety === 'unknown') continue
        await pool.query('UPDATE messages SET file_safety = ? WHERE id = ?', [safety, row.id])
      } catch {
        /* skip one */
      }
    }
  } catch (e) {
    console.warn('[file-safety] backfill skipped:', e?.message || e)
  }
}

async function migrateAiBotTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_bots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      avatar_url TEXT,
      mention_names VARCHAR(500) NOT NULL DEFAULT '',
      api_base_url VARCHAR(500) NOT NULL DEFAULT '',
      api_key VARCHAR(500) NOT NULL DEFAULT '',
      model VARCHAR(128) NOT NULL DEFAULT 'gpt-4o-mini',
      persona_id VARCHAR(128) NULL,
      system_prompt TEXT NULL,
      persona TEXT,
      personality TEXT,
      knowledge_base TEXT,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const personaIdCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['persona_id'])
  if (!personaIdCol[0].length) {
    await pool.query('ALTER TABLE ai_bots ADD COLUMN persona_id VARCHAR(128) NULL AFTER model')
  }
  const systemPromptCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['system_prompt'])
  if (!systemPromptCol[0].length) {
    await pool.query('ALTER TABLE ai_bots ADD COLUMN system_prompt TEXT NULL AFTER persona_id')
  }
  await pool.query(`
    UPDATE ai_bots
    SET system_prompt = TRIM(CONCAT(
      '你是', name, '。',
      IF(persona IS NOT NULL AND TRIM(persona) != '', CONCAT(CHAR(10), '人设：', TRIM(persona)), ''),
      IF(personality IS NOT NULL AND TRIM(personality) != '', CONCAT(CHAR(10), '性格：', TRIM(personality)), ''),
      IF(knowledge_base IS NOT NULL AND TRIM(knowledge_base) != '', CONCAT(CHAR(10), '知识库：', TRIM(knowledge_base)), ''),
      CHAR(10), '你在群聊中回复用户，回答简洁自然，避免冗长。'
    )),
    persona = NULL,
    personality = NULL,
    knowledge_base = NULL
    WHERE (system_prompt IS NULL OR TRIM(system_prompt) = '')
      AND (
        (persona IS NOT NULL AND TRIM(persona) != '')
        OR (personality IS NOT NULL AND TRIM(personality) != '')
        OR (knowledge_base IS NOT NULL AND TRIM(knowledge_base) != '')
      )
  `)
  await pool.query(`
    UPDATE ai_bots
    SET persona = NULL, personality = NULL, knowledge_base = NULL
    WHERE system_prompt IS NOT NULL AND TRIM(system_prompt) != ''
  `)
  // 群 AI 仅支持 DeepSeek 官方接口
  await pool.query(
    `UPDATE ai_bots SET api_base_url = ? WHERE api_base_url IS NULL OR TRIM(api_base_url) = '' OR api_base_url NOT LIKE ?`,
    [DEEPSEEK_BASE_URL, '%api.deepseek.com%']
  )
  await pool.query(
    `UPDATE ai_bots SET model = ?
     WHERE model IS NULL OR TRIM(model) = ''
        OR model NOT IN ('deepseek-v4-flash', 'deepseek-v4-pro')`,
    [DEEPSEEK_DEFAULT_MODEL]
  )
  await pool.query(`UPDATE ai_bots SET persona_id = NULL WHERE persona_id IS NOT NULL AND TRIM(persona_id) <> ''`)
  const humanlikeCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['humanlike_reply'])
  if (!humanlikeCol[0].length) {
    await pool.query(
      'ALTER TABLE ai_bots ADD COLUMN humanlike_reply TINYINT(1) NOT NULL DEFAULT 1 AFTER system_prompt'
    )
  }
  const delayMinCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['reply_delay_min_sec'])
  if (!delayMinCol[0].length) {
    await pool.query(
      'ALTER TABLE ai_bots ADD COLUMN reply_delay_min_sec INT NOT NULL DEFAULT 2 AFTER humanlike_reply'
    )
  }
  const delayMaxCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['reply_delay_max_sec'])
  if (!delayMaxCol[0].length) {
    await pool.query(
      'ALTER TABLE ai_bots ADD COLUMN reply_delay_max_sec INT NOT NULL DEFAULT 6 AFTER reply_delay_min_sec'
    )
  }
  const ttsVoiceCol = await pool.query('SHOW COLUMNS FROM ai_bots LIKE ?', ['tts_voice_id'])
  if (!ttsVoiceCol[0].length) {
    await pool.query(
      "ALTER TABLE ai_bots ADD COLUMN tts_voice_id VARCHAR(64) NOT NULL DEFAULT 'genshin:可莉' AFTER reply_delay_max_sec"
    )
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_ai_bots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bot_id INT NOT NULL,
      conversation_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_group_ai_bot (conversation_id),
      INDEX idx_gab_bot (bot_id),
      FOREIGN KEY (bot_id) REFERENCES ai_bots(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function migrateAvatars(pool) {
  // 空 / 外链 / 旧默认图 → 按用户 id 稳定分配到新默认池（部署重启后自动跑）
  const [userRows] = await pool.query(
    `SELECT id, avatar_url AS avatarUrl FROM users
     WHERE avatar_url IS NULL
        OR avatar_url = ''
        OR avatar_url LIKE 'http%'
        OR avatar_url = ?
        OR avatar_url = ?
        OR avatar_url LIKE '%/Official Images/image.png'
        OR avatar_url LIKE '%/Official%20Images/image.png'
        OR avatar_url = '/media/avatar/default.png'`,
    [LEGACY_DEFAULT_AVATAR_URL, '/media/Official Images/image.png']
  )
  let updatedUsers = 0
  for (const row of userRows) {
    const cur = String(row.avatarUrl || '').trim().split('?')[0].replace(/\\/g, '/')
    // 已是新默认池则跳过
    if (/\/media\/Default Avatars\/default-0[1-9]\.png$/i.test(cur)) continue
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [
      pickDefaultAvatarUrlForSeed(row.id),
      row.id
    ])
    updatedUsers++
  }
  if (updatedUsers > 0) {
    console.log(`[avatar] migrated ${updatedUsers} users to Default Avatars`)
  }

  // 池扩容后：仅当「当前默认图路径」与 seed 映射不一致时纠正（不每次重启刷 ?v=）
  const [poolUsers] = await pool.query(
    `SELECT id, avatar_url AS avatarUrl FROM users
     WHERE avatar_url LIKE '%/Default Avatars/default-%'`
  )
  let remapped = 0
  for (const row of poolUsers) {
    const curBase = String(row.avatarUrl || '').trim().split('?')[0].replace(/\\/g, '/')
    const nextBase = pickDefaultAvatarUrlForSeed(row.id)
    if (curBase === nextBase) continue
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [nextBase, row.id])
    remapped++
  }
  if (remapped > 0) {
    console.log(`[avatar] remapped ${remapped} Default Avatar users to current pool`)
  }

  const [directRows] = await pool.query(
    `SELECT id, avatar_url AS avatarUrl FROM conversations
     WHERE (conv_type IS NULL OR conv_type = 'direct')
       AND (
         avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE 'http%'
         OR avatar_url = ? OR avatar_url = ?
         OR avatar_url LIKE '%/Official Images/image.png'
         OR avatar_url LIKE '%/Official%20Images/image.png'
         OR avatar_url = '/media/avatar/default.png'
       )`,
    [LEGACY_DEFAULT_AVATAR_URL, '/media/Official Images/image.png']
  )
  for (const row of directRows) {
    const cur = String(row.avatarUrl || '').trim().split('?')[0].replace(/\\/g, '/')
    if (/\/media\/Default Avatars\/default-0[1-9]\.png$/i.test(cur)) continue
    await pool.query('UPDATE conversations SET avatar_url = ? WHERE id = ?', [
      pickDefaultAvatarUrlForSeed(row.id),
      row.id
    ])
  }

  await pool.query(
    `UPDATE conversations SET avatar_url = ?
     WHERE conv_type = 'group'
       AND (avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE 'http%' OR avatar_url = ? OR avatar_url = ? OR avatar_url = ?)`,
    [DEFAULT_GROUP_AVATAR_URL, DEFAULT_GROUP_AVATAR_URL, LEGACY_DEFAULT_AVATAR_URL, LEGACY_GROUP_AVATAR_URL]
  )

  // 服务器迁移等导致头像文件丢失：指向不存在文件的用户/会话 → 默认头像
  const [fileUsers] = await pool.query(
    `SELECT id, avatar_url AS avatarUrl FROM users
     WHERE avatar_url IS NOT NULL AND avatar_url != ''`
  )
  let missingUsers = 0
  for (const row of fileUsers) {
    const cur = String(row.avatarUrl || '').trim()
    const base = cur.split('?')[0].replace(/\\/g, '/')
    if (/\/media\/Default Avatars\/default-0[1-9]\.png$/i.test(base)) continue
    if (avatarMediaFileExists(base)) continue
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [
      pickDefaultAvatarUrlForSeed(row.id),
      row.id
    ])
    missingUsers++
  }
  if (missingUsers > 0) {
    console.log(`[avatar] replaced ${missingUsers} users with missing avatar files`)
  }

  const [fileDirect] = await pool.query(
    `SELECT id, avatar_url AS avatarUrl FROM conversations
     WHERE (conv_type IS NULL OR conv_type = 'direct')
       AND avatar_url IS NOT NULL AND avatar_url != ''`
  )
  let missingDirect = 0
  for (const row of fileDirect) {
    const cur = String(row.avatarUrl || '').trim()
    const base = cur.split('?')[0].replace(/\\/g, '/')
    if (/\/media\/Default Avatars\/default-0[1-9]\.png$/i.test(base)) continue
    if (avatarMediaFileExists(base)) continue
    await pool.query('UPDATE conversations SET avatar_url = ? WHERE id = ?', [
      pickDefaultAvatarUrlForSeed(row.id),
      row.id
    ])
    missingDirect++
  }
  if (missingDirect > 0) {
    console.log(`[avatar] replaced ${missingDirect} direct chats with missing avatar files`)
  }
}

async function migrateUsersTable(pool) {
  const [cols] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['password_hash'])
  if (cols.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT "" AFTER nickname')
  }
  const [emailCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['email'])
  if (emailCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(120) NULL DEFAULT NULL AFTER username')
  }
  await ensureUniqueEmailIndex(pool)
  const [phoneCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['phone'])
  if (phoneCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL AFTER email')
  }
  await ensureUniquePhoneIndex(pool)
  const [registerIpCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['register_ip'])
  if (registerIpCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN register_ip VARCHAR(45) NULL DEFAULT NULL AFTER phone')
  }
  await ensureChatNoColumn(pool)
  const [bioCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['bio'])
  if (bioCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN bio VARCHAR(200) NULL DEFAULT NULL AFTER avatar_url')
  }
  const [provinceCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['province'])
  if (provinceCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN province VARCHAR(64) NULL DEFAULT NULL AFTER bio')
  }
  const [chatBubbleCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['chat_bubble_id'])
  if (chatBubbleCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN chat_bubble_id VARCHAR(32) NOT NULL DEFAULT 'default' AFTER avatar_url"
    )
  }
  const [avatarFrameCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['avatar_frame_id'])
  if (avatarFrameCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN avatar_frame_id VARCHAR(32) NOT NULL DEFAULT 'none' AFTER chat_bubble_id"
    )
  }
  const [lastBrowserCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_browser'])
  if (lastBrowserCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN last_browser VARCHAR(32) NULL DEFAULT NULL AFTER register_ip"
    )
  }
  const [lastClientTypeCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_client_type'])
  if (lastClientTypeCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN last_client_type VARCHAR(16) NULL DEFAULT NULL AFTER last_browser"
    )
  }
  const [lastDeviceModelCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_device_model'])
  if (lastDeviceModelCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN last_device_model VARCHAR(128) NULL DEFAULT NULL AFTER last_client_type"
    )
  }
  const [lastDeviceInfoCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_device_info'])
  if (lastDeviceInfoCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN last_device_info JSON NULL DEFAULT NULL AFTER last_device_model'
    )
  }
  const [lastDeviceAtCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_device_at'])
  if (lastDeviceAtCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN last_device_at DATETIME NULL DEFAULT NULL AFTER last_device_info'
    )
  }
  const [lastLoginIpCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_login_ip'])
  if (lastLoginIpCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45) NULL DEFAULT NULL AFTER last_device_at'
    )
  }
  const [lastLoginAtCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_login_at'])
  if (lastLoginAtCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL AFTER last_login_ip'
    )
  }
  const [lastLoginFwdCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['last_login_forwarded'])
  if (lastLoginFwdCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN last_login_forwarded VARCHAR(255) NULL DEFAULT NULL AFTER last_login_at'
    )
  }
  const [badgeTextCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['badge_text'])
  if (badgeTextCol.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN badge_text VARCHAR(16) NULL DEFAULT NULL AFTER avatar_frame_id'
    )
  }
  const [badgeColorCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['badge_color'])
  if (badgeColorCol.length === 0) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN badge_color VARCHAR(16) NULL DEFAULT NULL AFTER badge_text"
    )
  }
  const [badgesCol] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['badges'])
  if (badgesCol.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN badges JSON NULL DEFAULT NULL AFTER badge_color')
  }
}

export const USER_BADGE_MAX = 5

function normalizeBadgeColorValue(colorInput, fallback = '#FF9800') {
  let color = String(colorInput ?? '').trim()
  if (!/^#([0-9a-fA-F]{6})$/.test(color)) return fallback
  return `#${color.slice(1).toUpperCase()}`
}

/** 单个微标：文本最多 8 字，颜色 #RRGGBB */
export function normalizeUserBadge(textInput, colorInput) {
  const text = String(textInput ?? '')
    .replace(/\s+/g, '')
    .slice(0, 8)
  if (!text) {
    return { badgeText: null, badgeColor: null }
  }
  return {
    badgeText: text,
    badgeColor: normalizeBadgeColorValue(colorInput, '#FF9800')
  }
}

/** 最多 5 个微标 */
export function normalizeUserBadges(input) {
  const raw = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (out.length >= USER_BADGE_MAX) break
    const text = String(item?.badgeText ?? item?.text ?? item?.badge_text ?? '')
      .replace(/\s+/g, '')
      .slice(0, 8)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({
      badgeText: text,
      badgeColor: normalizeBadgeColorValue(
        item?.badgeColor ?? item?.color ?? item?.badge_color,
        '#FF9800'
      )
    })
  }
  return out
}

function parseBadgesJson(raw) {
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

function readUserBadges(row) {
  if (!row) return []
  const fromJson = normalizeUserBadges(parseBadgesJson(row.badges ?? row.Badges))
  if (fromJson.length) return fromJson
  // 兼容旧单字段
  const legacy = normalizeUserBadge(row.badgeText ?? row.badge_text, row.badgeColor ?? row.badge_color)
  if (!legacy.badgeText) return []
  return [{ badgeText: legacy.badgeText, badgeColor: legacy.badgeColor }]
}

function readUserBadge(row) {
  const list = readUserBadges(row)
  if (!list.length) return { badgeText: '', badgeColor: '', badges: [] }
  return {
    badgeText: list[0].badgeText,
    badgeColor: list[0].badgeColor,
    badges: list
  }
}

async function migrateAvatarFramesTable(pool) {
  const { migrateLegacyDefaultAvatarFrameFile, defaultAvatarFrameUrl, LEGACY_DEFAULT_AVATAR_FRAME_URL, analyzeAvatarFrameAlignment, ensureAvatarFrameStorage } =
    await import('./avatarFrameImage.js')
  migrateLegacyDefaultAvatarFrameFile()
  ensureAvatarFrameStorage()
  const defaultFrameUrl = defaultAvatarFrameUrl()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS avatar_frames (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      frame_url VARCHAR(512) NOT NULL,
      scale DECIMAL(8,4) NOT NULL DEFAULT 1.4600,
      offset_x_pct DECIMAL(8,3) NOT NULL DEFAULT 0.000,
      offset_y_pct DECIMAL(8,3) NOT NULL DEFAULT 0.000,
      hole_diameter_ratio DECIMAL(8,4) NULL DEFAULT NULL,
      is_free TINYINT(1) NOT NULL DEFAULT 1,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_avatar_frames_enabled_sort (enabled, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(
    'ALTER TABLE avatar_frames ADD COLUMN is_free TINYINT(1) NOT NULL DEFAULT 1 AFTER hole_diameter_ratio'
  ).catch(() => {})
  await pool.query(`
    CREATE TABLE IF NOT EXISTS avatar_frame_activation_codes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(32) NOT NULL,
      frame_id VARCHAR(32) NOT NULL,
      used_by INT NULL DEFAULT NULL,
      used_at DATETIME NULL DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_avatar_frame_activation_code (code),
      INDEX idx_afac_frame (frame_id),
      INDEX idx_afac_used_by (used_by),
      INDEX idx_afac_unused (frame_id, used_at),
      CONSTRAINT fk_afac_frame FOREIGN KEY (frame_id) REFERENCES avatar_frames(id),
      CONSTRAINT fk_afac_user FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_avatar_frames (
      user_id INT NOT NULL,
      frame_id VARCHAR(32) NOT NULL,
      source VARCHAR(16) NOT NULL DEFAULT 'code',
      unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, frame_id),
      INDEX idx_uaf_frame (frame_id),
      CONSTRAINT fk_uaf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_uaf_frame FOREIGN KEY (frame_id) REFERENCES avatar_frames(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  const [rows] = await pool.query('SELECT id FROM avatar_frames WHERE id = ? LIMIT 1', ['default'])
  if (!rows.length) {
    await pool.query(
      `INSERT INTO avatar_frames
        (id, name, frame_url, scale, offset_x_pct, offset_y_pct, hole_diameter_ratio, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        'default',
        'DJ耳机',
        defaultFrameUrl,
        1.46,
        0,
        -4,
        null
      ]
    )
  }
  await pool.query(
    `UPDATE avatar_frames SET frame_url = ? WHERE frame_url = ?`,
    [defaultFrameUrl, LEGACY_DEFAULT_AVATAR_FRAME_URL]
  ).catch(() => {})
  await pool.query(
    `UPDATE avatar_frames SET frame_url = REPLACE(frame_url, 'Avatar%20Frame.png', 'Avatar Frame.png')`
  ).catch(() => {})
  await pool.query(
    `UPDATE avatar_frames SET scale = 1.46, offset_x_pct = 0, offset_y_pct = -4
     WHERE id = 'default' AND scale >= 2`
  ).catch(() => {})
  await syncAvatarFramesFromDisk(pool, { analyzeAvatarFrameAlignment })
}

function avatarFrameFilenameFromUrl(frameUrl) {
  const url = canonicalizeAvatarFrameUrl(String(frameUrl || ''))
  if (!url.startsWith(`${AVATAR_FRAME_URL_PREFIX}/`)) return ''
  return path.basename(url)
}

function frameIdFromFilename(filename) {
  const base = path.basename(String(filename || ''), path.extname(String(filename || '')))
  const id = base.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  return id || `frame${Date.now()}`
}

async function syncAvatarFramesFromDisk(pool, { analyzeAvatarFrameAlignment }) {
  if (!fs.existsSync(AVATAR_FRAME_DIR)) return

  const [existingRows] = await pool.query('SELECT id, frame_url AS frameUrl FROM avatar_frames')
  const knownFilenames = new Set(
    existingRows
      .map((row) => avatarFrameFilenameFromUrl(row.frameUrl))
      .filter(Boolean)
  )

  const files = fs
    .readdirSync(AVATAR_FRAME_DIR)
    .filter((name) => /\.(png|webp)$/i.test(name))
    .sort()

  for (const filename of files) {
    if (knownFilenames.has(filename)) continue

    const frameUrl = `${AVATAR_FRAME_URL_PREFIX}/${filename}`
    let align = { scale: 1.46, offsetXPct: 0, offsetYPct: -4, holeDiameterRatio: null }
    try {
      const buffer = fs.readFileSync(path.join(AVATAR_FRAME_DIR, filename))
      align = await analyzeAvatarFrameAlignment(buffer)
    } catch {
      // 保留默认对齐参数
    }

    let frameId = filename === DEFAULT_AVATAR_FRAME_FILENAME
      ? 'default'
      : frameIdFromFilename(filename)
    if (frameId !== 'default') {
      let suffix = 0
      while (true) {
        const [dup] = await pool.query('SELECT id FROM avatar_frames WHERE id = ? LIMIT 1', [frameId])
        if (!dup.length) break
        suffix += 1
        frameId = `${frameIdFromFilename(filename)}${suffix}`.slice(0, 32)
      }
    } else {
      const [dup] = await pool.query('SELECT id FROM avatar_frames WHERE id = ? LIMIT 1', ['default'])
      if (dup.length) continue
    }

    const [sortRows] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort FROM avatar_frames')
    const sortOrder = Number(sortRows[0]?.nextSort ?? 0)
    const name = filename === DEFAULT_AVATAR_FRAME_FILENAME
      ? 'DJ耳机'
      : (frameId.startsWith('frame-') ? '头像框' : frameId).slice(0, 64)

    await pool.query(
      `INSERT INTO avatar_frames
        (id, name, frame_url, scale, offset_x_pct, offset_y_pct, hole_diameter_ratio, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        frameId,
        name,
        frameUrl,
        Number(align.scale ?? 1.46),
        Number(align.offsetXPct ?? 0),
        Number(align.offsetYPct ?? -4),
        align.holeDiameterRatio == null ? null : Number(align.holeDiameterRatio),
        sortOrder
      ]
    )
    knownFilenames.add(filename)
  }
}

const CHAT_BUBBLE_SEEDS = [
  { id: 'default', name: '默认蓝', category: 'recommend', isFree: true, isDecorated: false, previewText: null, sortOrder: 0 },
  { id: 'kawaii', name: '萌猫', category: 'recommend', isFree: true, isDecorated: true, previewText: null, sortOrder: 1 },
  { id: 'sweetbear', name: '甜心熊', category: 'recommend', isFree: true, isDecorated: true, previewText: '你好，今天…', sortOrder: 2 },
  { id: 'citrus', name: '橘子来鸭', category: 'recommend', isFree: true, isDecorated: true, previewText: '先来 300 天!', sortOrder: 3 },
  { id: 'summerdog', name: '夏日小狗', category: 'recommend', isFree: true, isDecorated: true, previewText: '换好了', sortOrder: 4 },
  { id: 'coral', name: '珊瑚粉', category: 'recommend', isFree: true, isDecorated: false, previewText: null, sortOrder: 5 },
  { id: 'mint', name: '薄荷绿', category: 'recommend', isFree: true, isDecorated: false, previewText: null, sortOrder: 6 },
  { id: 'sunset', name: '晚霞橙', category: 'recommend', isFree: true, isDecorated: false, previewText: null, sortOrder: 7 },
  { id: 'lavender', name: '薰衣草', category: 'recommend', isFree: true, isDecorated: false, previewText: null, sortOrder: 8 },
  { id: 'ink', name: '墨水黑', category: 'minimal', isFree: true, isDecorated: false, previewText: null, sortOrder: 9 },
  { id: 'paper', name: '纸感白', category: 'minimal', isFree: true, isDecorated: false, previewText: null, sortOrder: 10 },
  { id: 'line', name: '线框', category: 'minimal', isFree: true, isDecorated: false, previewText: null, sortOrder: 11 },
  { id: 'peach', name: '蜜桃', category: 'cute', isFree: true, isDecorated: false, previewText: null, sortOrder: 12 }
]

async function migrateChatBubblesTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_bubbles (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'recommend',
      is_free TINYINT(1) NOT NULL DEFAULT 1,
      is_decorated TINYINT(1) NOT NULL DEFAULT 0,
      preview_text VARCHAR(64) NULL DEFAULT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_chat_bubbles_enabled_sort (enabled, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bubble_activation_codes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(32) NOT NULL,
      bubble_id VARCHAR(32) NOT NULL,
      used_by INT NULL DEFAULT NULL,
      used_at DATETIME NULL DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_bubble_activation_code (code),
      INDEX idx_bac_bubble (bubble_id),
      INDEX idx_bac_used_by (used_by),
      INDEX idx_bac_unused (bubble_id, used_at),
      CONSTRAINT fk_bac_bubble FOREIGN KEY (bubble_id) REFERENCES chat_bubbles(id),
      CONSTRAINT fk_bac_user FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_chat_bubbles (
      user_id INT NOT NULL,
      bubble_id VARCHAR(32) NOT NULL,
      source VARCHAR(16) NOT NULL DEFAULT 'code',
      unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, bubble_id),
      INDEX idx_ucb_bubble (bubble_id),
      CONSTRAINT fk_ucb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ucb_bubble FOREIGN KEY (bubble_id) REFERENCES chat_bubbles(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  for (const item of CHAT_BUBBLE_SEEDS) {
    const [rows] = await pool.query('SELECT id FROM chat_bubbles WHERE id = ? LIMIT 1', [item.id])
    if (rows.length) continue
    await pool.query(
      `INSERT INTO chat_bubbles
        (id, name, category, is_free, is_decorated, preview_text, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        item.id,
        item.name,
        item.category,
        item.isFree ? 1 : 0,
        item.isDecorated ? 1 : 0,
        item.previewText,
        item.sortOrder
      ]
    )
  }
}

async function ensureChatNoColumn(pool) {
  const [cols] = await pool.query('SHOW COLUMNS FROM users LIKE ?', ['chat_no'])
  if (cols.length === 0) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN chat_no BIGINT UNSIGNED NULL DEFAULT NULL AFTER id'
    )
  }
  const [indexes] = await pool.query(
    "SHOW INDEX FROM users WHERE Column_name = 'chat_no' AND Non_unique = 0"
  )
  if (indexes.length === 0) {
    try {
      await pool.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_chat_no (chat_no)')
    } catch (e) {
      console.warn('[db] chat_no 唯一索引创建失败，请检查重复数据后重启')
    }
  }
  const [missing] = await pool.query('SELECT id FROM users WHERE chat_no IS NULL')
  for (const row of missing) {
    const chatNo = await generateUniqueChatNo(pool)
    await pool.query('UPDATE users SET chat_no = ? WHERE id = ?', [chatNo, row.id])
  }
}

async function generateUniqueChatNo(pool) {
  const db = pool || mysqlPool
  for (let i = 0; i < 30; i++) {
    const chatNo = generateRandomChatNoValue()
    const [rows] = await db.query('SELECT id FROM users WHERE chat_no = ? LIMIT 1', [chatNo])
    if (!rows.length) return chatNo
  }
  throw new Error('无法生成聊聊号')
}

async function ensureUniqueEmailIndex(pool) {
  const [indexes] = await pool.query(
    "SHOW INDEX FROM users WHERE Column_name = 'email' AND Non_unique = 0"
  )
  if (indexes.length > 0) return
  try {
    await pool.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_email (email)')
  } catch (e) {
    const msg = String(e?.message || e)
    if (/Duplicate entry|duplicate/i.test(msg)) {
      console.warn('[db] email 唯一索引创建失败：数据库中已有重复邮箱，请先清理后再重启')
      return
    }
    throw e
  }
}

async function ensureUniquePhoneIndex(pool) {
  const [indexes] = await pool.query(
    "SHOW INDEX FROM users WHERE Column_name = 'phone' AND Non_unique = 0"
  )
  if (indexes.length > 0) return
  try {
    await pool.query('ALTER TABLE users ADD UNIQUE INDEX uniq_users_phone (phone)')
  } catch (e) {
    const msg = String(e?.message || e)
    if (/Duplicate entry|duplicate/i.test(msg)) {
      console.warn('[db] phone 唯一索引创建失败：数据库中已有重复手机号，请先清理后再重启')
      return
    }
    throw e
  }
}

async function removeDemoSeedData() {
  if (!mysqlPool) return
  await mysqlPool.query("DELETE FROM users WHERE username IN ('soft', 'family')")
  await mysqlPool.query("DELETE FROM conversations WHERE title IN ('Soft', 'Family')")
}

/** 移除历史默认测试永久语音房（如「测试语音房」） */
async function removeDefaultTestPublicVoiceRooms() {
  if (!mysqlPool) return
  const [rows] = await mysqlPool.query(
    `SELECT id FROM public_chat_rooms
     WHERE room_type = 'voice' AND is_ephemeral = 0
       AND (title = '测试语音房' OR title LIKE '测试语音房%')
     ORDER BY id`
  )
  if (!rows.length) return
  const { deletePublicChatRoom } = await import('./publicChatRoomsDb.js')
  for (const row of rows) {
    try {
      await deletePublicChatRoom(Number(row.id))
      console.log('[public-chat-rooms] removed default test voice room id=%s', row.id)
    } catch (e) {
      console.warn(
        '[public-chat-rooms] failed to remove test room id=%s: %s',
        row.id,
        e?.message || e
      )
    }
  }
}

export async function seedIfEmpty() {
  await removeDemoSeedData()
  await removeDefaultTestPublicVoiceRooms()
}

export async function connectDatabase() {
  if (connectPromise) return connectPromise

  connectPromise = (async () => {
    const config = loadConfig()
    const dbCfg = config.database || {}
    await closeDatabase()

    if (!isMysqlConfigured(dbCfg)) {
      return { type: 'mysql', connected: false }
    }

    const pool = createPool(dbCfg)
    try {
      await pool.query('SELECT 1')
      await runCreateStatements(pool)
      mysqlPool = pool
      await seedIfEmpty()
      activeConfig = dbCfg
      return { type: 'mysql', connected: true }
    } catch (e) {
      await pool.end().catch(() => {})
      mysqlPool = null
      activeConfig = null
      const msg = String(e?.message || e)
      if (/foreign key|不兼容|旧项目表/i.test(msg)) {
        throw new Error(
          msg.includes('不兼容') || msg.includes('旧项目')
            ? msg
            : '数据库表结构不兼容，无法创建外键。请新建空库用于 XhaMil Chat，不要使用旧项目数据库。'
        )
      }
      throw e
    }
  })()

  try {
    return await connectPromise
  } finally {
    connectPromise = null
  }
}

export async function closeDatabase() {
  const pool = mysqlPool
  mysqlPool = null
  activeConfig = null
  if (pool) {
    await pool.end().catch(() => {})
  }
}

export function assertConnected() {
  if (!mysqlPool) {
    throw new Error('MySQL 未连接，请先在 json/config.json 配置 database 或在后台配置数据库')
  }
}

export function getDbStatus() {
  const config = loadConfig()
  const dbCfg = config.database || {}
  const isConfigured = isMysqlConfigured(dbCfg)
  const isConnected = !!mysqlPool

  return {
    success: true,
    config: isConfigured
      ? {
          host: dbCfg.host || '',
          port: Number(dbCfg.port || 3306),
          user: dbCfg.user || '',
          database: dbCfg.database || '',
          charset: dbCfg.charset || 'utf8mb4',
          password: !!dbCfg.password
        }
      : null,
    isConfigured,
    isConnected
  }
}

function previewForConversationLatest(row, viewerUserId) {
  // 无消息时回退缓存列
  if (row.latestId == null) return String(row.lastMessage || '')
  if (row.latestDeletedAt) {
    if (row.latestRecalledBy) return '群主撤回了成员的一条消息'
    if (Number(row.latestUserId) === Number(viewerUserId)) return '你撤回了一条消息'
    return String(row.convType || '').toLowerCase() === 'group'
      ? '有成员撤回了一条消息'
      : '对方撤回了一条消息'
  }
  return previewForMessage(
    row.latestType,
    row.latestContent,
    row.latestImageUrl,
    row.latestVoiceUrl
  )
}

export async function listConversations(userId) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT c.id,
            CASE WHEN c.conv_type = 'group' THEN c.title
                 ELSE COALESCE(
                   (SELECT COALESCE(u.nickname, u.username)
                    FROM conversation_members cm2
                    JOIN users u ON u.id = cm2.user_id
                    WHERE cm2.conversation_id = c.id
                      AND cm2.user_id <> cm.user_id
                    LIMIT 1),
                   c.title) END AS title,
            CASE WHEN c.conv_type = 'group' THEN COALESCE(c.avatar_url, ?)
                 ELSE COALESCE(
                   (SELECT u.avatar_url
                    FROM conversation_members cm2
                    JOIN users u ON u.id = cm2.user_id
                    WHERE cm2.conversation_id = c.id
                      AND cm2.user_id <> cm.user_id
                    LIMIT 1),
                   c.avatar_url) END AS avatarUrl,
            c.last_message AS lastMessage,
            c.updated_at AS updatedAt,
            c.conv_type AS convType,
            c.group_code AS groupCode,
            c.owner_id AS ownerId,
            c.announcement,
            c.announcement_image AS announcementImage,
            c.announcement_pinned AS announcementPinned,
            c.announcement_pinned_message_id AS announcementPinnedMessageId,
            c.multi_chat_bg AS multiChatBackground,
            c.multi_chat_notice AS multiChatNotice,
            c.group_chat_bg AS groupChatBackground,
            c.group_muted AS groupMuted,
            c.anti_screenshot AS groupAntiScreenshot,
            c.butler_enabled AS butlerEnabled,
            c.butler_welcome AS butlerWelcome,
            c.butler_welcome_image AS butlerWelcomeImage,
            c.butler_leave AS butlerLeave,
            c.banned AS banned,
            cm.muted_until AS memberMutedUntil,
            cm.anti_screenshot AS antiScreenshotSelf,
            cm.last_read_at AS lastReadAt,
            CASE WHEN c.conv_type = 'group' THEN NULL
                 ELSE (SELECT cm2.anti_screenshot
                       FROM conversation_members cm2
                       WHERE cm2.conversation_id = c.id
                         AND cm2.user_id <> cm.user_id
                       LIMIT 1) END AS antiScreenshotPeer,
            lm.id AS latestId,
            lm.message_type AS latestType,
            lm.content AS latestContent,
            lm.image_url AS latestImageUrl,
            lm.voice_url AS latestVoiceUrl,
            lm.deleted_at AS latestDeletedAt,
            lm.user_id AS latestUserId,
            lm.recalled_by_user_id AS latestRecalledBy,
            CASE WHEN EXISTS (
              SELECT 1 FROM messages m
              WHERE m.conversation_id = c.id
                AND m.deleted_at IS NULL
                AND (m.user_id IS NULL OR m.user_id <> cm.user_id)
                AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
              LIMIT 1
            ) THEN 1 ELSE 0 END AS unread,
            CASE WHEN c.conv_type = 'group' THEN NULL
                 ELSE (SELECT cm2.user_id
                       FROM conversation_members cm2
                       WHERE cm2.conversation_id = c.id
                         AND cm2.user_id <> cm.user_id
                       LIMIT 1) END AS peerId,
            (SELECT COALESCE(u.nickname, u.username, '')
             FROM notifications n
             LEFT JOIN users u ON u.id = n.actor_user_id
             WHERE n.user_id = cm.user_id
               AND n.type = 'group_mention'
               AND n.related_id = c.id
               AND n.is_read = 0
               AND n.cleared = 0
             ORDER BY n.created_at DESC
             LIMIT 1) AS unreadMentionFrom
     FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     LEFT JOIN messages lm ON lm.id = (
       SELECT m3.id FROM messages m3
       WHERE m3.conversation_id = c.id
       ORDER BY m3.id DESC
       LIMIT 1
     )
     WHERE cm.user_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM public_chat_rooms pcr WHERE pcr.conversation_id = c.id
       )
     ORDER BY c.updated_at DESC`,
    [DEFAULT_GROUP_AVATAR_URL, userId]
  )
  return rows.map((row) => {
    const livePreview = previewForConversationLatest(row, userId)
    const cached = String(row.lastMessage || '')
    // 缓存列过期时异步回写，保证下次与 WS 通知一致
    if (livePreview !== cached) {
      mysqlPool
        .query('UPDATE conversations SET last_message = ? WHERE id = ?', [livePreview, row.id])
        .catch(() => {})
    }
    const isGroup = (row.convType || 'direct') === 'group'
    // 非组合群头像（含历史自定义图）后台强制刷成组合头像
    if (isGroup && !isGroupMosaicAvatar(row.avatarUrl)) {
      refreshGroupCompositeAvatar(row.id, { force: true }).catch(() => {})
    }
    return {
    ...row,
    lastMessage: maskBannedWords(livePreview),
    avatarUrl:
      isGroup
        ? normalizeGroupAvatarUrl(row.avatarUrl)
        : normalizeAvatarUrl(row.avatarUrl),
    convType: row.convType || 'direct',
    announcement: row.announcement || '',
    announcementImage: row.announcementImage || '',
    announcementPinned: !!(row.announcementPinned ?? row.announcement_pinned),
    announcementPinnedMessageId: row.announcementPinnedMessageId
      ? Number(row.announcementPinnedMessageId)
      : null,
    groupMuted: !!(row.groupMuted ?? row.group_muted),
    butlerEnabled: !!(row.butlerEnabled ?? row.butler_enabled),
    butlerWelcome: row.butlerWelcome || row.butler_welcome || '',
    butlerWelcomeImage: row.butlerWelcomeImage || row.butler_welcome_image || '',
    butlerLeave: row.butlerLeave || row.butler_leave || '',
    banned: !!row.banned,
    memberMutedUntil: row.memberMutedUntil ? new Date(row.memberMutedUntil).toISOString() : null,
    lastReadAt: row.lastReadAt ? new Date(row.lastReadAt).toISOString() : null,
    unread: !!(row.unread ?? Number(row.unread) === 1),
    unreadMentionFrom: String(row.unreadMentionFrom || '').trim(),
    ...(() => {
      const selfOn = !!(row.antiScreenshotSelf ?? row.anti_screenshot)
      const peerOn = !!(row.antiScreenshotPeer)
      let convFlag = !!(row.groupAntiScreenshot ?? row.group_anti_screenshot)
      // 私聊兼容：双方均已开但尚未写入会话锁时，补锁并视为已启用
      if (!isGroup && selfOn && peerOn && !convFlag) {
        convFlag = true
        mysqlPool
          .query('UPDATE conversations SET anti_screenshot = 1 WHERE id = ? AND conv_type = ?', [
            row.id,
            'direct'
          ])
          .catch(() => {})
      }
      const active = convFlag
      return {
        antiScreenshotSelf: isGroup ? convFlag : selfOn,
        antiScreenshotPeer: isGroup ? false : peerOn,
        antiScreenshotActive: active
      }
    })()
  }
  })
}

export async function markConversationReadForUser(userId, conversationId) {
  assertConnected()
  const uid = Number(userId)
  const cid = Number(conversationId)
  if (!uid || !cid) return
  await assertConversationMember(cid, uid)
  await mysqlPool.query(
    `UPDATE conversation_members SET last_read_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [cid, uid]
  )
  await mysqlPool.query(
    `UPDATE notifications SET is_read = 1
     WHERE user_id = ? AND type = 'group_mention' AND related_id = ? AND is_read = 0`,
    [uid, cid]
  )
}

function isMemberMuteActive(mutedUntil) {
  if (!mutedUntil) return false
  const until = mutedUntil instanceof Date ? mutedUntil : new Date(mutedUntil)
  return !Number.isNaN(until.getTime()) && until > new Date()
}

async function assertGroupSendAllowed(conversationId, userId) {
  const [rows] = await mysqlPool.query(
    `SELECT c.conv_type AS convType, c.owner_id AS ownerId, c.group_muted AS groupMuted,
            cm.muted_until AS mutedUntil
     FROM conversations c
     LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? LIMIT 1`,
    [userId, conversationId]
  )
  if (!rows.length) return
  const row = rows[0]
  if (row.convType !== 'group') return
  if (Number(row.ownerId) === Number(userId)) return
  if (row.groupMuted) {
    throw new Error('此群已开启禁言')
  }
  if (isMemberMuteActive(row.mutedUntil)) {
    throw new Error('你已被禁言')
  }
  if (row.mutedUntil) {
    await mysqlPool.query(
      'UPDATE conversation_members SET muted_until = NULL WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    )
  }
}

function normalizeFileUploadPolicy(value) {
  const v = String(value || '').trim().toLowerCase()
  return v === 'admins' ? 'admins' : 'all'
}

/** 群文件上传权限：all=全员；admins=仅群主/管理员 */
export async function assertGroupFileUploadAllowed(conversationId, userId) {
  const [rows] = await mysqlPool.query(
    `SELECT c.conv_type AS convType, c.owner_id AS ownerId,
            c.file_upload_policy AS fileUploadPolicy,
            cm.is_admin AS isAdmin
     FROM conversations c
     LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? LIMIT 1`,
    [userId, conversationId]
  )
  if (!rows.length) return
  const row = rows[0]
  if (row.convType !== 'group') return
  const policy = normalizeFileUploadPolicy(row.fileUploadPolicy)
  if (policy !== 'admins') return
  if (Number(row.ownerId) === Number(userId)) return
  if (row.isAdmin) return
  const err = new Error('仅群主或管理员可上传文件')
  err.status = 403
  throw err
}

export async function assertConversationMember(conversationId, userId) {
  const [rows] = await mysqlPool.query(
    `SELECT c.banned, c.conv_type
     FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = ? AND cm.user_id = ?
     LIMIT 1`,
    [conversationId, userId]
  )
  if (!rows.length) throw new Error('无权访问该会话')
  if (rows[0].conv_type === 'group' && rows[0].banned) {
    throw new Error('该群聊已被封禁')
  }
}

function mapMessageRow(row, viewerUserId) {
  const messageType = row.message_type || row.messageType || 'text'
  if (messageType === 'butler') {
    return mapButlerMessageRow(row, viewerUserId)
  }
  if (messageType === 'ai') {
    const msg = mapAiMessageRow(row, viewerUserId)
    msg.content = maskMessageContent(msg.content, 'ai')
    return msg
  }
  const imageUrl = row.image_url || row.imageUrl || ''
  const voiceUrl = row.voice_url || row.voiceUrl || ''
  const voiceDuration = Number(row.voice_duration ?? row.voiceDuration ?? 0) || 0
  const fileUrl = row.file_url || row.fileUrl || ''
  const fileNameRaw = row.file_name || row.fileName || ''
  const fileName = decodeUploadFilename(fileNameRaw) || fileNameRaw
  const fileSize = Number(row.file_size ?? row.fileSize ?? 0) || 0
  const fileSafety = normalizeFileSafety(row.file_safety ?? row.fileSafety ?? 'unknown')
  const rawContent = row.content || ''
  const contentForMask =
    messageType === 'file' && fileName && rawContent === fileNameRaw
      ? fileName
      : messageType === 'file' && /[ÃÂæåéè]/.test(rawContent)
        ? decodeUploadFilename(rawContent) || rawContent
        : rawContent
  const recalledByUserId = row.recalledByUserId ?? row.recalled_by_user_id ?? null
  const authorUserId = row.userId ?? row.user_id
  const recalledByOwner =
    recalledByUserId != null &&
    authorUserId != null &&
    Number(recalledByUserId) !== Number(authorUserId)
  let motionVideoUrl = ''
  if (String(messageType).toLowerCase() === 'motion_photo') {
    try {
      const parsed = JSON.parse(String(rawContent || ''))
      motionVideoUrl = String(parsed?.videoUrl || '').trim()
    } catch {
      motionVideoUrl = ''
    }
  }
  return {
    id: row.id,
    conversationId: row.conversationId ?? row.conversation_id,
    userId: authorUserId,
    content: maskMessageContent(contentForMask, messageType),
    messageType,
    type: messageType,
    imageUrl,
    photoUrl: imageUrl,
    voiceUrl,
    voiceDuration,
    motionVideoUrl,
    fileUrl,
    fileName,
    fileSize,
    fileSafety,
    isSelf: viewerUserId != null ? !!(row.isSelf ?? row.is_self ?? (row.user_id === viewerUserId)) : !!row.isSelf,
    createdAt: row.createdAt ?? row.created_at,
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    deleted: !!(row.deletedAt ?? row.deleted_at),
    recalledByUserId: recalledByUserId != null ? Number(recalledByUserId) : null,
    recalledByOwner,
    username: row.username,
    // 群聊内优先展示群昵称；个人资料仍用 userNickname（全局昵称）
    nickname: row.nickname || row.username,
    userNickname: row.userNickname || row.user_nickname || row.nickname || row.username || '',
    avatarUrl: normalizeAvatarUrl(row.avatarUrl ?? row.avatar_url),
    chatBubbleId: CHAT_BUBBLE_IDS.includes(String(row.chatBubbleId ?? row.chat_bubble_id ?? 'default').trim())
      ? String(row.chatBubbleId ?? row.chat_bubble_id ?? 'default').trim()
      : 'default',
    avatarFrameId: String(row.avatarFrameId ?? row.avatar_frame_id ?? 'none').trim() || 'none',
    ...(() => {
      const badge = readUserBadge(row)
      return {
        badgeText: badge.badgeText,
        badgeColor: badge.badgeColor,
        badges: badge.badges || []
      }
    })()
  }
}

function previewForMessage(messageType, content, imageUrl, voiceUrl) {
  const type = String(messageType || 'text').toLowerCase()
  if (type === 'butler') {
    if (imageUrl) return content ? content : `[${BUTLER_NAME}]`
    return content || `[${BUTLER_NAME}]`
  }
  if (type === 'ai') {
    const text = String(content || '').trim()
    if (!text) return '[AI]'
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  if (type === 'announcement') return '[群公告]'
  if (type === 'system') {
    const text = String(content || '').trim()
    if (!text) return '[系统消息]'
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  if (type === 'multi_chat_invite') return '[多人聊天]'
  if (type === 'draw_guess_invite') return '[你画我猜]'
  if (type === 'multi_chat_live') return '[直播]'
  if (type === 'chat_history') return '[聊天记录]'
  if (type === 'group_share') return '[群资料]'
  if (type === 'location') {
    try {
      const data = JSON.parse(String(content || ''))
      const title = String(data?.title || data?.name || '').trim()
      return title ? `[位置] ${title}` : '[位置]'
    } catch {
      return '[位置]'
    }
  }
  if (type === 'photo_album') {
    try {
      const data = JSON.parse(String(content || ''))
      const n = Array.isArray(data?.urls) ? data.urls.length : 0
      return n > 0 ? `[图片]x${n}` : '[图片]'
    } catch {
      return '[图片]'
    }
  }
  if (type === 'motion_photo') return '[实况图]'
  if (type === 'video') return '[视频]'
  if (type === 'photo' || type === 'image' || imageUrl) {
    const img = String(imageUrl || '')
    if (/\/media\/sticker\//i.test(img) || isAllowedExternalStickerUrl(img)) return '[表情包]'
    return /\.gif(?:[?#]|$)/i.test(img) ? '[GIF]' : '[图片]'
  }
  if (type === 'voice' || voiceUrl) return '[语音]'
  if (type === 'file') {
    const name = String(content || '').trim()
    return name ? `[文件] ${name}` : '[文件]'
  }
  const masked = maskMessageContent(content || '', type)
  return formatQuoteLastMessagePreview(masked)
}

/** 会话列表预览：引用消息解成可读单行，避免 [[quote:%E6...]] 乱码 */
function formatQuoteLastMessagePreview(content) {
  const text = String(content || '').trim()
  if (!text) return ''
  const m = text.match(/^\[\[quote:([\s\S]*?)\]\]\n?([\s\S]*)$/)
  if (!m) {
    if (text.startsWith('[[quote:')) return '[引用消息]'
    return text.replace(/\n/g, ' ')
  }
  const inner = m[1] || ''
  const body = String(m[2] || '').trim().replace(/\n/g, ' ')
  const sep = inner.indexOf('::')
  const decode = (raw) => {
    try {
      return decodeURIComponent(String(raw || '').replace(/\+/g, '%20'))
    } catch {
      return String(raw || '')
    }
  }
  if (body) return body.length > 80 ? `${body.slice(0, 80)}…` : body
  if (sep < 0) return '[引用消息]'
  let nameRaw = inner.slice(0, sep)
  // 兼容 [[quote:123|name::text]]
  const pipe = nameRaw.indexOf('|')
  if (pipe > 0 && /^\d+$/.test(nameRaw.slice(0, pipe))) {
    nameRaw = nameRaw.slice(pipe + 1)
  }
  let quoteRaw = inner.slice(sep + 2)
  // 兼容 [[quote:...::text::v::url]]
  const mediaMatch = quoteRaw.match(/^(.*)::([pva])::(.+)$/s)
  if (mediaMatch) quoteRaw = mediaMatch[1]
  const name = decode(nameRaw).trim() || '用户'
  const quote = decode(quoteRaw).trim().replace(/\n/g, ' ')
  const line = quote ? `${name}: ${quote}` : `回复 ${name}`
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

export async function getMessages(conversationId, userId, { limit = 50, beforeId = null, afterId = null } = {}) {
  assertConnected()
  await assertConversationMember(conversationId, userId)
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const params = [userId, conversationId]
  let extraClause = ''
  if (beforeId && afterId) {
    throw new Error('无效的参数')
  }
  if (beforeId) {
    extraClause = ' AND m.id < ?'
    params.push(Number(beforeId))
  } else if (afterId) {
    extraClause = ' AND m.id > ?'
    params.push(Number(afterId))
  }
  params.push(pageSize)
  const order = afterId ? 'ASC' : 'DESC'
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.ai_bot_id AS aiBotId,
            m.content, m.message_type AS messageType, m.image_url AS imageUrl,
            m.voice_url AS voiceUrl, m.voice_duration AS voiceDuration,
            m.file_url AS fileUrl, m.file_name AS fileName, m.file_size AS fileSize,
            m.file_safety AS fileSafety,
            (m.user_id = ?) AS isSelf, m.created_at AS createdAt, m.deleted_at AS deletedAt,
            m.recalled_by_user_id AS recalledByUserId,
            u.username,
            COALESCE(NULLIF(TRIM(cm.group_nickname), ''), u.nickname) AS nickname,
            u.nickname AS userNickname,
            u.avatar_url AS avatarUrl, u.chat_bubble_id AS chatBubbleId,
            u.avatar_frame_id AS avatarFrameId, u.badge_text AS badgeText, u.badge_color AS badgeColor,
            u.badges AS badges,
            b.name AS aiBotName, b.avatar_url AS aiBotAvatar
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = m.user_id
     LEFT JOIN ai_bots b ON b.id = m.ai_bot_id
     WHERE m.conversation_id = ?${extraClause}
     ORDER BY m.id ${order}
     LIMIT ?`,
    params
  )
  const list = (afterId ? rows : rows.reverse()).map((row) => mapMessageRow(row, userId))
  return { list, hasMore: rows.length === pageSize }
}

export const USER_SENDABLE_MESSAGE_TYPES = new Set([
  'text',
  'photo',
  'voice',
  'chat_history',
  'file',
  'group_share',
  'location',
  'photo_album',
  'video',
  'motion_photo'
])

const CHAT_HISTORY_MAX_ITEMS = 50
const PHOTO_ALBUM_MAX_ITEMS = 9

function normalizeMotionPhotoContent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('无效的实况图')
    }
  }
  if (!data || typeof data !== 'object') throw new Error('无效的实况图')
  const videoUrl = String(data.videoUrl || '').trim().slice(0, 500)
  if (
    !videoUrl ||
    (!videoUrl.startsWith('/media/') && !videoUrl.startsWith('/chat-video/'))
  ) {
    throw new Error('无效的实况视频地址')
  }
  const duration = Number(data.duration) || 0
  return JSON.stringify({
    videoUrl,
    duration: Number.isFinite(duration) ? duration : 0
  })
}

function normalizePhotoAlbumContent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('无效的图片相册')
    }
  }
  if (!data || typeof data !== 'object') throw new Error('无效的图片相册')
  const list = Array.isArray(data.urls)
    ? data.urls
    : Array.isArray(data.photos)
      ? data.photos
      : []
  const urls = []
  for (const item of list) {
    const u = String(item || '').trim().slice(0, 500)
    if (!u) continue
    if (!isAllowedUserPhotoUrl(u) && !u.startsWith('/media/')) {
      throw new Error('相册包含无效图片地址')
    }
    urls.push(u)
    if (urls.length >= PHOTO_ALBUM_MAX_ITEMS) break
  }
  if (urls.length < 2) throw new Error('合并展示至少需要 2 张图片')
  return JSON.stringify({ urls })
}

async function normalizeChatHistoryContent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('无效的聊天记录')
    }
  }
  if (!data || typeof data !== 'object') throw new Error('无效的聊天记录')
  const title = String(data.title || '聊天记录').trim().slice(0, 64) || '聊天记录'
  const list = Array.isArray(data.messages) ? data.messages : []
  if (!list.length) throw new Error('请选择要转发的消息')
  if (list.length > CHAT_HISTORY_MAX_ITEMS) {
    throw new Error(`最多转发 ${CHAT_HISTORY_MAX_ITEMS} 条消息`)
  }
  const messages = []
  for (const item of list) {
    const m = item && typeof item === 'object' ? item : {}
    const messageType = String(m.messageType || m.type || 'text').toLowerCase()
    let photoUrl = String(m.photoUrl || m.imageUrl || '').trim().slice(0, 500)
    const voiceUrl = String(m.voiceUrl || '').trim().slice(0, 500)
    if (photoUrl && !isAllowedUserPhotoUrl(photoUrl) && !photoUrl.startsWith('/media/')) {
      throw new Error('聊天记录包含无效图片地址')
    }
    if (
      voiceUrl &&
      !voiceUrl.startsWith('/media/Audio/') &&
      !voiceUrl.startsWith('/voice/')
    ) {
      throw new Error('聊天记录包含无效语音地址')
    }
    if (photoUrl && isAllowedExternalStickerUrl(photoUrl)) {
      try {
        photoUrl = await ensureLocalExternalSticker(photoUrl)
      } catch {
        // 保留原外链，由网页代理兜底
      }
    }
    messages.push({
      userId: Number(m.userId) || 0,
      nickname: String(m.nickname || m.username || '用户').trim().slice(0, 32) || '用户',
      avatarUrl: String(m.avatarUrl || '').trim().slice(0, 500),
      messageType: ['text', 'photo', 'voice'].includes(messageType) ? messageType : 'text',
      content: String(m.content || '').slice(0, 2000),
      photoUrl,
      voiceUrl,
      voiceDuration: Number(m.voiceDuration || m.duration) || 0,
      createdAt: String(m.createdAt || '').trim().slice(0, 40)
    })
  }
  return JSON.stringify({ title, messages })
}

function normalizeGroupShareContent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('无效的群名片')
    }
  }
  if (!data || typeof data !== 'object') throw new Error('无效的群名片')
  const groupId = Number(data.groupId || data.id || 0) || 0
  const groupCode = String(data.groupCode || data.code || '').trim().slice(0, 32)
  const title = String(data.title || '群聊').trim().slice(0, 64) || '群聊'
  let avatarUrl = String(data.avatarUrl || '').trim().slice(0, 500)
  const memberCount = Math.max(0, Math.min(100000, Number(data.memberCount) || 0))
  if (!groupCode && !groupId) throw new Error('无效的群名片')
  if (avatarUrl && !isAllowedUserPhotoUrl(avatarUrl) && !avatarUrl.startsWith('/media/')) {
    avatarUrl = ''
  }
  return JSON.stringify({ groupId, groupCode, title, avatarUrl, memberCount })
}

function normalizeLocationContent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('无效的位置')
    }
  }
  if (!data || typeof data !== 'object') throw new Error('无效的位置')
  const lat = Number(data.lat ?? data.latitude)
  const lng = Number(data.lng ?? data.longitude ?? data.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('无效的坐标')
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('无效的坐标')
  const title = String(data.title || data.name || '位置').trim().slice(0, 64) || '位置'
  const address = String(data.address || data.addr || '').trim().slice(0, 200)
  let mapPreviewUrl = String(data.mapPreviewUrl || data.previewUrl || '').trim().slice(0, 500)
  if (
    mapPreviewUrl &&
    !isAllowedUserPhotoUrl(mapPreviewUrl) &&
    !mapPreviewUrl.startsWith('/media/') &&
    !/^https?:\/\//i.test(mapPreviewUrl)
  ) {
    mapPreviewUrl = ''
  }
  return JSON.stringify({
    title,
    address,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    mapPreviewUrl
  })
}

export async function sendMessage(conversationId, userId, payload = {}, options = {}) {
  const contentRaw = payload.content ?? payload.text ?? ''
  let content =
    typeof contentRaw === 'string'
      ? contentRaw.trim()
      : contentRaw && typeof contentRaw === 'object'
        ? JSON.stringify(contentRaw)
        : String(contentRaw || '').trim()
  const rawType = String(payload.type ?? payload.messageType ?? 'text').toLowerCase()
  const messageType = rawType === 'image' ? 'photo' : rawType

  if (!options.allowSystemType && !USER_SENDABLE_MESSAGE_TYPES.has(messageType)) {
    const err = new Error('无效的消息类型')
    err.status = 403
    throw err
  }
  let imageUrl = String(payload.imageUrl ?? payload.photoUrl ?? '').trim()
  const voiceUrl = String(payload.voiceUrl ?? '').trim()
  const voiceDuration = Number(payload.voiceDuration ?? payload.duration ?? 0) || 0
  let fileUrl = String(payload.fileUrl ?? '').trim()
  let fileName = decodeUploadFilename(
    String(payload.fileName ?? payload.filename ?? '').trim()
  ).slice(0, 255)
  let fileSize = Number(payload.fileSize ?? payload.size ?? 0) || 0
  /** 服务端权威扫描，忽略客户端伪造 */
  let fileSafety = 'unknown'

  if (messageType === 'chat_history') {
    content = await normalizeChatHistoryContent(content)
    imageUrl = ''
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }

  if (messageType === 'group_share') {
    content = normalizeGroupShareContent(content)
    imageUrl = ''
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }

  if (messageType === 'location') {
    content = normalizeLocationContent(content)
    imageUrl = ''
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }

  if (messageType === 'photo_album') {
    content = normalizePhotoAlbumContent(content)
    try {
      const parsed = JSON.parse(content)
      imageUrl = String(parsed.urls?.[0] || '').trim()
    } catch {
      imageUrl = ''
    }
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }

  if (messageType === 'motion_photo') {
    content = normalizeMotionPhotoContent(content)
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }

  if (messageType === 'text' && !content) throw new Error('消息不能为空')
  if (messageType === 'chat_history' && !content) throw new Error('请选择要转发的消息')
  if (messageType === 'group_share' && !content) throw new Error('无效的群名片')
  if (messageType === 'location' && !content) throw new Error('无效的位置')
  if (messageType === 'photo_album' && !content) throw new Error('无效的图片相册')
  if (messageType === 'announcement' && !content && !imageUrl) throw new Error('群公告不能为空')
  if (messageType === 'multi_chat_invite' && !content) throw new Error('无效的邀请')
  if (messageType === 'draw_guess_invite' && !content) throw new Error('无效的邀请')
  if (messageType === 'multi_chat_live' && !content) throw new Error('无效的直播通知')
  if (messageType === 'photo' && !imageUrl) throw new Error('图片地址不能为空')
  if (messageType === 'motion_photo' && !imageUrl) throw new Error('实况图地址不能为空')
  if (messageType === 'video') {
    if (!imageUrl) throw new Error('视频地址不能为空')
    if (!isAllowedUserVideoUrl(imageUrl)) throw new Error('无效的视频地址')
    if (!content) content = '[视频]'
    fileUrl = ''
    fileName = ''
    fileSize = 0
    fileSafety = 'unknown'
  }
  if (messageType === 'voice' && !voiceUrl) throw new Error('语音地址不能为空')
  if (messageType === 'file') {
    if (!fileUrl) throw new Error('文件地址不能为空')
    if (!isAllowedUserFileUrl(fileUrl)) throw new Error('无效的文件地址')
    if (!fileName) {
      try {
        fileName = decodeURIComponent(fileUrl.split('/').pop() || '') || '文件'
      } catch {
        fileName = '文件'
      }
    }
    if (!content) content = fileName
    imageUrl = ''
    try {
      const scanned = scanGroupFileUrl(fileUrl, fileName)
      fileSafety = normalizeFileSafety(scanned.safety)
    } catch {
      fileSafety = 'unknown'
    }
  }
  if (imageUrl && messageType !== 'video' && !isAllowedUserPhotoUrl(imageUrl)) {
    throw new Error('无效的图片地址')
  }
  if (
    voiceUrl &&
    !voiceUrl.startsWith('/media/Audio/') &&
    !voiceUrl.startsWith('/voice/')
  ) {
    throw new Error('无效的语音地址')
  }
  if (fileUrl && messageType !== 'file' && !isAllowedUserFileUrl(fileUrl)) {
    throw new Error('无效的文件地址')
  }

  // 外链表情发送时落到本机，接收方直接读本地图，避免每人再绕远程 CDN
  if (messageType === 'photo' && isAllowedExternalStickerUrl(imageUrl)) {
    try {
      imageUrl = await ensureLocalExternalSticker(imageUrl)
    } catch (e) {
      const err = new Error(e?.message || '表情包下载失败，请稍后重试')
      err.status = e?.status || 502
      throw err
    }
  }

  if (messageType === 'text' || messageType === 'announcement') {
    assertChatMessageContent(content)
  } else if (messageType === 'voice' && content) {
    assertNoXssPayload(content, { field: '消息', allowEmpty: true })
  }

  assertConnected()
  // 全站禁言：群聊/私聊等用户发言（系统/管家消息不拦截）
  if (!options.allowSystemType) {
    assertUserRestrictionAllowed(userId, 'chatMute')
  }
  await assertConversationMember(conversationId, userId)
  await assertGroupSendAllowed(conversationId, userId)
  if (messageType === 'file') {
    await assertGroupFileUploadAllowed(conversationId, userId)
  }

  let storedContent = messageType === 'voice' ? content || '[语音]' : content
  if (messageType === 'file') storedContent = content || fileName || '[文件]'
  storedContent = maskMessageContent(storedContent, messageType)

  const preview = previewForMessage(messageType, storedContent, imageUrl, voiceUrl)
  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, image_url, voice_url, voice_duration, file_url, file_name, file_size, file_safety, is_self)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      conversationId,
      userId,
      storedContent,
      messageType,
      imageUrl || null,
      voiceUrl || null,
      messageType === 'voice' ? voiceDuration : null,
      messageType === 'file' ? fileUrl || null : null,
      messageType === 'file' ? fileName || null : null,
      messageType === 'file' ? fileSize || null : null,
      messageType === 'file' ? fileSafety : 'unknown'
    ]
  )
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    conversationId
  ])
  await markConversationReadForUser(userId, conversationId)
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl,
            m.voice_url AS voiceUrl, m.voice_duration AS voiceDuration,
            m.file_url AS fileUrl, m.file_name AS fileName, m.file_size AS fileSize,
            m.file_safety AS fileSafety,
            m.created_at AS createdAt,
            u.username,
            COALESCE(NULLIF(TRIM(cm.group_nickname), ''), u.nickname) AS nickname,
            u.nickname AS userNickname,
            u.avatar_url AS avatarUrl,
            u.chat_bubble_id AS chatBubbleId, u.avatar_frame_id AS avatarFrameId,
            u.badge_text AS badgeText, u.badge_color AS badgeColor, u.badges AS badges
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = m.user_id
     WHERE m.id = ?`,
    [result.insertId]
  )
  return mapMessageRow(rows[0], userId)
}

export async function getConversationFileUsageBytes(conversationId) {
  assertConnected()
  const policy = await getConversationFilePolicy(conversationId)
  const retentionCutoff = new Date(Date.now() - policy.retentionMs)
  const [rows] = await mysqlPool.query(
    `SELECT COALESCE(SUM(file_size), 0) AS used
     FROM messages
     WHERE conversation_id = ?
       AND message_type = 'file'
       AND deleted_at IS NULL
       AND file_url IS NOT NULL
       AND created_at >= ?`,
    [Number(conversationId), retentionCutoff]
  )
  return Number(rows[0]?.used || 0) || 0
}

/** 按会话类型返回文件保留/配额策略：群聊 7 天，私聊 1 天 */
export async function getConversationFilePolicy(conversationId) {
  assertConnected()
  const cid = Number(conversationId)
  const [rows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [cid]
  )
  const convType = String(rows[0]?.convType || 'direct').toLowerCase()
  const isGroup = convType === 'group'
  return {
    convType: isGroup ? 'group' : 'direct',
    retentionMs: isGroup ? GROUP_FILE_RETENTION_MS : DIRECT_FILE_RETENTION_MS,
    retentionDays: isGroup ? GROUP_FILE_RETENTION_DAYS : DIRECT_FILE_RETENTION_DAYS,
    quotaBytes: GROUP_FILE_QUOTA_BYTES,
    maxFileBytes: GROUP_FILE_MAX_BYTES
  }
}

export async function assertGroupFileQuota(conversationId, incomingBytes = 0) {
  const size = Number(incomingBytes) || 0
  if (size <= 0) throw new Error('无效的文件大小')
  if (size > GROUP_FILE_MAX_BYTES) {
    throw new Error('单个文件不能超过 5GB')
  }
  // 上传前先清理过期文件，释放配额
  await purgeExpiredGroupFiles({ conversationId })
  const used = await getConversationFileUsageBytes(conversationId)
  if (used + size > GROUP_FILE_QUOTA_BYTES) {
    throw new Error('文件空间不足（上限 8GB）')
  }
  return { used, quota: GROUP_FILE_QUOTA_BYTES, maxFile: GROUP_FILE_MAX_BYTES }
}

function unlinkGroupFileByUrl(fileUrl) {
  const filename = groupFileUrlToFilename(fileUrl)
  if (!filename) return false
  try {
    deleteGroupFileOnDisk(filename)
    return true
  } catch {
    return false
  }
}

/**
 * 清理超过保留期的会话文件（群聊 7 天 / 私聊 1 天）：删磁盘并清空 file_url，
 * 保留气泡（文件名/大小），不设 deleted_at，避免显示成「撤回」。
 * @param {{ conversationId?: number }} [options]
 * @returns {Promise<{ purged: number }>}
 */
export async function purgeExpiredGroupFiles(options = {}) {
  assertConnected()
  const groupCutoff = new Date(Date.now() - GROUP_FILE_RETENTION_MS)
  const directCutoff = new Date(Date.now() - DIRECT_FILE_RETENTION_MS)
  const cid = Number(options.conversationId || 0)
  const params = [groupCutoff, directCutoff]
  let convClause = ''
  if (cid > 0) {
    convClause = ' AND m.conversation_id = ?'
    params.push(cid)
  }
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.file_url AS fileUrl
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.message_type = 'file'
       AND m.deleted_at IS NULL
       AND m.file_url IS NOT NULL
       AND (
         (c.conv_type = 'group' AND m.created_at < ?)
         OR ((c.conv_type IS NULL OR c.conv_type <> 'group') AND m.created_at < ?)
       )
       ${convClause}
     ORDER BY m.id ASC
     LIMIT 500`,
    params
  )
  let purged = 0
  for (const row of rows) {
    unlinkGroupFileByUrl(row.fileUrl)
    await mysqlPool.query(
      `UPDATE messages
       SET file_url = NULL
       WHERE id = ? AND deleted_at IS NULL AND message_type = 'file'`,
      [row.id]
    )
    purged += 1
  }
  return { purged }
}

/**
 * 把「过期自动清理」误标成撤回的文件消息恢复为可见气泡（仅保留名/大小，无下载地址）。
 * 与真人手动撤回区分：recalled_by_user_id 为空，且创建时间已超过保留期（撤回窗口仅 2 分钟）。
 */
export async function restoreAutoExpiredFileMessages(options = {}) {
  assertConnected()
  const groupCutoff = new Date(Date.now() - GROUP_FILE_RETENTION_MS)
  const directCutoff = new Date(Date.now() - DIRECT_FILE_RETENTION_MS)
  const cid = Number(options.conversationId || 0)
  const params = [groupCutoff, directCutoff]
  let convClause = ''
  if (cid > 0) {
    convClause = ' AND m.conversation_id = ?'
    params.push(cid)
  }
  const [result] = await mysqlPool.query(
    `UPDATE messages m
     JOIN conversations c ON c.id = m.conversation_id
     SET m.deleted_at = NULL,
         m.file_url = NULL,
         m.file_name = COALESCE(NULLIF(TRIM(m.file_name), ''), NULLIF(TRIM(m.content), ''), '文件'),
         m.content = COALESCE(NULLIF(TRIM(m.content), ''), NULLIF(TRIM(m.file_name), ''), '文件')
     WHERE m.message_type = 'file'
       AND m.deleted_at IS NOT NULL
       AND m.recalled_by_user_id IS NULL
       AND (
         (c.conv_type = 'group' AND m.created_at < ?)
         OR ((c.conv_type IS NULL OR c.conv_type <> 'group') AND m.created_at < ?)
       )
       ${convClause}`,
    params
  )
  return { restored: Number(result?.affectedRows || 0) }
}

export async function listConversationFiles(conversationId, userId, { query = '' } = {}) {
  assertConnected()
  await assertConversationMember(conversationId, userId)
  await purgeExpiredGroupFiles({ conversationId })
  const policy = await getConversationFilePolicy(conversationId)
  const retentionCutoff = new Date(Date.now() - policy.retentionMs)
  const q = String(query || '').trim()
  const params = [Number(conversationId), retentionCutoff]
  let nameClause = ''
  if (q) {
    nameClause = ' AND (m.file_name LIKE ? OR m.content LIKE ?)'
    const like = `%${q.replace(/[%_]/g, '')}%`
    params.push(like, like)
  }
  const [rows] = await mysqlPool.query(
    `SELECT m.id AS messageId, m.file_url AS fileUrl, m.file_name AS fileName, m.file_size AS fileSize,
            m.file_safety AS fileSafety,
            m.created_at AS createdAt, m.user_id AS userId,
            u.nickname, u.username
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ?
       AND m.message_type = 'file'
       AND m.deleted_at IS NULL
       AND m.file_url IS NOT NULL
       AND m.created_at >= ?
       ${nameClause}
     ORDER BY m.id DESC
     LIMIT 500`,
    params
  )
  const usedBytes = await getConversationFileUsageBytes(conversationId)
  const list = rows.map((row) => {
    const createdMs = new Date(row.createdAt).getTime()
    const expiresAtMs = Number.isFinite(createdMs)
      ? createdMs + policy.retentionMs
      : Date.now() + policy.retentionMs
    return {
      messageId: row.messageId,
      fileUrl: row.fileUrl || '',
      fileName: decodeUploadFilename(row.fileName || row.content || '') || row.fileName || row.content || '文件',
      fileSize: Number(row.fileSize || 0) || 0,
      fileSafety: normalizeFileSafety(row.fileSafety),
      createdAt: row.createdAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      userId: row.userId,
      senderName: row.nickname || row.username || '用户'
    }
  })
  return {
    list,
    usedBytes,
    quotaBytes: policy.quotaBytes,
    maxFileBytes: policy.maxFileBytes,
    retentionDays: policy.retentionDays,
    convType: policy.convType
  }
}

/**
 * 删除会话文件：群聊需群主/管理员；私聊双方均可删。
 */
export async function deleteConversationFile(conversationId, userId, messageId) {
  assertConnected()
  const cid = Number(conversationId)
  const mid = Number(messageId)
  const uid = Number(userId)
  if (!cid || !mid || !uid) throw new Error('无效的参数')

  const [convRows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [cid]
  )
  if (!convRows.length) throw new Error('会话不存在')
  const isGroup = String(convRows[0].convType || '').toLowerCase() === 'group'
  if (isGroup) {
    await assertGroupModerator(cid, uid, '删除群文件')
  } else {
    await assertConversationMember(cid, uid)
  }

  const [rows] = await mysqlPool.query(
    `SELECT id, message_type AS messageType, file_url AS fileUrl, deleted_at AS deletedAt
     FROM messages
     WHERE id = ? AND conversation_id = ?
     LIMIT 1`,
    [mid, cid]
  )
  if (!rows.length) throw new Error('文件不存在')
  const row = rows[0]
  if (row.deletedAt) throw new Error('文件已删除')
  if (String(row.messageType || '').toLowerCase() !== 'file') {
    throw new Error('不是文件消息')
  }

  const fileUrl = String(row.fileUrl || '').trim()
  if (fileUrl) unlinkGroupFileByUrl(fileUrl)

  await mysqlPool.query(
    `UPDATE messages
     SET deleted_at = NOW(), recalled_by_user_id = ?, content = '', image_url = NULL, voice_url = NULL, voice_duration = NULL,
         file_url = NULL, file_name = NULL, file_size = NULL, file_safety = 'unknown'
     WHERE id = ?`,
    [uid, mid]
  )

  const lastMessage = await syncConversationLastMessage(cid)
  return { messageId: mid, lastMessage }
}

export async function notifyGroupMentionsForMessage(conversationId, senderUserId, content) {
  assertConnected()
  const cid = Number(conversationId)
  const senderId =
    senderUserId === null || senderUserId === undefined ? null : Number(senderUserId)
  if (!cid || (senderUserId !== null && senderUserId !== undefined && !senderId)) return []

  const [convRows] = await mysqlPool.query(
    `SELECT conv_type AS convType, title FROM conversations WHERE id = ? LIMIT 1`,
    [cid]
  )
  if (!convRows.length || convRows[0].convType !== 'group') return []

  const [members] = await mysqlPool.query(
    `SELECT u.id, u.username,
            COALESCE(NULLIF(TRIM(cm.group_nickname), ''), u.nickname) AS nickname
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?`,
    [cid]
  )
  const mentionedIds = resolveMentionedUserIdsFromMembers(members, senderId, content)
  if (!mentionedIds.length) return []

  const sender = senderId ? await findUserById(senderId) : null
  const senderName = sender?.nickname || sender?.username || BUTLER_NAME
  const groupTitle = convRows[0].title || '群聊'
  const notifyContent =
    senderId != null
      ? `${senderName}在「${groupTitle}」群聊艾特了你`
      : `${BUTLER_NAME}在「${groupTitle}」群聊艾特了你`

  const notifiedUserIds = []
  for (const targetId of mentionedIds) {
    await createNotification({
      userId: targetId,
      type: 'group_mention',
      title: '群聊@提醒',
      content: notifyContent,
      relatedId: cid,
      actorUserId: senderId
    })
    notifiedUserIds.push(targetId)
  }
  return notifiedUserIds
}

const RECALLABLE_MESSAGE_TYPES = new Set([
  'text',
  'photo',
  'voice',
  'file',
  'video',
  'photo_album',
  'motion_photo'
])
const MESSAGE_RECALL_WINDOW_MS = 2 * 60 * 1000

function chatImageUrlToFilename(imageUrl) {
  const url = String(imageUrl || '').trim().replace(/\\/g, '/')
  const mediaPrefix = `${CHAT_IMAGE_URL_PREFIX}/`
  if (url.startsWith(mediaPrefix)) {
    try {
      return path.basename(decodeURIComponent(url.slice(mediaPrefix.length)))
    } catch {
      return path.basename(url.slice(mediaPrefix.length))
    }
  }
  if (url.startsWith('/chat-image/')) {
    try {
      return path.basename(decodeURIComponent(url.slice('/chat-image/'.length)))
    } catch {
      return path.basename(url.slice('/chat-image/'.length))
    }
  }
  return null
}

function deleteChatPhotoByUrl(imageUrl) {
  const filename = chatImageUrlToFilename(imageUrl)
  if (!filename) return
  try {
    deleteChatPhoto(filename)
  } catch (e) {
    if (!/不存在/.test(String(e.message || ''))) throw e
  }
}

async function syncConversationLastMessage(conversationId) {
  const [rows] = await mysqlPool.query(
    `SELECT message_type AS messageType, content, image_url AS imageUrl, voice_url AS voiceUrl,
            deleted_at AS deletedAt, user_id AS userId, recalled_by_user_id AS recalledByUserId
     FROM messages
     WHERE conversation_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [conversationId]
  )
  let preview = ''
  if (rows[0]) {
    if (rows[0].deletedAt) {
      if (rows[0].recalledByUserId) preview = '群主撤回了成员的一条消息'
      else preview = '撤回了一条消息'
    } else {
      preview = previewForMessage(
        rows[0].messageType,
        rows[0].content,
        rows[0].imageUrl,
        rows[0].voiceUrl
      )
    }
  }
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    conversationId
  ])
  return preview
}

export async function recallMessage(conversationId, userId, messageId) {
  assertConnected()
  const cid = Number(conversationId)
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!cid || !uid || !mid) throw new Error('无效的参数')

  await assertConversationMember(cid, uid)

  const [msgRows] = await mysqlPool.query(
    `SELECT id, conversation_id AS conversationId, user_id AS userId, content,
            message_type AS messageType, image_url AS imageUrl,
            voice_url AS voiceUrl, voice_duration AS voiceDuration,
            file_url AS fileUrl,
            created_at AS createdAt, deleted_at AS deletedAt
     FROM messages
     WHERE id = ? AND conversation_id = ?
     LIMIT 1`,
    [mid, cid]
  )
  if (!msgRows.length) throw new Error('消息不存在')
  const row = msgRows[0]
  if (row.deletedAt) throw new Error('消息已撤回')

  const [convRows] = await mysqlPool.query(
    `SELECT conv_type AS convType, owner_id AS ownerId FROM conversations WHERE id = ? LIMIT 1`,
    [cid]
  )
  const conv = convRows[0]
  const isGroupOwner = conv?.convType === 'group' && Number(conv.ownerId) === uid
  const isOwnMessage = Number(row.userId) === uid

  if (!isOwnMessage) {
    if (!isGroupOwner) {
      const err = new Error('只能撤回自己的消息')
      err.status = 403
      throw err
    }
  } else {
    // 自己的消息：一律 2 分钟内可撤回（群主也不例外）
    const createdAt = new Date(row.createdAt).getTime()
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > MESSAGE_RECALL_WINDOW_MS) {
      throw new Error('已超过撤回时限（2分钟）')
    }
  }

  const type = String(row.messageType || 'text').toLowerCase()
  if (!RECALLABLE_MESSAGE_TYPES.has(type)) throw new Error('该消息不支持撤回')

  const recalledByUserId = isGroupOwner && !isOwnMessage ? uid : null

  const imageUrl = String(row.imageUrl || '').trim()
  if (type === 'photo' && imageUrl) {
    deleteChatPhotoByUrl(imageUrl)
  }
  const fileUrl = String(row.fileUrl || '').trim()
  if (type === 'file' && fileUrl) {
    unlinkGroupFileByUrl(fileUrl)
  }

  await mysqlPool.query(
    `UPDATE messages
     SET deleted_at = NOW(), recalled_by_user_id = ?, content = '', image_url = NULL, voice_url = NULL, voice_duration = NULL,
         file_url = NULL, file_name = NULL, file_size = NULL, file_safety = 'unknown'
     WHERE id = ?`,
    [recalledByUserId, mid]
  )

  const lastMessage = await syncConversationLastMessage(cid)

  const [updatedRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl,
            m.voice_url AS voiceUrl, m.voice_duration AS voiceDuration,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            m.recalled_by_user_id AS recalledByUserId,
            u.username,
            COALESCE(NULLIF(TRIM(cm.group_nickname), ''), u.nickname) AS nickname,
            u.nickname AS userNickname,
            u.avatar_url AS avatarUrl, u.chat_bubble_id AS chatBubbleId,
            u.avatar_frame_id AS avatarFrameId, u.badge_text AS badgeText, u.badge_color AS badgeColor,
            u.badges AS badges
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = m.user_id
     WHERE m.id = ?`,
    [mid]
  )

  return {
    message: mapMessageRow(updatedRows[0], uid),
    lastMessage
  }
}

export async function getConversationMemberIds(conversationId) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
    [conversationId]
  )
  return rows.map((row) => row.user_id)
}

export async function getConversationConvType(conversationId) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    'SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1',
    [conversationId]
  )
  if (!rows.length) return null
  return rows[0].convType || 'direct'
}

export async function getBrowseMeta() {
  assertConnected()
  const dbName = activeConfig.database
  const [rows] = await mysqlPool.query('SHOW TABLES')
  const key = `Tables_in_${dbName}`
  const existing = new Set(rows.map((r) => r[key]))
  return {
    database: dbName,
    tables: BUSINESS_TABLES.map((name) => ({
      name,
      exists: existing.has(name),
      desc: BUSINESS_TABLE_DESCRIPTIONS[name] || name
    }))
  }
}

export const CLEAR_DATABASE_CONFIRM_PHRASE = '我已确认删除数据库所有内容'

export async function clearAllDatabaseData() {
  assertConnected()
  const dbName = activeConfig.database
  const [rows] = await mysqlPool.query('SHOW TABLES')
  const key = `Tables_in_${dbName}`
  const tables = rows.map((r) => String(r[key] || '')).filter(Boolean)
  if (tables.length === 0) {
    return { clearedTables: 0, database: dbName, message: '数据库中没有可清理的表' }
  }

  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tables) {
      const safeName = table.replace(/[^a-zA-Z0-9_]/g, '')
      if (!safeName) continue
      await conn.query(`TRUNCATE TABLE \`${safeName}\``)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    await conn.commit()
  } catch (e) {
    await conn.rollback().catch(() => {})
    throw e
  } finally {
    conn.release()
  }

  return {
    clearedTables: tables.length,
    database: dbName,
    message: `已清空数据库「${dbName}」中 ${tables.length} 张表的全部数据（表结构保留）`
  }
}

export const DB_JSON_EXPORT_FORMAT = 'xhamil-db-export'
export const DB_JSON_EXPORT_VERSION = 1
export const IMPORT_DATABASE_REPLACE_CONFIRM_PHRASE = '我已确认导入并覆盖数据'

function jsonSafeCell(value) {
  if (value == null) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return { __xhamil_buf: value.toString('base64') }
  return value
}

function reviveCell(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.__xhamil_buf === 'string') {
    return Buffer.from(value.__xhamil_buf, 'base64')
  }
  return value
}

function normalizeExportTableNames(input) {
  if (input == null || input === '') return [...BUSINESS_TABLES]
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  const names = []
  for (const raw of list) {
    const name = String(raw).replace(/[^a-zA-Z0-9_]/g, '')
    if (!name) continue
    if (!BUSINESS_TABLES.includes(name)) {
      throw new Error(`不允许导出表：${raw}`)
    }
    if (!names.includes(name)) names.push(name)
  }
  if (!names.length) throw new Error('请至少选择一张业务表')
  return names
}

/** 导出业务表数据为可迁移 JSON（不含媒体文件） */
export async function exportDatabaseJson({ tables } = {}) {
  assertConnected()
  const tableNames = normalizeExportTableNames(tables)
  const [showRows] = await mysqlPool.query('SHOW TABLES')
  const key = `Tables_in_${activeConfig.database}`
  const existing = new Set(showRows.map((r) => r[key]))

  const outTables = {}
  const counts = {}
  for (const name of tableNames) {
    if (!existing.has(name)) {
      outTables[name] = []
      counts[name] = 0
      continue
    }
    const [rows] = await mysqlPool.query(`SELECT * FROM \`${name}\``)
    outTables[name] = rows.map((row) => {
      const item = {}
      for (const [col, val] of Object.entries(row)) item[col] = jsonSafeCell(val)
      return item
    })
    counts[name] = outTables[name].length
  }

  return {
    format: DB_JSON_EXPORT_FORMAT,
    version: DB_JSON_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    database: activeConfig.database,
    tableOrder: tableNames,
    counts,
    tables: outTables
  }
}

/** 从导出 JSON 导入业务表；mode=replace 先清空再写入，merge 按主键/唯一键冲突更新 */
export async function importDatabaseJson(payload, { mode = 'replace' } = {}) {
  assertConnected()
  const data = payload && typeof payload === 'object' ? payload : null
  if (!data || data.format !== DB_JSON_EXPORT_FORMAT) {
    throw new Error('无效的导出文件：缺少 format=xhamil-db-export')
  }
  const tablesObj = data.tables && typeof data.tables === 'object' ? data.tables : null
  if (!tablesObj) throw new Error('无效的导出文件：缺少 tables')

  const importMode = String(mode || 'replace').toLowerCase() === 'merge' ? 'merge' : 'replace'
  const requested =
    Array.isArray(data.tableOrder) && data.tableOrder.length
      ? data.tableOrder.map((n) => String(n))
      : Object.keys(tablesObj)
  const tableNames = normalizeExportTableNames(requested.filter((n) => Object.prototype.hasOwnProperty.call(tablesObj, n)))

  // 确保表结构存在
  await initDatabaseTables()

  const conn = await mysqlPool.getConnection()
  const inserted = {}
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')

    if (importMode === 'replace') {
      for (const name of [...tableNames].reverse()) {
        await conn.query(`TRUNCATE TABLE \`${name}\``)
      }
    }

    for (const name of tableNames) {
      const rows = Array.isArray(tablesObj[name]) ? tablesObj[name] : []
      inserted[name] = 0
      if (!rows.length) continue

      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${name}\``)
      const colSet = new Set(cols.map((c) => c.Field))
      const batchSize = 100

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize)
        const keys = [
          ...new Set(
            chunk.flatMap((row) =>
              row && typeof row === 'object' ? Object.keys(row).filter((k) => colSet.has(k)) : []
            )
          )
        ]
        if (!keys.length) continue

        const placeholders = chunk.map(() => `(${keys.map(() => '?').join(',')})`).join(',')
        const values = []
        for (const row of chunk) {
          for (const k of keys) values.push(reviveCell(row?.[k] ?? null))
        }
        const colsSql = keys.map((k) => `\`${k}\``).join(',')
        let sql = `INSERT INTO \`${name}\` (${colsSql}) VALUES ${placeholders}`
        if (importMode === 'merge') {
          const updates = keys
            .filter((k) => k !== 'id')
            .map((k) => `\`${k}\`=VALUES(\`${k}\`)`)
            .join(', ')
          if (updates) sql += ` ON DUPLICATE KEY UPDATE ${updates}`
          else sql += ' ON DUPLICATE KEY UPDATE `id`=`id`'
        }
        await conn.query(sql, values)
        inserted[name] += chunk.length
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    await conn.commit()
  } catch (e) {
    await conn.rollback().catch(() => {})
    throw e
  } finally {
    conn.release()
  }

  const totalRows = Object.values(inserted).reduce((a, b) => a + b, 0)
  return {
    success: true,
    mode: importMode,
    database: activeConfig.database,
    tables: tableNames,
    inserted,
    totalRows,
    message:
      importMode === 'replace'
        ? `已覆盖导入 ${tableNames.length} 张表，共 ${totalRows} 行`
        : `已合并导入 ${tableNames.length} 张表，共 ${totalRows} 行`
  }
}

export async function getBrowseTable(tableName, limit = 100, offset = 0) {
  assertConnected()
  const safeName = String(tableName).replace(/[^a-zA-Z0-9_]/g, '')
  if (!BUSINESS_TABLES.includes(safeName)) {
    throw new Error('不允许浏览该表')
  }

  const [cols] = await mysqlPool.query(`SHOW COLUMNS FROM \`${safeName}\``)
  const columns = cols.map((c) => ({
    name: c.Field,
    type: c.Type,
    null: c.Null,
    key: c.Key,
    default: c.Default,
    extra: c.Extra
  }))
  const [countRows] = await mysqlPool.query(`SELECT COUNT(*) AS c FROM \`${safeName}\``)
  const total = countRows[0].c
  const [rows] = await mysqlPool.query(`SELECT * FROM \`${safeName}\` LIMIT ? OFFSET ?`, [limit, offset])
  return {
    database: activeConfig.database,
    table: safeName,
    total,
    limit,
    offset,
    columns,
    rows
  }
}

async function countTable(tableName) {
  const safeName = String(tableName).replace(/[^a-zA-Z0-9_]/g, '')
  if (!BUSINESS_TABLES.includes(safeName)) return 0
  try {
    const [rows] = await mysqlPool.query(`SELECT COUNT(*) AS c FROM \`${safeName}\``)
    return rows[0].c
  } catch {
    return 0
  }
}

export async function getStorageInfo() {
  const config = loadConfig()
  const status = getDbStatus()
  const counts = {}
  const existsMap = {}
  if (status.isConnected) {
    try {
      assertConnected()
      const [rows] = await mysqlPool.query('SHOW TABLES')
      const key = `Tables_in_${activeConfig.database}`
      const existing = new Set(rows.map((r) => r[key]))
      for (const table of BUSINESS_TABLES) {
        existsMap[table] = existing.has(table)
        counts[table] = existsMap[table] ? await countTable(table) : 0
      }
    } catch {
      for (const table of BUSINESS_TABLES) {
        existsMap[table] = false
        counts[table] = 0
      }
    }
  }
  const businessRows = BUSINESS_TABLES.map((key) => ({
    table: key,
    key,
    desc: BUSINESS_TABLE_DESCRIPTIONS[key] || key,
    count: counts[key] ?? 0,
    exists: existsMap[key] ?? false
  }))
  return {
    configFile: 'json/config.json',
    isConfigured: status.isConfigured,
    isConnected: status.isConnected,
    config: {
      hasAdmin: !!(config.admin?.username && config.admin?.password),
      adminUsername: config.admin?.username || 'admin',
      database: status.config
    },
    tables: businessRows,
    // 兼容旧前端字段名
    collections: businessRows,
    jsonSections: [
      { section: 'admin', desc: '单节点管理后台登录（仅存 JSON）' },
      { section: 'database', desc: 'MySQL 连接（仅存 JSON，聊天业务数据在 MySQL）' },
      { section: 'server', desc: '服务端口与监听地址' }
    ]
  }
}

const MESSAGE_TYPE_LABELS = {
  text: '文本',
  image: '图片',
  voice: '语音',
  sticker: '表情',
  announcement: '公告',
  system: '系统',
  draw_guess: '你画我猜',
  call: '通话',
  file: '文件'
}

const MESSAGE_TYPE_COLORS = {
  text: '#5D87FF',
  image: '#13DEB9',
  voice: '#FFAE1F',
  sticker: '#FA896B',
  announcement: '#49BEFF',
  system: '#909399',
  draw_guess: '#AD49FF',
  call: '#539BFF',
  file: '#6B7280'
}

function emptyDashboardOverview(isConnected = false) {
  return {
    isConnected,
    stats: {
      totalUsers: 0,
      todayUsers: 0,
      activeUsers: 0,
      bannedUsers: 0,
      totalGroups: 0,
      totalDirectChats: 0,
      totalConversations: 0,
      totalMessages: 0,
      todayMessages: 0,
      totalFriendships: 0,
      pendingFriendRequests: 0,
      aiBots: 0
    },
    messageTrend: [],
    messageTypes: [],
    clientInsights: buildBrowserInsights([]),
    weeklyHeatmap: buildWeeklyHeatmap([]),
    sessionDuration: buildSessionDuration([], 0),
    recentUsers: [],
    recentMessages: []
  }
}

function formatLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeSqlDayKey(day) {
  if (day == null || day === '') return ''
  if (day instanceof Date && !Number.isNaN(day.getTime())) return formatLocalDateKey(day)
  const text = String(day).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return formatLocalDateKey(parsed)
  return text.slice(0, 10)
}

function buildLast7DayTrend(rows) {
  if (Array.isArray(rows) && rows.length) {
    return rows.map((row) => {
      const key = normalizeSqlDayKey(row.day)
      const [, month, day] = key.split('-').map(Number)
      return {
        name: month && day ? `${month}/${day}` : key,
        value: Number(row.count) || 0
      }
    })
  }
  const trend = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    trend.push({
      name: `${d.getMonth() + 1}/${d.getDate()}`,
      value: 0
    })
  }
  return trend
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const HEATMAP_HOUR_LABELS = ['0时', '4时', '8时', '12时', '15时', '19时', '22时']

function heatmapHourSlot(hour) {
  const h = Number(hour) || 0
  if (h < 4) return 0
  if (h < 8) return 1
  if (h < 12) return 2
  if (h < 15) return 3
  if (h < 19) return 4
  if (h < 22) return 5
  return 6
}

function buildWeeklyHeatmap(rows) {
  const grid = Array.from({ length: 7 }, () => Array(7).fill(0))
  for (const row of rows) {
    const dow = Number(row.dow) || 1
    const col = dow - 1
    const slot = Number(row.hourSlot) || 0
    if (col >= 0 && col < 7 && slot >= 0 && slot < 7) {
      grid[slot][col] = Number(row.count) || 0
    }
  }
  let max = 0
  for (const row of grid) {
    for (const v of row) max = Math.max(max, v)
  }
  const cells = []
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      cells.push({
        day: WEEKDAY_LABELS[c],
        hour: HEATMAP_HOUR_LABELS[r],
        count: grid[r][c],
        level: max > 0 ? grid[r][c] / max : 0
      })
    }
  }
  return { days: WEEKDAY_LABELS, hours: HEATMAP_HOUR_LABELS, cells, max }
}

function formatDurationSeconds(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${String(s).padStart(2, '0')}秒`
}

function buildSessionDuration(sessionRows, prevAvgSeconds) {
  const byDow = new Map()
  for (const row of sessionRows) {
    byDow.set(Number(row.dow) || 1, {
      avgSeconds: Number(row.avgSeconds) || 0,
      sessions: Number(row.sessions) || 0
    })
  }
  let totalSec = 0
  let totalSessions = 0
  const daily = []
  for (let i = 0; i < 7; i += 1) {
    const dow = i + 1
    const row = byDow.get(dow) || { avgSeconds: 0, sessions: 0 }
    totalSec += row.avgSeconds * row.sessions
    totalSessions += row.sessions
    daily.push({ name: WEEKDAY_LABELS[i], avgSeconds: row.avgSeconds, sessions: row.sessions })
  }
  const avgSeconds = totalSessions > 0 ? Math.round(totalSec / totalSessions) : 0
  const maxBar = Math.max(...daily.map((d) => d.avgSeconds), 1)
  const dailyBars = daily.map((d) => ({
    name: d.name,
    value: Math.round((d.avgSeconds / maxBar) * 100),
    avgSeconds: d.avgSeconds,
    sessions: d.sessions
  }))
  let weekChangePercent = 0
  if (prevAvgSeconds > 0 && avgSeconds > 0) {
    weekChangePercent = Math.round(((avgSeconds - prevAvgSeconds) / prevAvgSeconds) * 1000) / 10
  }
  return {
    avgSeconds,
    avgLabel: formatDurationSeconds(avgSeconds),
    weekChangePercent,
    daily: dailyBars
  }
}

function messageTypeLabel(type) {
  const key = String(type || 'text').trim().toLowerCase()
  return MESSAGE_TYPE_LABELS[key] || key || '其他'
}

function previewMessageContent(row) {
  const type = String(row.messageType || row.message_type || 'text').toLowerCase()
  const content = String(row.content || '').trim()
  if (type === 'image') return content || '[图片]'
  if (type === 'voice') return '[语音]'
  if (type === 'sticker') return '[表情]'
  if (type === 'announcement') return content || '[群公告]'
  if (type === 'draw_guess') return '[你画我猜]'
  if (type === 'call') return '[通话]'
  if (!content) return `[${messageTypeLabel(type)}]`
  return content.length > 80 ? `${content.slice(0, 80)}…` : content
}

export async function getAdminDashboardOverview() {
  const status = getDbStatus()
  if (!status.isConnected) return emptyDashboardOverview(false)

  try {
    assertConnected()

    const [[userStats]] = await mysqlPool.query(`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayUsers,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS bannedUsers
      FROM users
    `)

    const [[convStats]] = await mysqlPool.query(`
      SELECT
        COUNT(*) AS totalConversations,
        SUM(CASE WHEN conv_type = 'group' THEN 1 ELSE 0 END) AS totalGroups,
        SUM(CASE WHEN conv_type IS NULL OR conv_type = 'direct' THEN 1 ELSE 0 END) AS totalDirectChats
      FROM conversations
    `)

    const [[msgStats]] = await mysqlPool.query(`
      SELECT
        COUNT(*) AS totalMessages,
        SUM(
          CASE
            WHEN DATE(created_at) = CURDATE() AND deleted_at IS NULL THEN 1
            ELSE 0
          END
        ) AS todayMessages
      FROM messages
    `)

    const [[friendStats]] = await mysqlPool.query(`
      SELECT
        (SELECT COUNT(*) FROM friendships) AS totalFriendships,
        (SELECT COUNT(*) FROM friend_requests WHERE status = 'pending') AS pendingFriendRequests
    `)

    let aiBots = 0
    try {
      const [[aiBotRow]] = await mysqlPool.query('SELECT COUNT(*) AS c FROM ai_bots')
      aiBots = Number(aiBotRow.c) || 0
    } catch {
      aiBots = 0
    }

    const [trendRows] = await mysqlPool.query(`
      SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS day, COALESCE(c.count, 0) AS count
      FROM (
        SELECT DATE_SUB(CURDATE(), INTERVAL seq DAY) AS day
        FROM (
          SELECT 0 AS seq UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
          SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
        ) AS days
      ) AS d
      LEFT JOIN (
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM messages
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          AND deleted_at IS NULL
        GROUP BY DATE(created_at)
      ) AS c ON c.day = d.day
      ORDER BY d.day ASC
    `)

    const [typeRows] = await mysqlPool.query(`
      SELECT message_type AS type, COUNT(*) AS count
      FROM messages
      GROUP BY message_type
      ORDER BY count DESC
      LIMIT 8
    `)

    const [heatmapRows] = await mysqlPool.query(`
      SELECT
        DAYOFWEEK(created_at) AS dow,
        CASE
          WHEN HOUR(created_at) < 4 THEN 0
          WHEN HOUR(created_at) < 8 THEN 1
          WHEN HOUR(created_at) < 12 THEN 2
          WHEN HOUR(created_at) < 15 THEN 3
          WHEN HOUR(created_at) < 19 THEN 4
          WHEN HOUR(created_at) < 22 THEN 5
          ELSE 6
        END AS hourSlot,
        COUNT(*) AS count
      FROM messages
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY dow, hourSlot
    `)

    const [sessionRows] = await mysqlPool.query(`
      SELECT
        DAYOFWEEK(d) AS dow,
        AVG(session_seconds) AS avgSeconds,
        COUNT(*) AS sessions
      FROM (
        SELECT
          DATE(created_at) AS d,
          conversation_id,
          user_id,
          TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS session_seconds,
          COUNT(*) AS msg_count
        FROM messages
        WHERE user_id IS NOT NULL
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(created_at), conversation_id, user_id
        HAVING msg_count >= 2 AND session_seconds > 0
      ) AS sessions
      GROUP BY DAYOFWEEK(d)
    `)

    const [[prevSessionRow]] = await mysqlPool.query(`
      SELECT AVG(session_seconds) AS avgSeconds
      FROM (
        SELECT
          TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS session_seconds,
          COUNT(*) AS msg_count
        FROM messages
        WHERE user_id IS NOT NULL
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
          AND created_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(created_at), conversation_id, user_id
        HAVING msg_count >= 2 AND session_seconds > 0
      ) AS sessions
    `)

    const [browserRows] = await mysqlPool.query(`
      SELECT last_browser AS browser, COUNT(*) AS count
      FROM users
      WHERE status = 'active' AND last_browser IS NOT NULL AND last_browser != ''
      GROUP BY last_browser
      ORDER BY count DESC
    `)

    const typeTotal = typeRows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1
    const messageTypes = typeRows.map((row) => {
      const type = String(row.type || 'text')
      const count = Number(row.count) || 0
      return {
        name: messageTypeLabel(type),
        type,
        count,
        value: Math.round((count / typeTotal) * 1000) / 10,
        color: MESSAGE_TYPE_COLORS[type] || '#5D87FF'
      }
    })

    const [recentUserRows] = await mysqlPool.query(`
      SELECT id, chat_no AS chatNo, username, nickname, avatar_url AS avatarUrl, status, created_at AS createdAt
      FROM users
      ORDER BY id DESC
      LIMIT 8
    `)

    const [recentMessageRows] = await mysqlPool.query(`
      SELECT
        m.id,
        m.content,
        m.message_type AS messageType,
        m.created_at AS createdAt,
        u.nickname,
        u.username,
        c.title AS conversationTitle,
        c.conv_type AS convType
      FROM messages m
      LEFT JOIN users u ON u.id = m.user_id
      JOIN conversations c ON c.id = m.conversation_id
      ORDER BY m.id DESC
      LIMIT 10
    `)

    return {
      isConnected: true,
      stats: {
        totalUsers: Number(userStats.totalUsers) || 0,
        todayUsers: Number(userStats.todayUsers) || 0,
        activeUsers: Number(userStats.activeUsers) || 0,
        bannedUsers: Number(userStats.bannedUsers) || 0,
        totalGroups: Number(convStats.totalGroups) || 0,
        totalDirectChats: Number(convStats.totalDirectChats) || 0,
        totalConversations: Number(convStats.totalConversations) || 0,
        totalMessages: Number(msgStats.totalMessages) || 0,
        todayMessages: Number(msgStats.todayMessages) || 0,
        totalFriendships: Number(friendStats.totalFriendships) || 0,
        pendingFriendRequests: Number(friendStats.pendingFriendRequests) || 0,
        aiBots
      },
      messageTrend: buildLast7DayTrend(trendRows),
      messageTypes,
      clientInsights: buildBrowserInsights(browserRows),
      weeklyHeatmap: buildWeeklyHeatmap(heatmapRows),
      sessionDuration: buildSessionDuration(
        sessionRows,
        Number(prevSessionRow?.avgSeconds) || 0
      ),
      recentUsers: recentUserRows.map((row) => ({
        id: row.id,
        chatNo: row.chatNo,
        username: row.username,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
        status: row.status,
        isBanned: row.status === 'banned',
        createdAt: row.createdAt
      })),
      recentMessages: recentMessageRows.map((row) => ({
        id: row.id,
        content: previewMessageContent(row),
        messageType: row.messageType,
        messageTypeLabel: messageTypeLabel(row.messageType),
        createdAt: row.createdAt,
        userName: (row.nickname || row.username || '系统').trim(),
        conversationTitle: row.conversationTitle || '—',
        convType: row.convType || 'direct'
      }))
    }
  } catch {
    return emptyDashboardOverview(true)
  }
}

/** 供节点管理后台使用的公开聊天快照（不含管理配置） */
export async function getHubStatsSnapshot() {
  const overview = await getAdminDashboardOverview()
  return {
    ok: true,
    isConnected: overview.isConnected !== false,
    stats: overview.stats || zeroStatsFromEmpty(),
    messageTrend: overview.messageTrend || [],
    recentMessages: (overview.recentMessages || []).slice(0, 8)
  }
}

function zeroStatsFromEmpty() {
  return emptyDashboardOverview(false).stats
}

export async function checkDatabaseTables() {
  const meta = await getBrowseMeta()
  const present = meta.tables.filter((t) => t.exists).map((t) => t.name)
  const missing = meta.tables.filter((t) => !t.exists).map((t) => t.name)
  return {
    success: true,
    total: BUSINESS_TABLES.length,
    presentCount: present.length,
    missingCount: missing.length,
    present,
    missing
  }
}

export async function initDatabaseTables() {
  assertConnected()
  await runCreateStatements(mysqlPool)
  await seedIfEmpty()
  return { success: true, message: '业务表已创建/升级到最新结构', tables: BUSINESS_TABLES }
}

export async function testDatabaseConnection(input) {
  const pool = createPool({
    type: 'mysql',
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database,
    charset: input.charset
  })
  try {
    await pool.query('SELECT 1')
    return { success: true, message: '连接测试成功' }
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function setDatabaseConfig(input) {
  const current = loadConfig()
  const password =
    input.password?.trim() ||
    (current.database?.type === 'mysql' ? current.database.password : '') ||
    ''

  const database = {
    type: 'mysql',
    host: input.host,
    port: Number(input.port || 3306),
    user: input.user,
    password,
    database: input.database,
    charset: input.charset || 'utf8mb4'
  }

  if (!database.host || !database.user || !database.database) {
    throw new Error('请填写主机、用户名和数据库名')
  }
  if (!password) {
    throw new Error('请填写数据库密码（首次配置或修改账号时必填）')
  }

  await testDatabaseConnection({ ...database, password })
  // 先探测兼容性，避免写入后连不上
  const probe = createPool(database)
  try {
    await assertMysqlSchemaCompatible(probe)
  } finally {
    await probe.end().catch(() => {})
  }

  saveConfig({ database })
  await connectDatabase()
  const status = getDbStatus()
  return {
    success: true,
    message: 'MySQL 配置已写入 json/config.json，业务数据将存入 MySQL',
    isConnected: status.isConnected
  }
}

export async function removeDatabaseConfig() {
  saveConfig({
    database: {
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: '',
      charset: 'utf8mb4'
    }
  })
  await closeDatabase()
  return { success: true, message: '已清空 MySQL 连接配置，请重新填写数据库名与密码' }
}

export const CHAT_BUBBLE_IDS = CHAT_BUBBLE_SEEDS.map((item) => item.id)

function mapChatBubbleRow(row, usageMap = {}) {
  if (!row) return null
  const id = String(row.id)
  return {
    id,
    name: String(row.name || ''),
    category: String(row.category || 'recommend'),
    free: !!(row.isFree ?? row.is_free ?? 1),
    decorated: !!(row.isDecorated ?? row.is_decorated ?? 0),
    preview: row.previewText ?? row.preview_text ?? null,
    enabled: !!(row.enabled ?? 1),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    userCount: Number(usageMap[id] || 0)
  }
}

function normalizeBubbleActivationCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
}

function randomBubbleActivationCode() {
  const part = () => crypto.randomBytes(3).toString('hex').toUpperCase()
  return `${part()}-${part()}`
}

export async function getChatBubbleRecord(id) {
  assertConnected()
  const bubbleId = String(id || '').trim()
  if (!bubbleId) return null
  const [rows] = await mysqlPool.query(
    `SELECT id, name, category, is_free AS isFree, is_decorated AS isDecorated,
            preview_text AS previewText, enabled, sort_order AS sortOrder
     FROM chat_bubbles WHERE id = ? LIMIT 1`,
    [bubbleId]
  )
  return mapChatBubbleRow(rows[0])
}

export async function listChatBubblesPublic() {
  assertConnected()
  const usageMap = await getChatBubbleUsageCounts()
  const [rows] = await mysqlPool.query(
    `SELECT id, name, category, is_free AS isFree, is_decorated AS isDecorated,
            preview_text AS previewText, enabled, sort_order AS sortOrder
     FROM chat_bubbles
     WHERE enabled = 1
     ORDER BY sort_order ASC, id ASC`
  )
  return rows.map((row) => mapChatBubbleRow(row, usageMap)).filter(Boolean)
}

export async function listChatBubblesForAdmin() {
  assertConnected()
  const usageMap = await getChatBubbleUsageCounts()
  const [rows] = await mysqlPool.query(
    `SELECT id, name, category, is_free AS isFree, is_decorated AS isDecorated,
            preview_text AS previewText, enabled, sort_order AS sortOrder,
            created_at AS createdAt, updated_at AS updatedAt
     FROM chat_bubbles
     ORDER BY sort_order ASC, id ASC`
  )
  return rows.map((row) => mapChatBubbleRow(row, usageMap)).filter(Boolean)
}

export async function updateChatBubbleRecord(id, patch = {}) {
  assertConnected()
  const bubbleId = String(id || '').trim()
  if (!bubbleId) throw new Error('无效的气泡')
  const updates = []
  const values = []
  if (patch.name !== undefined) {
    const label = String(patch.name || '').trim()
    if (!label) throw new Error('名称不能为空')
    updates.push('name = ?')
    values.push(label.slice(0, 64))
  }
  if (patch.free !== undefined) {
    updates.push('is_free = ?')
    values.push(patch.free ? 1 : 0)
  }
  if (patch.enabled !== undefined) {
    updates.push('enabled = ?')
    values.push(patch.enabled ? 1 : 0)
  }
  if (patch.category !== undefined) {
    updates.push('category = ?')
    values.push(String(patch.category || 'recommend').slice(0, 32))
  }
  if (patch.preview !== undefined) {
    const preview = patch.preview == null ? null : String(patch.preview).trim().slice(0, 64)
    updates.push('preview_text = ?')
    values.push(preview || null)
  }
  if (!updates.length) throw new Error('无更新内容')
  values.push(bubbleId)
  const [result] = await mysqlPool.query(`UPDATE chat_bubbles SET ${updates.join(', ')} WHERE id = ?`, values)
  if (result.affectedRows === 0) throw new Error('气泡不存在')
  return getChatBubbleRecord(bubbleId)
}

export async function listUserUnlockedBubbleIds(userId) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) return []
  const [rows] = await mysqlPool.query(
    'SELECT bubble_id AS bubbleId FROM user_chat_bubbles WHERE user_id = ?',
    [uid]
  )
  return rows.map((row) => String(row.bubbleId))
}

export async function userHasBubbleUnlock(userId, bubbleId) {
  const uid = Number(userId)
  const id = String(bubbleId || '').trim()
  if (!uid || !id) return false
  const [rows] = await mysqlPool.query(
    'SELECT 1 FROM user_chat_bubbles WHERE user_id = ? AND bubble_id = ? LIMIT 1',
    [uid, id]
  )
  return rows.length > 0
}

export async function userCanUseChatBubble(userId, bubbleId) {
  const record = await getChatBubbleRecord(bubbleId)
  if (!record || !record.enabled) return false
  if (record.free || record.id === 'default') return true
  return userHasBubbleUnlock(userId, bubbleId)
}

export async function listBubbleActivationCodesForAdmin(bubbleId, limit = 200) {
  assertConnected()
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const id = String(bubbleId || '').trim()
  if (!id) throw new Error('无效的气泡')
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.code, c.bubble_id AS bubbleId, c.used_by AS usedBy, c.used_at AS usedAt, c.created_at AS createdAt,
            u.username AS usedByUsername, u.nickname AS usedByNickname
     FROM bubble_activation_codes c
     LEFT JOIN users u ON u.id = c.used_by
     WHERE c.bubble_id = ?
     ORDER BY c.id DESC
     LIMIT ?`,
    [id, cap]
  )
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    bubbleId: String(row.bubbleId),
    usedBy: row.usedBy != null ? Number(row.usedBy) : null,
    usedByUsername: row.usedByUsername ? String(row.usedByUsername) : null,
    usedByNickname: row.usedByNickname ? String(row.usedByNickname) : null,
    usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    status: row.usedAt ? 'used' : 'unused'
  }))
}

export async function createBubbleActivationCodes(bubbleId, count = 1) {
  assertConnected()
  const id = String(bubbleId || '').trim()
  const n = Math.min(Math.max(Number(count) || 1, 1), 100)
  const bubble = await getChatBubbleRecord(id)
  if (!bubble) throw new Error('气泡不存在')
  const codes = []
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    let attempts = 0
    while (codes.length < n && attempts < n * 20) {
      attempts += 1
      const code = randomBubbleActivationCode()
      try {
        const [result] = await conn.query(
          'INSERT INTO bubble_activation_codes (code, bubble_id) VALUES (?, ?)',
          [code, id]
        )
        if (result.affectedRows) codes.push(code)
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err
      }
    }
    if (codes.length < n) throw new Error('生成激活码失败，请重试')
    await conn.commit()
    return { bubbleId: id, codes }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function redeemBubbleActivationCode(userId, rawCode) {
  assertConnected()
  const uid = Number(userId)
  const code = normalizeBubbleActivationCode(rawCode)
  if (!uid) throw new Error('请先登录')
  if (!code) throw new Error('请输入激活码')
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT id, bubble_id AS bubbleId, used_by AS usedBy, used_at AS usedAt
       FROM bubble_activation_codes
       WHERE code = ?
       LIMIT 1
       FOR UPDATE`,
      [code]
    )
    if (!rows.length) throw new Error('激活码无效')
    const row = rows[0]
    if (row.usedAt || row.usedBy) throw new Error('激活码已被使用')
    const bubbleId = String(row.bubbleId)
    const bubble = await getChatBubbleRecord(bubbleId)
    if (!bubble || !bubble.enabled) throw new Error('对应气泡不可用')
    await conn.query(
      `INSERT INTO user_chat_bubbles (user_id, bubble_id, source)
       VALUES (?, ?, 'code')
       ON DUPLICATE KEY UPDATE source = VALUES(source), unlocked_at = CURRENT_TIMESTAMP`,
      [uid, bubbleId]
    )
    await conn.query(
      'UPDATE bubble_activation_codes SET used_by = ?, used_at = NOW() WHERE id = ?',
      [uid, row.id]
    )
    await conn.commit()
    return { bubbleId, code }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function getUserPublicWithExtras(user) {
  const base = getUserPublic(user)
  if (!base) return null
  return {
    ...base,
    unlockedBubbleIds: [],
    unlockedAvatarFrameIds: [],
    restrictions: getUserRestrictions(user.id)
  }
}

function mapAvatarFrameRow(row) {
  if (!row) return null
  const frameUrl = encodeMediaPathUrl(
    canonicalizeAvatarFrameUrl(String(row.frameUrl ?? row.frame_url ?? ''))
  )
  return {
    id: String(row.id),
    name: String(row.name || ''),
    frameUrl,
    scale: Number(row.scale ?? 1.46),
    offsetXPct: Number(row.offsetXPct ?? row.offset_x_pct ?? 0),
    offsetYPct: Number(row.offsetYPct ?? row.offset_y_pct ?? 0),
    holeDiameterRatio: row.holeDiameterRatio ?? row.hole_diameter_ratio ?? null,
    enabled: !!row.enabled,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    free: !!(row.isFree ?? row.is_free ?? 1)
  }
}

export async function listAvatarFramesPublic() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT id, name, frame_url AS frameUrl, scale, offset_x_pct AS offsetXPct,
            offset_y_pct AS offsetYPct, hole_diameter_ratio AS holeDiameterRatio,
            is_free AS isFree, enabled, sort_order AS sortOrder
     FROM avatar_frames
     WHERE enabled = 1
     ORDER BY sort_order ASC, id ASC`
  )
  const [usageRows] = await mysqlPool.query(
    `SELECT avatar_frame_id AS frameId, COUNT(*) AS userCount
     FROM users
     WHERE avatar_frame_id IS NOT NULL AND avatar_frame_id <> 'none'
     GROUP BY avatar_frame_id`
  )
  const usageMap = Object.fromEntries(
    usageRows.map((row) => [String(row.frameId), Number(row.userCount || 0)])
  )
  return rows.map((row) => ({
    ...mapAvatarFrameRow(row),
    userCount: usageMap[String(row.id)] || 0
  }))
}

export function buildAvatarFrameLeaderboard(list = [], limit = 10) {
  return list
    .slice()
    .sort(
      (a, b) =>
        (Number(b.userCount) || 0) - (Number(a.userCount) || 0) ||
        (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    )
    .slice(0, Math.max(1, Number(limit) || 10))
    .map((item, index) => ({
      rank: index + 1,
      id: item.id,
      name: item.name,
      frameUrl: item.frameUrl,
      userCount: Number(item.userCount) || 0,
      free: item.free !== false
    }))
}

export async function getChatBubbleUsageCounts() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT chat_bubble_id AS bubbleId, COUNT(*) AS userCount
     FROM users
     GROUP BY chat_bubble_id`
  )
  return Object.fromEntries(
    rows.map((row) => [String(row.bubbleId || 'default'), Number(row.userCount || 0)])
  )
}

export function buildChatBubbleLeaderboard(usageMap = {}, catalog = [], limit = 12) {
  const source = catalog.length
    ? catalog.map((item) => ({ id: item.id, name: item.name, free: item.free !== false }))
    : CHAT_BUBBLE_IDS.map((id) => ({ id, name: id, free: true }))
  return source
    .map((item) => ({
      id: item.id,
      name: item.name,
      userCount: Number(usageMap[item.id] || 0),
      free: item.free !== false
    }))
    .sort(
      (a, b) =>
        (b.userCount - a.userCount) ||
        String(a.id).localeCompare(String(b.id), 'zh-CN')
    )
    .slice(0, Math.max(1, Number(limit) || 12))
    .map((item, index) => ({
      rank: index + 1,
      id: item.id,
      userCount: item.userCount
    }))
}

export async function listAvatarFramesForAdmin() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT id, name, frame_url AS frameUrl, scale, offset_x_pct AS offsetXPct,
            offset_y_pct AS offsetYPct, hole_diameter_ratio AS holeDiameterRatio,
            is_free AS isFree, enabled, sort_order AS sortOrder,
            created_at AS createdAt, updated_at AS updatedAt
     FROM avatar_frames
     ORDER BY sort_order ASC, id ASC`
  )
  const [usageRows] = await mysqlPool.query(
    `SELECT avatar_frame_id AS frameId, COUNT(*) AS userCount
     FROM users
     WHERE avatar_frame_id IS NOT NULL AND avatar_frame_id <> 'none'
     GROUP BY avatar_frame_id`
  )
  const usageMap = Object.fromEntries(
    usageRows.map((row) => [String(row.frameId), Number(row.userCount || 0)])
  )
  return rows.map((row) => ({
    ...mapAvatarFrameRow(row),
    userCount: usageMap[String(row.id)] || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }))
}

function normalizeAvatarFrameId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32)
}

export async function isAvatarFrameIdValid(id) {
  const frameId = String(id || '').trim()
  if (!frameId || frameId === 'none') return frameId === 'none'
  assertConnected()
  const [rows] = await mysqlPool.query(
    'SELECT id FROM avatar_frames WHERE id = ? AND enabled = 1 LIMIT 1',
    [frameId]
  )
  return rows.length > 0
}

export async function getAvatarFrameRecord(id) {
  assertConnected()
  const frameId = String(id || '').trim()
  if (!frameId) return null
  const [rows] = await mysqlPool.query(
    `SELECT id, name, frame_url AS frameUrl, scale, offset_x_pct AS offsetXPct,
            offset_y_pct AS offsetYPct, hole_diameter_ratio AS holeDiameterRatio,
            is_free AS isFree, enabled, sort_order AS sortOrder
     FROM avatar_frames WHERE id = ? LIMIT 1`,
    [frameId]
  )
  return mapAvatarFrameRow(rows[0])
}

export async function listUserUnlockedAvatarFrameIds(userId) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) return []
  const [rows] = await mysqlPool.query(
    'SELECT frame_id AS frameId FROM user_avatar_frames WHERE user_id = ?',
    [uid]
  )
  return rows.map((row) => String(row.frameId))
}

export async function userHasAvatarFrameUnlock(userId, frameId) {
  const uid = Number(userId)
  const id = String(frameId || '').trim()
  if (!uid || !id) return false
  const [rows] = await mysqlPool.query(
    'SELECT 1 FROM user_avatar_frames WHERE user_id = ? AND frame_id = ? LIMIT 1',
    [uid, id]
  )
  return rows.length > 0
}

export async function userCanUseAvatarFrame(userId, frameId) {
  const id = String(frameId || '').trim()
  if (!id || id === 'none') return true
  const record = await getAvatarFrameRecord(id)
  if (!record || !record.enabled) return false
  if (record.free || record.id === 'default') return true
  return userHasAvatarFrameUnlock(userId, id)
}

export async function listAvatarFrameActivationCodesForAdmin(frameId, limit = 200) {
  assertConnected()
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const id = String(frameId || '').trim()
  if (!id) throw new Error('无效的头像框')
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.code, c.frame_id AS frameId, c.used_by AS usedBy, c.used_at AS usedAt, c.created_at AS createdAt,
            u.username AS usedByUsername, u.nickname AS usedByNickname
     FROM avatar_frame_activation_codes c
     LEFT JOIN users u ON u.id = c.used_by
     WHERE c.frame_id = ?
     ORDER BY c.id DESC
     LIMIT ?`,
    [id, cap]
  )
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    frameId: String(row.frameId),
    usedBy: row.usedBy != null ? Number(row.usedBy) : null,
    usedByUsername: row.usedByUsername ? String(row.usedByUsername) : null,
    usedByNickname: row.usedByNickname ? String(row.usedByNickname) : null,
    usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    status: row.usedAt ? 'used' : 'unused'
  }))
}

export async function createAvatarFrameActivationCodes(frameId, count = 1) {
  assertConnected()
  const id = String(frameId || '').trim()
  const n = Math.min(Math.max(Number(count) || 1, 1), 100)
  const frame = await getAvatarFrameRecord(id)
  if (!frame) throw new Error('头像框不存在')
  const codes = []
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    let attempts = 0
    while (codes.length < n && attempts < n * 20) {
      attempts += 1
      const code = randomBubbleActivationCode()
      try {
        const [result] = await conn.query(
          'INSERT INTO avatar_frame_activation_codes (code, frame_id) VALUES (?, ?)',
          [code, id]
        )
        if (result.affectedRows) codes.push(code)
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err
      }
    }
    if (codes.length < n) throw new Error('生成激活码失败，请重试')
    await conn.commit()
    return { frameId: id, codes }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function redeemAvatarFrameActivationCode(userId, rawCode) {
  assertConnected()
  const uid = Number(userId)
  const code = normalizeBubbleActivationCode(rawCode)
  if (!uid) throw new Error('请先登录')
  if (!code) throw new Error('请输入激活码')
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT id, frame_id AS frameId, used_by AS usedBy, used_at AS usedAt
       FROM avatar_frame_activation_codes
       WHERE code = ?
       LIMIT 1
       FOR UPDATE`,
      [code]
    )
    if (!rows.length) throw new Error('激活码无效')
    const row = rows[0]
    if (row.usedAt || row.usedBy) throw new Error('激活码已被使用')
    const frameId = String(row.frameId)
    const frame = await getAvatarFrameRecord(frameId)
    if (!frame || !frame.enabled) throw new Error('对应头像框不可用')
    await conn.query(
      `INSERT INTO user_avatar_frames (user_id, frame_id, source)
       VALUES (?, ?, 'code')
       ON DUPLICATE KEY UPDATE source = VALUES(source), unlocked_at = CURRENT_TIMESTAMP`,
      [uid, frameId]
    )
    await conn.query(
      'UPDATE avatar_frame_activation_codes SET used_by = ?, used_at = NOW() WHERE id = ?',
      [uid, row.id]
    )
    await conn.commit()
    return { frameId, code }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function createAvatarFrameRecord({
  id,
  name,
  frameUrl,
  scale,
  offsetXPct,
  offsetYPct,
  holeDiameterRatio
}) {
  assertConnected()
  const frameId = normalizeAvatarFrameId(id) || `frame-${Date.now()}`
  const label = String(name || '').trim() || '头像框'
  const url = String(frameUrl || '').trim()
  if (!url.startsWith('/media/')) throw new Error('无效的头像框地址')
  const [existing] = await mysqlPool.query('SELECT id FROM avatar_frames WHERE id = ? LIMIT 1', [frameId])
  if (existing.length) throw new Error('头像框 ID 已存在')
  const [sortRows] = await mysqlPool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort FROM avatar_frames')
  const sortOrder = Number(sortRows[0]?.nextSort ?? 0)
  await mysqlPool.query(
    `INSERT INTO avatar_frames
      (id, name, frame_url, scale, offset_x_pct, offset_y_pct, hole_diameter_ratio, enabled, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      frameId,
      label.slice(0, 64),
      url,
      Number(scale ?? 1.46),
      Number(offsetXPct ?? 0),
      Number(offsetYPct ?? 0),
      holeDiameterRatio == null ? null : Number(holeDiameterRatio),
      sortOrder
    ]
  )
  const [rows] = await mysqlPool.query(
    `SELECT id, name, frame_url AS frameUrl, scale, offset_x_pct AS offsetXPct,
            offset_y_pct AS offsetYPct, hole_diameter_ratio AS holeDiameterRatio,
            is_free AS isFree, enabled, sort_order AS sortOrder
     FROM avatar_frames WHERE id = ? LIMIT 1`,
    [frameId]
  )
  return mapAvatarFrameRow(rows[0])
}

export async function updateAvatarFrameRecord(id, patch = {}) {
  assertConnected()
  const frameId = String(id || '').trim()
  if (!frameId || frameId === 'none') throw new Error('无效的头像框')
  const updates = []
  const values = []
  if (patch.name !== undefined) {
    const label = String(patch.name || '').trim()
    if (!label) throw new Error('名称不能为空')
    updates.push('name = ?')
    values.push(label.slice(0, 64))
  }
  if (patch.enabled !== undefined) {
    updates.push('enabled = ?')
    values.push(patch.enabled ? 1 : 0)
  }
  if (patch.free !== undefined) {
    updates.push('is_free = ?')
    values.push(patch.free ? 1 : 0)
  }
  if (patch.scale !== undefined) {
    updates.push('scale = ?')
    values.push(Number(patch.scale))
  }
  if (patch.offsetXPct !== undefined) {
    updates.push('offset_x_pct = ?')
    values.push(Number(patch.offsetXPct))
  }
  if (patch.offsetYPct !== undefined) {
    updates.push('offset_y_pct = ?')
    values.push(Number(patch.offsetYPct))
  }
  if (patch.holeDiameterRatio !== undefined) {
    updates.push('hole_diameter_ratio = ?')
    values.push(patch.holeDiameterRatio == null ? null : Number(patch.holeDiameterRatio))
  }
  if (!updates.length) throw new Error('无更新内容')
  values.push(frameId)
  const [result] = await mysqlPool.query(`UPDATE avatar_frames SET ${updates.join(', ')} WHERE id = ?`, values)
  if (result.affectedRows === 0) throw new Error('头像框不存在')
  const [rows] = await mysqlPool.query(
    `SELECT id, name, frame_url AS frameUrl, scale, offset_x_pct AS offsetXPct,
            offset_y_pct AS offsetYPct, hole_diameter_ratio AS holeDiameterRatio,
            is_free AS isFree, enabled, sort_order AS sortOrder
     FROM avatar_frames WHERE id = ? LIMIT 1`,
    [frameId]
  )
  return mapAvatarFrameRow(rows[0])
}

export async function reanalyzeAvatarFrameRecord(id) {
  assertConnected()
  const frameId = String(id || '').trim()
  const [rows] = await mysqlPool.query(
    'SELECT frame_url AS frameUrl FROM avatar_frames WHERE id = ? LIMIT 1',
    [frameId]
  )
  if (!rows.length) throw new Error('头像框不存在')
  const frameUrl = String(rows[0].frameUrl || '')
  const { analyzeAvatarFrameAlignment, readAvatarFrameFile } = await import('./avatarFrameImage.js')
  const buffer = readAvatarFrameFile(frameUrl)
  if (!buffer?.length) throw new Error('头像框文件不存在')
  const alignment = await analyzeAvatarFrameAlignment(buffer)
  return updateAvatarFrameRecord(frameId, alignment)
}

export async function deleteAvatarFrameRecord(id) {
  assertConnected()
  const frameId = String(id || '').trim()
  if (!frameId || frameId === 'none') throw new Error('无法删除')
  const [rows] = await mysqlPool.query(
    'SELECT frame_url AS frameUrl FROM avatar_frames WHERE id = ? LIMIT 1',
    [frameId]
  )
  if (!rows.length) throw new Error('头像框不存在')
  await mysqlPool.query('DELETE FROM avatar_frame_activation_codes WHERE frame_id = ?', [frameId])
  await mysqlPool.query('DELETE FROM user_avatar_frames WHERE frame_id = ?', [frameId])
  await mysqlPool.query("UPDATE users SET avatar_frame_id = 'none' WHERE avatar_frame_id = ?", [frameId])
  await mysqlPool.query('DELETE FROM avatar_frames WHERE id = ?', [frameId])
  const { deleteAvatarFrameFile } = await import('./avatarFrameImage.js')
  deleteAvatarFrameFile(rows[0].frameUrl)
  return { id: frameId }
}


export function getUserPublic(user) {
  if (!user) return null
  const badge = readUserBadge(user)
  return {
    id: user.id,
    chatNo: user.chat_no ?? user.chatNo ?? null,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: normalizeAvatarUrl(user.avatar_url || user.avatarUrl),
    chatBubbleId: 'default',
    avatarFrameId: 'none',
    badgeText: badge.badgeText,
    badgeColor: badge.badgeColor,
    badges: badge.badges || [],
    province: String(user.province || '').trim()
  }
}

export function getUserProfilePublic(user) {
  if (!user) return null
  const province = String(user.province || '').trim()
  return {
    ...getUserPublic(user),
    bio: String(user.bio || '').trim(),
    province
  }
}

export async function ensureUserProvinceFromIp(userRow) {
  if (!userRow?.id) return userRow
  const existing = String(userRow.province || '').trim()
  if (existing) return userRow

  const ip = String(userRow.register_ip || userRow.registerIp || '').trim()
  if (!ip) return userRow

  const city = await resolveIpCity(ip)
  if (!city) return userRow

  await mysqlPool.query(
    'UPDATE users SET province = ? WHERE id = ? AND (province IS NULL OR TRIM(province) = \'\')',
    [city, userRow.id]
  )
  return { ...userRow, province: city }
}

export async function getUserProfile(viewerId, targetUserId) {
  assertConnected()
  const tid = Number(targetUserId)
  if (!tid) throw new Error('无效的用户 ID')
  const target = await findUserById(tid)
  if (!target || target.status !== 'active') throw new Error('用户不存在')
  const withRegion = await ensureUserProvinceFromIp(target)
  const [profile] = await attachFriendRelationStatus(viewerId, [getUserProfilePublic(withRegion)])
  return profile
}

export async function findUserByChatNo(chatNo) {
  assertConnected()
  const no = Number(chatNo)
  if (!Number.isFinite(no) || no <= 0) return null
  const [rows] = await mysqlPool.query('SELECT * FROM users WHERE chat_no = ? LIMIT 1', [no])
  return rows[0] || null
}

export async function resolveUserByFriendQuery(query) {
  const q = String(query || '').trim()
  if (!q) return null
  if (/^\d+$/.test(q)) {
    const exact = await findUserByChatNo(q)
    if (exact) return exact
    const [rows] = await mysqlPool.query(
      'SELECT * FROM users WHERE CAST(chat_no AS CHAR) LIKE ? LIMIT 1',
      [`${q}%`]
    )
    return rows[0] || null
  }
  return findUserByUsernameLoose(q)
}

export async function findUserByUsername(username) {
  assertConnected()
  const [rows] = await mysqlPool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username])
  return rows[0] || null
}

export async function findUserByUsernameLoose(username) {
  assertConnected()
  const name = String(username || '').trim()
  if (!name) return null
  const exact = await findUserByUsername(name)
  if (exact) return exact
  const [rows] = await mysqlPool.query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [name]
  )
  return rows[0] || null
}

export async function findUserByEmail(email) {
  assertConnected()
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return null
  const [rows] = await mysqlPool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalized])
  return rows[0] || null
}

export async function findUserByPhone(phone) {
  assertConnected()
  const normalized = String(phone || '').trim().replace(/[\s-]/g, '')
  if (!normalized) return null
  const [rows] = await mysqlPool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [normalized])
  return rows[0] || null
}

export async function isEmailRegistered(email) {
  const user = await findUserByEmail(email)
  return !!user
}

export async function isPhoneRegistered(phone) {
  const user = await findUserByPhone(phone)
  return !!user
}

export async function findUserById(id) {
  assertConnected()
  const [rows] = await mysqlPool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

export async function updateUserProfile(userId, { username, nickname, avatarUrl, province } = {}) {
  assertConnected()
  const updates = []
  const values = []
  let oldAvatarUrl = null

  const usernameInput =
    username !== undefined
      ? String(username).trim()
      : nickname !== undefined
        ? String(nickname).trim()
        : undefined

  if (usernameInput !== undefined) {
    if (!usernameInput) throw new Error('账户名不能为空')
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]{3,32}$/.test(usernameInput)) {
      throw new Error('账户名需 3-32 位，支持中文、字母、数字、下划线')
    }
    assertUserDisplayName(usernameInput)
    const taken = await findUserByUsername(usernameInput)
    if (taken && Number(taken.id) !== Number(userId)) {
      throw new Error('账户名已被占用')
    }
    updates.push('username = ?')
    values.push(usernameInput)
    updates.push('nickname = ?')
    values.push(usernameInput)
  }
  if (province !== undefined) {
    const region = String(province || '').trim()
    if (region.length > 64) throw new Error('地区过长')
    updates.push('province = ?')
    values.push(region || null)
  }
  if (avatarUrl !== undefined) {
    const existing = await findUserById(userId)
    oldAvatarUrl = existing?.avatar_url || ''
    const url = normalizeAvatarPath(avatarUrl)
    if (!url.startsWith('/media/avatar/')) throw new Error('无效的头像地址')
    updates.push('avatar_url = ?')
    values.push(url)
  }
  if (!updates.length) throw new Error('无更新内容')
  values.push(userId)
  const [result] = await mysqlPool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
  if (result.affectedRows === 0) throw new Error('用户不存在')

  const user = await findUserById(userId)
  if (avatarUrl !== undefined && oldAvatarUrl) {
    const oldNorm = normalizeAvatarPath(oldAvatarUrl)
    const newNorm = normalizeAvatarPath(user?.avatar_url || '')
    if (oldNorm && oldNorm !== newNorm) {
      await safeDeleteAvatarFile(oldAvatarUrl, mysqlPool)
    }
  }
  return user
}

function pickHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return ''
  const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase())
  return decodeDeviceHeader(key ? String(headers[key] ?? '').trim() : '')
}

function decodeDeviceHeader(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    if (/%[0-9A-Fa-f]{2}/.test(raw)) return decodeURIComponent(raw)
  } catch {
    /* keep raw */
  }
  return raw
}

function buildAndroidDeviceInfo(headers = {}, userAgent = '', extras = {}) {
  const ua = String(userAgent || '').trim()
  const modelLabel =
    pickHeader(headers, 'x-device-model') ||
    (ua.match(/XhaMilAndroid\/[^\s]+ \([^;]+;\s*([^)]+)\)/i)?.[1] || '').trim()
  const androidVersion =
    pickHeader(headers, 'x-android-version') ||
    (ua.match(/Android\s+([0-9.]+)/i)?.[1] || '').trim()
  const info = {
    clientType: 'android',
    brand: pickHeader(headers, 'x-device-brand'),
    manufacturer: pickHeader(headers, 'x-device-manufacturer'),
    model: pickHeader(headers, 'x-device-model-raw'),
    modelLabel: modelLabel.slice(0, 128),
    device: pickHeader(headers, 'x-device-name'),
    product: pickHeader(headers, 'x-device-product'),
    board: pickHeader(headers, 'x-device-board'),
    hardware: pickHeader(headers, 'x-device-hardware'),
    abi: pickHeader(headers, 'x-device-abi'),
    display: pickHeader(headers, 'x-device-display'),
    locale: pickHeader(headers, 'x-device-locale'),
    timezone: pickHeader(headers, 'x-device-timezone'),
    fingerprint: pickHeader(headers, 'x-device-fingerprint'),
    androidVersion,
    sdkInt: Number(pickHeader(headers, 'x-android-sdk')) || null,
    appVersion: pickHeader(headers, 'x-app-version'),
    appVersionCode: Number(pickHeader(headers, 'x-app-version-code')) || null,
    networkType: pickHeader(headers, 'x-network-type'),
    localIp: pickHeader(headers, 'x-local-ip'),
    simOperator: pickHeader(headers, 'x-sim-operator'),
    userAgent: ua.slice(0, 512),
    clientIp: String(extras.clientIp || '').trim().slice(0, 45) || undefined,
    forwardedFor: String(extras.forwardedFor || pickHeader(headers, 'x-forwarded-for') || '')
      .trim()
      .slice(0, 255) || undefined,
    remoteAddress: String(extras.remoteAddress || '').trim().slice(0, 64) || undefined,
    updatedAt: new Date().toISOString()
  }
  // 去掉空字段，避免脏数据
  for (const k of Object.keys(info)) {
    if (info[k] === '' || info[k] == null) delete info[k]
  }
  return info
}

export async function touchUserClientBrowser(userId, userAgent, extras = {}) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) return

  const ua = String(userAgent || '').trim()
  const browser = detectBrowserKey(ua)
  const headers = extras.headers || {}
  const headerType = String(extras.clientType || pickHeader(headers, 'x-client-type') || '')
    .trim()
    .toLowerCase()
  const isAndroidApp =
    headerType === 'android' || /^XhaMilAndroid\b/i.test(ua)

  const clientIp = String(extras.clientIp || '').trim().slice(0, 45)
  const forwardedFor = String(
    extras.forwardedFor || pickHeader(headers, 'x-forwarded-for') || ''
  )
    .trim()
    .slice(0, 255)

  const updates = []
  const values = []
  if (browser) {
    updates.push('last_browser = ?')
    values.push(browser)
  }
  if (clientIp) {
    updates.push('last_login_ip = ?')
    values.push(clientIp)
    updates.push('last_login_at = NOW()')
    if (forwardedFor) {
      updates.push('last_login_forwarded = ?')
      values.push(forwardedFor)
    }
  }
  if (isAndroidApp) {
    const info = buildAndroidDeviceInfo(headers, ua, {
      clientIp,
      forwardedFor,
      remoteAddress: extras.remoteAddress
    })
    const model = String(info.modelLabel || extras.deviceModel || '').trim().slice(0, 128)
    updates.push('last_client_type = ?')
    values.push('android')
    if (model) {
      updates.push('last_device_model = ?')
      values.push(model)
    }
    updates.push('last_device_info = CAST(? AS JSON)')
    values.push(JSON.stringify(info))
    updates.push('last_device_at = NOW()')
  }
  if (!updates.length) return
  values.push(uid)
  await mysqlPool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)
}

const REGISTER_LIMIT_PER_IP_HOUR = 3
const REGISTER_LIMIT_PER_IP_DAY = 10

export async function countUsersRegisteredFromIp(registerIp, sinceHours = 1) {
  assertConnected()
  const ipVal = String(registerIp || '').trim()
  if (!ipVal) return 0
  const hours = Math.min(Math.max(Number(sinceHours) || 1, 1), 168)
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM users WHERE register_ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [ipVal, hours]
  )
  return Number(rows[0]?.c || 0)
}

export async function assertRegisterRateLimit(registerIp) {
  const ipVal = String(registerIp || '').trim() || '0.0.0.0'
  const hourly = await countUsersRegisteredFromIp(ipVal, 1)
  if (hourly >= REGISTER_LIMIT_PER_IP_HOUR) {
    console.warn(`[rate-limit] db blocked (hour) ip=${ipVal} count=${hourly}`)
    const err = new Error('注册过于频繁，请1小时后再试')
    err.status = 429
    throw err
  }
  const daily = await countUsersRegisteredFromIp(ipVal, 24)
  if (daily >= REGISTER_LIMIT_PER_IP_DAY) {
    const err = new Error('今日注册次数已达上限，请明天再试')
    err.status = 429
    throw err
  }
}

export async function createUser({ username, password, nickname, avatarUrl, email, phone, registerIp, userAgent }) {
  assertConnected()
  assertUserDisplayName(nickname || username)
  const passwordHash = hashPassword(password)
  let url = pickRandomDefaultAvatarUrl()
  if (avatarUrl) {
    const norm = normalizeAvatarPath(avatarUrl)
    if (norm.startsWith('/media/avatar/')) url = norm
  }
  const emailVal = email ? String(email).trim().toLowerCase() : null
  const phoneVal = phone ? String(phone).trim().replace(/[\s-]/g, '') : null
  const ipVal = registerIp ? String(registerIp).trim().slice(0, 45) : null
  if (emailVal && (await isEmailRegistered(emailVal))) {
    const err = new Error('该邮箱已被注册')
    err.code = 'EMAIL_TAKEN'
    throw err
  }
  if (phoneVal && (await isPhoneRegistered(phoneVal))) {
    const err = new Error('该手机号已被注册')
    err.code = 'PHONE_TAKEN'
    throw err
  }
  const chatNo = await generateUniqueChatNo()
  try {
    const [result] = await mysqlPool.query(
      'INSERT INTO users (chat_no, username, email, phone, register_ip, last_browser, nickname, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [chatNo, username, emailVal, phoneVal, ipVal, detectBrowserKey(userAgent), nickname || username, passwordHash, url]
    )
    const created = {
      id: result.insertId,
      chat_no: chatNo,
      username,
      email: emailVal,
      phone: phoneVal,
      register_ip: ipVal,
      nickname: nickname || username,
      avatar_url: url
    }
    void ensureUserProvinceFromIp(created).catch(() => {})
    return created
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY' && /email|uniq_users_email/i.test(String(e.message || ''))) {
      const err = new Error('该邮箱已被注册')
      err.code = 'EMAIL_TAKEN'
      throw err
    }
    if (e?.code === 'ER_DUP_ENTRY' && /phone|uniq_users_phone/i.test(String(e.message || ''))) {
      const err = new Error('该手机号已被注册')
      err.code = 'PHONE_TAKEN'
      throw err
    }
    throw e
  }
}

export async function generateUniqueLoginUsername() {
  assertConnected()
  for (let i = 0; i < 40; i++) {
    const suffix = Math.random().toString(36).slice(2, 10)
    const name = `u_${suffix}`
    if (!(await findUserByUsername(name))) return name
  }
  throw new Error('无法生成登录账号')
}

export async function loginUser(loginId, password) {
  assertConnected()
  const id = String(loginId || '').trim()
  if (!id) return null
  let user = null
  if (/^\d+$/.test(id)) {
    user = await findUserByChatNo(id)
  } else {
    user = await findUserByUsernameLoose(id)
  }
  if (!user || user.status !== 'active') return null
  if (!user.password_hash || !verifyPassword(password, user.password_hash)) return null
  return user
}

/** 登录用户修改密码：校验旧密码后写入新哈希 */
export async function changeUserPassword(userId, oldPassword, newPassword) {
  assertConnected()
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('用户无效')
  const oldPwd = String(oldPassword || '')
  const newPwd = String(newPassword || '')
  if (!oldPwd) throw Object.assign(new Error('请输入当前密码'), { status: 400 })
  if (newPwd.length < 6) throw Object.assign(new Error('新密码至少 6 位'), { status: 400 })
  if (oldPwd === newPwd) throw Object.assign(new Error('新密码不能与当前密码相同'), { status: 400 })

  const [rows] = await mysqlPool.query(
    'SELECT id, password_hash, status FROM users WHERE id = ? LIMIT 1',
    [uid]
  )
  const user = rows[0]
  if (!user || user.status !== 'active') {
    throw Object.assign(new Error('用户不存在或已失效'), { status: 401 })
  }
  if (!user.password_hash || !verifyPassword(oldPwd, user.password_hash)) {
    throw Object.assign(new Error('当前密码不正确'), { status: 400 })
  }
  const passwordHash = hashPassword(newPwd)
  await mysqlPool.query('UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1', [passwordHash, uid])
  return true
}

function parseDeviceInfo(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

function formatIpMeta(meta) {
  if (!meta?.ip) return null
  const kinds = []
  if (meta.private) kinds.push('内网')
  else {
    if (meta.mobile) kinds.push('蜂窝')
    if (meta.proxy) kinds.push('代理')
    if (meta.hosting) kinds.push('机房')
    if (!kinds.length) kinds.push('公网')
  }
  return {
    ip: meta.ip,
    location: meta.location || '',
    country: meta.country || '',
    region: meta.region || '',
    city: meta.city || '',
    isp: meta.isp || '',
    org: meta.org || '',
    as: meta.as || '',
    kind: kinds.join(' / '),
    private: !!meta.private
  }
}

function mapAdminUser(row) {
  const badge = readUserBadge(row)
  return {
    id: row.id,
    chatNo: row.chat_no ?? null,
    username: row.username,
    nickname: row.nickname,
    email: row.email || null,
    province: String(row.province || '').trim() || null,
    registerIp: row.register_ip || null,
    lastBrowser: String(row.last_browser || '').trim() || null,
    lastLoginIp: row.last_login_ip || null,
    lastLoginAt: row.last_login_at || null,
    lastLoginForwarded: String(row.last_login_forwarded || '').trim() || null,
    avatarUrl: normalizeAvatarUrl(row.avatar_url),
    status: row.status,
    isBanned: row.status === 'banned',
    restrictions: getUserRestrictions(row.id),
    badgeText: badge.badgeText || null,
    badgeColor: badge.badgeColor || null,
    badges: badge.badges || [],
    lastClientType: String(row.last_client_type || '').trim() || null,
    lastDeviceModel: String(row.last_device_model || '').trim() || null,
    lastDeviceInfo: parseDeviceInfo(row.last_device_info),
    lastDeviceAt: row.last_device_at || null,
    joined: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function listUsersForAdmin() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT id, chat_no, username, email, province, register_ip, last_browser, nickname, avatar_url, status,
            badge_text, badge_color, badges,
            last_client_type, last_device_model, last_device_info, last_device_at,
            last_login_ip, last_login_at, last_login_forwarded,
            created_at, updated_at
     FROM users ORDER BY id DESC`
  )
  return rows.map(mapAdminUser)
}

export async function getUserDeviceForAdmin(userId) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的用户 ID')
  const [rows] = await mysqlPool.query(
    `SELECT id, chat_no, username, email, province, register_ip, last_browser, nickname, avatar_url, status,
            badge_text, badge_color, badges,
            last_client_type, last_device_model, last_device_info, last_device_at,
            last_login_ip, last_login_at, last_login_forwarded,
            created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [uid]
  )
  if (!rows[0]) throw new Error('用户不存在')
  const user = mapAdminUser(rows[0])
  const loginIp = user.lastLoginIp || user.lastDeviceInfo?.clientIp || ''
  const registerIp = user.registerIp || ''
  const [loginRaw, registerRaw] = await Promise.all([
    loginIp ? resolveIpMeta(loginIp) : null,
    registerIp ? resolveIpMeta(registerIp) : null
  ])
  return {
    user,
    loginMeta: formatIpMeta(loginRaw),
    registerMeta: formatIpMeta(registerRaw)
  }
}

const REPORT_REASON_MAX = 64
const REPORT_DETAIL_MAX = 1000
const REPORT_RATE_LIMIT_HOUR = 8
const REPORT_IMAGE_MAX = 3
const REPORT_RECEIPT_TEXT =
  '您的举报已提交，相关工作人员将尽快核实处理。请保持通讯畅通，感谢您的监督与支持。'
const REPORT_REJECT_RECEIPT_TEXT =
  '经核实，您的举报内容未能满足处理条件，已作驳回处理。如有新的证据，欢迎再次提交。'
const REPORT_RESOLVED_RECEIPT_TEXT =
  '经核实，您的举报已处理完毕。感谢您的监督与支持。'

function parseReportImageUrls(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean)
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((u) => String(u || '').trim()).filter(Boolean)
    }
  } catch {
    // ignore
  }
  return []
}

function normalizeReportImageUrls(input) {
  const list = Array.isArray(input) ? input : input ? [input] : []
  const prefix = `${REPORT_IMAGE_URL_PREFIX}/`
  const out = []
  for (const item of list) {
    const url = String(item || '').trim().replace(/\\/g, '/')
    if (!url.startsWith(prefix)) continue
    const name = url.slice(prefix.length)
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) continue
    out.push(`${prefix}${name}`)
    if (out.length >= REPORT_IMAGE_MAX) break
  }
  return out
}

export async function createUserReport(
  reporterId,
  { targetUserId, momentId, reason, detail, imageUrl, imageUrls } = {}
) {
  assertConnected()
  const rid = Number(reporterId)
  let tid = Number(targetUserId)
  const mid = Number(momentId) || 0
  if (!rid) {
    const err = new Error('未登录')
    err.status = 401
    throw err
  }
  let momentRow = null
  if (mid) {
    const [rows] = await mysqlPool.query(
      'SELECT id, user_id, content, visibility FROM moments WHERE id = ? LIMIT 1',
      [mid]
    )
    momentRow = rows[0] || null
    if (!momentRow) {
      const err = new Error('说说不存在或已删除')
      err.status = 404
      throw err
    }
    tid = Number(momentRow.user_id)
  }
  if (!tid) {
    const err = new Error('无效的举报对象')
    err.status = 400
    throw err
  }
  if (rid === tid) {
    const err = new Error('不能举报自己')
    err.status = 400
    throw err
  }
  const reasonText = String(reason || '').trim().slice(0, REPORT_REASON_MAX)
  if (!reasonText) {
    const err = new Error('请选择举报原因')
    err.status = 400
    throw err
  }
  let detailText = String(detail || '').trim().slice(0, REPORT_DETAIL_MAX)
  if (momentRow) {
    const snippet = String(momentRow.content || '').trim().slice(0, 120)
    const prefix = snippet ? `【说说】${snippet}` : '【说说】'
    if (!detailText) {
      detailText = prefix
    } else if (!detailText.includes('【说说】')) {
      detailText = `${prefix}\n${detailText}`.slice(0, REPORT_DETAIL_MAX)
    }
  }
  const images = normalizeReportImageUrls(imageUrls || imageUrl)
  const target = await findUserById(tid)
  if (!target) {
    const err = new Error('被举报用户不存在')
    err.status = 404
    throw err
  }
  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM user_reports
     WHERE reporter_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [rid]
  )
  if (Number(countRows[0]?.c || 0) >= REPORT_RATE_LIMIT_HOUR) {
    const err = new Error('举报过于频繁，请稍后再试')
    err.status = 429
    throw err
  }
  const [result] = await mysqlPool.query(
    `INSERT INTO user_reports (reporter_id, target_user_id, moment_id, reason, detail, images_json, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [rid, tid, mid || null, reasonText, detailText, JSON.stringify(images)]
  )
  const reportId = result.insertId
  try {
    await createNotification({
      userId: rid,
      type: 'report_receipt',
      title: '管理员',
      content: REPORT_RECEIPT_TEXT,
      relatedId: reportId
    })
  } catch (e) {
    console.error('[report-receipt]', e?.message || e)
  }
  return { id: reportId, message: '举报已提交，我们会尽快处理', notifyUserId: rid }
}

function mapAdminReportRow(row) {
  return {
    id: row.id,
    reason: row.reason,
    detail: row.detail || '',
    imageUrls: parseReportImageUrls(row.images_json),
    status: row.status || 'pending',
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    handledAt: row.handled_at || null,
    momentId: row.moment_id ? Number(row.moment_id) : null,
    moment: row.moment_id
      ? {
          id: Number(row.moment_id),
          content: row.moment_content || '',
          visibility: row.moment_visibility || '',
          createdAt: row.moment_created_at || null,
          deleted: !row.moment_user_id,
          media: parseMomentMediaJson(row.moment_images_json),
          matchedWords: findSmartMatchedWords(row.moment_content || '')
        }
      : null,
    reporter: {
      id: row.reporter_id,
      chatNo: row.reporter_chat_no ?? null,
      username: row.reporter_username || '',
      nickname: row.reporter_nickname || '',
      avatarUrl: normalizeAvatarUrl(row.reporter_avatar)
    },
    target: {
      id: row.target_user_id,
      chatNo: row.target_chat_no ?? null,
      username: row.target_username || '',
      nickname: row.target_nickname || '',
      avatarUrl: normalizeAvatarUrl(row.target_avatar),
      status: row.target_status || 'active'
    }
  }
}

export async function listReportsForAdmin({ status = '', limit = 100, offset = 0 } = {}) {
  assertConnected()
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 200)
  const skip = Math.max(Number(offset) || 0, 0)
  const params = []
  let where = ''
  const st = String(status || '').trim()
  if (st && st !== 'all') {
    where = 'WHERE r.status = ?'
    params.push(st)
  }
  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM user_reports r ${where}`,
    params
  )
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.reporter_id, r.target_user_id, r.moment_id, r.reason, r.detail, r.images_json, r.status, r.admin_note,
            r.created_at, r.handled_at,
            ru.chat_no AS reporter_chat_no, ru.username AS reporter_username,
            ru.nickname AS reporter_nickname, ru.avatar_url AS reporter_avatar,
            tu.chat_no AS target_chat_no, tu.username AS target_username,
            tu.nickname AS target_nickname, tu.avatar_url AS target_avatar,
            tu.status AS target_status,
            mo.user_id AS moment_user_id, mo.content AS moment_content,
            mo.visibility AS moment_visibility, mo.created_at AS moment_created_at,
            mo.images_json AS moment_images_json
     FROM user_reports r
     LEFT JOIN users ru ON ru.id = r.reporter_id
     LEFT JOIN users tu ON tu.id = r.target_user_id
     LEFT JOIN moments mo ON mo.id = r.moment_id
     ${where}
     ORDER BY r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, skip]
  )
  return {
    total: Number(countRows[0]?.c || 0),
    list: rows.map(mapAdminReportRow)
  }
}

/** 清除举报记录（可按状态筛选）。不删除用户侧举报回执通知。 */
export async function clearReportsForAdmin({ status = 'all' } = {}) {
  assertConnected()
  const st = String(status || '').trim()
  const params = []
  let where = ''
  if (st && st !== 'all') {
    if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(st)) {
      throw new Error('无效的处理状态')
    }
    where = 'WHERE status = ?'
    params.push(st)
  }
  const [result] = await mysqlPool.query(`DELETE FROM user_reports ${where}`, params)
  return { cleared: Number(result?.affectedRows) || 0 }
}

export async function updateReportStatusForAdmin(reportId, { status, adminNote } = {}) {
  assertConnected()
  const id = Number(reportId)
  if (!id) throw new Error('无效的举报 ID')
  const nextStatus = String(status || '').trim()
  if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(nextStatus)) {
    throw new Error('无效的处理状态')
  }
  const [rows] = await mysqlPool.query(
    'SELECT id, reporter_id, status FROM user_reports WHERE id = ? LIMIT 1',
    [id]
  )
  const report = rows[0]
  if (!report) throw new Error('举报不存在')
  const note = String(adminNote ?? '').trim().slice(0, 500)
  await mysqlPool.query(
    `UPDATE user_reports
     SET status = ?,
         admin_note = ?,
         handled_at = CASE WHEN ? IN ('resolved', 'rejected') THEN NOW() ELSE handled_at END
     WHERE id = ?`,
    [nextStatus, note || null, nextStatus, id]
  )
  let notifyUserId = null
  if (nextStatus === 'rejected') {
    const rejectText = note || REPORT_REJECT_RECEIPT_TEXT
    const [dup] = await mysqlPool.query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'report_receipt' AND related_id = ?
         AND content <> ?
       LIMIT 1`,
      [report.reporter_id, id, REPORT_RECEIPT_TEXT]
    )
    if (!dup.length) {
      try {
        await createNotification({
          userId: report.reporter_id,
          type: 'report_receipt',
          title: '管理员',
          content: rejectText,
          relatedId: id
        })
        notifyUserId = report.reporter_id
      } catch (e) {
        console.error('[report-reject-receipt]', e?.message || e)
      }
    }
  }
  return { id, status: nextStatus, notifyUserId }
}

/**
 * 处理说说举报：可删帖、限时/永久禁发说说，并通知双方
 * banDays: null=不改禁发；0=解除；>0=天数；<0=永久
 */
export async function moderateMomentReportForAdmin(
  reportId,
  { deleteMoment: shouldDelete = false, banDays = null, status = 'resolved', adminNote = '' } = {}
) {
  assertConnected()
  const id = Number(reportId)
  if (!id) throw new Error('无效的举报 ID')
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.reporter_id, r.target_user_id, r.moment_id, r.status,
            mo.id AS moment_exists, mo.content AS moment_content
     FROM user_reports r
     LEFT JOIN moments mo ON mo.id = r.moment_id
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  )
  const report = rows[0]
  if (!report) throw new Error('举报不存在')
  if (!report.moment_id) throw new Error('该举报不是说说举报')

  const nextStatus = String(status || 'resolved').trim() || 'resolved'
  if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(nextStatus)) {
    throw new Error('无效的处理状态')
  }

  const actions = []
  let momentDeleted = false
  if (shouldDelete) {
    if (report.moment_exists) {
      await adminDeleteMoment(report.moment_id)
      momentDeleted = true
      actions.push('已删除该说说')
    } else {
      actions.push('说说已不存在')
    }
  }

  let banResult = null
  if (banDays !== null && banDays !== undefined && banDays !== '') {
    const days = Number(banDays)
    if (!Number.isFinite(days)) throw new Error('无效的禁发天数')
    banResult = setPostMomentBan(report.target_user_id, days)
    if (days < 0) actions.push('已永久禁止对方发布说说')
    else if (days === 0) actions.push('已解除对方发说说限制')
    else actions.push(`已禁止对方发布说说 ${Math.floor(days)} 天`)
  }

  const note = String(adminNote ?? '').trim().slice(0, 500)
  const autoNote = actions.length ? actions.join('；') : ''
  const mergedNote = [note, autoNote].filter(Boolean).join('\n').slice(0, 500)

  await mysqlPool.query(
    `UPDATE user_reports
     SET status = ?,
         admin_note = ?,
         handled_at = CASE WHEN ? IN ('resolved', 'rejected') THEN NOW() ELSE handled_at END
     WHERE id = ?`,
    [nextStatus, mergedNote || null, nextStatus, id]
  )

  const notifyUserIds = []
  const reporterText =
    nextStatus === 'rejected'
      ? note || REPORT_REJECT_RECEIPT_TEXT
      : actions.length
        ? `经核实，您举报的说说已处理：${actions.join('；')}。感谢您的监督与支持。`
        : REPORT_RESOLVED_RECEIPT_TEXT

  try {
    await createNotification({
      userId: report.reporter_id,
      type: 'report_receipt',
      title: '管理员',
      content: reporterText,
      relatedId: id
    })
    notifyUserIds.push(report.reporter_id)
  } catch (e) {
    console.error('[report-moderate-reporter]', e?.message || e)
  }

  const r = banResult?.restrictions
  const bannedPosting = !!(r?.postMoment)
  if (momentDeleted || bannedPosting) {
    const lines = []
    if (momentDeleted) lines.push('您发布的说说因违规已被删除。')
    if (bannedPosting) {
      if (r.postMomentPermanent || !r.postMomentUntil) {
        lines.push('账号已被永久禁止发布说说。')
      } else {
        lines.push(`账号已被限制发布说说，解禁时间：${formatUntilLabel(r.postMomentUntil)}。`)
      }
      if (note) lines.push(`封禁原因：${note}`)
    }
    lines.push('如有异议可联系客服。')
    try {
      await createNotification({
        userId: report.target_user_id,
        type: 'report_receipt',
        title: '管理员',
        content: lines.join('\n'),
        relatedId: id
      })
      notifyUserIds.push(report.target_user_id)
    } catch (e) {
      console.error('[report-moderate-target]', e?.message || e)
    }
  }

  return {
    id,
    status: nextStatus,
    momentDeleted,
    actions,
    restrictions: banResult?.restrictions || getUserRestrictions(report.target_user_id),
    notifyUserIds: [...new Set(notifyUserIds)]
  }
}

/**
 * 举报处理：全站禁言（群聊/私聊/发说说/说说评论），自定义天数或永久
 * muteDays: null=不改；0=解除；>0=天数；<0=永久
 */
export async function moderateChatMuteReportForAdmin(
  reportId,
  { muteDays = null, status = 'resolved', adminNote = '' } = {}
) {
  assertConnected()
  const id = Number(reportId)
  if (!id) throw new Error('无效的举报 ID')
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.reporter_id, r.target_user_id, r.moment_id, r.status
     FROM user_reports r
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  )
  const report = rows[0]
  if (!report) throw new Error('举报不存在')

  if (muteDays === null || muteDays === undefined || muteDays === '') {
    throw new Error('请设置禁言天数')
  }
  const days = Number(muteDays)
  if (!Number.isFinite(days)) throw new Error('无效的禁言天数')

  const nextStatus = String(status || 'resolved').trim() || 'resolved'
  if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(nextStatus)) {
    throw new Error('无效的处理状态')
  }

  const muteResult = setChatMuteBan(report.target_user_id, days)
  const actions = []
  if (days < 0) actions.push('已永久禁言（群聊/私聊/说说/评论）')
  else if (days === 0) actions.push('已解除全站禁言')
  else actions.push(`已全站禁言 ${Math.floor(days)} 天（群聊/私聊/说说/评论）`)

  const note = String(adminNote ?? '').trim().slice(0, 500)
  const autoNote = actions.length ? actions.join('；') : ''
  const mergedNote = [note, autoNote].filter(Boolean).join('\n').slice(0, 500)

  await mysqlPool.query(
    `UPDATE user_reports
     SET status = ?,
         admin_note = ?,
         handled_at = CASE WHEN ? IN ('resolved', 'rejected') THEN NOW() ELSE handled_at END
     WHERE id = ?`,
    [nextStatus, mergedNote || null, nextStatus, id]
  )

  const notifyUserIds = []
  const reporterText =
    nextStatus === 'rejected'
      ? note || REPORT_REJECT_RECEIPT_TEXT
      : actions.length
        ? `经核实，您的举报已处理：${actions.join('；')}。感谢您的监督与支持。`
        : REPORT_RESOLVED_RECEIPT_TEXT

  try {
    await createNotification({
      userId: report.reporter_id,
      type: 'report_receipt',
      title: '管理员',
      content: reporterText,
      relatedId: id
    })
    notifyUserIds.push(report.reporter_id)
  } catch (e) {
    console.error('[report-mute-reporter]', e?.message || e)
  }

  const r = muteResult?.restrictions || getUserRestrictions(report.target_user_id)
  const targetLines = []
  if (days === 0) {
    targetLines.push('您的账号已解除全站禁言，可正常在群聊、私聊、说说中发言。')
  } else if (r.chatMutePermanent || !r.chatMuteUntil) {
    targetLines.push('您的账号已被永久禁言，无法在群聊、私聊、说说及评论中发言。')
    if (note) targetLines.push(`禁言原因：${note}`)
  } else {
    targetLines.push(
      `您的账号已被禁言，解禁时间：${formatUntilLabel(r.chatMuteUntil)}。期间无法在群聊、私聊、说说及评论中发言。`
    )
    if (note) targetLines.push(`禁言原因：${note}`)
  }
  targetLines.push('如有异议可联系客服。')
  try {
    await createNotification({
      userId: report.target_user_id,
      type: 'report_receipt',
      title: '管理员',
      content: targetLines.join('\n'),
      relatedId: id
    })
    notifyUserIds.push(report.target_user_id)
  } catch (e) {
    console.error('[report-mute-target]', e?.message || e)
  }

  return {
    id,
    status: nextStatus,
    actions,
    restrictions: r,
    notifyUserIds: [...new Set(notifyUserIds)]
  }
}

function mapAdminUserMessageRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    conversationTitle: row.conversation_title || '',
    conversationType: row.conv_type || '',
    userId: row.user_id,
    content: row.content || '',
    messageType: row.message_type || 'text',
    imageUrl: row.image_url || '',
    createdAt: row.created_at,
    deletedAt: row.deleted_at || null,
    recalledByUserId: row.recalled_by_user_id || null
  }
}

export async function listRecentMessagesByUserIdForAdmin(userId, { limit = 50 } = {}) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的用户 ID')
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id, m.user_id, m.content, m.message_type, m.image_url,
            m.created_at, m.deleted_at, m.recalled_by_user_id,
            c.title AS conversation_title, c.conv_type
     FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [uid, pageSize]
  )
  return rows.map(mapAdminUserMessageRow)
}

export async function listRecentSensitiveByUserIdForAdmin(userId, { limit = 50 } = {}) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的用户 ID')
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const cfg = getBannedWordsConfig()
  const smartWords = getSmartDetectWords()
  const mask = String(cfg.maskChar || '*')
  const maskPattern = mask.repeat(2)
  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id, m.user_id, m.content, m.message_type, m.image_url,
            m.created_at, m.deleted_at, m.recalled_by_user_id,
            c.title AS conversation_title, c.conv_type
     FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ?
       AND m.message_type IN ('text', 'announcement')
       AND m.deleted_at IS NULL
     ORDER BY m.id DESC
     LIMIT 200`,
    [uid]
  )
  const [momentRows] = await mysqlPool.query(
    `SELECT id, content, created_at
     FROM moments
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 80`,
    [uid]
  )
  const sensitiveMessages = []
  for (const row of msgRows) {
    const content = String(row.content || '')
    const hits = findMatchedBannedWords(content, smartWords)
    const masked = maskPattern && content.includes(maskPattern)
    if (!hits.length && !masked) continue
    sensitiveMessages.push({
      ...mapAdminUserMessageRow(row),
      source: 'message',
      matchedWords: hits,
      looksMasked: masked
    })
    if (sensitiveMessages.length >= pageSize) break
  }
  const sensitiveMoments = []
  for (const row of momentRows) {
    const content = String(row.content || '')
    const hits = findMatchedBannedWords(content, smartWords)
    const masked = maskPattern && content.includes(maskPattern)
    if (!hits.length && !masked) continue
    sensitiveMoments.push({
      id: row.id,
      source: 'moment',
      content,
      createdAt: row.created_at,
      matchedWords: hits,
      looksMasked: masked
    })
    if (sensitiveMoments.length >= pageSize) break
  }
  return {
    messages: sensitiveMessages.slice(0, pageSize),
    moments: sensitiveMoments.slice(0, pageSize)
  }
}

/** 举报详情：本地开源词库智能扫描被举报人最近发言 / 说说 / 本条举报内容 */
export async function smartScanReportForAdmin(reportId, { messageLimit = 80, momentLimit = 40 } = {}) {
  assertConnected()
  const id = Number(reportId)
  if (!id) throw new Error('无效的举报 ID')

  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.reporter_id, r.target_user_id, r.moment_id, r.reason, r.detail, r.status,
            m.content AS moment_content, m.user_id AS moment_user_id
     FROM user_reports r
     LEFT JOIN moments m ON m.id = r.moment_id
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  )
  const report = rows[0]
  if (!report) throw new Error('举报不存在')

  const meta = getSmartDetectMeta()
  const smartWords = getSmartDetectWords()
  const uid = Number(report.target_user_id)
  const msgCap = Math.min(Math.max(Number(messageLimit) || 80, 1), 200)
  const momentCap = Math.min(Math.max(Number(momentLimit) || 40, 1), 100)

  const detailHits = findMatchedBannedWords(report.detail || '', smartWords)
  const momentContent = report.moment_id ? String(report.moment_content || '') : ''
  const momentHits = momentContent ? findMatchedBannedWords(momentContent, smartWords) : []

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id, m.user_id, m.content, m.message_type, m.image_url,
            m.created_at, m.deleted_at, m.recalled_by_user_id,
            c.title AS conversation_title, c.conv_type
     FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ?
       AND m.message_type IN ('text', 'announcement')
       AND m.deleted_at IS NULL
     ORDER BY m.id DESC
     LIMIT ?`,
    [uid, msgCap]
  )
  const [momentRows] = await mysqlPool.query(
    `SELECT id, content, created_at
     FROM moments
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [uid, momentCap]
  )

  const hitMessages = []
  for (const row of msgRows) {
    const content = String(row.content || '')
    const hits = findMatchedBannedWords(content, smartWords)
    if (!hits.length) continue
    hitMessages.push({
      ...mapAdminUserMessageRow(row),
      source: 'message',
      matchedWords: hits
    })
  }

  const hitMoments = []
  for (const row of momentRows) {
    const content = String(row.content || '')
    const hits = findMatchedBannedWords(content, smartWords)
    if (!hits.length) continue
    hitMoments.push({
      id: Number(row.id),
      source: 'moment',
      content,
      createdAt: row.created_at,
      matchedWords: hits,
      isReportedMoment: report.moment_id && Number(row.id) === Number(report.moment_id)
    })
  }

  const allHitWords = new Set([
    ...detailHits,
    ...momentHits,
    ...hitMessages.flatMap((x) => x.matchedWords || []),
    ...hitMoments.flatMap((x) => x.matchedWords || [])
  ])

  return {
    ...meta,
    reportId: id,
    targetUserId: uid,
    scanned: {
      messages: msgRows.length,
      moments: momentRows.length
    },
    summary: {
      hasHit: allHitWords.size > 0,
      uniqueWords: [...allHitWords],
      detailHitCount: detailHits.length,
      reportedMomentHitCount: momentHits.length,
      messageHitCount: hitMessages.length,
      momentHitCount: hitMoments.length
    },
    report: {
      reason: report.reason,
      detail: report.detail || '',
      detailMatchedWords: detailHits,
      momentId: report.moment_id ? Number(report.moment_id) : null,
      momentDeleted: !!(report.moment_id && !report.moment_user_id),
      momentContent,
      momentMatchedWords: momentHits
    },
    messages: hitMessages,
    moments: hitMoments
  }
}

const REPORT_NOTE_AI_SYSTEM = `你是社区审核助手。请根据举报信息与智能检测结果，撰写发给被举报用户的违规处理原因说明。
要求：
1. 语气正式、客观，使用中文，不超过120字
2. 直接输出原因正文，不要标题、不要 Markdown、不要引号包裹
3. 不要写解禁时间或天数（系统会自动补充）
4. 只陈述违规事实与处理依据，不要道歉或解释审核流程`

export async function isReportAiNoteAvailable() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT id FROM ai_bots
     WHERE enabled = 1
       AND api_base_url IS NOT NULL AND TRIM(api_base_url) <> ''
       AND api_key IS NOT NULL AND TRIM(api_key) <> ''
     LIMIT 1`
  )
  return rows.length > 0
}

export async function generateReportAdminNoteForAdmin(reportId, options = {}) {
  assertConnected()
  const id = Number(reportId)
  if (!id) throw new Error('无效的举报 ID')

  const [botRows] = await mysqlPool.query(
    `SELECT id, name, avatar_url, mention_names, api_base_url, api_key, model,
            persona_id, system_prompt, enabled
     FROM ai_bots
     WHERE enabled = 1
       AND api_base_url IS NOT NULL AND TRIM(api_base_url) <> ''
       AND api_key IS NOT NULL AND TRIM(api_key) <> ''
     ORDER BY id DESC
     LIMIT 1`
  )
  if (!botRows.length) {
    throw new Error('未配置可用的群 AI，请先在「群 AI」中创建并填写接口地址与 API Key')
  }
  const rawBot = botRows[0]
  const bot = {
    ...mapAiBotRow(rawBot, { maskKey: false }),
    apiKey: rawBot.api_key || ''
  }

  const [rows] = await mysqlPool.query(
    `SELECT r.reason, r.detail, r.moment_id, m.content AS moment_content
     FROM user_reports r
     LEFT JOIN moments m ON m.id = r.moment_id
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  )
  if (!rows.length) throw new Error('举报不存在')
  const report = rows[0]

  const action = String(options.action || 'mute').trim()
  const detectionContext = String(options.detectionContext ?? options.context ?? '').trim()
  const scanSummary =
    options.scanSummary && typeof options.scanSummary === 'object' ? options.scanSummary : null

  const actionLabel =
    {
      mute: '全站禁言',
      moment: '说说违规（删帖/禁发说说）',
      general: '违规处理'
    }[action] || '违规处理'

  const parts = [
    `处理类型：${actionLabel}`,
    `举报原因：${report.reason || '—'}`,
    `举报说明：${String(report.detail || '').slice(0, 400) || '无'}`
  ]
  if (report.moment_id) {
    parts.push(`被举报说说：${String(report.moment_content || '').slice(0, 400) || '无文字内容'}`)
  }
  if (detectionContext) parts.push(`检测维度：${detectionContext}`)
  if (scanSummary) {
    const words = Array.isArray(scanSummary.uniqueWords) ? scanSummary.uniqueWords : []
    if (words.length) parts.push(`命中敏感词：${words.slice(0, 24).join('、')}`)
    parts.push(
      `发言命中 ${Number(scanSummary.messageHitCount) || 0} 条，说说命中 ${Number(scanSummary.momentHitCount) || 0} 条`
    )
  }

  const note = await callAiChatCompletion(
    { ...bot, systemPrompt: REPORT_NOTE_AI_SYSTEM },
    parts.join('\n'),
    [],
    { sanitizeChat: false }
  )
  return {
    note: String(note).trim().slice(0, 500),
    botName: bot.name || 'AI'
  }
}

export async function createUserForAdmin({ username, password, nickname, email, registerIp }) {
  assertConnected()
  const rawUsername = String(username || '').trim()
  const pwd = String(password || '')
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]{3,32}$/.test(rawUsername)) {
    throw new Error('账户名需 3-32 位，支持中文、字母、数字、下划线')
  }
  if (pwd.length < 6) throw new Error('密码至少 6 位')
  const nick = rawUsername

  if (await findUserByUsername(rawUsername)) {
    const err = new Error('账户名已被占用')
    err.code = 'USERNAME_TAKEN'
    throw err
  }

  assertAllowedRegisterUsername(rawUsername)

  const emailVal = email ? String(email).trim().toLowerCase() : null
  if (emailVal && (await isEmailRegistered(emailVal))) {
    const err = new Error('该邮箱已被注册')
    err.code = 'EMAIL_TAKEN'
    throw err
  }

  const created = await createUser({
    username: rawUsername,
    password: pwd,
    nickname: nick,
    email: emailVal,
    registerIp: registerIp ? String(registerIp).trim().slice(0, 45) : '127.0.0.1',
    userAgent: 'admin-create'
  })

  const row = await findUserById(created.id)
  if (!row) throw new Error('创建成功但读取用户失败')
  return mapAdminUser(row)
}

export async function setUserBanned(id, banned) {
  assertConnected()
  const status = banned ? 'banned' : 'active'
  const [result] = await mysqlPool.query('UPDATE users SET status = ? WHERE id = ?', [status, id])
  if (result.affectedRows === 0) throw new Error('用户不存在')
  return { message: banned ? '已封禁' : '已解除封禁', banned, status }
}

export async function updateUserChatNoForAdmin(userId, chatNoInput) {
  assertConnected()
  const id = Number(userId)
  if (!id) throw new Error('无效的用户 ID')

  const raw = String(chatNoInput ?? '').trim()
  if (!raw) throw new Error('请输入聊聊号')
  if (!isAdminNumericCode(raw)) throw new Error(adminNumericFormatError('聊聊号'))

  const chatNo = Number(raw)
  if (!Number.isFinite(chatNo) || chatNo <= 0) throw new Error('请输入有效的聊聊号')

  const user = await findUserById(id)
  if (!user) throw new Error('用户不存在')

  if (Number(user.chat_no) === chatNo) {
    return mapAdminUser(user)
  }

  const existing = await findUserByChatNo(chatNo)
  if (existing && Number(existing.id) !== id) {
    throw new Error('该聊聊号已被其他用户使用')
  }

  const [result] = await mysqlPool.query('UPDATE users SET chat_no = ? WHERE id = ?', [chatNo, id])
  if (!result.affectedRows) throw new Error('用户不存在')

  const row = await findUserById(id)
  if (!row) throw new Error('更新成功但读取用户失败')
  return mapAdminUser(row)
}

export async function updateUserBadgeForAdmin(userId, payload = {}) {
  assertConnected()
  const id = Number(userId)
  if (!id) throw new Error('无效的用户 ID')
  const user = await findUserById(id)
  if (!user) throw new Error('用户不存在')

  let badges
  if (Array.isArray(payload.badges)) {
    badges = normalizeUserBadges(payload.badges)
  } else if (payload.clear === true) {
    badges = []
  } else {
    // 兼容旧单微标入参
    const one = normalizeUserBadge(
      payload.badgeText ?? payload.badge_text,
      payload.badgeColor ?? payload.badge_color
    )
    badges = one.badgeText
      ? [{ badgeText: one.badgeText, badgeColor: one.badgeColor }]
      : []
  }
  if (badges.length > USER_BADGE_MAX) {
    throw new Error(`每个用户最多设置 ${USER_BADGE_MAX} 个微标`)
  }

  const first = badges[0] || { badgeText: null, badgeColor: null }
  const [result] = await mysqlPool.query(
    'UPDATE users SET badge_text = ?, badge_color = ?, badges = ? WHERE id = ?',
    [
      first.badgeText,
      first.badgeColor,
      badges.length ? JSON.stringify(badges) : null,
      id
    ]
  )
  if (!result.affectedRows) throw new Error('用户不存在')

  const row = await findUserById(id)
  if (!row) throw new Error('更新成功但读取用户失败')
  return mapAdminUser(row)
}

export async function deleteUserById(id) {
  assertConnected()
  const user = await findUserById(id)
  const [result] = await mysqlPool.query('DELETE FROM users WHERE id = ?', [id])
  if (result.affectedRows === 0) throw new Error('用户不存在')
  removeUserRestrictions(id)
  if (user?.avatar_url) {
    await safeDeleteAvatarFile(user.avatar_url, mysqlPool)
  }
  return { message: '用户已删除' }
}

function escapeLikePrefix(prefix) {
  return String(prefix).replace(/[%_\\]/g, '\\$&')
}

export async function deleteUsersByUsernamePrefix(prefix) {
  assertConnected()
  const pat = String(prefix || '').trim()
  if (!pat || pat.length > 32 || pat.includes('%')) {
    throw new Error('无效的用户名前缀')
  }
  const likePattern = `${escapeLikePrefix(pat)}%`
  const [rows] = await mysqlPool.query(
    "SELECT id, username FROM users WHERE username LIKE ? ESCAPE '\\\\'",
    [likePattern]
  )
  let deleted = 0
  const errors = []
  for (const row of rows) {
    try {
      await deleteUserById(row.id)
      deleted += 1
    } catch (e) {
      errors.push({ id: row.id, username: row.username, message: e.message || '删除失败' })
    }
  }
  return { deleted, total: rows.length, errors }
}

export const ZOMBIE_USERNAME_PREFIXES = [
  'bot_',
  'zombie_',
  'testuser_',
  'rltest_',
  'spam_',
  'fake_',
  'testbot_'
]

export async function deleteZombieUsers(prefixes = ZOMBIE_USERNAME_PREFIXES) {
  assertConnected()
  let deleted = 0
  let total = 0
  const errors = []
  const details = []
  for (const prefix of prefixes) {
    const result = await deleteUsersByUsernamePrefix(prefix)
    deleted += result.deleted
    total += result.total
    if (result.errors?.length) errors.push(...result.errors)
    if (result.total) details.push({ prefix, deleted: result.deleted, total: result.total })
  }
  return { deleted, total, errors, details }
}

export async function listAvatarsForAdmin() {
  assertConnected()
  const data = await listAvatarFiles(mysqlPool)
  const list = data.list.filter((item) => !item.isDefault)
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { ...data, list, totalSize }
}

function formatAdminGroupChatTitle(title) {
  const name = String(title || '').trim() || '未命名'
  return /群聊$/.test(name) ? name : `${name}群聊`
}

function formatAdminDirectChatTitle(memberNames) {
  const names = (memberNames || []).map((n) => String(n || '').trim()).filter(Boolean)
  if (names.length >= 2) return `私聊 · ${names[0]} / ${names[1]}`
  if (names.length === 1) return `私聊 · ${names[0]}`
  return '私聊'
}

/**
 * 管理后台：按会话分组展示文件（群聊 + 私聊 + 磁盘孤儿）
 */
export async function listGroupFilesForAdmin() {
  assertConnected()
  const disk = listGroupFilesOnDisk()
  const diskByName = new Map(disk.list.map((f) => [f.filename, f]))

  const [rows] = await mysqlPool.query(
    `SELECT m.id AS messageId, m.file_url AS fileUrl, m.file_name AS fileName, m.file_size AS fileSize,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            m.conversation_id AS conversationId,
            c.title AS groupTitle, c.group_code AS groupCode, c.conv_type AS convType,
            u.nickname, u.username
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.message_type = 'file'
       AND m.file_url IS NOT NULL
       AND (c.conv_type = 'group' OR c.conv_type = 'direct' OR c.conv_type IS NULL)
     ORDER BY c.conv_type DESC, c.title ASC, m.id DESC
     LIMIT 2000`
  )

  const directIds = [
    ...new Set(
      rows
        .filter((r) => String(r.convType || '').toLowerCase() !== 'group')
        .map((r) => Number(r.conversationId))
        .filter((id) => id > 0)
    )
  ]
  const directMembers = new Map()
  if (directIds.length > 0) {
    const [memRows] = await mysqlPool.query(
      `SELECT cm.conversation_id AS conversationId,
              COALESCE(u.nickname, u.username, '') AS displayName
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id IN (${directIds.map(() => '?').join(',')})
       ORDER BY cm.conversation_id ASC, cm.user_id ASC`,
      directIds
    )
    for (const row of memRows) {
      const cid = Number(row.conversationId)
      if (!directMembers.has(cid)) directMembers.set(cid, [])
      const list = directMembers.get(cid)
      if (list.length < 2) list.push(row.displayName || '用户')
    }
  }

  const groupsMap = new Map()
  const claimed = new Set()

  for (const row of rows) {
    const filename = groupFileUrlToFilename(row.fileUrl)
    const diskFile = filename ? diskByName.get(filename) : null
    if (row.deletedAt && !diskFile) continue
    if (filename) claimed.add(filename)

    const cid = Number(row.conversationId)
    const isGroup = String(row.convType || '').toLowerCase() === 'group'
    const retentionMs = isGroup ? GROUP_FILE_RETENTION_MS : DIRECT_FILE_RETENTION_MS
    const retentionDays = isGroup ? GROUP_FILE_RETENTION_DAYS : DIRECT_FILE_RETENTION_DAYS
    if (!groupsMap.has(cid)) {
      groupsMap.set(cid, {
        conversationId: cid,
        title: isGroup
          ? formatAdminGroupChatTitle(row.groupTitle)
          : formatAdminDirectChatTitle(directMembers.get(cid) || []),
        groupCode: isGroup ? row.groupCode || '' : '',
        convType: isGroup ? 'group' : 'direct',
        usedBytes: 0,
        fileCount: 0,
        files: []
      })
    }
    const group = groupsMap.get(cid)
    const size = diskFile ? diskFile.size : Number(row.fileSize || 0) || 0
    const fileUrl = diskFile ? diskFile.url : row.fileUrl || ''
    const createdAtIso = row.createdAt ? new Date(row.createdAt).toISOString() : ''
    const createdMs = row.createdAt ? new Date(row.createdAt).getTime() : NaN
    const expiresAtIso = Number.isFinite(createdMs)
      ? new Date(createdMs + retentionMs).toISOString()
      : ''
    group.files.push({
      messageId: row.messageId,
      filename: filename || '',
      displayName:
        decodeUploadFilename(row.fileName || '') || row.fileName || filename || '文件',
      url: fileUrl,
      size,
      updatedAt: diskFile?.updatedAt || createdAtIso,
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      retentionDays,
      senderName: row.nickname || row.username || '用户',
      onDisk: Boolean(diskFile),
      deleted: Boolean(row.deletedAt)
    })
    group.usedBytes += size
    group.fileCount += 1
  }

  const orphanFiles = []
  for (const f of disk.list) {
    if (claimed.has(f.filename)) continue
    const baseMs = f.updatedAt ? new Date(f.updatedAt).getTime() : Date.now()
    orphanFiles.push({
      messageId: null,
      filename: f.filename,
      displayName: f.filename,
      url: f.url,
      size: f.size,
      updatedAt: f.updatedAt,
      createdAt: f.updatedAt,
      expiresAt: Number.isFinite(baseMs)
        ? new Date(baseMs + GROUP_FILE_RETENTION_MS).toISOString()
        : '',
      retentionDays: GROUP_FILE_RETENTION_DAYS,
      senderName: '',
      onDisk: true,
      deleted: false
    })
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (a.convType !== b.convType) return a.convType === 'group' ? -1 : 1
    return a.title.localeCompare(b.title, 'zh')
  })
  if (orphanFiles.length > 0) {
    groups.push({
      conversationId: 0,
      title: '未关联会话',
      groupCode: '',
      convType: 'orphan',
      usedBytes: orphanFiles.reduce((s, f) => s + f.size, 0),
      fileCount: orphanFiles.length,
      files: orphanFiles,
      orphan: true
    })
  }

  return {
    dir: disk.dir,
    groups,
    fileCount: disk.list.length,
    totalSize: disk.totalSize,
    retentionDays: GROUP_FILE_RETENTION_DAYS,
    directRetentionDays: DIRECT_FILE_RETENTION_DAYS,
    // 兼容旧前端扁平列表
    list: disk.list
  }
}

export async function deleteGroupFileForAdmin(filename) {
  assertConnected()
  const result = deleteGroupFileOnDisk(filename)
  const variants = groupFileUrlVariants(result.filename)
  if (variants.length > 0) {
    await mysqlPool.query(
      `UPDATE messages
       SET deleted_at = NOW(), content = '', image_url = NULL, voice_url = NULL, voice_duration = NULL,
           file_url = NULL, file_name = NULL, file_size = NULL, file_safety = 'unknown'
       WHERE message_type = 'file'
         AND deleted_at IS NULL
         AND file_url IN (?, ?)`,
      variants
    )
  }
  return result
}

/** 管理后台：一键清空全部群文件（磁盘 + 软删消息） */
export async function deleteAllGroupFilesForAdmin() {
  assertConnected()
  const disk = listGroupFilesOnDisk()
  let deleted = 0
  for (const f of disk.list) {
    try {
      await deleteGroupFileForAdmin(f.filename)
      deleted += 1
    } catch {
      // ignore single file
    }
  }
  // 兜底：软删仍指向群文件但磁盘已无的消息
  const like = `${GROUP_FILE_URL_PREFIX.replace(/'/g, '')}/%`
  await mysqlPool.query(
    `UPDATE messages
     SET deleted_at = NOW(), content = '', image_url = NULL, voice_url = NULL, voice_duration = NULL,
         file_url = NULL, file_name = NULL, file_size = NULL, file_safety = 'unknown'
     WHERE message_type = 'file'
       AND deleted_at IS NULL
       AND file_url IS NOT NULL
       AND file_url LIKE ?`,
    [like]
  )
  return { deleted }
}

export async function deleteAvatarFileAdmin(filename) {
  assertConnected()
  const safe = String(filename || '')
    .split(/[/\\]/)
    .pop()
  if (!safe || safe.includes('..')) throw new Error('无效的文件名')
  const url = `/media/avatar/${safe}`
  const mosaicMatch = /^group-mosaic-(\d+)\.webp$/i.exec(safe)
  const groupIds = new Set(await findGroupsByAvatarUrl(url))
  if (mosaicMatch) groupIds.add(Number(mosaicMatch[1]))

  // 先把引用此文件的群切回组合头像并推送，再删文件
  const resetResults = []
  for (const gid of groupIds) {
    try {
      const next = await resetGroupAvatarToComposite(gid)
      resetResults.push({ groupId: gid, avatarUrl: next })
    } catch (e) {
      console.warn('[group-avatar] reset after admin delete failed', gid, e?.message || e)
    }
  }

  // 组合图会被 reset 重新写出；自定义图此时已无引用，可删
  if (!mosaicMatch) {
    try {
      await deleteAvatarFileForAdmin(safe, mysqlPool)
    } catch (e) {
      // 若仍被用户头像引用则保留文件，群侧已切走
      if (!/仍被|引用/.test(String(e.message || ''))) throw e
    }
  }

  return {
    filename: safe,
    resetGroups: resetResults
  }
}

async function findDirectConversation(userId, friendId) {
  const [rows] = await mysqlPool.query(
    `SELECT c.id, COALESCE(u.nickname, u.username, c.title) AS title,
            COALESCE(u.avatar_url, c.avatar_url) AS avatarUrl,
            c.last_message AS lastMessage, c.updated_at AS updatedAt
     FROM conversations c
     JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
     JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
     LEFT JOIN users u ON u.id = ?
     WHERE (c.conv_type IS NULL OR c.conv_type = 'direct')
     LIMIT 1`,
    [userId, friendId, friendId]
  )
  return rows[0] || null
}

export async function listFriends(userId) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status, u.province, u.bio
     FROM friendships f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ?
     ORDER BY u.chat_no ASC`,
    [userId]
  )
  return rows.map((row) => ({
    ...getUserPublic(row),
    bio: String(row.bio || '').trim()
  }))
}

export async function searchUsersForFriend(userId, keyword) {
  assertConnected()
  const q = String(keyword || '').trim()
  if (!q) return []
  let rows = []
  if (/^\d+$/.test(q)) {
    ;[rows] = await mysqlPool.query(
      `SELECT u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status
       FROM users u
       WHERE u.id <> ?
         AND u.status = 'active'
         AND u.username <> '__system_admin__'
         AND CAST(u.chat_no AS CHAR) LIKE ?
       ORDER BY u.chat_no ASC
       LIMIT 10`,
      [userId, `${q}%`]
    )
  } else {
    ;[rows] = await mysqlPool.query(
      `SELECT u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status
       FROM users u
       WHERE u.id <> ?
         AND u.status = 'active'
         AND u.username <> '__system_admin__'
         AND (u.nickname LIKE ? OR u.username LIKE ?)
       ORDER BY u.nickname ASC
       LIMIT 10`,
      [userId, `%${q}%`, `%${q}%`]
    )
  }
  return attachFriendRelationStatus(userId, rows.map((row) => getUserPublic(row)))
}

export async function listRecommendedUsersForFriend(userId, limit = 10) {
  assertConnected()
  const uid = Number(userId)
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 20)
  if (!uid) return []

  // 优先：共同群成员
  const [mutualRows] = await mysqlPool.query(
    `SELECT u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status,
            u.bio, u.province, MAX(c.title) AS mutualGroupTitle
     FROM conversation_members me
     INNER JOIN conversations c
       ON c.id = me.conversation_id AND c.conv_type = 'group'
     INNER JOIN conversation_members other
       ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
     INNER JOIN users u ON u.id = other.user_id
     WHERE me.user_id = ?
       AND u.status = 'active'
       AND u.username <> '__system_admin__'
       AND NOT EXISTS (
         SELECT 1 FROM friendships f
         WHERE f.user_id = ? AND f.friend_id = u.id
       )
     GROUP BY u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status, u.bio, u.province
     ORDER BY MAX(c.updated_at) DESC
     LIMIT ?`,
    [uid, uid, lim]
  )

  const picked = new Map()
  for (const row of mutualRows) {
    picked.set(Number(row.id), row)
  }

  if (picked.size < lim) {
    const need = lim - picked.size
    const excludeIds = [uid, ...picked.keys()]
    const [fillRows] = await mysqlPool.query(
      `SELECT u.id, u.chat_no, u.username, u.nickname, u.avatar_url, u.status,
              u.bio, u.province, NULL AS mutualGroupTitle
       FROM users u
       WHERE u.id NOT IN (${excludeIds.map(() => '?').join(',')})
         AND u.status = 'active'
         AND u.username <> '__system_admin__'
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.user_id = ? AND f.friend_id = u.id
         )
       ORDER BY RAND()
       LIMIT ?`,
      [...excludeIds, uid, need]
    )
    for (const row of fillRows) {
      picked.set(Number(row.id), row)
    }
  }

  const rows = [...picked.values()]
  const withStatus = await attachFriendRelationStatus(
    uid,
    rows.map((row) => ({
      ...getUserPublic(row),
      bio: String(row.bio || '').trim(),
      province: String(row.province || '').trim(),
      mutualGroupTitle: String(row.mutualGroupTitle || '').trim() || null
    }))
  )

  const ids = withStatus.map((u) => Number(u.id)).filter(Boolean)
  const mediaByUser = new Map()
  if (ids.length) {
    const [momentRows] = await mysqlPool.query(
      `SELECT user_id AS userId, images_json AS imagesJson
       FROM moments
       WHERE visibility = 'public'
         AND user_id IN (${ids.map(() => '?').join(',')})
       ORDER BY id DESC
       LIMIT 80`,
      ids
    )
    for (const row of momentRows) {
      const id = Number(row.userId)
      if (!id) continue
      const list = mediaByUser.get(id) || []
      if (list.length >= 5) continue
      for (const m of parseMomentMediaJson(row.imagesJson)) {
        if (list.length >= 5) break
        list.push({
          url: m.url,
          isVideo: m.type === 'video',
          duration: m.duration || 0
        })
      }
      mediaByUser.set(id, list)
    }
  }

  return withStatus.map((u) => {
    const groupTitle = String(u.mutualGroupTitle || '').trim()
    const province = String(u.province || '').trim()
    const bio = String(u.bio || '').trim()
    let recommendReason = ''
    if (groupTitle) {
      recommendReason = `你的群友 · 你和TA来自相同群「${groupTitle}」`
    } else if (bio) {
      recommendReason = bio
    } else if (province) {
      recommendReason = `可能来自 ${province}`
    }
    return {
      ...u,
      bio,
      province,
      recommendReason,
      previewMedia: mediaByUser.get(Number(u.id)) || []
    }
  })
}

async function areFriends(userId, friendId) {
  const [rows] = await mysqlPool.query(
    'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1',
    [userId, friendId]
  )
  return rows.length > 0
}

export async function getFriendRelationStatus(userId, targetUserId) {
  assertConnected()
  const uid = Number(userId)
  const tid = Number(targetUserId)
  if (!uid || !tid || uid === tid) return 'none'
  if (await areFriends(uid, tid)) return 'friends'
  const [sent] = await mysqlPool.query(
    "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    [uid, tid]
  )
  if (sent.length) return 'pending_sent'
  const [recv] = await mysqlPool.query(
    "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    [tid, uid]
  )
  if (recv.length) return 'pending_received'
  return 'none'
}

async function attachFriendRelationStatus(viewerId, users) {
  if (!users?.length) return []
  const ids = users.map((u) => Number(u.id)).filter(Boolean)
  if (!ids.length) return users.map((u) => ({ ...u, relationStatus: 'none' }))

  const [friendRows] = await mysqlPool.query(
    `SELECT friend_id FROM friendships WHERE user_id = ? AND friend_id IN (${ids.map(() => '?').join(',')})`,
    [viewerId, ...ids]
  )
  const friendSet = new Set(friendRows.map((r) => Number(r.friend_id)))

  const [sentRows] = await mysqlPool.query(
    `SELECT to_user_id FROM friend_requests
     WHERE from_user_id = ? AND status = 'pending' AND to_user_id IN (${ids.map(() => '?').join(',')})`,
    [viewerId, ...ids]
  )
  const sentSet = new Set(sentRows.map((r) => Number(r.to_user_id)))

  const [recvRows] = await mysqlPool.query(
    `SELECT from_user_id, id FROM friend_requests
     WHERE to_user_id = ? AND status = 'pending' AND from_user_id IN (${ids.map(() => '?').join(',')})`,
    [viewerId, ...ids]
  )
  const recvMap = new Map(recvRows.map((r) => [Number(r.from_user_id), Number(r.id)]))

  return users.map((u) => {
    const id = Number(u.id)
    let relationStatus = 'none'
    let incomingRequestId = null
    if (friendSet.has(id)) relationStatus = 'friends'
    else if (sentSet.has(id)) relationStatus = 'pending_sent'
    else if (recvMap.has(id)) {
      relationStatus = 'pending_received'
      incomingRequestId = recvMap.get(id)
    }
    return { ...u, relationStatus, incomingRequestId }
  })
}

async function ensureDirectConversation(userId, friendUser) {
  let conversation = await findDirectConversation(userId, friendUser.id)
  if (conversation) {
    return {
      id: conversation.id,
      title: friendUser.nickname || friendUser.username,
      avatarUrl: normalizeAvatarUrl(friendUser.avatar_url || friendUser.avatarUrl),
      convType: 'direct',
      peerId: friendUser.id,
      lastMessage: conversation.lastMessage || '',
      updatedAt: conversation.updatedAt
    }
  }
  const avatar = friendUser.avatar_url || friendUser.avatarUrl || pickDefaultAvatarUrlForSeed(friendUser.id)
  const [convResult] = await mysqlPool.query(
    "INSERT INTO conversations (title, avatar_url, last_message, conv_type) VALUES (?, ?, ?, 'direct')",
    [friendUser.nickname || friendUser.username, avatar, '']
  )
  const convId = convResult.insertId
  await mysqlPool.query(
    'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)',
    [convId, userId, convId, friendUser.id]
  )
  return {
    id: convId,
    title: friendUser.nickname || friendUser.username,
    avatarUrl: normalizeAvatarUrl(avatar),
    convType: 'direct',
    peerId: friendUser.id,
    lastMessage: '',
    updatedAt: new Date()
  }
}

/** 仅好友可开/取私聊会话，供转发等场景使用 */
export async function getOrCreateDirectConversation(userId, peerUserId) {
  assertConnected()
  const uid = Number(userId)
  const peerId = Number(peerUserId)
  if (!uid || !peerId) throw new Error('无效的用户')
  if (uid === peerId) throw new Error('不能转发给自己')
  const [friendRows] = await mysqlPool.query(
    'SELECT 1 AS ok FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1',
    [uid, peerId]
  )
  if (!friendRows.length) throw new Error('只能转发给好友')
  const peer = await findUserById(peerId)
  if (!peer || peer.status !== 'active') throw new Error('好友不存在或不可用')
  return ensureDirectConversation(uid, peer)
}

async function createNotification({ userId, type, title, content, relatedId, actorUserId }) {
  const [result] = await mysqlPool.query(
    `INSERT INTO notifications (user_id, type, title, content, related_id, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, content, relatedId ?? null, actorUserId ?? null]
  )
  return result.insertId
}

async function dismissRequestNotification(userId, relatedId, type) {
  const uid = Number(userId)
  const rid = Number(relatedId)
  if (!uid || !rid || !type) return
  await mysqlPool.query(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND related_id = ? AND type = ?',
    [uid, rid, type]
  )
}

async function dismissRequestNotificationsByRelatedIds(relatedIds, type) {
  const ids = [...new Set(relatedIds.map(Number).filter(Boolean))]
  if (!ids.length || !type) return
  await mysqlPool.query('UPDATE notifications SET is_read = 1 WHERE type = ? AND related_id IN (?)', [
    type,
    ids
  ])
}

export async function sendFriendRequest(userId, targetUserId, { source } = {}) {
  assertConnected()
  const fromId = Number(userId)
  assertUserRestrictionAllowed(fromId, 'addFriend')
  const toId = Number(targetUserId)
  if (!toId) throw new Error('目标用户不存在')
  if (fromId === toId) throw new Error('不能添加自己为好友')

  const target = await findUserById(toId)
  if (!target) throw new Error('目标用户不存在')
  if (target.status !== 'active') throw new Error('该用户不可用')

  if (await areFriends(fromId, toId)) {
    const conversation = await findDirectConversation(fromId, toId)
    return {
      friend: getUserPublic(target),
      conversation,
      relationStatus: 'friends',
      message: '你们已经是好友了'
    }
  }

  const [incomingRows] = await mysqlPool.query(
    "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    [toId, fromId]
  )
  if (incomingRows.length) {
    return respondFriendRequest(fromId, incomingRows[0].id, 'accept')
  }

  const [existingSent] = await mysqlPool.query(
    "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    [fromId, toId]
  )
  if (existingSent.length) {
    return {
      friend: getUserPublic(target),
      relationStatus: 'pending_sent',
      message: '已发送过好友申请，请等待对方处理'
    }
  }

  const fromUser = await findUserById(fromId)
  const fromName = fromUser?.nickname || fromUser?.username || '用户'
  const src = String(source || '').trim().toLowerCase()
  let content
  if (src === 'scan' || src === 'qr' || src === '扫一扫') {
    content = `${fromName} 通过扫一扫添加你为好友`
  } else if (
    src === 'group' ||
    src === 'group_member' ||
    src.includes('群')
  ) {
    content = `${fromName} 通过群聊添加你为好友`
  } else {
    content = `${fromName} 通过搜索id添加你为好友`
  }

  const [reqResult] = await mysqlPool.query(
    "INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')",
    [fromId, toId]
  )
  const requestId = reqResult.insertId

  await createNotification({
    userId: toId,
    type: 'friend_request',
    title: '好友申请',
    content,
    relatedId: requestId,
    actorUserId: fromId
  })

  return {
    friend: getUserPublic(target),
    requestId,
    relationStatus: 'pending_sent',
    message: '好友申请已发送'
  }
}

export async function sendFriendRequestByQuery(userId, friendQuery) {
  const q = String(friendQuery || '').trim()
  if (!q) throw new Error('请输入聊聊号或账户名')
  const friend = await resolveUserByFriendQuery(q)
  if (!friend) throw new Error('用户不存在')
  return sendFriendRequest(userId, friend.id, { source: 'search' })
}

export async function respondFriendRequest(userId, requestId, action) {
  assertConnected()
  const rid = Number(requestId)
  const uid = Number(userId)
  if (!rid) throw new Error('无效的申请')
  if (!['accept', 'reject'].includes(action)) throw new Error('无效的操作')

  const [rows] = await mysqlPool.query('SELECT * FROM friend_requests WHERE id = ? LIMIT 1', [rid])
  const request = rows[0]
  if (!request) {
    await dismissRequestNotification(uid, rid, 'friend_request')
    throw new Error('好友申请不存在')
  }
  if (Number(request.to_user_id) !== uid) throw new Error('无权处理此申请')
  if (request.status !== 'pending') {
    await dismissRequestNotification(uid, rid, 'friend_request')
    throw new Error('该申请已处理')
  }

  const fromId = Number(request.from_user_id)
  const newStatus = action === 'accept' ? 'accepted' : 'rejected'
  await mysqlPool.query('UPDATE friend_requests SET status = ? WHERE id = ?', [newStatus, rid])
  await dismissRequestNotification(uid, rid, 'friend_request')

  const fromUser = await findUserById(fromId)
  if (!fromUser) throw new Error('申请人不存在')

  if (action === 'reject') {
    return {
      requestId: rid,
      relationStatus: 'none',
      message: '已拒绝好友申请'
    }
  }

  if (!(await areFriends(uid, fromId))) {
    await mysqlPool.query('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)', [
      fromId,
      uid,
      uid,
      fromId
    ])
  }

  const conversation = await ensureDirectConversation(uid, fromUser)
  return {
    requestId: rid,
    friend: getUserPublic(fromUser),
    conversation,
    relationStatus: 'friends',
    message: '已添加为好友'
  }
}

export async function deleteFriendById(userId, friendId) {
  assertConnected()
  const uid = Number(userId)
  const fid = Number(friendId)
  if (!fid || fid === uid) throw new Error('无效的好友')

  if (!(await areFriends(uid, fid))) throw new Error('你们还不是好友')

  const conv = await findDirectConversation(uid, fid)
  if (conv?.id) {
    await mysqlPool.query('DELETE FROM messages WHERE conversation_id = ?', [conv.id])
    await mysqlPool.query('DELETE FROM conversation_members WHERE conversation_id = ?', [conv.id])
    await mysqlPool.query('DELETE FROM conversations WHERE id = ?', [conv.id])
  }

  await mysqlPool.query(
    'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    [uid, fid, fid, uid]
  )
  const [pendingFriendRows] = await mysqlPool.query(
    "SELECT id FROM friend_requests WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))",
    [uid, fid, fid, uid]
  )
  if (pendingFriendRows.length) {
    await mysqlPool.query(
      "UPDATE friend_requests SET status = 'rejected' WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))",
      [uid, fid, fid, uid]
    )
    await dismissRequestNotificationsByRelatedIds(
      pendingFriendRows.map((row) => row.id),
      'friend_request'
    )
  }

  return { message: '已删除好友', friendId: fid }
}

export async function listNotifications(userId, { markRead = false, markReadTypes = null } = {}) {
  assertConnected()
  const uid = Number(userId)
  const [rows] = await mysqlPool.query(
    `SELECT n.id, n.type, n.title, n.content, n.related_id AS relatedId,
            n.actor_user_id AS actorUserId, n.is_read AS isRead, n.created_at AS createdAt,
            u.username AS actorUsername, u.nickname AS actorNickname, u.avatar_url AS actorAvatarUrl,
            u.chat_no AS actorChatNo,
            fr.status AS requestStatus,
            gjr.status AS groupJoinRequestStatus,
            c.title AS groupTitle,
            gc.title AS mentionGroupTitle
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_user_id
     LEFT JOIN friend_requests fr ON fr.id = n.related_id AND n.type = 'friend_request'
     LEFT JOIN group_join_requests gjr ON gjr.id = n.related_id AND n.type = 'group_join_request'
     LEFT JOIN conversations c ON c.id = gjr.conversation_id
     LEFT JOIN conversations gc ON gc.id = n.related_id AND n.type = 'group_mention'
     WHERE n.user_id = ? AND n.cleared = 0
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [uid]
  )

  const list = rows
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      content: row.content,
      relatedId: row.relatedId,
      actorUserId: row.actorUserId,
      isRead: !!row.isRead,
      createdAt: row.createdAt,
      requestStatus: row.requestStatus || row.groupJoinRequestStatus || null,
      groupTitle: row.groupTitle || row.mentionGroupTitle || null,
      conversationId: row.type === 'group_mention' ? row.relatedId : null,
      momentId: row.type === 'moment_mention' ? row.relatedId : null,
      actor: row.actorUserId
        ? {
            id: row.actorUserId,
            username: row.actorUsername,
            nickname: row.actorNickname,
            avatarUrl: normalizeAvatarUrl(row.actorAvatarUrl),
            chatNo: row.actorChatNo
          }
        : null
    }))

  if (markRead && list.length) {
    const types = Array.isArray(markReadTypes)
      ? markReadTypes.map((t) => String(t || '').trim()).filter(Boolean)
      : []
    if (types.length === 1) {
      await mysqlPool.query(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND type = ?',
        [uid, types[0]]
      )
    } else if (types.length > 1) {
      await mysqlPool.query(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND type IN (?)',
        [uid, types]
      )
    } else {
      await mysqlPool.query(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
        [uid]
      )
    }
  }

  return list
}

export async function clearNotificationsByType(userId, type) {
  assertConnected()
  const uid = Number(userId)
  const t = String(type || '').trim()
  // 软清除：仅标记 cleared，不物理删除（好友/入群/举报回执记录仍保留在库中）
  const allowed = new Set(['friend_request', 'group_join_request', 'report_receipt'])
  if (!uid || !allowed.has(t)) throw new Error('无效的通知类型')
  const [result] = await mysqlPool.query(
    'UPDATE notifications SET cleared = 1, is_read = 1 WHERE user_id = ? AND type = ? AND cleared = 0',
    [uid, t]
  )
  return { cleared: Number(result?.affectedRows) || 0 }
}

export async function getNotificationsUnreadCount(userId) {
  assertConnected()
  const uid = Number(userId)
  const [officialRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM notifications
     WHERE user_id = ? AND is_read = 0 AND cleared = 0 AND type = 'report_receipt'`,
    [uid]
  )
  const [socialRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM notifications n
     LEFT JOIN friend_requests fr ON fr.id = n.related_id AND n.type = 'friend_request'
     LEFT JOIN group_join_requests gjr ON gjr.id = n.related_id AND n.type = 'group_join_request'
     WHERE n.user_id = ? AND n.is_read = 0 AND n.cleared = 0
       AND (
         (n.type = 'friend_request' AND fr.status = 'pending')
         OR (n.type = 'group_join_request' AND gjr.status = 'pending')
       )`,
    [uid]
  )
  const officialUnread = Number(officialRows[0]?.cnt) || 0
  const socialUnread = Number(socialRows[0]?.cnt) || 0
  return {
    unreadCount: officialUnread,
    officialUnread,
    socialUnread
  }
}

/** @deprecated 使用 sendFriendRequestByQuery；保留别名兼容 */
export async function addFriend(userId, friendQuery) {
  return sendFriendRequestByQuery(userId, friendQuery)
}

function getMaxOwnedGroupsPerUserLimit() {
  const cfg = loadConfig()
  const max = Number(cfg.maxOwnedGroupsPerUser)
  if (!Number.isFinite(max) || max < 0) return 0
  return Math.min(Math.floor(max), 500)
}

function isUserBannedFromGroupCreation(userId) {
  return getUserRestrictions(userId).createGroup
}

export async function generateUniqueGroupCode() {
  assertConnected()
  return generateUniqueGroupCodeWithPool(mysqlPool)
}

async function countOwnedActiveGroups(ownerId) {
  const [rows] = await mysqlPool.query(
    "SELECT COUNT(*) AS cnt FROM conversations WHERE conv_type = 'group' AND owner_id = ? AND banned = 0",
    [ownerId]
  )
  return Number(rows[0]?.cnt) || 0
}

async function userOwnsBannedGroup(ownerId) {
  const [rows] = await mysqlPool.query(
    "SELECT 1 FROM conversations WHERE conv_type = 'group' AND owner_id = ? AND banned = 1 LIMIT 1",
    [ownerId]
  )
  return rows.length > 0
}

async function assertFriendsOfUser(userId, friendIds) {
  if (!friendIds.length) return
  const placeholders = friendIds.map(() => '?').join(',')
  const [rows] = await mysqlPool.query(
    `SELECT friend_id FROM friendships WHERE user_id = ? AND friend_id IN (${placeholders})`,
    [userId, ...friendIds]
  )
  const found = new Set(rows.map((r) => Number(r.friend_id)))
  for (const id of friendIds) {
    if (!found.has(id)) throw new Error('只能邀请您的好友加入群聊')
  }
}

/**
 * 微信式组合群头像：取前 9 名成员头像拼合并写入 /media/avatar/group-mosaic-{id}.webp。
 * 群头像一律系统维护，自定义图也会被覆盖（force 或非组合图时）。
 * @returns {Promise<string|null>} 新的 avatarUrl；跳过时返回 null
 */
export async function refreshGroupCompositeAvatar(conversationId, { force = false } = {}) {
  assertConnected()
  const id = Number(conversationId)
  if (!id) return null

  const [rows] = await mysqlPool.query(
    `SELECT avatar_url AS avatarUrl, conv_type AS convType
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null
  const current = rows[0].avatarUrl || ''
  // 已是组合图且非强制：跳过（成员变动处会显式 force）
  if (!force && isGroupMosaicAvatar(current)) return null
  if (!force && !isAutoManagedGroupAvatar(current)) return null

  const [members] = await mysqlPool.query(
    `SELECT u.avatar_url AS avatarUrl
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?
     ORDER BY cm.joined_at ASC, cm.user_id ASC
     LIMIT 9`,
    [id]
  )
  let urls = members.map((m) => normalizeAvatarUrl(m.avatarUrl || '') || DEFAULT_AVATAR_URL)
  if (urls.length < 9) {
    try {
      const [bots] = await mysqlPool.query(
        `SELECT b.avatar_url AS avatarUrl
         FROM group_ai_bots ga
         JOIN ai_bots b ON b.id = ga.bot_id
         WHERE ga.conversation_id = ?
         ORDER BY ga.bot_id ASC
         LIMIT ?`,
        [id, 9 - urls.length]
      )
      for (const b of bots) {
        urls.push(normalizeAvatarUrl(b.avatarUrl || '') || DEFAULT_AVATAR_URL)
      }
    } catch {
      /* 无 AI 表时忽略 */
    }
  }
  urls = urls.slice(0, 9)
  const outPath = mosaicLocalPathForGroup(id)
  const avatarUrl = `${mosaicAvatarUrlForGroup(id)}?v=${Date.now()}`
  try {
    await composeGroupMosaicToFile(urls, outPath)
  } catch (e) {
    console.warn('[group-avatar] mosaic failed for', id, e?.message || e)
    return null
  }

  await mysqlPool.query(
    'UPDATE conversations SET avatar_url = ?, updated_at = NOW() WHERE id = ?',
    [avatarUrl, id]
  )

  // 清掉历史自定义上传图（组合图路径除外）
  const oldNorm = normalizeAvatarPath(current)
  if (oldNorm && !isGroupMosaicAvatar(oldNorm) && oldNorm !== normalizeAvatarPath(avatarUrl)) {
    safeDeleteAvatarFile(current, mysqlPool).catch(() => {})
  }

  try {
    const { notifyGroupAvatarUpdated } = await import('./realtime.js')
    await notifyGroupAvatarUpdated(id, avatarUrl)
  } catch {
    /* realtime 可选 */
  }
  return avatarUrl
}

/**
 * 清空自定义/失效群头像并强制重生成微信式组合头像，实时通知成员。
 */
export async function resetGroupAvatarToComposite(conversationId) {
  assertConnected()
  const id = Number(conversationId)
  if (!id) return null
  const [rows] = await mysqlPool.query(
    `SELECT id, conv_type AS convType, avatar_url AS avatarUrl FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null
  const old = rows[0].avatarUrl || ''
  await mysqlPool.query(
    `UPDATE conversations SET avatar_url = '', updated_at = NOW() WHERE id = ?`,
    [id]
  )
  const next = await refreshGroupCompositeAvatar(id, { force: true })
  if (old && !isGroupMosaicAvatar(old)) {
    safeDeleteAvatarFile(old, mysqlPool).catch(() => {})
  }
  return next
}

/**
 * 启动/运维：把全部非组合群头像强制刷成组合图并推送。
 */
export async function refreshAllGroupCompositeAvatars({ concurrency = 2 } = {}) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT id, avatar_url AS avatarUrl FROM conversations WHERE conv_type = 'group' ORDER BY id ASC`
  )
  const targets = rows.filter((r) => !isGroupMosaicAvatar(r.avatarUrl))
  console.log(
    `[group-avatar] force mosaic for ${targets.length}/${rows.length} groups (concurrency=${concurrency})`
  )
  let i = 0
  const workers = Array.from({ length: Math.max(1, Number(concurrency) || 2) }, async () => {
    while (i < targets.length) {
      const idx = i++
      const gid = Number(targets[idx].id)
      try {
        await resetGroupAvatarToComposite(gid)
      } catch (e) {
        console.warn('[group-avatar] batch reset failed', gid, e?.message || e)
      }
    }
  })
  await Promise.all(workers)
  return { total: rows.length, reset: targets.length }
}

/** 按头像 URL（忽略 ?v=）找出引用它的群聊 */
export async function findGroupsByAvatarUrl(avatarUrl) {
  assertConnected()
  const raw = String(avatarUrl || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/')
  if (!raw) return []
  const [rows] = await mysqlPool.query(
    `SELECT id FROM conversations
     WHERE conv_type = 'group'
       AND (
         avatar_url = ?
         OR avatar_url LIKE ?
         OR SUBSTRING_INDEX(avatar_url, '?', 1) = ?
       )`,
    [raw, `${raw}?%`, raw]
  )
  return rows.map((r) => Number(r.id)).filter(Boolean)
}

export async function createGroupChat(ownerId, memberIds, customName) {
  assertConnected()
  const owner = Number(ownerId)
  if (!owner) throw new Error('请先登录')

  if (isUserBannedFromGroupCreation(owner)) {
    const err = new Error('您的账号已被禁止创建群聊')
    err.status = 403
    throw err
  }
  if (await userOwnsBannedGroup(owner)) {
    const err = new Error('您名下存在已被封禁的群聊，无法再创建新群')
    err.status = 403
    throw err
  }
  const maxOwn = getMaxOwnedGroupsPerUserLimit()
  if (maxOwn > 0 && (await countOwnedActiveGroups(owner)) >= maxOwn) {
    const err = new Error('创建群聊已达到上限')
    err.status = 403
    throw err
  }

  const rawIds = Array.isArray(memberIds) ? memberIds : []
  const friendIds = [...new Set(rawIds.map((id) => Number(id)).filter((id) => id && id !== owner))]
  if (!friendIds.length) throw new Error('请至少选择一位好友')

  await assertFriendsOfUser(owner, friendIds)

  const allMemberIds = [owner, ...friendIds]
  let title = String(customName || '').trim()
  if (title.length > 96) throw new Error('群名称不能超过 96 字')
  if (title) assertGroupDisplayName(title)
  if (!title) title = `群聊${allMemberIds.length}`
  const groupCode = await generateUniqueGroupCode()

  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const [convResult] = await conn.query(
      `INSERT INTO conversations (title, avatar_url, last_message, conv_type, owner_id, group_code, banned)
       VALUES (?, ?, ?, 'group', ?, ?, 0)`,
      [title, '', '', owner, groupCode]
    )
    const convId = convResult.insertId
    for (const uid of allMemberIds) {
      await conn.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [convId, uid]
      )
    }
    await conn.commit()
    try {
      await mysqlPool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [convId])
    } catch {
      /* ignore */
    }
    let avatarUrl = mosaicAvatarUrlForGroup(convId)
    try {
      const mosaic = await refreshGroupCompositeAvatar(convId, { force: true })
      if (mosaic) avatarUrl = mosaic
    } catch (e) {
      console.warn('[group-avatar] create mosaic failed', e?.message || e)
    }
    return {
      id: convId,
      convType: 'group',
      title,
      avatarUrl,
      groupCode,
      ownerId: owner,
      memberIds: allMemberIds,
      memberCount: allMemberIds.length,
      lastMessage: '',
      updatedAt: new Date()
    }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

export async function getGroupChatDetail(conversationId, userId) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.title, c.group_code AS groupCode, c.owner_id AS ownerId, c.avatar_url AS avatarUrl,
            c.announcement, c.announcement_image AS announcementImage,
            c.announcement_pinned AS announcementPinned,
            c.announcement_pinned_message_id AS announcementPinnedMessageId,
            c.multi_chat_bg AS multiChatBackground, c.multi_chat_notice AS multiChatNotice,
            c.group_chat_bg AS groupChatBackground,
            c.group_muted AS groupMuted,
            c.file_upload_policy AS fileUploadPolicy,
            c.anti_screenshot AS antiScreenshot,
            c.butler_enabled AS butlerEnabled, c.butler_welcome AS butlerWelcome,
            c.butler_welcome_image AS butlerWelcomeImage, c.butler_leave AS butlerLeave,
            c.created_at AS createdAt,
            cm.muted_until AS memberMutedUntil
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  const group = rows[0]

  const [members] = await mysqlPool.query(
    `SELECT u.id, u.username, u.nickname, u.avatar_url AS avatarUrl, u.chat_no AS chatNo,
            u.chat_bubble_id AS chatBubbleId, u.avatar_frame_id AS avatarFrameId,
            u.badge_text AS badgeText, u.badge_color AS badgeColor, u.badges AS badges,
            u.province AS province,
            cm.group_nickname AS groupNickname,
            cm.muted_until AS mutedUntil, cm.is_admin AS isAdmin,
            cm.joined_at AS joinedAt,
            la.lastActiveAt AS lastActiveAt
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     LEFT JOIN (
       SELECT user_id, MAX(created_at) AS lastActiveAt
       FROM messages
       WHERE conversation_id = ? AND (deleted_at IS NULL)
       GROUP BY user_id
     ) la ON la.user_id = cm.user_id
     WHERE cm.conversation_id = ?
     ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, u.nickname ASC, u.username ASC`,
    [id, id, group.ownerId || 0]
  )

  const aiBot = await getGroupAiBotAssignment(id)
  const aiMember = aiBot
    ? {
        id: `ai-${aiBot.id}`,
        botId: aiBot.id,
        username: aiBot.name,
        nickname: aiBot.name,
        avatarUrl: normalizeAvatarUrl(aiBot.avatarUrl),
        chatNo: null,
        isAi: true,
        mentionNames: parseMentionNames(aiBot.mentionNames)
      }
    : null
  const memberList = members.map((m) => {
    const badge = readUserBadge(m)
    const groupNickname = String(m.groupNickname || m.group_nickname || '').trim()
    return {
      id: m.id,
      username: m.username,
      // 全局昵称：个人资料用
      nickname: m.nickname,
      // 本群昵称：仅群聊内展示
      groupNickname,
      displayName: groupNickname || m.nickname || m.username || '',
      avatarUrl: normalizeAvatarUrl(m.avatarUrl),
      chatNo: m.chatNo,
      province: String(m.province || '').trim(),
      chatBubbleId: CHAT_BUBBLE_IDS.includes(String(m.chatBubbleId || 'default').trim())
        ? String(m.chatBubbleId || 'default').trim()
        : 'default',
      avatarFrameId: String(m.avatarFrameId || 'none').trim() || 'none',
      badgeText: badge.badgeText,
      badgeColor: badge.badgeColor,
      badges: badge.badges || [],
      isAdmin: !!(m.isAdmin ?? m.is_admin),
      mutedUntil: isMemberMuteActive(m.mutedUntil)
        ? new Date(m.mutedUntil).toISOString()
        : null,
      joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
      lastActiveAt: m.lastActiveAt ? new Date(m.lastActiveAt).toISOString() : null,
      isOnline: false
    }
  })
  if (aiMember) memberList.push(aiMember)

  let avatarUrl = group.avatarUrl || ''
  if (!isGroupMosaicAvatar(avatarUrl)) {
    try {
      const mosaic = await refreshGroupCompositeAvatar(id, { force: true })
      if (mosaic) avatarUrl = mosaic
    } catch (e) {
      console.warn('[group-avatar] detail mosaic failed for', id, e?.message || e)
    }
  }

  return {
    id: group.id,
    title: group.title || '群聊',
    groupCode: group.groupCode || '',
    ownerId: group.ownerId,
    avatarUrl: normalizeGroupAvatarUrl(avatarUrl),
    announcement: group.announcement || '',
    announcementImage: group.announcementImage || '',
    announcementPinned: !!(group.announcementPinned ?? group.announcement_pinned),
    announcementPinnedMessageId: group.announcementPinnedMessageId
      ? Number(group.announcementPinnedMessageId)
      : null,
    multiChatBackground: group.multiChatBackground || '',
    multiChatNotice: group.multiChatNotice || '',
    groupChatBackground: group.groupChatBackground || '',
    groupMuted: !!(group.groupMuted ?? group.group_muted),
    fileUploadPolicy: normalizeFileUploadPolicy(group.fileUploadPolicy ?? group.file_upload_policy),
    antiScreenshot: !!(group.antiScreenshot ?? group.anti_screenshot),
    memberMutedUntil: isMemberMuteActive(group.memberMutedUntil)
      ? new Date(group.memberMutedUntil).toISOString()
      : null,
    butlerEnabled: !!(group.butlerEnabled ?? group.butler_enabled),
    butlerWelcome: group.butlerWelcome || group.butler_welcome || '',
    butlerWelcomeImage: group.butlerWelcomeImage || group.butler_welcome_image || '',
    butlerLeave: group.butlerLeave || group.butler_leave || '',
    createdAt: group.createdAt
      ? new Date(group.createdAt).toISOString()
      : (group.created_at ? new Date(group.created_at).toISOString() : ''),
    isOwner: Number(group.ownerId) === uid,
    isAdmin: memberList.some((m) => Number(m.id) === uid && m.isAdmin),
    memberCount: memberList.length,
    members: memberList,
    aiBot: aiBot
      ? {
          id: aiBot.id,
          name: aiBot.name,
          avatarUrl: normalizeAvatarUrl(aiBot.avatarUrl),
          mentionNames: parseMentionNames(aiBot.mentionNames),
          ttsVoiceId: aiBot.ttsVoiceId || normalizeTtsVoiceId('', { isAi: true })
        }
      : null
  }
}

export const GROUP_CHAT_BG_PRESETS = [
  '',
  '/media/Official Images/chatBg.jpeg',
  '/media/Official Images/chatBg2.jpeg',
  '/media/Official Images/chatBg3.jpeg'
]

export const MULTI_CHAT_BG_PRESETS = [
  '',
  '/media/Official Images/Voice Room.jpeg',
  '/media/Official Images/Voice Room2.jpeg',
  '/media/Official Images/Voice Room3.jpeg',
  '/media/Official Images/Voice Room4.jpeg',
  '/media/Official Images/Voice Room5.png'
]

export async function updateGroupMultiChatSettings(
  conversationId,
  userId,
  { backgroundUrl, noticeText, groupChatBackground } = {}
) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  if (!rows.length) throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== uid) {
    const err = new Error('仅群主可修改多人聊天设置')
    err.status = 403
    throw err
  }
  await assertConversationMember(id, uid)

  let bg = backgroundUrl === undefined ? undefined : String(backgroundUrl || '').trim()
  if (bg !== undefined && bg && !MULTI_CHAT_BG_PRESETS.includes(bg)) {
    throw new Error('无效的多人聊天背景')
  }
  let groupBg =
    groupChatBackground === undefined ? undefined : String(groupChatBackground || '').trim()
  if (groupBg !== undefined && groupBg && !GROUP_CHAT_BG_PRESETS.includes(groupBg)) {
    throw new Error('无效的群聊背景')
  }
  let notice = noticeText === undefined ? undefined : String(noticeText || '').trim()
  if (notice !== undefined && notice.length > 300) {
    throw new Error('公告最多 300 字')
  }
  if (notice) assertNoXssPayload(notice, { field: '公告', allowEmpty: true })

  const fields = []
  const params = []
  if (bg !== undefined) {
    fields.push('multi_chat_bg = ?')
    params.push(bg || null)
  }
  if (groupBg !== undefined) {
    fields.push('group_chat_bg = ?')
    params.push(groupBg || null)
  }
  if (notice !== undefined) {
    fields.push('multi_chat_notice = ?')
    params.push(notice || null)
  }
  if (!fields.length) throw new Error('没有可保存的内容')

  params.push(id)
  await mysqlPool.query(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, params)
  return getGroupChatDetail(id, uid)
}

export async function updateGroupMute(conversationId, userId, muted) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  if (!rows.length) throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== uid) {
    const err = new Error('仅群主可设置群禁言')
    err.status = 403
    throw err
  }
  await assertConversationMember(id, uid)

  const groupMuted = !!muted
  await mysqlPool.query('UPDATE conversations SET group_muted = ? WHERE id = ?', [groupMuted ? 1 : 0, id])
  return {
    groupMuted,
    message: groupMuted ? '已开启群禁言' : '已关闭群禁言'
  }
}

export async function updateGroupFileUploadPolicy(conversationId, userId, policy) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')
  await assertGroupModerator(id, uid, '设置上传文件权限')
  await assertConversationMember(id, uid)
  const next = normalizeFileUploadPolicy(policy)
  await mysqlPool.query('UPDATE conversations SET file_upload_policy = ? WHERE id = ?', [next, id])
  return {
    fileUploadPolicy: next,
    message: next === 'admins' ? '已设置为仅管理员可上传' : '已设置为全员可上传'
  }
}

async function insertSystemTipMessage(conversationId, content) {
  const id = Number(conversationId)
  const text = String(content || '').trim()
  if (!id || !text) return null
  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'system', 0)`,
    [id, text]
  )
  const preview = previewForMessage('system', text, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])
  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt,
            m.is_self AS isSelf
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  if (!msgRows.length) return null
  return mapMessageRow(msgRows[0], null)
}

async function insertSystemTipMessages(conversationId, lines = []) {
  const tips = []
  for (const line of lines) {
    const msg = await insertSystemTipMessage(conversationId, line)
    if (msg) tips.push(msg)
  }
  return tips
}

export async function updateGroupAntiScreenshot(conversationId, userId, enabled) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')
  const group = await assertGroupModerator(id, uid, '设置防截图')
  await assertConversationMember(id, uid)

  const [rows] = await mysqlPool.query(
    'SELECT anti_screenshot AS antiScreenshot FROM conversations WHERE id = ? LIMIT 1',
    [id]
  )
  if (!rows.length) throw new Error('群聊不存在')
  const prev = !!(rows[0].antiScreenshot ?? rows[0].anti_screenshot)
  const next = !!enabled
  if (prev === next) {
    return {
      antiScreenshot: next,
      antiScreenshotActive: next,
      tipMessages: [],
      message: next ? '防截图已开启' : '防截图已关闭'
    }
  }

  await mysqlPool.query('UPDATE conversations SET anti_screenshot = ? WHERE id = ?', [next ? 1 : 0, id])

  const user = await findUserById(uid)
  const actorName = (user?.nickname || user?.username || '成员').trim() || '成员'
  const isOwner = Number(group.ownerId) === uid
  const rolePrefix = isOwner ? '群主' : `管理员${actorName}`
  const tipLines = next
    ? [`${rolePrefix}已启用本群防截图`, '本群会话禁止截图与录屏']
    : [`${rolePrefix}已关闭本群防截图`, '本群会话已恢复截图与录屏']
  const tipMessages = await insertSystemTipMessages(id, tipLines)

  return {
    antiScreenshot: next,
    antiScreenshotActive: next,
    tipMessages,
    message: next ? '已开启防截图' : '已关闭防截图'
  }
}

/**
 * 私聊防截图（对称确认）：
 * - 成员各自开关存在 conversation_members.anti_screenshot
 * - 会话锁存在 conversations.anti_screenshot：双方都开 → 锁定；双方都关 → 解除
 * - 锁定期间任一方先关，仍禁止截图，须等待另一方也关闭后才恢复
 */
export async function updateDmAntiScreenshot(conversationId, userId, enabled) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')
  await assertConversationMember(id, uid)

  const [convRows] = await mysqlPool.query(
    `SELECT conv_type AS convType, anti_screenshot AS antiScreenshot
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!convRows.length) throw new Error('会话不存在')
  if (String(convRows[0].convType || '') !== 'direct') {
    const err = new Error('仅私聊可设置防截图')
    err.status = 400
    throw err
  }

  const [memberRows] = await mysqlPool.query(
    `SELECT user_id AS userId, anti_screenshot AS antiScreenshot
     FROM conversation_members WHERE conversation_id = ?`,
    [id]
  )
  if (memberRows.length < 2) throw new Error('私聊成员不完整')

  const selfRow = memberRows.find((r) => Number(r.userId) === uid)
  const peerRow = memberRows.find((r) => Number(r.userId) !== uid)
  if (!selfRow || !peerRow) throw new Error('无权访问该会话')

  const prevSelf = !!(selfRow.antiScreenshot ?? selfRow.anti_screenshot)
  const peerOn = !!(peerRow.antiScreenshot ?? peerRow.anti_screenshot)
  const prevLatch = !!(convRows[0].antiScreenshot ?? convRows[0].anti_screenshot)
  const nextSelf = !!enabled

  if (prevSelf === nextSelf) {
    return {
      antiScreenshotSelf: nextSelf,
      antiScreenshotPeer: peerOn,
      antiScreenshotActive: prevLatch,
      tipMessages: [],
      message: nextSelf ? '防截图已开启' : '防截图已关闭'
    }
  }

  await mysqlPool.query(
    'UPDATE conversation_members SET anti_screenshot = ? WHERE conversation_id = ? AND user_id = ?',
    [nextSelf ? 1 : 0, id, uid]
  )

  const bothOn = nextSelf && peerOn
  const bothOff = !nextSelf && !peerOn
  let nextLatch = prevLatch
  if (bothOn) nextLatch = true
  if (bothOff) nextLatch = false
  if (nextLatch !== prevLatch) {
    await mysqlPool.query('UPDATE conversations SET anti_screenshot = ? WHERE id = ?', [
      nextLatch ? 1 : 0,
      id
    ])
  }

  const user = await findUserById(uid)
  const actorName = (user?.nickname || user?.username || '用户').trim() || '用户'
  const tipLines = []
  if (nextSelf) {
    tipLines.push(`${actorName}已启用防截图`)
    tipLines.push(
      nextLatch
        ? '双方已确认启用，本会话禁止截图与录屏'
        : '等待对方确认启用；双方确认后，本会话将禁止截图与录屏'
    )
  } else {
    tipLines.push(`${actorName}已关闭防截图`)
    if (prevLatch && !nextLatch) {
      tipLines.push('双方已确认关闭，本会话已恢复截图与录屏')
    } else if (prevLatch && nextLatch) {
      tipLines.push('等待对方关闭；双方均关闭后，本会话方可恢复截图与录屏')
    }
  }
  const tipMessages = await insertSystemTipMessages(id, tipLines)

  return {
    antiScreenshotSelf: nextSelf,
    antiScreenshotPeer: peerOn,
    antiScreenshotActive: nextLatch,
    tipMessages,
    message: nextSelf
      ? nextLatch
        ? '双方已确认启用防截图'
        : '已启用，等待对方确认'
      : nextLatch
        ? '已关闭，等待对方关闭后恢复'
        : '防截图已关闭'
  }
}

export async function updateGroupButlerSettings(conversationId, userId, { enabled, welcomeText, welcomeImageUrl, leaveText } = {}) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, butler_welcome_image AS butlerWelcomeImage
     FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  if (!rows.length) throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== uid) {
    const err = new Error('仅群主可修改群管家设置')
    err.status = 403
    throw err
  }
  await assertConversationMember(id, uid)

  let butlerEnabled = enabled === undefined ? undefined : !!enabled
  let welcome = welcomeText === undefined ? undefined : String(welcomeText || '').trim()
  let welcomeImage =
    welcomeImageUrl === undefined ? undefined : assertButlerWelcomeImageUrl(welcomeImageUrl)
  let leave = leaveText === undefined ? undefined : String(leaveText || '').trim()
  if (welcome !== undefined && welcome.length > 300) {
    throw new Error('欢迎词最多 300 字')
  }
  if (leave !== undefined && leave.length > 300) {
    throw new Error('退群词最多 300 字')
  }
  if (butlerEnabled && welcome !== undefined && !welcome) {
    welcome = DEFAULT_BUTLER_WELCOME
  }
  if (butlerEnabled && leave !== undefined && !leave) {
    leave = DEFAULT_BUTLER_LEAVE
  }

  const fields = []
  const params = []
  if (butlerEnabled !== undefined) {
    fields.push('butler_enabled = ?')
    params.push(butlerEnabled ? 1 : 0)
  }
  if (welcome !== undefined) {
    fields.push('butler_welcome = ?')
    params.push(welcome || null)
  }
  if (welcomeImage !== undefined) {
    if (!welcomeImage && rows[0].butlerWelcomeImage) {
      deleteButlerWelcomeImageFile(rows[0].butlerWelcomeImage)
    }
    fields.push('butler_welcome_image = ?')
    params.push(welcomeImage || null)
  }
  if (leave !== undefined) {
    fields.push('butler_leave = ?')
    params.push(leave || null)
  }
  if (!fields.length) throw new Error('没有可保存的内容')

  params.push(id)
  await mysqlPool.query(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, params)
  const group = await getGroupChatDetail(id, uid)
  return {
    butlerEnabled: !!group.butlerEnabled,
    butlerWelcome: group.butlerWelcome || '',
    butlerWelcomeImage: group.butlerWelcomeImage || '',
    butlerLeave: group.butlerLeave || '',
    message: '群管家设置已保存'
  }
}

function assertButlerWelcomeImageUrl(url) {
  const v = String(url || '').trim()
  if (!v) return ''
  if (!v.startsWith('/media/Chat Images/') && !v.startsWith('/chat-image/')) {
    throw new Error('无效的图片地址')
  }
  return v
}

function deleteButlerWelcomeImageFile(imageUrl) {
  const url = String(imageUrl || '').trim()
  if (!url.startsWith('/media/Chat Images/') && !url.startsWith('/chat-image/')) return
  const prefix = url.startsWith('/media/Chat Images/') ? '/media/Chat Images/' : '/chat-image/'
  const filename = decodeURIComponent(url.slice(prefix.length))
  try {
    deleteChatPhoto(filename)
  } catch {
    // ignore missing files
  }
}

export async function updateGroupButlerWelcomeImage(conversationId, userId, imageUrl) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  const url = assertButlerWelcomeImageUrl(imageUrl)
  if (!url) throw new Error('无效的图片地址')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, butler_welcome_image AS butlerWelcomeImage
     FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  if (!rows.length) throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== uid) {
    const err = new Error('仅群主可修改群管家设置')
    err.status = 403
    throw err
  }
  await assertConversationMember(id, uid)

  const oldImage = rows[0].butlerWelcomeImage || ''
  await mysqlPool.query('UPDATE conversations SET butler_welcome_image = ? WHERE id = ?', [url, id])
  if (oldImage && oldImage !== url) {
    deleteButlerWelcomeImageFile(oldImage)
  }

  return {
    butlerWelcomeImage: url,
    message: '欢迎图片已更新'
  }
}

export async function sendGroupButlerWelcome(conversationId, newUserId) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(newUserId)
  if (!id || !uid) return null

  const [rows] = await mysqlPool.query(
    `SELECT butler_enabled AS butlerEnabled, butler_welcome AS butlerWelcome,
            butler_welcome_image AS butlerWelcomeImage, conv_type AS convType
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group' || !rows[0].butlerEnabled) return null

  const template = rows[0].butlerWelcome || DEFAULT_BUTLER_WELCOME
  const welcomeImage = rows[0].butlerWelcomeImage || ''
  const user = await findUserById(uid)
  if (!user) return null
  const nickname = user.nickname || user.username || '新成员'
  const content = formatButlerWelcome(template, nickname)
  if (!content && !welcomeImage) return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, image_url, is_self)
     VALUES (?, NULL, ?, 'butler', ?, 0)`,
    [id, content || '', welcomeImage || null]
  )
  const preview = previewForMessage('butler', content, welcomeImage, '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

export async function sendGroupButlerDrawGuessSummary(conversationId, content) {
  assertConnected()
  const id = Number(conversationId)
  const text = String(content || '').trim()
  if (!id || !text) return null

  const [rows] = await mysqlPool.query(
    `SELECT butler_enabled AS butlerEnabled, conv_type AS convType
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group' || !rows[0].butlerEnabled) return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, text]
  )
  const preview = previewForMessage('butler', text, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

export async function sendGroupButlerMemberMuteNotice(conversationId, nickname, durationLabel) {
  assertConnected()
  const id = Number(conversationId)
  const content = formatButlerMemberMuteNotice(nickname, durationLabel)
  if (!id || !content) return null

  const [rows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, content]
  )
  const preview = previewForMessage('butler', content, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

export async function sendGroupButlerTextNotice(conversationId, content) {
  assertConnected()
  const id = Number(conversationId)
  const text = String(content || '').trim()
  if (!id || !text) return null

  const [rows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, text]
  )
  const preview = previewForMessage('butler', text, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

const BANNED_WORD_SYSTEM_MUTE_MINUTES = 10

export async function handleGroupBannedWordViolation(conversationId, userId, rawContent, messageType = 'text') {
  assertConnected()
  const cid = Number(conversationId)
  const uid = Number(userId)
  if (!cid || !uid) return null
  if (!shouldMaskMessageType(messageType)) return null
  if (!containsBannedWords(rawContent)) return null

  const [convRows] = await mysqlPool.query(
    `SELECT conv_type AS convType, butler_enabled AS butlerEnabled, owner_id AS ownerId
     FROM conversations WHERE id = ? LIMIT 1`,
    [cid]
  )
  if (!convRows.length || convRows[0].convType !== 'group' || !convRows[0].butlerEnabled) return null
  if (Number(convRows[0].ownerId) === uid) return null

  const user = await findUserById(uid)
  if (!user) return null
  const displayName = user.nickname || user.username || '用户'

  const [memberRows] = await mysqlPool.query(
    `SELECT banned_word_warned AS bannedWordWarned
     FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [cid, uid]
  )
  if (!memberRows.length) return null

  const warned = !!(memberRows[0].bannedWordWarned ?? memberRows[0].banned_word_warned)

  if (!warned) {
    await mysqlPool.query(
      'UPDATE conversation_members SET banned_word_warned = 1 WHERE conversation_id = ? AND user_id = ?',
      [cid, uid]
    )
    const content = formatButlerBannedWordWarning(displayName)
    const butlerMessage = await sendGroupButlerTextNotice(cid, content)
    if (!butlerMessage) return null
    return { action: 'warn', butlerMessage, mentionedUserId: uid }
  }

  const minutes = BANNED_WORD_SYSTEM_MUTE_MINUTES
  await mysqlPool.query(
    `UPDATE conversation_members
     SET muted_until = DATE_ADD(NOW(), INTERVAL ? MINUTE), banned_word_warned = 0
     WHERE conversation_id = ? AND user_id = ?`,
    [minutes, cid, uid]
  )

  const [muteRows] = await mysqlPool.query(
    `SELECT muted_until AS mutedUntil FROM conversation_members
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [cid, uid]
  )
  const mutedUntil = muteRows[0]?.mutedUntil
    ? new Date(muteRows[0].mutedUntil).toISOString()
    : null

  const content = formatButlerBannedWordSystemMuteNotice(displayName, minutes)
  const butlerMessage = await sendGroupButlerTextNotice(cid, content)
  if (!butlerMessage) return null
  return {
    action: 'mute',
    butlerMessage,
    mentionedUserId: uid,
    mutedUntil,
    durationMinutes: minutes
  }
}

export async function sendGroupButlerMemberUnmuteNotice(conversationId, nickname) {
  assertConnected()
  const id = Number(conversationId)
  const content = formatButlerMemberUnmuteNotice(nickname)
  if (!id || !content) return null

  const [rows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, content]
  )
  const preview = previewForMessage('butler', content, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

export async function sendGroupButlerMemberAdminNotice(conversationId, nickname, isAdmin) {
  assertConnected()
  const id = Number(conversationId)
  const content = isAdmin
    ? formatButlerMemberSetAdminNotice(nickname)
    : formatButlerMemberRemoveAdminNotice(nickname)
  if (!id || !content) return null

  const [rows] = await mysqlPool.query(
    `SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') return null

  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, content]
  )
  const preview = previewForMessage('butler', content, '', '')
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

async function insertButlerLeaveNotice(conn, conversationId, userId) {
  const id = Number(conversationId)
  const [groupRows] = await conn.query(
    `SELECT butler_enabled AS butlerEnabled, butler_leave AS butlerLeave
     FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  if (!groupRows.length || !groupRows[0].butlerEnabled) return null

  const user = await findUserById(userId)
  if (!user) return null
  const template = groupRows[0].butlerLeave || DEFAULT_BUTLER_LEAVE
  const content = formatButlerLeaveNotice(user.nickname || user.username, template)
  const [result] = await conn.query(
    `INSERT INTO messages (conversation_id, user_id, content, message_type, is_self)
     VALUES (?, NULL, ?, 'butler', 0)`,
    [id, content]
  )
  const preview = previewForMessage('butler', content, '', '')
  await conn.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    id
  ])
  const [msgRows] = await conn.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl, m.created_at AS createdAt
     FROM messages m WHERE m.id = ?`,
    [result.insertId]
  )
  return mapButlerMessageRow(msgRows[0], null)
}

export async function addGroupMembers(conversationId, ownerId, memberIds) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(ownerId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, banned, conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== uid) {
    const err = new Error('仅群主可添加成员')
    err.status = 403
    throw err
  }
  if (rows[0].banned) throw new Error('该群聊已被封禁')

  const rawIds = Array.isArray(memberIds) ? memberIds : []
  const friendIds = [...new Set(rawIds.map((n) => Number(n)).filter((n) => n && n !== uid))]
  if (!friendIds.length) throw new Error('请选择要添加的好友')

  await assertFriendsOfUser(uid, friendIds)

  const [existing] = await mysqlPool.query(
    `SELECT user_id AS userId FROM conversation_members WHERE conversation_id = ? AND user_id IN (${friendIds.map(() => '?').join(',')})`,
    [id, ...friendIds]
  )
  const existingSet = new Set(existing.map((r) => Number(r.userId)))
  const toAdd = friendIds.filter((fid) => !existingSet.has(fid))
  if (!toAdd.length) throw new Error('所选好友已在群内')

  for (const memberId of toAdd) {
    if (await isUserGroupBlacklisted(id, memberId)) {
      throw new Error('所选好友中有已被拉黑的用户，无法添加')
    }
  }

  for (const memberId of toAdd) {
    await mysqlPool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [
      id,
      memberId
    ])
  }

  const welcomeMessages = []
  for (const memberId of toAdd) {
    const msg = await sendGroupButlerWelcome(id, memberId)
    if (msg) welcomeMessages.push(msg)
  }

  const mosaicUrl = await refreshGroupCompositeAvatar(id)
  const group = await getGroupChatDetail(id, uid)
  if (mosaicUrl && group) group.avatarUrl = mosaicUrl
  return { group, addedMemberIds: toAdd, welcomeMessages, avatarUrl: mosaicUrl || group?.avatarUrl }
}

export async function setGroupAdmin(conversationId, ownerId, targetUserId, isAdmin) {
  assertConnected()
  const id = Number(conversationId)
  const owner = Number(ownerId)
  const target = Number(targetUserId)
  const nextAdmin = !!isAdmin
  if (!id || !owner || !target) throw new Error('无效的参数')
  if (owner === target) throw new Error('不能设置自己')

  await assertGroupOwner(id, owner, nextAdmin ? '设置管理员' : '取消管理员')
  if (target === owner) throw new Error('不能设置群主为管理员')

  const [memberRows] = await mysqlPool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [id, target]
  )
  if (!memberRows.length) throw new Error('该成员不在群内')

  await mysqlPool.query(
    'UPDATE conversation_members SET is_admin = ? WHERE conversation_id = ? AND user_id = ?',
    [nextAdmin ? 1 : 0, id, target]
  )

  const targetUser = await findUserById(target)
  const nickname = targetUser?.nickname || targetUser?.username || ''
  const adminNoticeMessage = await sendGroupButlerMemberAdminNotice(id, nickname, nextAdmin)

  const group = await getGroupChatDetail(id, owner)
  return {
    message: nextAdmin ? '已设为管理员' : '已取消管理员',
    conversationId: id,
    targetUserId: target,
    isAdmin: nextAdmin,
    targetUser: targetUser ? getUserPublic(targetUser) : null,
    adminNoticeMessage,
    group
  }
}

export async function kickGroupMember(conversationId, actorId, targetUserId, { blacklist = false } = {}) {
  assertConnected()
  const id = Number(conversationId)
  const actor = Number(actorId)
  const target = Number(targetUserId)
  const shouldBlacklist = !!blacklist
  if (!id || !actor || !target) throw new Error('无效的参数')
  if (actor === target) throw new Error('不能移除自己')

  await assertCanModerateTarget(id, actor, target)
  const groupRow = await getGroupOwnerId(id)
  if (groupRow.banned) throw new Error('该群聊已被封禁')

  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const leaveMessage = await insertButlerLeaveNotice(conn, id, target)
    await conn.query(
      'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, target]
    )
    if (shouldBlacklist) {
      await conn.query(
        `INSERT INTO group_blacklist (conversation_id, user_id, created_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_by = VALUES(created_by), created_at = NOW()`,
        [id, target, actor]
      )
      const [pendingJoinRows] = await conn.query(
        "SELECT id FROM group_join_requests WHERE conversation_id = ? AND user_id = ? AND status = 'pending'",
        [id, target]
      )
      if (pendingJoinRows.length) {
        await conn.query(
          "UPDATE group_join_requests SET status = 'rejected' WHERE conversation_id = ? AND user_id = ? AND status = 'pending'",
          [id, target]
        )
        const pendingIds = pendingJoinRows.map((row) => row.id)
        await conn.query(
          'UPDATE notifications SET is_read = 1 WHERE type = ? AND related_id IN (?)',
          ['group_join_request', pendingIds]
        )
      }
    }
    await conn.commit()
    const mosaicUrl = await refreshGroupCompositeAvatar(id)
    const group = await getGroupChatDetail(id, actor)
    if (mosaicUrl && group) group.avatarUrl = mosaicUrl
    const kickedUser = await findUserById(target)
    return {
      message: shouldBlacklist ? '已移出并拉黑' : '已移出群聊',
      conversationId: id,
      kickedUserId: target,
      kickedUser: kickedUser ? getUserPublic(kickedUser) : null,
      blacklisted: shouldBlacklist,
      leaveMessage,
      group,
      avatarUrl: mosaicUrl || group?.avatarUrl
    }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

export async function muteGroupMember(conversationId, actorId, targetUserId, durationMinutes) {
  assertConnected()
  const id = Number(conversationId)
  const actor = Number(actorId)
  const target = Number(targetUserId)
  const minutes = Math.round(Number(durationMinutes) || 0)
  if (!id || !actor || !target) throw new Error('无效的参数')
  if (!minutes || minutes < 1) throw new Error('请设置禁言时长')
  if (minutes > 60 * 24 * 30) throw new Error('禁言时长不能超过30天')
  if (actor === target) throw new Error('不能禁言自己')

  await assertCanModerateTarget(id, actor, target)
  const groupRow = await getGroupOwnerId(id)
  if (groupRow.banned) throw new Error('该群聊已被封禁')

  const user = await findUserById(target)
  if (!user) throw new Error('用户不存在')

  const durationLabel = formatMuteDurationLabel(minutes)
  await mysqlPool.query(
    `UPDATE conversation_members SET muted_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE conversation_id = ? AND user_id = ?`,
    [minutes, id, target]
  )

  const [muteRows] = await mysqlPool.query(
    `SELECT muted_until AS mutedUntil FROM conversation_members
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [id, target]
  )
  const mutedUntil = muteRows[0]?.mutedUntil
    ? new Date(muteRows[0].mutedUntil).toISOString()
    : null

  const muteMessage = await sendGroupButlerMemberMuteNotice(
    id,
    user.nickname || user.username,
    durationLabel
  )

  return {
    message: '已禁言',
    conversationId: id,
    targetUserId: target,
    targetNickname: user.nickname || user.username,
    durationMinutes: minutes,
    durationLabel,
    mutedUntil,
    muteMessage
  }
}

export async function unmuteGroupMember(conversationId, actorId, targetUserId) {
  assertConnected()
  const id = Number(conversationId)
  const actor = Number(actorId)
  const target = Number(targetUserId)
  if (!id || !actor || !target) throw new Error('无效的参数')
  if (actor === target) throw new Error('不能解除自己的禁言')

  await assertCanModerateTarget(id, actor, target)
  const groupRow = await getGroupOwnerId(id)
  if (groupRow.banned) throw new Error('该群聊已被封禁')

  const [memberRows] = await mysqlPool.query(
    `SELECT muted_until AS mutedUntil FROM conversation_members
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [id, target]
  )
  if (!memberRows.length) throw new Error('该成员不在群内')
  if (!isMemberMuteActive(memberRows[0].mutedUntil)) throw new Error('该成员未被禁言')

  await mysqlPool.query(
    'UPDATE conversation_members SET muted_until = NULL WHERE conversation_id = ? AND user_id = ?',
    [id, target]
  )

  const user = await findUserById(target)
  const nickname = user?.nickname || user?.username || ''
  const unmuteMessage = await sendGroupButlerMemberUnmuteNotice(id, nickname)

  return {
    message: '已解除禁言',
    conversationId: id,
    targetUserId: target,
    targetNickname: nickname,
    mutedUntil: null,
    unmuteMessage
  }
}

async function addUserToGroup(conversationId, userId) {
  const id = Number(conversationId)
  const uid = Number(userId)
  await mysqlPool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [id, uid])
  const welcomeMessage = await sendGroupButlerWelcome(id, uid)
  const avatarUrl = await refreshGroupCompositeAvatar(id)
  return { welcomeMessage, avatarUrl }
}

export async function findGroupByCodeForGate(groupCode) {
  assertConnected()
  const code = String(groupCode || '').trim()
  if (!code) return null
  const [rows] = await mysqlPool.query(
    `SELECT id, title, owner_id AS ownerId, banned, conv_type AS convType
     FROM conversations WHERE group_code = ? AND conv_type = 'group' LIMIT 1`,
    [code]
  )
  if (!rows.length) return null
  return {
    id: Number(rows[0].id),
    title: rows[0].title || '群聊',
    ownerId: Number(rows[0].ownerId),
    banned: !!rows[0].banned
  }
}

export async function resolveGroupByCode(groupCode) {
  assertConnected()
  const code = String(groupCode || '').trim()
  if (!code) throw new Error('请填写群号')
  if (!isAdminNumericCode(code)) throw new Error(adminNumericFormatError('群号'))
  const [rows] = await mysqlPool.query(
    `SELECT id, title, group_code AS groupCode FROM conversations
     WHERE conv_type = 'group' AND TRIM(group_code) = ? LIMIT 1`,
    [code]
  )
  if (!rows.length) throw new Error('未找到该群号对应的群聊')
  return {
    conversationId: Number(rows[0].id),
    groupTitle: rows[0].title || '群聊',
    groupCode: rows[0].groupCode || code
  }
}

export async function isGroupMember(conversationId, userId) {
  assertConnected()
  const [rows] = await mysqlPool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [Number(conversationId), Number(userId)]
  )
  return rows.length > 0
}

/** 门禁/实验功能：按群号直接入群，无需群主审核 */
export async function directJoinGroupByCode(userId, groupCode) {
  assertConnected()
  const uid = Number(userId)
  const code = String(groupCode || '').trim()
  if (!uid || !code) throw new Error('无效的群号')
  if (!isValidGroupCode(code)) throw new Error(groupCodeFormatError())

  const group = await findGroupByCodeForGate(code)
  if (!group) throw new Error('群聊不存在')
  if (group.banned) throw new Error('该群聊已被封禁')

  const id = group.id
  if (await isGroupMember(id, uid)) {
    return {
      conversation: { id, title: group.title, convType: 'group' },
      relationStatus: 'member',
      message: '您已在该群聊中'
    }
  }

  const [pendingJoinRows] = await mysqlPool.query(
    "SELECT id FROM group_join_requests WHERE conversation_id = ? AND user_id = ? AND status = 'pending'",
    [id, uid]
  )
  if (pendingJoinRows.length) {
    const pendingIds = pendingJoinRows.map((row) => row.id)
    await mysqlPool.query(
      "UPDATE group_join_requests SET status = 'accepted' WHERE conversation_id = ? AND user_id = ? AND status = 'pending'",
      [id, uid]
    )
    await dismissRequestNotificationsByRelatedIds(pendingIds, 'group_join_request')
  }

  const welcomeMessage = await addUserToGroup(id, uid)
  return {
    conversation: { id, title: group.title, convType: 'group' },
    relationStatus: 'joined',
    welcomeMessage,
    message: '已加入群聊'
  }
}

export async function requestJoinGroupByCode(userId, groupCode) {
  assertConnected()
  const uid = Number(userId)
  const code = String(groupCode || '').trim()
  if (!uid || !code) throw new Error('无效的群号')
  if (!isValidGroupCode(code)) throw new Error(groupCodeFormatError())

  const [rows] = await mysqlPool.query(
    `SELECT id, title, owner_id AS ownerId, banned, conv_type AS convType
     FROM conversations WHERE group_code = ? AND conv_type = 'group' LIMIT 1`,
    [code]
  )
  if (!rows.length) throw new Error('群聊不存在')
  if (rows[0].banned) throw new Error('该群聊已被封禁')

  const id = Number(rows[0].id)
  const ownerId = Number(rows[0].ownerId)
  const [memberRows] = await mysqlPool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [id, uid]
  )
  if (memberRows.length) {
    return {
      conversation: { id, title: rows[0].title || '群聊', convType: 'group' },
      relationStatus: 'member',
      message: '您已在该群聊中'
    }
  }

  if (await isUserGroupBlacklisted(id, uid)) {
    throw new Error('你已被群里拉黑')
  }

  const [pendingRows] = await mysqlPool.query(
    "SELECT id FROM group_join_requests WHERE conversation_id = ? AND user_id = ? AND status = 'pending' LIMIT 1",
    [id, uid]
  )
  if (pendingRows.length) {
    return {
      conversationId: id,
      requestId: pendingRows[0].id,
      ownerId,
      relationStatus: 'pending_sent',
      message: '已发送入群申请，请等待群主审核'
    }
  }

  const applicant = await findUserById(uid)
  const applicantName = applicant?.nickname || applicant?.username || '用户'
  const groupTitle = rows[0].title || '群聊'

  const [reqResult] = await mysqlPool.query(
    "INSERT INTO group_join_requests (conversation_id, user_id, status) VALUES (?, ?, 'pending')",
    [id, uid]
  )
  const requestId = reqResult.insertId

  await createNotification({
    userId: ownerId,
    type: 'group_join_request',
    title: '入群申请',
    content: `${applicantName} 申请加入「${groupTitle}」`,
    relatedId: requestId,
    actorUserId: uid
  })

  return {
    conversationId: id,
    requestId,
    ownerId,
    relationStatus: 'pending_sent',
    created: true,
    message: '入群申请已提交，请等待群主审核'
  }
}

export async function respondGroupJoinRequest(userId, requestId, action) {
  assertConnected()
  const rid = Number(requestId)
  const uid = Number(userId)
  if (!rid) throw new Error('无效的申请')
  if (!['accept', 'reject'].includes(action)) throw new Error('无效的操作')

  const [rows] = await mysqlPool.query(
    `SELECT gjr.id, gjr.conversation_id AS conversationId, gjr.user_id AS applicantId, gjr.status,
            c.title, c.owner_id AS ownerId, c.banned
     FROM group_join_requests gjr
     JOIN conversations c ON c.id = gjr.conversation_id
     WHERE gjr.id = ? LIMIT 1`,
    [rid]
  )
  const request = rows[0]
  if (!request) {
    await dismissRequestNotification(uid, rid, 'group_join_request')
    throw new Error('入群申请不存在')
  }
  if (Number(request.ownerId) !== uid) throw new Error('仅群主可处理入群申请')
  if (request.status !== 'pending') {
    await dismissRequestNotification(uid, rid, 'group_join_request')
    throw new Error('该申请已处理')
  }
  if (request.banned) throw new Error('该群聊已被封禁')

  const convId = Number(request.conversationId)
  const applicantId = Number(request.applicantId)
  const newStatus = action === 'accept' ? 'accepted' : 'rejected'
  await mysqlPool.query('UPDATE group_join_requests SET status = ? WHERE id = ?', [newStatus, rid])
  await dismissRequestNotification(uid, rid, 'group_join_request')

  const applicant = await findUserById(applicantId)
  if (!applicant) throw new Error('申请人不存在')

  if (action === 'reject') {
    return {
      requestId: rid,
      relationStatus: 'rejected',
      applicantId,
      applicant: getUserPublic(applicant),
      message: '已拒绝入群申请'
    }
  }

  if (await isUserGroupBlacklisted(convId, applicantId)) {
    throw new Error('该用户已被拉黑，无法加入')
  }

  const [memberRows] = await mysqlPool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [convId, applicantId]
  )
  let welcomeMessage = null
  if (!memberRows.length) {
    welcomeMessage = await addUserToGroup(convId, applicantId)
  }

  return {
    requestId: rid,
    relationStatus: 'accepted',
    conversation: {
      id: convId,
      title: request.title || '群聊',
      convType: 'group'
    },
    applicant: getUserPublic(applicant),
    applicantId,
    welcomeMessage,
    message: '已同意入群申请'
  }
}

/** @deprecated 直接入群已改为申请制，保留供内部/测试 */
export async function joinGroupByCode(userId, groupCode) {
  return requestJoinGroupByCode(userId, groupCode)
}

export async function searchGroupsForJoin(userId, keyword) {
  assertConnected()
  const q = String(keyword || '').trim()
  if (!q) return []

  const uid = Number(userId)
  const isNumeric = /^\d+$/.test(q)
  const codeMatchSql = isNumeric
    ? `(TRIM(c.group_code) = ? OR TRIM(c.group_code) LIKE ? OR CAST(c.id AS CHAR) = ?)`
    : `(c.title LIKE ? OR TRIM(c.group_code) LIKE ?)`
  const codeMatchParams = isNumeric ? [q, `${q}%`, q] : [`%${q}%`, `%${q}%`]

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.title, c.group_code AS groupCode, c.avatar_url AS avatarUrl, c.banned,
            (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS memberCount,
            EXISTS(
              SELECT 1 FROM conversation_members cm2
              WHERE cm2.conversation_id = c.id AND cm2.user_id = ?
            ) AS isMember,
            EXISTS(
              SELECT 1 FROM group_join_requests gjr
              WHERE gjr.conversation_id = c.id AND gjr.user_id = ? AND gjr.status = 'pending'
            ) AS hasPendingRequest,
            EXISTS(
              SELECT 1 FROM group_blacklist gb
              WHERE gb.conversation_id = c.id AND gb.user_id = ?
            ) AS isBlacklisted
     FROM conversations c
     WHERE c.conv_type = 'group'
       AND c.banned = 0
       AND ${codeMatchSql}
     ORDER BY ${isNumeric ? 'CASE WHEN TRIM(c.group_code) = ? THEN 0 ELSE 1 END,' : ''} c.group_code ASC
     LIMIT 10`,
    isNumeric ? [uid, uid, uid, ...codeMatchParams, q] : [uid, uid, uid, ...codeMatchParams]
  )

  return rows.map((row) => ({
    id: row.id,
    title: row.title || '群聊',
    groupCode: row.groupCode || '',
    avatarUrl: normalizeGroupAvatarUrl(row.avatarUrl),
    memberCount: Number(row.memberCount) || 0,
    isMember: !!row.isMember,
    hasPendingRequest: !!row.hasPendingRequest,
    isBlacklisted: !!row.isBlacklisted
  }))
}

/** 群资料预览（非成员也可看基础概况） */
export async function getGroupProfilePreview(userId, groupCode) {
  assertConnected()
  const uid = Number(userId)
  const code = String(groupCode || '').trim()
  if (!uid || !code) throw new Error('无效的群号')

  const list = await searchGroupsForJoin(uid, code)
  const exact = list.find((g) => String(g.groupCode || '').trim() === code) || list[0]
  if (!exact) throw new Error('群聊不存在')

  const id = Number(exact.id)
  const [groupRows] = await mysqlPool.query(
    `SELECT created_at AS createdAt FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1`,
    [id]
  )
  const createdAt = groupRows[0]?.createdAt
    ? new Date(groupRows[0].createdAt).toISOString()
    : ''

  const [memberRows] = await mysqlPool.query(
    `SELECT u.id, u.province AS province,
            la.lastActiveAt AS lastActiveAt
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     LEFT JOIN (
       SELECT user_id, MAX(created_at) AS lastActiveAt
       FROM messages
       WHERE conversation_id = ? AND deleted_at IS NULL
       GROUP BY user_id
     ) la ON la.user_id = cm.user_id
     WHERE cm.conversation_id = ?`,
    [id, id]
  )

  const since = Date.now() - 7 * 24 * 60 * 60 * 1000
  let recentSpeakerCount = 0
  const regionMap = new Map()
  const memberIds = []
  for (const m of memberRows) {
    const mid = Number(m.id) || 0
    if (mid) memberIds.push(mid)
    const activeAt = m.lastActiveAt ? new Date(m.lastActiveAt).getTime() : 0
    if (Number.isFinite(activeAt) && activeAt >= since) recentSpeakerCount += 1
    const province = String(m.province || '').trim()
    if (province) regionMap.set(province, (regionMap.get(province) || 0) + 1)
  }
  const humanTotal = Math.max(memberRows.length, 1)
  const topRegions = [...regionMap.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 3)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.max(1, Math.min(100, Math.round((count * 100) / humanTotal)))
    }))

  let friendInGroup = 0
  if (memberIds.length) {
    const placeholders = memberIds.map(() => '?').join(',')
    const [friendRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS cnt FROM friendships
       WHERE user_id = ? AND friend_id IN (${placeholders})`,
      [uid, ...memberIds]
    )
    friendInGroup = Number(friendRows?.[0]?.cnt) || 0
  }

  const [[fileRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM messages
     WHERE conversation_id = ? AND deleted_at IS NULL AND message_type = 'file'`,
    [id]
  )
  const [[announceRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS cnt FROM messages
     WHERE conversation_id = ? AND deleted_at IS NULL AND message_type = 'announcement'`,
    [id]
  )

  return {
    ...exact,
    createdAt,
    recentSpeakerCount,
    friendInGroup,
    topRegions,
    fileCount: Number(fileRow?.cnt) || 0,
    announceCount: Number(announceRow?.cnt) || 0
  }
}

export async function isUserGroupBlacklisted(conversationId, userId) {
  return isUserGroupBlacklistedInternal(conversationId, userId)
}

async function isUserGroupBlacklistedInternal(conversationId, userId) {
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) return false
  const [rows] = await mysqlPool.query(
    'SELECT 1 FROM group_blacklist WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [id, uid]
  )
  return rows.length > 0
}

export async function listGroupBlacklist(conversationId, ownerId) {
  assertConnected()
  const id = Number(conversationId)
  const owner = Number(ownerId)
  if (!id || !owner) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== owner) {
    const err = new Error('仅群主可查看黑名单')
    err.status = 403
    throw err
  }

  const [list] = await mysqlPool.query(
    `SELECT u.id, u.username, u.nickname, u.avatar_url AS avatarUrl, u.chat_no AS chatNo,
            gb.created_at AS createdAt
     FROM group_blacklist gb
     JOIN users u ON u.id = gb.user_id
     WHERE gb.conversation_id = ?
     ORDER BY gb.created_at DESC`,
    [id]
  )

  return list.map((row) => ({
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: normalizeAvatarUrl(row.avatarUrl),
    chatNo: row.chatNo,
    createdAt: row.createdAt
  }))
}

export async function removeFromGroupBlacklist(conversationId, ownerId, targetUserId) {
  assertConnected()
  const id = Number(conversationId)
  const owner = Number(ownerId)
  const target = Number(targetUserId)
  if (!id || !owner || !target) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT owner_id AS ownerId, conv_type AS convType FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || rows[0].convType !== 'group') throw new Error('群聊不存在')
  if (Number(rows[0].ownerId) !== owner) {
    const err = new Error('仅群主可管理黑名单')
    err.status = 403
    throw err
  }

  const [result] = await mysqlPool.query(
    'DELETE FROM group_blacklist WHERE conversation_id = ? AND user_id = ?',
    [id, target]
  )
  if (!result.affectedRows) throw new Error('该用户不在黑名单中')

  return {
    message: '已移出黑名单',
    conversationId: id,
    userId: target
  }
}

export async function getGroupAnnouncements(conversationId, userId) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')
  await assertConversationMember(id, uid)
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl,
            u.badge_text AS badgeText, u.badge_color AS badgeColor, u.badges AS badges
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? AND m.message_type = 'announcement' AND m.deleted_at IS NULL
     ORDER BY m.id DESC`,
    [id]
  )
  return rows.map((row) => ({
    ...mapMessageRow(row, uid),
    nickname: row.nickname || ''
  }))
}

async function clearInvalidAnnouncementPin(conversationId) {
  const id = Number(conversationId)
  const [rows] = await mysqlPool.query(
    `SELECT announcement_pinned AS pinned, announcement_pinned_message_id AS pinnedMessageId
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length || !rows[0]?.pinned) return
  const pinnedMessageId = Number(rows[0].pinnedMessageId) || 0
  if (!pinnedMessageId) return
  const [msgRows] = await mysqlPool.query(
    `SELECT id FROM messages
     WHERE id = ? AND conversation_id = ? AND message_type = 'announcement' AND deleted_at IS NULL
     LIMIT 1`,
    [pinnedMessageId, id]
  )
  if (!msgRows.length) {
    await mysqlPool.query(
      'UPDATE conversations SET announcement_pinned = 0, announcement_pinned_message_id = NULL WHERE id = ?',
      [id]
    )
  }
}

async function getGroupAnnouncementPinState(conversationId) {
  const id = Number(conversationId)
  await clearInvalidAnnouncementPin(id)
  const [pinRows] = await mysqlPool.query(
    `SELECT announcement_pinned AS announcementPinned,
            announcement_pinned_message_id AS announcementPinnedMessageId
     FROM conversations WHERE id = ? LIMIT 1`,
    [id]
  )
  return {
    announcementPinned: !!(pinRows[0]?.announcementPinned),
    announcementPinnedMessageId: pinRows[0]?.announcementPinnedMessageId
      ? Number(pinRows[0].announcementPinnedMessageId)
      : null
  }
}

async function syncGroupAnnouncementFromMessages(conversationId) {
  const id = Number(conversationId)
  const [rows] = await mysqlPool.query(
    `SELECT id, content, image_url AS imageUrl
     FROM messages
     WHERE conversation_id = ? AND message_type = 'announcement' AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [id]
  )
  const text = rows[0]?.content ? String(rows[0].content).trim() : ''
  const image = rows[0]?.imageUrl ? String(rows[0].imageUrl).trim() : ''
  if (!text && !image) {
    await mysqlPool.query(
      'UPDATE conversations SET announcement = NULL, announcement_image = NULL, announcement_pinned = 0, announcement_pinned_message_id = NULL WHERE id = ?',
      [id]
    )
    return {
      announcement: '',
      announcementImage: '',
      announcementPinned: false,
      announcementPinnedMessageId: null
    }
  }
  await mysqlPool.query(
    'UPDATE conversations SET announcement = ?, announcement_image = ? WHERE id = ?',
    [text || null, image || null, id]
  )
  const pinState = await getGroupAnnouncementPinState(id)
  if (pinState.announcementPinned && !pinState.announcementPinnedMessageId && rows[0]?.id) {
    await mysqlPool.query(
      'UPDATE conversations SET announcement_pinned_message_id = ? WHERE id = ?',
      [rows[0].id, id]
    )
    pinState.announcementPinnedMessageId = Number(rows[0].id)
  }
  return {
    announcement: text,
    announcementImage: image,
    ...pinState
  }
}

export async function deleteGroupAnnouncement(conversationId, userId, messageId) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!id || !uid || !mid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  await assertGroupModerator(id, uid, '删除群公告')

  const [msgRows] = await mysqlPool.query(
    `SELECT id, conversation_id AS conversationId, user_id AS userId, content,
            message_type AS messageType, image_url AS imageUrl, created_at AS createdAt, deleted_at AS deletedAt
     FROM messages
     WHERE id = ? AND conversation_id = ? AND message_type = 'announcement'
     LIMIT 1`,
    [mid, id]
  )
  if (!msgRows.length) throw new Error('公告不存在')
  if (msgRows[0].deletedAt) throw new Error('公告已删除')

  await mysqlPool.query(
    'UPDATE messages SET deleted_at = NOW(), content = ?, image_url = NULL WHERE id = ?',
    ['', mid]
  )

  const announcementState = await syncGroupAnnouncementFromMessages(id)

  const [updatedRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            u.username, u.avatar_url AS avatarUrl
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [mid]
  )

  const message = mapMessageRow(updatedRows[0], uid)
  return {
    message: {
      ...message,
      deleted: true,
      imageUrl: '',
      photoUrl: ''
    },
    announcement: announcementState.announcement,
    announcementImage: announcementState.announcementImage,
    announcementPinned: announcementState.announcementPinned,
    announcementPinnedMessageId: announcementState.announcementPinnedMessageId
  }
}

export async function updateGroupAnnouncementPin(conversationId, userId, pinned, messageId = undefined) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  const mid = Number(messageId) || 0
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId, c.announcement, c.announcement_image AS announcementImage
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  await assertGroupModerator(id, uid, '修改群公告')

  const nextPinned = !!pinned
  if (nextPinned) {
    if (!mid) throw new Error('请选择要置顶的公告')
    const [msgRows] = await mysqlPool.query(
      `SELECT id FROM messages
       WHERE id = ? AND conversation_id = ? AND message_type = 'announcement' AND deleted_at IS NULL
       LIMIT 1`,
      [mid, id]
    )
    if (!msgRows.length) throw new Error('公告不存在')
    await mysqlPool.query(
      'UPDATE conversations SET announcement_pinned = 1, announcement_pinned_message_id = ? WHERE id = ?',
      [mid, id]
    )
  } else {
    if (mid) {
      await mysqlPool.query(
        `UPDATE conversations
         SET announcement_pinned = 0, announcement_pinned_message_id = NULL
         WHERE id = ? AND announcement_pinned_message_id = ?`,
        [id, mid]
      )
    } else {
      await mysqlPool.query(
        'UPDATE conversations SET announcement_pinned = 0, announcement_pinned_message_id = NULL WHERE id = ?',
        [id]
      )
    }
  }

  const pinState = await getGroupAnnouncementPinState(id)
  return {
    announcement: rows[0].announcement || '',
    announcementImage: rows[0].announcementImage || '',
    ...pinState
  }
}

export async function editGroupAnnouncementMessage(
  conversationId,
  userId,
  messageId,
  announcement,
  imageUrl = ''
) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!id || !uid || !mid) throw new Error('无效的参数')

  const text = String(announcement ?? '').trim()
  const image = String(imageUrl ?? '').trim()
  if (!text && !image) throw new Error('群公告不能为空')
  if (text.length > 600) throw new Error('群公告不能超过 600 字')
  if (text) assertNoXssPayload(text, { field: '群公告', allowEmpty: true })
  if (
    image &&
    !image.startsWith('/media/Chat Images/') &&
    !image.startsWith('/chat-image/')
  ) {
    throw new Error('无效的图片地址')
  }

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  await assertGroupModerator(id, uid, '修改群公告')

  const [msgRows] = await mysqlPool.query(
    `SELECT id, deleted_at AS deletedAt
     FROM messages
     WHERE id = ? AND conversation_id = ? AND message_type = 'announcement'
     LIMIT 1`,
    [mid, id]
  )
  if (!msgRows.length) throw new Error('公告不存在')
  if (msgRows[0].deletedAt) throw new Error('公告已删除')

  await mysqlPool.query('UPDATE messages SET content = ?, image_url = ? WHERE id = ?', [
    text || '',
    image || null,
    mid
  ])

  const announcementState = await syncGroupAnnouncementFromMessages(id)

  const [updatedRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.content,
            m.message_type AS messageType, m.image_url AS imageUrl,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            u.username, u.avatar_url AS avatarUrl
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [mid]
  )

  const message = mapMessageRow(updatedRows[0], uid)
  return {
    announcement: announcementState.announcement,
    announcementImage: announcementState.announcementImage,
    ...announcementState,
    chatMessage: {
      ...message,
      imageUrl: message.imageUrl || image || '',
      photoUrl: message.photoUrl || message.imageUrl || image || ''
    },
    message: '群公告已更新'
  }
}

export async function updateGroupAnnouncement(conversationId, userId, announcement, imageUrl = '', pinned = undefined, messageId = undefined) {
  if (messageId) {
    return editGroupAnnouncementMessage(conversationId, userId, messageId, announcement, imageUrl)
  }
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const text = String(announcement ?? '').trim()
  const image = String(imageUrl ?? '').trim()
  if (!text && !image) throw new Error('群公告不能为空')
  if (text.length > 600) throw new Error('群公告不能超过 600 字')
  if (text) assertNoXssPayload(text, { field: '群公告', allowEmpty: true })
  if (
    image &&
    !image.startsWith('/media/Chat Images/') &&
    !image.startsWith('/chat-image/')
  ) {
    throw new Error('无效的图片地址')
  }

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  await assertGroupModerator(id, uid, '修改群公告')

  if (pinned === undefined) {
    await mysqlPool.query(
      'UPDATE conversations SET announcement = ?, announcement_image = ? WHERE id = ?',
      [text || null, image || null, id]
    )
  } else {
    await mysqlPool.query(
      'UPDATE conversations SET announcement = ?, announcement_image = ?, announcement_pinned = ? WHERE id = ?',
      [text || null, image || null, pinned ? 1 : 0, id]
    )
  }

  let chatMessage = null
  if (text || image) {
    chatMessage = await sendMessage(
      id,
      uid,
      { type: 'announcement', content: text, imageUrl: image },
      { allowSystemType: true }
    )
  }

  const pinState = await getGroupAnnouncementPinState(id)

  return {
    announcement: text,
    announcementImage: image,
    ...pinState,
    chatMessage: chatMessage
      ? {
          ...chatMessage,
          imageUrl: chatMessage.imageUrl || image || '',
          photoUrl: chatMessage.photoUrl || chatMessage.imageUrl || image || ''
        }
      : null,
    message: text || image ? '群公告已发布' : '群公告已清空'
  }
}

export async function updateGroupName(conversationId, userId, name) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const title = String(name ?? '').trim()
  if (!title) throw new Error('群名称不能为空')
  if (title.length > 96) throw new Error('群名称不能超过 96 字')
  assertGroupDisplayName(title)

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')
  await assertGroupModerator(id, uid, '修改群名称')

  await mysqlPool.query('UPDATE conversations SET title = ?, updated_at = NOW() WHERE id = ?', [title, id])
  return { title, message: '群名称已更新' }
}

/** 设置「我在本群的昵称」；仅对该群聊生效，个人资料仍用全局昵称 */
export async function setMyGroupNickname(conversationId, userId, nickname) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const trimmed = String(nickname ?? '').trim()
  if (trimmed.length > 32) throw new Error('群昵称不能超过 32 字')
  if (trimmed) assertUserDisplayName(trimmed, '群昵称')

  const [rows] = await mysqlPool.query(
    `SELECT c.id, u.nickname AS userNickname, u.username
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     JOIN users u ON u.id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, uid, id]
  )
  if (!rows.length) throw new Error('群聊不存在或无权访问')

  const value = trimmed || null
  await mysqlPool.query(
    'UPDATE conversation_members SET group_nickname = ? WHERE conversation_id = ? AND user_id = ?',
    [value, id, uid]
  )

  const userNickname = String(rows[0].userNickname || rows[0].username || '').trim()
  const displayName = trimmed || userNickname
  return {
    conversationId: id,
    userId: uid,
    groupNickname: trimmed,
    nickname: userNickname,
    displayName,
    message: trimmed ? '群昵称已更新' : '已恢复为原昵称'
  }
}

export async function updateGroupAvatar(_conversationId, _userId, _avatarUrl) {
  const err = new Error('群头像由系统自动生成，不可更换')
  err.status = 403
  throw err
}

export async function quitGroupChat(conversationId, userId, { dissolve = false } = {}) {
  assertConnected()
  const id = Number(conversationId)
  const uid = Number(userId)
  if (!id || !uid) throw new Error('无效的参数')

  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.owner_id AS ownerId, c.banned, c.conv_type
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ? AND c.conv_type = 'group'
     LIMIT 1`,
    [uid, id]
  )
  if (!rows.length) throw new Error('您不在该群聊中')
  const group = rows[0]
  const isOwner = Number(group.ownerId) === uid

  if (dissolve) {
    if (!isOwner) throw new Error('仅群主可解散群聊')
    if (group.banned) {
      const err = new Error('该群已被封禁，无法解散')
      err.status = 403
      throw err
    }
    return deleteGroupById(id)
  }

  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM conversation_members WHERE conversation_id = ?',
      [id]
    )
    const memberCount = Number(countRows[0]?.cnt) || 0
    let leaveMessage = null
    if (memberCount > 1) {
      leaveMessage = await insertButlerLeaveNotice(conn, id, uid)
    }
    await conn.query(
      'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, uid]
    )
    const [remain] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM conversation_members WHERE conversation_id = ?',
      [id]
    )
    const remaining = Number(remain[0]?.cnt) || 0
    if (remaining === 0) {
      await conn.query('DELETE FROM messages WHERE conversation_id = ?', [id])
      await conn.query('DELETE FROM conversations WHERE id = ?', [id])
      await conn.commit()
      return {
        message: '已退出群聊，群聊已自动解散',
        dissolved: true,
        conversationId: id,
        groupId: id,
        memberIds: [uid],
        leaveMessage: null
      }
    }
    await conn.commit()
    const mosaicUrl = await refreshGroupCompositeAvatar(id)
    return {
      message: '已退出群聊',
      dissolved: false,
      conversationId: id,
      leaveMessage,
      leftUserId: uid,
      avatarUrl: mosaicUrl
    }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

export async function getGroupMessagesForAdmin(groupId, { limit = 50, beforeId = null } = {}) {
  assertConnected()
  const id = Number(groupId)
  if (!id) throw new Error('无效的群 ID')
  const [convRows] = await mysqlPool.query(
    "SELECT id, title, group_code AS groupCode FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1",
    [id]
  )
  if (!convRows.length) throw new Error('群聊不存在')

  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const params = [id]
  let beforeClause = ''
  if (beforeId) {
    beforeClause = ' AND m.id < ?'
    params.push(Number(beforeId))
  }
  params.push(pageSize)

  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.ai_bot_id AS aiBotId,
            m.content, m.message_type AS messageType, m.image_url AS imageUrl,
            m.voice_url AS voiceUrl, m.voice_duration AS voiceDuration,
            m.created_at AS createdAt, m.deleted_at AS deletedAt,
            m.recalled_by_user_id AS recalledByUserId,
            u.username, u.nickname, u.avatar_url AS avatarUrl,
            u.badge_text AS badgeText, u.badge_color AS badgeColor, u.badges AS badges,
            b.name AS aiBotName, b.avatar_url AS aiBotAvatar
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN ai_bots b ON b.id = m.ai_bot_id
     WHERE m.conversation_id = ?${beforeClause}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  )

  const list = rows.reverse().map((row) => mapMessageRow(row, null))
  return {
    group: {
      id: convRows[0].id,
      name: convRows[0].title || '群聊',
      groupCode: convRows[0].groupCode || ''
    },
    list,
    hasMore: rows.length === pageSize
  }
}

export async function listGroupsForAdmin() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.title AS name, c.conv_type AS type, c.owner_id AS ownerId,
            c.group_code AS groupCode, c.banned, c.created_at AS createdAt,
            u.username AS ownerUsername, u.nickname AS ownerNickname,
            u.chat_no AS ownerChatNo, u.email AS ownerEmail,
            (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS memberCount
     FROM conversations c
     LEFT JOIN users u ON u.id = c.owner_id
     WHERE c.conv_type = 'group'
     ORDER BY c.id DESC`
  )
  return rows.map((row) => ({
    id: row.id,
    type: row.type || 'group',
    name: row.name || '群聊',
    ownerId: row.ownerId,
    ownerUsername: row.ownerUsername || '',
    ownerNickname: row.ownerNickname || '',
    ownerChatNo: row.ownerChatNo != null ? Number(row.ownerChatNo) : null,
    ownerEmail: row.ownerEmail ? String(row.ownerEmail) : '',
    groupCode: row.groupCode || '',
    memberCount: Number(row.memberCount) || 0,
    banned: !!row.banned,
    createdAt: row.createdAt,
    assignments: []
  }))
}

export async function getGroupAiBotNamesByConversation() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT ga.conversation_id AS conversationId, b.name AS botName
     FROM group_ai_bots ga
     JOIN ai_bots b ON b.id = ga.bot_id`
  )
  const map = new Map()
  for (const row of rows) {
    map.set(Number(row.conversationId), String(row.botName || 'AI').trim() || 'AI')
  }
  return map
}

export async function setGroupBanned(groupId, banned) {
  assertConnected()
  const id = Number(groupId)
  if (!id) throw new Error('无效的群 ID')
  const [result] = await mysqlPool.query(
    "UPDATE conversations SET banned = ? WHERE id = ? AND conv_type = 'group'",
    [banned ? 1 : 0, id]
  )
  if (result.affectedRows === 0) throw new Error('群聊不存在')
  return { message: banned ? '已封禁' : '已解封', banned: !!banned, groupId: id }
}

export async function deleteGroupById(groupId) {
  assertConnected()
  const id = Number(groupId)
  if (!id) throw new Error('无效的群 ID')
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const [check] = await conn.query(
      "SELECT id FROM conversations WHERE id = ? AND conv_type = 'group' LIMIT 1",
      [id]
    )
    if (!check.length) throw new Error('群聊不存在')
    const [members] = await conn.query(
      'SELECT user_id AS userId FROM conversation_members WHERE conversation_id = ?',
      [id]
    )
    const memberIds = members.map((m) => Number(m.userId)).filter(Boolean)
    await conn.query('DELETE FROM messages WHERE conversation_id = ?', [id])
    await conn.query('DELETE FROM conversation_members WHERE conversation_id = ?', [id])
    await conn.query("DELETE FROM conversations WHERE id = ? AND conv_type = 'group'", [id])
    await conn.commit()
    return { message: '群聊已解散', groupId: id, conversationId: id, dissolved: true, memberIds }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

export function getGroupAdminConfig() {
  return { maxOwnedGroupsPerUser: getMaxOwnedGroupsPerUserLimit() }
}

export function setMaxOwnedGroupsPerUser(max) {
  let v = Number(max)
  if (!Number.isFinite(v) || v < 0) v = 0
  v = Math.min(Math.floor(v), 500)
  saveConfig({ maxOwnedGroupsPerUser: v })
  return { maxOwnedGroupsPerUser: v, message: '已保存' }
}

export function setUserGroupCreationBan(userId, banned) {
  const result = setUserRestrictions(userId, { createGroup: !!banned })
  return {
    message: banned ? '已禁止创群' : '已解除禁止创群',
    banned: !!banned,
    restrictions: result.restrictions
  }
}

function announcementImageUrlToFilename(imageUrl) {
  const url = String(imageUrl || '').trim().replace(/\\/g, '/')
  const prefix = `${CHAT_IMAGE_URL_PREFIX}/`
  if (!url.startsWith(prefix)) return null
  try {
    return path.basename(decodeURIComponent(url.slice(prefix.length)))
  } catch {
    return path.basename(url.slice(prefix.length))
  }
}

function readChatImageFileStat(filename) {
  const safe = path.basename(String(filename || ''))
  if (!safe || safe.includes('..')) return null
  const filePath = path.join(CHAT_IMAGE_DIR, safe)
  if (!fs.existsSync(filePath)) return null
  const stat = fs.statSync(filePath)
  return { filename: safe, size: stat.size, updatedAt: stat.mtime.toISOString() }
}

export async function listGroupAnnouncementImagesForAdmin() {
  assertConnected()
  const [rows] = await mysqlPool.query(
    `SELECT m.id AS messageId, m.conversation_id AS groupId, m.image_url AS imageUrl,
            m.content, m.created_at AS createdAt, m.deleted_at AS deletedAt,
            c.title AS groupName, c.group_code AS groupCode,
            u.username AS publisherUsername, u.nickname AS publisherNickname
     FROM messages m
     INNER JOIN conversations c ON c.id = m.conversation_id AND c.conv_type = 'group'
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.message_type = 'announcement'
       AND m.image_url IS NOT NULL AND TRIM(m.image_url) <> ''
     ORDER BY m.id DESC`
  )
  const list = rows.map((row) => {
    const filename = announcementImageUrlToFilename(row.imageUrl)
    const fileStat = filename ? readChatImageFileStat(filename) : null
    const publisher = String(row.publisherNickname || row.publisherUsername || '').trim()
    return {
      messageId: row.messageId,
      groupId: row.groupId,
      groupName: row.groupName || '群聊',
      groupCode: row.groupCode || '',
      imageUrl: row.imageUrl,
      filename: filename || '',
      url: row.imageUrl,
      contentPreview: String(row.content || '').trim().slice(0, 80),
      publisher: publisher || '—',
      createdAt: row.createdAt,
      deleted: !!row.deletedAt,
      fileExists: !!fileStat,
      size: fileStat?.size || 0,
      updatedAt: fileStat?.updatedAt || row.createdAt
    }
  })
  const totalSize = list.reduce((sum, item) => sum + (item.size || 0), 0)
  return { dir: CHAT_IMAGE_DIR, list, totalSize }
}

export async function deleteGroupAnnouncementImageForAdmin(filename) {
  assertConnected()
  const safe = announcementImageUrlToFilename(`${CHAT_IMAGE_URL_PREFIX}/${filename}`)
    || path.basename(String(filename || ''))
  if (!safe || safe.includes('..') || /[\\/]/.test(safe)) throw new Error('无效的文件名')

  const encodedUrl = `${CHAT_IMAGE_URL_PREFIX}/${encodeURIComponent(safe)}`
  const rawUrl = `${CHAT_IMAGE_URL_PREFIX}/${safe}`

  const [msgRows] = await mysqlPool.query(
    `SELECT id, conversation_id AS conversationId, image_url AS imageUrl
     FROM messages
     WHERE message_type = 'announcement'
       AND image_url IS NOT NULL
       AND (image_url = ? OR image_url = ? OR image_url LIKE ?)`,
    [rawUrl, encodedUrl, `%/${safe}`]
  )

  const groupIds = new Set()
  for (const row of msgRows) {
    groupIds.add(Number(row.conversationId))
  }

  await mysqlPool.query(
    `UPDATE messages
     SET image_url = NULL
     WHERE message_type = 'announcement'
       AND (image_url = ? OR image_url = ? OR image_url LIKE ?)`,
    [rawUrl, encodedUrl, `%/${safe}`]
  )

  await mysqlPool.query(
    `UPDATE conversations
     SET announcement_image = NULL
     WHERE announcement_image = ? OR announcement_image = ? OR announcement_image LIKE ?`,
    [rawUrl, encodedUrl, `%/${safe}`]
  )

  for (const groupId of groupIds) {
    if (groupId) await syncGroupAnnouncementFromMessages(groupId)
  }

  try {
    deleteChatPhoto(safe)
  } catch (e) {
    if (!/不存在/.test(String(e.message || ''))) throw e
  }

  return { filename: safe, clearedMessages: msgRows.length, clearedGroups: groupIds.size }
}

function mapAiBotRow(row, { maskKey = true } = {}) {
  const humanlikeRaw = row.humanlikeReply ?? row.humanlike_reply
  const [replyDelayMinSec, replyDelayMaxSec] = normalizeReplyDelayRange(row)
  const ttsVoiceId = normalizeTtsVoiceId(row.ttsVoiceId ?? row.tts_voice_id, { isAi: true })
  return {
    id: row.id,
    name: row.name || '',
    avatarUrl: normalizeAvatarUrl(row.avatarUrl ?? row.avatar_url ?? ''),
    mentionNames: row.mentionNames ?? row.mention_names ?? '',
    apiBaseUrl: row.apiBaseUrl ?? row.api_base_url ?? '',
    apiKeyMasked: maskKey ? maskApiKey(row.apiKey ?? row.api_key ?? '') : '',
    model: row.model || 'deepseek-v4-flash',
    personaId: row.personaId ?? row.persona_id ?? '',
    systemPrompt: row.systemPrompt ?? row.system_prompt ?? '',
    humanlikeReply: humanlikeRaw === undefined || humanlikeRaw === null ? true : !!Number(humanlikeRaw),
    replyDelayMinSec,
    replyDelayMaxSec,
    ttsVoiceId,
    ttsVoiceLabel: voiceLabelById(ttsVoiceId),
    persona: row.persona || '',
    personality: row.personality || '',
    knowledgeBase: row.knowledgeBase ?? row.knowledge_base ?? '',
    enabled: !!(row.enabled ?? row.Enabled),
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  }
}

export async function listAiBotsForAdmin() {
  assertConnected()
  const [bots] = await mysqlPool.query(
    `SELECT id, name, avatar_url AS avatarUrl, mention_names AS mentionNames,
            api_base_url AS apiBaseUrl, api_key AS apiKey, model,
            persona_id AS personaId, system_prompt AS systemPrompt,
            humanlike_reply AS humanlikeReply,
            reply_delay_min_sec AS replyDelayMinSec,
            reply_delay_max_sec AS replyDelayMaxSec,
            tts_voice_id AS ttsVoiceId,
            enabled, created_at AS createdAt, updated_at AS updatedAt
     FROM ai_bots ORDER BY id DESC`
  )
  const [assignRows] = await mysqlPool.query(
    `SELECT ga.bot_id AS botId, ga.conversation_id AS conversationId,
            c.title AS groupTitle, c.group_code AS groupCode
     FROM group_ai_bots ga
     JOIN conversations c ON c.id = ga.conversation_id`
  )
  const assignByBot = new Map()
  for (const row of assignRows) {
    const bid = Number(row.botId)
    if (!assignByBot.has(bid)) assignByBot.set(bid, [])
    assignByBot.get(bid).push({
      conversationId: row.conversationId,
      groupTitle: row.groupTitle || '群聊',
      groupCode: row.groupCode || ''
    })
  }
  return bots.map((b) => ({
    ...mapAiBotRow(b),
    assignments: assignByBot.get(Number(b.id)) || []
  }))
}

export async function getAiBotRecordById(botId, { includeKey = false } = {}) {
  const id = Number(botId)
  if (!id) return null
  const [rows] = await mysqlPool.query(
    `SELECT id, name, avatar_url AS avatarUrl, mention_names AS mentionNames,
            api_base_url AS apiBaseUrl, api_key AS apiKey, model,
            persona_id AS personaId, system_prompt AS systemPrompt,
            humanlike_reply AS humanlikeReply,
            reply_delay_min_sec AS replyDelayMinSec,
            reply_delay_max_sec AS replyDelayMaxSec,
            tts_voice_id AS ttsVoiceId,
            enabled
     FROM ai_bots WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows.length) return null
  const row = rows[0]
  return {
    ...mapAiBotRow(row),
    apiKey: includeKey ? row.apiKey || '' : undefined
  }
}

/** 管理后台：用指定 AI 配置做一轮测试对话（不写入群消息） */
export async function testAiBotChat({ botId, message, history = [], draft = null } = {}) {
  assertConnected()
  const userContent = String(message || '').trim()
  if (!userContent) throw new Error('请输入测试消息')
  if (userContent.length > 4000) throw new Error('测试消息过长')

  let bot = null
  const id = Number(botId)
  if (id > 0) {
    bot = await getAiBotRecordById(id, { includeKey: true })
    if (!bot) throw new Error('AI 配置不存在')
  }

  const d = draft && typeof draft === 'object' ? draft : null
  if (d) {
    const draftKey = String(d.apiKey ?? d.api_key ?? '').trim()
    bot = {
      id: bot?.id || 0,
      name: String(d.name || bot?.name || '测试 AI').trim() || '测试 AI',
      apiBaseUrl: DEEPSEEK_BASE_URL,
      apiKey: draftKey || bot?.apiKey || '',
      model: normalizeDeepseekModel(d.model || bot?.model),
      systemPrompt: String(d.systemPrompt ?? d.system_prompt ?? bot?.systemPrompt ?? '').trim(),
      humanlikeReply:
        d.humanlikeReply !== undefined || d.humanlike_reply !== undefined
          ? !!(d.humanlikeReply ?? d.humanlike_reply)
          : bot?.humanlikeReply !== false
    }
  }

  if (!bot) throw new Error('请选择 AI 或填写配置')
  if (!bot.apiKey) throw new Error('请填写 DeepSeek API Key（编辑时可留空使用已保存密钥）')

  bot = {
    ...bot,
    apiBaseUrl: DEEPSEEK_BASE_URL,
    model: normalizeDeepseekModel(bot.model)
  }

  const hist = Array.isArray(history)
    ? history
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && String(h.content || '').trim())
        .slice(-12)
        .map((h) => ({ role: h.role, content: String(h.content).trim().slice(0, 4000) }))
    : []

  const reply = await callAiChatCompletion(bot, userContent, hist)
  return {
    reply,
    botName: bot.name || 'AI',
    model: bot.model || DEEPSEEK_DEFAULT_MODEL
  }
}

export async function createAiBot(data = {}) {
  assertConnected()
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请填写 AI 名称')
  const apiKey = String(data.apiKey ?? data.api_key ?? '').trim()
  if (!apiKey) throw new Error('请填写 DeepSeek API Key')
  const apiBaseUrl = normalizeDeepseekBaseUrl(data.apiBaseUrl ?? data.api_base_url)
  const model = normalizeDeepseekModel(data.model)
  const [replyDelayMinSec, replyDelayMaxSec] = normalizeReplyDelayRange({
    replyDelayMinSec: data.replyDelayMinSec ?? data.reply_delay_min_sec,
    replyDelayMaxSec: data.replyDelayMaxSec ?? data.reply_delay_max_sec
  })
  const ttsVoiceId = normalizeTtsVoiceId(data.ttsVoiceId ?? data.tts_voice_id, { isAi: true })

  const [result] = await mysqlPool.query(
    `INSERT INTO ai_bots (name, avatar_url, mention_names, api_base_url, api_key, model, persona_id, system_prompt, humanlike_reply, reply_delay_min_sec, reply_delay_max_sec, tts_voice_id, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      String(data.avatarUrl ?? data.avatar_url ?? '').trim() || null,
      String(data.mentionNames ?? data.mention_names ?? '').trim(),
      apiBaseUrl,
      apiKey,
      model,
      null,
      String(data.systemPrompt ?? data.system_prompt ?? '').trim() || null,
      data.humanlikeReply === false || data.humanlike_reply === false ? 0 : 1,
      replyDelayMinSec,
      replyDelayMaxSec,
      ttsVoiceId,
      data.enabled === false ? 0 : 1
    ]
  )
  const bot = await getAiBotRecordById(result.insertId)
  return bot
}

export async function updateAiBot(botId, data = {}) {
  assertConnected()
  const id = Number(botId)
  if (!id) throw new Error('无效的 AI ID')
  const existing = await getAiBotRecordById(id, { includeKey: true })
  if (!existing) throw new Error('AI 配置不存在')

  const name = data.name !== undefined ? String(data.name || '').trim() : existing.name
  if (!name) throw new Error('请填写 AI 名称')

  const apiBaseUrl = normalizeDeepseekBaseUrl(
    data.apiBaseUrl !== undefined ? data.apiBaseUrl : existing.apiBaseUrl
  )
  const apiKeyRaw = data.apiKey ?? data.api_key
  const apiKey =
    apiKeyRaw !== undefined && String(apiKeyRaw).trim()
      ? String(apiKeyRaw).trim()
      : existing.apiKey || ''
  if (!apiKey) throw new Error('请填写 DeepSeek API Key')
  const model =
    data.model !== undefined
      ? normalizeDeepseekModel(data.model)
      : normalizeDeepseekModel(existing.model)

  const [replyDelayMinSec, replyDelayMaxSec] = normalizeReplyDelayRange({
    replyDelayMinSec:
      data.replyDelayMinSec !== undefined || data.reply_delay_min_sec !== undefined
        ? (data.replyDelayMinSec ?? data.reply_delay_min_sec)
        : existing.replyDelayMinSec,
    replyDelayMaxSec:
      data.replyDelayMaxSec !== undefined || data.reply_delay_max_sec !== undefined
        ? (data.replyDelayMaxSec ?? data.reply_delay_max_sec)
        : existing.replyDelayMaxSec
  })
  const ttsVoiceId =
    data.ttsVoiceId !== undefined || data.tts_voice_id !== undefined
      ? normalizeTtsVoiceId(data.ttsVoiceId ?? data.tts_voice_id, { isAi: true })
      : normalizeTtsVoiceId(existing.ttsVoiceId, { isAi: true })

  await mysqlPool.query(
    `UPDATE ai_bots SET name = ?, avatar_url = ?, mention_names = ?, api_base_url = ?, api_key = ?,
            model = ?, persona_id = ?, system_prompt = ?, humanlike_reply = ?,
            reply_delay_min_sec = ?, reply_delay_max_sec = ?, tts_voice_id = ?, enabled = ?
     WHERE id = ?`,
    [
      name,
      data.avatarUrl !== undefined
        ? String(data.avatarUrl || '').trim() || null
        : existing.avatarUrl || null,
      data.mentionNames !== undefined
        ? String(data.mentionNames || '').trim()
        : existing.mentionNames || '',
      apiBaseUrl,
      apiKey,
      model,
      null,
      data.systemPrompt !== undefined
        ? String(data.systemPrompt || '').trim() || null
        : existing.systemPrompt || null,
      data.humanlikeReply !== undefined || data.humanlike_reply !== undefined
        ? data.humanlikeReply === false || data.humanlike_reply === false
          ? 0
          : 1
        : existing.humanlikeReply === false
          ? 0
          : 1,
      replyDelayMinSec,
      replyDelayMaxSec,
      ttsVoiceId,
      data.enabled === undefined ? (existing.enabled ? 1 : 0) : data.enabled ? 1 : 0,
      id
    ]
  )
  const savedSystemPrompt =
    data.systemPrompt !== undefined
      ? String(data.systemPrompt || '').trim()
      : String(existing.systemPrompt || '').trim()
  if (savedSystemPrompt) {
    await mysqlPool.query(
      `UPDATE ai_bots SET persona = NULL, personality = NULL, knowledge_base = NULL WHERE id = ?`,
      [id]
    )
  }
  return getAiBotRecordById(id)
}

export async function deleteAiBot(botId) {
  assertConnected()
  const id = Number(botId)
  if (!id) throw new Error('无效的 AI ID')
  const [result] = await mysqlPool.query('DELETE FROM ai_bots WHERE id = ?', [id])
  if (!result.affectedRows) throw new Error('AI 配置不存在')
  return { message: '已删除 AI 配置' }
}

export async function assignAiBotToGroupByCode(botId, groupCode) {
  assertConnected()
  const id = Number(botId)
  const code = String(groupCode || '').trim()
  if (!id) throw new Error('无效的 AI ID')
  if (!code) throw new Error('请填写群号')
  if (!isAdminNumericCode(code)) throw new Error(adminNumericFormatError('群号'))

  const bot = await getAiBotRecordById(id, { includeKey: true })
  if (!bot) throw new Error('AI 配置不存在')

  const [groups] = await mysqlPool.query(
    `SELECT id, title, group_code AS groupCode FROM conversations
     WHERE conv_type = 'group' AND TRIM(group_code) = ? LIMIT 1`,
    [code]
  )
  if (!groups.length) throw new Error('未找到该群号对应的群聊')

  const conversationId = Number(groups[0].id)
  const [existing] = await mysqlPool.query(
    'SELECT bot_id AS botId FROM group_ai_bots WHERE conversation_id = ? LIMIT 1',
    [conversationId]
  )
  if (existing.length) {
    throw new Error('此群已被分配 AI 了')
  }

  await mysqlPool.query(
    `INSERT INTO group_ai_bots (bot_id, conversation_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE bot_id = VALUES(bot_id)`,
    [id, conversationId]
  )

  const butlerMessage = await sendGroupButlerTextNotice(
    conversationId,
    formatButlerAiAssignedNotice(bot.name)
  )

  return {
    message: `已将「${bot.name}」分配到群「${groups[0].title || '群聊'}」`,
    assignment: {
      conversationId,
      groupTitle: groups[0].title || '群聊',
      groupCode: groups[0].groupCode || code
    },
    butlerMessage
  }
}

export async function unassignAiBotFromGroup(botId, conversationId) {
  assertConnected()
  const bid = Number(botId)
  const cid = Number(conversationId)
  if (!bid || !cid) throw new Error('无效的参数')
  const [result] = await mysqlPool.query(
    'DELETE FROM group_ai_bots WHERE bot_id = ? AND conversation_id = ?',
    [bid, cid]
  )
  if (!result.affectedRows) throw new Error('该群未分配此 AI')
  return { message: '已取消群分配' }
}

export async function unassignAiBotFromGroupByCode(botId, groupCode) {
  assertConnected()
  const bid = Number(botId)
  const code = String(groupCode || '').trim()
  if (!bid) throw new Error('无效的 AI ID')
  if (!code) throw new Error('请填写群号')
  if (!isAdminNumericCode(code)) throw new Error(adminNumericFormatError('群号'))

  const [groups] = await mysqlPool.query(
    `SELECT id FROM conversations WHERE conv_type = 'group' AND TRIM(group_code) = ? LIMIT 1`,
    [code]
  )
  if (!groups.length) throw new Error('未找到该群号对应的群聊')
  return unassignAiBotFromGroup(bid, groups[0].id)
}

export async function getGroupAiBotAssignment(conversationId) {
  assertConnected()
  const id = Number(conversationId)
  if (!id) return null
  const [rows] = await mysqlPool.query(
    `SELECT b.id, b.name, b.avatar_url AS avatarUrl, b.mention_names AS mentionNames,
            b.api_base_url AS apiBaseUrl, b.api_key AS apiKey, b.model,
            b.persona_id AS personaId, b.system_prompt AS systemPrompt,
            b.humanlike_reply AS humanlikeReply,
            b.reply_delay_min_sec AS replyDelayMinSec,
            b.reply_delay_max_sec AS replyDelayMaxSec,
            b.tts_voice_id AS ttsVoiceId,
            b.persona, b.personality, b.knowledge_base AS knowledgeBase, b.enabled
     FROM group_ai_bots ga
     JOIN ai_bots b ON b.id = ga.bot_id
     WHERE ga.conversation_id = ? AND b.enabled = 1
     LIMIT 1`,
    [id]
  )
  if (!rows.length) return null
  return { ...mapAiBotRow(rows[0], { maskKey: false }), apiKey: rows[0].apiKey || '' }
}

async function getRecentMessagesForAiContext(conversationId, limit = 12) {
  const id = Number(conversationId)
  const [rows] = await mysqlPool.query(
    `SELECT m.content, m.message_type AS messageType, m.user_id AS userId,
            u.nickname, u.username, b.name AS aiBotName
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN ai_bots b ON b.id = m.ai_bot_id
     WHERE m.conversation_id = ? AND m.deleted_at IS NULL
       AND m.message_type IN ('text', 'ai')
     ORDER BY m.id DESC LIMIT ?`,
    [id, limit]
  )
  return rows.reverse().map((row) => {
    const type = String(row.messageType || 'text').toLowerCase()
    if (type === 'ai') {
      return { role: 'assistant', content: row.content || '' }
    }
    const name = row.nickname || row.username || '用户'
    return { role: 'user', content: `${name}：${row.content || ''}` }
  })
}

export async function insertAiBotMessage(conversationId, botId, content) {
  assertConnected()
  const cid = Number(conversationId)
  const bid = Number(botId)
  const text = maskMessageContent(String(content || '').trim(), 'ai')
  if (!cid || !bid || !text) throw new Error('无效的 AI 回复')

  const preview = previewForMessage('ai', text, '', '')
  const [result] = await mysqlPool.query(
    `INSERT INTO messages (conversation_id, user_id, ai_bot_id, content, message_type, is_self)
     VALUES (?, NULL, ?, ?, 'ai', 0)`,
    [cid, bid, text]
  )
  await mysqlPool.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [
    preview,
    cid
  ])

  const [msgRows] = await mysqlPool.query(
    `SELECT m.id, m.conversation_id AS conversationId, m.user_id AS userId, m.ai_bot_id AS aiBotId,
            m.content, m.message_type AS messageType, m.created_at AS createdAt,
            b.name AS aiBotName, b.avatar_url AS aiBotAvatar
     FROM messages m
     LEFT JOIN ai_bots b ON b.id = m.ai_bot_id
     WHERE m.id = ?`,
    [result.insertId]
  )
  return mapAiMessageRow(msgRows[0], null)
}

export async function triggerGroupAiReply(conversationId, senderUserId, userMessage) {
  assertConnected()
  const cid = Number(conversationId)
  const uid = Number(senderUserId)
  if (!cid || !uid) return null

  const msgType = String(userMessage?.messageType || userMessage?.type || 'text').toLowerCase()
  if (msgType !== 'text') return null
  const content = String(userMessage?.content || '').trim()
  if (!content) return null

  const [convRows] = await mysqlPool.query(
    'SELECT conv_type AS convType FROM conversations WHERE id = ? LIMIT 1',
    [cid]
  )
  if (!convRows.length || convRows[0].convType !== 'group') return null

  const bot = await getGroupAiBotAssignment(cid)
  if (!bot) return null
  if (!isBotMentioned(content, bot)) return null

  const delayMs = resolveReplyDelayMs(bot)
  const startedAt = Date.now()
  const userContent = stripBotMentions(content, bot) || content
  const rawHistory = await getRecentMessagesForAiContext(cid, 16)
  const history = excludeCurrentUserFromHistory(rawHistory, userContent, content)
  const reply = await callAiChatCompletion(bot, userContent, history)
  // 补足到随机秒数，避免秒回；模型已慢于目标时不再额外等
  await sleep(delayMs - (Date.now() - startedAt))
  return insertAiBotMessage(cid, bot.id, reply)
}

export async function addDrawGuessSessionScores(conversationId, scores = {}) {
  assertConnected()
  const convId = Number(conversationId)
  if (!convId || !scores || typeof scores !== 'object') return { updated: 0 }

  const entries = Object.entries(scores)
    .map(([userId, score]) => [Number(userId), Number(score)])
    .filter(([userId, score]) => userId > 0 && Number.isFinite(score) && score > 0)

  for (const [userId, score] of entries) {
    await mysqlPool.query(
      `INSERT INTO draw_guess_group_scores (conversation_id, user_id, total_score)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_score = total_score + VALUES(total_score),
         updated_at = CURRENT_TIMESTAMP`,
      [convId, userId, Math.floor(score)]
    )
  }

  return { updated: entries.length }
}

export async function getDrawGuessLeaderboard(conversationId, userId, limit = 100) {
  assertConnected()
  const convId = Number(conversationId)
  const uid = Number(userId)
  if (!convId || !uid) throw new Error('无效的参数')

  await getGroupChatDetail(convId, uid)

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200)

  const [members] = await mysqlPool.query(
    `SELECT u.id AS userId, u.username, u.nickname, u.avatar_url AS avatarUrl
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?`,
    [convId]
  )

  const [scoreRows] = await mysqlPool.query(
    `SELECT user_id AS userId, total_score AS totalScore
     FROM draw_guess_group_scores
     WHERE conversation_id = ?`,
    [convId]
  )
  const scoreMap = new Map(
    scoreRows.map((row) => [Number(row.userId), Number(row.totalScore) || 0])
  )

  const list = members.map((m) => {
    const id = Number(m.userId)
    return {
      userId: id,
      username: m.username || '',
      nickname: m.nickname || m.username || '用户',
      avatarUrl: normalizeAvatarUrl(m.avatarUrl),
      totalScore: scoreMap.has(id) ? scoreMap.get(id) : 0
    }
  })

  list.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.userId - b.userId
  })

  return list.slice(0, safeLimit).map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    totalScore: row.totalScore
  }))
}

const MOMENT_MEDIA_IMAGE_MAX = 6
const MOMENT_MEDIA_VIDEO_MAX = 1

function isMomentVideoUrl(url) {
  const u = String(url || '')
  return /\/media\/Moments%20Videos\//i.test(u) || /\/media\/Moments Videos\//i.test(u)
}

/** 解析说说媒体：兼容旧版纯 URL 字符串数组 */
function parseMomentMediaJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || '[]'))
    if (!Array.isArray(parsed)) return []
    const out = []
    for (const item of parsed) {
      if (out.length >= MOMENT_MEDIA_IMAGE_MAX + MOMENT_MEDIA_VIDEO_MAX) break
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const url = encodeMediaPathUrl(String(item.url || '').trim())
        if (!url) continue
        const type = String(item.type || '').toLowerCase() === 'video' || isMomentVideoUrl(url)
          ? 'video'
          : 'image'
        const duration = Number(item.duration)
        out.push({
          url,
          type,
          duration: type === 'video' && Number.isFinite(duration) && duration > 0 ? duration : 0
        })
        continue
      }
      const url = encodeMediaPathUrl(String(item || '').trim())
      if (!url) continue
      const type = isMomentVideoUrl(url) ? 'video' : 'image'
      out.push({ url, type, duration: 0 })
    }
    return out
  } catch {
    return []
  }
}

function parseMomentImagesJson(raw) {
  return parseMomentMediaJson(raw)
    .filter((m) => m.type !== 'video')
    .map((m) => m.url)
    .slice(0, MOMENT_MEDIA_IMAGE_MAX)
}

function deleteMomentMediaFiles(mediaList) {
  const list = Array.isArray(mediaList) ? mediaList : []
  const photoUrls = []
  for (const m of list) {
    const url = typeof m === 'string' ? m : m?.url
    if (!url) continue
    if (isMomentVideoUrl(url) || m?.type === 'video') {
      deleteMomentsVideoByUrl(url)
    } else {
      photoUrls.push(url)
    }
  }
  if (photoUrls.length) deleteMomentsPhotosByUrls(photoUrls)
}

function mapMomentRow(row) {
  if (!row) return null
  const media = parseMomentMediaJson(row.imagesJson || row.images_json)
  return {
    id: Number(row.id),
    userId: Number(row.userId || row.user_id),
    content: String(row.content || ''),
    media,
    images: media.filter((m) => m.type !== 'video').map((m) => m.url),
    visibility: String(row.visibility || 'friends'),
    createdAt: row.createdAt || row.created_at,
    likedByMe: false,
    likes: [],
    comments: [],
    user: {
      id: Number(row.userId || row.user_id),
      username: row.username || '',
      nickname: row.nickname || row.username || '用户',
      avatarUrl: normalizeAvatarUrl(row.avatarUrl || row.avatar_url)
    }
  }
}

async function attachMomentInteractions(viewerId, moments) {
  const list = Array.isArray(moments) ? moments.filter(Boolean) : []
  if (!list.length) return list
  const ids = list.map((m) => Number(m.id)).filter((id) => id > 0)
  if (!ids.length) return list
  const uid = Number(viewerId) || 0
  const [likeRows] = await mysqlPool.query(
    `SELECT ml.moment_id AS momentId, u.id AS userId, u.username, u.nickname
     FROM moment_likes ml
     INNER JOIN users u ON u.id = ml.user_id
     WHERE ml.moment_id IN (?)
     ORDER BY ml.created_at ASC, ml.user_id ASC`,
    [ids]
  )
  const [commentRows] = await mysqlPool.query(
    `SELECT c.id, c.moment_id AS momentId, c.user_id AS userId, c.content,
            c.reply_to_user_id AS replyToUserId, c.created_at AS createdAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl,
            ru.username AS replyUsername, ru.nickname AS replyNickname
     FROM moment_comments c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN users ru ON ru.id = c.reply_to_user_id
     WHERE c.moment_id IN (?)
     ORDER BY c.id ASC`,
    [ids]
  )
  const likesByMoment = new Map()
  for (const row of likeRows) {
    const mid = Number(row.momentId)
    if (!likesByMoment.has(mid)) likesByMoment.set(mid, [])
    likesByMoment.get(mid).push({
      id: Number(row.userId),
      username: row.username || '',
      nickname: row.nickname || row.username || '用户'
    })
  }
  const commentsByMoment = new Map()
  for (const row of commentRows) {
    const mid = Number(row.momentId)
    if (!commentsByMoment.has(mid)) commentsByMoment.set(mid, [])
    const replyToUserId = Number(row.replyToUserId) || 0
    commentsByMoment.get(mid).push({
      id: Number(row.id),
      momentId: mid,
      userId: Number(row.userId),
      content: String(row.content || ''),
      createdAt: row.createdAt,
      replyToUserId: replyToUserId || null,
      replyToUser: replyToUserId
        ? {
            id: replyToUserId,
            username: row.replyUsername || '',
            nickname: row.replyNickname || row.replyUsername || '用户'
          }
        : null,
      user: {
        id: Number(row.userId),
        username: row.username || '',
        nickname: row.nickname || row.username || '用户',
        avatarUrl: normalizeAvatarUrl(row.avatarUrl)
      }
    })
  }
  return list.map((m) => {
    const likes = likesByMoment.get(m.id) || []
    const comments = commentsByMoment.get(m.id) || []
    return {
      ...m,
      likes,
      comments,
      likedByMe: uid > 0 && likes.some((u) => u.id === uid)
    }
  })
}

async function assertCanInteractMoment(viewerId, momentId) {
  const uid = Number(viewerId)
  const mid = Number(momentId)
  if (!uid || !mid) throw new Error('无效的参数')
  const [rows] = await mysqlPool.query(
    'SELECT id, user_id AS userId, visibility FROM moments WHERE id = ? LIMIT 1',
    [mid]
  )
  if (!rows.length) {
    const err = new Error('说说不存在')
    err.status = 404
    throw err
  }
  const ownerId = Number(rows[0].userId)
  const vis = String(rows[0].visibility || '').trim().toLowerCase()
  const isPublic = vis === 'public' || vis === 'all'
  if (ownerId !== uid && !isPublic && !(await areFriends(uid, ownerId))) {
    const err = new Error('仅好友可互动')
    err.status = 403
    throw err
  }
  return { momentId: mid, ownerId }
}

const MOMENT_FEED_SELECT = `SELECT m.id, m.user_id AS userId, m.content, m.images_json AS imagesJson,
            m.visibility, m.created_at AS createdAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl
     FROM moments m
     INNER JOIN users u ON u.id = m.user_id`

/** 动态流：好友可见区 = 自己/好友的好友说说；全部可见 = 所有人的公开说说 */
export async function listMomentsFeed(viewerId, { limit = 30, beforeId = 0 } = {}) {
  assertConnected()
  const uid = Number(viewerId)
  if (!uid) throw new Error('无效的用户')
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 50)
  const before = Number(beforeId) || 0
  const beforeSql = before > 0 ? 'AND m.id < ?' : ''
  const params = []
  if (before > 0) params.push(before)
  params.push(lim)
  params.push(uid, uid)
  if (before > 0) params.push(before)
  params.push(lim)
  const [rows] = await mysqlPool.query(
    `SELECT * FROM (
       (${MOMENT_FEED_SELECT}
        WHERE m.visibility IN ('public', 'all')
          AND u.status = 'active'
          AND IFNULL(u.username, '') <> '__system_admin__'
          ${beforeSql}
        ORDER BY m.id DESC
        LIMIT ?)
       UNION ALL
       (${MOMENT_FEED_SELECT}
        WHERE m.visibility = 'friends'
          AND u.status = 'active'
          AND (
            m.user_id = ?
            OR EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.user_id = ? AND f.friend_id = m.user_id
            )
          )
          ${beforeSql}
        ORDER BY m.id DESC
        LIMIT ?)
     ) AS feed
     ORDER BY id DESC`,
    params
  )
  return attachMomentInteractions(uid, rows.map(mapMomentRow))
}

/** 查看某用户说说：本人/好友看全部，其他人只看公开说说 */
export async function listUserMoments(viewerId, targetUserId, { limit = 30, beforeId = 0 } = {}) {
  assertConnected()
  const uid = Number(viewerId)
  const tid = Number(targetUserId)
  if (!uid || !tid) throw new Error('无效的用户')
  const canSeeFriendsOnly = uid === tid || (await areFriends(uid, tid))
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 50)
  const before = Number(beforeId) || 0
  const params = [tid]
  let visSql = ''
  if (!canSeeFriendsOnly) {
    visSql = "AND m.visibility IN ('public', 'all')"
  }
  let beforeSql = ''
  if (before > 0) {
    beforeSql = 'AND m.id < ?'
    params.push(before)
  }
  params.push(lim)
  const [rows] = await mysqlPool.query(
    `${MOMENT_FEED_SELECT}
     WHERE m.user_id = ?
       ${visSql}
       ${beforeSql}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  )
  return attachMomentInteractions(uid, rows.map(mapMomentRow))
}

export async function createMoment(
  userId,
  { content = '', images = [], media = [], mentionUserIds = [], visibility = 'friends' } = {}
) {
  assertConnected()
  const uid = Number(userId)
  if (!uid) throw new Error('无效的用户')
  assertUserRestrictionAllowed(uid, 'chatMute')
  assertUserRestrictionAllowed(uid, 'postMoment')
  const raw = String(content || '').trim()
  assertNoXssPayload(raw, { field: '说说', allowEmpty: true })
  const text = maskBannedWords(raw)

  const mediaList = []
  const pushMedia = (entry) => {
    if (!entry?.url || !String(entry.url).startsWith('/media/')) return
    const type = entry.type === 'video' || isMomentVideoUrl(entry.url) ? 'video' : 'image'
    const duration = Number(entry.duration) || 0
    if (type === 'video') {
      if (mediaList.filter((m) => m.type === 'video').length >= MOMENT_MEDIA_VIDEO_MAX) return
      if (duration > 120) throw new Error('视频不能超过 2 分钟')
      mediaList.push({
        url: String(entry.url).trim(),
        type: 'video',
        duration: duration > 0 ? duration : 0
      })
    } else {
      if (mediaList.filter((m) => m.type !== 'video').length >= MOMENT_MEDIA_IMAGE_MAX) return
      mediaList.push({ url: String(entry.url).trim(), type: 'image', duration: 0 })
    }
  }

  const rawMedia = Array.isArray(media) && media.length ? media : null
  if (rawMedia) {
    for (const item of rawMedia) {
      if (item && typeof item === 'object') {
        pushMedia({
          url: item.url,
          type: item.type,
          duration: item.duration
        })
      } else {
        pushMedia({ url: item, type: 'image' })
      }
    }
  } else {
    for (const u of Array.isArray(images) ? images : []) {
      pushMedia({ url: u, type: isMomentVideoUrl(u) ? 'video' : 'image' })
    }
  }

  if (!text && mediaList.length === 0) throw new Error('请填写文字或添加图片/视频')
  if (text.length > 2000) throw new Error('说说内容过长')
  const visRaw = String(visibility || 'friends').trim().toLowerCase()
  const vis = visRaw === 'public' || visRaw === 'all' ? 'public' : 'friends'
  const [result] = await mysqlPool.query(
    `INSERT INTO moments (user_id, content, images_json, visibility)
     VALUES (?, ?, ?, ?)`,
    [uid, text, JSON.stringify(mediaList), vis]
  )
  const momentId = Number(result.insertId)
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.user_id AS userId, m.content, m.images_json AS imagesJson,
            m.visibility, m.created_at AS createdAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl
     FROM moments m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.id = ?
     LIMIT 1`,
    [momentId]
  )
  const created = mapMomentRow(rows[0])
  if (!created) throw new Error('发布失败')

  const author = await findUserById(uid)
  const authorName = author?.nickname || author?.username || '好友'
  const mentionIds = [
    ...new Set(
      (Array.isArray(mentionUserIds) ? mentionUserIds : [])
        .map((id) => Number(id))
        .filter((id) => id > 0 && id !== uid)
    )
  ].slice(0, 20)
  const notifiedUserIds = []
  for (const targetId of mentionIds) {
    if (!(await areFriends(uid, targetId))) continue
    await createNotification({
      userId: targetId,
      type: 'moment_mention',
      title: '说说@提醒',
      content: `${authorName}发的说说艾特了你，快去看看吧`,
      relatedId: momentId,
      actorUserId: uid
    })
    notifiedUserIds.push(targetId)
  }

  return {
    ...created,
    likedByMe: false,
    likes: [],
    comments: [],
    mentionedUserIds: notifiedUserIds
  }
}

export async function deleteMoment(userId, momentId) {
  assertConnected()
  const uid = Number(userId)
  const mid = Number(momentId)
  if (!uid || !mid) throw new Error('无效的参数')
  const [rows] = await mysqlPool.query(
    'SELECT id, user_id AS userId, images_json AS imagesJson FROM moments WHERE id = ? LIMIT 1',
    [mid]
  )
  if (!rows.length) throw new Error('说说不存在')
  if (Number(rows[0].userId) !== uid) {
    const err = new Error('只能删除自己的说说')
    err.status = 403
    throw err
  }
  const media = parseMomentMediaJson(rows[0].imagesJson)
  await mysqlPool.query('DELETE FROM moments WHERE id = ?', [mid])
  deleteMomentMediaFiles(media)
  return { id: mid }
}

/** 点赞/取消点赞 */
export async function toggleMomentLike(userId, momentId) {
  assertConnected()
  const { momentId: mid } = await assertCanInteractMoment(userId, momentId)
  const uid = Number(userId)
  const [exist] = await mysqlPool.query(
    'SELECT moment_id FROM moment_likes WHERE moment_id = ? AND user_id = ? LIMIT 1',
    [mid, uid]
  )
  if (exist.length) {
    await mysqlPool.query('DELETE FROM moment_likes WHERE moment_id = ? AND user_id = ?', [mid, uid])
    return { momentId: mid, liked: false }
  }
  await mysqlPool.query(
    'INSERT INTO moment_likes (moment_id, user_id) VALUES (?, ?)',
    [mid, uid]
  )
  return { momentId: mid, liked: true }
}

/** 发表评论 */
export async function createMomentComment(userId, momentId, { content = '', replyToUserId = null } = {}) {
  assertConnected()
  const { momentId: mid } = await assertCanInteractMoment(userId, momentId)
  const uid = Number(userId)
  assertUserRestrictionAllowed(uid, 'chatMute')
  const raw = String(content || '').trim()
  assertNoXssPayload(raw, { field: '评论', allowEmpty: false })
  const text = maskBannedWords(raw)
  if (!text) throw new Error('评论不能为空')
  if (text.length > 500) throw new Error('评论过长')
  let replyId = Number(replyToUserId) || null
  if (replyId) {
    const [ru] = await mysqlPool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [replyId])
    if (!ru.length) replyId = null
  }
  const [result] = await mysqlPool.query(
    `INSERT INTO moment_comments (moment_id, user_id, content, reply_to_user_id)
     VALUES (?, ?, ?, ?)`,
    [mid, uid, text, replyId]
  )
  const commentId = Number(result.insertId)
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.moment_id AS momentId, c.user_id AS userId, c.content,
            c.reply_to_user_id AS replyToUserId, c.created_at AS createdAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl,
            ru.username AS replyUsername, ru.nickname AS replyNickname
     FROM moment_comments c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN users ru ON ru.id = c.reply_to_user_id
     WHERE c.id = ?
     LIMIT 1`,
    [commentId]
  )
  const row = rows[0]
  if (!row) throw new Error('评论失败')
  const replyTo = Number(row.replyToUserId) || 0
  return {
    id: Number(row.id),
    momentId: Number(row.momentId),
    userId: Number(row.userId),
    content: String(row.content || ''),
    createdAt: row.createdAt,
    replyToUserId: replyTo || null,
    replyToUser: replyTo
      ? {
          id: replyTo,
          username: row.replyUsername || '',
          nickname: row.replyNickname || row.replyUsername || '用户'
        }
      : null,
    user: {
      id: Number(row.userId),
      username: row.username || '',
      nickname: row.nickname || row.username || '用户',
      avatarUrl: normalizeAvatarUrl(row.avatarUrl)
    }
  }
}

/** 删除评论：评论作者或说说作者 */
export async function deleteMomentComment(userId, commentId) {
  assertConnected()
  const uid = Number(userId)
  const cid = Number(commentId)
  if (!uid || !cid) throw new Error('无效的参数')
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.user_id AS userId, c.moment_id AS momentId, m.user_id AS momentOwnerId
     FROM moment_comments c
     INNER JOIN moments m ON m.id = c.moment_id
     WHERE c.id = ?
     LIMIT 1`,
    [cid]
  )
  if (!rows.length) throw new Error('评论不存在')
  const row = rows[0]
  if (Number(row.userId) !== uid && Number(row.momentOwnerId) !== uid) {
    const err = new Error('无权删除该评论')
    err.status = 403
    throw err
  }
  await mysqlPool.query('DELETE FROM moment_comments WHERE id = ?', [cid])
  return { id: cid, momentId: Number(row.momentId) }
}

/** 管理后台：全部用户 + 说说数量 */
export async function adminListMomentUsers({ keyword = '', limit = 100, offset = 0 } = {}) {
  assertConnected()
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const off = Math.max(Number(offset) || 0, 0)
  const kw = String(keyword || '').trim()
  const params = []
  let where = ''
  if (kw) {
    where = `WHERE (u.username LIKE ? OR u.nickname LIKE ? OR CAST(u.chat_no AS CHAR) LIKE ?)`
    const like = `%${kw}%`
    params.push(like, like, like)
  }
  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  )
  const total = Number(countRows[0]?.total) || 0
  const [rows] = await mysqlPool.query(
    `SELECT u.id, u.chat_no AS chatNo, u.username, u.nickname, u.avatar_url AS avatarUrl,
            COUNT(m.id) AS momentCount, MAX(m.created_at) AS lastMomentAt
     FROM users u
     LEFT JOIN moments m ON m.user_id = u.id
     ${where}
     GROUP BY u.id, u.chat_no, u.username, u.nickname, u.avatar_url
     ORDER BY momentCount DESC, u.id DESC
     LIMIT ? OFFSET ?`,
    [...params, lim, off]
  )
  return {
    total,
    list: rows.map((row) => ({
      id: Number(row.id),
      chatNo: row.chatNo ?? null,
      username: row.username || '',
      nickname: row.nickname || row.username || '用户',
      avatarUrl: normalizeAvatarUrl(row.avatarUrl),
      momentCount: Number(row.momentCount) || 0,
      lastMomentAt: row.lastMomentAt || null
    }))
  }
}

/** 管理后台：某用户全部说说 */
export async function adminListUserMoments(userId, { limit = 50, beforeId = 0 } = {}) {
  assertConnected()
  const tid = Number(userId)
  if (!tid) throw new Error('无效的用户')
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const before = Number(beforeId) || 0
  const params = [tid]
  let beforeSql = ''
  if (before > 0) {
    beforeSql = 'AND m.id < ?'
    params.push(before)
  }
  params.push(lim)
  const [rows] = await mysqlPool.query(
    `SELECT m.id, m.user_id AS userId, m.content, m.images_json AS imagesJson,
            m.visibility, m.created_at AS createdAt,
            u.username, u.nickname, u.avatar_url AS avatarUrl
     FROM moments m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.user_id = ?
       ${beforeSql}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  )
  return attachMomentInteractions(0, rows.map(mapMomentRow))
}

export async function adminDeleteMoment(momentId) {
  assertConnected()
  const mid = Number(momentId)
  if (!mid) throw new Error('无效的参数')
  const [rows] = await mysqlPool.query(
    'SELECT id, images_json AS imagesJson FROM moments WHERE id = ? LIMIT 1',
    [mid]
  )
  if (!rows.length) throw new Error('说说不存在')
  const media = parseMomentMediaJson(rows[0].imagesJson)
  await mysqlPool.query('DELETE FROM moments WHERE id = ?', [mid])
  deleteMomentMediaFiles(media)
  return { id: mid }
}

/** 管理后台：强制删除评论 */
export async function adminDeleteMomentComment(commentId) {
  assertConnected()
  const cid = Number(commentId)
  if (!cid) throw new Error('无效的参数')
  const [rows] = await mysqlPool.query(
    'SELECT id, moment_id AS momentId FROM moment_comments WHERE id = ? LIMIT 1',
    [cid]
  )
  if (!rows.length) throw new Error('评论不存在')
  await mysqlPool.query('DELETE FROM moment_comments WHERE id = ?', [cid])
  return { id: cid, momentId: Number(rows[0].momentId) }
}

/** 管理后台：移除某用户对说说的点赞 */
export async function adminDeleteMomentLike(momentId, userId) {
  assertConnected()
  const mid = Number(momentId)
  const uid = Number(userId)
  if (!mid || !uid) throw new Error('无效的参数')
  const [result] = await mysqlPool.query(
    'DELETE FROM moment_likes WHERE moment_id = ? AND user_id = ?',
    [mid, uid]
  )
  if (!result.affectedRows) throw new Error('点赞不存在')
  return { momentId: mid, userId: uid }
}

export function getMysqlPool() {
  assertConnected()
  return mysqlPool
}

export {
  listPublicChatRoomsForUser,
  listPublicChatRoomsForAdmin,
  listPublicVoiceMeetingHistory,
  createPublicChatRoom,
  updatePublicChatRoom,
  deletePublicChatRoom,
  archivePublicChatRoom,
  canControlPublicRoomMusic,
  joinPublicChatRoom,
  leavePublicChatRoomMember,
  getPublicRoomMultiChatContext,
  isPublicRoomConversation,
  assertPublicRoomMicAllowed,
  getPublicRoomMicBanDetails,
  assertCanModeratePublicRoom,
  banPublicRoomMic,
  unbanPublicRoomMic,
  getActiveMicBanUserIds,
  assertPublicRoomSlotAllowed,
  assertPublicRoomChatAllowed,
  banPublicRoomSlot,
  unbanPublicRoomSlot,
  getActiveRestrictionMap,
  createUserPublicVoiceRoom,
  endUserActiveEphemeralVoiceRoom,
  resolvePublicRoomHostAvatar
} from './publicChatRoomsDb.js'
