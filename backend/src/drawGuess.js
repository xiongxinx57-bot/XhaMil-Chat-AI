import { maskBannedWords } from './bannedWords.js'
import { assertChatMessageContent } from './xssGuard.js'
import { getDrawGuessConfig, getDrawGuessWordBank, assertDrawGuessAllowed } from './drawGuessConfig.js'

const MAX_PARTICIPANTS = 5
const MIN_DRAW_GUESS_PLAYERS = 2
const MAX_GAME_MESSAGES = 80
const MAX_STROKES = 600
export const MAX_DRAW_GUESS_ROUNDS = 5
export const MAX_DRAW_GUESS_TOPIC_REFRESH = 3
export const DRAW_GUESS_DRAWING_SECONDS = 60
export const DRAW_GUESS_LEADERBOARD_LIMIT = 100
const GUESS_RANK_POINTS = [8, 6, 4, 1]
const DRAWER_BONUS_POINTS = 8
const DRAWER_BONUS_SECONDS = 30
const ROUND_CN_LABELS = ['第一回合', '第二回合', '第三回合', '第四回合', '第五回合']

/** @type {((conversationId: number) => void | Promise<void>) | null} */
let onDrawingExpired = null

/** @type {((payload: object) => void | Promise<void>) | null} */
let onGameFinished = null

export function setDrawGuessDrawingExpiredHandler(fn) {
  onDrawingExpired = typeof fn === 'function' ? fn : null
}

export function setDrawGuessGameFinishedHandler(fn) {
  onGameFinished = typeof fn === 'function' ? fn : null
}

function roundCnLabel(round) {
  const n = Number(round)
  return ROUND_CN_LABELS[n - 1] || `第${n}回合`
}

function clearDrawTimeout(game) {
  if (game?._drawTimeout) {
    clearTimeout(game._drawTimeout)
    game._drawTimeout = null
  }
}

function isDrawingExpired(game) {
  return game?.phase === 'drawing'
    && game.drawEndsAt
    && Date.now() >= Number(game.drawEndsAt)
}

function scheduleDrawTimeout(game) {
  clearDrawTimeout(game)
  if (game.phase !== 'drawing' || !game.drawEndsAt) return
  const ms = Math.max(0, Number(game.drawEndsAt) - Date.now())
  const convId = game.conversationId
  game._drawTimeout = setTimeout(() => {
    if (expireDrawingPhase(convId)) {
      Promise.resolve(onDrawingExpired?.(convId)).catch(() => {})
    }
  }, ms)
}

function finalizeCurrentRound(game) {
  if (!game?.round || game.phase === 'lobby') return
  const drawer = game.participants.get(Number(game.drawerId))
  const drawerName = drawer?.nickname || drawer?.username || '玩家'
  if (!game.roundHistory) game.roundHistory = []
  game.roundHistory.push({
    round: game.round,
    drawerId: game.drawerId,
    drawerName,
    word: game.word || '',
    guesses: [...(game.currentRoundGuesses || [])]
  })
}

function finishDrawGuessGame(game) {
  clearDrawTimeout(game)
  const summary = buildDrawGuessSummary(game)
  const payload = {
    sessionId: game.sessionId,
    conversationId: game.conversationId,
    summary,
    scores: Object.fromEntries(game.scores),
    roundHistory: game.roundHistory || []
  }
  games.delete(game.conversationId)
  Promise.resolve(onGameFinished?.(payload)).catch(() => {})
  return payload
}

function endDrawingRound(game) {
  clearDrawTimeout(game)
  game.drawEndsAt = null
  finalizeCurrentRound(game)
  game.currentRoundGuesses = []
  if (game.round >= MAX_DRAW_GUESS_ROUNDS) {
    addSystemMessage(game, '全部回合结束，成绩将由群管家公布')
    const payload = finishDrawGuessGame(game)
    return { finished: true, payload }
  }
  startRound(game)
  return { finished: false }
}

export function buildDrawGuessSummary(game) {
  const lines = ['你画我猜 成绩汇总', '']
  for (const rec of game.roundHistory || []) {
    lines.push(roundCnLabel(rec.round))
    lines.push(`${rec.drawerName}绘画`)
    if (rec.guesses?.length) {
      for (const g of rec.guesses) {
        lines.push(`${g.name}在${g.seconds}秒答对了`)
      }
    } else {
      lines.push('无人答对')
    }
    lines.push('')
  }
  lines.push('玩家总分')
  const ranked = participantList(game)
    .map((p) => ({
      name: p.nickname || p.username || '用户',
      score: game.scores.get(Number(p.id)) || 0
    }))
    .sort((a, b) => b.score - a.score)
  for (const p of ranked) {
    lines.push(`${p.name} ${p.score}分`)
  }
  return lines.join('\n')
}

export function expireDrawingPhase(conversationId) {
  const convId = Number(conversationId)
  const game = getActiveDrawGuessGame(convId)
  if (!game || game.phase !== 'drawing') return false
  clearDrawTimeout(game)
  game.drawEndsAt = null
  const word = game.word || '未知'
  addSystemMessage(game, `时间到！答案是「${word}」`)
  endDrawingRound(game)
  return true
}

function ensureDrawingActive(game) {
  if (!game || game.phase !== 'drawing') return
  if (isDrawingExpired(game)) {
    expireDrawingPhase(game.conversationId)
    throw new Error('绘画时间已结束')
  }
}

/** @type {Map<number, object>} */
const games = new Map()

function createSessionId() {
  return `dg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function mapUserInfo(user) {
  return {
    id: Number(user.id),
    username: user.username || '',
    nickname: user.nickname || user.username || '用户',
    avatarUrl: user.avatar_url || user.avatarUrl || ''
  }
}

function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function ensureUsedWords(game) {
  if (!game.usedWords) game.usedWords = new Set()
  return game.usedWords
}

function pickWordOptions(excludeCategory = '', usedWords = new Set()) {
  const { optionCount } = getDrawGuessConfig()
  const wordBank = getDrawGuessWordBank()
  const categories = Object.keys(wordBank)
  if (!categories.length) return { category: '', options: [] }

  const exclude = String(excludeCategory || '').trim()
  const used = usedWords instanceof Set ? usedWords : new Set(usedWords)

  const pickFromCategory = (category) =>
    shuffle((wordBank[category] || []).filter((word) => !used.has(word))).slice(0, optionCount)

  const preferred = shuffle(
    categories.filter((name) => !exclude || categories.length === 1 || name !== exclude)
  )
  const fallbackCats = exclude && categories.length > 1
    ? shuffle(categories.filter((name) => name === exclude))
    : []

  for (const category of [...preferred, ...fallbackCats]) {
    const options = pickFromCategory(category)
    if (options.length >= optionCount) {
      return { category, options }
    }
    if (options.length > 0) {
      return { category, options }
    }
  }

  const unique = [...new Set(
    shuffle(categories.flatMap((category) => (wordBank[category] || []).filter((word) => !used.has(word))))
  )]
  if (!unique.length) {
    throw new Error('本局可选词语已用完，请结束游戏后重新开始')
  }
  const options = unique.slice(0, optionCount)
  const category = categories.find((cat) => (wordBank[cat] || []).includes(options[0])) || categories[0]
  return { category, options }
}

function applyWordOptions(game, excludeCategory = '') {
  const { category, options } = pickWordOptions(excludeCategory, ensureUsedWords(game))
  game.category = category
  game.wordOptions = options
  game.word = ''
}

function pushGameMessage(game, msg) {
  game.messages.push(msg)
  if (game.messages.length > MAX_GAME_MESSAGES) {
    game.messages.splice(0, game.messages.length - MAX_GAME_MESSAGES)
  }
}

function addSystemMessage(game, content) {
  pushGameMessage(game, {
    userId: 0,
    content,
    nickname: '系统',
    username: '系统',
    avatarUrl: '',
    system: true,
    ts: Date.now()
  })
}

function addWelcomeMessage(game, user) {
  const info = mapUserInfo(user)
  const name = info.nickname || info.username || '用户'
  addSystemMessage(game, `欢迎${name}加入`)
}

function participantList(game) {
  return [...game.participants.values()]
}

function ensureDrawOrder(game) {
  if (!Array.isArray(game.drawOrder)) game.drawOrder = []
  for (const p of participantList(game)) {
    const id = Number(p.id)
    if (!game.drawOrder.includes(id)) game.drawOrder.push(id)
  }
  game.drawOrder = game.drawOrder.filter((id) => game.participants.has(id))
}

function orderedParticipantIds(game) {
  ensureDrawOrder(game)
  return game.drawOrder.filter((id) => game.participants.has(id))
}

function orderedParticipants(game) {
  return orderedParticipantIds(game)
    .map((id) => game.participants.get(id))
    .filter(Boolean)
}

function maskAnswerForCorrectGuesser(game, userId, text) {
  const uid = Number(userId)
  if (game.phase !== 'drawing' || !game.word) return text
  if (!(game.roundCorrectGuesserIds || []).includes(uid)) return text
  const trimmed = String(text || '').trim()
  if (trimmed === game.word) {
    return '*'.repeat([...game.word].length)
  }
  return text
}

function normalizeMaxPlayers(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return MAX_PARTICIPANTS
  return Math.min(MAX_PARTICIPANTS, Math.max(MIN_DRAW_GUESS_PLAYERS, Math.floor(n)))
}

function roomIsFull(game) {
  return game.participants.size >= normalizeMaxPlayers(game.maxPlayers)
}

function guesserCount(game) {
  return Math.max(0, game.participants.size - 1)
}

function addScore(game, userId, points) {
  const uid = Number(userId)
  const delta = Number(points)
  if (!uid || !Number.isFinite(delta) || delta <= 0) return
  game.scores.set(uid, (game.scores.get(uid) || 0) + delta)
}

function resetRoundGuessState(game) {
  game.roundCorrectGuesserIds = []
  game.currentRoundGuesses = []
  game.drawStartedAt = null
}

function nextDrawerId(game) {
  const ids = orderedParticipantIds(game)
  if (!ids.length) return null
  if (!game.drawerId || !ids.includes(Number(game.drawerId))) {
    return ids[0]
  }
  const idx = ids.indexOf(Number(game.drawerId))
  return ids[(idx + 1) % ids.length]
}

function startRound(game) {
  clearDrawTimeout(game)
  game.drawEndsAt = null
  resetRoundGuessState(game)
  if (game.participants.size < normalizeMaxPlayers(game.maxPlayers)) {
    game.phase = 'lobby'
    game.drawerId = null
    game.category = ''
    game.wordOptions = []
    game.word = ''
    game.strokes = []
    game.drawEndsAt = null
    clearDrawTimeout(game)
    game.topicRefreshUsed = 0
    return serializeGame(game)
  }
  game.round += 1
  game.drawerId = nextDrawerId(game)
  game.phase = 'choosing'
  game.topicRefreshUsed = 0
  applyWordOptions(game)
  game.strokes = []
  addSystemMessage(game, `${roundCnLabel(game.round)} · 请作画者选词`)
  return serializeGame(game)
}

function serializeGame(game, viewerUserId = null) {
  const viewerId = viewerUserId != null ? Number(viewerUserId) : null
  const isDrawer = viewerId != null && Number(game.drawerId) === viewerId
  const scores = {}
  for (const [uid, score] of game.scores.entries()) scores[uid] = score
  const { styleName } = getDrawGuessConfig()
  return {
    sessionId: game.sessionId,
    conversationId: game.conversationId,
    starterId: game.starterId,
    starterName: game.starterName,
    phase: game.phase,
    round: game.round,
    maxRounds: MAX_DRAW_GUESS_ROUNDS,
    maxPlayers: normalizeMaxPlayers(game.maxPlayers),
    playerCount: game.participants.size,
    roundLabel: game.round > 0 ? roundCnLabel(game.round) : '',
    drawerId: game.drawerId,
    styleName,
    category: game.category || '',
    wordOptions: isDrawer && game.phase === 'choosing' ? [...game.wordOptions] : [],
    topicRefreshLeft: isDrawer && game.phase === 'choosing'
      ? Math.max(0, MAX_DRAW_GUESS_TOPIC_REFRESH - Number(game.topicRefreshUsed || 0))
      : 0,
    word: isDrawer ? game.word || '' : '',
    hintLength: game.word ? [...game.word].length : 0,
    drawSecondsTotal: game.phase === 'drawing' ? DRAW_GUESS_DRAWING_SECONDS : 0,
    drawSecondsLeft: game.phase === 'drawing' && game.drawEndsAt
      ? Math.max(0, Math.ceil((Number(game.drawEndsAt) - Date.now()) / 1000))
      : 0,
    drawEndsAt: game.phase === 'drawing' && game.drawEndsAt ? Number(game.drawEndsAt) : null,
    roundCorrectGuesserIds: game.phase === 'drawing' ? [...(game.roundCorrectGuesserIds || [])] : [],
    participants: orderedParticipants(game),
    messages: game.messages.slice(-40),
    strokes: game.strokes.slice(-MAX_STROKES),
    scores
  }
}

export function buildDrawGuessInviteContent(sessionId, starterName, maxPlayers = MAX_PARTICIPANTS) {
  return JSON.stringify({
    sessionId: String(sessionId || ''),
    starterName: String(starterName || '成员'),
    maxPlayers: normalizeMaxPlayers(maxPlayers),
    active: true
  })
}

export function getActiveDrawGuessGame(conversationId) {
  return games.get(Number(conversationId)) || null
}

export function getDrawGuessSnapshot(conversationId, viewerUserId = null) {
  const game = getActiveDrawGuessGame(conversationId)
  return game ? serializeGame(game, viewerUserId) : null
}

export function getDrawGuessParticipantUserIds(conversationId) {
  const game = getActiveDrawGuessGame(conversationId)
  if (!game) return []
  return [...game.participants.keys()]
}

export function startDrawGuessGame(conversationId, starterUser, maxPlayers = MAX_PARTICIPANTS) {
  const convId = Number(conversationId)
  const starterId = Number(starterUser?.id)
  if (!convId || !starterId) throw new Error('无效的参数')
  assertDrawGuessAllowed(convId)
  if (games.has(convId)) throw new Error('你画我猜已在进行中')

  const playerLimit = normalizeMaxPlayers(maxPlayers)
  const info = mapUserInfo(starterUser)
  const game = {
    sessionId: createSessionId(),
    conversationId: convId,
    starterId,
    starterName: info.nickname || info.username || '成员',
    maxPlayers: playerLimit,
    participants: new Map([[starterId, info]]),
    drawOrder: [starterId],
    phase: 'lobby',
    round: 0,
    drawerId: null,
    category: '',
    wordOptions: [],
    word: '',
    strokes: [],
    topicRefreshUsed: 0,
    drawEndsAt: null,
    drawStartedAt: null,
    roundCorrectGuesserIds: [],
    currentRoundGuesses: [],
    roundHistory: [],
    messages: [],
    scores: new Map(),
    usedWords: new Set()
  }
  games.set(convId, game)
  addWelcomeMessage(game, starterUser)
  addSystemMessage(game, `本局 ${playerLimit} 人，等待加入（1/${playerLimit}）`)
  return serializeGame(game, starterId)
}

export function joinDrawGuessGame(conversationId, user) {
  const convId = Number(conversationId)
  const uid = Number(user?.id)
  assertDrawGuessAllowed(convId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  if (!game.participants.has(uid) && roomIsFull(game)) {
    throw new Error('房间已满')
  }
  const wasIn = game.participants.has(uid)
  game.participants.set(uid, mapUserInfo(user))
  ensureDrawOrder(game)
  if (!wasIn) addWelcomeMessage(game, user)
  if (game.phase === 'lobby' && roomIsFull(game)) {
    addSystemMessage(game, '人数已满，游戏开始')
    startRound(game)
  } else if (game.phase === 'lobby') {
    const limit = normalizeMaxPlayers(game.maxPlayers)
    addSystemMessage(game, `等待加入（${game.participants.size}/${limit}）`)
  }
  return serializeGame(game, uid)
}

export function leaveDrawGuessGame(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) return null
  game.participants.delete(uid)
  ensureDrawOrder(game)
  if (game.participants.size === 0 || uid === game.starterId) {
    clearDrawTimeout(game)
    const ended = { sessionId: game.sessionId, conversationId: convId }
    games.delete(convId)
    return { ended, game: null }
  }
  if (Number(game.drawerId) === uid) {
    startRound(game)
  }
  return { ended: null, game: serializeGame(game) }
}

export function endDrawGuessGame(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) return null
  if (uid !== game.starterId) throw new Error('仅发起者可结束游戏')
  clearDrawTimeout(game)
  const ended = { sessionId: game.sessionId, conversationId: convId }
  games.delete(convId)
  return ended
}

export function pickDrawGuessWord(conversationId, userId, word) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  if (game.phase !== 'choosing') throw new Error('当前不能选词')
  if (Number(game.drawerId) !== uid) throw new Error('仅作画者可选词')
  const picked = String(word || '').trim()
  if (!game.wordOptions.includes(picked)) throw new Error('无效词语')
  if (ensureUsedWords(game).has(picked)) throw new Error('该词语已被其他玩家选用')
  ensureUsedWords(game).add(picked)
  game.word = picked
  game.phase = 'drawing'
  game.strokes = []
  game.roundCorrectGuesserIds = []
  game.drawStartedAt = Date.now()
  game.drawEndsAt = Date.now() + DRAW_GUESS_DRAWING_SECONDS * 1000
  scheduleDrawTimeout(game)
  const drawer = game.participants.get(uid)
  const drawerName = drawer?.nickname || drawer?.username || '玩家'
  addSystemMessage(game, `${roundCnLabel(game.round)}`)
  addSystemMessage(game, `${drawerName}绘画中`)
  addSystemMessage(game, `请猜词（${DRAW_GUESS_DRAWING_SECONDS}秒）`)
  return serializeGame(game, uid)
}

export function refreshDrawGuessTopic(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  if (game.phase !== 'choosing') throw new Error('当前不能刷新题材')
  if (Number(game.drawerId) !== uid) throw new Error('仅作画者可刷新题材')
  const used = Number(game.topicRefreshUsed || 0)
  if (used >= MAX_DRAW_GUESS_TOPIC_REFRESH) throw new Error('本局刷新次数已用完')
  game.topicRefreshUsed = used + 1
  applyWordOptions(game, game.category)
  return serializeGame(game, uid)
}

export function addDrawGuessStroke(conversationId, userId, stroke) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  ensureDrawingActive(game)
  if (game.phase !== 'drawing') throw new Error('当前不能作画')
  if (Number(game.drawerId) !== uid) throw new Error('仅作画者可绘画')
  const entry = normalizeDrawGuessStroke(stroke)
  if (!Number.isFinite(entry.x0) || !Number.isFinite(entry.y0)) {
    throw new Error('无效笔画')
  }
  game.strokes.push(entry)
  if (game.strokes.length > MAX_STROKES) {
    game.strokes.splice(0, game.strokes.length - MAX_STROKES)
  }
  return entry
}

function clamp01(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

/** Canonical stroke space: norm=1 with x/y/width relative to board (0..1). */
function normalizeDrawGuessStroke(stroke) {
  const color = String(stroke?.color || '#222')
  const erase = !!stroke?.erase
  const ts = Date.now()
  const alreadyNorm = stroke?.norm === 1 || stroke?.norm === true
  const boardW = Math.max(0, Number(stroke?.boardW) || 0)
  const boardH = Math.max(0, Number(stroke?.boardH) || 0)

  if (alreadyNorm) {
    return {
      x0: clamp01(stroke.x0),
      y0: clamp01(stroke.y0),
      x1: clamp01(stroke.x1),
      y1: clamp01(stroke.y1),
      // relative brush size; keep a sensible floor so hairlines stay visible
      width: Math.max(0.0008, Math.min(0.2, Number(stroke.width) || 0.004)),
      color,
      erase,
      norm: 1,
      boardW: 0,
      boardH: 0,
      ts
    }
  }

  // Pixel strokes with source board size → convert to normalized.
  if (boardW > 1 && boardH > 1) {
    return {
      x0: clamp01(Number(stroke?.x0) / boardW),
      y0: clamp01(Number(stroke?.y0) / boardH),
      x1: clamp01(Number(stroke?.x1) / boardW),
      y1: clamp01(Number(stroke?.y1) / boardH),
      width: Math.max(0.0008, Math.min(0.2, (Number(stroke?.width) || 3) / boardW)),
      color,
      erase,
      norm: 1,
      boardW: 0,
      boardH: 0,
      ts
    }
  }

  // Legacy absolute pixels (best-effort; may misalign across devices).
  return {
    x0: Number(stroke?.x0),
    y0: Number(stroke?.y0),
    x1: Number(stroke?.x1),
    y1: Number(stroke?.y1),
    width: Number(stroke?.width) || 3,
    color,
    erase,
    norm: 0,
    boardW,
    boardH,
    ts
  }
}

export function clearDrawGuessCanvas(conversationId, userId) {
  const convId = Number(conversationId)
  const uid = Number(userId)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  if (Number(game.drawerId) !== uid) throw new Error('仅作画者可清屏')
  game.strokes = []
  return true
}

export function submitDrawGuessGuess(conversationId, user, rawText) {
  const convId = Number(conversationId)
  const uid = Number(user?.id)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  ensureDrawingActive(game)
  if (game.phase !== 'drawing') throw new Error('当前不能猜词')
  if (Number(game.drawerId) === uid) throw new Error('作画者不能猜词')
  if ((game.roundCorrectGuesserIds || []).includes(uid)) {
    throw new Error('你已猜对，不能再猜词')
  }
  const raw = String(rawText || '').trim()
  assertChatMessageContent(raw)
  const text = maskBannedWords(raw)
  if (!text) throw new Error('请输入猜测')
  const info = mapUserInfo(user)
  const name = info.nickname || info.username || '用户'
  pushGameMessage(game, {
    userId: uid,
    content: text,
    nickname: name,
    username: info.username,
    avatarUrl: info.avatarUrl,
    system: false,
    ts: Date.now()
  })
  const correct = text === game.word
  if (correct) {
    if ((game.roundCorrectGuesserIds || []).includes(uid)) {
      return { correct: true, alreadyScored: true, finished: false, game: serializeGame(game, uid) }
    }
    const rank = game.roundCorrectGuesserIds.length + 1
    const points = GUESS_RANK_POINTS[rank - 1] || 0
    const seconds = Math.max(1, Math.round((Date.now() - Number(game.drawStartedAt || Date.now())) / 1000))
    if (points > 0) {
      addScore(game, uid, points)
      game.roundCorrectGuesserIds.push(uid)
      game.currentRoundGuesses.push({ userId: uid, name, seconds, rank, points })
      let notice = `${name}在${seconds}秒答对了！+${points}分`
      if (rank === 1) {
        const elapsed = Date.now() - Number(game.drawStartedAt || 0)
        if (elapsed <= DRAWER_BONUS_SECONDS * 1000 && game.drawerId) {
          addScore(game, game.drawerId, DRAWER_BONUS_POINTS)
          notice += `，作画者 +${DRAWER_BONUS_POINTS}分`
        }
      }
      addSystemMessage(game, notice)
    }
    const guessers = guesserCount(game)
    if (game.roundCorrectGuesserIds.length >= guessers || rank >= GUESS_RANK_POINTS.length) {
      addSystemMessage(game, `答案是「${game.word}」，本轮结束`)
      const endResult = endDrawingRound(game)
      return {
        correct,
        finished: !!endResult.finished,
        game: endResult.finished ? null : serializeGame(game, uid)
      }
    }
  }
  return { correct, finished: false, game: serializeGame(game, uid) }
}

export function addDrawGuessChat(conversationId, user, rawText) {
  const convId = Number(conversationId)
  const uid = Number(user?.id)
  const game = getActiveDrawGuessGame(convId)
  if (!game) throw new Error('游戏已结束')
  const raw = String(rawText || '').trim()
  assertChatMessageContent(raw)
  const text = maskBannedWords(raw)
  if (!text) throw new Error('消息不能为空')
  const displayText = maskAnswerForCorrectGuesser(game, uid, text)
  const info = mapUserInfo(user)
  pushGameMessage(game, {
    userId: uid,
    content: displayText,
    nickname: info.nickname || info.username || '用户',
    username: info.username,
    avatarUrl: info.avatarUrl,
    system: false,
    ts: Date.now()
  })
  return serializeGame(game, uid)
}
