import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { CHAT_IMAGE_DIR, AVATAR_DIR, ABOUT_PAGE_DIR, OFFICIAL_IMAGES_DIR, VOICE_AUDIO_DIR, GROUP_FILE_DIR, GROUP_FILE_MAX_BYTES, CHAT_VIDEO_DIR, CHAT_VIDEO_MAX_BYTES, MOMENTS_IMAGE_DIR, MOMENTS_VIDEO_DIR, MOMENTS_VIDEO_MAX_BYTES, REPORT_IMAGE_DIR, APP_RELEASE_DIR, APP_RELEASE_MAX_BYTES, DOWNLOAD_PAGE_DIR, DOWNLOAD_PAGE_MAX_BYTES } from './config.js'
import { ensureOfficialImagesDir } from './officialIcons.js'

const CHAT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

function chatImageExt(file) {
  const ext = path.extname(file.originalname).toLowerCase()
  if (CHAT_IMAGE_EXTS.has(ext)) return ext === '.jpeg' ? '.jpg' : ext
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  }
  return map[file.mimetype] || '.jpg'
}

function isAllowedChatImage(file) {
  const ext = path.extname(file.originalname).toLowerCase()
  const extOk = CHAT_IMAGE_EXTS.has(ext)
  const mimeOk = /jpeg|jpg|png|gif|webp/i.test(String(file.mimetype || ''))
  return extOk || mimeOk
}

const chatImageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true })
    cb(null, CHAT_IMAGE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `photo-${uniqueSuffix}${chatImageExt(file)}`)
  }
})

export const uploadChatPhoto = multer({
  storage: chatImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedChatImage(file)) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp'))
  }
})

const momentsImageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(MOMENTS_IMAGE_DIR, { recursive: true })
    cb(null, MOMENTS_IMAGE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `moment-${uniqueSuffix}${chatImageExt(file)}`)
  }
})

export const uploadMomentPhoto = multer({
  storage: momentsImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedChatImage(file)) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp'))
  }
})

const reportImageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(REPORT_IMAGE_DIR, { recursive: true })
    cb(null, REPORT_IMAGE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `report-${uniqueSuffix}${chatImageExt(file)}`)
  }
})

export const uploadReportPhoto = multer({
  storage: reportImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedChatImage(file)) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp'))
  }
})

const momentsVideoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(MOMENTS_VIDEO_DIR, { recursive: true })
    cb(null, MOMENTS_VIDEO_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `moment-video-${uniqueSuffix}${chatVideoExt(file)}`)
  }
})

export const uploadMomentVideo = multer({
  storage: momentsVideoStorage,
  limits: { fileSize: MOMENTS_VIDEO_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (isAllowedChatVideo(file)) return cb(null, true)
    cb(new Error('只支持视频格式：mp4, mov, m4v, webm, mkv, avi, 3gp'))
  }
})

const CHAT_VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp'])

function chatVideoExt(file) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (CHAT_VIDEO_EXTS.has(ext)) return ext
  const mime = String(file.mimetype || '').toLowerCase()
  if (mime.includes('webm')) return '.webm'
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov'
  if (mime.includes('matroska') || mime.includes('mkv')) return '.mkv'
  if (mime.includes('avi')) return '.avi'
  if (mime.includes('3gpp')) return '.3gp'
  return '.mp4'
}

function isAllowedChatVideo(file) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  return CHAT_VIDEO_EXTS.has(ext) || mime.startsWith('video/')
}

const chatVideoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(CHAT_VIDEO_DIR, { recursive: true })
    cb(null, CHAT_VIDEO_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `video-${uniqueSuffix}${chatVideoExt(file)}`)
  }
})

export const uploadChatVideo = multer({
  storage: chatVideoStorage,
  limits: { fileSize: CHAT_VIDEO_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (isAllowedChatVideo(file)) return cb(null, true)
    cb(new Error('只支持视频格式：mp4, mov, m4v, webm, mkv, avi, 3gp'))
  }
})

const VOICE_EXTS = new Set(['.webm', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.3gp', '.mp4'])

function chatVoiceExt(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase()
  if (VOICE_EXTS.has(fromName)) {
    // browsers expect audio/mp4 as .m4a
    return fromName === '.mp4' ? '.m4a' : fromName
  }
  const mime = String(file.mimetype || '').toLowerCase()
  if (mime.includes('webm')) return '.webm'
  if (mime.includes('ogg')) return '.ogg'
  if (mime.includes('mpeg') || mime === 'audio/mp3') return '.mp3'
  if (mime.includes('wav')) return '.wav'
  if (mime.includes('aac')) return '.aac'
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a'
  if (mime.includes('3gpp') || mime.includes('amr')) return '.3gp'
  return '.webm'
}

const chatVoiceStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(VOICE_AUDIO_DIR, { recursive: true })
    cb(null, VOICE_AUDIO_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `voice-${uniqueSuffix}${chatVoiceExt(file)}`)
  }
})

export const uploadChatVoice = multer({
  storage: chatVoiceStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '')
    const extOk = VOICE_EXTS.has(ext)
    const mimeOk = mime.startsWith('audio/') || /webm|ogg|mp3|wav|m4a|aac|3gpp|mp4/i.test(mime)
    if (mimeOk || extOk) return cb(null, true)
    cb(new Error('只支持音频格式：webm, ogg, mp3, wav, m4a, aac'))
  }
})

/** 语音转文字：仅内存，不落盘 */
export const uploadVoiceToText = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '')
    const extOk = VOICE_EXTS.has(ext)
    const mimeOk = mime.startsWith('audio/') || /webm|ogg|mp3|wav|m4a|aac|3gpp|mp4/i.test(mime)
    if (mimeOk || extOk) return cb(null, true)
    cb(new Error('只支持音频格式：webm, ogg, mp3, wav, m4a, aac'))
  }
})

const avatarStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true })
    cb(null, AVATAR_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    // 手机相册 content URI 常无扩展名，按 MIME 推导（与聊天图片一致）
    cb(null, `avatar-${uniqueSuffix}${chatImageExt(file)}`)
  }
})

export const uploadUserAvatar = multer({
  storage: avatarStorage,
  // 相册原图常超 5MB；客户端会裁剪压缩，这里留足余量
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedChatImage(file)) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp'))
  }
})

const aboutPageAvatarStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(ABOUT_PAGE_DIR, { recursive: true })
    cb(null, ABOUT_PAGE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `about-${uniqueSuffix}${chatImageExt(file)}`)
  }
})

export const uploadAboutPageAvatar = multer({
  storage: aboutPageAvatarStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (isAllowedChatImage(file)) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp'))
  }
})

const officialIconStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureOfficialImagesDir()
    cb(null, OFFICIAL_IMAGES_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `icon-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`)
  }
})

export const uploadOfficialIcon = multer({
  storage: officialIconStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|ico/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml'
    if (mimetype && extname) return cb(null, true)
    cb(new Error('只支持图片格式：jpeg, jpg, png, gif, webp, svg, ico'))
  }
})

const stickerStorage = multer.memoryStorage()

export const uploadSticker = multer({
  storage: stickerStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(String(file.mimetype || ''))
    if (mimetype || extname) return cb(null, true)
    cb(new Error('表情包仅支持 gif、jpg、png、webp 格式'))
  }
})

const avatarFrameStorage = multer.memoryStorage()

export const uploadAvatarFrame = multer({
  storage: avatarFrameStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowedTypes = /png|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = /image\/png|image\/webp/i.test(String(file.mimetype || ''))
    if (mimetype && extname) return cb(null, true)
    cb(new Error('头像框仅支持 png、webp（需透明通道）'))
  }
})

const GROUP_FILE_EXTS = new Set([
  '.apk', '.zip', '.rar', '.7z', '.tar', '.gz',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  '.mp4', '.mkv', '.mov', '.mp3', '.wav', '.flac',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.json', '.xml', '.html', '.htm', '.md', '.log'
])

function groupFileExt(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase()
  if (GROUP_FILE_EXTS.has(fromName)) return fromName
  const mime = String(file.mimetype || '').toLowerCase()
  if (mime.includes('android.package') || mime === 'application/vnd.android.package-archive') return '.apk'
  if (mime.includes('zip')) return '.zip'
  if (mime.includes('rar')) return '.rar'
  if (mime.includes('pdf')) return '.pdf'
  return fromName || '.bin'
}

function isAllowedGroupFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (GROUP_FILE_EXTS.has(ext)) return true
  const mime = String(file.mimetype || '').toLowerCase()
  return (
    mime.includes('android.package') ||
    mime === 'application/vnd.android.package-archive' ||
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('octet-stream') ||
    mime.startsWith('application/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('image/') ||
    mime.startsWith('text/')
  )
}

const groupFileStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(GROUP_FILE_DIR, { recursive: true })
    cb(null, GROUP_FILE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `file-${uniqueSuffix}${groupFileExt(file)}`)
  }
})

export const uploadGroupFile = multer({
  storage: groupFileStorage,
  limits: { fileSize: GROUP_FILE_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (isAllowedGroupFile(file)) return cb(null, true)
    cb(new Error('不支持的文件类型'))
  }
})

function isAllowedAppRelease(file) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (ext === '.apk') return true
  const mime = String(file.mimetype || '').toLowerCase()
  return (
    mime.includes('android.package') ||
    mime === 'application/vnd.android.package-archive'
  )
}

const appReleaseStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(APP_RELEASE_DIR, { recursive: true })
    cb(null, APP_RELEASE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `release-${uniqueSuffix}.apk`)
  }
})

export const uploadAppRelease = multer({
  storage: appReleaseStorage,
  limits: { fileSize: APP_RELEASE_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (isAllowedAppRelease(file)) return cb(null, true)
    cb(new Error('只支持 APK 安装包'))
  }
})

const downloadPageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(DOWNLOAD_PAGE_DIR, { recursive: true })
    cb(null, DOWNLOAD_PAGE_DIR)
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `download-${uniqueSuffix}.apk`)
  }
})

export const uploadDownloadPageApk = multer({
  storage: downloadPageStorage,
  limits: { fileSize: DOWNLOAD_PAGE_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (isAllowedAppRelease(file)) return cb(null, true)
    cb(new Error('只支持 APK 安装包'))
  }
})

/** 数据库 JSON 导入（内存解析，上限 128MB） */
export const uploadDbJson = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 128 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '')
    if (name.endsWith('.json') || /json/i.test(mime) || mime === 'application/octet-stream') {
      return cb(null, true)
    }
    cb(new Error('只支持 JSON 文件'))
  }
})
