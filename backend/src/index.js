import { execFileSync } from 'child_process'
import express from 'express'
import fs from 'fs'
import http from 'http'
import path from 'path'
import {
  ADMIN_DIR,
  DOWNLOAD_DIR,
  AVATAR_DIR,
  AVATAR_FRAME_DIR,
  ABOUT_PAGE_DIR,
  CHAT_IMAGE_DIR,
  MEDIA_DIR,
  MOMENTS_IMAGE_DIR,
  MOMENTS_VIDEO_DIR,
  REPORT_IMAGE_DIR,
  OFFICIAL_IMAGES_DIR,
  DEFAULT_AVATARS_DIR,
  STICKER_DIR,
  VOICE_AUDIO_DIR,
  CHAT_VIDEO_DIR,
  ensureAdminEntryCode,
  getAdminEntryPath,
  getAdminLoginPath,
  getAdminLoginUrlAfterLogout,
  resolveStartupBrowseUrls,
  loadConfig
} from './config.js'
import { TTS_AUDIO_DIR } from './edgeTts.js'
import {
  connectDatabase,
  purgeExpiredGroupFiles,
  restoreAutoExpiredFileMessages,
  refreshAllGroupCompositeAvatars
} from './db.js'
import { initRedis, isRedisReady } from './redis.js'
import { purgeExpiredChatPhotos } from './chatPhotos.js'
import { purgeExpiredChatVideos } from './chatVideos.js'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import configRoutes from './routes/config.js'
import { applyVoiceStaticHeaders } from './chatAudio.js'
import { attachRealtime } from './realtime.js'
import { ensureVoskModel } from './ensureVoskModel.js'
import { printBanner, printReady, logStatus, checkStunHost } from './startupLog.js'

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '64mb' }))

const adminEntryCode = ensureAdminEntryCode()
const adminMountPath = getAdminEntryPath() || `/${adminEntryCode}`
const adminLoginPath = getAdminLoginPath() || `${adminMountPath}/index/login`
const adminLoginUrl = getAdminLoginUrlAfterLogout() || adminLoginPath

app.use('/api/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/super', (req, res) => {
  res.status(404).json({ code: 404, message: '超级管理后台已移除', data: null })
})
app.use('/api', configRoutes)
app.use('/api', chatRoutes)

function staticCacheHeaders(res, filePath) {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache')
    return
  }
  if (/\.(js|css|woff2?|ttf|eot)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache')
    return
  }
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800')
  }
}

if (fs.existsSync(MEDIA_DIR)) {
  app.use('/media', express.static(MEDIA_DIR, {
    maxAge: '7d',
    setHeaders(res, filePath) {
      if (/(?:^|[\\/])Audio[\\/]/i.test(filePath)) {
        applyVoiceStaticHeaders(res, filePath)
        return
      }
      res.setHeader('Cache-Control', 'public, max-age=604800')
    }
  }))
}

fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true })
fs.mkdirSync(MOMENTS_IMAGE_DIR, { recursive: true })
fs.mkdirSync(MOMENTS_VIDEO_DIR, { recursive: true })
fs.mkdirSync(REPORT_IMAGE_DIR, { recursive: true })
fs.mkdirSync(CHAT_VIDEO_DIR, { recursive: true })
fs.mkdirSync(VOICE_AUDIO_DIR, { recursive: true })
fs.mkdirSync(AVATAR_DIR, { recursive: true })
fs.mkdirSync(ABOUT_PAGE_DIR, { recursive: true })
fs.mkdirSync(AVATAR_FRAME_DIR, { recursive: true })
fs.mkdirSync(OFFICIAL_IMAGES_DIR, { recursive: true })
fs.mkdirSync(DEFAULT_AVATARS_DIR, { recursive: true })
fs.mkdirSync(STICKER_DIR, { recursive: true })
// 兼容旧版 /chat-image/ 链接（与 Chat Images 同目录）
app.use('/chat-image', express.static(CHAT_IMAGE_DIR, {
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=604800')
  }
}))
// 兼容旧版 /voice/ 链接（与 Audio 同目录）
app.use('/voice', express.static(VOICE_AUDIO_DIR, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    applyVoiceStaticHeaders(res, filePath)
  }
}))
fs.mkdirSync(TTS_AUDIO_DIR, { recursive: true })
app.use('/media/Tts', express.static(TTS_AUDIO_DIR, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (/\.wav$/i.test(filePath)) res.setHeader('Content-Type', 'audio/wav')
    else res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800')
  }
}))

function sendAdminIndex(req, res) {
  try {
    const indexPath = path.join(ADMIN_DIR, 'index.html')
    let html = fs.readFileSync(indexPath, 'utf8')
    const baseHref = `${adminMountPath}/`
    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    <base href="${baseHref}">`)
    }
    // 旧版构建可能把入口码写死在 /{code}/assets/，统一改为当前入口
    html = html.replace(/\/[A-Za-z]{8,16}\/assets\//g, `${baseHref}assets/`)
    // /{code}/index/login 下 ./assets 会错解析到 /index/assets，强制改为绝对路径
    html = html.replace(/"\.\/assets\//g, `"${baseHref}assets/`)
    res.type('html').send(html)
  } catch (e) {
    res.status(500).type('text/plain; charset=utf-8').send(e.message || 'admin index.html missing')
  }
}

if (fs.existsSync(DOWNLOAD_DIR)) {
  app.use(
    '/download',
    express.static(DOWNLOAD_DIR, {
      index: 'index.html',
      setHeaders: staticCacheHeaders
    })
  )
}

if (fs.existsSync(ADMIN_DIR)) {
  // 兼容旧 React 后台书签 → 入口根，由 Vue hash 路由进登录页
  // 注意：勿对入口根做 302 到 /#/...（浏览器请求不含 hash 会死循环）；
  // 也勿 /code → /code/（Express 默认非 strict，两者会匹配同一路由再死循环）
  app.get(`${adminMountPath}/index`, (req, res) => res.redirect(302, `${adminMountPath}/`))
  app.get(`${adminMountPath}/index/login`, (req, res) => res.redirect(302, `${adminMountPath}/`))
  app.get(`${adminMountPath}/index/logout`, (req, res) => res.redirect(302, `${adminMountPath}/`))
  app.use(adminMountPath, express.static(ADMIN_DIR, { setHeaders: staticCacheHeaders }))
  app.use(adminMountPath, sendAdminIndex)
}

app.use('/admin', (req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('Not found')
})

// 扫码登录落地页：系统相机/浏览器打开时提示用 App 扫一扫
app.get('/qr/login/:sessionId', (req, res) => {
  const sessionId = String(req.params.sessionId || '').trim()
  const okId = /^[a-f0-9]{16,64}$/i.test(sessionId)
  res
    .status(okId ? 200 : 400)
    .type('html; charset=utf-8')
    .send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>XhaMil 扫码登录</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;
    background:linear-gradient(160deg,#eef3ff,#f7f8fb 48%,#eef6ff);color:#1c1c1e}
  .card{width:min(92vw,380px);padding:28px 22px;border-radius:18px;background:rgba(255,255,255,.88);
    box-shadow:0 12px 40px rgba(15,23,42,.1);text-align:center}
  h1{margin:0 0 10px;font-size:20px}p{margin:0;line-height:1.55;color:#6b7280;font-size:14px}
</style>
</head>
<body>
  <div class="card">
    <h1>请使用手机 XhaMil 扫码</h1>
    <p>${okId ? '这是桌面端登录二维码。请打开 XhaMil App，使用「扫一扫」完成确认登录。' : '无效的登录二维码。'}</p>
  </div>
</body>
</html>`)
})

// 根路径不暴露后台入口码：公开站导向下载页
app.get('/', (req, res) => {
  if (fs.existsSync(DOWNLOAD_DIR)) {
    return res.redirect(302, '/download/')
  }
  res.status(404).type('text/plain; charset=utf-8').send('Not found')
})

async function runCatchingPurge() {
  try {
    let total = 0
    // 分批清到没有过期项
    for (let i = 0; i < 20; i += 1) {
      const { purged } = await purgeExpiredGroupFiles()
      total += purged
      if (!purged) break
    }
    if (total > 0) {
      console.log(`[group-files] purged expired files: ${total}`)
    }
  } catch (e) {
    console.warn('[group-files] purge failed:', e.message || e)
  }
  try {
    const { restored } = await restoreAutoExpiredFileMessages()
    if (restored > 0) {
      console.log(`[group-files] restored auto-expired file bubbles: ${restored}`)
    }
  } catch (e) {
    console.warn('[group-files] restore failed:', e.message || e)
  }
  try {
    const photos = purgeExpiredChatPhotos()
    const videos = purgeExpiredChatVideos()
    const n = (photos.purged || 0) + (videos.purged || 0)
    if (n > 0) {
      console.log(`[chat-media] purged expired photos/videos: ${n}`)
    }
  } catch (e) {
    console.warn('[chat-media] purge failed:', e.message || e)
  }
}

/** 宝塔重复点「启动」时旧进程常仍占端口：先清掉本机占用该端口的进程 */
function collectPidsOnPort(port) {
  const pids = new Set()
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
      const re = new RegExp(`(?:0\\.0\\.0\\.0|\\[::\\]|127\\.0\\.0\\.1):${port}\\s+.*?LISTENING\\s+(\\d+)`, 'gi')
      let m
      while ((m = re.exec(out))) pids.add(Number(m[1]))
    } else {
      try {
        const out = execFileSync('ss', ['-lptn', `sport = :${port}`], { encoding: 'utf8' })
        for (const m of out.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]))
      } catch {
        try {
          const out = execFileSync('fuser', [`${port}/tcp`], { encoding: 'utf8' })
          for (const m of out.matchAll(/(\d+)/g)) pids.add(Number(m[1]))
        } catch {
          /* 端口空闲或工具不可用 */
        }
      }
    }
  } catch {
    /* ignore */
  }
  pids.delete(process.pid)
  return [...pids].filter((n) => Number.isFinite(n) && n > 0)
}

function freeListenPort(port) {
  const pids = collectPidsOnPort(port)
  if (!pids.length) return
  console.log(`⚠ 端口 ${port} 已被占用 (PID ${pids.join(', ')})，正在结束旧进程以便宝塔重新托管…`)
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true })
      } else {
        process.kill(pid, 'SIGTERM')
      }
    } catch {
      /* ignore */
    }
  }
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    if (!collectPidsOnPort(port).length) break
    const until = Date.now() + 120
    while (Date.now() < until) {
      /* brief wait for port release */
    }
  }
  for (const pid of collectPidsOnPort(port)) {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true })
      } else {
        process.kill(pid, 'SIGKILL')
      }
    } catch {
      /* ignore */
    }
  }
}

async function start() {
  printBanner()
  const config = loadConfig()
  const dbCfg = config.database || {}

  let dbConnected = false
  try {
    const redisOk = await initRedis()
    logStatus('Redis', redisOk || isRedisReady(), redisOk ? '会话/投递/在线' : '未启用或连不上（内存降级）')
  } catch (e) {
    logStatus('Redis', false, e?.message || e)
  }

  try {
    const dbResult = await connectDatabase()
    dbConnected = !!dbResult.connected
    if (dbConnected) {
      const addr = `${dbCfg.host || '127.0.0.1'}:${Number(dbCfg.port || 3306)}/${dbCfg.database || ''}`
      logStatus('数据库', true, addr)
      // 启动时清理过期群文件，并每小时再扫一次
      runCatchingPurge()
      setInterval(runCatchingPurge, 60 * 60 * 1000)
      // 启动时把所有群头像刷成组合图（后台异步，不阻塞 listen）
      setTimeout(() => {
        refreshAllGroupCompositeAvatars({ concurrency: 2 }).catch((e) => {
          console.warn('[group-avatar] startup batch failed', e?.message || e)
        })
      }, 2500)
    } else {
      logStatus('数据库', false, '请配置 json/config.json → database')
    }
  } catch (e) {
    logStatus('数据库', false, e.message)
  }

  const port = Number(config.server?.port || 5000)
  const host = config.server?.host || '127.0.0.1'
  freeListenPort(port)

  const server = http.createServer(app)
  attachRealtime(server)
  logStatus('WebSocket', true, '信令 /ws · 封禁监听 /ws/ban-watch')

  const stun = await checkStunHost('stun.l.google.com')
  if (stun.ok) {
    logStatus('WebRTC STUN', true, `${stun.host}:19302`)
  } else {
    logStatus('WebRTC STUN', false, stun.error || stun.host)
  }

  await ensureVoskModel()

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`\n❌ 端口 ${port} 仍被占用（EADDRINUSE）。请在宝塔结束旧 Node 进程后再启动。\n`)
      process.exit(1)
    }
    console.error('\n❌ 服务监听失败:', err)
    process.exit(1)
  })

  server.listen(port, host, () => {
    const browse = resolveStartupBrowseUrls(config, port, host)
    const listenLabel =
      host === '0.0.0.0' || host === '::'
        ? browse.publicBase
          ? `0.0.0.0:${port} · 外网 ${browse.publicBase}`
          : `0.0.0.0:${port} (本机 http://127.0.0.1:${port})`
        : `${host}:${port}`
    printReady({
      adminUrl: browse.adminUrl,
      localAdminUrl: browse.publicBase ? browse.localAdminUrl : '',
      adminEntryFile: adminEntryCode,
      dbConnected,
      listen: listenLabel
    })
  })
}

start()
