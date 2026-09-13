import request from '@/utils/http'

function adminApi(path: string) {
  return `/api/admin${path}`
}

/** XhaMil Node /api/admin 业务 API */

export const xhamilApi = {
  getOverview() {
    return request.get<any>({ url: '/api/admin/overview' })
  },

  getSuperOverview() {
    return request.get<any>({ url: adminApi('/overview') })
  },

  /* ── 用户 ── */
  getUsers() {
    return request.get<{ list: any[] }>({ url: '/api/admin/users' })
  },
  getUserDevice(id: number) {
    return request.get<{ user: any; loginMeta: any; registerMeta: any }>({
      url: `/api/admin/users/${id}/device`
    })
  },
  createUser(body: Record<string, unknown>) {
    return request.post({ url: '/api/admin/users', params: body, showSuccessMessage: true })
  },
  updateUserRestrictions(id: number, restrictions: Record<string, unknown>) {
    return request.request({
      url: `/api/admin/users/${id}/restrictions`,
      method: 'PATCH',
      data: { restrictions },
      showSuccessMessage: true
    })
  },
  updateUserChatNo(id: number, chatNo: number | string) {
    return request.request({
      url: `/api/admin/users/${id}/chat-no`,
      method: 'PATCH',
      data: { chatNo },
      showSuccessMessage: true
    })
  },
  updateUserBadge(id: number, body: Record<string, unknown>) {
    return request.request({
      url: `/api/admin/users/${id}/badge`,
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    })
  },
  banUser(id: number, banned: boolean) {
    return request.request({
      url: `/api/admin/users/${id}/ban`,
      method: 'PATCH',
      data: { banned },
      showSuccessMessage: true
    })
  },
  deleteUser(id: number) {
    return request.del({ url: `/api/admin/users/${id}`, showSuccessMessage: true })
  },
  cleanupZombies() {
    return request.post({ url: '/api/admin/users/cleanup-zombies', showSuccessMessage: true })
  },
  getReports(params?: { status?: string; limit?: number; offset?: number }) {
    return request.get<{ list: any[]; total: number }>({
      url: '/api/admin/reports',
      params
    })
  },
  clearReports(status: string = 'all') {
    return request.post<{ cleared: number }>({
      url: '/api/admin/reports/clear',
      params: { status },
      data: { status },
      showSuccessMessage: true
    })
  },
  updateReport(id: number, body: { status: string; adminNote?: string }) {
    return request.request({
      url: `/api/admin/reports/${id}`,
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    })
  },
  moderateMomentReport(
    id: number,
    body: {
      deleteMoment?: boolean
      banDays?: number | null
      status?: string
      adminNote?: string
    }
  ) {
    return request.post<any>({
      url: `/api/admin/reports/${id}/moderate-moment`,
      params: body,
      data: body,
      showSuccessMessage: true
    })
  },
  moderateChatMuteReport(
    id: number,
    body: {
      muteDays: number
      status?: string
      adminNote?: string
    }
  ) {
    return request.post<any>({
      url: `/api/admin/reports/${id}/moderate-mute`,
      params: body,
      data: body,
      showSuccessMessage: true
    })
  },
  smartScanReport(id: number) {
    return request.post<any>({
      url: `/api/admin/reports/${id}/smart-scan`,
      data: {},
      showSuccessMessage: false
    })
  },
  getReportAiNoteStatus() {
    return request.get<{ available: boolean }>({
      url: '/api/admin/reports/ai-note-status'
    })
  },
  generateReportNote(
    id: number,
    body: {
      action?: 'mute' | 'moment' | 'general'
      detectionContext?: string
      scanSummary?: Record<string, unknown>
    }
  ) {
    return request.post<{ note: string; botName?: string }>({
      url: `/api/admin/reports/${id}/generate-note`,
      data: body,
      showSuccessMessage: false
    })
  },
  getUserRecentMessages(id: number, limit = 50) {
    return request.get<{ list: any[] }>({
      url: `/api/admin/users/${id}/recent-messages`,
      params: { limit }
    })
  },
  getUserSensitive(id: number, limit = 50) {
    return request.get<{ messages: any[]; moments: any[] }>({
      url: `/api/admin/users/${id}/sensitive`,
      params: { limit }
    })
  },

  /* ── 群聊 ── */
  getChatGroups() {
    return request.get<{ list?: any[]; groups?: any[]; maxOwnedGroupsPerUser?: number }>({
      url: '/api/admin/chat/groups'
    })
  },
  setMaxOwnedGroups(max: number) {
    return request.post({
      url: '/api/admin/chat/max-owned-groups-per-user',
      params: { max },
      showSuccessMessage: true
    })
  },
  banChatGroup(id: number) {
    return request.post({
      url: '/api/admin/chat/group/ban',
      params: { groupId: id },
      showSuccessMessage: true
    })
  },
  unbanChatGroup(id: number) {
    return request.post({
      url: '/api/admin/chat/group/unban',
      params: { groupId: id },
      showSuccessMessage: true
    })
  },
  deleteChatGroup(id: number) {
    return request.del({ url: `/api/admin/chat/group/${id}`, showSuccessMessage: true })
  },
  getChatGroupMessages(id: number, params?: { limit?: number; beforeId?: number }) {
    return request.get<{ list: any[]; hasMore?: boolean; group?: any }>({
      url: `/api/admin/chat/group/${id}/messages`,
      params
    })
  },

  /* ── 群 AI ── */
  getAiBots() {
    return request.get<{ list: any[] }>({ url: '/api/admin/ai-bots' })
  },
  getAiBotVoices() {
    return request.get<{ categories: string[]; list: any[]; groups: any[] }>({
      url: '/api/admin/ai-bots/voices'
    })
  },
  previewAiBotVoice(body: { voiceId: string; text?: string }) {
    return request.post<{
      audioUrl: string
      voiceId: string
      label: string
      engine?: string
      cached?: boolean
      text?: string
    }>({
      url: '/api/admin/ai-bots/voices/preview',
      params: body,
      showSuccessMessage: false,
      // 原神/崩坏公开模型排队可能较慢
      timeout: 70000
    })
  },
  createAiBot(body: Record<string, unknown>) {
    return request.post({ url: '/api/admin/ai-bots', params: body, showSuccessMessage: true })
  },
  updateAiBot(id: number, body: Record<string, unknown>) {
    return request.put({ url: `/api/admin/ai-bots/${id}`, params: body, showSuccessMessage: true })
  },
  deleteAiBot(id: number) {
    return request.del({ url: `/api/admin/ai-bots/${id}`, showSuccessMessage: true })
  },
  assignAiBot(id: number, groupCode: string) {
    return request.post({
      url: `/api/admin/ai-bots/${id}/assign`,
      params: { groupCode },
      showSuccessMessage: true
    })
  },
  unassignAiBot(id: number, conversationId: number) {
    return request.del({
      url: `/api/admin/ai-bots/${id}/assign/${conversationId}`,
      showSuccessMessage: true
    })
  },
  unassignAiBotByCode(id: number, groupCode: string) {
    return request.post({
      url: `/api/admin/ai-bots/${id}/unassign`,
      params: { groupCode },
      showSuccessMessage: true
    })
  },
  testAiBotChat(body: {
    botId?: number
    message: string
    history?: Array<{ role: string; content: string }>
    draft?: Record<string, unknown>
  }) {
    const id = Number(body.botId)
    return request.post<{ reply: string; botName: string; model: string }>({
      url: id > 0 ? `/api/admin/ai-bots/${id}/test-chat` : '/api/admin/ai-bots/test-chat',
      params: body,
      timeout: 90000,
      showErrorMessage: true,
      showSuccessMessage: false
    })
  },

  /* ── 媒体：聊天图 / 视频 / 说说图 ── */
  getChatPhotos() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/chat-photos'
    })
  },
  deleteChatPhoto(filename: string) {
    return request.del({
      url: `/api/admin/chat-photos/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  deleteAllChatPhotos() {
    return request.del<{ deleted: number }>({
      url: '/api/admin/chat-photos',
      showSuccessMessage: true
    })
  },
  getChatVideos() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/chat-videos'
    })
  },
  deleteChatVideo(filename: string) {
    return request.del({
      url: `/api/admin/chat-videos/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  deleteAllChatVideos() {
    return request.del<{ deleted: number }>({
      url: '/api/admin/chat-videos',
      showSuccessMessage: true
    })
  },
  getMomentsPhotos() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/moments-photos'
    })
  },
  deleteMomentsPhoto(filename: string) {
    return request.del({
      url: `/api/admin/moments-photos/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  deleteAllMomentsPhotos() {
    return request.del<{ deleted: number }>({
      url: '/api/admin/moments-photos',
      showSuccessMessage: true
    })
  },

  /* ── 头像 / 表情 / 公告图 / 语音 / 群文件 ── */
  getAvatars() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/avatars'
    })
  },
  uploadAvatar(file: File) {
    const fd = new FormData()
    fd.append('avatar', file)
    return request.post<{ avatarUrl: string; filename: string }>({
      url: '/api/admin/avatars',
      data: fd,
      showSuccessMessage: true
    })
  },
  uploadAboutPageAvatar(file: File) {
    const fd = new FormData()
    fd.append('avatar', file)
    return request.post<{ avatarUrl: string; filename: string }>({
      url: '/api/admin/about-page/avatar',
      data: fd,
      showSuccessMessage: true
    })
  },
  deleteAvatarFile(filename: string) {
    return request.del({
      url: `/api/admin/avatars/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  getGroupAnnouncementImages() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/group-announcement-images'
    })
  },
  deleteGroupAnnouncementImage(filename: string) {
    return request.del({
      url: `/api/admin/group-announcement-images/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  getChatVoiceFiles() {
    return request.get<{ dir: string; list: any[]; totalSize: number }>({
      url: '/api/admin/chat-voice'
    })
  },
  deleteChatVoiceFile(filename: string) {
    return request.del({
      url: `/api/admin/chat-voice/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  getGroupFiles() {
    return request.get<{
      dir: string
      list: any[]
      groups?: any[]
      fileCount?: number
      totalSize: number
    }>({ url: '/api/admin/group-files' })
  },
  deleteGroupFile(filename: string) {
    return request.del({
      url: `/api/admin/group-files/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  deleteAllGroupFiles() {
    return request.del<{ deleted: number }>({
      url: '/api/admin/group-files',
      showSuccessMessage: true
    })
  },

  /* ── 官方图标 ── */
  getOfficialIcons() {
    return request.get<{ dir: string; icons: any[] }>({ url: '/api/admin/official-icons' })
  },
  replaceOfficialIcon(filename: string, file: File) {
    const fd = new FormData()
    fd.append('icon', file)
    return request.post({
      url: `/api/admin/official-icons/${encodeURIComponent(filename)}`,
      data: fd,
      showSuccessMessage: true
    })
  },

  /* ── 说说 ── */
  getMomentUsers(params?: { keyword?: string; limit?: number; offset?: number }) {
    return request.get<{ total: number; list: any[] }>({
      url: '/api/admin/moments/users',
      params
    })
  },
  getUserMoments(userId: number, params?: { limit?: number; beforeId?: number }) {
    return request.get<{ list: any[]; userId: number }>({
      url: `/api/admin/moments/users/${userId}`,
      params
    })
  },
  deleteMoment(id: number) {
    return request.del({ url: `/api/admin/moments/${id}`, showSuccessMessage: true })
  },
  deleteMomentComment(id: number) {
    return request.del({
      url: `/api/admin/moments/comments/${id}`,
      showSuccessMessage: true
    })
  },
  deleteMomentLike(momentId: number, userId: number) {
    return request.del({
      url: `/api/admin/moments/${momentId}/likes/${userId}`,
      showSuccessMessage: true
    })
  },

  /* ── 数据库 ── */
  getDatabaseConfig() {
    return request.get<any>({ url: adminApi('/database-config') })
  },
  setDatabaseConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: adminApi('/database-config'),
      params: body,
      showSuccessMessage: true
    })
  },
  removeDatabaseConfig() {
    return request.del({ url: adminApi('/database-config'), showSuccessMessage: true })
  },
  testDatabaseConnection(body: Record<string, unknown>) {
    return request.post<any>({
      url: adminApi('/database-config/test'),
      params: body,
      showSuccessMessage: true
    })
  },
  getStorageInfo() {
    return request.get<any>({ url: adminApi('/storage-info') })
  },
  checkDatabaseTables() {
    return request.get<any>({ url: adminApi('/database/check-tables') })
  },
  initDatabaseTables() {
    return request.post<any>({
      url: adminApi('/database/init-tables'),
      showSuccessMessage: true
    })
  },
  clearAllDatabaseData(confirmText: string) {
    return request.post<any>({
      url: adminApi('/database/clear-all'),
      params: { confirmText },
      showSuccessMessage: true
    })
  },
  exportDatabaseJson(opts?: { includeSecrets?: boolean }) {
    return request.get<any>({
      url: adminApi('/database/export-json'),
      params: opts?.includeSecrets ? { includeSecrets: '1' } : undefined,
      timeout: 60000
    })
  },
  getJsonPackMeta() {
    return request.get<any>({ url: adminApi('/database/json-pack') })
  },
  clearJsonPack(confirmText: string) {
    return request.post<any>({
      url: adminApi('/database/json-pack/clear'),
      params: { confirmText },
      showSuccessMessage: true
    })
  },
  importDatabaseJson(body: {
    file: File | Blob
    mode: 'replace' | 'merge'
    confirmText?: string
  }) {
    const fd = new FormData()
    fd.append('file', body.file, body.file instanceof File ? body.file.name : 'import.json')
    fd.append('mode', body.mode)
    if (body.confirmText) fd.append('confirmText', body.confirmText)
    return request.post<any>({
      url: adminApi('/database/import-json'),
      data: fd,
      showSuccessMessage: true,
      timeout: 60000
    })
  },
  getDatabaseBrowseMeta() {
    return request.get<any>({ url: adminApi('/database/browse/meta') })
  },
  getDatabaseBrowseTable(tableName: string, params?: { limit?: number; offset?: number }) {
    return request.get<any>({
      url: `${adminApi('/database/browse/table')}/${encodeURIComponent(tableName)}`,
      params
    })
  },

  /* ── 邮箱 / 极验 ── */
  getEmailSmtpConfig() {
    return request.get<any>({ url: adminApi('/email-smtp-config') })
  },
  saveEmailSmtpConfig(body: Record<string, unknown>) {
    return request.post({
      url: adminApi('/email-smtp-config'),
      params: body,
      showSuccessMessage: true
    })
  },
  testEmailSmtp(body?: Record<string, unknown>) {
    return request.post({
      url: adminApi('/email-smtp-config/test-send'),
      params: body || {},
      showSuccessMessage: true
    })
  },
  getEmailMailTemplates(params?: { logo?: string; brand?: string }) {
    return request.get<
      Array<{ id: string; name: string; description: string; previewHtml: string }>
    >({
      url: adminApi('/email-mail-templates'),
      params
    })
  },
  getGeetestConfig() {
    return request.get<any>({ url: adminApi('/geetest-config') })
  },
  saveGeetestConfig(body: Record<string, unknown>) {
    return request.post({
      url: adminApi('/geetest-config'),
      params: body,
      showSuccessMessage: true
    })
  },
  getVerificationConfig() {
    return request.get<any>({ url: adminApi('/verification-config') })
  },
  saveVerificationConfig(body: Record<string, unknown>) {
    return request.post({
      url: adminApi('/verification-config'),
      params: body,
      showSuccessMessage: true
    })
  },
  getSmsAliyunConfig() {
    return request.get<any>({ url: adminApi('/sms-aliyun-config') })
  },
  saveSmsAliyunConfig(body: Record<string, unknown>) {
    return request.post({
      url: adminApi('/sms-aliyun-config'),
      params: body,
      showSuccessMessage: true
    })
  },
  getAmapConfig() {
    return request.get<any>({ url: adminApi('/amap-config') })
  },
  saveAmapConfig(body: Record<string, unknown>) {
    return request.post({
      url: adminApi('/amap-config'),
      params: body,
      showSuccessMessage: true
    })
  },

  /* ── 功能性开发 / 违禁词 / 公告 / 画猜 ── */
  getFrontendConfig() {
    return request.get<any>({ url: '/api/admin/frontend-config' })
  },
  setFrontendConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: '/api/admin/frontend-config',
      params: body,
      showSuccessMessage: true
    })
  },
  getBannedWordsConfig() {
    return request.get<any>({ url: '/api/admin/banned-words' })
  },
  setBannedWordsConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: '/api/admin/banned-words',
      params: body,
      showSuccessMessage: true
    })
  },
  getAppUpdateConfig() {
    return request.get<any>({ url: '/api/admin/app-update' })
  },
  saveAppUpdateConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: '/api/admin/app-update',
      params: body,
      showSuccessMessage: true
    })
  },
  uploadAppReleaseApk(file: File) {
    const fd = new FormData()
    fd.append('apk', file)
    return request.post<any>({
      url: '/api/admin/app-update/apk',
      data: fd,
      showSuccessMessage: true
    })
  },
  selectAppReleaseApk(filename: string) {
    return request.post<any>({
      url: '/api/admin/app-update/select-apk',
      params: { apkFilename: filename },
      showSuccessMessage: true
    })
  },
  deleteAllAppReleaseApks() {
    return request.del<any>({
      url: '/api/admin/app-update/apk',
      showSuccessMessage: true
    })
  },
  getDownloadPageConfig() {
    return request.get<any>({ url: '/api/admin/download-page' })
  },
  saveDownloadPageConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: '/api/admin/download-page',
      params: body,
      showSuccessMessage: true
    })
  },
  uploadDownloadPageApk(file: File) {
    const fd = new FormData()
    fd.append('apk', file)
    return request.post<any>({
      url: '/api/admin/download-page/apk',
      data: fd,
      showSuccessMessage: true
    })
  },
  selectDownloadPageApk(filename: string) {
    return request.post<any>({
      url: '/api/admin/download-page/select-apk',
      params: { apkFilename: filename },
      showSuccessMessage: true
    })
  },
  deleteDownloadPageApk(filename: string) {
    return request.del<any>({
      url: `/api/admin/download-page/apk/${encodeURIComponent(filename)}`,
      showSuccessMessage: true
    })
  },
  clearDownloadPageApks() {
    return request.del<any>({
      url: '/api/admin/download-page/apk',
      showSuccessMessage: true
    })
  },
  getChangelog() {
    return request.get<{ list: any[] }>({ url: '/api/admin/update-log' })
  },
  createChangelog(body: Record<string, unknown>) {
    return request.post<{ entry: any }>({
      url: '/api/admin/update-log',
      params: body,
      showSuccessMessage: true
    })
  },
  updateChangelog(id: string, body: Record<string, unknown>) {
    return request.put<{ entry: any }>({
      url: `/api/admin/update-log/${encodeURIComponent(id)}`,
      params: body,
      showSuccessMessage: true
    })
  },
  deleteChangelog(id: string) {
    return request.del({
      url: `/api/admin/update-log/${encodeURIComponent(id)}`,
      showSuccessMessage: true
    })
  },
  getDrawGuessConfig() {
    return request.get<any>({ url: '/api/admin/draw-guess-config' })
  },
  setDrawGuessConfig(body: Record<string, unknown>) {
    return request.post<any>({
      url: '/api/admin/draw-guess-config',
      params: body,
      showSuccessMessage: true
    })
  },
  assignDrawGuessGroup(groupCode: string) {
    return request.post<any>({
      url: '/api/admin/draw-guess-config/assign',
      params: { groupCode },
      showSuccessMessage: true
    })
  },
  unassignDrawGuessGroup(payload: { conversationId?: number; groupCode?: string }) {
    return request.post<any>({
      url: '/api/admin/draw-guess-config/unassign',
      params: payload,
      showSuccessMessage: true
    })
  },

  getPublicVoiceRooms() {
    return request.get<{ list: PublicVoiceRoomItem[] }>({ url: '/api/admin/public-chat-rooms' })
  },
  createPublicVoiceRoom(body: Record<string, unknown>) {
    return request.post<PublicVoiceRoomItem>({
      url: '/api/admin/public-chat-rooms',
      data: body,
      showSuccessMessage: true
    })
  },
  updatePublicVoiceRoom(id: number, body: Record<string, unknown>) {
    return request.request({
      url: `/api/admin/public-chat-rooms/${id}`,
      method: 'PUT',
      data: body,
      showSuccessMessage: true
    })
  },
  deletePublicVoiceRoom(id: number) {
    return request.del({ url: `/api/admin/public-chat-rooms/${id}`, showSuccessMessage: true })
  }
}

export interface PublicVoiceRoomItem {
  id: number
  title: string
  entryHint?: string
  roomType?: string
  backgroundUrl?: string
  iconUrl?: string
  hasPassword?: boolean
  conversationId?: number
  maxCapacity?: number
  memberCount?: number
  sortOrder?: number
  enabled?: boolean
  creatorUserId?: number | null
  creatorNickname?: string
  isEphemeral?: boolean
  liveActive?: boolean
  liveParticipantCount?: number
  liveOnMicCount?: number
  liveListenerCount?: number
  liveSessionId?: string
  createdAt?: string
  updatedAt?: string
}





