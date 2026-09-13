import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { MEDIA_DIR } from './config.js'
import { logStatus } from './startupLog.js'

const ZIP_NAME = 'vosk-model-small-cn-0.22.zip'
const EXPECTED_SIZE = 43898754
const VOSK_DIR = path.join(MEDIA_DIR, 'vosk')
const ZIP_PATH = path.join(VOSK_DIR, ZIP_NAME)

const MIRRORS = [
  'https://hf-mirror.com/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip',
  'https://huggingface.co/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip',
  'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip'
]

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('too many redirects'))
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 120000 }, (res) => {
      const code = res.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume()
        return resolve(download(res.headers.location, dest, redirects + 1))
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const tmp = `${dest}.part`
      const out = fs.createWriteStream(tmp)
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(tmp, dest)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
      out.on('error', (e) => {
        try { fs.unlinkSync(tmp) } catch {}
        reject(e)
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
  })
}

/** 若 media/vosk 下缺少模型 zip，则从镜像自动下载（仅启动时跑一次）。 */
export async function ensureVoskModel() {
  try {
    fs.mkdirSync(VOSK_DIR, { recursive: true })
    if (fs.existsSync(ZIP_PATH) && fs.statSync(ZIP_PATH).size >= EXPECTED_SIZE * 0.95) {
      logStatus('Vosk 模型', true, `/media/vosk/${ZIP_NAME}`)
      return
    }
    logStatus('Vosk 模型', false, '缺失，正在下载…')
    let lastErr = null
    for (const url of MIRRORS) {
      try {
        await download(url, ZIP_PATH)
        const size = fs.statSync(ZIP_PATH).size
        if (size < EXPECTED_SIZE * 0.95) {
          throw new Error(`size too small: ${size}`)
        }
        logStatus('Vosk 模型', true, `/media/vosk/${ZIP_NAME} (${Math.round(size / 1024 / 1024)}MB)`)
        return
      } catch (e) {
        lastErr = e
        try { fs.unlinkSync(ZIP_PATH) } catch {}
        try { fs.unlinkSync(`${ZIP_PATH}.part`) } catch {}
      }
    }
    logStatus('Vosk 模型', false, lastErr?.message || '下载失败')
  } catch (e) {
    logStatus('Vosk 模型', false, e.message)
  }
}
