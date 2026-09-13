import path from 'path'
import { loadConfig, saveConfig, ABOUT_PAGE_URL_PREFIX } from './config.js'

export const DEFAULT_ABOUT_TAGLINE = '用心做好每一次聊天'
export const DEFAULT_ABOUT_CREDITS_TITLE = '致谢'
export const DEFAULT_ABOUT_DEVELOPER_NAME = 'xhaoy'
export const DEFAULT_ABOUT_DEVELOPER_ROLE = '全栈开发 · 独自扛下所有'
export const DEFAULT_ABOUT_DEVELOPER_BADGE = 'Dev'
export const DEFAULT_ABOUT_THANKS_TITLE = '特别鸣谢'
export const DEFAULT_ABOUT_THANKS_HINT = '开发狂魔 + 测试运营双人组'
export const DEFAULT_ABOUT_COPYRIGHT = '© XhaMil · xhaoy'

export const DEFAULT_ABOUT_THANKS = [
  { name: 'xhaoy', role: '前端开发', tint: '#2F6FED', avatarUrl: '' },
  { name: 'xhaoy', role: '后端优化', tint: '#10B981', avatarUrl: '' },
  { name: 'xhaoy', role: '产品设计', tint: '#8B5CF6', avatarUrl: '' },
  { name: 'xhaoy', role: '交互动效', tint: '#F97316', avatarUrl: '' },
  { name: 'xhaoy', role: '音视频架构', tint: '#EA4335', avatarUrl: '' },
  { name: 'xhaoy', role: '安全与性能', tint: '#06B6D4', avatarUrl: '' },
  { name: 'xhaoy', role: '运维部署', tint: '#EC4899', avatarUrl: '' },
  { name: 'xhaoy', role: '深夜修 Bug', tint: '#64748B', avatarUrl: '' },
  { name: 'fuyelk', role: '测试运营', tint: '#0EA5E9', avatarUrl: '' },
  { name: 'DOYWB🤔', role: '测试运营', tint: '#A855F7', avatarUrl: '' }
]

function normalizeText(value, fallback, maxLen, label) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (text.length > maxLen) throw new Error(`${label}不能超过 ${maxLen} 个字符`)
  return text
}

function normalizeOptionalText(value, maxLen, label) {
  const text = String(value ?? '').trim()
  if (text.length > maxLen) throw new Error(`${label}不能超过 ${maxLen} 个字符`)
  return text
}

function normalizeTint(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '#2F6FED'
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    throw new Error('颜色请使用 #RRGGBB 格式')
  }
  return `#${hex.toUpperCase().slice(0, 6)}`
}

function normalizeThanksItem(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`特别鸣谢第 ${index + 1} 项无效`)
  }
  const name = normalizeText(raw.name, '', 32, `特别鸣谢第 ${index + 1} 项名字`)
  if (!name) throw new Error(`特别鸣谢第 ${index + 1} 项请填写名字`)
  const role = normalizeText(raw.role, '', 48, `特别鸣谢第 ${index + 1} 项角色`)
  if (!role) throw new Error(`特别鸣谢第 ${index + 1} 项请填写角色`)
  return {
    name,
    role,
    tint: normalizeTint(raw.tint),
    avatarUrl: normalizeOptionalText(raw.avatarUrl, 512, `特别鸣谢第 ${index + 1} 项头像`)
  }
}

function parseThanksJson(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_ABOUT_THANKS.map((item) => ({ ...item }))
  }
  let parsed
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('特别鸣谢列表 JSON 无效')
  }
  if (!Array.isArray(parsed)) throw new Error('特别鸣谢必须是数组')
  if (parsed.length > 40) throw new Error('特别鸣谢最多 40 人')
  return parsed.map((item, i) => normalizeThanksItem(item, i))
}

export function getAboutPageConfig(config = loadConfig()) {
  return {
    tagline: normalizeText(config.aboutTagline, DEFAULT_ABOUT_TAGLINE, 64, '关于页标语'),
    creditsTitle: normalizeText(
      config.aboutCreditsTitle,
      DEFAULT_ABOUT_CREDITS_TITLE,
      32,
      '致谢标题'
    ),
    developerName: normalizeText(
      config.aboutDeveloperName,
      DEFAULT_ABOUT_DEVELOPER_NAME,
      32,
      '开发者名字'
    ),
    developerRole: normalizeText(
      config.aboutDeveloperRole,
      DEFAULT_ABOUT_DEVELOPER_ROLE,
      64,
      '开发者角色'
    ),
    developerBadge: normalizeText(
      config.aboutDeveloperBadge,
      DEFAULT_ABOUT_DEVELOPER_BADGE,
      16,
      '开发者徽章'
    ),
    developerAvatarUrl: normalizeOptionalText(
      config.aboutDeveloperAvatarUrl,
      512,
      '开发者头像'
    ),
    thanksTitle: normalizeText(
      config.aboutThanksTitle,
      DEFAULT_ABOUT_THANKS_TITLE,
      32,
      '特别鸣谢标题'
    ),
    thanksHint:
      config.aboutThanksHint === undefined || config.aboutThanksHint === null
        ? DEFAULT_ABOUT_THANKS_HINT
        : normalizeOptionalText(config.aboutThanksHint, 80, '特别鸣谢说明'),
    copyright: normalizeText(config.aboutCopyright, DEFAULT_ABOUT_COPYRIGHT, 80, '版权文案'),
    thanks: parseThanksJson(config.aboutThanksJson)
  }
}

export function getAboutPagePublic(config = loadConfig()) {
  return getAboutPageConfig(config)
}

export function saveAboutPageConfig(body = {}) {
  const current = getAboutPageConfig()
  const next = {
    tagline:
      body.tagline !== undefined
        ? normalizeText(body.tagline, DEFAULT_ABOUT_TAGLINE, 64, '关于页标语')
        : current.tagline,
    creditsTitle:
      body.creditsTitle !== undefined
        ? normalizeText(body.creditsTitle, DEFAULT_ABOUT_CREDITS_TITLE, 32, '致谢标题')
        : current.creditsTitle,
    developerName:
      body.developerName !== undefined
        ? normalizeText(body.developerName, DEFAULT_ABOUT_DEVELOPER_NAME, 32, '开发者名字')
        : current.developerName,
    developerRole:
      body.developerRole !== undefined
        ? normalizeText(body.developerRole, DEFAULT_ABOUT_DEVELOPER_ROLE, 64, '开发者角色')
        : current.developerRole,
    developerBadge:
      body.developerBadge !== undefined
        ? normalizeText(body.developerBadge, DEFAULT_ABOUT_DEVELOPER_BADGE, 16, '开发者徽章')
        : current.developerBadge,
    developerAvatarUrl:
      body.developerAvatarUrl !== undefined
        ? normalizeOptionalText(body.developerAvatarUrl, 512, '开发者头像')
        : current.developerAvatarUrl,
    thanksTitle:
      body.thanksTitle !== undefined
        ? normalizeText(body.thanksTitle, DEFAULT_ABOUT_THANKS_TITLE, 32, '特别鸣谢标题')
        : current.thanksTitle,
    thanksHint:
      body.thanksHint !== undefined
        ? normalizeOptionalText(body.thanksHint, 80, '特别鸣谢说明')
        : current.thanksHint,
    copyright:
      body.copyright !== undefined
        ? normalizeText(body.copyright, DEFAULT_ABOUT_COPYRIGHT, 80, '版权文案')
        : current.copyright,
    thanks:
      body.thanks !== undefined
        ? parseThanksJson(body.thanks)
        : current.thanks
  }

  saveConfig({
    aboutTagline: next.tagline,
    aboutCreditsTitle: next.creditsTitle,
    aboutDeveloperName: next.developerName,
    aboutDeveloperRole: next.developerRole,
    aboutDeveloperBadge: next.developerBadge,
    aboutDeveloperAvatarUrl: next.developerAvatarUrl,
    aboutThanksTitle: next.thanksTitle,
    aboutThanksHint: next.thanksHint,
    aboutCopyright: next.copyright,
    aboutThanksJson: JSON.stringify(next.thanks)
  })
  return getAboutPageConfig()
}

export function aboutPageAvatarUrlFromFilename(filename) {
  const name = path.basename(String(filename || ''))
  if (!name || name.includes('..')) throw new Error('无效文件名')
  return `${ABOUT_PAGE_URL_PREFIX}/${name}`
}
