import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { findMatchedBannedWords, getBannedWordsConfig, parseWordsList } from './bannedWords.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORDS_FILE = path.join(__dirname, 'data', 'smart-sensitive-words.txt')

let cachedLocalWords = null
let cachedMtimeMs = 0

function loadLocalSmartWords() {
  try {
    const st = fs.statSync(WORDS_FILE)
    if (cachedLocalWords && st.mtimeMs === cachedMtimeMs) return cachedLocalWords
    const text = fs.readFileSync(WORDS_FILE, 'utf8')
    const words = parseWordsList(
      text
        .split(/\r?\n/)
        .filter((line) => {
          const t = line.trim()
          return t && !t.startsWith('#')
        })
        .join('\n')
    )
    cachedLocalWords = words
    cachedMtimeMs = st.mtimeMs
    return words
  } catch (e) {
    console.error('[smart-detect] load local words failed:', e?.message || e)
    cachedLocalWords = []
    cachedMtimeMs = 0
    return cachedLocalWords
  }
}

/** 本地开源词库 ∪ 后台违禁词配置（后台审核用，不依赖「启用过滤」开关） */
export function getSmartDetectWords() {
  const local = loadLocalSmartWords()
  const admin = getBannedWordsConfig().words || []
  const seen = new Set()
  const out = []
  for (const w of [...local, ...admin]) {
    const key = String(w || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(String(w).trim())
  }
  // 长词优先，减少短词抢先误报展示顺序问题
  out.sort((a, b) => b.length - a.length)
  return out
}

export function findSmartMatchedWords(text) {
  return findMatchedBannedWords(text, getSmartDetectWords())
}

export function getSmartDetectMeta() {
  const local = loadLocalSmartWords()
  const admin = getBannedWordsConfig().words || []
  const merged = getSmartDetectWords()
  return {
    engine: 'local-open-source',
    localWordCount: local.length,
    adminWordCount: admin.length,
    mergedWordCount: merged.length,
    sourceFile: 'src/data/smart-sensitive-words.txt'
  }
}
