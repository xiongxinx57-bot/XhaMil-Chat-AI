import { normalizeRegisterIp } from './clientIp.js'

const cityCache = new Map()
const metaCache = new Map()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** 本地 / 内网 IP 在个人资料中显示的地区 */
export const LOCAL_PROFILE_REGION = '奥特曼星球'

function isPrivateIp(ip) {
  const v = String(ip || '').trim().toLowerCase()
  if (!v || v === '0.0.0.0') return true
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost') return true
  if (v.startsWith('10.')) return true
  if (v.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
  return false
}

export function formatProfileCity(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/[省市自治区特别行政区]$/.test(raw)) return raw
  return `${raw}市`
}

function normalizeCityLabel(value) {
  const raw = String(value || '').trim()
  if (!raw || /本机|未知|局域网|内网|保留/i.test(raw)) return ''
  return formatProfileCity(raw.replace(/(省|市|自治区|特别行政区)$/, ''))
}

async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchVoreCity(ip) {
  const data = await fetchJsonWithTimeout(
    `https://api.vore.top/api/IPdata?ip=${encodeURIComponent(ip)}`
  )
  const ipdata = data?.ipdata
  if (!ipdata) return ''
  return normalizeCityLabel(ipdata.info2 || ipdata.info1 || ipdata.info3)
}

async function fetchVoreMeta(ip) {
  const data = await fetchJsonWithTimeout(
    `https://api.vore.top/api/IPdata?ip=${encodeURIComponent(ip)}`
  )
  const ipdata = data?.ipdata
  if (!ipdata) return null
  return {
    country: String(ipdata.info1 || '').trim(),
    region: String(ipdata.info2 || '').trim(),
    city: String(ipdata.info3 || ipdata.info2 || '').trim(),
    isp: String(ipdata.isp || ipdata.info4 || data?.adcode?.o || '').trim()
  }
}

async function fetchIpApiCity(ip) {
  const data = await fetchJsonWithTimeout(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,city,regionName`
  )
  if (data?.status !== 'success') return ''
  return normalizeCityLabel(data.city || data.regionName)
}

async function fetchIpApiMeta(ip) {
  const data = await fetchJsonWithTimeout(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city,isp,org,as,query,mobile,proxy,hosting`
  )
  if (data?.status !== 'success') return null
  return {
    country: String(data.country || '').trim(),
    region: String(data.regionName || '').trim(),
    city: String(data.city || '').trim(),
    isp: String(data.isp || '').trim(),
    org: String(data.org || '').trim(),
    as: String(data.as || '').trim(),
    mobile: !!data.mobile,
    proxy: !!data.proxy,
    hosting: !!data.hosting
  }
}

export async function resolveIpCity(ipInput) {
  const ip = normalizeRegisterIp(ipInput)
  if (!ip) return ''
  if (isPrivateIp(ip)) return LOCAL_PROFILE_REGION

  const cached = cityCache.get(ip)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.city

  let city = await fetchVoreCity(ip)
  if (!city) city = await fetchIpApiCity(ip)

  cityCache.set(ip, { city, at: Date.now() })
  return city
}

function formatLocation(meta) {
  return [meta.country, meta.region, meta.city]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' ')
}

/** 上网 IP 归属地 / ISP，供后台展示真实网络信息 */
export async function resolveIpMeta(ipInput) {
  const ip = normalizeRegisterIp(ipInput)
  if (!ip) return { ip: '', private: true, location: '', isp: '' }
  if (isPrivateIp(ip)) {
    return {
      ip,
      private: true,
      location: LOCAL_PROFILE_REGION,
      city: LOCAL_PROFILE_REGION,
      isp: '内网 / 局域网',
      country: '',
      region: ''
    }
  }

  const cached = metaCache.get(ip)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.meta

  const [apiMeta, voreMeta] = await Promise.all([fetchIpApiMeta(ip), fetchVoreMeta(ip)])
  const merged = {
    ip,
    private: false,
    country: apiMeta?.country || voreMeta?.country || '',
    region: apiMeta?.region || voreMeta?.region || '',
    city: apiMeta?.city || voreMeta?.city || '',
    isp: apiMeta?.isp || voreMeta?.isp || '',
    org: apiMeta?.org || '',
    as: apiMeta?.as || '',
    mobile: apiMeta?.mobile || false,
    proxy: apiMeta?.proxy || false,
    hosting: apiMeta?.hosting || false
  }
  merged.location = formatLocation(merged) || (await resolveIpCity(ip))

  metaCache.set(ip, { meta: merged, at: Date.now() })
  return merged
}
