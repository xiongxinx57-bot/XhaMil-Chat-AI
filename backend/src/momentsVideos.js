import fs from 'fs'
import path from 'path'
import { MOMENTS_VIDEO_DIR, MOMENTS_VIDEO_URL_PREFIX } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

export function momentsVideoUrlToFilename(videoUrl) {
  const raw = String(videoUrl || '').trim().replace(/\\/g, '/')
  if (!raw) return null
  const prefixes = [MOMENTS_VIDEO_URL_PREFIX, '/media/Moments Videos']
  for (const prefix of prefixes) {
    if (!raw.startsWith(prefix + '/') && raw !== prefix) continue
    const rest = raw.slice(prefix.length).replace(/^\/+/, '')
    if (!rest) return null
    try {
      return safeFilename(decodeURIComponent(rest))
    } catch {
      return safeFilename(rest)
    }
  }
  return null
}

export function deleteMomentsVideo(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(MOMENTS_VIDEO_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}

export function deleteMomentsVideoByUrl(videoUrl) {
  const filename = momentsVideoUrlToFilename(videoUrl)
  if (!filename) return false
  try {
    deleteMomentsVideo(filename)
    return true
  } catch (e) {
    if (/不存在/.test(String(e.message || ''))) return false
    throw e
  }
}
