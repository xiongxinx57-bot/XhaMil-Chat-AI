import fs from 'fs'
import path from 'path'
import { VOICE_AUDIO_DIR, VOICE_AUDIO_URL_PREFIX } from './config.js'

function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null
  return base
}

/** Detect real audio type so mislabeled App uploads (m4a saved as .webm) still play in browsers. */
export function sniffVoiceContentType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(16)
    const n = fs.readSync(fd, buf, 0, 16, 0)
    fs.closeSync(fd)
    if (n < 4) return null
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      return 'audio/webm'
    }
    if (n >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4'
    if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
    if (
      n >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WAVE'
    ) {
      return 'audio/wav'
    }
    if (buf.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg'
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg'
    if (buf.toString('ascii', 0, 5) === '#!AMR') return 'audio/amr'
    // ADTS AAC sync word
    if (buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0) return 'audio/aac'
  } catch {
    // ignore
  }
  return null
}

export function applyVoiceStaticHeaders(res, filePath) {
  res.setHeader('Cache-Control', 'public, max-age=604800')
  const sniffed = sniffVoiceContentType(filePath)
  if (sniffed) res.setHeader('Content-Type', sniffed)
}

export function listChatVoiceFiles() {
  if (!fs.existsSync(VOICE_AUDIO_DIR)) {
    return { dir: VOICE_AUDIO_DIR, list: [], totalSize: 0 }
  }
  const entries = fs.readdirSync(VOICE_AUDIO_DIR, { withFileTypes: true })
  const list = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(VOICE_AUDIO_DIR, e.name)
      const stat = fs.statSync(filePath)
      return {
        filename: e.name,
        url: `${VOICE_AUDIO_URL_PREFIX}/${encodeURIComponent(e.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir: VOICE_AUDIO_DIR, list, totalSize }
}

export function deleteChatVoiceFile(filename) {
  const safe = safeFilename(filename)
  if (!safe) throw new Error('无效的文件名')
  const filePath = path.join(VOICE_AUDIO_DIR, safe)
  if (!fs.existsSync(filePath)) throw new Error('文件不存在')
  fs.unlinkSync(filePath)
  return { filename: safe }
}
