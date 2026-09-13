import crypto from 'crypto'
import WebSocket from 'ws'

const HF_WS = 'wss://zomehwh-vits-uma-genshin-honkai.hf.space/queue/join'
const DEFAULT_SPEAKER = '可莉'
const DEFAULT_LANG = '中文'

/**
 * 调用公开 Gradio 原神 VITS（HuggingFace Space）。
 * 协议：Gradio 3 queue WebSocket。不稳定时由上层回退 Edge。
 * @returns {Promise<Buffer>} wav 字节
 */
export function synthesizeGenshinVits(
  rawText,
  {
    speaker = DEFAULT_SPEAKER,
    language = DEFAULT_LANG,
    noise = 0.35,
    noisew = 0.55,
    length = 1.0,
    timeoutMs = 50000
  } = {}
) {
  const text = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  if (!text) return Promise.reject(new Error('没有可合成的文字'))

  const session_hash = crypto.randomBytes(8).toString('hex')
  const data = [text, language, speaker, noise, noisew, length]

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(HF_WS)
    let settled = false
    const done = (err, buf) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve(buf)
    }
    const timer = setTimeout(() => done(new Error('原神语音合成超时')), timeoutMs)

    ws.on('open', () => {
      /* wait for server prompts */
    })

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.msg === 'send_hash') {
        ws.send(JSON.stringify({ fn_index: 0, session_hash }))
        return
      }
      if (msg.msg === 'send_data') {
        ws.send(JSON.stringify({ fn_index: 0, data, session_hash }))
        return
      }
      if (msg.msg === 'process_completed') {
        if (!msg.success) {
          done(new Error(msg.output?.error || '原神语音合成失败'))
          return
        }
        const items = msg.output?.data
        const audioItem = Array.isArray(items)
          ? items.find(
              (x) =>
                typeof x === 'string' &&
                (x.startsWith('data:audio') || x.startsWith('http'))
            )
          : null
        if (!audioItem) {
          done(new Error('未返回音频'))
          return
        }
        if (audioItem.startsWith('data:audio')) {
          const b64 = audioItem.replace(/^data:audio\/\w+;base64,/, '')
          done(null, Buffer.from(b64, 'base64'))
          return
        }
        // 远程 URL
        fetch(audioItem)
          .then((r) => r.arrayBuffer())
          .then((ab) => done(null, Buffer.from(ab)))
          .catch((e) => done(e))
      }
    })

    ws.on('error', (e) => done(e))
  })
}

export const GENSHIN_SPEAKERS_HINT = DEFAULT_SPEAKER
