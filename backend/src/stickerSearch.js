/**
 * 免费表情包搜索：优先「发表情」站（更新鲜的斗图/GIF）+ 百度通道补充。
 * apihz 密钥可用 STICKER_SEARCH_ID / STICKER_SEARCH_KEY 覆盖。
 */

const BAIDU_ENDPOINT = 'https://cn.apihz.cn/api/img/apihzbqbbaidu.php'
const DEFAULT_ID = '88888888'
const DEFAULT_KEY = '88888888'
const MAX_WORDS = 20
const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

function normalizeImageUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
  if (!url) return ''
  if (url.startsWith('//')) url = `https:${url}`
  if (!/^https?:\/\//i.test(url)) return ''
  // 丢掉站点无关小图标
  if (/\.(?:ico|svg)(?:[?#]|$)/i.test(url)) return ''
  if (/avatar|logo|icon|sprite/i.test(url) && !/soutula|baidu\.com\/it\//i.test(url)) return ''
  return url
}

function pushUnique(list, seen, imageUrl, filename) {
  const url = normalizeImageUrl(imageUrl)
  if (!url || seen.has(url)) return
  seen.add(url)
  list.push({ filename, url })
}

async function fetchText(url, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/json,*/*',
        'User-Agent': UA,
        Referer: 'https://fabiaoqing.com/'
      },
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`上游 ${res.status}`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** 发表情 / 搜图啦：关键词搜索，偏新斗图 GIF */
async function searchFabiaoqing(words, pageNum) {
  const encoded = encodeURIComponent(words)
  const path =
    pageNum <= 1
      ? `https://fabiaoqing.com/search/bqb/keyword/${encoded}`
      : `https://fabiaoqing.com/search/bqb/keyword/${encoded}/page/${pageNum}.html`
  const html = await fetchText(path)
  const re =
    /https?:\/\/(?:img\.)?(?:soutula\.com|sinaimg\.cn|fabiaoqing\.com)\/[^"'\\s<>]+?\.(?:gif|jpg|jpeg|png|webp)/gi
  const matches = html.match(re) || []
  const seen = new Set()
  const list = []
  for (let i = 0; i < matches.length; i += 1) {
    pushUnique(list, seen, matches[i], `fbq_${pageNum}_${i}`)
  }
  return list
}

/** 百度表情通道：覆盖更广 */
async function searchBaidu(words, pageNum) {
  const id = String(process.env.STICKER_SEARCH_ID || DEFAULT_ID).trim() || DEFAULT_ID
  const key = String(process.env.STICKER_SEARCH_KEY || DEFAULT_KEY).trim() || DEFAULT_KEY
  const url = new URL(BAIDU_ENDPOINT)
  url.searchParams.set('id', id)
  url.searchParams.set('key', key)
  url.searchParams.set('words', words)
  url.searchParams.set('page', String(pageNum))
  url.searchParams.set('limit', '40')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  let data
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: controller.signal
    })
    data = await res.json().catch(() => null)
    if (!res.ok) throw new Error((data && data.msg) || `百度通道异常 (${res.status})`)
  } finally {
    clearTimeout(timer)
  }
  if (!data || Number(data.code) !== 200) {
    throw new Error((data && data.msg) || '百度通道无结果')
  }
  const rawList = Array.isArray(data.res) ? data.res : []
  const seen = new Set()
  const list = []
  for (let i = 0; i < rawList.length; i += 1) {
    pushUnique(list, seen, rawList[i], `bd_${pageNum}_${i}`)
  }
  return list
}

export async function searchFreeStickers(query, page = 1) {
  const words = String(query || '').trim().slice(0, MAX_WORDS)
  const pageNum = Math.max(1, Math.min(50, Number(page) || 1))
  if (!words) {
    return { list: [], page: pageNum, query: '', source: '' }
  }

  const settled = await Promise.allSettled([
    searchFabiaoqing(words, pageNum),
    searchBaidu(words, pageNum)
  ])

  const seen = new Set()
  const list = []
  const sources = []
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const chunk = result.value || []
    if (!chunk.length) continue
    sources.push(chunk[0]?.filename?.startsWith('fbq_') ? 'fabiaoqing' : 'baidu')
    for (const item of chunk) {
      pushUnique(list, seen, item.url, item.filename)
    }
  }

  if (!list.length) {
    const errs = settled
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason || ''))
      .filter(Boolean)
    throw new Error(errs[0] || '未找到相关表情包')
  }

  return {
    list,
    page: pageNum,
    query: words,
    source: sources.join('+') || 'mixed'
  }
}
