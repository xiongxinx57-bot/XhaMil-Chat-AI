import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { STICKER_DIR, STICKER_URL_PREFIX } from './config.js'

export const STICKER_IMAGE_EXTS = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp'])

const STICKER_MAX_SIDE = 512
const STICKER_JPEG_QUALITY = 82
const STICKER_WEBP_QUALITY = 82
const STICKER_PNG_COMPRESSION = 9

function stickerExtFromName(name, mimetype = '') {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (STICKER_IMAGE_EXTS.has(ext)) return ext === '.jpeg' ? '.jpg' : ext
  const mime = String(mimetype || '').toLowerCase()
  if (mime === 'image/gif') return '.gif'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg'
  return '.jpg'
}

function isGifExt(ext) {
  return ext === '.gif'
}

function buildStickerFilename(ext) {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `sticker-${uniqueSuffix}${ext}`
}

export function isAllowedStickerUpload(file) {
  const ext = stickerExtFromName(file?.originalname, file?.mimetype)
  if (!STICKER_IMAGE_EXTS.has(ext)) return false
  const mime = String(file?.mimetype || '').toLowerCase()
  if (!mime.startsWith('image/')) return false
  return true
}

async function writeCompressedSticker(buffer, ext) {
  fs.mkdirSync(STICKER_DIR, { recursive: true })
  const filename = buildStickerFilename(ext)
  const outPath = path.join(STICKER_DIR, filename)

  if (isGifExt(ext)) {
    try {
      await sharp(buffer, { animated: true })
        .resize(STICKER_MAX_SIDE, STICKER_MAX_SIDE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .gif({ effort: 7 })
        .toFile(outPath)
      return filename
    } catch {
      fs.writeFileSync(outPath, buffer)
      return filename
    }
  }

  const base = sharp(buffer, { animated: false }).rotate().resize(STICKER_MAX_SIDE, STICKER_MAX_SIDE, {
    fit: 'inside',
    withoutEnlargement: true
  })

  if (ext === '.png') {
    await base.png({ compressionLevel: STICKER_PNG_COMPRESSION, quality: 80 }).toFile(outPath)
  } else if (ext === '.webp') {
    await base.webp({ quality: STICKER_WEBP_QUALITY }).toFile(outPath)
  } else {
    await base.jpeg({ quality: STICKER_JPEG_QUALITY, mozjpeg: true }).toFile(outPath)
  }

  return filename
}

export async function saveStickerFromUpload(buffer, originalName, mimetype = '') {
  if (!buffer?.length) throw new Error('未上传表情包文件')
  const ext = stickerExtFromName(originalName, mimetype)
  if (!STICKER_IMAGE_EXTS.has(ext)) throw new Error('表情包仅支持 gif、jpg、png、webp 格式')
  const filename = await writeCompressedSticker(buffer, ext)
  return {
    filename,
    url: `${STICKER_URL_PREFIX}/${encodeURIComponent(filename)}`
  }
}
