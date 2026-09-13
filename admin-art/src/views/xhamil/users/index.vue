<!-- 用户管理：对齐 React 后台（头像 / 手机标识 / 限制 / 设备信息） -->
<template>
  <div class="user-page art-full-height">
    <ArtSearchBar
      v-model="searchForm"
      :items="searchItems"
      @search="handleSearch"
      @reset="handleReset"
    />

    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader v-model:columns="columnChecks" :loading="loading" @refresh="load">
        <template #left>
          <ElSpace wrap>
            <ElButton type="primary" v-ripple @click="openCreate">创建账户</ElButton>
            <ElPopconfirm title="清理僵尸号？不可恢复" @confirm="cleanup">
              <template #reference>
                <ElButton type="danger" plain>清理僵尸号</ElButton>
              </template>
            </ElPopconfirm>
            <span class="text-xs text-g-500">
              共 {{ list.length }} · 正常 {{ activeCount }} · 封禁 {{ bannedCount }} · 手机
              {{ phoneCount }}
            </span>
          </ElSpace>
        </template>
      </ArtTableHeader>

      <ArtTable
        :loading="loading"
        :data="paged"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @pagination:size-change="onSizeChange"
        @pagination:current-change="onCurrentChange"
      />
    </ElCard>

    <ElDialog v-model="createOpen" title="创建账户" width="480px" destroy-on-close>
      <ElForm label-position="top">
        <ElFormItem label="用户名" required>
          <ElInput v-model="createForm.username" />
        </ElFormItem>
        <ElFormItem label="密码" required>
          <ElInput v-model="createForm.password" type="password" show-password />
        </ElFormItem>
        <ElFormItem label="昵称">
          <ElInput v-model="createForm.nickname" />
        </ElFormItem>
        <ElFormItem label="邮箱">
          <ElInput v-model="createForm.email" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveCreate">创建</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="deviceOpen"
      width="1040px"
      align-center
      :show-close="false"
      :close-on-click-modal="true"
      modal-class="device-tablet-overlay"
      class="device-tablet-dialog"
      destroy-on-close
    >
      <div v-if="deviceUser" class="pad">
        <button type="button" class="pad-close" aria-label="关闭" @click="deviceOpen = false">
          <ArtSvgIcon icon="ri:close-line" />
        </button>

        <aside class="pad-side">
          <XhamilAvatar
            :src="deviceUser.avatarUrl"
            :uid="deviceUser.id"
            :size="72"
            img-class="rounded-full object-cover bg-g-200"
          />
          <h3>{{ displayName(deviceUser) }}</h3>
          <p class="pad-sub">@{{ deviceUser.username || '—' }} · {{ deviceUser.chatNo || '无聊聊号' }}</p>
          <ElTag
            :type="isPhoneUser(deviceUser) ? 'success' : 'info'"
            size="small"
            effect="plain"
            round
          >
            {{ isPhoneUser(deviceUser) ? '已用 App 登录' : '未用手机登录' }}
          </ElTag>

          <div class="pad-spec">
            <div class="pad-spec__label">上网 IP</div>
            <div class="pad-spec__value">{{ deviceSummary.onlineIp }}</div>
            <div class="pad-spec__meta">{{ deviceSummary.onlineLocation }}</div>
            <div class="pad-spec__meta">{{ deviceSummary.onlineIsp }}</div>
          </div>
          <div class="pad-spec pad-spec--sub">
            <div class="pad-spec__label">设备</div>
            <div class="pad-spec__value">{{ deviceSummary.model }}</div>
            <div class="pad-spec__meta">{{ deviceSummary.os }}</div>
            <div class="pad-spec__meta">App {{ deviceSummary.app }}</div>
          </div>

          <ElButton
            v-if="deviceUser.registerIp || deviceUser.lastLoginIp"
            type="primary"
            plain
            @click="copyDeviceIps"
          >
            复制 IP
          </ElButton>
        </aside>

        <div class="pad-main" v-loading="deviceLoading">
          <div class="pad-grid">
            <section v-for="section in deviceSections" :key="section.title" class="pad-card">
              <h4>{{ section.title }}</h4>
              <dl>
                <div v-for="row in section.rows" :key="row[0]" class="pad-row">
                  <dt>{{ row[0] }}</dt>
                  <dd :class="{ empty: row[1] === '—' }" :title="row[1]">{{ row[1] }}</dd>
                </div>
              </dl>
            </section>
          </div>

          <p v-if="!isPhoneUser(deviceUser)" class="pad-hint">
            该用户还没有用手机 App 登录过。用最新版 App 登录一次后，会补全品牌、型号、系统与 App 版本。
          </p>

          <ElCollapse v-if="deviceUser.lastDeviceInfo?.userAgent || deviceRawJson" class="pad-more">
            <ElCollapseItem title="原始数据" name="raw">
              <div v-if="deviceUser.lastDeviceInfo?.userAgent" class="ua-box">
                <div class="ua-label">User-Agent</div>
                <code>{{ deviceUser.lastDeviceInfo.userAgent }}</code>
              </div>
              <div v-if="deviceRawJson" class="ua-box">
                <div class="ua-label">设备 JSON</div>
                <code class="ua-json">{{ deviceRawJson }}</code>
              </div>
            </ElCollapseItem>
          </ElCollapse>
        </div>
      </div>
    </ElDialog>

    <ElDialog
      v-model="badgeOpen"
      :title="badgeUser ? `设置微标 · ${displayName(badgeUser)}` : '设置微标'"
      width="520px"
      destroy-on-close
    >
      <p class="text-xs text-g-500 mt-0 mb-3">每个用户最多 5 个微标，每个最多 8 个字</p>
      <div v-for="(draft, index) in badgeDrafts" :key="index" class="badge-edit-row">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">微标 {{ index + 1 }}</span>
          <ElButton
            v-if="badgeDrafts.length > 1"
            link
            type="danger"
            @click="badgeDrafts.splice(index, 1)"
          >
            删除
          </ElButton>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <ElInput
            v-model="draft.badgeText"
            maxlength="8"
            placeholder="微标文字"
            @input="(v: string) => (draft.badgeText = String(v || '').replace(/\s+/g, ''))"
          />
          <input v-model="draft.badgeColor" type="color" class="color-picker" />
          <ElInput v-model="draft.badgeColor" style="width: 110px" maxlength="7" />
          <span
            class="badge-preview"
            :style="{ background: normalizeBadgeColor(draft.badgeColor) }"
          >
            {{ draft.badgeText || '预览' }}
          </span>
        </div>
      </div>
      <ElButton
        class="w-full mb-3"
        plain
        :disabled="badgeDrafts.length >= 5"
        @click="badgeDrafts.push({ badgeText: '', badgeColor: '#FF9800' })"
      >
        添加微标（{{ badgeDrafts.length }}/5）
      </ElButton>
      <div class="mb-3">
        <div class="text-xs text-g-500 mb-2">快捷预设</div>
        <ElSpace wrap>
          <ElButton
            v-for="p in BADGE_PRESETS"
            :key="p.text"
            size="small"
            @click="applyBadgePreset(p)"
          >
            <span class="badge-preview mr-1" :style="{ background: p.color }">{{ p.text }}</span>
          </ElButton>
        </ElSpace>
      </div>
      <div class="badge-live-preview">
        <span class="font-medium mr-2">{{ badgeUser ? displayName(badgeUser) : '' }}</span>
        <span
          v-for="(b, i) in badgeDrafts.filter((x) => x.badgeText)"
          :key="i"
          class="badge-preview"
          :style="{ background: normalizeBadgeColor(b.badgeColor) }"
        >
          {{ b.badgeText }}
        </span>
      </div>
      <template #footer>
        <ElButton type="danger" plain :loading="savingBadge" @click="clearBadges">清除微标</ElButton>
        <ElButton @click="badgeOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="savingBadge" @click="saveBadges">保存</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="restrictOpen"
      :title="restrictUser ? `功能限制 · ${displayName(restrictUser)}` : '功能限制'"
      width="420px"
      destroy-on-close
    >
      <div class="text-xs text-g-500 mb-3">
        关闭开关后点保存即可解除。全站禁言会同时禁止群聊、私聊、发说说和评论。
      </div>
      <div class="flex flex-col gap-3">
        <label
          v-for="key in restrictionKeys"
          :key="key"
          class="flex items-center justify-between gap-3"
        >
          <span>
            {{ USER_RESTRICTION_LABELS[key] }}
            <span v-if="restrictionHint(key)" class="block text-xs text-warning mt-0.5">
              {{ restrictionHint(key) }}
            </span>
          </span>
          <ElSwitch v-model="restrictDraft[key]" />
        </label>
      </div>
      <template #footer>
        <ElButton @click="restrictOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="savingRestrict" @click="saveRestrictions">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElButton, ElMessage, ElMessageBox, ElTag } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import XhamilAvatar from '@/components/xhamil/XhamilAvatar.vue'
  import { useTableColumns } from '@/hooks/core/useTableColumns'
  import { xhamilApi } from '@/api/xhamil'
  import {
    isPhoneUser,
    emptyRestrictions,
    hasAnyRestriction,
    USER_RESTRICTION_LABELS,
    type UserRestrictions
  } from '@/utils/xhamilMedia'

  defineOptions({ name: 'XhamilUsers' })

  type UserRow = Record<string, any>

  const loading = ref(false)
  const saving = ref(false)
  const savingRestrict = ref(false)
  const list = ref<UserRow[]>([])
  const createOpen = ref(false)
  const createForm = reactive({ username: '', password: '', nickname: '', email: '' })
  const searchForm = ref({ keyword: '', status: '', client: '' })
  const applied = ref({ keyword: '', status: '', client: '' })
  const page = reactive({ current: 1, size: 20 })

  const deviceOpen = ref(false)
  const deviceUser = ref<UserRow | null>(null)
  const deviceLoading = ref(false)
  const loginMeta = ref<Record<string, any> | null>(null)
  const registerMeta = ref<Record<string, any> | null>(null)
  const badgeOpen = ref(false)
  const badgeUser = ref<UserRow | null>(null)
  const badgeDrafts = ref<{ badgeText: string; badgeColor: string }[]>([])
  const savingBadge = ref(false)
  const restrictOpen = ref(false)
  const restrictUser = ref<UserRow | null>(null)
  const restrictDraft = reactive<UserRestrictions>(emptyRestrictions())
  const restrictionKeys = Object.keys(USER_RESTRICTION_LABELS) as (keyof UserRestrictions)[]

  const USER_BADGE_MAX = 5
  const BADGE_PRESETS = [
    { text: '开发者', color: '#FF9800' },
    { text: '官方', color: '#1976D2' },
    { text: 'VIP', color: '#E91E63' },
    { text: '认证', color: '#43A047' }
  ]

  function normalizeBadgeColor(color?: string) {
    const v = String(color || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : '#FF9800'
  }

  const searchItems = [
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      clearable: true,
      placeholder: '用户名 / 昵称 / 聊聊号 / 邮箱 / IP'
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部',
        options: [
          { label: '正常', value: 'normal' },
          { label: '封禁', value: 'banned' }
        ]
      }
    },
    {
      label: '客户端',
      key: 'client',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部',
        options: [
          { label: '已用手机 App', value: 'phone' },
          { label: '未用手机', value: 'other' }
        ]
      }
    }
  ]

  function isBanned(row: UserRow) {
    return row.status === 'banned' || !!row.banned || !!row.isBanned
  }

  function displayName(row: UserRow) {
    return row.nickname || row.username || `用户 ${row.id}`
  }

  function userBadges(row: UserRow) {
    const raw =
      Array.isArray(row.badges) && row.badges.length
        ? row.badges
        : row.badgeText
          ? [{ badgeText: row.badgeText, badgeColor: row.badgeColor || '#FF9800' }]
          : []
    return raw
      .map((b: any) => ({
        badgeText: String(b.badgeText || '')
          .replace(/\s+/g, '')
          .slice(0, 8),
        badgeColor: normalizeBadgeColor(b.badgeColor)
      }))
      .filter((b: any) => b.badgeText)
      .slice(0, USER_BADGE_MAX)
  }

  function fmtTime(v?: string | null) {
    if (!v) return '—'
    return String(v).replace('T', ' ').slice(0, 19)
  }

  const activeCount = computed(() => list.value.filter((u) => !isBanned(u)).length)
  const bannedCount = computed(() => list.value.filter((u) => isBanned(u)).length)
  const phoneCount = computed(() => list.value.filter((u) => isPhoneUser(u)).length)

  const filtered = computed(() => {
    const q = applied.value.keyword.trim().toLowerCase()
    const st = applied.value.status
    const client = applied.value.client
    const rows = list.value.filter((u) => {
      if (st === 'banned' && !isBanned(u)) return false
      if (st === 'normal' && isBanned(u)) return false
      if (client === 'phone' && !isPhoneUser(u)) return false
      if (client === 'other' && isPhoneUser(u)) return false
      if (!q) return true
      return [
        u.username,
        u.nickname,
        u.email,
        u.registerIp,
        u.lastLoginIp,
        u.lastLoginForwarded,
        String(u.chatNo || ''),
        String(u.id)
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    return rows.sort((a, b) => {
      const aPhone = isPhoneUser(a) ? 1 : 0
      const bPhone = isPhoneUser(b) ? 1 : 0
      if (aPhone !== bPhone) return bPhone - aPhone
      const aBadge = userBadges(a).length ? 1 : 0
      const bBadge = userBadges(b).length ? 1 : 0
      if (aBadge !== bBadge) return bBadge - aBadge
      const aRestricted = isBanned(a) || hasAnyRestriction(a.restrictions)
      const bRestricted = isBanned(b) || hasAnyRestriction(b.restrictions)
      if (aRestricted !== bRestricted) return aRestricted ? -1 : 1
      return Number(b.id) - Number(a.id)
    })
  })

  const pagination = computed(() => ({
    current: page.current,
    size: page.size,
    total: filtered.value.length
  }))

  const paged = computed(() => {
    const start = (page.current - 1) * page.size
    return filtered.value.slice(start, start + page.size)
  })

  function cell(v: unknown) {
    const s = v == null ? '' : String(v).trim()
    return s || '—'
  }

  const deviceSections = computed(() => {
    const u = deviceUser.value
    if (!u) return [] as { title: string; rows: [string, string][] }[]
    const info = (u.lastDeviceInfo || {}) as Record<string, any>
    const login = loginMeta.value || {}
    const register = registerMeta.value || {}
    const onlineIp = login.ip || u.lastLoginIp || info.clientIp
    const networkTypeMap: Record<string, string> = {
      WiFi: 'Wi-Fi',
      WIFI: 'Wi-Fi',
      cellular: '蜂窝网络',
      VPN: 'VPN',
      ethernet: '有线',
      offline: '离线',
      unknown: '未知',
      other: '其他'
    }
    return [
      {
        title: '上网 IP',
        rows: [
          ['上网 IP', cell(onlineIp)],
          ['归属地', cell(login.location)],
          ['运营商 / ISP', cell(login.isp || info.simOperator)],
          ['网络判定', cell(login.kind)],
          ['组织', cell(login.org)],
          ['ASN', cell(login.as)],
          ['本机局域网 IP', cell(info.localIp)],
          ['手机网络类型', cell(networkTypeMap[info.networkType] || info.networkType)],
          ['SIM 运营商', cell(info.simOperator)]
        ] as [string, string][]
      },
      {
        title: '注册 IP',
        rows: [
          ['注册 IP', cell(u.registerIp)],
          ['注册归属地', cell(register.location || u.province)],
          ['注册 ISP', cell(register.isp)],
          ['注册网络判定', cell(register.kind)],
          ['资料地区', cell(u.province)]
        ] as [string, string][]
      },
      {
        title: '账号',
        rows: [
          ['用户 ID', cell(u.id)],
          ['聊聊号', cell(u.chatNo)],
          ['用户名', cell(u.username)],
          ['昵称', cell(u.nickname)],
          ['邮箱', cell(u.email)]
        ] as [string, string][]
      },
      {
        title: '请求链路',
        rows: [
          ['最近登录时间', fmtTime(u.lastLoginAt)],
          ['X-Forwarded-For', cell(u.lastLoginForwarded || info.forwardedFor)],
          ['远端地址', cell(info.remoteAddress)],
          ['最近浏览器标识', cell(u.lastBrowser)]
        ] as [string, string][]
      },
      {
        title: '设备硬件',
        rows: [
          ['展示型号', cell(u.lastDeviceModel || info.modelLabel)],
          ['品牌', cell(info.brand)],
          ['厂商', cell(info.manufacturer)],
          ['型号', cell(info.model)],
          ['设备代号', cell(info.device)],
          ['产品名', cell(info.product)],
          ['主板', cell(info.board)],
          ['硬件', cell(info.hardware)],
          ['ABI', cell(info.abi)],
          ['分辨率', cell(info.display)]
        ] as [string, string][]
      },
      {
        title: '系统与 App',
        rows: [
          [
            '系统版本',
            info.androidVersion
              ? `Android ${info.androidVersion}${info.sdkInt ? ` (API ${info.sdkInt})` : ''}`
              : '—'
          ],
          [
            'App 版本',
            info.appVersion
              ? `${info.appVersion}${info.appVersionCode ? ` (${info.appVersionCode})` : ''}`
              : '—'
          ],
          [
            '客户端类型',
            u.lastClientType === 'android'
              ? 'Android App'
              : cell(u.lastClientType || info.clientType)
          ],
          ['系统语言', cell(info.locale)],
          ['时区', cell(info.timezone)],
          ['Fingerprint', cell(info.fingerprint)],
          ['最近设备上报', fmtTime(u.lastDeviceAt || info.updatedAt)]
        ] as [string, string][]
      }
    ]
  })

  const deviceSummary = computed(() => {
    const u = deviceUser.value
    const info = (u?.lastDeviceInfo || {}) as Record<string, any>
    const login = loginMeta.value || {}
    return {
      onlineIp: login.ip || u?.lastLoginIp || info.clientIp || '—',
      onlineLocation: login.location || (deviceLoading.value ? '正在识别归属地…' : u?.province || '暂无归属地'),
      onlineIsp: login.isp || info.simOperator || '',
      model:
        u?.lastDeviceModel ||
        info.modelLabel ||
        (u && isPhoneUser(u) ? '未知型号' : '尚未用手机 App 登录'),
      os: info.androidVersion
        ? `Android ${info.androidVersion}${info.sdkInt ? ` · API ${info.sdkInt}` : ''}`
        : '系统未知',
      app: info.appVersion
        ? `${info.appVersion}${info.appVersionCode ? ` (${info.appVersionCode})` : ''}`
        : '—'
    }
  })

  const deviceRawJson = computed(() => {
    const info = deviceUser.value?.lastDeviceInfo
    if (!info || typeof info !== 'object') return ''
    try {
      return JSON.stringify(info, null, 2)
    } catch {
      return ''
    }
  })

  async function copyDeviceIps() {
    const u = deviceUser.value
    if (!u) return
    const login = loginMeta.value || {}
    const register = registerMeta.value || {}
    const info = u.lastDeviceInfo || {}
    const lines = [
      `上网 IP: ${login.ip || u.lastLoginIp || info.clientIp || '—'}`,
      `上网归属地: ${login.location || '—'}`,
      `上网 ISP: ${login.isp || '—'}`,
      `局域网 IP: ${info.localIp || '—'}`,
      `注册 IP: ${u.registerIp || '—'}`,
      `注册归属地: ${register.location || u.province || '—'}`,
      `X-Forwarded-For: ${u.lastLoginForwarded || info.forwardedFor || '—'}`,
      `远端地址: ${info.remoteAddress || '—'}`
    ].join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      ElMessage.success('已复制 IP 信息')
    } catch {
      ElMessage.error('复制失败')
    }
  }

  function actionBtn(label: string, type: string, onClick: () => void, className = '') {
    return h(ElButton, { link: true, type: type as any, class: className, onClick }, () => label)
  }

  const { columns, columnChecks } = useTableColumns(() => [
    { type: 'index', width: 56, label: '序号' },
    {
      prop: 'chatNo',
      label: '聊聊号',
      width: 110,
      formatter: (row: UserRow) =>
        h(
          ElButton,
          { link: true, type: 'primary', onClick: () => editChatNo(row) },
          () => (row.chatNo ? String(row.chatNo) : '设置')
        )
    },
    {
      prop: 'user',
      label: '用户',
      minWidth: 240,
      formatter: (row: UserRow) => {
        const badges = userBadges(row)
        return h('div', { class: 'flex items-center gap-3 py-1', key: `u-${row.id}` }, [
          h(XhamilAvatar, {
            src: row.avatarUrl,
            uid: row.id,
            size: 40,
            imgClass: 'rounded-full object-cover bg-g-200 shrink-0'
          }),
          h('div', { class: 'min-w-0' }, [
            h('div', { class: 'flex items-center gap-1.5 flex-wrap font-medium' }, [
              isPhoneUser(row)
                ? h(ArtSvgIcon, {
                    icon: 'ri:smartphone-line',
                    class: 'text-sm text-success shrink-0',
                    title: '已用手机 App 登录'
                  })
                : null,
              h('span', { class: 'truncate' }, displayName(row)),
              ...badges.map((b: any) =>
                h(
                  'span',
                  {
                    class:
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none',
                    style: { background: b.badgeColor || '#FF9800' }
                  },
                  b.badgeText
                )
              ),
              isBanned(row)
                ? h(ElTag, { type: 'danger', size: 'small', class: 'm-0' }, () => '已封禁')
                : null
            ]),
            h('div', { class: 'text-xs text-g-500 truncate' }, `@${row.username || ''}`)
          ])
        ])
      }
    },
    {
      prop: 'restrictions',
      label: '功能限制',
      minWidth: 180,
      formatter: (row: UserRow) => {
        const active = restrictionKeys.filter((k) => row.restrictions?.[k])
        if (!active.length) return h('span', { class: 'text-g-400 text-xs' }, '无')
        return h(
          'div',
          { class: 'flex flex-wrap gap-1' },
          active.map((k) =>
            h(ElTag, { type: 'warning', size: 'small', class: 'm-0' }, () =>
              USER_RESTRICTION_LABELS[k].replace('禁止', '')
            )
          )
        )
      }
    },
    {
      prop: 'email',
      label: '邮箱',
      minWidth: 150,
      showOverflowTooltip: true,
      formatter: (row: UserRow) => row.email || '—'
    },
    {
      prop: 'registerIp',
      label: '注册 IP',
      minWidth: 140,
      showOverflowTooltip: true,
      formatter: (row: UserRow) => row.registerIp || '—'
    },
    {
      prop: 'lastLoginIp',
      label: '最近登录 IP',
      minWidth: 140,
      showOverflowTooltip: true,
      formatter: (row: UserRow) => row.lastLoginIp || row.lastDeviceInfo?.clientIp || '—'
    },
    {
      prop: 'lastDeviceModel',
      label: '手机型号',
      minWidth: 140,
      showOverflowTooltip: true,
      formatter: (row: UserRow) =>
        row.lastDeviceModel || row.lastDeviceInfo?.modelLabel || (isPhoneUser(row) ? '未知' : '—')
    },
    {
      prop: 'status',
      label: '状态',
      width: 88,
      formatter: (row: UserRow) =>
        h(ElTag, { type: isBanned(row) ? 'danger' : 'success', size: 'small' }, () =>
          isBanned(row) ? '封禁' : '正常'
        )
    },
    {
      prop: 'joined',
      label: '注册时间',
      width: 160,
      formatter: (row: UserRow) => fmtTime(row.joined || row.createdAt)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 320,
      fixed: 'right',
      formatter: (row: UserRow) =>
        h('div', { class: 'flex flex-wrap items-center' }, [
          actionBtn(
            '手机',
            'primary',
            () => openDevice(row),
            isPhoneUser(row) ? 'text-success!' : ''
          ),
          actionBtn('聊聊号', 'primary', () => editChatNo(row)),
          actionBtn('微标', 'primary', () => openBadgeEditor(row)),
          actionBtn('限制', 'primary', () => openRestrictions(row)),
          actionBtn(isBanned(row) ? '解封' : '封禁', isBanned(row) ? 'success' : 'warning', () =>
            toggleBan(row)
          ),
          actionBtn('删除', 'danger', () => remove(row))
        ])
    }
  ])

  function handleSearch() {
    applied.value = { ...searchForm.value }
    page.current = 1
  }
  function handleReset() {
    searchForm.value = { keyword: '', status: '', client: '' }
    applied.value = { keyword: '', status: '', client: '' }
    page.current = 1
  }
  function onSizeChange(size: number) {
    page.size = size
    page.current = 1
  }
  function onCurrentChange(current: number) {
    page.current = current
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getUsers()
      list.value = data?.list || []
    } finally {
      loading.value = false
    }
  }

  function openCreate() {
    Object.assign(createForm, { username: '', password: '', nickname: '', email: '' })
    createOpen.value = true
  }

  async function saveCreate() {
    if (!createForm.username || !createForm.password) {
      ElMessage.error('请填写用户名和密码')
      return
    }
    saving.value = true
    try {
      await xhamilApi.createUser({ ...createForm })
      createOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  async function openDevice(row: UserRow) {
    deviceUser.value = row
    loginMeta.value = null
    registerMeta.value = null
    deviceOpen.value = true
    deviceLoading.value = true
    try {
      const data = await xhamilApi.getUserDevice(row.id)
      if (data?.user) deviceUser.value = data.user
      loginMeta.value = data?.loginMeta || null
      registerMeta.value = data?.registerMeta || null
    } catch {
      /* 列表里已有基础字段，归属地失败时仍可查看 */
    } finally {
      deviceLoading.value = false
    }
  }

  function openRestrictions(row: UserRow) {
    restrictUser.value = row
    Object.assign(restrictDraft, emptyRestrictions(), row.restrictions || {})
    restrictOpen.value = true
  }

  function restrictionHint(key: keyof UserRestrictions) {
    if (key === 'chatMute' && restrictDraft.chatMute) {
      if (restrictDraft.chatMutePermanent || !restrictDraft.chatMuteUntil) return '永久禁言中，关闭即可解除'
      return `禁言至 ${String(restrictDraft.chatMuteUntil).replace('T', ' ').slice(0, 16)}`
    }
    if (key === 'postMoment' && restrictDraft.postMoment) {
      if (restrictDraft.postMomentPermanent || !restrictDraft.postMomentUntil) return '永久禁发中，关闭即可解除'
      return `禁发至 ${String(restrictDraft.postMomentUntil).replace('T', ' ').slice(0, 16)}`
    }
    return ''
  }

  async function saveRestrictions() {
    if (!restrictUser.value) return
    savingRestrict.value = true
    try {
      const payload = {
        ...restrictDraft,
        chatMuteUntil: restrictDraft.chatMute ? restrictDraft.chatMuteUntil : null,
        chatMutePermanent: restrictDraft.chatMute ? !!restrictDraft.chatMutePermanent : false,
        postMomentUntil: restrictDraft.postMoment ? restrictDraft.postMomentUntil : null,
        postMomentPermanent: restrictDraft.postMoment ? !!restrictDraft.postMomentPermanent : false
      }
      await xhamilApi.updateUserRestrictions(restrictUser.value.id, payload)
      restrictOpen.value = false
      await load()
    } finally {
      savingRestrict.value = false
    }
  }

  async function editChatNo(row: UserRow) {
    const { value } = await ElMessageBox.prompt('新聊聊号（数字）', '修改聊聊号', {
      inputValue: String(row.chatNo || ''),
      inputPattern: /^\d+$/,
      inputErrorMessage: '须为数字'
    })
    await xhamilApi.updateUserChatNo(row.id, value)
    await load()
  }

  function openBadgeEditor(row: UserRow) {
    badgeUser.value = row
    const list = userBadges(row)
    badgeDrafts.value = list.length
      ? list.map((b) => ({ ...b }))
      : [{ badgeText: '', badgeColor: '#FF9800' }]
    badgeOpen.value = true
  }

  function applyBadgePreset(preset: { text: string; color: string }) {
    const emptyIdx = badgeDrafts.value.findIndex((b) => !String(b.badgeText || '').trim())
    if (emptyIdx >= 0) {
      badgeDrafts.value[emptyIdx] = { badgeText: preset.text, badgeColor: preset.color }
      return
    }
    if (badgeDrafts.value.length >= USER_BADGE_MAX) {
      ElMessage.warning('最多 5 个微标')
      return
    }
    badgeDrafts.value.push({ badgeText: preset.text, badgeColor: preset.color })
  }

  async function saveBadges() {
    if (!badgeUser.value) return
    const badges = badgeDrafts.value
      .map((b) => ({
        badgeText: String(b.badgeText || '')
          .replace(/\s+/g, '')
          .slice(0, 8),
        badgeColor: normalizeBadgeColor(b.badgeColor)
      }))
      .filter((b) => b.badgeText)
      .slice(0, USER_BADGE_MAX)
    if (!badges.length) {
      ElMessage.warning('请至少填写一个微标，或使用「清除微标」')
      return
    }
    savingBadge.value = true
    try {
      await xhamilApi.updateUserBadge(badgeUser.value.id, { badges, clear: false })
      badgeOpen.value = false
      await load()
    } finally {
      savingBadge.value = false
    }
  }

  async function clearBadges() {
    if (!badgeUser.value) return
    savingBadge.value = true
    try {
      await xhamilApi.updateUserBadge(badgeUser.value.id, { badges: [], clear: true })
      badgeOpen.value = false
      await load()
    } finally {
      savingBadge.value = false
    }
  }

  async function toggleBan(row: UserRow) {
    await xhamilApi.banUser(row.id, !isBanned(row))
    await load()
  }

  async function remove(row: UserRow) {
    await ElMessageBox.confirm(`确定删除用户「${displayName(row)}」？`, '删除用户', {
      type: 'warning'
    })
    await xhamilApi.deleteUser(row.id)
    await load()
  }

  async function cleanup() {
    await xhamilApi.cleanupZombies()
    await load()
  }

  onMounted(load)
</script>

<style scoped>
  .pad {
    position: relative;
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    min-height: 560px;
    max-height: min(78vh, 680px);
    overflow: hidden;
    border-radius: 22px;
    background: #fff;
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
  }
  .pad-close {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: #4e5969;
    background: #f2f3f5;
    cursor: pointer;
  }
  .pad-close:hover {
    color: #1d2129;
    background: #e5e6eb;
  }
  .pad-close .art-svg-icon {
    font-size: 18px;
  }
  .pad-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 36px 24px 28px;
    text-align: center;
    color: #fff;
    background:
      radial-gradient(120% 80% at 0% 0%, rgba(255, 255, 255, 0.16), transparent 55%),
      linear-gradient(180deg, #3d8bfd 0%, #2563eb 55%, #1d4ed8 100%);
  }
  .pad-side h3 {
    margin: 14px 0 4px;
    font-size: 20px;
    font-weight: 650;
    line-height: 1.3;
  }
  .pad-side :deep(.el-tag) {
    border: 0;
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
  }
  .pad-side :deep(.el-button) {
    width: 100%;
    color: #1d4ed8;
    background: #fff;
    border: 0;
  }
  .pad-side :deep(.el-button:hover) {
    background: #f0f6ff;
  }
  .pad-sub {
    margin: 0 0 12px;
    font-size: 12px;
    opacity: 0.82;
  }
  .pad-spec--sub {
    margin-top: 10px;
    background: rgba(255, 255, 255, 0.08);
  }
  .pad-spec__label {
    font-size: 11px;
    letter-spacing: 0.08em;
    opacity: 0.72;
  }
  .pad-spec__value {
    margin-top: 6px;
    font-size: 15px;
    font-weight: 650;
    word-break: break-all;
  }
  .pad-spec__meta {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.86;
  }
  .pad-main {
    min-width: 0;
    padding: 28px 48px 24px 24px;
    overflow: auto;
    background: #f6f7fb;
  }
  .pad-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .pad-card {
    min-width: 0;
    padding: 14px 16px 8px;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .pad-card h4 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 650;
    color: #1d2129;
  }
  .pad-card dl {
    margin: 0;
  }
  .pad-row {
    display: flex;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f1f5;
  }
  .pad-row:last-child {
    border-bottom: 0;
  }
  .pad-row dt {
    flex: 0 0 96px;
    font-size: 12px;
    color: #86909c;
  }
  .pad-row dd {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    text-align: right;
    word-break: break-all;
    color: #1d2129;
  }
  .pad-row dd.empty {
    font-weight: 400;
    color: #c0c4cc;
  }
  .pad-hint {
    margin: 14px 0 0;
    font-size: 12px;
    color: #86909c;
  }
  .pad-more {
    margin-top: 12px;
    border: 0;
    background: transparent;
  }
  .ua-box {
    padding: 10px 0 4px;
  }
  .ua-label {
    margin-bottom: 6px;
    font-size: 12px;
    color: #86909c;
  }
  .ua-box code {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    word-break: break-all;
    color: #4e5969;
    white-space: pre-wrap;
  }
  .ua-json {
    max-height: 140px;
    overflow: auto;
  }
  @media (max-width: 960px) {
    .pad,
    .pad-grid {
      grid-template-columns: 1fr;
    }
    .pad {
      min-height: 0;
    }
  }
  .badge-edit-row {
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-extra-light);
  }
  .color-picker {
    width: 36px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .badge-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }
  .badge-live-preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--el-fill-color-lighter);
  }
</style>

<style>
  .device-tablet-overlay {
    background: rgb(0 0 0 / 45%) !important;
  }
  .device-tablet-dialog {
    max-width: calc(100vw - 32px);
    background: transparent !important;
    box-shadow: none !important;
    border: 0 !important;
  }
  .device-tablet-dialog .el-dialog__header,
  .device-tablet-dialog .el-dialog__footer {
    display: none;
  }
  .device-tablet-dialog .el-dialog__body {
    padding: 0;
  }
</style>
