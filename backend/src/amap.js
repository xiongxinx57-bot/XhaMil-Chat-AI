import { loadConfig, saveConfig } from './config.js'

const PLACE_SEARCH_URL = 'https://restapi.amap.com/v3/place/text'
const PLACE_AROUND_URL = 'https://restapi.amap.com/v3/place/around'
const REGEO_URL = 'https://restapi.amap.com/v3/geocode/regeo'

function maskKey(key) {
  const s = String(key || '').trim()
  if (!s) return ''
  if (s.length <= 8) return `${s.slice(0, 2)}****`
  return `${s.slice(0, 4)}****${s.slice(-4)}`
}

export function isAmapConfigured(config = loadConfig()) {
  return !!String(config.amapWebApiKey || '').trim()
}

export function isAmapEnabled(config = loadConfig()) {
  if (config.amapEnabled === false) return false
  return isAmapConfigured(config)
}

export function getAmapConfigPublic(config = loadConfig()) {
  const key = String(config.amapWebApiKey || '').trim()
  return {
    amapEnabled: config.amapEnabled !== false,
    amapWebApiKeyMasked: maskKey(key),
    hasWebApiKey: !!key,
    configured: isAmapConfigured(config),
    enabled: isAmapEnabled(config)
  }
}

export function saveAmapConfig(body = {}) {
  const b = body || {}
  const current = loadConfig()
  const next = { ...current }

  if (b.amapEnabled !== undefined) {
    next.amapEnabled = !!b.amapEnabled
  }
  if (b.amapWebApiKey !== undefined && String(b.amapWebApiKey).trim() !== '') {
    next.amapWebApiKey = String(b.amapWebApiKey).trim()
  }
  // 允许显式清空
  if (b.clearWebApiKey === true || b.amapWebApiKey === '') {
    next.amapWebApiKey = ''
  }

  saveConfig({
    amapEnabled: next.amapEnabled !== false,
    amapWebApiKey: String(next.amapWebApiKey || '').trim()
  })
  return getAmapConfigPublic()
}

async function amapGet(url, params) {
  const config = loadConfig()
  const key = String(config.amapWebApiKey || '').trim()
  if (!key) {
    const err = new Error('未配置高德 Web 服务 Key（管理后台 → 位置服务）')
    err.status = 503
    throw err
  }
  if (config.amapEnabled === false) {
    const err = new Error('位置服务已关闭')
    err.status = 503
    throw err
  }
  const q = new URLSearchParams({ key, output: 'JSON', ...params })
  const res = await fetch(`${url}?${q.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    const err = new Error(`高德接口 HTTP ${res.status}`)
    err.status = 502
    throw err
  }
  const data = await res.json()
  if (String(data.status) !== '1') {
    const err = new Error(data.info || data.infocode || '高德接口失败')
    err.status = 400
    err.amap = data
    throw err
  }
  return data
}

function normalizePoi(item = {}) {
  const loc = String(item.location || '').split(',')
  const lng = Number(loc[0])
  const lat = Number(loc[1])
  const name = String(item.name || '').trim()
  const address = String(item.address || item.pname || '').trim()
  const district = [item.pname, item.cityname, item.adname].filter(Boolean).join('')
  return {
    id: String(item.id || ''),
    title: name || '位置',
    address: address || district || name || '位置',
    district,
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    type: String(item.type || ''),
    typecode: String(item.typecode || '')
  }
}

/** 周边 POI（可无关键字） */
export async function aroundAmapPlaces({
  lat,
  lng,
  keyword = '',
  radius = 2000,
  page = 1,
  pageSize = 25
} = {}) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    const err = new Error('无效坐标')
    err.status = 400
    throw err
  }
  const pageNum = Math.max(1, Number(page) || 1)
  const offset = Math.min(50, Math.max(1, Number(pageSize) || 25))
  const q = String(keyword || '').trim()
  const params = {
    location: `${ln},${la}`,
    radius: String(Math.min(50000, Math.max(100, Number(radius) || 2000))),
    sortrule: 'distance',
    offset: String(offset),
    page: String(pageNum),
    extensions: 'base'
  }
  if (q) params.keywords = q
  const data = await amapGet(PLACE_AROUND_URL, params)
  const pois = Array.isArray(data.pois) ? data.pois : []
  return {
    list: pois.map(normalizePoi).filter((p) => p.lat && p.lng),
    count: Number(data.count) || pois.length
  }
}

/** 关键字搜周边 / 全国 POI */
export async function searchAmapPlaces({
  keyword = '',
  lat,
  lng,
  city = '',
  page = 1,
  pageSize = 20,
  around = true
} = {}) {
  const q = String(keyword || '').trim()
  if (!q) return { list: [], count: 0 }

  const pageNum = Math.max(1, Number(page) || 1)
  const offset = Math.min(50, Math.max(1, Number(pageSize) || 20))
  const hasLoc = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))

  let data
  if (around && hasLoc) {
    data = await amapGet(PLACE_AROUND_URL, {
      keywords: q,
      location: `${Number(lng)},${Number(lat)}`,
      radius: '50000',
      sortrule: 'weight',
      offset: String(offset),
      page: String(pageNum),
      extensions: 'base'
    })
  } else {
    data = await amapGet(PLACE_SEARCH_URL, {
      keywords: q,
      city: String(city || '').trim(),
      citylimit: city ? 'true' : 'false',
      offset: String(offset),
      page: String(pageNum),
      extensions: 'base'
    })
  }

  const pois = Array.isArray(data.pois) ? data.pois : []
  return {
    list: pois.map(normalizePoi).filter((p) => p.lat && p.lng),
    count: Number(data.count) || pois.length
  }
}

/** 逆地理：坐标 → 地址 */
export async function regeoAmap({ lat, lng } = {}) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    const err = new Error('无效坐标')
    err.status = 400
    throw err
  }
  const data = await amapGet(REGEO_URL, {
    location: `${ln},${la}`,
    extensions: 'base',
    radius: '1000'
  })
  const regeocode = data.regeocode || {}
  const comp = regeocode.addressComponent || {}
  const formatted = String(regeocode.formatted_address || '').trim()
  const title =
    String(comp.building || '').trim() ||
    String(comp.neighborhood?.name || '').trim() ||
    String(comp.township || '').trim() ||
    String(comp.district || '').trim() ||
    '位置'
  return {
    title,
    address: formatted || title,
    lat: la,
    lng: ln,
    province: String(comp.province || ''),
    city: String(comp.city || comp.province || ''),
    district: String(comp.district || '')
  }
}

/** 客户端公开状态（不回传 Key） */
export function getAmapClientStatus() {
  const config = loadConfig()
  return {
    enabled: isAmapEnabled(config),
    configured: isAmapConfigured(config)
  }
}
