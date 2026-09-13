import { loadConfig } from './config.js'

/**
 * 免费语音转文字：
 * - siliconflow：FunAudioLLM/SenseVoiceSmall（中文更准，国内可达，免费额度）
 * - groq：whisper-large-v3-turbo（国际免费额度）
 *
 * 配置（json/config.json 或环境变量）：
 *   voiceToTextProvider: "siliconflow" | "groq" | "auto"
 *   voiceToTextApiKey: "sk-..."
 *   voiceToTextModel: 可选覆盖模型名
 * 环境变量优先：SILICONFLOW_API_KEY / GROQ_API_KEY / VOICE_TO_TEXT_API_KEY
 */

function resolveProvider(config) {
  const raw = String(
    process.env.VOICE_TO_TEXT_PROVIDER || config.voiceToTextProvider || 'auto'
  )
    .trim()
    .toLowerCase()
  if (raw === 'siliconflow' || raw === 'groq') return raw

  const sf =
    process.env.SILICONFLOW_API_KEY ||
    config.siliconflowApiKey ||
    (config.voiceToTextProvider === 'siliconflow' ? config.voiceToTextApiKey : '') ||
    ''
  const groq = process.env.GROQ_API_KEY || config.groqApiKey || ''
  if (String(sf).trim()) return 'siliconflow'
  if (String(groq).trim()) return 'groq'
  if (String(config.voiceToTextApiKey || process.env.VOICE_TO_TEXT_API_KEY || '').trim()) {
    return 'siliconflow'
  }
  return ''
}

function resolveApiKey(provider, config) {
  if (provider === 'siliconflow') {
    return String(
      process.env.SILICONFLOW_API_KEY ||
        process.env.VOICE_TO_TEXT_API_KEY ||
        config.siliconflowApiKey ||
        config.voiceToTextApiKey ||
        ''
    ).trim()
  }
  if (provider === 'groq') {
    return String(
      process.env.GROQ_API_KEY ||
        process.env.VOICE_TO_TEXT_API_KEY ||
        config.groqApiKey ||
        config.voiceToTextApiKey ||
        ''
    ).trim()
  }
  return ''
}

function resolveEndpoint(provider, config) {
  if (provider === 'siliconflow') {
    return String(
      config.siliconflowBaseUrl || 'https://api.siliconflow.cn/v1/audio/transcriptions'
    ).trim()
  }
  return String(
    config.groqBaseUrl || 'https://api.groq.com/openai/v1/audio/transcriptions'
  ).trim()
}

function resolveModel(provider, config) {
  const override = String(config.voiceToTextModel || process.env.VOICE_TO_TEXT_MODEL || '').trim()
  if (override) return override
  if (provider === 'groq') return 'whisper-large-v3-turbo'
  return 'FunAudioLLM/SenseVoiceSmall'
}

export function getVoiceToTextStatus(config = loadConfig()) {
  const provider = resolveProvider(config)
  const apiKey = provider ? resolveApiKey(provider, config) : ''
  return {
    enabled: Boolean(provider && apiKey),
    provider: provider || '',
    model: provider ? resolveModel(provider, config) : ''
  }
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, mime?: string }} meta
 * @returns {Promise<string>}
 */
export async function transcribeVoiceBuffer(buffer, meta = {}) {
  const config = loadConfig()
  const provider = resolveProvider(config)
  if (!provider) {
    const err = new Error(
      '未配置语音转文字。请在 config.json 填写 voiceToTextApiKey（硅基流动免费 Key），或设置环境变量 SILICONFLOW_API_KEY'
    )
    err.status = 503
    throw err
  }
  const apiKey = resolveApiKey(provider, config)
  if (!apiKey) {
    const err = new Error(
      provider === 'groq'
        ? '未配置 GROQ_API_KEY'
        : '未配置硅基流动 API Key（SILICONFLOW_API_KEY / voiceToTextApiKey）'
    )
    err.status = 503
    throw err
  }

  const filename = String(meta.filename || 'voice.wav').replace(/[^\w.\-]+/g, '_') || 'voice.wav'
  const mime = String(meta.mime || 'audio/wav').trim() || 'audio/wav'
  const model = resolveModel(provider, config)
  const endpoint = resolveEndpoint(provider, config)

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), filename)
  form.append('model', model)
  if (provider === 'groq') {
    form.append('language', 'zh')
    form.append('response_format', 'json')
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  })
  const raw = await res.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error?.message || data.msg)) ||
      raw.slice(0, 200) ||
      `转写失败 HTTP ${res.status}`
    const err = new Error(String(msg))
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  const text = String(data?.text ?? data?.result ?? data?.data?.text ?? '').trim()
  if (!text) {
    const err = new Error('未识别到有效文字')
    err.status = 422
    throw err
  }
  return text
}
