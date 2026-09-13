import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { GROUP_FILE_DIR } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOCKLIST_PATH = path.join(__dirname, '..', 'data', 'file-safety-blocklist.json')

/** @typedef {'safe' | 'dangerous' | 'unknown'} FileSafety */

const DANGEROUS_EXTS = new setish([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'vbs', 'js', 'jse', 'wsf', 'ps1', 'apk.1'
])

const DANGEROUS_NAME_RE =
  /木马|病毒|Trojan|Virus|Malware|Spyware|盗号|偷窥|间谍|HackTool|外挂木马|phishing|ransomware/i

function setish(list) {
  return new Set(list.map((s) => String(s).toLowerCase()))
}

function loadBlocklist() {
  try {
    if (!fs.existsSync(BLOCKLIST_PATH)) {
      return { sha256: [], nameContains: [] }
    }
    const raw = JSON.parse(fs.readFileSync(BLOCKLIST_PATH, 'utf8'))
    return {
      sha256: Array.isArray(raw.sha256) ? raw.sha256.map((s) => String(s).toLowerCase()) : [],
      nameContains: Array.isArray(raw.nameContains) ? raw.nameContains.map(String) : []
    }
  } catch {
    return { sha256: [], nameContains: [] }
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    let n
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function extOf(name) {
  const base = String(name || '').split(/[/\\]/).pop() || ''
  const i = base.lastIndexOf('.')
  if (i < 0) return ''
  return base.slice(i + 1).toLowerCase()
}

function readHead(filePath, size = 64) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(size)
    const n = fs.readSync(fd, buf, 0, size, 0)
    return buf.subarray(0, n)
  } finally {
    fs.closeSync(fd)
  }
}

/** ZIP 本地文件头里的文件名是明文，可直接在字节流里搜关键条目名 */
function zipContainsNames(filePath, names) {
  const fd = fs.openSync(filePath, 'r')
  const needle = names.map((n) => Buffer.from(n, 'utf8'))
  const found = new Set()
  try {
    const chunkSize = 1024 * 1024
    const overlap = 256
    let prev = Buffer.alloc(0)
    let pos = 0
    const stat = fs.fstatSync(fd)
    while (pos < stat.size) {
      const buf = Buffer.alloc(Math.min(chunkSize, stat.size - pos))
      const n = fs.readSync(fd, buf, 0, buf.length, pos)
      if (n <= 0) break
      const slice = Buffer.concat([prev, buf.subarray(0, n)])
      for (let i = 0; i < needle.length; i++) {
        if (!found.has(names[i]) && slice.includes(needle[i])) found.add(names[i])
      }
      if (found.size === names.length) break
      prev = slice.subarray(Math.max(0, slice.length - overlap))
      pos += n
    }
  } finally {
    fs.closeSync(fd)
  }
  return found
}

function scanApk(filePath) {
  const head = readHead(filePath, 4)
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) {
    return { safety: /** @type {FileSafety} */ ('dangerous'), reason: 'APK 不是有效压缩包' }
  }
  const names = [
    'AndroidManifest.xml',
    'classes.dex',
    'classes2.dex',
    'META-INF/',
    '.RSA',
    '.DSA',
    '.EC'
  ]
  const found = zipContainsNames(filePath, names)
  if (!found.has('AndroidManifest.xml')) {
    return { safety: 'dangerous', reason: '缺少 AndroidManifest.xml' }
  }
  if (!found.has('classes.dex') && !found.has('classes2.dex')) {
    return { safety: 'dangerous', reason: '缺少可执行代码' }
  }
  const signed =
    found.has('.RSA') || found.has('.DSA') || found.has('.EC') || found.has('META-INF/')
  if (!signed) {
    return { safety: 'dangerous', reason: '未发现签名信息' }
  }
  return { safety: 'safe', reason: 'APK 结构与签名检测通过' }
}

function scanArchive(filePath) {
  const head = readHead(filePath, 8)
  // ZIP / APK / JAR
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return { safety: /** @type {FileSafety} */ ('safe'), reason: '压缩包格式正常' }
  }
  // RAR
  if (head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72) {
    return { safety: 'safe', reason: '压缩包格式正常' }
  }
  // 7z
  if (head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf) {
    return { safety: 'safe', reason: '压缩包格式正常' }
  }
  // GZIP
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return { safety: 'safe', reason: '压缩包格式正常' }
  }
  return { safety: 'dangerous', reason: '压缩包损坏或伪装' }
}

/**
 * @param {string} filePath
 * @param {string} [displayName]
 * @returns {{ safety: FileSafety, reason: string, sha256: string }}
 */
export function scanFilePath(filePath, displayName = '') {
  const name = displayName || path.basename(filePath || '')
  if (!filePath || !fs.existsSync(filePath)) {
    return { safety: 'unknown', reason: '文件不存在', sha256: '' }
  }
  const block = loadBlocklist()
  let sha256 = ''
  if (block.sha256.length > 0) {
    try {
      sha256 = sha256File(filePath)
    } catch {
      return { safety: 'dangerous', reason: '无法读取文件', sha256: '' }
    }
    if (sha256 && block.sha256.includes(sha256.toLowerCase())) {
      return { safety: 'dangerous', reason: '命中安全黑名单', sha256 }
    }
  }
  if (DANGEROUS_NAME_RE.test(name)) {
    return { safety: 'dangerous', reason: '文件名含高风险关键词', sha256 }
  }
  for (const part of block.nameContains) {
    if (part && name.toLowerCase().includes(String(part).toLowerCase())) {
      return { safety: 'dangerous', reason: '命中名称黑名单', sha256 }
    }
  }

  const ext = extOf(name) || extOf(filePath)
  if (DANGEROUS_EXTS.has(ext)) {
    return { safety: 'dangerous', reason: '高风险可执行文件类型', sha256 }
  }

  if (ext === 'apk') {
    const r = scanApk(filePath)
    return { ...r, sha256 }
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(ext)) {
    const r = scanArchive(filePath)
    return { ...r, sha256 }
  }
  if (['txt', 'md', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'mp4', 'm4a', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return { safety: 'safe', reason: '常见文档/媒体文件', sha256 }
  }
  // 其它类型：默认安全（已通过上传白名单）
  return { safety: 'safe', reason: '已通过类型检测', sha256 }
}

export function resolveGroupFilePathFromUrl(fileUrl) {
  const raw = String(fileUrl || '').trim()
  if (!raw) return ''
  let name = raw.split('/').pop() || ''
  try {
    name = decodeURIComponent(name)
  } catch {
    /* keep */
  }
  name = path.basename(name)
  if (!name || name.includes('..')) return ''
  return path.join(GROUP_FILE_DIR, name)
}

export function scanGroupFileUrl(fileUrl, displayName = '') {
  const filePath = resolveGroupFilePathFromUrl(fileUrl)
  return scanFilePath(filePath, displayName)
}

export function normalizeFileSafety(value) {
  const v = String(value || '').toLowerCase().trim()
  if (v === 'safe' || v === 'dangerous' || v === 'unknown') return v
  return 'unknown'
}
