;(() => {
  const cfg = Object.assign(
    {
      brandName: 'XhaMil',
      tagline: '聊聊 · 更轻松',
      headline: '下载 XhaMil',
      subline: '年轻人的聊天方式，装上就能用',
      apiBase: '',
      fallbackApk: '',
      fallbackVersionName: ''
    },
    window.DOWNLOAD_PAGE_CONFIG || {}
  )

  // 同域部署 apiBase 留空即可；本地预览也用当前 origin，勿写死正式域名
  if (!cfg.apiBase) {
    cfg.apiBase = ''
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (id) => document.getElementById(id)

  function resolveUrl(pathOrUrl) {
    const raw = String(pathOrUrl || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw)) return raw
    const base = String(cfg.apiBase || '').replace(/\/$/, '') || location.origin
    return raw.startsWith('/') ? base + raw : `${base}/${raw}`
  }

  function setButton({ href, label, meta, enabled }) {
    const btn = $('downloadBtn')
    const dockBtn = $('dockBtn')
    $('btnLabel').textContent = label
    $('btnMeta').textContent = meta || ''
    if ($('dockMeta') && meta) $('dockMeta').textContent = meta
    if (enabled && href) {
      btn.href = href
      btn.setAttribute('aria-disabled', 'false')
      btn.removeAttribute('tabindex')
      if (dockBtn) {
        dockBtn.href = href
        dockBtn.setAttribute('aria-disabled', 'false')
      }
    } else {
      btn.href = '#'
      btn.setAttribute('aria-disabled', 'true')
      btn.setAttribute('tabindex', '-1')
      if (dockBtn) {
        dockBtn.href = '#'
        dockBtn.setAttribute('aria-disabled', 'true')
      }
    }
  }

  function applyBrand() {
    const name = String(cfg.brandName || 'XhaMil').trim() || 'XhaMil'
    $('brandName').textContent = name
    $('footBrand').textContent = name
    $('brandTag').textContent = cfg.tagline || ''
    $('headline').textContent = cfg.headline || `下载 ${name}`
    $('subline').textContent = cfg.subline || ''
    if ($('dockTitle')) $('dockTitle').textContent = name
    const icon = cfg.iconUrl ? resolveUrl(cfg.iconUrl) : './icon.png'
    const el = $('brandIcon')
    if (el) {
      el.src = icon
      el.alt = name
    }
    if ($('dockIcon')) $('dockIcon').src = icon
    document.title = `${name} · 下载`
    $('year').textContent = String(new Date().getFullYear())
  }

  function bindReveal() {
    const nodes = [...document.querySelectorAll('.reveal')]
    if (!nodes.length) return
    if (reduced || !('IntersectionObserver' in window)) {
      nodes.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
    )
    nodes.forEach((el) => io.observe(el))
  }

  function bindParallax() {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return
    const orbs = [...document.querySelectorAll('[data-parallax]')]
    if (!orbs.length) return
    let mx = 0
    let my = 0
    let cx = 0
    let cy = 0

    window.addEventListener(
      'pointermove',
      (e) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2
        my = (e.clientY / window.innerHeight - 0.5) * 2
      },
      { passive: true }
    )

    const tick = () => {
      cx += (mx - cx) * 0.06
      cy += (my - cy) * 0.06
      orbs.forEach((el) => {
        const strength = Number(el.dataset.parallax || 0.04)
        el.style.transform = `translate3d(${cx * strength * 120}px, ${cy * strength * 90}px, 0)`
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function bindTilt() {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        const y = (e.clientY - r.top) / r.height
        const rx = (0.5 - y) * 8
        const ry = (x - 0.5) * 10
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`
      })
      card.addEventListener('pointerleave', () => {
        card.style.transform = ''
      })
    })
  }

  function bindDockAndProgress() {
    const dock = $('dock')
    const progress = $('progress')
    const hero = document.querySelector('.hero-screen')
    if (!dock && !progress) return

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0
      if (progress) progress.style.width = `${(p * 100).toFixed(2)}%`

      if (dock && hero) {
        const show = window.scrollY > hero.offsetHeight * 0.55
        dock.classList.toggle('is-show', show)
        dock.setAttribute('aria-hidden', show ? 'false' : 'true')
      }
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
  }

  async function loadUpdate() {
    const base = String(cfg.apiBase || '').replace(/\/$/, '')
    try {
      const res = await fetch(`${base}/api/config/download-page`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data = json?.data || json || {}
      const versionName = String(data.versionName || '').trim()
      const versionCode = Number(data.latestVersionCode || data.versionCode || 0) || 0
      let apkUrl = String(data.apkUrl || '').trim()

      if (data.title) $('headline').textContent = String(data.title)
      if (data.subtitle) $('subline').textContent = String(data.subtitle)
      if (!apkUrl && cfg.fallbackApk) apkUrl = cfg.fallbackApk

      const href = resolveUrl(apkUrl)
      if (!href || data.show === false) {
        setButton({
          href: '',
          label: '暂无安装包',
          meta: '请稍后再试',
          enabled: false
        })
        $('hint').textContent = '后台还没上传 APK，或已关闭下载'
        $('versionLine').textContent = versionName ? `v${versionName}` : '等待上传'
        return
      }

      const meta = [
        versionName && `v${versionName}`,
        versionCode > 0 && `build ${versionCode}`,
        'APK'
      ]
        .filter(Boolean)
        .join(' · ')

      setButton({ href, label: '下载安装包', meta, enabled: true })
      $('hint').textContent = '仅支持 Android · 安装时请允许「未知来源」'
      $('versionLine').textContent = versionName
        ? `当前版本 v${versionName}${versionCode ? ` (${versionCode})` : ''}`
        : '最新安装包'
    } catch (err) {
      console.warn('[download]', err)
      const fallback = resolveUrl(cfg.fallbackApk)
      if (fallback) {
        setButton({
          href: fallback,
          label: '下载安装包',
          meta: cfg.fallbackVersionName
            ? `v${cfg.fallbackVersionName} · APK`
            : 'APK',
          enabled: true
        })
        $('hint').textContent = '接口暂不可用，已用备用地址'
        $('versionLine').textContent = cfg.fallbackVersionName
          ? `当前版本 v${cfg.fallbackVersionName}`
          : '备用安装包'
        return
      }
      setButton({
        href: '',
        label: '暂时无法下载',
        meta: '请稍后重试',
        enabled: false
      })
      $('hint').textContent = '无法读取版本信息'
      $('versionLine').textContent = '加载失败'
    }
  }

  function bindCursorTrail() {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return
    const canvas = $('trailCanvas')
    const dot = $('cursorDot')
    const ring = $('cursorRing')
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    document.body.classList.add('has-trail')
    document.body.classList.add('hide-native-cursor')

    const points = []
    const sparks = []
    const MAX = 36
    let mx = window.innerWidth / 2
    let my = window.innerHeight / 2
    let px = mx
    let py = my
    let rx = mx
    let ry = my
    let lastAdd = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const burst = (x, y, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.4
        const sp = 1.2 + Math.random() * 2.8
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          size: 1.5 + Math.random() * 2
        })
      }
    }

    window.addEventListener(
      'pointermove',
      (e) => {
        mx = e.clientX
        my = e.clientY
        const now = performance.now()
        const dist = Math.hypot(mx - px, my - py)
        if (now - lastAdd > 10) {
          const count = dist > 28 ? 2 : 1
          for (let i = 0; i < count; i++) {
            points.push({
              x: mx - (mx - px) * (i * 0.25),
              y: my - (my - py) * (i * 0.25),
              life: 1,
              size: 2.6 + Math.random() * 2.8 + Math.min(dist / 40, 2)
            })
          }
          while (points.length > MAX) points.shift()
          lastAdd = now
        }
        px = mx
        py = my

        const t = e.target
        const clickable =
          t &&
          (t.closest('a') ||
            t.closest('button') ||
            t.closest('.promo-card') ||
            t.closest('.chip'))
        document.body.classList.toggle('is-hover-clickable', Boolean(clickable))
      },
      { passive: true }
    )

    window.addEventListener('pointerdown', (e) => {
      document.body.classList.add('is-pointer-down')
      burst(e.clientX, e.clientY, 12)
    })
    window.addEventListener('pointerup', () => document.body.classList.remove('is-pointer-down'))
    window.addEventListener('pointerleave', () => document.body.classList.remove('has-trail'))
    window.addEventListener('pointerenter', () => document.body.classList.add('has-trail'))

    const tick = () => {
      rx += (mx - rx) * 0.18
      ry += (my - ry) * 0.18
      if (dot) dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`
      if (ring) ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      if (points.length > 1) {
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2
          const yc = (points[i].y + points[i + 1].y) / 2
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
        }
        ctx.strokeStyle = 'rgba(77, 141, 255, 0.2)'
        ctx.lineWidth = 2.4
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i]
        p.life -= 0.024
        if (p.life <= 0) {
          points.splice(i, 1)
          continue
        }
        const alpha = p.life * 0.5
        const r = p.size * (0.55 + p.life * 0.75)
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4)
        g.addColorStop(0, `rgba(77, 141, 255, ${alpha})`)
        g.addColorStop(1, 'rgba(77, 141, 255, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.96
        s.vy *= 0.96
        s.life -= 0.035
        if (s.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        ctx.fillStyle = `rgba(47, 124, 246, ${s.life * 0.7})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2)
        ctx.fill()
      }

      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function showToast(message) {
    const el = $('toast')
    if (!el) return
    el.textContent = message
    el.classList.add('is-show')
    clearTimeout(showToast._t)
    showToast._t = setTimeout(() => el.classList.remove('is-show'), 1800)
  }

  function bindDownloadFeedback() {
    const mark = (e) => {
      const a = e.currentTarget
      if (a.getAttribute('aria-disabled') === 'true') return
      showToast('开始下载…')
    }
    $('downloadBtn')?.addEventListener('click', mark)
    $('dockBtn')?.addEventListener('click', mark)
  }

  function bindLightbox() {
    const box = $('lightbox')
    const img = $('lightboxImg')
    const cap = $('lightboxCap')
    const closeBtn = $('lightboxClose')
    const prevBtn = $('lightboxPrev')
    const nextBtn = $('lightboxNext')
    if (!box || !img) return

    const items = [...document.querySelectorAll('[data-lightbox]')].map((el) => ({
      src: el.getAttribute('data-lightbox'),
      caption: el.getAttribute('data-caption') || ''
    }))
    let index = 0

    const render = () => {
      const item = items[index]
      if (!item) return
      img.src = item.src
      if (cap) cap.textContent = item.caption
    }

    const open = (i) => {
      index = i
      render()
      box.hidden = false
      requestAnimationFrame(() => box.classList.add('is-open'))
      document.body.style.overflow = 'hidden'
    }

    const close = () => {
      box.classList.remove('is-open')
      document.body.style.overflow = ''
      setTimeout(() => {
        if (!box.classList.contains('is-open')) box.hidden = true
      }, 280)
    }

    const step = (delta) => {
      if (!items.length) return
      index = (index + delta + items.length) % items.length
      render()
    }

    document.querySelectorAll('[data-lightbox]').forEach((el, i) => {
      el.addEventListener('click', () => open(i))
    })

    closeBtn?.addEventListener('click', close)
    prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      step(-1)
    })
    nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      step(1)
    })
    box.addEventListener('click', (e) => {
      if (e.target === box) close()
    })
    window.addEventListener('keydown', (e) => {
      if (!box.classList.contains('is-open')) return
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    })
  }

  applyBrand()
  loadUpdate()
  bindReveal()
  bindParallax()
  bindTilt()
  bindDockAndProgress()
  bindCursorTrail()
  bindLightbox()
  bindDownloadFeedback()
})()

