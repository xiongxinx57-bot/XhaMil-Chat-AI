import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { MEDIA_DIR } from './config.js'
import { synthesizeGenshinVits } from './genshinVits.js'
import { resolveVoiceById, defaultVoiceIdForAi } from './voiceCatalog.js'

const require = createRequire(import.meta.url)
const { EdgeTTS } = require('node-edge-tts')

export const TTS_AUDIO_DIR = path.join(MEDIA_DIR, 'Tts')
export const TTS_AUDIO_URL_PREFIX = '/media/Tts'

const EDGE_MAX = 1200
/** 角色声单次字数上限 */
const GENSHIN_ONCE_MAX = 100
/** 聊天等角色声最长时间（超时再用「该角色专属」神经音代理，避免全员一个声） */
const GENSHIN_CHAT_TIMEOUT_MS = 22000
const GENSHIN_PREVIEW_TIMEOUT_MS = 25000

const FEMALE_NEURAL = ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunxiaNeural']
const MALE_NEURAL = ['zh-CN-YunxiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunyangNeural']

function ensureTtsDir() {
  fs.mkdirSync(TTS_AUDIO_DIR, { recursive: true })
}

function cacheKey(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex')
}

/** 朗读前清洗：去旁白/链接，保留句读 */
export function prepareTtsText(raw, max = EDGE_MAX) {
  let text = String(raw || '')
  text = text.replace(/（[^）\n]{1,240}）/g, ' ')
  text = text.replace(/\(([^)]{1,240})\)/g, (_m, inner) => {
    const s = String(inner || '').trim()
    if (!s) return ' '
    if (/[\u4e00-\u9fff]/.test(s)) return ' '
    if (s.length >= 18) return ' '
    return ' '
  })
  text = text.replace(/[*＊][^*\n＊]{1,80}[*＊]/g, ' ')
  text = text.replace(/【[^】\n]{1,80}】/g, ' ')
  text = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`*_~>#|\\]/g, ' ')
    .replace(/[「」『』《》〈〉]/g, '')
    .replace(/[～~]{2,}/g, '…')
    .replace(/[。！？；]{3,}/g, (m) => m.slice(0, 2))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n+/g, '。')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) {
    text = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return text.slice(0, max)
}

export function splitTtsChunks(text, maxLen = GENSHIN_ONCE_MAX) {
  const src = String(text || '').trim()
  if (!src) return []
  if (src.length <= maxLen) return [src]
  const parts = []
  for (let i = 0; i < src.length; i += maxLen) parts.push(src.slice(i, i + maxLen))
  return parts
}

function voiceHay(voice) {
  return `${voice.label}|${voice.id}|${(voice.tags || []).join(',')}|${voice.category || ''}`
}

function isMaleVoice(voice) {
  const hay = voiceHay(voice)
  if (/原神·男声|崩坏·男/.test(String(voice.category || ''))) return true
  return /男声|沉稳男|真实少年|阳光男|少年软音|钟离|温迪|魈|散兵|万叶|公子|空哥|凯亚|迪卢克|阿贝多|赛诺|提纳里|白术|一斗|绫人|雷泽|托马|五郎|行秋|重云|班尼特|平藏/.test(
    hay
  )
}

/**
 * 每个角色一个稳定、可区分的神经音代理（不把所有人压成同一种「高冷/萝莉」）。
 * 用角色 id 哈希固定选声线 + 语速/音高，同一角色始终一致，不同角色听得出差别。
 */
export function characterEdgeProxy(voice) {
  if (!voice) return resolveVoiceById('style:real_girl')
  if (voice.engine === 'edge' && voice.voice) {
    return voice
  }

  const hay = voiceHay(voice)
  const digest = crypto.createHash('sha1').update(String(voice.id || voice.label || '')).digest()
  const male = isMaleVoice(voice) || /男声/.test(voice.category || '')
  const pool = male ? MALE_NEURAL : FEMALE_NEURAL
  const neural = pool[digest[0] % pool.length]

  let baseRate = 0
  let basePitch = 0
  if (/萝莉|可莉|七七|派蒙|德丽莎|帕朵|早柚|迪奥娜|纳西妲|多莉|砂糖/.test(hay)) {
    baseRate = 5
    basePitch = 9
  } else if (/高冷|女神|御姐|雷电|夜兰|申鹤|律者|渡鸦|符华|凝光|女士|优菈|北斗|冰山/.test(hay)) {
    baseRate = -6
    basePitch = -5
  } else if (/温柔|心海|琴|芭芭拉|芽衣|希儿|甘雨|软糯/.test(hay)) {
    baseRate = -2
    basePitch = 1
  } else if (/活泼|胡桃|宵宫|香菱|琪亚娜|元气|甜美/.test(hay)) {
    baseRate = 5
    basePitch = 4
  } else if (male) {
    baseRate = -2
    basePitch = -2
  }

  // 角色专属偏移：语速 ±5%，音高 ±6Hz，拉开差距
  const rate = Math.max(-12, Math.min(12, baseRate + ((digest[1] % 11) - 5)))
  const pitch = Math.max(-10, Math.min(12, basePitch + ((digest[2] % 13) - 6)))

  return {
    id: `proxy:${voice.id}`,
    label: voice.label,
    engine: 'edge',
    voice: neural,
    rate: `${rate >= 0 ? '+' : ''}${rate}%`,
    pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
    desc: `角色加速代理 · ${voice.label}`
  }
}

async function synthesizeEdge(text, voiceName, rate, pitch, filePath) {
  const tts = new EdgeTTS({
    voice: voiceName || 'zh-CN-XiaoxiaoNeural',
    lang: 'zh-CN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    rate: rate || '+0%',
    pitch: pitch || '+0Hz',
    timeout: Math.min(45000, 10000 + Math.floor(String(text).length * 20))
  })
  await tts.ttsPromise(text, filePath)
}

/**
 * @param {string} rawText
 * @param {{ isAi?: boolean, voiceId?: string, voicePreset?: string, forceGenshin?: boolean }} [opts]
 */
export async function synthesizeChatSpeech(rawText, opts = {}) {
  const isAi = !!opts.isAi
  const voiceId = opts.voiceId || opts.voicePreset || (isAi ? defaultVoiceIdForAi() : 'style:real_girl')
  const voice = resolveVoiceById(voiceId, { isAi })
  if (!voice) throw new Error('未知音色')

  ensureTtsDir()
  const text = prepareTtsText(rawText, EDGE_MAX)
  if (!text) throw new Error('没有可合成的文字')

  // 后台选的「风格推荐」：严格按所选神经音，绝不串味
  if (voice.engine === 'edge') {
    return synthesizeWithEdge(text, voice)
  }

  // 原神/崩坏角色声
  return synthesizeGenshinPrefer(text, voice, { forceGenshin: !!opts.forceGenshin })
}

async function asTagged(voice, edgeResult, extra = {}) {
  return {
    ...edgeResult,
    voiceId: voice.id,
    label: voice.label,
    ...extra
  }
}

async function synthesizeGenshinPrefer(text, voice, { forceGenshin = false } = {}) {
  const proxy = characterEdgeProxy(voice)
  const once = text.slice(0, GENSHIN_ONCE_MAX)
  const canTryGenshin = forceGenshin || text.length <= GENSHIN_ONCE_MAX

  if (canTryGenshin) {
    const speaker = voice.speaker || '可莉'
    const key = cacheKey(['genshin-v3', speaker, once])
    const filename = `${key}.wav`
    const filePath = path.join(TTS_AUDIO_DIR, filename)
    const audioUrl = `${TTS_AUDIO_URL_PREFIX}/${filename}`

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 200) {
      return {
        audioUrl,
        cached: true,
        voiceId: voice.id,
        label: voice.label,
        engine: 'genshin',
        voice: speaker
      }
    }

    const timeoutMs = forceGenshin ? GENSHIN_PREVIEW_TIMEOUT_MS : GENSHIN_CHAT_TIMEOUT_MS
    try {
      const wav = await synthesizeGenshinVits(once, {
        speaker,
        noise: 0.35,
        noisew: 0.55,
        length: 1.0,
        timeoutMs
      })
      if (!wav?.length) throw new Error('空音频')
      fs.writeFileSync(filePath, wav)
      return {
        audioUrl,
        cached: false,
        voiceId: voice.id,
        label: voice.label,
        engine: 'genshin',
        voice: speaker
      }
    } catch (e) {
      console.warn('[tts] genshin miss → character proxy:', voice.id, e.message || e)
    }
  } else {
    console.info('[tts] long text → character proxy:', voice.id, 'len=', text.length)
  }

  // 加速/失败：用该角色专属神经音（不同角色不同声），保留所选 voiceId/label
  return asTagged(voice, await synthesizeWithEdge(text, proxy), {
    fastPath: true,
    matchedStyle: proxy.id,
    proxyVoice: proxy.voice,
    proxyRate: proxy.rate,
    proxyPitch: proxy.pitch
  })
}

async function synthesizeWithEdge(text, voice) {
  const edgeVoice = voice.voice || 'zh-CN-XiaoxiaoNeural'
  const rate = voice.rate || '+0%'
  const pitch = voice.pitch || '+0Hz'
  const key = cacheKey(['edge-v4', voice.id || edgeVoice, edgeVoice, rate, pitch, text])
  const filename = `${key}.mp3`
  const filePath = path.join(TTS_AUDIO_DIR, filename)
  const audioUrl = `${TTS_AUDIO_URL_PREFIX}/${filename}`
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 200) {
    return {
      audioUrl,
      cached: true,
      voiceId: voice.id,
      label: voice.label,
      engine: 'edge',
      voice: edgeVoice
    }
  }
  await synthesizeEdge(text, edgeVoice, rate, pitch, filePath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 200) {
    throw new Error('合成失败')
  }
  return {
    audioUrl,
    cached: false,
    voiceId: voice.id,
    label: voice.label,
    engine: 'edge',
    voice: edgeVoice
  }
}
