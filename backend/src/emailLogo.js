import fs from 'fs'
import path from 'path'
import { DEFAULT_MAIL_LOGO_URL, MEDIA_DIR } from './config.js'

export { DEFAULT_MAIL_LOGO_URL }

export function normalizeMailLogoPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_MAIL_LOGO_URL
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  let p = raw.replace(/\\/g, '/')
  if (!p.startsWith('/')) p = `/${p}`
  if (p.startsWith('/media/')) return p
  if (p.startsWith('media/')) return `/${p}`
  return p
}

export function encodeLogoPathForUrl(logoPath) {
  const p = normalizeMailLogoPath(logoPath)
  if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p
  return p
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(decodeURIComponent(seg)) : ''))
    .join('/')
}

export function resolveMailLogoUrl(logoPath, opts = {}) {
  const normalized = normalizeMailLogoPath(logoPath)
  const encoded = encodeLogoPathForUrl(normalized)

  if (/^https?:\/\//i.test(encoded) || encoded.startsWith('data:')) {
    return encoded
  }

  const publicSiteUrl = String(opts.publicSiteUrl || '').trim().replace(/\/+$/, '')
  if (publicSiteUrl) {
    return `${publicSiteUrl}${encoded}`
  }

  const previewOrigin = String(opts.previewOrigin || '').trim().replace(/\/+$/, '')
  if (previewOrigin) {
    return `${previewOrigin}${encoded}`
  }

  const dataUri = readLocalLogoDataUri(normalized)
  if (dataUri) return dataUri

  return encoded
}

function readLocalLogoDataUri(logoPath) {
  const normalized = normalizeMailLogoPath(logoPath)
  if (!normalized.startsWith('/media/')) return null
  const rel = normalized.slice('/media/'.length)
  const abs = path.resolve(MEDIA_DIR, rel)
  const mediaRoot = path.resolve(MEDIA_DIR)
  if (!abs.startsWith(mediaRoot + path.sep) && abs !== mediaRoot) return null
  if (!fs.existsSync(abs)) return null
  const buf = fs.readFileSync(abs)
  const ext = path.extname(abs).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function isMailLogoImage(logoPath, logoUrl) {
  if (logoUrl && (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:'))) return true
  const p = normalizeMailLogoPath(logoPath)
  return p.startsWith('/media/') || /^https?:\/\//i.test(p) || p.startsWith('data:')
}
