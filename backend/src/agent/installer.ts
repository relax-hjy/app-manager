/**
 * 自动安装执行器：批量任务编排 + 策略执行（ZIP 解压 / EXE 静默 / 交互回退）。
 * LLM 决策失败时降级内置规则表；顺序安装，支持取消。
 */
import { spawn, exec, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { getDb, queryAll, execute } from '../database'
import { isLlmAvailable, planInstall, repairPlan, chooseMainExe, type InstallPlan, type PlanContext } from './llm'

export interface InstallJobItem {
  appId: string
  name: string
  pkgPath: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'manual' | 'skipped'
  step: string
  message: string
  logTail?: string
}

export interface InstallJob {
  id: string
  status: 'running' | 'done' | 'canceled'
  createdAt: string
  items: InstallJobItem[]
  cancelRequested: boolean
}

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons')
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000

let currentJob: InstallJob | null = null
let currentChild: ChildProcess | null = null

/** 读取当前任务（无则 null），供 /api/agent/status 轮询 */
export function getJob(): InstallJob | null {
  return currentJob
}

/** 请求取消：应用间生效，并 kill 当前子进程 */
export function cancelJob(): void {
  if (!currentJob || currentJob.status !== 'running') return
  currentJob.cancelRequested = true
  if (currentChild && !currentChild.killed) currentChild.kill()
}

/**
 * 启动批量安装任务（fire-and-forget）。
 * @param appIds 指定应用 id 列表；不传则安装全部「有安装包且未安装」的应用
 * @returns 新任务；若已有任务在跑则返回 null
 */
export async function startInstallJob(appIds?: string[]): Promise<InstallJob | null> {
  if (currentJob && currentJob.status === 'running') return null

  const db = await getDb()
  let rows: { id: string; name: string; exe_pkg: string; zip_pkg: string }[]
  if (appIds && appIds.length > 0) {
    rows = queryAll(db,
      `SELECT id, name, exe_pkg, zip_pkg FROM apps WHERE id IN (${appIds.map(() => '?').join(',')})`,
      appIds
    ) as { id: string; name: string; exe_pkg: string; zip_pkg: string }[]
  } else {
    rows = queryAll(db,
      `SELECT id, name, exe_pkg, zip_pkg FROM apps WHERE (exe_pkg != '' OR zip_pkg != '') AND is_installed = 0`
    ) as { id: string; name: string; exe_pkg: string; zip_pkg: string }[]
  }

  currentJob = {
    id: uuid(),
    status: 'running',
    createdAt: new Date().toISOString(),
    cancelRequested: false,
    items: rows.map(r => ({
      appId: r.id,
      name: r.name,
      pkgPath: r.exe_pkg || r.zip_pkg,
      status: 'pending' as const,
      step: '排队',
      message: '',
    })),
  }
  const job = currentJob
  void runLoop(job).catch(err => {
    console.error('[agent] install job crashed:', err)
    job.status = 'done'
  })
  return job
}

/** 任务主循环：顺序安装每个应用 */
async function runLoop(job: InstallJob): Promise<void> {
  for (const item of job.items) {
    if (job.cancelRequested) {
      item.status = 'skipped'
      item.step = '已取消'
      item.message = '任务已取消'
      continue
    }
    item.status = 'running'
    item.step = '准备'
    try {
      await installOne(job, item)
    } catch (err) {
      item.status = 'failed'
      item.message = err instanceof Error ? err.message : String(err)
    }
  }
  job.status = job.cancelRequested ? 'canceled' : 'done'
}

/** 单应用安装流程：检查包 → 计划（LLM/规则）→ 执行 → 失败修复 → 落库 */
async function installOne(job: InstallJob, item: InstallJobItem): Promise<void> {
  if (!fs.existsSync(item.pkgPath)) {
    item.status = 'skipped'
    item.message = `安装包不存在：${item.pkgPath}`
    return
  }

  const db = await getDb()
  const configRows = queryAll(db, 'SELECT key, value FROM config') as { key: string; value: string }[]
  const installDir = configRows.find(r => r.key === 'install_directory')?.value || 'D:\\Software'
  const isZip = item.pkgPath.toLowerCase().endsWith('.zip')
  const ctx: PlanContext = {
    appName: item.name,
    pkgPath: item.pkgPath,
    pkgType: isZip ? 'zip' : 'exe',
    pkgSize: fs.statSync(item.pkgPath).size,
    detectedType: detectInstallerType(item.pkgPath),
    installDir,
  }

  // 1. 计划：LLM 优先，失败降级规则表
  item.step = '规划'
  let plan = await safePlan(ctx)
  const planSource = plan.source

  // 2. 执行（失败则 LLM 修复重试 ≤2 次）
  for (let attempt = 0; attempt < 3; attempt++) {
    if (job.cancelRequested) {
      item.status = 'skipped'
      item.step = '已取消'
      item.message = '任务已取消'
      return
    }
    item.step = attempt === 0 ? `安装（${planSource}）` : `重试 ${attempt}`
    if (plan.plan.targetDir) fs.mkdirSync(plan.plan.targetDir, { recursive: true })
    const result = await executePlan(plan.plan)

    if (result.ok) {
      await finishSuccess(item, plan.plan, ctx, db)
      return
    }

    item.logTail = result.output.slice(-2048)
    // 最后一次失败：交互式回退
    if (attempt === 2 || job.cancelRequested) break
    try {
      const repair = await repairPlan(ctx, plan.plan, item.logTail)
      if (repair.giveUp) break
      if (repair.plan) plan = { plan: validatePlan(repair.plan) ?? plan.plan, source: 'LLM 修复' }
    } catch {
      break // LLM 不可用，不再重试
    }
  }

  // 3. 回退交互式启动（人工安装）
  item.step = '回退'
  await launchInteractive(item.pkgPath)
  item.status = 'manual'
  item.message = '静默安装失败，已弹出安装器，请手动完成安装'
}

/** 结果校验：非法计划返回 null */
function validatePlan(plan: InstallPlan): InstallPlan | null {
  if (!plan || !plan.command) return null
  if (!['silent', 'zip', 'interactive'].includes(plan.strategy)) return null
  return plan
}

/** 计划入口：LLM → 规则表兜底 */
async function safePlan(ctx: PlanContext): Promise<{ plan: InstallPlan; source: string }> {
  if (await isLlmAvailable()) {
    try {
      const plan = validatePlan(await planInstall(ctx))
      if (plan) return { plan, source: 'LLM' }
    } catch (err) {
      console.error('[agent] LLM planInstall 失败，降级规则表:', err instanceof Error ? err.message : err)
    }
  }
  return { plan: rulePlan(ctx), source: '规则' }
}

/** 执行计划：捕获输出、5 分钟超时、可 kill */
function executePlan(plan: InstallPlan): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise(resolve => {
    const expected = plan.expectedExitCodes.length > 0 ? plan.expectedExitCodes : [0]
    let output = ''
    const child = spawn(plan.command, plan.args, { windowsHide: true, shell: false })
    currentChild = child
    const timer = setTimeout(() => {
      output += '\n[agent] 超时，已终止进程'
      child.kill()
    }, INSTALL_TIMEOUT_MS)
    child.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { output += d.toString() })
    child.on('error', err => {
      clearTimeout(timer)
      currentChild = null
      resolve({ ok: false, code: null, output: `${output}\n${err.message}` })
    })
    child.on('close', code => {
      clearTimeout(timer)
      currentChild = null
      resolve({ ok: expected.includes(code ?? -1), code, output })
    })
  })
}

/** 成功收尾：找主 EXE（zip）→ 落库 path + is_installed → 清图标缓存 */
async function finishSuccess(item: InstallJobItem, plan: InstallPlan, ctx: PlanContext, db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  let exePath = ''
  const targetDir = plan.targetDir || path.join(ctx.installDir, item.name)

  if (plan.strategy === 'zip' || ctx.pkgType === 'zip') {
    item.step = '定位主程序'
    const candidates = findExeCandidates(targetDir, item.name)
    if (candidates.length === 0) {
      item.status = 'failed'
      item.message = `解压完成，但 ${targetDir} 下未找到可执行文件`
      return
    }
    try {
      exePath = candidates.length === 1 ? candidates[0] : await chooseMainExe(item.name, candidates)
    } catch {
      exePath = rankExeCandidates(candidates, item.name)[0]
    }
  } else {
    // 静默安装后按约定路径找主程序（AppForm 约定：{installDir}\{name}\{name}.exe）
    const expected = path.join(targetDir, `${item.name}.exe`)
    if (fs.existsSync(expected)) {
      exePath = expected
    } else {
      const candidates = findExeCandidates(targetDir, item.name)
      if (candidates.length > 0) {
        try {
          exePath = candidates.length === 1 ? candidates[0] : await chooseMainExe(item.name, candidates)
        } catch {
          exePath = rankExeCandidates(candidates, item.name)[0]
        }
      }
    }
  }

  execute(db, 'UPDATE apps SET path = ?, is_installed = 1 WHERE id = ?', [exePath, item.appId])
  // 直连 DB 不走 PATCH 路由的图标缓存清理副作用，这里手动清，强制重新提取图标
  const iconPath = path.join(ICONS_DIR, `${item.appId}.png`)
  if (fs.existsSync(iconPath)) {
    try { fs.unlinkSync(iconPath) } catch { /* 忽略 */ }
  }
  item.status = 'success'
  item.step = '完成'
  item.message = exePath ? `已安装：${exePath}` : '已安装（未定位到主程序，请在应用管理中补充路径）'
}

/** 启动交互式安装器（fire-and-forget，同 native.ts 的 launch 行为） */
function launchInteractive(pkgPath: string): Promise<void> {
  return new Promise(resolve => {
    exec(`start "" "${pkgPath}"`, { cwd: path.dirname(pkgPath) }, () => resolve())
  })
}

/** 安装器类型启发式（LLM 不可用时的规则依据） */
export function detectInstallerType(pkgPath: string): string {
  const lower = pkgPath.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.msi')) return 'msi'
  const name = path.basename(lower)
  if (name.includes('inno') || /^setup_/.test(name)) return 'inno'
  if (name.includes('squirrel') || name.includes('update.exe')) return 'squirrel'
  return 'nsis-or-unknown'
}

/** 内置规则表：按安装器类型生成默认静默计划 */
export function rulePlan(ctx: PlanContext): InstallPlan {
  const targetDir = path.join(ctx.installDir, ctx.appName)
  if (ctx.pkgType === 'zip' || ctx.detectedType === 'zip') {
    return {
      strategy: 'zip', command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${ctx.pkgPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`],
      expectedExitCodes: [0], targetDir, notes: '规则：绿色 ZIP 用 PowerShell 解压到安装目录',
    }
  }
  if (ctx.detectedType === 'msi') {
    return {
      strategy: 'silent', command: 'msiexec', args: ['/i', ctx.pkgPath, '/quiet', '/norestart', `INSTALLDIR=${targetDir}`],
      expectedExitCodes: [0, 3010], targetDir, notes: '规则：MSI 静默安装',
    }
  }
  if (ctx.detectedType === 'inno') {
    return {
      strategy: 'silent', command: ctx.pkgPath,
      args: ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/DIR=${targetDir}`],
      expectedExitCodes: [0], targetDir, notes: '规则：Inno Setup 静默安装',
    }
  }
  if (ctx.detectedType === 'squirrel') {
    return {
      strategy: 'silent', command: ctx.pkgPath, args: ['--silent'],
      expectedExitCodes: [0], targetDir, notes: '规则：Squirrel 静默安装',
    }
  }
  return {
    strategy: 'silent', command: ctx.pkgPath, args: ['/S'],
    expectedExitCodes: [0], targetDir, notes: '规则：默认按 NSIS /S 尝试静默',
  }
}

/** 递归收集目录下的 exe（限深 6，跳过卸载器等） */
function findExeCandidates(dir: string, appName: string): string[] {
  const out: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 6 || out.length > 50) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (e.name.toLowerCase().endsWith('.exe') && !/^unins/i.test(e.name)) out.push(full)
    }
  }
  if (fs.existsSync(dir)) walk(dir, 0)
  void appName
  return out
}

/** 启发式排序候选主程序：文件名与应用名匹配度高的在前 */
function rankExeCandidates(candidates: string[], appName: string): string[] {
  const norm = appName.toLowerCase().replace(/[\s_-]/g, '')
  return [...candidates].sort((a, b) => score(b) - score(a))
  function score(p: string): number {
    const base = path.basename(p, '.exe').toLowerCase().replace(/[\s_-]/g, '')
    if (base === norm) return 100
    if (base.includes(norm) || norm.includes(base)) return 50
    return 0
  }
}
