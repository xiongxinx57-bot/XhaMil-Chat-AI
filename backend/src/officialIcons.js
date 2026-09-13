import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { OFFICIAL_IMAGES_DIR, officialImageUrl } from './config.js'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'])
const REPLACE_FILENAME_RE = /^[a-zA-Z0-9._\s-]+\.(png|jpg|jpeg|gif|webp|svg|ico)$/i

export function ensureOfficialImagesDir() {
  fs.mkdirSync(OFFICIAL_IMAGES_DIR, { recursive: true })
}

export async function listOfficialIcons() {
  ensureOfficialImagesDir()
  const entries = await fsp.readdir(OFFICIAL_IMAGES_DIR, { withFileTypes: true })
  const icons = []
  for (const entry of entries) {
    if (!entry?.isFile?.()) continue
    const filename = String(entry.name || '').trim()
    if (!filename) continue
    const ext = path.extname(filename).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue
    const absPath = path.join(OFFICIAL_IMAGES_DIR, filename)
    let stat = null
    try {
      stat = await fsp.stat(absPath)
    } catch {
      stat = null
    }
    icons.push({
      filename,
      path: absPath,
      url: officialImageUrl(filename),
      size: stat ? Number(stat.size || 0) : 0,
      mtime: stat?.mtime ? stat.mtime.toISOString() : ''
    })
  }
  icons.sort((a, b) => String(a.filename).localeCompare(String(b.filename)))
  return icons
}

export function validateOfficialIconFilename(filename) {
  const name = String(filename || '').trim()
  if (!name || !REPLACE_FILENAME_RE.test(name)) {
    throw new Error('非法文件名或不支持的扩展名')
  }
  return name
}

export function resolveOfficialIconTargetPath(filename) {
  const targetFilename = validateOfficialIconFilename(filename)
  const targetPath = path.resolve(OFFICIAL_IMAGES_DIR, targetFilename)
  const root = path.resolve(OFFICIAL_IMAGES_DIR)
  if (!targetPath.startsWith(root + path.sep) && targetPath !== root) {
    throw new Error('非法目标路径')
  }
  return { targetFilename, targetPath }
}

export async function replaceOfficialIconFile(filename, uploadedPath) {
  ensureOfficialImagesDir()
  const { targetFilename, targetPath } = resolveOfficialIconTargetPath(filename)
  const sourcePath = path.resolve(String(uploadedPath || ''))
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('未选择上传文件')
  }
  await fsp.copyFile(sourcePath, targetPath)
  if (sourcePath !== targetPath) {
    try {
      await fsp.unlink(sourcePath)
    } catch {
      /* ignore temp cleanup */
    }
  }
  return {
    filename: targetFilename,
    path: targetPath,
    url: `${OFFICIAL_IMAGES_URL_PREFIX}/${encodeURIComponent(targetFilename)}`
  }
}
