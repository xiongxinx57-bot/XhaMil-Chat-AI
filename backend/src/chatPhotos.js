import fs from 'fs'
import path from 'path'
import { CHAT_IMAGE_DIR, CHAT_IMAGE_URL_PREFIX, CHAT_MEDIA_RETENTION_MS } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

export function listChatPhotos() {
  if (!fs.existsSync(CHAT_IMAGE_DIR)) {
    return { dir: CHAT_IMAGE_DIR, list: [], totalSize: 0 }
  }
  const entries = fs.readdirSync(CHAT_IMAGE_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(CHAT_IMAGE_DIR, e.name)
      const stat = fs.statSync(filePath)
      return {
        filename: e.name,
        url: `${CHAT_IMAGE_URL_PREFIX}/${encodeURIComponent(e.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: CHAT_IMAGE_DIR, list, totalSize }
}

export function deleteChatPhoto(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(CHAT_IMAGE_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}

/** 删除目录下全部聊天图片 */
export function deleteAllChatPhotos() {
  if (!fs.existsSync(CHAT_IMAGE_DIR)) return { deleted: 0 }
  let deleted = 0
  for (const name of fs.readdirSync(CHAT_IMAGE_DIR)) {
    const filePath = path.join(CHAT_IMAGE_DIR, name)
    try {
      const st = fs.statSync(filePath)
      if (!st.isFile()) continue
      fs.unlinkSync(filePath)
      deleted += 1
    } catch {
      // ignore
    }
  }
  return { deleted }
}

/** 按 mtime 清理超过保留期的聊天图片（贴纸缓存等同目录，一并清理） */
export function purgeExpiredChatPhotos(retentionMs = CHAT_MEDIA_RETENTION_MS) {
  if (!fs.existsSync(CHAT_IMAGE_DIR)) return { purged: 0 }
  const cutoff = Date.now() - Number(retentionMs || CHAT_MEDIA_RETENTION_MS)
  let purged = 0
  for (const name of fs.readdirSync(CHAT_IMAGE_DIR)) {
    const filePath = path.join(CHAT_IMAGE_DIR, name)
    try {
      const st = fs.statSync(filePath)
      if (!st.isFile()) continue
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
        purged += 1
      }
    } catch {
      // ignore single-file errors
    }
  }
  return { purged }
}
