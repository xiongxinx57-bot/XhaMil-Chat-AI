import fs from 'fs'
import path from 'path'
import { STICKER_DIR, STICKER_URL_PREFIX } from './config.js'
import { STICKER_IMAGE_EXTS } from './stickerImage.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  const ext = path.extname(base).toLowerCase()
  if (!STICKER_IMAGE_EXTS.has(ext)) return null
  return base
}

function safePackId(name) {
  const raw = String(name || '').trim()
  if (!raw || raw.includes('..') || /[\\/]/.test(raw)) return null
  return raw
}

function fileToItem(dirRel, filename) {
  const filePath = path.join(STICKER_DIR, dirRel || '', filename)
  const stat = fs.statSync(filePath)
  const urlPath = dirRel
    ? `${STICKER_URL_PREFIX}/${encodeURIComponent(dirRel)}/${encodeURIComponent(filename)}`
    : `${STICKER_URL_PREFIX}/${encodeURIComponent(filename)}`
  return {
    filename: dirRel ? `${dirRel}/${filename}` : filename,
    url: urlPath,
    size: stat.size,
    updatedAt: stat.mtime.toISOString()
  }
}

function listImageFiles(absDir) {
  if (!fs.existsSync(absDir)) return []
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((e) => e.isFile() && STICKER_IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
}

export function stickerUrlFromFilename(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  return `${STICKER_URL_PREFIX}/${encodeURIComponent(safe)}`
}

/** 根目录 = 官方表情包；子文件夹 = 其它表情包 */
export function listStickerPacks() {
  if (!fs.existsSync(STICKER_DIR)) {
    return { dir: STICKER_DIR, packs: [], list: [], totalSize: 0 }
  }

  const packs = []
  const rootFiles = listImageFiles(STICKER_DIR)
    .map((name) => fileToItem('', name))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

  if (rootFiles.length) {
    packs.push({
      id: 'official',
      name: '官方表情包',
      cover: rootFiles[0].url,
      list: rootFiles
    })
  }

  const entries = fs.readdirSync(STICKER_DIR, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const id = safePackId(e.name)
    if (!id) continue
    const files = listImageFiles(path.join(STICKER_DIR, id))
      .map((name) => fileToItem(id, name))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    if (!files.length) continue
    packs.push({
      id,
      name: id,
      cover: files[0].url,
      list: files
    })
  }

  const list = packs.flatMap((p) => p.list)
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: STICKER_DIR, packs, list, totalSize }
}

export function listStickers() {
  const data = listStickerPacks()
  return { dir: data.dir, list: data.list, totalSize: data.totalSize, packs: data.packs }
}

export function deleteSticker(filename) {
  const raw = String(filename || '').replace(/\\/g, '/').trim()
  if (!raw || raw.includes('..')) throw new Error('无效的文件名')
  const parts = raw.split('/').filter(Boolean)
  if (parts.length === 1) {
    const safe = safeFilename(parts[0])
    if (!safe) throw new Error('无效的文件名')
    const filePath = path.join(STICKER_DIR, safe)
    if (!fs.existsSync(filePath)) throw new Error('文件不存在')
    fs.unlinkSync(filePath)
    return { filename: safe }
  }
  if (parts.length === 2) {
    const pack = safePackId(parts[0])
    const safe = safeFilename(parts[1])
    if (!pack || !safe) throw new Error('无效的文件名')
    const filePath = path.join(STICKER_DIR, pack, safe)
    if (!fs.existsSync(filePath)) throw new Error('文件不存在')
    fs.unlinkSync(filePath)
    return { filename: `${pack}/${safe}` }
  }
  throw new Error('无效的文件名')
}
