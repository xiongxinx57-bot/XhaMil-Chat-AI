import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { CHAT_IMAGE_DIR, CHAT_IMAGE_URL_PREFIX, isAllowedExternalStickerUrl } from './config.js'

const STICKER_PROXY_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const EXT_BY_MIME = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

const KNOWN_EXTS = ['.gif', '.jpg', '.png', '.webp']

function stickerProxyHeaders(url) {
  const headers = {
    'User-Agent': STICKER_PROXY_UA,
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  }
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (
      host.endsWith('baidu.com') ||
      host.endsWith('bdimg.com') ||
      host.endsWith('bdstatic.com') ||
      host.endsWith('bcebos.com')
    ) {
      headers.Referer = 'https://www.baidu.com/'
    } else if (
      host.endsWith('soutula.com') ||
      host.endsWith('fabiaoqing.com') ||
      host.endsWith('sinaimg.cn') ||
      host.endsWith('doutula.com') ||
      host.endsWith('doutupk.com') ||
      host.endsWith('sogoucdn.com')
    ) {
      headers.Referer = 'https://fabiaoqing.com/'
    }
  } catch {
    // ignore
  }
  return headers
}

function hashUrl(url) {
  return crypto.createHash('sha1').update(String(url || '').trim()).digest('hex')
}

function extFromUrlOrType(url, contentType) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime]
  const m = String(url || '').match(/\.(gif|jpe?g|png|webp)(?:[?#]|$)/i)
  if (!m) return '.gif'
  const ext = `.${m[1].toLowerCase()}`
  return ext === '.jpeg' ? '.jpg' : ext
}

function cacheFilename(hash, ext) {
  return `ext-${hash}${ext}`
}

function findCachedFile(hash) {
  fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true })
  for (const ext of KNOWN_EXTS) {
    const filename = cacheFilename(hash, ext)
    const filePath = path.join(CHAT_IMAGE_DIR, filename)
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return { filename, filePath, ext }
    }
  }
  return null
}

function localUrlFromFilename(filename) {
  return `${CHAT_IMAGE_URL_PREFIX}/${encodeURIComponent(filename)}`
}

function mimeFromExt(ext) {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'image/gif'
}

async function fetchExternalStickerBuffer(url, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const upstream = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: stickerProxyHeaders(url),
      signal: controller.signal
    })
    if (!upstream.ok) {
      const err = new Error('表情包加载失败')
      err.status = upstream.status === 404 ? 404 : 502
      throw err
    }
    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase()
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      const err = new Error('表情包类型无效')
      err.status = 502
      throw err
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    if (!buf.length) {
      const err = new Error('表情包为空')
      err.status = 502
      throw err
    }
    const ext = extFromUrlOrType(url, contentType)
    return { buf, ext, contentType: mimeFromExt(ext) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 下载外链表情并落到本机 Chat Images（按 URL 去重）。
 * 已是本站地址则原样返回。
 */
export async function ensureLocalExternalSticker(url) {
  const raw = String(url || '').trim()
  if (!raw) return raw
  if (!isAllowedExternalStickerUrl(raw)) return raw

  const hash = hashUrl(raw)
  const hit = findCachedFile(hash)
  if (hit) return localUrlFromFilename(hit.filename)

  const { buf, ext } = await fetchExternalStickerBuffer(raw)
  const filename = cacheFilename(hash, ext)
  const filePath = path.join(CHAT_IMAGE_DIR, filename)
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, buf)
  try {
    fs.renameSync(tmpPath, filePath)
  } catch {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore
    }
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buf)
  }
  return localUrlFromFilename(filename)
}

/**
 * 供网页代理：优先读本地缓存，否则拉取并缓存后返回文件流信息。
 */
export async function resolveExternalStickerForProxy(url) {
  const raw = String(url || '').trim()
  if (!isAllowedExternalStickerUrl(raw)) {
    const err = new Error('无效的表情包地址')
    err.status = 400
    throw err
  }

  const hash = hashUrl(raw)
  const hit = findCachedFile(hash)
  if (hit) {
    return {
      filePath: hit.filePath,
      contentType: mimeFromExt(hit.ext),
      stream: fs.createReadStream(hit.filePath)
    }
  }

  const { buf, ext, contentType } = await fetchExternalStickerBuffer(raw)
  const filename = cacheFilename(hash, ext)
  const filePath = path.join(CHAT_IMAGE_DIR, filename)
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, buf)
  try {
    fs.renameSync(tmpPath, filePath)
  } catch {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore
    }
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buf)
  }

  return {
    filePath,
    contentType,
    stream: Readable.from(buf)
  }
}
