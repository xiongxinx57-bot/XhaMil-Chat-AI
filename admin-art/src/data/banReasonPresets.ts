/** 举报中心：封禁/禁言原因快捷回复（按智能检测结果维度） */

export type BanReasonContext =
  | 'message_hit'
  | 'moment_hit'
  | 'reported_moment_hit'
  | 'detail_hit'
  | 'no_hit'
  | 'general'

export type BanReasonPreset = {
  id: string
  label: string
  text: string
  contexts: BanReasonContext[]
  /** 空或未匹配时不按举报原因过滤 */
  forReasons?: string[]
}

export const BAN_REASON_CONTEXT_LABELS: Record<BanReasonContext, string> = {
  message_hit: '最近发言命中',
  moment_hit: '最近说说命中',
  reported_moment_hit: '本条说说命中',
  detail_hit: '举报说明命中',
  no_hit: '未检出 / 人工判定',
  general: '通用'
}

export const BAN_REASON_PRESETS: BanReasonPreset[] = [
  // ── 发言命中 ──
  {
    id: 'msg-abuse-1',
    label: '辱骂骚扰',
    text: '经核实，您在群聊/私聊中存在辱骂、骚扰等不当言论，违反社区规范，现对您执行禁言处理。',
    contexts: ['message_hit'],
    forReasons: ['辱骂骚扰']
  },
  {
    id: 'msg-abuse-2',
    label: '人身攻击',
    text: '您近期发言含有人身攻击、恶意挑衅内容，已对他人造成困扰，依据社区规则予以禁言。',
    contexts: ['message_hit'],
    forReasons: ['辱骂骚扰']
  },
  {
    id: 'msg-ad-1',
    label: '广告引流',
    text: '检测到您在聊天中发布广告、引流或推广信息，扰乱正常交流秩序，现予以禁言处理。',
    contexts: ['message_hit'],
    forReasons: ['垃圾广告']
  },
  {
    id: 'msg-ad-2',
    label: '刷屏推广',
    text: '您存在重复发送推广、外链或引流内容的行为，违反平台规定，已对账号采取禁言措施。',
    contexts: ['message_hit'],
    forReasons: ['垃圾广告']
  },
  {
    id: 'msg-adult-1',
    label: '色情低俗',
    text: '您在聊天中发布色情、低俗或不适宜内容，违反社区内容规范，现对账号执行禁言。',
    contexts: ['message_hit'],
    forReasons: ['色情低俗']
  },
  {
    id: 'msg-scam-1',
    label: '欺诈信息',
    text: '您在聊天中传播疑似诈骗、虚假交易或违规营销信息，为保障用户安全，已对账号禁言。',
    contexts: ['message_hit'],
    forReasons: ['欺诈诈骗']
  },
  {
    id: 'msg-illegal-1',
    label: '违法违规',
    text: '您发布的内容涉及违法违规信息，经审核确认后，已对账号采取禁言处理。',
    contexts: ['message_hit'],
    forReasons: ['违法违规']
  },
  {
    id: 'msg-general-1',
    label: '发言违规',
    text: '经智能检测与人工复核，您近期聊天内容存在违规，现依据社区规范对您禁言。',
    contexts: ['message_hit']
  },
  {
    id: 'msg-general-2',
    label: '敏感词命中',
    text: '系统检测到您的发言命中平台敏感词库，内容不符合社区发言规范，已执行禁言。',
    contexts: ['message_hit']
  },

  // ── 说说命中（含本条） ──
  {
    id: 'mo-adult-1',
    label: '色情低俗说说',
    text: '您发布的说说含有色情、低俗或不适宜公开传播的内容，违反社区规范，已删除并限制发言。',
    contexts: ['moment_hit', 'reported_moment_hit'],
    forReasons: ['色情低俗']
  },
  {
    id: 'mo-ad-1',
    label: '广告说说',
    text: '您发布的说说涉嫌广告引流或商业推广，不符合说说发布规范，已作违规处理。',
    contexts: ['moment_hit', 'reported_moment_hit'],
    forReasons: ['垃圾广告']
  },
  {
    id: 'mo-abuse-1',
    label: '辱骂说说',
    text: '您发布的说说含有辱骂、攻击或引战内容，影响社区环境，已删除并限制发布说说。',
    contexts: ['moment_hit', 'reported_moment_hit'],
    forReasons: ['辱骂骚扰']
  },
  {
    id: 'mo-scam-1',
    label: '诈骗说说',
    text: '您发布的说说涉及疑似诈骗或违规营销信息，为保障用户安全，已删除并限制账号。',
    contexts: ['moment_hit', 'reported_moment_hit'],
    forReasons: ['欺诈诈骗']
  },
  {
    id: 'mo-illegal-1',
    label: '违法说说',
    text: '您发布的说说含有违法违规信息，经核实后对说说作删除处理，并限制相关权限。',
    contexts: ['moment_hit', 'reported_moment_hit'],
    forReasons: ['违法违规']
  },
  {
    id: 'mo-general-1',
    label: '说说违规',
    text: '经检测，您发布的说说内容不符合社区规范，已删除违规内容并限制发布说说。',
    contexts: ['moment_hit', 'reported_moment_hit']
  },
  {
    id: 'mo-general-2',
    label: '敏感词说说',
    text: '您发布的说说命中平台敏感词库，内容不适宜公开展示，已作违规处理。',
    contexts: ['moment_hit', 'reported_moment_hit']
  },

  // ── 举报说明命中 ──
  {
    id: 'detail-1',
    label: '说明含违规词',
    text: '举报人提供的说明及相关内容与平台敏感词库命中，经综合核实后对被举报账号作违规处理。',
    contexts: ['detail_hit']
  },
  {
    id: 'detail-2',
    label: '证据充分',
    text: '根据举报说明及补充信息，已确认存在违规行为，现依据社区规则执行相应处理。',
    contexts: ['detail_hit']
  },
  {
    id: 'detail-3',
    label: '多维度核实',
    text: '举报说明与后台检测信息相互印证，确认违规事实成立，已对账号采取限制措施。',
    contexts: ['detail_hit']
  },

  // ── 未检出 / 人工 ──
  {
    id: 'nohit-1',
    label: '人工核实违规',
    text: '经人工审核，确认您的行为违反社区规范，虽智能检测未完全命中，仍依据规则予以处理。',
    contexts: ['no_hit']
  },
  {
    id: 'nohit-2',
    label: '多次被举报',
    text: '您的账号收到有效举报且人工复核确认存在不当行为，现对账号采取禁言/限制措施。',
    contexts: ['no_hit']
  },
  {
    id: 'nohit-3',
    label: '综合判定',
    text: '结合举报材料、历史行为及人工判断，确认存在违规，已执行相应处罚。',
    contexts: ['no_hit']
  },

  // ── 通用 ──
  {
    id: 'gen-1',
    label: '违反社区规范',
    text: '您的行为或发布内容违反《社区规范》，经审核后已对账号采取限制措施，请整改后再使用。',
    contexts: ['general']
  },
  {
    id: 'gen-2',
    label: '重复违规',
    text: '您此前已收到警告或处理，再次违规后将加重处罚。本次已对账号执行禁言/限制。',
    contexts: ['general']
  },
  {
    id: 'gen-3',
    label: '侵害他人权益',
    text: '您的言行侵害他人合法权益或扰乱社区秩序，依据平台规则已对账号作限制处理。',
    contexts: ['general']
  }
]

export function getPresetsForContext(
  context: BanReasonContext,
  reportReason?: string
): BanReasonPreset[] {
  const reason = String(reportReason || '').trim()
  return BAN_REASON_PRESETS.filter((p) => {
    if (!p.contexts.includes(context)) return false
    if (p.forReasons?.length) {
      if (!reason) return true
      return p.forReasons.includes(reason)
    }
    return true
  })
}

/** 根据智能检测结果得出应展示的快捷回复分组 */
export function getActiveDetectionContexts(smartScan: Record<string, any> | null): BanReasonContext[] {
  if (!smartScan) return ['no_hit']
  if (!smartScan.summary?.hasHit) return ['no_hit']
  const ctx: BanReasonContext[] = []
  if ((smartScan.report?.detailMatchedWords || []).length) ctx.push('detail_hit')
  if ((smartScan.report?.momentMatchedWords || []).length) ctx.push('reported_moment_hit')
  if ((smartScan.summary?.messageHitCount || 0) > 0) ctx.push('message_hit')
  const otherMoments = (smartScan.moments || []).some((m: any) => !m.isReportedMoment)
  if (otherMoments || ((smartScan.summary?.momentHitCount || 0) > 0 && !ctx.includes('reported_moment_hit'))) {
    if ((smartScan.summary?.momentHitCount || 0) > 0) ctx.push('moment_hit')
  }
  return ctx.length ? ctx : ['general']
}

export function collectPresetsForScan(
  smartScan: Record<string, any> | null,
  reportReason?: string,
  includeGeneral = true
): { context: BanReasonContext; label: string; presets: BanReasonPreset[] }[] {
  const contexts = getActiveDetectionContexts(smartScan)
  const groups: { context: BanReasonContext; label: string; presets: BanReasonPreset[] }[] = []
  for (const ctx of contexts) {
    const presets = getPresetsForContext(ctx, reportReason)
    if (presets.length) {
      groups.push({
        context: ctx,
        label: BAN_REASON_CONTEXT_LABELS[ctx],
        presets
      })
    }
  }
  if (includeGeneral) {
    const general = getPresetsForContext('general', reportReason)
    if (general.length) {
      groups.push({
        context: 'general',
        label: BAN_REASON_CONTEXT_LABELS.general,
        presets: general
      })
    }
  }
  return groups
}
