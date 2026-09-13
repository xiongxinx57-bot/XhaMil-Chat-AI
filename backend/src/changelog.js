import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { JSON_DIR } from './config.js'

const CHANGELOG_PATH = path.join(JSON_DIR, 'changelog.json')
const MAX_ENTRIES = 80
const MAX_ITEMS = 30
const MAX_ITEM_LEN = 120
const MAX_TITLE = 48
const MAX_VERSION = 32

function ensureFile() {
  fs.mkdirSync(JSON_DIR, { recursive: true })
  if (!fs.existsSync(CHANGELOG_PATH)) {
    fs.writeFileSync(
      CHANGELOG_PATH,
      JSON.stringify({ entries: [] }, null, 2) + '\n',
      'utf8'
    )
  }
}

function readRaw() {
  ensureFile()
  try {
    const raw = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'))
    const entries = Array.isArray(raw?.entries) ? raw.entries : []
    return { entries }
  } catch {
    return { entries: [] }
  }
}

function writeRaw(data) {
  ensureFile()
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function normalizeItems(raw) {
  let list = []
  if (Array.isArray(raw)) {
    list = raw.map((x) => String(x ?? '').trim())
  } else {
    list = String(raw ?? '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s·•\-*、.]+/, '').trim())
  }
  const out = []
  for (const line of list) {
    if (!line) continue
    if (line.length > MAX_ITEM_LEN) {
      throw new Error(`每条更新说明最多 ${MAX_ITEM_LEN} 字`)
    }
    out.push(line)
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

function normalizeEntry(input = {}, { requireId = false } = {}) {
  const id = String(input.id || '').trim() || crypto.randomBytes(8).toString('hex')
  if (requireId && !String(input.id || '').trim()) {
    throw new Error('缺少日志 id')
  }
  const version = String(input.version ?? '').trim()
  if (!version) throw new Error('请填写版本号')
  if (version.length > MAX_VERSION) throw new Error(`版本号最多 ${MAX_VERSION} 字`)

  const title = String(input.title ?? '').trim()
  if (title.length > MAX_TITLE) throw new Error(`标题最多 ${MAX_TITLE} 字`)

  let date = String(input.date ?? '').trim()
  if (!date) {
    const d = new Date()
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式应为 YYYY-MM-DD')
  }

  const items = normalizeItems(input.items ?? input.content ?? '')
  if (!items.length) throw new Error('请至少写一条更新内容')

  const published = input.published === false || input.published === 0 ? false : true
  const now = new Date().toISOString()

  return {
    id,
    version,
    title,
    date,
    items,
    published,
    createdAt: String(input.createdAt || now),
    updatedAt: now
  }
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const da = String(a.date || '')
    const db = String(b.date || '')
    if (da !== db) return db.localeCompare(da)
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
}

function mapPublic(entry) {
  return {
    id: entry.id,
    version: entry.version,
    title: entry.title || '',
    date: entry.date,
    items: Array.isArray(entry.items) ? entry.items : []
  }
}

/** App 关于页公开列表（仅已发布） */
export function listChangelogPublic() {
  const { entries } = readRaw()
  return {
    list: sortEntries(entries.filter((e) => e && e.published !== false)).map(mapPublic)
  }
}

/** 后台完整列表 */
export function listChangelogAdmin() {
  const { entries } = readRaw()
  return { list: sortEntries(entries) }
}

export function createChangelogEntry(body = {}) {
  const { entries } = readRaw()
  if (entries.length >= MAX_ENTRIES) {
    throw new Error(`最多保存 ${MAX_ENTRIES} 条更新日志`)
  }
  const entry = normalizeEntry(body)
  // 新建时忽略外来 id 冲突
  if (entries.some((e) => e.id === entry.id)) {
    entry.id = crypto.randomBytes(8).toString('hex')
  }
  entries.unshift(entry)
  writeRaw({ entries: sortEntries(entries) })
  return entry
}

export function updateChangelogEntry(id, body = {}) {
  const key = String(id || '').trim()
  if (!key) throw new Error('缺少日志 id')
  const { entries } = readRaw()
  const idx = entries.findIndex((e) => e.id === key)
  if (idx < 0) throw new Error('日志不存在')
  const prev = entries[idx]
  const entry = normalizeEntry(
    {
      ...prev,
      ...body,
      id: key,
      createdAt: prev.createdAt
    },
    { requireId: true }
  )
  entries[idx] = entry
  writeRaw({ entries: sortEntries(entries) })
  return entry
}

export function deleteChangelogEntry(id) {
  const key = String(id || '').trim()
  if (!key) throw new Error('缺少日志 id')
  const { entries } = readRaw()
  const next = entries.filter((e) => e.id !== key)
  if (next.length === entries.length) throw new Error('日志不存在')
  writeRaw({ entries: next })
  return { ok: true }
}

export function setChangelogPublished(id, published) {
  return updateChangelogEntry(id, { published: !!published })
}
