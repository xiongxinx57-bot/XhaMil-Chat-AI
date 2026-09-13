import fs from 'fs'
import path from 'path'
import { MOMENTS_IMAGE_DIR, MOMENTS_IMAGE_URL_PREFIX } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

export function momentsImageUrlToFilename(imageUrl) {
  const raw = String(imageUrl || '').trim().replace(/\\/g, '/')
  if (!raw) return null
  const prefixes = [MOMENTS_IMAGE_URL_PREFIX, '/media/Moments']
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

export function deleteMomentsPhotoByUrl(imageUrl) {
  const filename = momentsImageUrlToFilename(imageUrl)
  if (!filename) return false
  try {
    deleteMomentsPhoto(filename)
    return true
  } catch (e) {
    if (/不存在/.test(String(e.message || ''))) return false
    throw e
  }
}

export function deleteMomentsPhotosByUrls(urls) {
  const list = Array.isArray(urls) ? urls : []
  let deleted = 0
  for (const url of list) {
    if (deleteMomentsPhotoByUrl(url)) deleted += 1
  }
  return { deleted }
}

export function listMomentsPhotos() {
  if (!fs.existsSync(MOMENTS_IMAGE_DIR)) {
    return { dir: MOMENTS_IMAGE_DIR, list: [], totalSize: 0 }
  }
  const entries = fs.readdirSync(MOMENTS_IMAGE_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(MOMENTS_IMAGE_DIR, e.name)
      const stat = fs.statSync(filePath)
      return {
        filename: e.name,
        url: `${MOMENTS_IMAGE_URL_PREFIX}/${encodeURIComponent(e.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: MOMENTS_IMAGE_DIR, list, totalSize }
}

export function deleteMomentsPhoto(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(MOMENTS_IMAGE_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}

/** 删除目录下全部说说图片 */
export function deleteAllMomentsPhotos() {
  if (!fs.existsSync(MOMENTS_IMAGE_DIR)) return { deleted: 0 }
  let deleted = 0
  for (const name of fs.readdirSync(MOMENTS_IMAGE_DIR)) {
    const filePath = path.join(MOMENTS_IMAGE_DIR, name)
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
