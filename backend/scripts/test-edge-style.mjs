import { createRequire } from 'module'
import crypto from 'crypto'
import WebSocket from 'ws'

const require = createRequire(import.meta.url)
const {
  generateSecMsGecToken,
  TRUSTED_CLIENT_TOKEN,
  CHROMIUM_FULL_VERSION
} = require('node-edge-tts/dist/drm.js')

const chromeMajor = String(CHROMIUM_FULL_VERSION).split('.')[0]
const url =
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
  `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
  `&Sec-MS-GEC=${generateSecMsGecToken()}` +
  `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`

const variants = {
  plain:
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">` +
    `<voice name="zh-CN-XiaoxiaoNeural"><prosody rate="+0%" pitch="+0Hz" volume="+0%">嗯，知道了</prosody></voice></speak>`,
  styled:
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">` +
    `<voice name="zh-CN-XiaoxiaoNeural"><mstts:express-as style="chat" styledegree="1.2">` +
    `<prosody rate="-2%" pitch="+0Hz" volume="+0%">嗯，知道了</prosody></mstts:express-as></voice></speak>`
}

function run(ssml, label) {
  return new Promise((resolve, reject) => {
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
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    })
    const chunks = []
    const t = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      reject(new Error(label + ' timeout'))
    }, 20000)
    ws.on('open', () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'false'
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                }
              }
            }
          })
      )
      const requestId = crypto.randomBytes(16).toString('hex')
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + ssml
      )
    })
    ws.on('message', (data, isBinary) => {
      if (isBinary || Buffer.isBuffer(data)) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        const sep = 'Path:audio\r\n'
        const i = buf.indexOf(sep)
        if (i >= 0) chunks.push(buf.subarray(i + sep.length))
        else console.log(label, 'bin no sep', buf.slice(0, 80).toString())
      } else {
        const s = data.toString()
        if (s.includes('Path:turn.end')) {
          clearTimeout(t)
          ws.close()
          console.log(label, 'ok bytes', Buffer.concat(chunks).length)
          resolve(Buffer.concat(chunks).length)
        } else if (s.includes('Path:')) {
          console.log(label, 'msg', s.split('\r\n').find((x) => x.startsWith('Path:')))
        }
      }
    })
    ws.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    ws.on('close', () => {
      if (chunks.length) {
        clearTimeout(t)
        console.log(label, 'close bytes', Buffer.concat(chunks).length)
        resolve(Buffer.concat(chunks).length)
      }
    })
  })
}

await run(variants.plain, 'plain')
await run(variants.styled, 'styled')
