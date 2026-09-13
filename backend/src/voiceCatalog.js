/**
 * AI 朗读音色大全（公开接口可调）
 * - genshin / honkai: HuggingFace VITS（原神 / 崩坏3 角色声）
 * - edge: Microsoft Edge 神经音（真实感 / 风格预设，无需 Key）
 */

/** @typedef {{ id: string, label: string, category: string, tags: string[], engine: 'genshin'|'edge', speaker?: string, voice?: string, rate?: string, pitch?: string, desc?: string }} VoiceItem */

/** @type {VoiceItem[]} */
export const VOICE_CATALOG = [
  // ── 风格推荐（Edge 真实神经音，稳）──
  {
    id: 'style:loli',
    label: '萝莉（脆甜）',
    category: '风格推荐',
    tags: ['萝莉', '可爱', '真实'],
    engine: 'edge',
    voice: 'zh-CN-YunxiaNeural',
    rate: '+6%',
    pitch: '+10Hz',
    desc: '幼女感神经音，偏可爱情口'
  },
  {
    id: 'style:loli_soft',
    label: '萝莉（软糯）',
    category: '风格推荐',
    tags: ['萝莉', '软萌', '真实'],
    engine: 'edge',
    voice: 'zh-CN-YunxiaNeural',
    rate: '+1%',
    pitch: '+5Hz',
    desc: '更软更慢的幼女感'
  },
  {
    id: 'style:cold_goddess',
    label: '高冷女神',
    category: '风格推荐',
    tags: ['高冷', '御姐', '女神', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '-8%',
    pitch: '-5Hz',
    desc: '略慢略低，偏高冷疏离'
  },
  {
    id: 'style:ice_queen',
    label: '冰山御姐',
    category: '风格推荐',
    tags: ['高冷', '御姐', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoyiNeural',
    rate: '-9%',
    pitch: '-6Hz',
    desc: '更冷更慢，疏离感强'
  },
  {
    id: 'style:soft_lady',
    label: '温柔御姐',
    category: '风格推荐',
    tags: ['温柔', '御姐', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoyiNeural',
    rate: '-3%',
    pitch: '+0Hz',
    desc: '柔和女声'
  },
  {
    id: 'style:sweet_girl',
    label: '甜美少女',
    category: '风格推荐',
    tags: ['甜美', '少女', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+5%',
    pitch: '+5Hz',
    desc: '偏甜、活泼一点的少女'
  },
  {
    id: 'style:real_girl',
    label: '真实少女',
    category: '风格推荐',
    tags: ['真实', '少女', '日常'],
    engine: 'edge',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '+0%',
    pitch: '+0Hz',
    desc: '自然聊天女声'
  },
  {
    id: 'style:warm_girl',
    label: '温暖邻家',
    category: '风格推荐',
    tags: ['真实', '温柔', '日常'],
    engine: 'edge',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '-3%',
    pitch: '+1Hz',
    desc: '偏暖、口语感强'
  },
  {
    id: 'style:mature_lady',
    label: '成熟女声',
    category: '风格推荐',
    tags: ['成熟', '御姐', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: '-5%',
    pitch: '-4Hz',
    desc: '略低沉、稳重女声'
  },
  {
    id: 'style:energetic',
    label: '元气少女',
    category: '风格推荐',
    tags: ['活泼', '元气', '真实'],
    engine: 'edge',
    voice: 'zh-CN-XiaoyiNeural',
    rate: '+8%',
    pitch: '+3Hz',
    desc: '语速偏快、有活力'
  },
  {
    id: 'style:real_boy',
    label: '真实少年',
    category: '风格推荐',
    tags: ['真实', '男声'],
    engine: 'edge',
    voice: 'zh-CN-YunjianNeural',
    rate: '+0%',
    pitch: '+0Hz',
    desc: '自然男声'
  },
  {
    id: 'style:sunny_male',
    label: '阳光男声',
    category: '风格推荐',
    tags: ['真实', '男声', '阳光'],
    engine: 'edge',
    voice: 'zh-CN-YunyangNeural',
    rate: '+2%',
    pitch: '+1Hz',
    desc: '偏新闻主播感、清晰'
  },
  {
    id: 'style:calm_male',
    label: '沉稳男声',
    category: '风格推荐',
    tags: ['高冷', '男声', '沉稳'],
    engine: 'edge',
    voice: 'zh-CN-YunxiNeural',
    rate: '-5%',
    pitch: '-3Hz',
    desc: '偏低沉稳'
  },
  {
    id: 'style:cute_boy',
    label: '少年软音',
    category: '风格推荐',
    tags: ['少年', '软萌', '真实'],
    engine: 'edge',
    voice: 'zh-CN-YunxiaNeural',
    rate: '+3%',
    pitch: '+5Hz',
    desc: '偏少年/中性可爱'
  },

  // ── 原神 · 萝莉 / 幼女 ──
  g('genshin:可莉', '可莉', '原神·萝莉', ['萝莉', '原神'], '可莉'),
  g('genshin:七七', '七七', '原神·萝莉', ['萝莉', '原神'], '七七'),
  g('genshin:派蒙', '派蒙', '原神·萝莉', ['萝莉', '原神', '导游'], '派蒙'),
  g('genshin:早柚', '早柚', '原神·萝莉', ['萝莉', '原神'], '早柚'),
  g('genshin:迪奥娜', '迪奥娜', '原神·萝莉', ['萝莉', '原神'], '迪奥娜（猫猫）'),
  g('genshin:纳西妲', '纳西妲', '原神·萝莉', ['萝莉', '原神', '草神'], '纳西妲（草神）'),
  g('genshin:多莉', '多莉', '原神·萝莉', ['萝莉', '原神'], '多莉'),
  g('genshin:砂糖', '砂糖', '原神·萝莉', ['萝莉', '原神'], '砂糖'),

  // ── 原神 · 高冷 / 御姐 ──
  g('genshin:雷电将军', '雷电将军', '原神·高冷御姐', ['高冷', '女神', '原神'], '雷电将军（雷神）'),
  g('genshin:夜兰', '夜兰', '原神·高冷御姐', ['高冷', '御姐', '原神'], '夜兰'),
  g('genshin:申鹤', '申鹤', '原神·高冷御姐', ['高冷', '清冷', '原神'], '申鹤'),
  g('genshin:八重神子', '八重神子', '原神·高冷御姐', ['御姐', '狐狸', '原神'], '八重神子（神子）'),
  g('genshin:凝光', '凝光', '原神·高冷御姐', ['高冷', '御姐', '原神'], '凝光'),
  g('genshin:刻晴', '刻晴', '原神·高冷御姐', ['御姐', '原神'], '刻晴'),
  g('genshin:神里绫华', '神里绫华', '原神·高冷御姐', ['清冷', '原神'], '神里绫华（龟龟）'),
  g('genshin:甘雨', '甘雨', '原神·高冷御姐', ['温柔', '清冷', '原神'], '甘雨（椰羊）'),
  g('genshin:女士', '女士', '原神·高冷御姐', ['高冷', '原神'], '女士'),
  g('genshin:罗莎莉亚', '罗莎莉亚', '原神·高冷御姐', ['高冷', '原神'], '罗莎莉亚'),
  g('genshin:优菈', '优菈', '原神·高冷御姐', ['御姐', '高冷', '原神'], '优菈'),
  g('genshin:北斗', '北斗', '原神·高冷御姐', ['御姐', '原神'], '北斗'),
  g('genshin:九条裟罗', '九条裟罗', '原神·高冷御姐', ['高冷', '原神'], '九条裟罗'),
  g('genshin:久岐忍', '久岐忍', '原神·高冷御姐', ['御姐', '原神'], '久岐忍'),
  g('genshin:菲谢尔', '菲谢尔', '原神·高冷御姐', ['御姐', '原神'], '菲谢尔（皇女）'),
  g('genshin:坎蒂丝', '坎蒂丝', '原神·高冷御姐', ['御姐', '原神'], '坎蒂丝'),
  g('genshin:留云', '留云借风真君', '原神·高冷御姐', ['御姐', '原神'], '留云借风真君'),

  // ── 原神 · 活泼 / 日常女 ──
  g('genshin:胡桃', '胡桃', '原神·活泼', ['活泼', '原神'], '胡桃'),
  g('genshin:宵宫', '宵宫', '原神·活泼', ['活泼', '原神'], '宵宫'),
  g('genshin:香菱', '香菱', '原神·活泼', ['活泼', '原神'], '香菱'),
  g('genshin:烟绯', '烟绯', '原神·活泼', ['活泼', '原神'], '烟绯'),
  g('genshin:辛焱', '辛焱', '原神·活泼', ['活泼', '原神'], '辛焱'),
  g('genshin:安柏', '安柏', '原神·活泼', ['活泼', '原神'], '安柏'),
  g('genshin:莫娜', '莫娜', '原神·活泼', ['原神'], '莫娜'),
  g('genshin:云堇', '云堇', '原神·活泼', ['原神'], '云堇'),
  g('genshin:埃洛伊', '埃洛伊', '原神·活泼', ['原神'], '埃洛伊'),

  // ── 原神 · 温柔 ──
  g('genshin:芭芭拉', '芭芭拉', '原神·温柔', ['温柔', '原神'], '芭芭拉'),
  g('genshin:心海', '珊瑚宫心海', '原神·温柔', ['温柔', '原神'], '珊瑚宫心海（心海，扣扣米）'),
  g('genshin:琴', '琴', '原神·温柔', ['温柔', '原神'], '琴'),
  g('genshin:丽莎', '丽莎', '原神·温柔', ['御姐', '原神'], '丽莎'),
  g('genshin:荧', '荧', '原神·温柔', ['旅行者', '原神'], '荧（荧妹）'),
  g('genshin:诺艾尔', '诺艾尔', '原神·温柔', ['温柔', '原神'], '诺艾尔（女仆）'),
  g('genshin:柯莱', '柯莱', '原神·温柔', ['原神'], '柯莱'),
  g('genshin:妮露', '妮露', '原神·温柔', ['原神'], '妮露'),

  // ── 原神 · 男声 ──
  g('genshin:钟离', '钟离', '原神·男声', ['沉稳', '原神'], '钟离'),
  g('genshin:温迪', '温迪', '原神·男声', ['少年', '原神'], '温迪'),
  g('genshin:魈', '魈', '原神·男声', ['高冷', '原神'], '魈'),
  g('genshin:散兵', '散兵', '原神·男声', ['高冷', '原神'], '散兵'),
  g('genshin:万叶', '枫原万叶', '原神·男声', ['少年', '原神'], '枫原万叶（万叶）'),
  g('genshin:公子', '达达利亚', '原神·男声', ['原神'], '达达利亚（公子）'),
  g('genshin:空', '空', '原神·男声', ['旅行者', '原神'], '空（空哥）'),
  g('genshin:凯亚', '凯亚', '原神·男声', ['原神'], '凯亚'),
  g('genshin:迪卢克', '迪卢克', '原神·男声', ['沉稳', '原神'], '迪卢克'),
  g('genshin:阿贝多', '阿贝多', '原神·男声', ['原神'], '阿贝多'),
  g('genshin:赛诺', '赛诺', '原神·男声', ['原神'], '赛诺'),
  g('genshin:提纳里', '提纳里', '原神·男声', ['原神'], '提纳里'),
  g('genshin:白术', '白术', '原神·男声', ['原神'], '白术'),
  g('genshin:一斗', '荒泷一斗', '原神·男声', ['原神'], '荒泷一斗（一斗）'),
  g('genshin:神里绫人', '神里绫人', '原神·男声', ['原神'], '神里绫人（绫人）'),
  g('genshin:雷泽', '雷泽', '原神·男声', ['原神'], '雷泽'),
  g('genshin:托马', '托马', '原神·男声', ['原神'], '托马'),
  g('genshin:五郎', '五郎', '原神·男声', ['原神'], '五郎'),
  g('genshin:行秋', '行秋', '原神·男声', ['原神'], '行秋'),
  g('genshin:重云', '重云', '原神·男声', ['原神'], '重云'),
  g('genshin:班尼特', '班尼特', '原神·男声', ['原神'], '班尼特'),
  g('genshin:平藏', '鹿野苑平藏', '原神·男声', ['原神'], '鹿野苑平藏'),

  // ── 崩坏3 · 高冷 / 女神（同 HF Space）──
  h('honkai:雷之律者', '雷之律者', '崩坏·高冷女神', ['高冷', '女神', '崩坏'], '雷之律者'),
  h('honkai:爱莉希雅', '爱莉希雅', '崩坏·高冷女神', ['女神', '温柔', '崩坏'], '爱莉希雅'),
  h('honkai:符华', '符华', '崩坏·高冷女神', ['高冷', '御姐', '崩坏'], '符华'),
  h('honkai:渡鸦', '渡鸦', '崩坏·高冷女神', ['高冷', '御姐', '崩坏'], '渡鸦'),
  h('honkai:八重樱', '八重樱', '崩坏·高冷女神', ['御姐', '崩坏'], '八重樱'),
  h('honkai:姬子', '姬子', '崩坏·高冷女神', ['御姐', '崩坏'], '姬子'),
  h('honkai:卡莲', '卡莲', '崩坏·高冷女神', ['高冷', '崩坏'], '卡莲'),
  h('honkai:幽兰黛尔', '幽兰黛尔', '崩坏·高冷女神', ['高冷', '女神', '崩坏'], '幽兰黛尔'),
  h('honkai:梅比乌斯', '梅比乌斯', '崩坏·高冷女神', ['高冷', '御姐', '崩坏'], '梅比乌斯'),
  h('honkai:德丽莎', '德丽莎', '崩坏·萝莉', ['萝莉', '崩坏'], '德丽莎'),
  h('honkai:萝莎莉娅', '萝莎莉娅', '崩坏·萝莉', ['萝莉', '崩坏'], '萝莎莉娅'),
  h('honkai:帕朵菲莉丝', '帕朵菲莉丝', '崩坏·萝莉', ['萝莉', '崩坏'], '帕朵菲莉丝'),
  h('honkai:琪亚娜', '琪亚娜', '崩坏·活泼', ['活泼', '崩坏'], '琪亚娜'),
  h('honkai:芽衣', '芽衣', '崩坏·温柔', ['温柔', '崩坏'], '芽衣'),
  h('honkai:布洛妮娅', '布洛妮娅', '崩坏·温柔', ['温柔', '崩坏'], '布洛妮娅'),
  h('honkai:希儿', '希儿', '崩坏·温柔', ['温柔', '崩坏'], '希儿')
]

function g(id, label, category, tags, speaker) {
  return {
    id,
    label,
    category,
    tags,
    engine: 'genshin',
    speaker,
    desc: `原神角色音色 · ${label}`
  }
}

function h(id, label, category, tags, speaker) {
  return {
    id,
    label,
    category,
    tags,
    engine: 'genshin',
    speaker,
    desc: `崩坏3 角色音色 · ${label}`
  }
}

const byId = new Map(VOICE_CATALOG.map((v) => [v.id, v]))

export function listVoiceCatalog() {
  const categories = []
  const seen = new Set()
  for (const v of VOICE_CATALOG) {
    if (!seen.has(v.category)) {
      seen.add(v.category)
      categories.push(v.category)
    }
  }
  return {
    categories,
    list: VOICE_CATALOG,
    groups: categories.map((c) => ({
      category: c,
      items: VOICE_CATALOG.filter((v) => v.category === c)
    }))
  }
}

export function resolveVoiceById(rawId, { isAi = false } = {}) {
  const id = String(rawId || '').trim()
  if (id && byId.has(id)) return byId.get(id)
  // 兼容旧 preset
  if (id === 'klee' || id === 'genshin:klee') return byId.get('genshin:可莉')
  if (id === 'yunxia') return byId.get('style:loli')
  if (id === 'xiaoxiao') return byId.get('style:real_girl')
  if (id === 'cold' || id === 'cold_goddess') return byId.get('style:cold_goddess')
  return isAi ? byId.get('genshin:可莉') : byId.get('style:real_girl')
}

export function defaultVoiceIdForAi() {
  return 'genshin:可莉'
}

/** 规范化为目录中的 id；非法时回退默认 */
export function normalizeTtsVoiceId(raw, { isAi = true } = {}) {
  const resolved = resolveVoiceById(raw, { isAi })
  return resolved?.id || (isAi ? defaultVoiceIdForAi() : 'style:real_girl')
}

export function voiceLabelById(raw) {
  return resolveVoiceById(raw, { isAi: true })?.label || String(raw || '') || '—'
}
