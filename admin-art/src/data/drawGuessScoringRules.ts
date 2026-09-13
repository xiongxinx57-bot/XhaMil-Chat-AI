/** 与 backend/src/drawGuess.js 计分逻辑保持一致，供后台展示 */
export const DRAW_GUESS_SCORING_RULES = {
  maxRounds: 5,
  minPlayers: 2,
  maxPlayers: 5,
  drawSeconds: 60,
  guessPoints: [8, 6, 4, 1] as const,
  drawerBonusPoints: 8,
  drawerBonusSeconds: 30,
  topicRefreshPerRound: 3,
  optionCountRange: [4, 8] as const,
  leaderboardLimit: 30
}

export const DRAW_GUESS_SCORING_SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: '对局基础',
    items: [
      '每局 2～5 人，最多进行 5 个回合',
      '每回合作画者选词后，限时 60 秒绘画',
      '作画者不可猜词，其余玩家可在猜词区发送答案',
      '同一局内已选过的词语不会再次出现'
    ]
  },
  {
    title: '猜对加分（按先后顺序）',
    items: [
      '第 1 个猜对：+8 分',
      '第 2 个猜对：+6 分',
      '第 3 个猜对：+4 分',
      '第 4 个猜对：+1 分',
      '每人每轮猜对后不可再次猜词'
    ]
  },
  {
    title: '作画者奖励',
    items: [
      '若第 1 名猜对者在开画后 30 秒内答对，作画者额外 +8 分',
      '鼓励把词画清楚，也鼓励猜得快'
    ]
  },
  {
    title: '回合结束',
    items: [
      '所有猜词玩家都猜对，或已有 4 人按顺序猜对，本回合结束',
      '超时未猜完会公布答案并进入下一回合',
      '5 回合结束后由群管家公布总成绩'
    ]
  },
  {
    title: '选词与题材',
    items: [
      '每轮提供 4～8 个候选词（可在上方配置）',
      '作画者每轮最多刷新题材 3 次',
      '保存后的词库分类会作为随机出题来源'
    ]
  },
  {
    title: '总分榜',
    items: [
      '每局结束后的个人得分会累计到群「你画我猜总分榜」',
      '排行榜仅展示前 30 名玩家'
    ]
  }
]
