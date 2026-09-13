import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'url'
import {
  CHAT_IMAGE_DIR,
  VOICE_AUDIO_DIR,
  AVATAR_FRAME_DIR,
  CONFIG_PATH,
  loadConfig
} from '../src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

function clearDirFiles(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return 0
  }
  let n = 0
  for (const name of fs.readdirSync(dir)) {
    if (name === '.gitkeep') continue
    const full = path.join(dir, name)
    if (fs.statSync(full).isFile()) {
      fs.unlinkSync(full)
      n += 1
    }
  }
  if (!fs.existsSync(path.join(dir, '.gitkeep'))) {
    fs.writeFileSync(path.join(dir, '.gitkeep'), '')
  }
  return n
}

async function clearDatabaseMedia() {
  const config = loadConfig()
  const dbCfg = config.database || {}
  if (!dbCfg.host || !dbCfg.user || !dbCfg.database) {
    console.log('[skip] 数据库未配置，跳过库内聊天相册/语音/公告清理')
    return null
  }

  let pool
  try {
    pool = mysql.createPool({
      host: dbCfg.host,
      port: Number(dbCfg.port || 3306),
      user: dbCfg.user,
      password: dbCfg.password || '',
      database: dbCfg.database,
      charset: dbCfg.charset || 'utf8mb4',
      connectionLimit: 2
    })
    await pool.query('SELECT 1')
  } catch (e) {
    console.log('[skip] 数据库连接失败，跳过库内清理:', e.message || e)
    return null
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [announceConv] = await conn.query(
      `UPDATE conversations
       SET announcement = NULL,
           announcement_image = NULL,
           announcement_pinned = 0,
           announcement_pinned_message_id = NULL
       WHERE announcement IS NOT NULL
          OR announcement_image IS NOT NULL
          OR announcement_pinned <> 0
          OR announcement_pinned_message_id IS NOT NULL`
    )

    const [msgRows] = await conn.query(
      `DELETE FROM messages
       WHERE message_type IN ('announcement', 'photo', 'voice')
          OR image_url IS NOT NULL
          OR voice_url IS NOT NULL`
    )

    let frameUsers = { affectedRows: 0 }
    try {
      ;[frameUsers] = await conn.query(
        `UPDATE users SET avatar_frame_id = 'none' WHERE avatar_frame_id IS NOT NULL AND avatar_frame_id <> 'none'`
      )
    } catch {
      // optional column
    }

    try {
      await conn.query('DELETE FROM avatar_frame_activation_codes')
    } catch {
      // optional table
    }

    await conn.commit()
    return {
      conversations: announceConv.affectedRows || 0,
      messages: msgRows.affectedRows || 0,
      avatarFramesReset: frameUsers.affectedRows || 0
    }
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  console.log('=== XhaMil 上线清理 ===\n')

  const chatN = clearDirFiles(CHAT_IMAGE_DIR)
  const voiceN = clearDirFiles(VOICE_AUDIO_DIR)
  const frameN = clearDirFiles(AVATAR_FRAME_DIR)

  console.log(`聊天相册 (Chat Images): 删除 ${chatN} 个文件`)
  console.log(`语音 (Audio): 删除 ${voiceN} 个文件`)
  console.log(`头像框 (Avatar Frames): 删除 ${frameN} 个文件`)
  console.log(`配置文件: ${path.relative(ROOT, CONFIG_PATH)} 已重置为上线默认模板\n`)

  try {
    const db = await clearDatabaseMedia()
    if (db) {
      console.log('数据库清理:')
      console.log(`  群公告字段清空: ${db.conversations} 个群`)
      console.log(`  消息删除(公告/图片/语音): ${db.messages} 条`)
      console.log(`  用户头像框重置: ${db.avatarFramesReset} 人`)
    }
  } catch (e) {
    console.warn('[warn] 数据库清理失败:', e.message || e)
  }

  console.log('\n完成。请上线后：')
  console.log('  1. 在后台重新配置 MySQL / 邮箱 / 极验')
  console.log('  2. 修改 admin 默认密码')
  console.log('  3. 重启后端以生成新的随机后台入口码')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
