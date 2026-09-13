import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import {
  AVATAR_DIR,
  AVATAR_URL_PREFIX,
  DEFAULT_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
  LEGACY_GROUP_AVATAR_URL,
  LEGACY_DEFAULT_AVATAR_URL,
  MEDIA_DIR
} from './config.js'

const MOSAIC_SIZE = 132
const MOSAIC_GAP = 2
const MOSAIC_BG = '#dedede'
const TILE_FALLBACK = '#c8c8c8'

export function mosaicAvatarUrlForGroup(conversationId) {
  const id = Number(conversationId)
  return `${AVATAR_URL_PREFIX}/group-mosaic-${id}.webp`
}

export function mosaicLocalPathForGroup(conversationId) {
  const id = Number(conversationId)
  return path.join(AVATAR_DIR, `group-mosaic-${id}.webp`)
}

/** 是否为服务端生成的组合群头像 */
export function isGroupMosaicAvatar(url) {
  const v = String(url || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/')
  return /\/media\/avatar\/group-mosaic-\d+\.webp$/i.test(v)
}

/**
 * 群头像一律由系统维护（组合图），不可自定义上传。
 * 保留此函数供 refresh 判断；恒为 true。
 */
export function isAutoManagedGroupAvatar(_url) {
  return true
}

export function isPlaceholderGroupAvatar(url) {
  const v = String(url || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/')
  if (!v) return true
  return (
    v === DEFAULT_GROUP_AVATAR_URL ||
    v === LEGACY_GROUP_AVATAR_URL ||
    v === LEGACY_DEFAULT_AVATAR_URL ||
    v === DEFAULT_AVATAR_URL
  )
}

/**
 * 微信式格子：≤4 人按 2 列逻辑；5~9 人 3 列九宫格（含居中不完整行）。
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function mosaicRects(count, size = MOSAIC_SIZE, gap = MOSAIC_GAP) {
  const n = Math.min(9, Math.max(1, Number(count) || 1))
  const rects = []

  const cell = (cols) => (size - gap * (cols - 1)) / cols
  const push = (x, y, w, h) => {
    rects.push({
      x: Math.round(x),
      y: Math.round(y),
      w: Math.max(1, Math.round(w)),
      h: Math.max(1, Math.round(h))
    })
  }

  if (n === 1) {
    const m = Math.round(size * 0.06)
    push(m, m, size - m * 2, size - m * 2)
    return rects
  }

  if (n === 2) {
    const w = cell(2)
    const y = (size - w) / 2
    push(0, y, w, w)
    push(w + gap, y, w, w)
    return rects
  }

  if (n === 3) {
    const w = cell(2)
    push((size - w) / 2, 0, w, w)
    push(0, w + gap, w, w)
    push(w + gap, w + gap, w, w)
    return rects
  }

  if (n === 4) {
    const w = cell(2)
    for (let i = 0; i < 4; i++) {
      push((i % 2) * (w + gap), Math.floor(i / 2) * (w + gap), w, w)
    }
    return rects
  }

  // 5~9：3 列
  const w = cell(3)
  const rowSpecs =
    n === 5
      ? [2, 3]
      : n === 6
        ? [3, 3]
        : n === 7
          ? [1, 3, 3]
          : n === 8
            ? [2, 3, 3]
            : [3, 3, 3]
  const rows = rowSpecs.length
  const blockH = rows * w + (rows - 1) * gap
  let y = (size - blockH) / 2
  let idx = 0
  for (const colsInRow of rowSpecs) {
    const rowW = colsInRow * w + (colsInRow - 1) * gap
    let x = (size - rowW) / 2
    for (let c = 0; c < colsInRow; c++) {
      push(x, y, w, w)
      x += w + gap
      idx++
      if (idx >= n) return rects
    }
    y += w + gap
  }
  return rects
}

function mediaUrlToLocalPath(url) {
  let v = String(url || '')
    .trim()
    .split('?')[0]
    .replace(/\\/g, '/')
  if (!v) return null
  try {
    v = decodeURIComponent(v)
  } catch {
    /* keep */
  }
  if (!v.startsWith('/media/')) return null
  const rel = v.slice('/media/'.length)
  const parts = rel.split('/').filter(Boolean)
  if (!parts.length) return null
  return path.join(MEDIA_DIR, ...parts)
}

async function loadTileBuffer(url, tw, th) {
  const candidates = [url, DEFAULT_AVATAR_URL]
  for (const candidate of candidates) {
    const local = mediaUrlToLocalPath(candidate)
    try {
      if (local && fs.existsSync(local)) {
        return await sharp(local)
          .rotate()
          .resize(tw, th, { fit: 'cover', position: 'centre' })
          // 透明角铺底，避免拼进组合头像变黑边
          .flatten({ background: MOSAIC_BG })
          .png()
          .toBuffer()
      }
    } catch {
      /* try next */
    }
  }
  return sharp({
    create: {
      width: tw,
      height: th,
      channels: 3,
      background: TILE_FALLBACK
    }
  })
    .png()
    .toBuffer()
}

/**
 * 将成员头像 URL 列表拼成微信式组合图并写入 outPath。
 * @param {string[]} avatarUrls
 * @param {string} outPath
 */
export async function composeGroupMosaicToFile(avatarUrls, outPath) {
  const urls = (Array.isArray(avatarUrls) ? avatarUrls : []).slice(0, 9)
  if (!urls.length) {
    urls.push(DEFAULT_AVATAR_URL)
  }
  const rects = mosaicRects(urls.length, MOSAIC_SIZE, MOSAIC_GAP)
  const composites = []
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    const buf = await loadTileBuffer(urls[i] || DEFAULT_AVATAR_URL, r.w, r.h)
    composites.push({ input: buf, left: r.x, top: r.y })
  }

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
  const tmp = `${outPath}.${process.pid}.${Date.now()}.tmp.webp`
  await sharp({
    create: {
      width: MOSAIC_SIZE,
      height: MOSAIC_SIZE,
      channels: 3,
      background: MOSAIC_BG
    }
  })
    .composite(composites)
    .webp({ quality: 84 })
    .toFile(tmp)
  await fs.promises.rename(tmp, outPath)
}
