import fs from 'fs'
import path from 'path'
import { GROUP_FILE_DIR, GROUP_FILE_URL_PREFIX } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

export function listGroupFilesOnDisk() {
  if (!fs.existsSync(GROUP_FILE_DIR)) {
    return { dir: GROUP_FILE_DIR, list: [], totalSize: 0 }
  }
  const entries = fs.readdirSync(GROUP_FILE_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(GROUP_FILE_DIR, e.name)
      const stat = fs.statSync(filePath)
      return {
        filename: e.name,
        url: `${GROUP_FILE_URL_PREFIX}/${encodeURIComponent(e.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: GROUP_FILE_DIR, list, totalSize }
}

export function deleteGroupFileOnDisk(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(GROUP_FILE_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}

/**
 * Multer/busboy 常把 Content-Disposition 里的 UTF-8 文件名按 Latin-1 读入，
 * 导致中文变成 æ/å/Ã 等乱码。用 latin1→utf8 还原。
 */
export function decodeUploadFilename(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  // 已是正常中文/日文等
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(raw) && !/[ÃÂæåéè]/.test(raw)) {
    return raw
  }
  try {
    const fixed = Buffer.from(raw, 'latin1').toString('utf8')
    if (!fixed || fixed.includes('\uFFFD')) return raw
    if (
      /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(fixed) ||
      (/[^\x00-\x7F]/.test(raw) && fixed !== raw && !/[ÃÂ]/.test(fixed))
    ) {
      return fixed
    }
  } catch {
    // ignore
  }
  return raw
}

export function groupFileUrlToFilename(url) {
  const raw = String(url || '').trim().replace(/\\/g, '/')
  const prefix = `${GROUP_FILE_URL_PREFIX}/`
  if (!raw.startsWith(prefix)) return null
  try {
    return decodeURIComponent(raw.slice(prefix.length).split(/[?#]/)[0])
  } catch {
    return path.basename(raw.slice(prefix.length))
  }
}

/** 可能落在库里的 file_url 写法 */
export function groupFileUrlVariants(filename) {
  const safe = safeFilename(filename)
  if (!safe) return []
  return [
    `${GROUP_FILE_URL_PREFIX}/${safe}`,
    `${GROUP_FILE_URL_PREFIX}/${encodeURIComponent(safe)}`
  ]
}
