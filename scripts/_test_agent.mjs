/** 一次性验证脚本：ZIP 自动安装成功路径（跑完自清理） */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:3001'
const NAME = 'ZZ-AGENT-TEST'
const TMP = path.join(process.cwd(), 'data', 'tmp-agent-test')

async function j(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// 1. 造测试 ZIP（内含 TestApp.exe 假主程序 + 辅助 exe）
fs.mkdirSync(TMP, { recursive: true })
fs.writeFileSync(path.join(TMP, 'TestApp.exe'), 'MZ-dummy')
fs.writeFileSync(path.join(TMP, 'unins000.exe'), 'MZ-dummy')
const zipPath = path.join(TMP, 'ZZ-AGENT-TEST.zip')
execSync(`powershell -NoProfile -Command "Compress-Archive -LiteralPath '${path.join(TMP, 'TestApp.exe')}','${path.join(TMP, 'unins000.exe')}' -DestinationPath '${zipPath}' -Force"`)

// 2. 建测试应用并挂上 zip 包
const cfg = await j('GET', '/api/apps/config')
const installDir = cfg.data.install_directory
const created = await j('POST', '/api/apps/apps', { name: NAME, category: '实用工具', zip_pkg: zipPath })
const appId = created.data.id
console.log('created app:', appId)

// 3. 只装这一个
const started = await j('POST', '/api/agent/install', { appIds: [appId] })
console.log('started:', JSON.stringify(started))

// 4. 轮询到结束
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 500))
  const s = await j('GET', '/api/agent/status')
  const job = s.data.job
  if (job && job.status !== 'running') {
    console.log('job result:', JSON.stringify(job.items[0], null, 2))
    break
  }
}

// 5. 校验落库
const cats = await j('GET', '/api/apps/categories')
const app = cats.data.flatMap(c => c.apps).find(a => a.id === appId)
console.log('db state: is_installed =', app.is_installed, ', path =', app.path)
console.log('exe exists:', fs.existsSync(app.path))

// 6. 自清理：删应用、删测试目录
await j('DELETE', `/api/apps/apps/${appId}`)
fs.rmSync(TMP, { recursive: true, force: true })
fs.rmSync(path.join(installDir, NAME), { recursive: true, force: true })
console.log('cleaned up')
