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
      reject(new Error(`${label} timeout bytes=${Buffer.concat(chunks).length}`))
    }, 10000)

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
      const msg = String(data)
      if (msg.includes('Path:turn.end')) {
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

const outDir = path.resolve('media/Tts')
fs.mkdirSync(outDir, { recursive: true })

const cases = [
  [
    'plain-like-lib',
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <prosody rate="+6%" pitch="+3Hz" volume="+0%">
            哼，随便你
          </prosody>
        </voice>
      </speak>`
  ],
  [
    'express-only',
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="angry">哼，随便你</mstts:express-as>
        </voice>
      </speak>`
  ],
  [
    'express-cheerful',
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="cheerful">哈哈太好了</mstts:express-as>
        </voice>
      </speak>`
  ],
  [
    'xiaoyi-angry',
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoyiNeural">
          <mstts:express-as style="angry">哼，随便你</mstts:express-as>
        </voice>
      </speak>`
  ]
]

for (const [name, ssml] of cases) {
  try {
    const buf = await synthesize(ssml, name)
    fs.writeFileSync(path.join(outDir, `_try_${name}.mp3`), buf)
    console.log(name, 'ok', buf.length)
  } catch (e) {
    console.log(name, 'fail', e.message)
  }
}
