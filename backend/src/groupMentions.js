export function parseAtMentionTokens(content) {
  const text = String(content || '')
  const tokens = []
  const re = /@([^\s@]+)/g
  let match
  while ((match = re.exec(text)) !== null) {
    const token = String(match[1] || '').trim()
    if (token) tokens.push(token)
  }
  return [...new Set(tokens)]
}

export function matchMemberByMentionToken(member, token) {
  const t = String(token || '').trim()
  if (!t || !member) return false
  const nickname = String(member.nickname || '').trim()
  const username = String(member.username || '').trim()
  const groupNickname = String(member.groupNickname || member.group_nickname || '').trim()
  return t === nickname || t === username || (groupNickname && t === groupNickname)
}

export function resolveMentionedUserIdsFromMembers(members, senderUserId, content) {
  const tokens = parseAtMentionTokens(content)
  if (!tokens.length) return []
  const senderId =
    senderUserId === null || senderUserId === undefined ? null : Number(senderUserId)
  const matched = new Set()
  for (const token of tokens) {
    for (const member of members || []) {
      const uid = Number(member.id ?? member.userId)
      if (!uid || (senderId != null && uid === senderId)) continue
      if (member.isAi) continue
      if (matchMemberByMentionToken(member, token)) {
        matched.add(uid)
      }
    }
  }
  return [...matched]
}
