import fs from 'fs'
import path from 'path'
import { loadConfig, saveConfig, APP_RELEASE_DIR, APP_RELEASE_URL_PREFIX } from './config.js'
import { parseApkMeta } from './apkMeta.js'

export const APP_UPDATE_DIALOG_TYPES = ['update', 'notice', 'maintenance']
export const APP_UPDATE_CONTENT_MAX_LENGTH = 2000

const TEMPLATE_DEFAULTS = {
  update: {
    title: '发现新版本',
    content: '新版本已发布，建议立即更新以获得更好体验。',
    confirmText: '立即更新',
    cancelText: '稍后再说'
  },
  notice: {
    title: '系统通知',
    content: '',
    confirmText: '我知道了',
    cancelText: '关闭'
  },
  maintenance: {
    title: '维护公告',
    content: '系统将进行维护，部分功能可能暂时不可用。',
    confirmText: '我知道了',
    cancelText: '关闭'
  }
}

function normalizeDialogType(value) {
  const t = String(value || 'update').trim().toLowerCase()
  return APP_UPDATE_DIALOG_TYPES.includes(t) ? t : 'update'
}

function normalizeText(value, maxLen, fieldName) {
  const text = String(value ?? '').trim()
  if (text.length > maxLen) throw new Error(`${fieldName}最多 ${maxLen} 字`)
  return text
}

function normalizeVersionCode(value, fallback = 1) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

function normalizeVersionName(value, fallback = '1.0') {
  const s = String(value ?? '').trim()
  return s || fallback
}

function normalizeApkFilename(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  const base = path.basename(raw)
  if (!base.toLowerCase().endsWith('.apk')) return ''
  return base
}

function apkUrlFromFilename(filename) {
  const name = normalizeApkFilename(filename)
  if (!name) return ''
  const encoded = name.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${APP_RELEASE_URL_PREFIX}/${encoded}`
}

function resolveApkFile(filename) {
  const name = normalizeApkFilename(filename)
  if (!name) return null
  const full = path.join(APP_RELEASE_DIR, name)
  if (!fs.existsSync(full)) return null
  return full
}

/** 自动生成去重键：更新看 versionCode，通知看标题+内容 */
function computeDismissKey(data) {
  if (data.dialogType === 'update') {
    return `update:${data.latestVersionCode}`
  }
  const raw = `${data.dialogType}|${data.title}|${data.content}`
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  return `${data.dialogType}:${hash.toString(36)}`
}

export function listAppReleaseFiles() {
  fs.mkdirSync(APP_RELEASE_DIR, { recursive: true })
  const entries = fs.readdirSync(APP_RELEASE_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.apk'))
    .map((e) => {
      const full = path.join(APP_RELEASE_DIR, e.name)
      const stat = fs.statSync(full)
      return {
        filename: e.name,
        url: apkUrlFromFilename(e.name),
        size: stat.size,
        mtime: stat.mtimeMs
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: 'media/App Releases', list, totalSize }
}

export function getAppUpdateConfig(config = loadConfig()) {
  const dialogType = normalizeDialogType(config.appUpdateDialogType)
  const defaults = TEMPLATE_DEFAULTS[dialogType]
  const versionCode = normalizeVersionCode(config.appUpdateVersionCode, 1)
  const versionName = normalizeVersionName(config.appUpdateVersionName, '1.0')
  const apkFilename = normalizeApkFilename(config.appUpdateApkFilename)
  return {
    enabled: Boolean(config.appUpdateEnabled),
    dialogType,
    latestVersionCode: versionCode,
    versionName,
    apkFilename,
    apkUrl: apkUrlFromFilename(apkFilename),
    forceUpdate: Boolean(config.appUpdateForceUpdate),
    title: String(config.appUpdateTitle || defaults.title).trim() || defaults.title,
    content: String(config.appUpdateContent ?? defaults.content).trim(),
    confirmText: String(config.appUpdateConfirmText || defaults.confirmText).trim() || defaults.confirmText,
    cancelText: String(config.appUpdateCancelText || defaults.cancelText).trim() || defaults.cancelText,
    contentMaxLength: APP_UPDATE_CONTENT_MAX_LENGTH,
    templates: TEMPLATE_DEFAULTS
  }
}

function readClientVersionCode(req) {
  const header = req?.headers?.['x-app-version-code']
  const query = req?.query?.versionCode
  const raw = header ?? query ?? '0'
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Public payload for Android app startup check */
export function getAppUpdatePublic(req, config = loadConfig()) {
  const data = getAppUpdateConfig(config)
  const clientVersionCode = readClientVersionCode(req)
  const base = {
    enabled: data.enabled,
    show: false,
    dialogType: data.dialogType,
    promptId: computeDismissKey(data),
    latestVersionCode: data.latestVersionCode,
    versionName: data.versionName,
    apkUrl: data.apkUrl,
    forceUpdate: data.forceUpdate,
    title: data.title,
    content: data.content,
    confirmText: data.confirmText,
    cancelText: data.cancelText,
    clientVersionCode
  }

  if (!data.enabled) {
    return { ...base, enabled: false, show: false }
  }

  if (data.dialogType === 'update') {
    const hasApk = Boolean(data.apkUrl && resolveApkFile(data.apkFilename))
    const hasNewer = data.latestVersionCode > clientVersionCode
    const show = hasNewer && hasApk && Boolean(data.content || data.title)
    return {
      ...base,
      show,
      forceUpdate: show && data.forceUpdate
    }
  }

  const show = Boolean(data.title || data.content)
  return {
    ...base,
    show,
    forceUpdate: false,
    apkUrl: ''
  }
}

export async function saveAppUpdateConfig(body = {}) {
  const current = getAppUpdateConfig()
  const dialogType =
    body.dialogType !== undefined ? normalizeDialogType(body.dialogType) : current.dialogType
  const defaults = TEMPLATE_DEFAULTS[dialogType]

  let apkFilename =
    body.apkFilename !== undefined
      ? normalizeApkFilename(body.apkFilename)
      : current.apkFilename
  let latestVersionCode =
    body.latestVersionCode !== undefined
      ? normalizeVersionCode(body.latestVersionCode, current.latestVersionCode)
      : current.latestVersionCode
  let versionName =
    body.versionName !== undefined
      ? normalizeVersionName(body.versionName, current.versionName)
      : current.versionName

  if (dialogType === 'update' && apkFilename) {
    const full = resolveApkFile(apkFilename)
    if (full) {
      const meta = await parseApkMeta(full)
      latestVersionCode = meta.versionCode
      versionName = meta.versionName
    }
  }

  const enabled = body.enabled !== undefined ? Boolean(body.enabled) : current.enabled
  const forceUpdate =
    body.forceUpdate !== undefined ? Boolean(body.forceUpdate) : current.forceUpdate
  const title =
    body.title !== undefined
      ? normalizeText(body.title, 120, '标题')
      : current.title || defaults.title
  const content =
    body.content !== undefined
      ? normalizeText(body.content, APP_UPDATE_CONTENT_MAX_LENGTH, '内容')
      : current.content
  const confirmText =
    body.confirmText !== undefined
      ? normalizeText(body.confirmText, 40, '确认按钮')
      : current.confirmText || defaults.confirmText
  const cancelText =
    body.cancelText !== undefined
      ? normalizeText(body.cancelText, 40, '取消按钮')
      : current.cancelText || defaults.cancelText

  if (enabled && dialogType === 'update') {
    if (!apkFilename || !resolveApkFile(apkFilename)) {
      throw new Error('请先上传 APK 安装包')
    }
    if (!content && !title) {
      throw new Error('请写几句更新说明')
    }
  }

  if (enabled && dialogType !== 'update' && !content && !title) {
    throw new Error('请填写通知内容')
  }

  saveConfig({
    appUpdateEnabled: enabled,
    appUpdateDialogType: dialogType,
    appUpdateVersionCode: latestVersionCode,
    appUpdateVersionName: versionName,
    appUpdateApkFilename: apkFilename,
    appUpdateForceUpdate: forceUpdate,
    appUpdateTitle: title,
    appUpdateContent: content,
    appUpdateConfirmText: confirmText,
    appUpdateCancelText: cancelText
  })
  return getAppUpdateConfig()
}

export async function applyUploadedAppRelease(filename) {
  const name = normalizeApkFilename(filename)
  const full = resolveApkFile(name)
  if (!name || !full) {
    throw new Error('APK 文件无效')
  }
  const meta = await parseApkMeta(full)
  saveConfig({
    appUpdateApkFilename: name,
    appUpdateVersionCode: meta.versionCode,
    appUpdateVersionName: meta.versionName
  })
  return {
    filename: name,
    url: apkUrlFromFilename(name),
    versionCode: meta.versionCode,
    versionName: meta.versionName,
    packageName: meta.packageName,
    config: getAppUpdateConfig()
  }
}

export async function selectAppReleaseApk(filename) {
  const applied = await applyUploadedAppRelease(filename)
  return {
    ...applied,
    config: getAppUpdateConfig()
  }
}

export function deleteAppReleaseFile(filename) {
  const name = normalizeApkFilename(filename)
  if (!name) throw new Error('无效的文件名')
  const full = path.join(APP_RELEASE_DIR, name)
  if (!fs.existsSync(full)) throw new Error('文件不存在')
  fs.unlinkSync(full)
  const current = getAppUpdateConfig()
  if (current.apkFilename === name) {
    saveConfig({ appUpdateApkFilename: '' })
  }
  return { deleted: name }
}

export function deleteAllAppReleaseFiles() {
  fs.mkdirSync(APP_RELEASE_DIR, { recursive: true })
  const entries = fs.readdirSync(APP_RELEASE_DIR, { withFileTypes: true })
  let deleted = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.apk')) continue
    fs.unlinkSync(path.join(APP_RELEASE_DIR, entry.name))
    deleted += 1
  }
  saveConfig({ appUpdateApkFilename: '' })
  return { deleted, releases: listAppReleaseFiles() }
}
