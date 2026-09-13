import { createRequire } from 'module'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'

const require = createRequire(import.meta.url)
const {
  generateSecMsGecToken,
  TRUSTED_CLIENT_TOKEN,
  CHROMIUM_FULL_VERSION
} = require('node-edge-tts/dist/drm.js')

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      case "'":
        return '&apos;'
      default:
        return c
    }
  })
}

function synthesize(ssml, label) {
  return new Promise((resolve, reject) => {
    const chromeMajor = String(CHROMIUM_FULL_VERSION).split('.')[0]
    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${generateSecMsGecToken()}` +
      `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`
    const ws = new WebSocket(url, {
      host: 'speech.platform.bing.com',
      origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'User-Agent':
          `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
          `Chrome/${chromeMajor}.0.0.0 Safari/537.36 Edg/${chromeMajor}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    const chunks = []
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      reject(new Error(`${label} timeout`))
    }, 15000)

    ws.on('open', () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
          {
            "context": {
              "synthesis": {
                "audio": {
                  "metadataoptions": {
                    "sentenceBoundaryEnabled": "false",
                    "wordBoundaryEnabled": "false"
                  },
                  "outputFormat": "audio-24khz-48kbitrate-mono-mp3"
                }
              }
            }
          }
        `)
      const requestId = crypto.randomBytes(16).toString('hex')
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + ssml
      )
    })

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        const separator = 'Path:audio\r\n'
        const index = buf.indexOf(separator)
        if (index >= 0) chunks.push(buf.subarray(index + separator.length))
        return
      }
      if (String(data).includes('Path:turn.end')) {
        clearTimeout(timer)
        ws.close()
        resolve(Buffer.concat(chunks))
      }
    })
    ws.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

const text = escapeXml('哼，随便你')
const variants = {
  angry:
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="angry">
            <prosody rate="+6%" pitch="+3Hz" volume="+0%">${text}</prosody>
          </mstts:express-as>
        </voice>
      </speak>`,
  chat:
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="chat">
            <prosody rate="-4%" pitch="+1Hz" volume="+0%">${text}</prosody>
          </mstts:express-as>
        </voice>
      </speak>`,
  calm:
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="calm">
            <prosody rate="-8%" pitch="-2Hz" volume="+0%">${text}</prosody>
          </mstts:express-as>
        </voice>
      </speak>`
}

const outDir = path.resolve('media/Tts')
fs.mkdirSync(outDir, { recursive: true })

for (const [name, ssml] of Object.entries(variants)) {
  try {
    const buf = await synthesize(ssml, name)
    const file = path.join(outDir, `_style_${name}.mp3`)
    fs.writeFileSync(file, buf)
    console.log(name, 'ok', buf.length)
  } catch (e) {
    console.log(name, 'fail', e.message)
  }
}
