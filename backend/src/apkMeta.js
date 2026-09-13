import AppInfoParser from 'app-info-parser'

export async function parseApkMeta(filePath) {
  const parser = new AppInfoParser(filePath)
  const info = await parser.parse()
  const versionCode = Number.parseInt(String(info.versionCode ?? ''), 10)
  const versionName = String(info.versionName ?? '').trim()
  if (!Number.isFinite(versionCode) || versionCode < 1) {
    throw new Error('读不到 APK 版本号，请确认安装包没损坏')
  }
  return {
    versionCode,
    versionName: versionName || String(versionCode),
    packageName: String(info.package ?? '').trim()
  }
}
