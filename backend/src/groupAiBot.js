import { normalizeAvatarUrl } from './config.js'

/** DeepSeek 官方 OpenAI 兼容接口（见 https://api-docs.deepseek.com/） */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_MODELS = Object.freeze([
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
])

const DEEPSEEK_MODEL_IDS = new Set(DEEPSEEK_MODELS.map((m) => m.id))

export function mapAiMessageRow(row, viewerUserId) {
  const name = row.aiBotName || row.ai_bot_name || row.botName || 'AI助手'
  const avatar = normalizeAvatarUrl(row.aiBotAvatar || row.ai_bot_avatar || row.botAvatar || '')
  return {
    id: row.id,
    conversationId: row.conversationId ?? row.conversation_id,
    userId: null,
    aiBotId: row.aiBotId ?? row.ai_bot_id ?? null,
    content: row.content || '',
    messageType: 'ai',
    type: 'ai',
    imageUrl: '',
    photoUrl: '',
    voiceUrl: '',
    voiceDuration: 0,
    isSelf: false,
    createdAt: row.createdAt ?? row.created_at,
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    deleted: !!(row.deletedAt ?? row.deleted_at),
    username: name,
    nickname: name,
    avatarUrl: avatar,
    isAi: true
  }
}

export function parseMentionNames(raw) {
  return String(raw || '')
    .split(/[,，、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function getBotTriggerNames(bot) {
  const names = new Set()
  const main = String(bot?.name || '').trim()
  if (main) names.add(main)
  for (const n of parseMentionNames(bot?.mentionNames ?? bot?.mention_names)) {
    names.add(n)
  }
  return [...names]
}

export function isBotMentioned(content, bot) {
  const text = String(content || '').trim()
  if (!text) return false
  const names = getBotTriggerNames(bot)
  if (!names.length) return false
  for (const name of names) {
    if (text.includes(`@${name}`)) return true
    if (text.startsWith(name)) return true
    const re = new RegExp(`(^|[\\s，,。！？!?])${escapeRegExp(name)}([\\s，,。！？!?]|$)`)
    if (re.test(text)) return true
  }
  return false
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function botDisplayName(bot) {
  return String(bot?.name || 'AI助手').trim() || 'AI助手'
}

export function getConfiguredSystemPrompt(bot) {
  return String(bot.systemPrompt ?? bot.system_prompt ?? '').trim()
}

/** DeepSeek 不支持 persona_id；保留读取仅用于兼容旧数据并入系统提示 */
export function getConfiguredPersonaId(bot) {
  return String(bot.personaId ?? bot.persona_id ?? '').trim()
}

export function normalizeDeepseekModel(raw) {
  const m = String(raw || '').trim()
  if (DEEPSEEK_MODEL_IDS.has(m)) return m
  // 官方文档：旧名 deepseek-chat / deepseek-reasoner 将淘汰，映射到 V4
  if (m === 'deepseek-chat' || m === 'deepseek-reasoner') return DEEPSEEK_DEFAULT_MODEL
  return DEEPSEEK_DEFAULT_MODEL
}

export function normalizeDeepseekBaseUrl(_raw) {
  return DEEPSEEK_BASE_URL
}

export function resolveDeepseekChatUrl() {
  // 官方示例：https://api.deepseek.com/chat/completions
  return `${DEEPSEEK_BASE_URL}/chat/completions`
}

function buildLegacySystemPrompt(bot) {
  const name = botDisplayName(bot)
  const persona = String(bot.persona || '').trim()
  const personality = String(bot.personality || '').trim()
  const knowledge = String(bot.knowledgeBase ?? bot.knowledge_base ?? '').trim()
  const parts = [`你是${name}。`]
  if (persona) parts.push(`人设：${persona}`)
  if (personality) parts.push(`性格：${personality}`)
  if (knowledge) parts.push(`知识库：${knowledge}`)
  return parts.join('\n')
}

/** 群聊输出硬规则：真人微信口吻，禁止剧本括号旁白；人设仍可完整保留 */
const CHAT_OUTPUT_RULES = [
  '【仿人回复｜必须遵守】',
  '请根据上方人设，把回复优化成「真人在聊天软件里发消息」的口吻，不要假、不要剧本腔。',
  '1. 只写角色会真实打在输入框里的话，像真人微信/QQ 聊天。',
  '2. 严禁用括号、全角括号、星号、方括号写动作、神态、语气、心理、场景旁白。',
  '   禁止示例：（笑了笑）（声音软下来）（转身离开）*叹气* 【低头】 —— 这类一律禁止。',
  '3. 情绪与氛围只能通过正常对话本身体现，不要小说旁白、舞台提示。',
  '4. 严格保持人设身份与性格，但表达必须是正常聊天话术。',
  '5. 不要声称自己是 AI、语言模型、机器人或助手。',
  '6. 回复简洁自然；若人设要求用括号写动作，一律忽略（人设只管身份性格，不管旁白格式）。',
  '7. 禁止每句话后面都加句号、逗号。真人聊天很少写「。」「，」；短回复如「嗯」「好」「哈哈」「唔」后面不要加标点。',
  '   禁止示例：嗯。 / 好的。 / 唔， / 没事。 —— 应写成：嗯 / 好的 / 唔 / 没事',
  '   问号、感叹号可偶尔保留；不要书面作文式每句都收尾标点。'
].join('\n')

export function isHumanlikeReplyEnabled(bot) {
  const raw = bot?.humanlikeReply ?? bot?.humanlike_reply
  if (raw === undefined || raw === null || raw === '') return true
  if (raw === false || raw === 0 || raw === '0') return false
  return !!raw
}

/** 规范化随机回复秒数区间（0~120），返回 [min, max] */
export function normalizeReplyDelayRange(botOrMin, maybeMax) {
  let min
  let max
  if (botOrMin != null && typeof botOrMin === 'object') {
    min = Number(botOrMin.replyDelayMinSec ?? botOrMin.reply_delay_min_sec ?? 2)
    max = Number(botOrMin.replyDelayMaxSec ?? botOrMin.reply_delay_max_sec ?? 6)
  } else {
    min = Number(botOrMin)
    max = Number(maybeMax)
  }
  if (!Number.isFinite(min)) min = 2
  if (!Number.isFinite(max)) max = 6
  min = Math.max(0, Math.min(120, Math.floor(min)))
  max = Math.max(0, Math.min(120, Math.floor(max)))
  if (max < min) {
    const t = min
    min = max
    max = t
  }
  return [min, max]
}

/** 随机等待毫秒数；区间为 0~0 时立即回复 */
export function resolveReplyDelayMs(bot) {
  const [min, max] = normalizeReplyDelayRange(bot)
  if (max <= 0) return 0
  const sec = min + Math.floor(Math.random() * (max - min + 1))
  return sec * 1000
}

export function sleep(ms) {
  const n = Math.max(0, Number(ms) || 0)
  if (n <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, n))
}

/**
 * 清洗模型偶发的括号动作旁白（提示词之外的兜底）。
 * 保留短小、像口头补充的半角括号（如英文缩写），去掉描写性括号块。
 */
export function sanitizeAiChatReply(raw) {
  let text = String(raw || '')
  if (!text) return ''

  // 全角括号旁白（中文剧本最常见）
  text = text.replace(/（[^）\n]{1,240}）/g, '')
  // 半角括号：去掉明显描写性内容（含中文，或较长英文舞台提示）
  text = text.replace(/\(([^)]{1,240})\)/g, (_m, inner) => {
    const s = String(inner || '').trim()
    if (!s) return ''
    if (/[\u4e00-\u9fff]/.test(s)) return ''
    if (
      /^(smiles?|sighs?|laughs?|cries?|pauses?|whispers?|turns?|looks?|says?|softly|quietly|suddenly)\b/i.test(
        s
      )
    ) {
      return ''
    }
    if (s.length >= 18) return ''
    return `(${s})`
  })
  // *动作* / ＊动作＊
  text = text.replace(/[*＊][^*\n＊]{1,80}[*＊]/g, '')
  // 【动作】
  text = text.replace(/【[^】\n]{1,80}】/g, '')
  // 行首纯旁白残留（如单独的破折号描写）
  text = text
    .split('\n')
    .map((line) => line.replace(/^[ \t]*[-—–]{1,2}[ \t]+.+$/g, '').trimEnd())
    .join('\n')

  // 去掉聊天短句尾部书面句号/逗号（嗯。好的。唔，）
  text = stripCasualTrailingPunct(text)

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return text
}

/** 短回复/短分句去尾部「。」「，」等，保留问号叹号 */
function stripCasualTrailingPunct(raw) {
  let text = String(raw || '')
  if (!text) return ''

  // 常见短应和后面硬加句号/逗号
  text = text.replace(
    /(嗯+|唔+|哦+|噢+|啊+|呀+|呢|哈+|好+|行|可以|知道了|收到|在|没事|没事了|好的|嗯嗯|唔唔)[。．.，,、；;]+/g,
    '$1'
  )

  text = text
    .split('\n')
    .map((line) => {
      let s = line.replace(/[ \t]+$/g, '')
      const core = s.replace(/[。．.，,、；;！!？?\s]+$/u, '')
      // 短句（含短分句气泡）去掉句末句号/逗号
      if (core.length > 0 && core.length <= 16) {
        s = s.replace(/[。．.，,、；;]+$/u, '')
      }
      return s
    })
    .join('\n')

  // 整段结尾多余句号/逗号（长文也常假得像作文）
  text = text.replace(/([^\s。．.，,！!？?])[。．.，,、；;]+(?=\s*$)/u, '$1')
  return text
}

/**
 * 按 DeepSeek 官方用法：角色与规则放在 messages 的 system 里。
 * 参考：https://api-docs.deepseek.com/ （system: "You are a helpful assistant."）
 * DeepSeek 无 persona_id，人设全部写入 system；输出规则放在人设之后以覆盖模型默认剧本腔。
 */
export function resolveSystemPrompt(bot) {
  const name = botDisplayName(bot)
  const direct = getConfiguredSystemPrompt(bot)
  const legacyPersonaId = getConfiguredPersonaId(bot)

  const parts = [`你是「${name}」。`]

  if (direct) {
    parts.push(direct)
  } else {
    const legacy = buildLegacySystemPrompt(bot)
    if (legacy && legacy !== `你是${name}。`) {
      parts.push(legacy.replace(new RegExp(`^你是${escapeRegExp(name)}。\\s*`), ''))
    } else {
      parts.push('请用自然、简洁的口吻与用户交流。')
    }
  }

  if (legacyPersonaId) {
    parts.push(`（补充标记：${legacyPersonaId}）`)
  }

  parts.push(
    '场景：你在即时通讯群聊中被提到后回复。请保持上述身份与口吻。'
  )
  if (isHumanlikeReplyEnabled(bot)) {
    parts.push(CHAT_OUTPUT_RULES)
  }

  return parts.filter(Boolean).join('\n\n')
}

export function stripBotMentions(content, bot) {
  let text = String(content || '').trim()
  for (const name of getBotTriggerNames(bot)) {
    text = text.replace(new RegExp(`@${escapeRegExp(name)}`, 'g'), '').trim()
    if (text.startsWith(name)) text = text.slice(name.length).trim()
  }
  return text || String(content || '').trim()
}

export function maskApiKey(key) {
  const s = String(key || '')
  if (!s) return ''
  if (s.length <= 8) return '****'
  return `${s.slice(0, 4)}****${s.slice(-4)}`
}

/** 多轮上下文：按官方指南拼接近期 user/assistant（无 tools 时不带回 reasoning_content） */
export function filterAiHistory(history, bot) {
  const humanlike = isHumanlikeReplyEnabled(bot)
  const items = Array.isArray(history) ? history : []
  return items
    .filter(
      (item) =>
        item &&
        (item.role === 'user' || item.role === 'assistant') &&
        String(item.content || '').trim()
    )
    .slice(-8)
    .map((item) => {
      const content = String(item.content || '').trim()
      if (humanlike && item.role === 'assistant') {
        const cleaned = sanitizeAiChatReply(content)
        return { ...item, content: cleaned || content }
      }
      return { ...item, content }
    })
}

export function excludeCurrentUserFromHistory(history, userContent, rawContent = '') {
  const items = Array.isArray(history) ? [...history] : []
  const targets = [String(userContent || '').trim(), String(rawContent || '').trim()].filter(Boolean)
  while (items.length) {
    const last = items[items.length - 1]
    if (last?.role !== 'user') break
    const text = String(last.content || '').trim()
    const hit = targets.some(
      (t) => text === t || text.endsWith(`：${t}`) || text.endsWith(`:${t}`) || text.includes(t)
    )
    if (!hit) break
    items.pop()
  }
  return items
}

export function buildAiMessages(bot, userContent, history = []) {
  const systemContent = resolveSystemPrompt(bot)
  const messages = []
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent })
  }
  for (const item of filterAiHistory(history, bot)) {
    messages.push({ role: item.role, content: String(item.content).trim() })
  }
  messages.push({ role: 'user', content: String(userContent || '').trim() })
  return messages
}

/**
 * 仅调用 DeepSeek Chat Completions。
 * - base_url 固定官方地址
 * - 群聊关闭 thinking，保证口吻稳定、延迟更低（thinking 下 temperature 不生效）
 * @param {{ sanitizeChat?: boolean }} [options] sanitizeChat 默认 true（群聊）；举报备注等可关
 */
export async function callAiChatCompletion(bot, userContent, history = [], options = {}) {
  const apiKey = String(bot.apiKey ?? bot.api_key ?? '').trim()
  if (!apiKey) throw new Error('请填写 DeepSeek API Key')

  const model = normalizeDeepseekModel(bot.model)
  const messages = buildAiMessages(bot, userContent, history)
  const url = resolveDeepseekChatUrl()
  const sanitizeChat =
    options.sanitizeChat !== false && isHumanlikeReplyEnabled(bot)

  const payload = {
    model,
    messages,
    stream: false,
    // 官方：群聊角色扮演用非思考模式，temperature 才生效
    thinking: { type: 'disabled' },
    temperature: 0.7
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errMsg = body?.error?.message || body?.message || `DeepSeek 请求失败 (${res.status})`
    throw new Error(errMsg)
  }
  const reply = body?.choices?.[0]?.message?.content
  if (!reply || !String(reply).trim()) throw new Error('DeepSeek 未返回有效内容')
  const raw = String(reply).trim()
  if (!sanitizeChat) return raw
  const cleaned = sanitizeAiChatReply(raw)
  // 清洗后若空，退回原文（避免误杀）；否则用清洗结果
  return cleaned || raw
}
