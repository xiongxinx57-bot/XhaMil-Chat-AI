import { loadConfig, saveConfig } from './config.js'

export const DEFAULT_BANNED_WORDS_MASK = '*'

const MASKABLE_TYPES = new Set(['text', 'announcement', 'ai'])

export function parseWordsList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
}

function normalizeMaskChar(value) {
  const s = String(value ?? '').trim()
  if (!s) return DEFAULT_BANNED_WORDS_MASK
  return s.slice(0, 4)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getBannedWordsConfig(config = loadConfig()) {
  return {
    enabled: !!config.bannedWordsEnabled,
    words: parseWordsList(config.bannedWordsText),
    maskChar: normalizeMaskChar(config.bannedWordsMask),
    activePresetId: String(config.bannedWordsActivePresetId || '').trim() || null
  }
}

export function shouldMaskMessageType(messageType) {
  return MASKABLE_TYPES.has(String(messageType || 'text').toLowerCase())
}

export function findMatchedBannedWords(text, words = getBannedWordsConfig().words) {
  const hay = String(text || '')
  if (!hay || !Array.isArray(words) || !words.length) return []
  const hits = []
  for (const word of words) {
    if (!word) continue
    if (new RegExp(escapeRegExp(word), 'i').test(hay)) hits.push(word)
  }
  return hits
}

export function containsBannedWords(text, config = getBannedWordsConfig()) {
  if (!config.enabled || text == null || !config.words.length) return false
  return findMatchedBannedWords(text, config.words).length > 0
}

export function maskBannedWords(text, config = getBannedWordsConfig()) {
  if (!config.enabled || text == null || !config.words.length) return text
  let result = String(text)
  const unit = config.maskChar || DEFAULT_BANNED_WORDS_MASK
  const words = [...config.words].sort((a, b) => b.length - a.length)

  for (const word of words) {
    if (!word) continue
    const re = new RegExp(escapeRegExp(word), 'gi')
    result = result.replace(re, (match) => {
      if (unit.length === 1) return unit.repeat(match.length)
      return unit.repeat(Math.ceil(match.length / unit.length)).slice(0, match.length)
    })
  }
  return result
}

export function maskMessageContent(content, messageType, config = getBannedWordsConfig()) {
  if (!shouldMaskMessageType(messageType)) return content
  return maskBannedWords(content, config)
}

export function saveBannedWordsConfig(body = {}) {
  const cfg = loadConfig()
  const current = getBannedWordsConfig(cfg)
  const enabled = body.enabled !== undefined ? !!body.enabled : current.enabled
  const nextWordsText =
    body.wordsText !== undefined ? String(body.wordsText ?? '') : String(cfg.bannedWordsText ?? '')
  const maskChar =
    body.maskChar !== undefined ? normalizeMaskChar(body.maskChar) : current.maskChar
  const activePresetId =
    body.activePresetId !== undefined
      ? String(body.activePresetId || '').trim() || null
      : current.activePresetId

  if (!maskChar) throw new Error('屏蔽字符不能为空')

  saveConfig({
    bannedWordsEnabled: enabled,
    bannedWordsText: nextWordsText,
    bannedWordsMask: maskChar,
    bannedWordsActivePresetId: activePresetId
  })

  const saved = getBannedWordsConfig()
  return {
    enabled: saved.enabled,
    wordsText: nextWordsText,
    maskChar: saved.maskChar,
    wordCount: saved.words.length,
    activePresetId: saved.activePresetId
  }
}
