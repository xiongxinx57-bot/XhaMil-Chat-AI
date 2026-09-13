import fs from 'fs'
import path from 'path'
import { loadConfig, saveConfig, DOWNLOAD_PAGE_DIR, DOWNLOAD_PAGE_URL_PREFIX } from './config.js'
import { parseApkMeta } from './apkMeta.js'

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
  return `${DOWNLOAD_PAGE_URL_PREFIX}/${encoded}`
}

function resolveApkFile(filename) {
  const name = normalizeApkFilename(filename)
  if (!name) return null
  const full = path.join(DOWNLOAD_PAGE_DIR, name)
  if (!fs.existsSync(full)) return null
  return full
}

function normalizeVersionCode(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function normalizeVersionName(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

export function ensureDownloadPageDir() {
  fs.mkdirSync(DOWNLOAD_PAGE_DIR, { recursive: true })
  return DOWNLOAD_PAGE_DIR
}

export function listDownloadPageFiles() {
  ensureDownloadPageDir()
  const entries = fs.readdirSync(DOWNLOAD_PAGE_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.apk'))
    .map((e) => {
      const full = path.join(DOWNLOAD_PAGE_DIR, e.name)
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
  return { dir: 'media/Download Page', list, totalSize }
}

export function getDownloadPageConfig(config = loadConfig()) {
  const apkFilename = normalizeApkFilename(config.downloadPageApkFilename)
  return {
    enabled: config.downloadPageEnabled !== false,
    apkFilename,
    apkUrl: apkUrlFromFilename(apkFilename),
    versionCode: normalizeVersionCode(config.downloadPageVersionCode, 0),
    versionName: normalizeVersionName(config.downloadPageVersionName, ''),
    title: String(config.downloadPageTitle || '').trim(),
    subtitle: String(config.downloadPageSubtitle || '').trim(),
    pagePath: '/download/'
  }
}

/** 下载页公开接口：始终给最新选用的安装包（不与热更新 versionCode 比较） */
export function getDownloadPagePublic(config = loadConfig()) {
  const data = getDownloadPageConfig(config)
  const hasFile = Boolean(data.apkFilename && resolveApkFile(data.apkFilename))
  const show = data.enabled && hasFile
  return {
    enabled: data.enabled,
    show,
    versionName: data.versionName,
    latestVersionCode: data.versionCode,
    versionCode: data.versionCode,
    apkUrl: show ? data.apkUrl : '',
    apkFilename: show ? data.apkFilename : '',
    title: data.title,
    subtitle: data.subtitle
  }
}

export async function saveDownloadPageConfig(body = {}) {
  const current = getDownloadPageConfig()
  let apkFilename =
    body.apkFilename !== undefined
      ? normalizeApkFilename(body.apkFilename)
      : current.apkFilename
  let versionCode =
    body.versionCode !== undefined
      ? normalizeVersionCode(body.versionCode, current.versionCode)
      : current.versionCode
  let versionName =
    body.versionName !== undefined
      ? normalizeVersionName(body.versionName, current.versionName)
      : current.versionName

  if (apkFilename) {
    const full = resolveApkFile(apkFilename)
    if (!full) throw new Error('所选安装包不存在，请重新上传')
    const meta = await parseApkMeta(full)
    versionCode = meta.versionCode
    versionName = meta.versionName
  }

  const enabled = body.enabled !== undefined ? Boolean(body.enabled) : current.enabled
  const title =
    body.title !== undefined ? String(body.title || '').trim().slice(0, 80) : current.title
  const subtitle =
    body.subtitle !== undefined
      ? String(body.subtitle || '').trim().slice(0, 160)
      : current.subtitle

  if (enabled && (!apkFilename || !resolveApkFile(apkFilename))) {
    throw new Error('请先上传下载页使用的 APK')
  }

  saveConfig({
    downloadPageEnabled: enabled,
    downloadPageApkFilename: apkFilename,
    downloadPageVersionCode: versionCode,
    downloadPageVersionName: versionName,
    downloadPageTitle: title,
    downloadPageSubtitle: subtitle
  })
  return getDownloadPageConfig()
}

export async function applyUploadedDownloadPageApk(filename) {
  const name = normalizeApkFilename(filename)
  const full = resolveApkFile(name)
  if (!name || !full) throw new Error('APK 文件无效')
  const meta = await parseApkMeta(full)
  saveConfig({
    downloadPageApkFilename: name,
    downloadPageVersionCode: meta.versionCode,
    downloadPageVersionName: meta.versionName,
    downloadPageEnabled: true
  })
  return {
    filename: name,
    url: apkUrlFromFilename(name),
    versionCode: meta.versionCode,
    versionName: meta.versionName,
    packageName: meta.packageName,
    config: getDownloadPageConfig()
  }
}

export async function selectDownloadPageApk(filename) {
  return applyUploadedDownloadPageApk(filename)
}

export function deleteDownloadPageFile(filename) {
  const name = normalizeApkFilename(filename)
  if (!name) throw new Error('无效的文件名')
  const full = path.join(DOWNLOAD_PAGE_DIR, name)
  if (!fs.existsSync(full)) throw new Error('文件不存在')
  fs.unlinkSync(full)
  const current = getDownloadPageConfig()
  if (current.apkFilename === name) {
    saveConfig({
      downloadPageApkFilename: '',
      downloadPageVersionCode: 0,
      downloadPageVersionName: ''
    })
  }
  return { deleted: name }
}

export function deleteAllDownloadPageFiles() {
  ensureDownloadPageDir()
  const entries = fs.readdirSync(DOWNLOAD_PAGE_DIR, { withFileTypes: true })
  let deleted = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.apk')) continue
    fs.unlinkSync(path.join(DOWNLOAD_PAGE_DIR, entry.name))
    deleted += 1
  }
  saveConfig({
    downloadPageApkFilename: '',
    downloadPageVersionCode: 0,
    downloadPageVersionName: ''
  })
  return { deleted, releases: listDownloadPageFiles() }
}
