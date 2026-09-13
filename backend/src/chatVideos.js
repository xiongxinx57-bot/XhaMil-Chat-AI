import fs from 'fs'
import path from 'path'
import { CHAT_VIDEO_DIR, CHAT_VIDEO_URL_PREFIX, CHAT_MEDIA_RETENTION_MS } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

export function listChatVideos() {
  if (!fs.existsSync(CHAT_VIDEO_DIR)) {
    return { dir: CHAT_VIDEO_DIR, list: [], totalSize: 0 }
  }
  const entries = fs.readdirSync(CHAT_VIDEO_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(CHAT_VIDEO_DIR, e.name)
      const stat = fs.statSync(filePath)
      return {
        filename: e.name,
        url: `${CHAT_VIDEO_URL_PREFIX}/${encodeURIComponent(e.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: CHAT_VIDEO_DIR, list, totalSize }
}

export function deleteChatVideo(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(CHAT_VIDEO_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}

/** 删除目录下全部聊天视频 */
export function deleteAllChatVideos() {
  if (!fs.existsSync(CHAT_VIDEO_DIR)) return { deleted: 0 }
  let deleted = 0
  for (const name of fs.readdirSync(CHAT_VIDEO_DIR)) {
    const filePath = path.join(CHAT_VIDEO_DIR, name)
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

/** 按 mtime 清理超过保留期的聊天视频 */
export function purgeExpiredChatVideos(retentionMs = CHAT_MEDIA_RETENTION_MS) {
  if (!fs.existsSync(CHAT_VIDEO_DIR)) return { purged: 0 }
  const cutoff = Date.now() - Number(retentionMs || CHAT_MEDIA_RETENTION_MS)
  let purged = 0
  for (const name of fs.readdirSync(CHAT_VIDEO_DIR)) {
    const filePath = path.join(CHAT_VIDEO_DIR, name)
    try {
      const st = fs.statSync(filePath)
      if (!st.isFile()) continue
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
        purged += 1
      }
    } catch {
      // ignore
    }
  }
  return { purged }
}
