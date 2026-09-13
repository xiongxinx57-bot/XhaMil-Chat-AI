/** 聊聊号、群号生成与校验 */

export const CHAT_NO_LENGTH = 10
export const CHAT_NO_MIN = 1_000_000_000
export const CHAT_NO_MAX = 9_999_999_999

export const GROUP_CODE_MIN_LENGTH = 6
export const GROUP_CODE_MAX_LENGTH = 12
/** 6 位群号稀缺概率（约 5%） */
export const GROUP_CODE_SIX_DIGIT_PROBABILITY = 0.05

export function isValidChatNo(value) {
  const s = String(value ?? '').trim()
  return /^\d{10}$/.test(s)
}

export function isValidGroupCode(value) {
  const s = String(value ?? '').trim()
  return /^\d{6,12}$/.test(s)
}

export function groupCodeFormatError() {
  return `群号为 ${GROUP_CODE_MIN_LENGTH}～${GROUP_CODE_MAX_LENGTH} 位数字`
}

export function chatNoFormatError() {
  return `聊聊号为 ${CHAT_NO_LENGTH} 位数字`
}

/** 后台手动填写：仅要求纯数字，不限制固定位数 */
export const ADMIN_NUMERIC_MAX_LENGTH = 20

export function isAdminNumericCode(value) {
  const s = String(value ?? '').trim()
  return /^\d{1,20}$/.test(s)
}

export function adminNumericFormatError(label = '号码') {
  return `${label}需为 1～${ADMIN_NUMERIC_MAX_LENGTH} 位纯数字`
}

export function randomGroupCodeLength() {
  if (Math.random() < GROUP_CODE_SIX_DIGIT_PROBABILITY) return GROUP_CODE_MIN_LENGTH
  const lengths = [7, 8, 9, 10, 11, 12]
  return lengths[Math.floor(Math.random() * lengths.length)]
}

export function generateRandomGroupCodeDigits(length = randomGroupCodeLength()) {
  const len = Math.max(
    GROUP_CODE_MIN_LENGTH,
    Math.min(GROUP_CODE_MAX_LENGTH, Math.floor(length))
  )
  let code = String(Math.floor(1 + Math.random() * 9))
  for (let i = 1; i < len; i++) {
    code += Math.floor(Math.random() * 10)
  }
  return code
}

export function generateRandomChatNoValue() {
  return Number(generateRandomGroupCodeDigits(CHAT_NO_LENGTH))
}

/** 公共语音房展示用房间号：固定 5 位（10000～99999） */
export const VOICE_ROOM_CODE_LENGTH = 5

export function isValidVoiceRoomCode(value) {
  const s = String(value ?? '').trim()
  return /^\d{5}$/.test(s)
}

export function generateRandomVoiceRoomCode() {
  return String(Math.floor(10000 + Math.random() * 90000))
}
