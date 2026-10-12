/**
 * 开发启动预检：依赖检查 + 端口占用检测（仅提示，不杀进程）。
 * 由根目录 `npm run dev` 在拉起前后端之前执行。
 */
import { execSync } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** 检测目标：端口 + 对应服务名 */
const TARGETS = [
  { port: Number(process.env.PORT) || 3001, label: '后端 Express' },
  { port: Number(process.env.FRONTEND_PORT) || 5173, label: '前端 Vite' },
]

/** 检查 backend/frontend 依赖是否已安装 */
function checkDeps() {
  for (const dir of ['backend', 'frontend']) {
    if (!fs.existsSync(path.join(ROOT, dir, 'node_modules'))) {
      console.error(`[预检] ✗ 缺少 ${dir}/node_modules，请先安装依赖：npm run install:all`)
      process.exit(1)
    }
  }
}

/**
 * 解析 netstat -ano，返回监听该端口的 PID。
 * 中文 Windows 状态列也是英文 LISTENING；找不到返回 null。
 */
function findListenerPid(port) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 5 && parts[0].toUpperCase() === 'TCP' && parts[3].toUpperCase() === 'LISTENING') {
        if (parts[1].endsWith(`:${port}`)) return parts[4]
      }
    }
    return null
  } catch {
    return null
  }
}

/** 查询 PID 对应的进程名（查不到返回 '未知进程'） */
function processName(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const first = out.trim().split('\n')[0] || ''
    if (/没有|No tasks/i.test(first)) return '未知进程'
    return first.split('","')[0].replace(/"/g, '') || '未知进程'
  } catch {
    return '未知进程'
  }
}

/**
 * netstat 拿不到 PID 时的降级探测：能否连上该端口。
 * 能连上说明已有监听者。
 */
function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(500, () => { socket.destroy(); resolve(false) })
  })
}

async function main() {
  checkDeps()

  let blocked = false
  for (const { port, label } of TARGETS) {
    const pid = findListenerPid(port)
    if (pid) {
      blocked = true
      console.error(`[预检] ✗ 端口 ${port}（${label}）已被占用`)
      console.error(`    占用进程: ${processName(pid)} (PID ${pid})`)
      console.error(`    补救命令: taskkill /PID ${pid} /F`)
    } else if (await probePort(port)) {
      blocked = true
      console.error(`[预检] ✗ 端口 ${port}（${label}）已被占用（未能取得进程信息，请用 netstat -ano | findstr :${port} 自查）`)
    }
  }

  if (blocked) {
    console.error('[预检] 端口被占用，启动已取消（不会自动杀进程）。请先停止占用进程后重试。')
    process.exit(1)
  }

  console.log(`[预检] ✓ 依赖就绪，端口 ${TARGETS.map(t => t.port).join(' / ')} 可用`)
}

main()
