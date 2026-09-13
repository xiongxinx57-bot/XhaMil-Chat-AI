import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import {
  AVATAR_FRAME_DIR,
  AVATAR_FRAME_URL_PREFIX,
  DEFAULT_AVATAR_FRAME_FILENAME,
  DEFAULT_AVATAR_FRAME_URL,
  LEGACY_DEFAULT_AVATAR_FRAME_URL,
  OFFICIAL_IMAGES_DIR,
  canonicalizeAvatarFrameUrl
} from './config.js'

export { DEFAULT_AVATAR_FRAME_FILENAME, DEFAULT_AVATAR_FRAME_URL, LEGACY_DEFAULT_AVATAR_FRAME_URL }

export const AVATAR_FRAME_IMAGE_EXTS = new Set(['.png', '.webp'])

const ALPHA_HOLE_THRESHOLD = 50
const ALPHA_OPAQUE_THRESHOLD = 128

function frameExtFromName(name, mimetype = '') {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (AVATAR_FRAME_IMAGE_EXTS.has(ext)) return ext
  const mime = String(mimetype || '').toLowerCase()
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.png'
}

function buildFrameFilename(ext) {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `frame-${uniqueSuffix}${ext}`
}

export function frameUrlFromFilename(filename) {
  const safe = path.basename(String(filename || ''))
  if (!safe || safe.includes('..') || /[\\/]/.test(safe)) throw new Error('无效的文件名')
  return `${AVATAR_FRAME_URL_PREFIX}/${safe}`
}

export function defaultAvatarFrameUrl() {
  return DEFAULT_AVATAR_FRAME_URL
}

export function ensureAvatarFrameStorage() {
  fs.mkdirSync(AVATAR_FRAME_DIR, { recursive: true })
}

export function migrateLegacyDefaultAvatarFrameFile() {
  ensureAvatarFrameStorage()
  const legacyPath = path.join(OFFICIAL_IMAGES_DIR, DEFAULT_AVATAR_FRAME_FILENAME)
  const targetPath = path.join(AVATAR_FRAME_DIR, DEFAULT_AVATAR_FRAME_FILENAME)
  if (!fs.existsSync(targetPath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, targetPath)
  }
}

export function normalizeAvatarFrameUrl(frameUrl) {
  return canonicalizeAvatarFrameUrl(frameUrl)
}

export function resolveAvatarFrameFilePath(frameUrl) {
  const normalized = normalizeAvatarFrameUrl(frameUrl)
  if (!normalized.startsWith(`${AVATAR_FRAME_URL_PREFIX}/`)) return null
  const encodedName = normalized.slice(`${AVATAR_FRAME_URL_PREFIX}/`.length)
  const filename = decodeURIComponent(encodedName)
  const safe = path.basename(filename)
  if (!safe || safe.includes('..')) return null
  return path.join(AVATAR_FRAME_DIR, safe)
}

export function readAvatarFrameFile(frameUrl) {
  const filePath = resolveAvatarFrameFilePath(frameUrl)
  if (!filePath || !fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

export function isAllowedAvatarFrameUpload(file) {
  const ext = frameExtFromName(file?.originalname, file?.mimetype)
  if (!AVATAR_FRAME_IMAGE_EXTS.has(ext)) return false
  const mime = String(file?.mimetype || '').toLowerCase()
  return mime === 'image/png' || mime === 'image/webp'
}

function measureInnerHoleFromCenter(data, width, height, channels) {
  const alphaIdx = channels - 1
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const alphaAt = (x, y) => data[(y * width + x) * channels + alphaIdx]

  const innerRadii = []
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180
    for (let r = 1; r <= Math.min(width, height) / 2; r++) {
      const x = Math.round(cx + Math.cos(rad) * r)
      const y = Math.round(cy + Math.sin(rad) * r)
      if (x < 0 || y < 0 || x >= width || y >= height) break
      if (alphaAt(x, y) >= ALPHA_OPAQUE_THRESHOLD) {
        innerRadii.push(r - 1)
        break
      }
    }
  }

  if (!innerRadii.length) return null

  innerRadii.sort((a, b) => a - b)
  const mid = Math.floor(innerRadii.length / 2)
  const innerRadius = innerRadii.length % 2
    ? innerRadii[mid]
    : (innerRadii[mid - 1] + innerRadii[mid]) / 2

  let holeMinX = width
  let holeMinY = height
  let holeMaxX = 0
  let holeMaxY = 0
  const maxR = Math.max(4, Math.floor(innerRadius * 0.92))
  for (let y = Math.floor(cy - maxR); y <= Math.ceil(cy + maxR); y++) {
    for (let x = Math.floor(cx - maxR); x <= Math.ceil(cx + maxR); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > maxR * maxR) continue
      if (alphaAt(x, y) >= ALPHA_HOLE_THRESHOLD) continue
      if (x < holeMinX) holeMinX = x
      if (y < holeMinY) holeMinY = y
      if (x > holeMaxX) holeMaxX = x
      if (y > holeMaxY) holeMaxY = y
    }
  }

  if (holeMaxX <= holeMinX || holeMaxY <= holeMinY) {
    return {
      holeCx: cx,
      holeCy: cy,
      holeDiameter: innerRadius * 2
    }
  }

  return {
    holeCx: (holeMinX + holeMaxX) / 2,
    holeCy: (holeMinY + holeMaxY) / 2,
    holeDiameter: Math.min(holeMaxX - holeMinX + 1, holeMaxY - holeMinY + 1, innerRadius * 2)
  }
}

export async function analyzeAvatarFrameAlignment(buffer) {
  const fallback = {
    scale: 1.46,
    offsetXPct: 0,
    offsetYPct: -4,
    holeDiameterRatio: 0.685
  }
  if (!buffer?.length) return fallback

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (!width || !height || channels < 4) return fallback

  const hole = measureInnerHoleFromCenter(data, width, height, channels)
  if (!hole || !hole.holeDiameter) return fallback

  const imageCx = width / 2
  const imageCy = height / 2
  const holeDiameterRatio = hole.holeDiameter / width
  const scale = holeDiameterRatio > 0 ? Number((1 / holeDiameterRatio).toFixed(4)) : fallback.scale
  const offsetXPct = Number((((imageCx - hole.holeCx) / width) * 100).toFixed(3))
  const offsetYPct = Number((((imageCy - hole.holeCy) / height) * 100).toFixed(3))

  return {
    scale,
    offsetXPct,
    offsetYPct,
    holeDiameterRatio: Number(holeDiameterRatio.toFixed(4))
  }
}

export async function saveAvatarFrameFromUpload(buffer, originalName, mimetype = '') {
  if (!buffer?.length) throw new Error('未上传头像框文件')
  const ext = frameExtFromName(originalName, mimetype)
  if (!AVATAR_FRAME_IMAGE_EXTS.has(ext)) {
    throw new Error('头像框仅支持 png、webp（需透明通道）')
  }

  ensureAvatarFrameStorage()
  const filename = buildFrameFilename(ext)
  const outPath = path.join(AVATAR_FRAME_DIR, filename)

  if (ext === '.webp') {
    await sharp(buffer).ensureAlpha().webp({ quality: 90 }).toFile(outPath)
  } else {
    await sharp(buffer).ensureAlpha().png({ compressionLevel: 9 }).toFile(outPath)
  }

  return {
    filename,
    frameUrl: frameUrlFromFilename(filename)
  }
}

export function deleteAvatarFrameFile(frameUrl) {
  const filePath = resolveAvatarFrameFilePath(frameUrl)
  if (!filePath || !fs.existsSync(filePath)) return
  if (path.basename(filePath) === DEFAULT_AVATAR_FRAME_FILENAME) return
  fs.unlinkSync(filePath)
}
