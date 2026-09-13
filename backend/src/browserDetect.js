/** 从 User-Agent 识别主流浏览器（工作台客户端洞察） */
export function detectBrowserKey(userAgent) {
  const ua = String(userAgent || '')
  if (!ua.trim()) return null
  const lower = ua.toLowerCase()

  if (lower.includes('quark')) return 'quark'
  if (lower.includes('ucbrowser') || lower.includes('ucweb/')) return 'quark'
  if (lower.includes('edg/') || lower.includes('edge/')) return 'edge'
  if (lower.includes('opr/') || lower.includes('opera')) return 'opera'
  if (lower.includes('firefox') || lower.includes('fxios')) return 'firefox'
  if (lower.includes('safari') && !lower.includes('chrome') && !lower.includes('chromium')) return 'safari'
  if (lower.includes('chrome') || lower.includes('crios')) return 'chrome'

  return null
}

export const BROWSER_INSIGHT_ORDER = ['chrome', 'edge', 'safari', 'firefox', 'opera', 'quark']

export const BROWSER_INSIGHT_META = {
  chrome: { name: 'Chrome', label: '谷歌浏览器', color: '#4285F4', icon: 'chrome' },
  edge: { name: 'Edge', label: '微软浏览器', color: '#0078D7', icon: 'edge' },
  safari: { name: 'Safari', label: '苹果浏览器', color: '#FAAD14', icon: 'safari' },
  firefox: { name: 'Firefox', label: '火狐浏览器', color: '#374151', icon: 'firefox' },
  opera: { name: 'Opera', label: '欧朋浏览器', color: '#10B981', icon: 'opera' },
  quark: { name: '夸克', label: 'UC 浏览器', color: '#EF4444', icon: 'quark' }
}

export function buildBrowserInsights(rows) {
  const countMap = new Map()
  for (const row of rows) {
    const key = String(row.browser || '').trim()
    if (!key) continue
    countMap.set(key, Number(row.count) || 0)
  }
  const total = BROWSER_INSIGHT_ORDER.reduce((sum, key) => sum + (countMap.get(key) || 0), 0) || 1
  return BROWSER_INSIGHT_ORDER.map((key) => {
    const meta = BROWSER_INSIGHT_META[key]
    const count = countMap.get(key) || 0
    return {
      key,
      name: meta.name,
      label: meta.label,
      count,
      percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      color: meta.color,
      icon: meta.icon
    }
  })
}
