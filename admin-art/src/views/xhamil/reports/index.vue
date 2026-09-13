<!-- 举报中心 -->
<template>
  <div class="reports-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">举报中心</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">查看用户举报、被举报对象最近发言与敏感内容</p>
      </div>
      <ElSpace wrap>
        <ElSelect v-model="statusFilter" style="width: 140px" @change="load">
          <ElOption label="全部状态" value="all" />
          <ElOption label="待处理" value="pending" />
          <ElOption label="处理中" value="reviewing" />
          <ElOption label="已处理" value="resolved" />
          <ElOption label="已驳回" value="rejected" />
        </ElSelect>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <ElButton
          type="danger"
          plain
          :loading="clearing"
          :disabled="!total"
          v-ripple
          @click="clearAll"
        >
          清除全部
        </ElButton>
      </ElSpace>
    </div>

    <ElRow :gutter="16" class="mb-4">
      <ElCol :xs="12" :sm="6" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">全部举报</div>
          <div class="text-2xl font-semibold">{{ total }}</div>
        </div>
      </ElCol>
      <ElCol :xs="12" :sm="6" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">待处理</div>
          <div class="text-2xl font-semibold text-warning">{{ pendingCount }}</div>
        </div>
      </ElCol>
    </ElRow>

    <div class="art-card p-4">
      <ElTable v-loading="loading" :data="list" stripe size="small" empty-text="暂无举报">
        <ElTableColumn label="时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="举报人" min-width="160">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <ElAvatar :size="28" :src="avatarSrc(row.reporter?.avatarUrl)">
                {{ (row.reporter?.nickname || '?').slice(0, 1) }}
              </ElAvatar>
              <div class="min-w-0">
                <div class="truncate font-medium">{{ displayName(row.reporter) }}</div>
                <div class="text-xs text-g-400 font-mono">ID {{ row.reporter?.id }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="被举报对象" min-width="180">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <ElAvatar :size="28" :src="avatarSrc(row.target?.avatarUrl)">
                {{ (row.target?.nickname || '?').slice(0, 1) }}
              </ElAvatar>
              <div class="min-w-0">
                <div class="truncate font-medium">{{ displayName(row.target) }}</div>
                <div class="text-xs text-g-400 font-mono">
                  ID {{ row.target?.id }}
                  <span v-if="row.target?.chatNo"> · {{ row.target.chatNo }}</span>
                </div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="原因" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="88">
          <template #default="{ row }">
            <ElTag v-if="row.momentId" size="small" type="warning">说说</ElTag>
            <ElTag v-else size="small">用户</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="说说媒体" width="120">
          <template #default="{ row }">
            <div v-if="momentMedia(row).length" class="flex items-center gap-1">
              <template v-if="isVideo(momentMedia(row)[0])">
                <a
                  :href="mediaUrl(mediaItemUrl(momentMedia(row)[0]))"
                  target="_blank"
                  rel="noreferrer"
                  class="report-video-thumb"
                >
                  视频
                </a>
              </template>
              <ElImage
                v-else
                :src="mediaUrl(mediaItemUrl(momentMedia(row)[0]))"
                :preview-src-list="momentImagePreview(row)"
                preview-teleported
                fit="cover"
                class="report-thumb"
              />
              <span v-if="momentMedia(row).length > 1" class="text-xs text-g-400">
                +{{ momentMedia(row).length - 1 }}
              </span>
            </div>
            <span v-else-if="row.momentId" class="text-g-400">无</span>
            <span v-else class="text-g-400">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="补充说明" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'text-g-400': !row.detail }">{{ row.detail || '—' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="截图" width="88">
          <template #default="{ row }">
            <div v-if="row.imageUrls?.length" class="flex items-center gap-1">
              <ElImage
                :src="mediaUrl(row.imageUrls[0])"
                :preview-src-list="row.imageUrls.map((u: string) => mediaUrl(u))"
                preview-teleported
                fit="cover"
                class="report-thumb"
              />
              <span v-if="row.imageUrls.length > 1" class="text-xs text-g-400">
                +{{ row.imageUrls.length - 1 }}
              </span>
            </div>
            <span v-else class="text-g-400">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openDetail(row)">查看</ElButton>
            <ElButton link type="warning" @click="openEvidence(row, 'messages')">最近发言</ElButton>
            <ElButton link type="danger" @click="openEvidence(row, 'sensitive')">敏感内容</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <ElDrawer v-model="detailOpen" title="举报详情" size="520px" destroy-on-close>
      <template v-if="current">
        <ElDescriptions :column="1" border size="small">
          <ElDescriptionsItem label="举报人">{{ displayName(current.reporter) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="被举报">{{ displayName(current.target) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="原因">{{ current.reason }}</ElDescriptionsItem>
          <ElDescriptionsItem label="说明">{{ current.detail || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem v-if="current.momentId" label="说说内容">
            {{ current.moment?.deleted ? '说说已删除' : current.moment?.content || '—' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="current.momentId" label="违规提示">
            <ElAlert
              v-if="(current.moment?.matchedWords || []).length"
              type="error"
              :closable="false"
              show-icon
              title="命中违禁词（本地智能词库 + 后台配置）"
              :description="`命中：${(current.moment?.matchedWords || []).join('、')}`"
            />
            <ElAlert
              v-else-if="current.moment?.deleted"
              type="info"
              :closable="false"
              show-icon
              title="说说已删除，无法再检测词库"
            />
            <ElAlert
              v-else
              type="warning"
              :closable="false"
              show-icon
              title="未命中词库"
              description="当前内容未命中本地智能词库与后台违禁词，仍可点下方「智能检测」扫最近发言，或人工判断后删除/禁发。"
            />
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="current.momentId" label="说说媒体">
            <div v-if="momentMedia(current).length" class="flex flex-wrap gap-2">
              <template v-for="(item, idx) in momentMedia(current)" :key="`${mediaItemUrl(item)}-${idx}`">
                <video
                  v-if="isVideo(item)"
                  :src="mediaUrl(mediaItemUrl(item))"
                  controls
                  preload="metadata"
                  class="report-detail-video"
                />
                <ElImage
                  v-else
                  :src="mediaUrl(mediaItemUrl(item))"
                  :preview-src-list="momentImagePreview(current)"
                  preview-teleported
                  fit="cover"
                  class="report-detail-img"
                />
              </template>
            </div>
            <span v-else class="text-g-400">无图片/视频</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="current.imageUrls?.length" label="截图">
            <div class="flex flex-wrap gap-2">
              <ElImage
                v-for="(url, idx) in current.imageUrls"
                :key="`${url}-${idx}`"
                :src="mediaUrl(url)"
                :preview-src-list="current.imageUrls.map((u: string) => mediaUrl(u))"
                :initial-index="idx"
                preview-teleported
                fit="cover"
                class="report-detail-img"
              />
            </div>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="提交时间">{{ fmtTime(current.createdAt) }}</ElDescriptionsItem>
        </ElDescriptions>

        <div class="mt-4 art-card p-3">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-sm font-medium">智能内容检测</div>
            <ElButton type="primary" size="small" :loading="smartScanning" @click="runSmartScan">
              智能检测
            </ElButton>
          </div>
          <div class="text-xs text-g-500 mb-2">
            本地开源词库（免密钥）+ 后台违禁词，扫描本条举报说明、被举报说说，以及对方最近发言与说说。仅辅助审核，不会自动删帖。
          </div>
          <template v-if="smartScan">
            <ElAlert
              :type="smartScan.summary?.hasHit ? 'error' : 'success'"
              :closable="false"
              show-icon
              class="mb-2"
              :title="
                smartScan.summary?.hasHit
                  ? `检出 ${smartScan.summary.uniqueWords?.length || 0} 个敏感词`
                  : '未检出敏感内容'
              "
              :description="
                smartScan.summary?.hasHit
                  ? `命中词：${(smartScan.summary.uniqueWords || []).join('、')}；发言命中 ${smartScan.summary.messageHitCount || 0} 条，说说命中 ${smartScan.summary.momentHitCount || 0} 条（已扫 ${smartScan.scanned?.messages || 0} 条发言 / ${smartScan.scanned?.moments || 0} 条说说）`
                  : `已扫 ${smartScan.scanned?.messages || 0} 条发言、${smartScan.scanned?.moments || 0} 条说说（词库约 ${smartScan.mergedWordCount || 0} 词）`
              "
            />
            <div
              v-if="(smartScan.report?.detailMatchedWords || []).length"
              class="text-xs mb-1"
            >
              举报说明命中：{{ smartScan.report.detailMatchedWords.join('、') }}
            </div>
            <div
              v-if="(smartScan.report?.detailMatchedWords || []).length && editStatus !== 'rejected'"
              class="ban-preset-block mb-2"
            >
              <PresetBlockHeader
                label="举报说明命中 · 快捷回复"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === 'detail_hit'"
                @ai-generate="generateAiNote('detail_hit', 'mute')"
              />
              <PresetChipRow
                :presets="presetsFor('detail_hit')"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
            <div
              v-if="(smartScan.report?.momentMatchedWords || []).length"
              class="text-xs mb-2"
            >
              本条说说命中：{{ smartScan.report.momentMatchedWords.join('、') }}
            </div>
            <div
              v-if="(smartScan.report?.momentMatchedWords || []).length && editStatus !== 'rejected'"
              class="ban-preset-block mb-2"
            >
              <PresetBlockHeader
                label="本条说说命中 · 快捷回复"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === 'reported_moment_hit'"
                @ai-generate="generateAiNote('reported_moment_hit', current.momentId ? 'moment' : 'mute')"
              />
              <PresetChipRow
                :presets="presetsFor('reported_moment_hit')"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
            <div v-if="(smartScan.messages || []).length" class="mb-2">
              <div class="text-xs font-medium mb-1">最近发言命中</div>
              <div
                v-for="item in smartScan.messages.slice(0, 8)"
                :key="`sm-${item.id}`"
                class="evidence-item"
              >
                <div class="flex justify-between gap-2 text-xs text-g-400 mb-1">
                  <span>{{ item.conversationTitle || `会话 ${item.conversationId}` }}</span>
                  <span>{{ fmtTime(item.createdAt) }}</span>
                </div>
                <div class="text-sm break-all mb-1">{{ item.content }}</div>
                <div class="text-xs text-danger">命中：{{ (item.matchedWords || []).join('、') }}</div>
              </div>
            </div>
            <div
              v-if="(smartScan.messages || []).length && editStatus !== 'rejected'"
              class="ban-preset-block mb-2"
            >
              <PresetBlockHeader
                label="发言命中 · 快捷回复"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === 'message_hit'"
                @ai-generate="generateAiNote('message_hit', 'mute')"
              />
              <PresetChipRow
                :presets="presetsFor('message_hit')"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
            <div v-if="(smartScan.moments || []).length">
              <div class="text-xs font-medium mb-1">最近说说命中</div>
              <div
                v-for="item in smartScan.moments.slice(0, 8)"
                :key="`smo-${item.id}`"
                class="evidence-item"
              >
                <div class="text-xs text-g-400 mb-1">
                  {{ fmtTime(item.createdAt) }}
                  <ElTag v-if="item.isReportedMoment" size="small" type="danger" class="ml-1">本条举报</ElTag>
                </div>
                <div class="text-sm break-all mb-1">{{ item.content }}</div>
                <div class="text-xs text-danger">命中：{{ (item.matchedWords || []).join('、') }}</div>
              </div>
            </div>
            <div
              v-if="(smartScan.moments || []).length && editStatus !== 'rejected'"
              class="ban-preset-block mb-2"
            >
              <PresetBlockHeader
                label="说说命中 · 快捷回复"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === 'moment_hit'"
                @ai-generate="generateAiNote('moment_hit', current.momentId ? 'moment' : 'mute')"
              />
              <PresetChipRow
                :presets="presetsFor('moment_hit')"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
            <div
              v-if="smartScan && !smartScan.summary?.hasHit && editStatus !== 'rejected'"
              class="ban-preset-block mb-2"
            >
              <PresetBlockHeader
                label="未检出 · 快捷回复"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === 'no_hit'"
                @ai-generate="generateAiNote('no_hit', 'mute')"
              />
              <PresetChipRow
                :presets="presetsFor('no_hit')"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
          </template>
        </div>

        <div class="mt-4 art-card p-3">
          <div class="text-sm font-medium mb-2">全站禁言处理</div>
          <div class="text-xs text-g-500 mb-2">
            建议先点上方「智能检测」。禁言后对方无法在群聊、私聊、发说说、说说评论中发言。
          </div>
          <ElAlert
            v-if="smartScan && !smartScan.summary?.hasHit"
            type="warning"
            :closable="false"
            show-icon
            class="mb-2"
            title="尚未检出敏感词"
            description="仍可人工判断后禁言；若已检出则可直接执行。"
          />
          <ElAlert
            v-else-if="smartScan?.summary?.hasHit"
            type="success"
            :closable="false"
            show-icon
            class="mb-2"
            title="已检出违规内容，可执行禁言"
            :description="`命中：${(smartScan.summary.uniqueWords || []).join('、')}`"
          />
          <div class="text-sm mb-2">禁言时长</div>
          <ElRadioGroup v-model="muteMode" class="mb-2 flex flex-wrap gap-2">
            <ElRadioButton label="days">自定义天数</ElRadioButton>
            <ElRadioButton label="forever">永久</ElRadioButton>
          </ElRadioGroup>
          <ElInputNumber
            v-if="muteMode === 'days'"
            v-model="muteDaysCustom"
            :min="1"
            :max="3650"
            class="w-full mb-2"
          />
          <div v-if="muteMode === 'days'" class="text-xs text-g-500 mb-3">
            将禁言 {{ muteDaysCustom }} 天（可改）
          </div>
          <div v-else class="text-xs text-g-500 mb-3">将永久禁言</div>
          <div class="text-xs text-g-500 mb-3">
            下方处理备注将作为禁言原因，以系统消息发给对方
          </div>
          <ElButton
            class="w-full"
            type="danger"
            :loading="muting"
            @click="moderateMute"
          >
            执行禁言并标为已处理
          </ElButton>
        </div>

        <div v-if="current.momentId" class="mt-4 art-card p-3">
          <div class="text-sm font-medium mb-2">说说违规处理</div>
          <ElCheckbox
            v-model="deleteMoment"
            :disabled="!!current.moment?.deleted"
            class="mb-3"
          >
            删除该说说
          </ElCheckbox>
          <div class="text-sm mb-2">禁止对方发说说</div>
          <ElRadioGroup v-model="banMode" class="mb-2 flex flex-wrap gap-2">
            <ElRadioButton label="none">不限制</ElRadioButton>
            <ElRadioButton label="days">自定义天数</ElRadioButton>
            <ElRadioButton label="forever">永久</ElRadioButton>
          </ElRadioGroup>
          <ElInputNumber
            v-if="banMode === 'days'"
            v-model="banDaysCustom"
            :min="1"
            :max="3650"
            class="w-full mb-2"
          />
          <div v-if="banMode === 'days'" class="text-xs text-g-500 mb-2">
            将禁止 {{ banDaysCustom }} 天（可改）
          </div>
          <div v-if="banMode !== 'none'" class="text-xs text-g-500 mb-3">
            下方处理备注将作为封禁原因，以系统消息发给对方
          </div>
          <ElButton
            class="w-full"
            type="danger"
            :loading="moderating"
            :disabled="!deleteMoment && banMode === 'none'"
            @click="moderateMoment"
          >
            执行处理并标为已处理
          </ElButton>
        </div>

        <div class="mt-4">
          <div class="text-sm mb-2">处理状态</div>
          <ElSelect v-model="editStatus" class="w-full mb-3">
            <ElOption label="待处理" value="pending" />
            <ElOption label="处理中" value="reviewing" />
            <ElOption label="已处理" value="resolved" />
            <ElOption label="已驳回" value="rejected" />
          </ElSelect>
          <div v-if="editStatus === 'rejected'" class="mb-2">
            <div class="text-xs text-g-500 mb-1">驳回预设（点一下填入，可再改）</div>
            <div class="flex flex-wrap gap-2">
              <ElButton
                v-for="p in rejectPresets"
                :key="p.label"
                size="small"
                :type="editNote.trim() === p.text ? 'primary' : 'default'"
                @click="editNote = p.text"
              >
                {{ p.label }}
              </ElButton>
            </div>
          </div>
          <template v-else>
            <div
              v-for="group in banPresetGroups"
              :key="`note-${group.context}`"
              class="ban-preset-block mb-3"
            >
              <PresetBlockHeader
                :label="`${group.label} · 快捷回复`"
                :ai-available="aiAvailable"
                :ai-loading="aiGenerating === group.context"
                @ai-generate="generateAiNote(group.context, current.momentId ? 'moment' : 'mute')"
              />
              <PresetChipRow
                :presets="group.presets"
                :active-text="editNote"
                @apply="editNote = $event"
              />
            </div>
          </template>
          <ElInput
            v-model="editNote"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :placeholder="
              editStatus === 'rejected'
                ? '驳回说明会发给举报人，可点预设或自己写'
                : '处理备注会作为禁言/封禁原因发给对方（可选）'
            "
          />
          <ElButton class="mt-3 w-full" type="primary" :loading="saving" @click="saveStatus">
            保存处理结果
          </ElButton>
        </div>
      </template>
    </ElDrawer>

    <ElDrawer
      v-model="evidenceOpen"
      :title="evidenceMode === 'sensitive' ? '最近敏感内容' : '最近发言'"
      size="560px"
      destroy-on-close
    >
      <div v-if="evidenceTarget" class="mb-3 text-sm text-g-500">
        对象：{{ displayName(evidenceTarget) }}（ID {{ evidenceTarget.id }}）
      </div>
      <div v-loading="evidenceLoading">
        <template v-if="evidenceMode === 'messages'">
          <div v-if="!messageList.length" class="text-g-400 text-sm">暂无发言记录</div>
          <div v-for="item in messageList" :key="item.id" class="evidence-item">
            <div class="flex justify-between gap-2 text-xs text-g-400 mb-1">
              <span>{{ item.conversationTitle || `会话 ${item.conversationId}` }} · {{ item.messageType }}</span>
              <span>{{ fmtTime(item.createdAt) }}</span>
            </div>
            <div class="text-sm break-all">{{ item.content || '[非文本]' }}</div>
          </div>
        </template>
        <template v-else>
          <h4 class="text-sm font-medium mt-0 mb-2">聊天敏感内容</h4>
          <div v-if="!sensitiveMessages.length" class="text-g-400 text-sm mb-4">暂无</div>
          <div v-for="item in sensitiveMessages" :key="`m-${item.id}`" class="evidence-item">
            <div class="flex justify-between gap-2 text-xs text-g-400 mb-1">
              <span>{{ item.conversationTitle || `会话 ${item.conversationId}` }}</span>
              <span>{{ fmtTime(item.createdAt) }}</span>
            </div>
            <div class="text-sm break-all mb-1">{{ item.content }}</div>
            <div v-if="item.matchedWords?.length" class="text-xs text-danger">
              命中：{{ item.matchedWords.join('、') }}
            </div>
            <ElTag v-if="item.looksMasked" size="small" type="warning" class="mt-1">疑似已打码</ElTag>
          </div>
          <h4 class="text-sm font-medium mt-4 mb-2">说说敏感内容</h4>
          <div v-if="!sensitiveMoments.length" class="text-g-400 text-sm">暂无</div>
          <div v-for="item in sensitiveMoments" :key="`mo-${item.id}`" class="evidence-item">
            <div class="text-xs text-g-400 mb-1">{{ fmtTime(item.createdAt) }}</div>
            <div class="text-sm break-all mb-1">{{ item.content }}</div>
            <div v-if="item.matchedWords?.length" class="text-xs text-danger">
              命中：{{ item.matchedWords.join('、') }}
            </div>
          </div>
        </template>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox, ElButton } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { avatarSrc, mediaUrl } from '@/utils/xhamilMedia'
  import {
    collectPresetsForScan,
    getPresetsForContext,
    BAN_REASON_CONTEXT_LABELS,
    type BanReasonContext,
    type BanReasonPreset
  } from '@/data/banReasonPresets'

  defineOptions({ name: 'XhamilReports' })

  const PresetBlockHeader = defineComponent({
    name: 'PresetBlockHeader',
    props: {
      label: { type: String, required: true },
      aiAvailable: { type: Boolean, default: false },
      aiLoading: { type: Boolean, default: false }
    },
    emits: ['aiGenerate'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'flex items-center justify-between gap-2 mb-1' }, [
          h('div', { class: 'text-xs text-g-500' }, props.label),
          props.aiAvailable
            ? h(
                ElButton,
                {
                  size: 'small',
                  type: 'primary',
                  link: true,
                  loading: props.aiLoading,
                  onClick: () => emit('aiGenerate')
                },
                () => 'AI 生成'
              )
            : null
        ])
    }
  })

  const PresetChipRow = defineComponent({
    name: 'PresetChipRow',
    props: {
      presets: { type: Array as PropType<BanReasonPreset[]>, default: () => [] },
      activeText: { type: String, default: '' }
    },
    emits: ['apply'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          { class: 'flex flex-wrap gap-2' },
          props.presets.map((p) =>
            h(
              ElButton,
              {
                key: p.id,
                size: 'small',
                type: props.activeText.trim() === p.text ? 'primary' : 'default',
                onClick: () => emit('apply', p.text)
              },
              () => p.label
            )
          )
        )
    }
  })

  type ReportRow = Record<string, any>

  const loading = ref(false)
  const clearing = ref(false)
  const saving = ref(false)
  const list = ref<ReportRow[]>([])
  const total = ref(0)
  const statusFilter = ref('all')

  const detailOpen = ref(false)
  const current = ref<ReportRow | null>(null)
  const editStatus = ref('pending')
  const editNote = ref('')
  const moderating = ref(false)
  const muting = ref(false)
  const deleteMoment = ref(true)
  const banMode = ref<'none' | 'days' | 'forever'>('days')
  const banDaysCustom = ref(7)
  const muteMode = ref<'days' | 'forever'>('days')
  const muteDaysCustom = ref(7)
  const smartScanning = ref(false)
  const smartScan = ref<Record<string, any> | null>(null)
  const aiAvailable = ref(false)
  const aiGenerating = ref('')

  const banPresetGroups = computed(() =>
    collectPresetsForScan(smartScan.value, current.value?.reason || '')
  )

  function presetsFor(context: BanReasonContext) {
    return getPresetsForContext(context, current.value?.reason || '')
  }

  const rejectPresets = [
    {
      label: '证据不足',
      text: '经核实，您的举报内容未能满足处理条件，已作驳回处理。如有新的证据，欢迎再次提交。'
    },
    {
      label: '未构成违规',
      text: '驳回通知：经工作人员核查，该举报未构成违规，已终止流程。如有疑问可联系客服。'
    }
  ]

  const evidenceOpen = ref(false)
  const evidenceLoading = ref(false)
  const evidenceMode = ref<'messages' | 'sensitive'>('messages')
  const evidenceTarget = ref<ReportRow | null>(null)
  const messageList = ref<any[]>([])
  const sensitiveMessages = ref<any[]>([])
  const sensitiveMoments = ref<any[]>([])

  const pendingCount = computed(
    () => list.value.filter((r) => r.status === 'pending').length
  )

  function displayName(u?: ReportRow | null) {
    if (!u) return '—'
    return u.nickname || u.username || `用户 ${u.id}`
  }

  function fmtTime(v?: string | null) {
    if (!v) return '—'
    return String(v).replace('T', ' ').slice(0, 19)
  }

  function momentMedia(row?: ReportRow | null) {
    const media = row?.moment?.media
    if (Array.isArray(media) && media.length) return media
    return []
  }

  function mediaItemUrl(item: any) {
    return typeof item === 'string' ? item : item?.url || ''
  }

  function isVideo(item: any) {
    const src = mediaItemUrl(item)
    return (
      (typeof item !== 'string' && item?.type === 'video') || /Moments(%20)?Videos/i.test(src)
    )
  }

  function momentImagePreview(row?: ReportRow | null) {
    return momentMedia(row)
      .filter((item: any) => !isVideo(item))
      .map((item: any) => mediaUrl(mediaItemUrl(item)))
      .filter(Boolean)
  }

  function statusLabel(status?: string) {
    return (
      {
        pending: '待处理',
        reviewing: '处理中',
        resolved: '已处理',
        rejected: '已驳回'
      }[String(status || '')] || status || '—'
    )
  }

  function statusType(status?: string) {
    return (
      {
        pending: 'warning',
        reviewing: 'primary',
        resolved: 'success',
        rejected: 'info'
      }[String(status || '')] || 'info'
    ) as any
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getReports({
        status: statusFilter.value,
        limit: 200
      })
      list.value = data?.list || []
      total.value = data?.total ?? list.value.length
    } finally {
      loading.value = false
    }
  }

  async function clearAll() {
    const filterLabel =
      {
        all: '全部',
        pending: '待处理',
        reviewing: '处理中',
        resolved: '已处理',
        rejected: '已驳回'
      }[statusFilter.value] || '全部'
    const tip =
      statusFilter.value === 'all'
        ? '将删除全部举报记录，不可恢复。用户侧的举报回执通知不会删除。确定继续？'
        : `将删除当前筛选下的「${filterLabel}」举报记录，不可恢复。用户侧的举报回执通知不会删除。确定继续？`
    await ElMessageBox.confirm(tip, '清除全部', {
      type: 'warning',
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
    clearing.value = true
    try {
      const data = await xhamilApi.clearReports(statusFilter.value)
      ElMessage.success(
        data?.cleared ? `已清除 ${data.cleared} 条举报` : '暂无举报可清除'
      )
      detailOpen.value = false
      current.value = null
      await load()
    } catch (e: any) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        ElMessage.error(e?.message || '清除失败')
      }
    } finally {
      clearing.value = false
    }
  }

  function openDetail(row: ReportRow) {
    current.value = row
    editStatus.value = row.status || 'pending'
    editNote.value = row.adminNote || ''
    deleteMoment.value = !!row.momentId && !row.moment?.deleted
    banMode.value = 'days'
    banDaysCustom.value = 7
    muteMode.value = 'days'
    muteDaysCustom.value = 7
    smartScan.value = null
    detailOpen.value = true
    loadAiStatus()
  }

  async function loadAiStatus() {
    try {
      const data = await xhamilApi.getReportAiNoteStatus()
      aiAvailable.value = !!data?.available
    } catch {
      aiAvailable.value = false
    }
  }

  async function generateAiNote(context: BanReasonContext, action: 'mute' | 'moment' | 'general') {
    if (!current.value?.id) return
    if (!aiAvailable.value) {
      ElMessage.warning('请先在「群 AI」中配置并启用 AI')
      return
    }
    aiGenerating.value = context
    try {
      const data = await xhamilApi.generateReportNote(current.value.id, {
        action,
        detectionContext: BAN_REASON_CONTEXT_LABELS[context] || context,
        scanSummary: smartScan.value?.summary || undefined
      })
      if (data?.note) {
        editNote.value = data.note
        ElMessage.success(data.botName ? `已由 ${data.botName} 生成` : '已生成')
      }
    } catch (e: any) {
      ElMessage.error(e?.message || 'AI 生成失败')
    } finally {
      aiGenerating.value = ''
    }
  }

  async function runSmartScan() {
    if (!current.value?.id) return
    smartScanning.value = true
    try {
      const data = await xhamilApi.smartScanReport(current.value.id)
      smartScan.value = data || null
      if (data?.summary?.hasHit) {
        ElMessage.warning(`检出敏感词：${(data.summary.uniqueWords || []).join('、')}`)
      } else {
        ElMessage.success('未检出敏感内容')
      }
      // 同步刷新本条说说的命中展示
      if (current.value.moment && data?.report?.momentMatchedWords) {
        current.value = {
          ...current.value,
          moment: {
            ...current.value.moment,
            matchedWords: data.report.momentMatchedWords
          }
        }
      }
    } catch (e: any) {
      ElMessage.error(e?.message || '智能检测失败')
    } finally {
      smartScanning.value = false
    }
  }

  async function saveStatus() {
    if (!current.value) return
    saving.value = true
    try {
      await xhamilApi.updateReport(current.value.id, {
        status: editStatus.value,
        adminNote: editNote.value
      })
      ElMessage.success(
        editStatus.value === 'rejected' ? '已驳回，并已向举报人发送通知' : '已更新'
      )
      detailOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  async function moderateMoment() {
    if (!current.value?.momentId) return
    if (!deleteMoment.value && banMode.value === 'none') {
      ElMessage.warning('请至少选择删除说说或禁发')
      return
    }
    moderating.value = true
    try {
      let banDays: number | null = null
      if (banMode.value === 'forever') banDays = -1
      else if (banMode.value === 'days') banDays = Number(banDaysCustom.value) || 7
      await xhamilApi.moderateMomentReport(current.value.id, {
        deleteMoment: deleteMoment.value && !current.value.moment?.deleted,
        banDays,
        status: 'resolved',
        adminNote: editNote.value
      })
      detailOpen.value = false
      await load()
    } finally {
      moderating.value = false
    }
  }

  async function moderateMute() {
    if (!current.value?.id) return
    if (!smartScan.value) {
      ElMessage.warning('请先点击「智能检测」再禁言')
      return
    }
    muting.value = true
    try {
      const muteDays = muteMode.value === 'forever' ? -1 : Number(muteDaysCustom.value) || 7
      await xhamilApi.moderateChatMuteReport(current.value.id, {
        muteDays,
        status: 'resolved',
        adminNote: editNote.value
      })
      detailOpen.value = false
      await load()
    } finally {
      muting.value = false
    }
  }

  async function openEvidence(row: ReportRow, mode: 'messages' | 'sensitive') {
    const targetId = Number(row.target?.id)
    if (!targetId) {
      ElMessage.error('无效的被举报用户')
      return
    }
    evidenceMode.value = mode
    evidenceTarget.value = row.target
    evidenceOpen.value = true
    evidenceLoading.value = true
    messageList.value = []
    sensitiveMessages.value = []
    sensitiveMoments.value = []
    try {
      if (mode === 'messages') {
        const data = await xhamilApi.getUserRecentMessages(targetId, 50)
        messageList.value = data?.list || []
      } else {
        const data = await xhamilApi.getUserSensitive(targetId, 50)
        sensitiveMessages.value = data?.messages || []
        sensitiveMoments.value = data?.moments || []
      }
    } finally {
      evidenceLoading.value = false
    }
  }

  onMounted(() => {
    load()
    loadAiStatus()
  })
</script>

<style scoped>
  .evidence-item {
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-extra-light);
  }
  .evidence-item:last-child {
    border-bottom: 0;
  }
  .report-thumb {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
  }
  .report-detail-img {
    width: 88px;
    height: 88px;
    border-radius: 8px;
    overflow: hidden;
  }
  .report-detail-video {
    width: 220px;
    max-width: 100%;
    height: 124px;
    border-radius: 8px;
    background: #111;
    object-fit: contain;
  }
  .report-video-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: #111;
    color: #fff;
    font-size: 11px;
    text-decoration: none;
  }
  .ban-preset-block {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--el-fill-color-lighter, #f5f7fa);
  }
</style>
