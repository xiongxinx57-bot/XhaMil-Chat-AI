import { loadConfig, saveConfig } from './config.js'
import { resolveGroupByCode } from './db.js'

export const DEFAULT_DRAW_GUESS_WORD_BANK = {
  餐具: ['勺子', '筷子', '碗', '盘子', '杯子', '叉子', '刀', '锅', '砧板', '水壶', '蒸笼', '漏勺'],
  动物: ['猫', '狗', '兔子', '老虎', '狮子', '大象', '熊猫', '猴子', '鸟', '鱼', '青蛙', '蝴蝶'],
  水果: ['苹果', '香蕉', '葡萄', '西瓜', '草莓', '橙子', '梨', '桃子', '樱桃', '菠萝', '芒果', '柠檬'],
  交通: ['汽车', '自行车', '飞机', '火车', '地铁', '公交车', '轮船', '摩托车', '火箭', '直升机', '出租车', '滑板'],
  运动: ['足球', '篮球', '羽毛球', '乒乓球', '游泳', '跑步', '滑雪', '网球', '排球', '跳绳', '瑜伽', '拳击'],
  日常: ['手机', '电脑', '雨伞', '眼镜', '钥匙', '书包', '手表', '相机', '耳机', '台灯', '充电器', '闹钟'],
  职业: ['医生', '护士', '警察', '消防员', '厨师', '司机', '老师', '农民', '画家', '歌手', '记者', '程序员'],
  天气: ['太阳', '月亮', '星星', '云', '雨', '雪', '彩虹', '闪电', '风', '雾', '台风', '霜']
}

function clampOptionCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 6
  return Math.min(8, Math.max(4, Math.floor(n)))
}

function normalizeWordBank(raw, fallback = DEFAULT_DRAW_GUESS_WORD_BANK) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return structuredClone(fallback)
  const bank = {}
  for (const [cat, words] of Object.entries(raw)) {
    const name = String(cat || '').trim().slice(0, 20)
    if (!name) continue
    const list = (Array.isArray(words) ? words : [])
      .map((w) => String(w || '').trim().slice(0, 20))
      .filter(Boolean)
    const unique = [...new Set(list)]
    if (unique.length >= 2) bank[name] = unique
  }
  return Object.keys(bank).length ? bank : structuredClone(fallback)
}

export function normalizeAssignedGroups(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const list = []
  for (const item of raw) {
    const conversationId = Number(item?.conversationId)
    if (!conversationId || seen.has(conversationId)) continue
    seen.add(conversationId)
    list.push({
      conversationId,
      groupCode: String(item?.groupCode || '').trim(),
      groupTitle: String(item?.groupTitle || '群聊').trim().slice(0, 64) || '群聊'
    })
  }
  return list
}

export function parseDrawGuessWordBankJson(jsonText, fallback = DEFAULT_DRAW_GUESS_WORD_BANK) {
  if (!jsonText) return structuredClone(fallback)
  try {
    return normalizeWordBank(JSON.parse(String(jsonText)), fallback)
  } catch {
    return structuredClone(fallback)
  }
}

export function getDrawGuessWordBank(config = loadConfig()) {
  return parseDrawGuessWordBankJson(config.drawGuessWordBankJson, DEFAULT_DRAW_GUESS_WORD_BANK)
}

export function getDrawGuessAssignedGroups(config = loadConfig()) {
  return normalizeAssignedGroups(config.drawGuessAssignedGroups)
}

export function isDrawGuessAllowedForConversation(conversationId, config = loadConfig()) {
  const enabled = config.drawGuessEnabled !== false
  if (!enabled) return false
  const id = Number(conversationId)
  if (!id) return false
  const assigned = getDrawGuessAssignedGroups(config)
  if (!assigned.length) return false
  return assigned.some((item) => Number(item.conversationId) === id)
}

export function assertDrawGuessAllowed(conversationId, config = loadConfig()) {
  if (config.drawGuessEnabled === false) {
    throw new Error('你画我猜功能暂未开放')
  }
  if (!isDrawGuessAllowedForConversation(conversationId, config)) {
    throw new Error('该群未开放你画我猜，请联系管理员分配')
  }
}

export function getDrawGuessConfig(config = loadConfig()) {
  const wordBank = getDrawGuessWordBank(config)
  const categories = Object.entries(wordBank).map(([name, words]) => ({ name, words }))
  const assignedGroups = getDrawGuessAssignedGroups(config)
  return {
    enabled: config.drawGuessEnabled !== false,
    styleName: String(config.drawGuessStyleName || '经典题材').trim().slice(0, 32) || '经典题材',
    activePresetId: String(config.drawGuessActivePresetId || 'classic').trim().slice(0, 32) || 'classic',
    optionCount: clampOptionCount(config.drawGuessOptionCount),
    wordBank,
    wordBankJson: JSON.stringify(wordBank, null, 2),
    categories,
    categoryCount: categories.length,
    wordCount: categories.reduce((sum, item) => sum + item.words.length, 0),
    assignedGroups,
    assignedGroupCount: assignedGroups.length
  }
}

export function saveDrawGuessConfig(body = {}) {
  const cfg = loadConfig()
  const current = getDrawGuessConfig(cfg)

  let wordBank = current.wordBank
  if (body.wordBank !== undefined) {
    wordBank = normalizeWordBank(body.wordBank)
  } else if (body.wordBankJson !== undefined) {
    wordBank = parseDrawGuessWordBankJson(String(body.wordBankJson ?? ''))
  }

  if (!Object.keys(wordBank).length) {
    throw new Error('至少保留一个有效分类，且每个分类不少于 2 个词')
  }

  const enabled = body.enabled !== undefined ? !!body.enabled : current.enabled
  const styleName = body.styleName !== undefined
    ? String(body.styleName || '').trim().slice(0, 32) || '经典题材'
    : current.styleName
  const activePresetId = body.activePresetId !== undefined
    ? String(body.activePresetId || '').trim().slice(0, 32) || 'classic'
    : current.activePresetId
  const optionCount = body.optionCount !== undefined
    ? clampOptionCount(body.optionCount)
    : current.optionCount

  saveConfig({
    drawGuessEnabled: enabled,
    drawGuessStyleName: styleName,
    drawGuessActivePresetId: activePresetId,
    drawGuessOptionCount: optionCount,
    drawGuessWordBankJson: JSON.stringify(wordBank, null, 2)
  })

  return getDrawGuessConfig()
}

export async function assignDrawGuessGroupByCode(groupCode) {
  const group = await resolveGroupByCode(groupCode)
  const cfg = loadConfig()
  const assigned = getDrawGuessAssignedGroups(cfg)
  if (assigned.some((item) => Number(item.conversationId) === group.conversationId)) {
    throw new Error('该群已开放你画我猜')
  }
  const next = [
    ...assigned,
    {
      conversationId: group.conversationId,
      groupCode: group.groupCode,
      groupTitle: group.groupTitle
    }
  ]
  saveConfig({ drawGuessAssignedGroups: next })
  return {
    message: `已为群「${group.groupTitle}」开放你画我猜`,
    assignedGroups: next
  }
}

export async function unassignDrawGuessGroup(conversationId) {
  const id = Number(conversationId)
  if (!id) throw new Error('无效的群 ID')
  const cfg = loadConfig()
  const assigned = getDrawGuessAssignedGroups(cfg)
  const next = assigned.filter((item) => Number(item.conversationId) !== id)
  if (next.length === assigned.length) throw new Error('该群未开放你画我猜')
  saveConfig({ drawGuessAssignedGroups: next })
  return {
    message: '已取消群开放',
    assignedGroups: next
  }
}

export async function unassignDrawGuessGroupByCode(groupCode) {
  const group = await resolveGroupByCode(groupCode)
  return unassignDrawGuessGroup(group.conversationId)
}
