/** 网易云音乐搜索 + 播放直链解析（服务端代理） */

import crypto from 'crypto'

const NETEASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
  Cookie: 'os=pc',
  Accept: '*/*'
}

const LINUX_AES_KEY = 'rFgB&h#%2?^eDg:Q'

function aesEncryptLinux(text) {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(LINUX_AES_KEY), null)
  cipher.setAutoPadding(true)
  return Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
    .toString('hex')
    .toUpperCase()
}

async function linuxForward(url, params) {
  const body = {
    method: 'POST',
    url,
    params
  }
  const form = `eparams=${aesEncryptLinux(JSON.stringify(body))}`
  const res = await fetch('https://music.163.com/api/linux/forward', {
    method: 'POST',
    headers: {
      ...NETEASE_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form,
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) throw new Error(`音乐接口失败 (${res.status})`)
  return res.json()
}

export function extractNeteaseSongId(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^\d+$/.test(s)) return s
  try {
    const u = new URL(s)
    if (!/163\.com|126\.net/i.test(u.hostname)) return ''
    const id = u.searchParams.get('id')
    if (id && /^\d+/.test(id)) return id.match(/^(\d+)/)[1]
    const m = u.pathname.match(/\/song\/media\/outer\/url/i)
    if (m) {
      const qid = u.searchParams.get('id')
      if (qid) return String(qid).match(/^(\d+)/)?.[1] || ''
    }
  } catch {
    // ignore
  }
  return ''
}

/** 解析可播放的 mp3 直链 */
export async function resolveNeteasePlayUrl(songId, br = 128000) {
  const id = String(songId || '').replace(/\D/g, '')
  if (!id) return ''
  const data = await linuxForward('https://music.163.com/api/song/enhance/player/url', {
    ids: [Number(id)],
    br: Number(br) || 128000
  })
  const item = Array.isArray(data?.data) ? data.data[0] : null
  const url = String(item?.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    const code = item?.code
    if (code === -110 || item?.fee) {
      throw new Error('该歌曲暂无免费播放源，请换一首')
    }
    throw new Error('无法获取播放地址，请换一首')
  }
  return url.replace(/^http:\/\//i, 'https://')
}

/**
 * 若传入网易云页面/outer 链接，解析成直链；已是直链则原样返回
 */
export async function resolvePlayableMusicUrl(rawUrl) {
  const input = String(rawUrl || '').trim()
  if (!input) return ''
  const songId = extractNeteaseSongId(input)
  if (songId) {
    return resolveNeteasePlayUrl(songId)
  }
  return input
}

function normalizeCoverUrl(raw, size = 100) {
  const s = String(raw || '').trim()
  if (!s || !/^https?:\/\//i.test(s)) return ''
  const https = s.replace(/^http:\/\//i, 'https://')
  if (/param=\d+y\d+/i.test(https)) return https
  const n = Math.min(Math.max(Number(size) || 100, 50), 500)
  const join = https.includes('?') ? '&' : '?'
  return `${https}${join}param=${n}y${n}`
}

/** 按歌曲 ID 解析专辑封面 */
export async function resolveNeteaseCoverUrl(songId) {
  const id = String(songId || '').replace(/\D/g, '')
  if (!id) return ''
  const data = await linuxForward('https://music.163.com/api/v3/song/detail', {
    c: JSON.stringify([{ id: Number(id) }])
  })
  const song = Array.isArray(data?.songs) ? data.songs[0] : null
  return normalizeCoverUrl(song?.al?.picUrl || '')
}

export function neteaseOuterPlayUrl(songId) {
  const id = String(songId || '').replace(/\D/g, '')
  if (!id) return ''
  // 仍用 outer 形式存房间状态；实际播放时由 stream 代理解析直链
  return `https://music.163.com/song/media/outer/url?id=${id}`
}

/**
 * @param {string} keyword
 * @param {number} limit
 */
export async function searchNeteaseMusic(keyword, limit = 20) {
  const q = String(keyword || '').trim()
  if (!q) return []
  const n = Math.min(Math.max(Number(limit) || 20, 1), 30)
  const url =
    `https://music.163.com/api/cloudsearch/pc?type=1&offset=0&limit=${n}` +
    `&s=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: NETEASE_HEADERS, signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`音乐搜索失败 (${res.status})`)
  const data = await res.json()
  const songs = data?.result?.songs
  if (!Array.isArray(songs)) return []
  return songs
    .map((s) => {
      const id = String(s?.id || '').trim()
      if (!id) return null
      const artists = Array.isArray(s.ar) ? s.ar.map((a) => a?.name).filter(Boolean) : []
      return {
        id,
        name: String(s.name || '未知歌曲').slice(0, 120),
        artist: artists.join(' / ').slice(0, 160) || '未知歌手',
        album: String(s.al?.name || '').slice(0, 120),
        coverUrl: normalizeCoverUrl(s.al?.picUrl || ''),
        durationMs: Number(s.dt ?? s.duration) || 0,
        playUrl: neteaseOuterPlayUrl(id)
      }
    })
    .filter(Boolean)
}
