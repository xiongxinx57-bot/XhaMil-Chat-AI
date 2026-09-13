import { Router } from 'express'
import {
  loadConfig,
  getConfigMeta,
  saveConfig,
  getAdminEntryCode,
  getAdminEntryPath,
  getAdminIndexPath,
  getAdminLoginPath,
  getAdminLoginUrlAfterLogout,
  getAdminLogoutPath
} from '../config.js'
import { createSession, requireAdmin } from '../auth.js'
import {
  notifyUserBanned,
  notifyUserUnbanned,
  notifyNewMessage,
  notifyConversationUpdate,
  notifyGroupMentionRecipients,
  notifyGroupMultiChatClear,
  notifyGroupDissolved
} from '../realtime.js'
import { deleteChatVoiceFile, listChatVoiceFiles } from '../chatAudio.js'
import { deleteGroupFileOnDisk } from '../groupFiles.js'
import { deleteChatPhoto, deleteAllChatPhotos, listChatPhotos } from '../chatPhotos.js'
import { deleteChatVideo, deleteAllChatVideos, listChatVideos } from '../chatVideos.js'
import {
  deleteMomentsPhoto,
  deleteAllMomentsPhotos,
  listMomentsPhotos
} from '../momentsPhotos.js'
import { getClientIp, normalizeRegisterIp } from '../clientIp.js'
import { assertAllowedRegisterUsername, assertRegisterBurstLimit } from '../registerRateLimit.js'
import { fail, ok } from '../response.js'
import {
  exportJsonPack,
  importJsonPack,
  listJsonPackFiles,
  clearAllJsonPack,
  IMPORT_JSON_PACK_CONFIRM_PHRASE,
  CLEAR_JSON_PACK_CONFIRM_PHRASE
} from '../jsonPack.js'
import {
  checkDatabaseTables,
  clearAllDatabaseData,
  CLEAR_DATABASE_CONFIRM_PHRASE,
  getAdminDashboardOverview,
  getBrowseMeta,
  getBrowseTable,
  getDbStatus,
  getStorageInfo,
  initDatabaseTables,
  listUsersForAdmin,
  getUserDeviceForAdmin,
  listReportsForAdmin,
  clearReportsForAdmin,
  updateReportStatusForAdmin,
  moderateMomentReportForAdmin,
  moderateChatMuteReportForAdmin,
  smartScanReportForAdmin,
  isReportAiNoteAvailable,
  generateReportAdminNoteForAdmin,
  listRecentMessagesByUserIdForAdmin,
  listRecentSensitiveByUserIdForAdmin,
  createUserForAdmin,
  assertRegisterRateLimit,
  removeDatabaseConfig,
  setDatabaseConfig,
  setUserBanned,
  updateUserChatNoForAdmin,
  updateUserBadgeForAdmin,
  deleteUserById,
  deleteUsersByUsernamePrefix,
  deleteZombieUsers,
  deleteAvatarFileAdmin,
  listAvatarsForAdmin,
  listGroupFilesForAdmin,
  deleteGroupFileForAdmin,
  deleteAllGroupFilesForAdmin,
  deleteGroupById,
  getGroupAdminConfig,
  getGroupAiBotNamesByConversation,
  listGroupsForAdmin,
  getGroupMessagesForAdmin,
  setGroupBanned,
  setMaxOwnedGroupsPerUser,
  setUserGroupCreationBan,
  listGroupAnnouncementImagesForAdmin,
  deleteGroupAnnouncementImageForAdmin,
  testDatabaseConnection,
  listAiBotsForAdmin,
  createAiBot,
  updateAiBot,
  deleteAiBot,
  assignAiBotToGroupByCode,
  unassignAiBotFromGroup,
  unassignAiBotFromGroupByCode,
  testAiBotChat,
  adminListMomentUsers,
  adminListUserMoments,
  adminDeleteMoment,
  adminDeleteMomentComment,
  adminDeleteMomentLike,
  listPublicChatRoomsForAdmin,
  createPublicChatRoom,
  updatePublicChatRoom,
  deletePublicChatRoom
} from '../db.js'
import { getRoomSnapshot, forceEndRoom } from '../groupMultiChat.js'
import { setUserRestrictions, USER_RESTRICTION_KEYS } from '../userRestrictions.js'
import {
  getEmailSmtpConfigPublic,
  saveEmailSmtpConfig,
  testEmailSmtpSend
} from '../email.js'
import { listEmailTemplatesForAdmin } from '../emailTemplates.js'
import { normalizeMailLogoPath, resolveMailLogoUrl } from '../emailLogo.js'
import {
  getGeetestConfigPublic,
  hasGeetestSecrets,
  getPublicVerificationFlags,
  saveGeetestConfig,
  saveVerificationFlags,
  verifyGeetestFromRequestBody
} from '../geetest.js'
import {
  getAliyunSmsConfigPublic,
  saveAliyunSmsConfig
} from '../aliyunSms.js'
import {
  getAmapConfigPublic,
  saveAmapConfig
} from '../amap.js'
import { getFrontendBrandingPublic, saveFrontendBranding } from '../frontendBranding.js'
import {
  getGateGroupAdminConfig,
  getGateGroupStatus,
  enterGateGroup,
  saveGateGroupConfig
} from '../gateGroup.js'
import { getHelpSupportConfig, saveHelpSupportConfig } from '../helpSupport.js'
import { getAboutPageConfig, saveAboutPageConfig, aboutPageAvatarUrlFromFilename } from '../aboutPage.js'
import {
  applyUploadedAppRelease,
  deleteAppReleaseFile,
  deleteAllAppReleaseFiles,
  getAppUpdateConfig,
  listAppReleaseFiles,
  saveAppUpdateConfig,
  selectAppReleaseApk
} from '../appUpdate.js'
import {
  applyUploadedDownloadPageApk,
  deleteAllDownloadPageFiles,
  deleteDownloadPageFile,
  getDownloadPageConfig,
  listDownloadPageFiles,
  saveDownloadPageConfig,
  selectDownloadPageApk
} from '../downloadPage.js'
import { getPrivateCallConfig, savePrivateCallConfig } from '../privateCallConfig.js'
import { getBannedWordsConfig, saveBannedWordsConfig } from '../bannedWords.js'
import { getDrawGuessAssignedGroups, getDrawGuessConfig, saveDrawGuessConfig, assignDrawGuessGroupByCode, unassignDrawGuessGroup, unassignDrawGuessGroupByCode } from '../drawGuessConfig.js'
import { listOfficialIcons, replaceOfficialIconFile } from '../officialIcons.js'
import { uploadOfficialIcon, uploadUserAvatar, uploadAboutPageAvatar, uploadAppRelease, uploadDownloadPageApk, uploadDbJson } from '../upload.js'
import { avatarUrlFromFilename } from '../avatar.js'
import {
  createChangelogEntry,
  deleteChangelogEntry,
  listChangelogAdmin,
  updateChangelogEntry
} from '../changelog.js'

const router = Router()

async function adminUserCreateRateLimit(req, res, next) {
  try {
    assertRegisterBurstLimit(req, 'admin-users')
    const registerIp = normalizeRegisterIp(getClientIp(req))
    await assertRegisterRateLimit(registerIp)
    next()
  } catch (e) {
    return fail(res, e.status || 429, e.message || '注册过于频繁，请稍后再试')
  }
}

router.get('/verification-config', (req, res) => {
  const config = loadConfig()
  // 管理后台登录仅认 geetestEnabled 开关，与 /admin/login 校验一致
  return ok(res, {
    geetestEnabled: config.geetestEnabled === true,
    geetestConfigured: hasGeetestSecrets(config),
    geetestCaptchaId: String(config.geetestCaptchaId || '').trim(),
    turnstileEnabled: !!config.turnstile?.enabled,
    turnstileSiteKey: config.turnstile?.siteKey || ''
  })
})

router.post('/verification-config', requireAdmin, (req, res) => {
  try {
    const data = saveVerificationFlags(req.body || {})
    return ok(res, data, '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/login', async (req, res) => {
  const config = loadConfig()
  const { username, password } = req.body || {}

  if (config.geetestEnabled === true) {
    const gr = await verifyGeetestFromRequestBody(req.body)
    if (!gr.ok) return fail(res, 400, gr.message || '请先完成行为验证（极验）')
  } else if (config.turnstile?.enabled && config.turnstile?.secretKey) {
    const token = req.body?.turnstileToken
    if (!token) return fail(res, 400, '请先完成人机验证')
    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: config.turnstile.secretKey,
          response: token
        })
      })
      const verifyBody = await verifyRes.json()
      if (!verifyBody.success) return fail(res, 400, '人机验证失败')
    } catch {
      return fail(res, 500, '人机验证服务不可用')
    }
  }

  const adminUser = config.admin?.username || 'admin'
  const adminPass = config.admin?.password || 'admin123'
  if (username !== adminUser || password !== adminPass) {
    return fail(res, 400, '账号或密码错误，请核对 json/config.json 中的 admin 配置')
  }

  const token = createSession(username)
  return ok(res, { token, username })
})

router.get('/session', requireAdmin, (req, res) => {
  return ok(res, { valid: true, username: req.admin.username })
})

router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const data = await getAdminDashboardOverview()
    const entryPath = getAdminEntryPath()
    const indexPath = getAdminIndexPath()
    const loginPath = getAdminLoginPath()
    const loginUrl = getAdminLoginUrlAfterLogout()
    const logoutPath = getAdminLogoutPath()
    const host = req.get('host') || '127.0.0.1:5000'
    const proto = req.protocol || 'http'
    return ok(res, {
      ...data,
      adminEntry: {
        code: getAdminEntryCode(),
        path: entryPath,
        indexPath,
        loginPath,
        logoutPath,
        url: loginUrl ? `${proto}://${host}${loginUrl}` : ''
      }
    })
  } catch (e) {
    return fail(res, 500, e.message || '加载工作台数据失败')
  }
})

router.get('/database-config', requireAdmin, (req, res) => {
  return ok(res, getDbStatus())
})

router.post('/database-config', requireAdmin, async (req, res) => {
  try {
    const result = await setDatabaseConfig(req.body || {})
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.delete('/database-config', requireAdmin, async (req, res) => {
  try {
    const result = await removeDatabaseConfig()
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 500, e.message || '移除失败')
  }
})

router.post('/database-config/test', requireAdmin, async (req, res) => {
  try {
    const result = await testDatabaseConnection(req.body || {})
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '连接失败')
  }
})

router.get('/first-deploy/status', requireAdmin, async (req, res) => {
  try {
    const config = loadConfig()
    let completed = !!config.adminOnboarding?.completed
    const db = getDbStatus()
    let tablesReady = false
    if (db.isConnected) {
      try {
        const check = await checkDatabaseTables()
        tablesReady = Number(check.missingCount || 0) === 0
      } catch {
        tablesReady = false
      }
    }
    if (!completed && db.isConfigured && db.isConnected && tablesReady) {
      saveConfig({ adminOnboarding: { completed: true } })
      completed = true
    }
    return ok(res, {
      active: !completed,
      completed,
      isConfigured: db.isConfigured,
      isConnected: db.isConnected,
      tablesReady
    })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.post('/first-deploy/complete', requireAdmin, (req, res) => {
  saveConfig({ adminOnboarding: { completed: true } })
  return ok(res, { completed: true }, '首次部署教程已完成')
})

router.post('/first-deploy/reset', requireAdmin, async (req, res) => {
  try {
    await removeDatabaseConfig()
    saveConfig({ adminOnboarding: { completed: false } })
    return ok(
      res,
      { success: true },
      '已重置为首次部署模式：数据库连接配置已清空，MySQL 中的业务数据不受影响'
    )
  } catch (e) {
    return fail(res, 500, e.message || '重置失败')
  }
})

router.get('/storage-info', requireAdmin, async (req, res) => {
  try {
    const info = await getStorageInfo()
    return ok(res, { ...info, configMeta: getConfigMeta() })
  } catch (e) {
    return fail(res, 500, e.message || '加载存储信息失败')
  }
})

router.get('/database/check-tables', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    return ok(res, await checkDatabaseTables())
  } catch (e) {
    return fail(res, 500, e.message || '检测失败')
  }
})

router.post('/database/init-tables', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const result = await initDatabaseTables()
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 500, e.message || '建表失败')
  }
})

router.post('/database/clear-all', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const confirmText = String(req.body?.confirmText || '').trim()
    if (confirmText !== CLEAR_DATABASE_CONFIRM_PHRASE) {
      return fail(res, 400, '确认语不正确，请完整输入确认语句')
    }
    const result = await clearAllDatabaseData()
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 500, e.message || '清理失败')
  }
})

router.get('/database/export-json', requireAdmin, (req, res) => {
  try {
    const includeSecrets = String(req.query?.includeSecrets || '') === '1'
    const data = exportJsonPack({
      includeSecrets,
      files: req.query?.files
    })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const filename = `xhamil-json-pack-${stamp}.json`
    if (String(req.query?.download || '') === '1') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.status(200).send(JSON.stringify(data, null, 2))
    }
    return ok(res, { ...data, filename, localFiles: listJsonPackFiles() })
  } catch (e) {
    return fail(res, 400, e.message || '导出失败')
  }
})

router.get('/database/json-pack', requireAdmin, (_req, res) => {
  try {
    return ok(res, { files: listJsonPackFiles() })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.post('/database/json-pack/clear', requireAdmin, async (req, res) => {
  try {
    const confirmText = String(req.body?.confirmText || '').trim()
    if (confirmText !== CLEAR_JSON_PACK_CONFIRM_PHRASE) {
      return fail(res, 400, '确认语不正确，请完整输入确认语句')
    }
    const result = await clearAllJsonPack()
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '清理失败')
  }
})

router.post('/database/import-json', requireAdmin, (req, res) => {
  uploadDbJson.single('file')(req, res, async (err) => {
    if (err) {
      const msg = String(err.message || '')
      if (/File too large|LIMIT_FILE_SIZE/i.test(msg) || err.code === 'LIMIT_FILE_SIZE') {
        return fail(res, 400, 'JSON 文件过大（上限 128MB）')
      }
      return fail(res, 400, err.message || '上传失败')
    }
    try {
      const mode = String(req.body?.mode || 'replace').toLowerCase() === 'merge' ? 'merge' : 'replace'
      if (mode === 'replace') {
        const confirmText = String(req.body?.confirmText || '').trim()
        if (confirmText !== IMPORT_JSON_PACK_CONFIRM_PHRASE) {
          return fail(res, 400, '覆盖导入需输入正确确认语')
        }
      }

      let payload = null
      if (req.file?.buffer?.length) {
        try {
          payload = JSON.parse(req.file.buffer.toString('utf8'))
        } catch {
          return fail(res, 400, 'JSON 文件解析失败')
        }
      } else {
        payload = req.body?.data ?? req.body?.payload ?? null
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload)
          } catch {
            return fail(res, 400, 'JSON 解析失败')
          }
        }
      }
      if (!payload || typeof payload !== 'object') {
        return fail(res, 400, '请上传导出的配置包 JSON')
      }
      const result = await importJsonPack(payload, { mode })
      return ok(res, result, result.message)
    } catch (e) {
      return fail(res, 400, e.message || '导入失败')
    }
  })
})

router.get('/database/browse/meta', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    return ok(res, await getBrowseMeta())
  } catch (e) {
    return fail(res, 500, e.message || '加载表列表失败')
  }
})

router.get('/database/browse/table/:tableName', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const data = await getBrowseTable(req.params.tableName, limit, offset)
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载数据失败')
  }
})

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const list = await listUsersForAdmin()
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载用户失败')
  }
})

router.get('/users/:id/device', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const data = await getUserDeviceForAdmin(id)
    return ok(res, data)
  } catch (e) {
    return fail(res, e.status || 400, e.message || '加载设备信息失败')
  }
})

router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const data = await listReportsForAdmin({
      status: req.query?.status,
      limit: req.query?.limit,
      offset: req.query?.offset
    })
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载举报失败')
  }
})

router.post('/reports/clear', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const result = await clearReportsForAdmin({
      status: req.body?.status ?? req.query?.status ?? 'all'
    })
    return ok(res, result, result.cleared ? `已清除 ${result.cleared} 条举报` : '暂无举报可清除')
  } catch (e) {
    return fail(res, 400, e.message || '清除失败')
  }
})

router.patch('/reports/:id', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的举报 ID')
    const result = await updateReportStatusForAdmin(id, {
      status: req.body?.status,
      adminNote: req.body?.adminNote ?? req.body?.admin_note
    })
    if (result.notifyUserId) {
      notifyGroupMentionRecipients([result.notifyUserId])
    }
    return ok(res, result, result.notifyUserId ? '已驳回并通知举报人' : '已更新')
  } catch (e) {
    return fail(res, 400, e.message || '更新失败')
  }
})

router.post('/reports/:id/moderate-moment', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的举报 ID')
    const banRaw = req.body?.banDays
    const banDays =
      banRaw === null || banRaw === undefined || banRaw === ''
        ? null
        : Number(banRaw)
    const result = await moderateMomentReportForAdmin(id, {
      deleteMoment: !!req.body?.deleteMoment,
      banDays,
      status: req.body?.status || 'resolved',
      adminNote: req.body?.adminNote ?? req.body?.admin_note
    })
    if (result.notifyUserIds?.length) {
      notifyGroupMentionRecipients(result.notifyUserIds)
    }
    const tip = result.actions?.length ? result.actions.join('；') : '已处理'
    return ok(res, result, tip)
  } catch (e) {
    return fail(res, 400, e.message || '处理失败')
  }
})

router.post('/reports/:id/moderate-mute', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的举报 ID')
    const muteRaw = req.body?.muteDays ?? req.body?.banDays
    const muteDays =
      muteRaw === null || muteRaw === undefined || muteRaw === ''
        ? null
        : Number(muteRaw)
    const result = await moderateChatMuteReportForAdmin(id, {
      muteDays,
      status: req.body?.status || 'resolved',
      adminNote: req.body?.adminNote ?? req.body?.admin_note
    })
    if (result.notifyUserIds?.length) {
      notifyGroupMentionRecipients(result.notifyUserIds)
    }
    const tip = result.actions?.length ? result.actions.join('；') : '已处理'
    return ok(res, result, tip)
  } catch (e) {
    return fail(res, 400, e.message || '禁言失败')
  }
})

router.post('/reports/:id/smart-scan', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的举报 ID')
    const data = await smartScanReportForAdmin(id, {
      messageLimit: req.body?.messageLimit ?? req.query?.messageLimit,
      momentLimit: req.body?.momentLimit ?? req.query?.momentLimit
    })
    return ok(res, data)
  } catch (e) {
    return fail(res, 400, e.message || '智能检测失败')
  }
})

router.get('/reports/ai-note-status', requireAdmin, async (_req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const available = await isReportAiNoteAvailable()
    return ok(res, { available })
  } catch (e) {
    return fail(res, 500, e.message || '检查 AI 配置失败')
  }
})

router.post('/reports/:id/generate-note', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的举报 ID')
    const data = await generateReportAdminNoteForAdmin(id, req.body || {})
    return ok(res, data, '已生成')
  } catch (e) {
    return fail(res, 400, e.message || 'AI 生成失败')
  }
})

router.get('/users/:id/recent-messages', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const list = await listRecentMessagesByUserIdForAdmin(id, { limit: req.query?.limit })
    return ok(res, { list })
  } catch (e) {
    return fail(res, 400, e.message || '加载发言失败')
  }
})

router.get('/users/:id/sensitive', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const data = await listRecentSensitiveByUserIdForAdmin(id, { limit: req.query?.limit })
    return ok(res, data)
  } catch (e) {
    return fail(res, 400, e.message || '加载敏感内容失败')
  }
})

router.post('/users', adminUserCreateRateLimit, requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')

    const username = String(req.body?.username || req.body?.accountName || '').trim()
    assertAllowedRegisterUsername(username)
    const registerIp = normalizeRegisterIp(getClientIp(req))

    const user = await createUserForAdmin({
      username: req.body?.username,
      password: req.body?.password,
      nickname: req.body?.nickname,
      registerIp
    })
    return ok(res, { user }, '账户创建成功')
  } catch (e) {
    if (e?.code === 'USERNAME_TAKEN' || e?.code === 'EMAIL_TAKEN') {
      return fail(res, 409, e.message)
    }
    return fail(res, e.status || 400, e.message || '创建失败')
  }
})

router.patch('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const banned = !!req.body?.banned
    const result = await setUserBanned(id, banned)
    if (banned) await notifyUserBanned(id)
    else await notifyUserUnbanned(id)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '操作失败')
  }
})

router.patch('/users/:id/chat-no', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const chatNo = req.body?.chatNo ?? req.body?.chat_no
    const user = await updateUserChatNoForAdmin(id, chatNo)
    return ok(res, { user }, '聊聊号已更新')
  } catch (e) {
    return fail(res, 400, e.message || '更新失败')
  }
})

router.patch('/users/:id/badge', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const user = await updateUserBadgeForAdmin(id, {
      badges: req.body?.badges,
      badgeText: req.body?.badgeText ?? req.body?.badge_text,
      badgeColor: req.body?.badgeColor ?? req.body?.badge_color,
      clear: req.body?.clear === true
    })
    const count = Array.isArray(user.badges) ? user.badges.length : user.badgeText ? 1 : 0
    return ok(res, { user }, count ? `已设置 ${count} 个微标` : '微标已清除')
  } catch (e) {
    return fail(res, 400, e.message || '更新失败')
  }
})

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const result = await deleteUserById(id)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.post('/users/cleanup-by-prefix', requireAdmin, async (req, res) => {
  try {
    const prefix = String(req.body?.prefix || 'bot_').trim()
    const result = await deleteUsersByUsernamePrefix(prefix)
    return ok(res, result, `已删除 ${result.deleted}/${result.total} 个账号`)
  } catch (e) {
    return fail(res, 400, e.message || '清理失败')
  }
})

router.post('/users/cleanup-zombies', requireAdmin, async (req, res) => {
  try {
    const result = await deleteZombieUsers()
    return ok(res, result, `已清理 ${result.deleted} 个僵尸号`)
  } catch (e) {
    return fail(res, 400, e.message || '清理失败')
  }
})

router.patch('/users/:id/group-creation-ban', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const banned = !!req.body?.banned
    const result = setUserGroupCreationBan(id, banned)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '操作失败')
  }
})

router.patch('/users/:id/restrictions', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的用户 ID')
    const src =
      req.body?.restrictions && typeof req.body.restrictions === 'object'
        ? req.body.restrictions
        : req.body || {}
    const patch = {}
    for (const key of USER_RESTRICTION_KEYS) {
      if (src[key] !== undefined) patch[key] = !!src[key]
    }
    if (src.postMomentUntil !== undefined) patch.postMomentUntil = src.postMomentUntil
    if (src.postMomentPermanent !== undefined) patch.postMomentPermanent = !!src.postMomentPermanent
    if (src.chatMuteUntil !== undefined) patch.chatMuteUntil = src.chatMuteUntil
    if (src.chatMutePermanent !== undefined) patch.chatMutePermanent = !!src.chatMutePermanent
    if (patch.chatMute === false) {
      patch.chatMuteUntil = null
      patch.chatMutePermanent = false
    }
    if (patch.postMoment === false) {
      patch.postMomentUntil = null
      patch.postMomentPermanent = false
    }
    if (!Object.keys(patch).length) return fail(res, 400, '请至少选择一项限制')
    const result = setUserRestrictions(id, patch)
    return ok(res, result, '限制已更新')
  } catch (e) {
    return fail(res, 400, e.message || '操作失败')
  }
})

router.get('/chat/groups', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const [groups, aiByConv] = await Promise.all([
      listGroupsForAdmin(),
      getGroupAiBotNamesByConversation()
    ])
    const drawGuessIds = new Set(
      getDrawGuessAssignedGroups().map((item) => Number(item.conversationId)).filter(Boolean)
    )
    const cfg = loadConfig()
    const gateEnabled = cfg.gateGroupEnabled === true
    const gateCode = String(cfg.gateGroupCode || '').trim()

    const enriched = groups.map((group) => {
      const assignments = []
      if (drawGuessIds.has(Number(group.id))) assignments.push('你画我猜')
      const aiName = aiByConv.get(Number(group.id))
      if (aiName) assignments.push(`群 AI · ${aiName}`)
      if (gateEnabled && gateCode && String(group.groupCode || '').trim() === gateCode) {
        assignments.push('入群门禁')
      }
      return { ...group, assignments }
    })

    return ok(res, { ...getGroupAdminConfig(), groups: enriched })
  } catch (e) {
    return fail(res, 500, e.message || '加载群列表失败')
  }
})

router.get('/chat/group/:groupId/messages', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const groupId = Number(req.params.groupId)
    if (!groupId) return fail(res, 400, '无效的群 ID')
    const limit = Number(req.query.limit)
    const beforeId = req.query.beforeId != null && req.query.beforeId !== ''
      ? Number(req.query.beforeId)
      : null
    const result = await getGroupMessagesForAdmin(groupId, { limit, beforeId })
    return ok(res, result)
  } catch (e) {
    return fail(res, 400, e.message || '加载消息失败')
  }
})

router.post('/chat/max-owned-groups-per-user', requireAdmin, (req, res) => {
  try {
    const result = setMaxOwnedGroupsPerUser(req.body?.max)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/chat/group/ban', requireAdmin, async (req, res) => {
  try {
    const groupId = Number(req.body?.groupId)
    if (!groupId) return fail(res, 400, '无效的群 ID')
    const result = await setGroupBanned(groupId, true)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '封禁失败')
  }
})

router.post('/chat/group/unban', requireAdmin, async (req, res) => {
  try {
    const groupId = Number(req.body?.groupId)
    if (!groupId) return fail(res, 400, '无效的群 ID')
    const result = await setGroupBanned(groupId, false)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '解封失败')
  }
})

router.delete('/chat/group/:groupId', requireAdmin, async (req, res) => {
  try {
    const groupId = Number(req.params.groupId)
    if (!groupId) return fail(res, 400, '无效的群 ID')
    const result = await deleteGroupById(groupId)
    if (Array.isArray(result.memberIds) && result.memberIds.length) {
      notifyGroupDissolved(groupId, result.memberIds)
    }
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '解散失败')
  }
})

router.get('/chat-photos', requireAdmin, (req, res) => {
  try {
    const data = listChatPhotos()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载聊天图片失败')
  }
})

router.delete('/chat-photos', requireAdmin, (req, res) => {
  try {
    const result = deleteAllChatPhotos()
    return ok(res, result, `已删除 ${result.deleted} 个文件`)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/chat-photos/:filename', requireAdmin, (req, res) => {
  try {
    const result = deleteChatPhoto(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/chat-videos', requireAdmin, (req, res) => {
  try {
    const data = listChatVideos()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载聊天视频失败')
  }
})

router.delete('/chat-videos', requireAdmin, (req, res) => {
  try {
    const result = deleteAllChatVideos()
    return ok(res, result, `已删除 ${result.deleted} 个文件`)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/chat-videos/:filename', requireAdmin, (req, res) => {
  try {
    const result = deleteChatVideo(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/moments-photos', requireAdmin, (req, res) => {
  try {
    const data = listMomentsPhotos()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载说说图片失败')
  }
})

router.delete('/moments-photos', requireAdmin, (req, res) => {
  try {
    const result = deleteAllMomentsPhotos()
    return ok(res, result, `已删除 ${result.deleted} 个文件`)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/moments-photos/:filename', requireAdmin, (req, res) => {
  try {
    const result = deleteMomentsPhoto(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/group-announcement-images', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const data = await listGroupAnnouncementImagesForAdmin()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载群公告图片失败')
  }
})

router.delete('/group-announcement-images/:filename', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const result = await deleteGroupAnnouncementImageForAdmin(req.params.filename)
    return ok(res, result, '群公告图片已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/chat-voice', requireAdmin, (req, res) => {
  try {
    const data = listChatVoiceFiles()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载聊天语音失败')
  }
})

router.delete('/chat-voice/:filename', requireAdmin, (req, res) => {
  try {
    const result = deleteChatVoiceFile(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/group-files', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const data = await listGroupFilesForAdmin()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载群文件失败')
  }
})

router.delete('/group-files', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const result = await deleteAllGroupFilesForAdmin()
    return ok(res, result, `已删除 ${result.deleted} 个文件`)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/group-files/:filename', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) {
      const result = deleteGroupFileOnDisk(req.params.filename)
      return ok(res, result, '已删除')
    }
    const result = await deleteGroupFileForAdmin(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/avatars', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const data = await listAvatarsForAdmin()
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载头像失败')
  }
})

router.post('/avatars', requireAdmin, (req, res) => {
  uploadUserAvatar.single('avatar')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传头像文件')
      const avatarUrl = avatarUrlFromFilename(req.file.filename)
      return ok(res, { avatarUrl, filename: req.file.filename }, '上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传失败')
    }
  })
})

router.post('/about-page/avatar', requireAdmin, (req, res) => {
  uploadAboutPageAvatar.single('avatar')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传头像文件')
      const avatarUrl = aboutPageAvatarUrlFromFilename(req.file.filename)
      return ok(res, { avatarUrl, filename: req.file.filename }, '上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传失败')
    }
  })
})

router.delete('/avatars/:filename', requireAdmin, async (req, res) => {
  try {
    const status = getDbStatus()
    if (!status.isConnected) return fail(res, 400, '数据库未连接')
    const result = await deleteAvatarFileAdmin(req.params.filename)
    return ok(res, result, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/email-smtp-config', requireAdmin, (req, res) => {
  return ok(res, getEmailSmtpConfigPublic())
})

router.post('/email-smtp-config', requireAdmin, (req, res) => {
  try {
    const data = saveEmailSmtpConfig(req.body || {})
    return ok(res, data, '保存成功')
  } catch (e) {
    return fail(res, 500, e.message || '保存失败')
  }
})

router.post('/email-smtp-config/test-send', requireAdmin, async (req, res) => {
  try {
    await testEmailSmtpSend(req.body || {})
    return ok(res, null, '测试邮件已发送（内容为测试占位验证码）')
  } catch (e) {
    return fail(res, 400, e.message || '发送失败')
  }
})

router.get('/email-mail-templates', requireAdmin, (req, res) => {
  const cfg = loadConfig()
  const logoPath = normalizeMailLogoPath(req.query.logo ?? cfg.smtpMailLogo)
  const brand = String(req.query.brand ?? cfg.smtpFromName ?? 'XhaMil').trim()
  const previewOrigin = `${req.protocol}://${req.get('host')}`
  const logoUrl = resolveMailLogoUrl(logoPath, { previewOrigin })
  return ok(res, listEmailTemplatesForAdmin({ brand, logo: logoPath, logoUrl }))
})

router.get('/geetest-config', requireAdmin, (req, res) => {
  return ok(res, getGeetestConfigPublic())
})

router.post('/geetest-config', requireAdmin, (req, res) => {
  try {
    const data = saveGeetestConfig(req.body || {})
    return ok(res, data, '极验配置保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.get('/sms-aliyun-config', requireAdmin, (req, res) => {
  return ok(res, getAliyunSmsConfigPublic())
})

router.post('/sms-aliyun-config', requireAdmin, (req, res) => {
  try {
    const data = saveAliyunSmsConfig(req.body || {})
    return ok(res, data, '短信配置已保存')
  } catch (e) {
    return fail(res, e.status || 400, e.message || '保存失败')
  }
})

router.get('/amap-config', requireAdmin, (req, res) => {
  return ok(res, getAmapConfigPublic())
})

router.post('/amap-config', requireAdmin, (req, res) => {
  try {
    const data = saveAmapConfig(req.body || {})
    return ok(res, data, '位置服务配置已保存')
  } catch (e) {
    return fail(res, e.status || 400, e.message || '保存失败')
  }
})

router.get('/frontend-config', requireAdmin, (req, res) => {
  const branding = getFrontendBrandingPublic()
  // App 名称类字段不暴露给管理后台（卖方定制）
  const {
    appDisplayName: _a,
    appNavBarTitle: _b,
    appSplashTagline: _c,
    ...publicBranding
  } = branding
  return ok(res, {
    ...publicBranding,
    gateGroup: getGateGroupAdminConfig(),
    helpSupport: getHelpSupportConfig(),
    aboutPage: getAboutPageConfig(),
    privateCall: getPrivateCallConfig()
  })
})

router.post('/frontend-config', requireAdmin, async (req, res) => {
  try {
    const body = { ...(req.body || {}) }
    delete body.appDisplayName
    delete body.appNavBarTitle
    delete body.appSplashTagline
    const branding = saveFrontendBranding(body)
    let gateGroup = getGateGroupAdminConfig()
    if (body.gateGroup) {
      gateGroup = await saveGateGroupConfig(body.gateGroup)
    }
    let helpSupport = getHelpSupportConfig()
    if (body.helpSupport) {
      helpSupport = saveHelpSupportConfig(body.helpSupport)
    }
    let aboutPage = getAboutPageConfig()
    if (body.aboutPage) {
      aboutPage = saveAboutPageConfig(body.aboutPage)
    }
    let privateCall = getPrivateCallConfig()
    if (body.privateCall) {
      privateCall = savePrivateCallConfig(body.privateCall)
    }
    const {
      appDisplayName: _a,
      appNavBarTitle: _b,
      appSplashTagline: _c,
      ...publicBranding
    } = branding
    return ok(res, { ...publicBranding, gateGroup, helpSupport, aboutPage, privateCall }, '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.get('/app-update', requireAdmin, (req, res) => {
  return ok(res, {
    ...getAppUpdateConfig(),
    releases: listAppReleaseFiles()
  })
})

router.post('/app-update', requireAdmin, async (req, res) => {
  try {
    const data = await saveAppUpdateConfig(req.body || {})
    return ok(res, data, '已保存')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/app-update/apk', requireAdmin, (req, res) => {
  uploadAppRelease.single('apk')(req, res, async (err) => {
    if (err) {
      return fail(res, 400, err.message || '上传失败')
    }
    try {
      const filename = req.file?.filename
      if (!filename) return fail(res, 400, '请选择 APK 文件')
      const applied = await applyUploadedAppRelease(filename)
      const releases = listAppReleaseFiles()
      return ok(res, { ...applied, releases }, `已上传 · v${applied.versionName}`)
    } catch (e) {
      return fail(res, 400, e.message || '上传失败')
    }
  })
})

router.post('/app-update/select-apk', requireAdmin, async (req, res) => {
  try {
    const filename = req.body?.apkFilename
    if (!filename) return fail(res, 400, '请选择 APK')
    const applied = await selectAppReleaseApk(filename)
    return ok(res, applied.config, `已选用 v${applied.versionName}`)
  } catch (e) {
    return fail(res, 400, e.message || '选用失败')
  }
})

router.delete('/app-update/apk/:filename', requireAdmin, (req, res) => {
  try {
    const data = deleteAppReleaseFile(req.params.filename)
    return ok(res, { ...data, releases: listAppReleaseFiles() }, 'APK 已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/app-update/apk', requireAdmin, (req, res) => {
  try {
    const data = deleteAllAppReleaseFiles()
    return ok(res, data, `已清空 ${data.deleted} 个安装包`)
  } catch (e) {
    return fail(res, 400, e.message || '清空失败')
  }
})

/* ── 下载页安装包（与 App 热更新目录分离：media/Download Page） ── */
router.get('/download-page', requireAdmin, (_req, res) => {
  return ok(res, {
    ...getDownloadPageConfig(),
    releases: listDownloadPageFiles()
  })
})

router.post('/download-page', requireAdmin, async (req, res) => {
  try {
    const data = await saveDownloadPageConfig(req.body || {})
    return ok(res, data, '已保存')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/download-page/apk', requireAdmin, (req, res) => {
  uploadDownloadPageApk.single('apk')(req, res, async (err) => {
    if (err) {
      const msg = String(err.message || '')
      if (/File too large|LIMIT_FILE_SIZE/i.test(msg) || err.code === 'LIMIT_FILE_SIZE') {
        return fail(res, 400, '安装包过大（上限 512MB）')
      }
      return fail(res, 400, err.message || '上传失败')
    }
    try {
      const filename = req.file?.filename
      if (!filename) return fail(res, 400, '请选择 APK 文件')
      const applied = await applyUploadedDownloadPageApk(filename)
      const releases = listDownloadPageFiles()
      return ok(res, { ...applied, releases }, `已上传 · v${applied.versionName}`)
    } catch (e) {
      return fail(res, 400, e.message || '上传失败')
    }
  })
})

router.post('/download-page/select-apk', requireAdmin, async (req, res) => {
  try {
    const filename = req.body?.apkFilename
    if (!filename) return fail(res, 400, '请选择 APK')
    const applied = await selectDownloadPageApk(filename)
    return ok(res, applied.config, `已选用 v${applied.versionName}`)
  } catch (e) {
    return fail(res, 400, e.message || '选用失败')
  }
})

router.delete('/download-page/apk/:filename', requireAdmin, (req, res) => {
  try {
    const data = deleteDownloadPageFile(req.params.filename)
    return ok(res, { ...data, releases: listDownloadPageFiles() }, 'APK 已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/download-page/apk', requireAdmin, (req, res) => {
  try {
    const data = deleteAllDownloadPageFiles()
    return ok(res, data, `已清空 ${data.deleted} 个安装包`)
  } catch (e) {
    return fail(res, 400, e.message || '清空失败')
  }
})

/* ── 更新日志（关于页）路径勿含 changelog：宝塔 Nginx 会拦截 ── */
router.get('/update-log', requireAdmin, (_req, res) => {
  try {
    return ok(res, listChangelogAdmin())
  } catch (e) {
    return fail(res, 500, e.message || '加载更新日志失败')
  }
})

router.post('/update-log', requireAdmin, (req, res) => {
  try {
    const entry = createChangelogEntry(req.body || {})
    return ok(res, { entry }, '已新增')
  } catch (e) {
    return fail(res, 400, e.message || '新增失败')
  }
})

router.put('/update-log/:id', requireAdmin, (req, res) => {
  try {
    const entry = updateChangelogEntry(req.params.id, req.body || {})
    return ok(res, { entry }, '已保存')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.delete('/update-log/:id', requireAdmin, (req, res) => {
  try {
    deleteChangelogEntry(req.params.id)
    return ok(res, { ok: true }, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.get('/banned-words', requireAdmin, (req, res) => {
  const cfg = getBannedWordsConfig()
  return ok(res, {
    enabled: cfg.enabled,
    wordsText: loadConfig().bannedWordsText || '',
    maskChar: cfg.maskChar,
    wordCount: cfg.words.length,
    activePresetId: cfg.activePresetId
  })
})

router.post('/banned-words', requireAdmin, (req, res) => {
  try {
    const data = saveBannedWordsConfig(req.body || {})
    return ok(res, data, '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.get('/draw-guess-config', requireAdmin, (_req, res) => {
  return ok(res, getDrawGuessConfig())
})

router.post('/draw-guess-config', requireAdmin, (req, res) => {
  try {
    const data = saveDrawGuessConfig(req.body || {})
    return ok(res, data, '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/draw-guess-config/assign', requireAdmin, async (req, res) => {
  try {
    const groupCode = String(req.body?.groupCode || req.body?.group_code || '').trim()
    const result = await assignDrawGuessGroupByCode(groupCode)
    return ok(res, { ...getDrawGuessConfig(), ...result }, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '分配失败')
  }
})

router.post('/draw-guess-config/unassign', requireAdmin, async (req, res) => {
  try {
    const conversationId = Number(req.body?.conversationId)
    const groupCode = String(req.body?.groupCode || req.body?.group_code || '').trim()
    const result = conversationId
      ? await unassignDrawGuessGroup(conversationId)
      : await unassignDrawGuessGroupByCode(groupCode)
    return ok(res, { ...getDrawGuessConfig(), ...result }, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '取消分配失败')
  }
})

router.get('/official-icons', requireAdmin, async (_req, res) => {
  try {
    const icons = await listOfficialIcons()
    return ok(res, { dir: 'media/Official Images', icons })
  } catch (e) {
    return fail(res, 500, e.message || '获取图标列表失败')
  }
})

router.post('/official-icons/:filename', requireAdmin, (req, res) => {
  uploadOfficialIcon.single('icon')(req, res, async (err) => {
    if (err) {
      return fail(res, 400, err.message || '上传失败')
    }
    try {
      const icon = await replaceOfficialIconFile(req.params.filename, req.file?.path)
      return ok(res, { icon }, `已替换 ${icon.filename}`)
    } catch (e) {
      return fail(res, 400, e.message || '替换失败')
    }
  })
})

router.get('/ai-bots', requireAdmin, async (_req, res) => {
  try {
    const list = await listAiBotsForAdmin()
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载 AI 配置失败')
  }
})

router.get('/ai-bots/voices', requireAdmin, async (_req, res) => {
  try {
    const { listVoiceCatalog } = await import('../voiceCatalog.js')
    return ok(res, listVoiceCatalog())
  } catch (e) {
    return fail(res, 500, e.message || '加载音色失败')
  }
})

/** 后台试听音色：合成短句并返回 audioUrl */
router.post('/ai-bots/voices/preview', requireAdmin, async (req, res) => {
  try {
    const voiceId = String(req.body?.voiceId || req.body?.ttsVoiceId || '').trim()
    if (!voiceId) return fail(res, 400, '请先选择音色')
    const { normalizeTtsVoiceId, voiceLabelById } = await import('../voiceCatalog.js')
    const { synthesizeChatSpeech } = await import('../edgeTts.js')
    const id = normalizeTtsVoiceId(voiceId, { isAi: true })
    const sample = String(req.body?.text || '').trim() || '你好，我是你的聊天伙伴。'
    // 试听强制角色声（短句）；失败会自动回退神经音
    const result = await synthesizeChatSpeech(sample, {
      isAi: true,
      voiceId: id,
      forceGenshin: true
    })
    return ok(res, {
      ...result,
      voiceId: id,
      label: voiceLabelById(id),
      text: sample
    })
  } catch (e) {
    return fail(res, 500, e.message || '试听合成失败')
  }
})

router.post('/ai-bots', requireAdmin, async (req, res) => {
  try {
    const bot = await createAiBot(req.body || {})
    return ok(res, { bot }, 'AI 配置已创建')
  } catch (e) {
    return fail(res, 400, e.message || '创建失败')
  }
})

router.put('/ai-bots/:id', requireAdmin, async (req, res) => {
  try {
    const bot = await updateAiBot(req.params.id, req.body || {})
    return ok(res, { bot }, 'AI 配置已保存')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.delete('/ai-bots/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deleteAiBot(req.params.id)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.post('/ai-bots/test-chat', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const result = await testAiBotChat({
      botId: body.botId || body.id,
      message: body.message || body.content,
      history: body.history,
      draft: body.draft || null
    })
    return ok(res, result)
  } catch (e) {
    return fail(res, 400, e.message || '测试对话失败')
  }
})

router.post('/ai-bots/:id/test-chat', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const result = await testAiBotChat({
      botId: req.params.id,
      message: body.message || body.content,
      history: body.history,
      draft: body.draft || null
    })
    return ok(res, result)
  } catch (e) {
    return fail(res, 400, e.message || '测试对话失败')
  }
})

router.post('/ai-bots/:id/assign', requireAdmin, async (req, res) => {
  try {
    const groupCode = String(req.body?.groupCode || req.body?.group_code || '').trim()
    const result = await assignAiBotToGroupByCode(req.params.id, groupCode)
    if (result.butlerMessage && result.assignment?.conversationId) {
      const cid = result.assignment.conversationId
      await notifyNewMessage(cid, null, result.butlerMessage)
      const preview = String(result.butlerMessage.content || '此群已被分配 AI').slice(0, 80)
      await notifyConversationUpdate(cid, preview)
    }
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '分配失败')
  }
})

router.delete('/ai-bots/:id/assign/:conversationId', requireAdmin, async (req, res) => {
  try {
    const result = await unassignAiBotFromGroup(req.params.id, req.params.conversationId)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '取消分配失败')
  }
})

router.post('/ai-bots/:id/unassign', requireAdmin, async (req, res) => {
  try {
    const conversationId = Number(req.body?.conversationId)
    const groupCode = String(req.body?.groupCode || req.body?.group_code || '').trim()
    const result = conversationId
      ? await unassignAiBotFromGroup(req.params.id, conversationId)
      : await unassignAiBotFromGroupByCode(req.params.id, groupCode)
    return ok(res, result, result.message)
  } catch (e) {
    return fail(res, 400, e.message || '解除分配失败')
  }
})

router.get('/moments/users', requireAdmin, async (req, res) => {
  try {
    const data = await adminListMomentUsers({
      keyword: req.query.keyword,
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0
    })
    return ok(res, data)
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.get('/moments/users/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    if (!userId) return fail(res, 400, '无效的用户')
    const list = await adminListUserMoments(userId, {
      limit: Number(req.query.limit) || 50,
      beforeId: Number(req.query.beforeId) || 0
    })
    return ok(res, { list, userId })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.delete('/moments/comments/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const data = await adminDeleteMomentComment(id)
    return ok(res, data, '已删除评论')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/moments/:momentId/likes/:userId', requireAdmin, async (req, res) => {
  try {
    const momentId = Number(req.params.momentId)
    const userId = Number(req.params.userId)
    if (!momentId || !userId) return fail(res, 400, '无效的参数')
    const data = await adminDeleteMomentLike(momentId, userId)
    return ok(res, data, '已移除点赞')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

router.delete('/moments/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的参数')
    const data = await adminDeleteMoment(id)
    return ok(res, data, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

function enrichPublicChatRoomForAdmin(room) {
  const live = getRoomSnapshot(room.conversationId)
  const participants = Array.isArray(live?.participants) ? live.participants : []
  return {
    ...room,
    liveActive: !!live,
    liveParticipantCount: participants.length,
    liveOnMicCount: participants.filter((p) => p?.micOn).length,
    liveListenerCount: Number(live?.listenerCount) || 0,
    liveSessionId: live?.sessionId || ''
  }
}

router.get('/public-chat-rooms', requireAdmin, async (req, res) => {
  try {
    const list = (await listPublicChatRoomsForAdmin()).map(enrichPublicChatRoomForAdmin)
    return ok(res, { list })
  } catch (e) {
    return fail(res, 500, e.message || '加载失败')
  }
})

router.post('/public-chat-rooms', requireAdmin, async (req, res) => {
  try {
    const created = await createPublicChatRoom(req.body || {})
    return ok(res, enrichPublicChatRoomForAdmin(created), '创建成功')
  } catch (e) {
    return fail(res, 400, e.message || '创建失败')
  }
})

router.put('/public-chat-rooms/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的房间 ID')
    const updated = await updatePublicChatRoom(id, req.body || {})
    return ok(res, enrichPublicChatRoomForAdmin(updated), '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.delete('/public-chat-rooms/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return fail(res, 400, '无效的房间 ID')
    const rooms = await listPublicChatRoomsForAdmin()
    const target = rooms.find((r) => Number(r.id) === id)
    if (!target) return fail(res, 404, '聊天室不存在')
    const convId = Number(target.conversationId)
    const ended = forceEndRoom(convId)
    if (ended?.sessionId) {
      await notifyGroupMultiChatClear(convId, ended.sessionId)
    }
    const data = await deletePublicChatRoom(id)
    return ok(res, data, '已删除')
  } catch (e) {
    return fail(res, 400, e.message || '删除失败')
  }
})

/** 未匹配的管理接口返回 404，避免落到 /api 用户鉴权被当成 401 踢出后台登录 */
router.use((req, res) => {
  return fail(res, 404, '接口不存在')
})

export default router
