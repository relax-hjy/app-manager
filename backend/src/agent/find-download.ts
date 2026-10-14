/**
 * 下载链接查找任务：Bing 搜索真实结果 → LLM 排序候选 → 可达性校验。
 * 任务态仅存内存（与安装任务一致）；每应用保留最新一个，完成态 30 分钟后清理。
 */
import { getDb, queryAll, execute } from '../database'
import { rankDownloadLinks, isLlmAvailable, type DownloadLinkCandidate, type SearchHit } from './llm'

/** 单应用下载链接查找任务（内存态，重启丢失，与安装任务一致） */
export interface FindTask {
  appId: string
  name: string
  status: 'running' | 'success' | 'failed' | 'canceled' | 'skipped'
  step: string
  message: string
  candidates?: DownloadLinkCandidate[]
  url?: string
  createdAt: string
  finishedAt?: string
}

/** 任务运行时（取消控制，不外发） */
interface FindRuntime {
  controller: AbortController
  cancelRequested: boolean
}

const tasks = new Map<string, FindTask>()
const runtimes = new Map<string, FindRuntime>()
const FINISHED_TTL_MS = 30 * 60 * 1000

/**
 * 清理完成超过 30 分钟的任务记录。
 */
function pruneTasks(): void {
  const now = Date.now()
  for (const [appId, task] of tasks) {
    if (task.status !== 'running' && task.finishedAt && now - new Date(task.finishedAt).getTime() > FINISHED_TTL_MS) {
      tasks.delete(appId)
    }
  }
}

/**
 * 结束任务：写终态并清理运行时。
 * @param task 目标任务
 * @param status 终态
 * @param message 结果说明
 */
function finish(task: FindTask, status: FindTask['status'], message: string): void {
  task.status = status
  task.message = message
  task.step = '完成'
  task.finishedAt = new Date().toISOString()
  runtimes.delete(task.appId)
}

/**
 * 读取全部查找任务（供前端轮询）。
 * @returns 任务列表（每应用最新一个）
 */
export function getFindTasks(): FindTask[] {
  pruneTasks()
  return [...tasks.values()]
}

/**
 * 请求取消查找任务（中止搜索与 LLM 请求，幂等）。
 * @param appId 目标应用 id
 */
export function cancelFindTask(appId: string): void {
  const runtime = runtimes.get(appId)
  if (runtime) {
    runtime.cancelRequested = true
    runtime.controller.abort()
  }
}

/**
 * 将用户点选的候选链接写入应用的 download_url（总是覆盖）。
 * @param appId 应用 id
 * @param url 点选的候选 URL
 * @returns 写入是否成功（应用不存在时 false）
 */
export async function applyCandidate(appId: string, url: string): Promise<boolean> {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT id FROM apps WHERE id = ?', [appId])
  if (!rows[0]) return false
  execute(db, 'UPDATE apps SET download_url = ? WHERE id = ?', [url, appId])
  return true
}

/**
 * 读取全部已持久化的查找结果（合成 success 任务，供前端在无运行任务时展示）。
 * @returns 每应用最新一条成功结果（无结果的应用不返回）
 */
export async function getSavedFindResults(): Promise<FindTask[]> {
  const db = await getDb()
  const rows = queryAll(db, `SELECT id, name, find_candidates, find_message, find_finished_at FROM apps
    WHERE find_candidates != '' AND find_candidates IS NOT NULL`)
  const results: FindTask[] = []
  for (const row of rows) {
    try {
      const candidates = JSON.parse(String(row.find_candidates)) as DownloadLinkCandidate[]
      if (!Array.isArray(candidates) || candidates.length === 0) continue
      results.push({
        appId: String(row.id),
        name: String(row.name ?? ''),
        status: 'success',
        step: '完成',
        message: String(row.find_message ?? ''),
        candidates,
        createdAt: String(row.find_finished_at ?? ''),
        finishedAt: String(row.find_finished_at ?? ''),
      })
    } catch {
      // JSON 损坏的行跳过，不影响其他结果
    }
  }
  return results
}

/**
 * 持久化一次成功的查找结果（失败/取消/跳过不落库，保留旧结果）。
 * @param appId 目标应用 id
 * @param candidates 候选链接列表
 * @param message 结果说明
 */
async function saveFindResult(appId: string, candidates: DownloadLinkCandidate[], message: string): Promise<void> {
  const db = await getDb()
  const finishedAt = new Date().toISOString()
  execute(db, 'UPDATE apps SET find_candidates = ?, find_message = ?, find_finished_at = ? WHERE id = ?',
    [JSON.stringify(candidates), message, finishedAt, appId])
}

/**
 * 启动下载链接查找（fire-and-forget，立即返回任务）。
 * @param appId 目标应用 id
 * @param opts auto=true 为注册后自动查找（只回填空 download_url）；false 为手动查找（只出候选不写库）
 * @returns 新任务；该应用正在查找、应用不存在、自动模式无 key 时返回 null
 */
export async function startFindTask(appId: string, opts: { auto: boolean }): Promise<FindTask | null> {
  pruneTasks()
  const existing = tasks.get(appId)
  if (existing && existing.status === 'running') return null
  if (opts.auto && !(await isLlmAvailable())) return null
  const db = await getDb()
  const rows = queryAll(db, 'SELECT name, version, description FROM apps WHERE id = ?', [appId])
  const app = rows[0] as { name?: string; version?: string; description?: string } | undefined
  if (!app || !app.name) return null
  const task: FindTask = {
    appId,
    name: app.name,
    status: 'running',
    step: '联网搜索',
    message: '',
    createdAt: new Date().toISOString(),
  }
  const controller = new AbortController()
  tasks.set(appId, task)
  runtimes.set(appId, { controller, cancelRequested: false })
  const ctx = { name: app.name, version: app.version ?? '', description: app.description ?? '' }
  void runFind(task, ctx, opts.auto, controller).catch((err: unknown) => {
    if (controller.signal.aborted) {
      finish(task, 'canceled', '已取消')
      return
    }
    finish(task, 'failed', err instanceof Error ? err.message : String(err))
  })
  return task
}

/**
 * 查找主流程：搜索 → LLM 排序 → 校验 →（自动模式）回填。
 * @param task 任务对象（原地更新）
 * @param ctx 应用信息
 * @param auto 是否注册自动模式
 * @param controller 取消控制器
 */
async function runFind(task: FindTask, ctx: { name: string; version: string; description: string }, auto: boolean, controller: AbortController): Promise<void> {
  const hits = await searchDownloadHits(ctx.name, controller.signal)
  if (controller.signal.aborted) { finish(task, 'canceled', '已取消'); return }
  task.step = 'LLM 排序'
  const result = await rankDownloadLinks(ctx, hits, controller.signal)
  if (controller.signal.aborted) { finish(task, 'canceled', '已取消'); return }
  task.step = '校验链接'
  const reaches = await Promise.all(result.candidates.map(c => checkUrlReachable(c.url, controller.signal)))
  if (controller.signal.aborted) { finish(task, 'canceled', '已取消'); return }
  const candidates: DownloadLinkCandidate[] = result.candidates.map((candidate, i) =>
    reaches[i] === 'ok' ? candidate : { ...candidate, note: `${candidate.note}（未通过可达性校验）` }
  )
  task.candidates = candidates
  const sourceNote = hits.length > 0 ? '' : '搜索不可用，凭知识推荐；'
  const resultMessage = `${sourceNote}找到 ${candidates.length} 个候选链接`
  // 排序完成即落库（含自动模式被跳过回填的情况），失败/取消不覆盖旧结果
  if (candidates.length > 0) await saveFindResult(task.appId, candidates, resultMessage)
  if (!auto) {
    finish(task, 'success', resultMessage)
    return
  }
  task.step = '写入'
  const top = candidates[0]
  if (!top) { finish(task, 'failed', '未找到候选链接'); return }
  const db = await getDb()
  const rows = queryAll(db, 'SELECT download_url FROM apps WHERE id = ?', [task.appId])
  const current = rows[0] as { download_url?: string } | undefined
  if (!current) { finish(task, 'canceled', '应用已删除'); return }
  if ((current.download_url ?? '').trim()) { finish(task, 'skipped', '已有下载地址，未覆盖'); return }
  execute(db, 'UPDATE apps SET download_url = ? WHERE id = ?', [top.url, task.appId])
  task.url = top.url
  finish(task, 'success', `${sourceNote}已回填下载地址`)
}

/**
 * 抓取 Bing 中文搜索结果（真实 URL，解码跳转包裹）。
 * @param name 应用名
 * @param signal 取消信号
 * @returns 前 8 条结果；抓取失败/被拦截时返回空数组（调用方降级为凭知识推荐）
 */
export async function searchDownloadHits(name: string, signal: AbortSignal): Promise<SearchHit[]> {
  try {
    const query = encodeURIComponent(`${name} 官方下载`)
    const res = await fetch(`https://www.bing.com/search?q=${query}&setlang=zh-cn`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    if (!res.ok) return []
    const html = await res.text()
    return parseBingHits(html).slice(0, 8)
  } catch {
    return []
  }
}

/**
 * 解析 Bing 结果页 HTML：仅取 b_algo 结果块内的 h2 链接并解码 u=a1 跳转包裹。
 * @param html 搜索结果页 HTML
 * @returns 去重后的真实结果列表
 */
function parseBingHits(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  // 逐个 b_algo 结果块解析，避免抓到页面其他区域的 h2（如翻译/侧边栏链接）
  const blocks = html.split('class="b_algo"').slice(1)
  const anchorRe = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
  for (const block of blocks) {
    const match = anchorRe.exec(block)
    if (!match) continue
    const realUrl = decodeBingRedirect(match[1])
    if (realUrl && !seen.has(realUrl)) {
      seen.add(realUrl)
      hits.push({ url: realUrl, title: match[2].replace(/<[^>]+>/g, '').trim(), snippet: '' })
    }
  }
  return hits
}

/**
 * 解码 Bing 跳转链接（u=a1<base64url> 包裹真实 URL）。
 * @param href 结果页中的 href（可能含 &amp; 转义）
 * @returns 真实 http(s) URL；无法解码时返回 null
 */
function decodeBingRedirect(href: string): string | null {
  const unescaped = href.replace(/&amp;/g, '&')
  const match = /[?&]u=a1([A-Za-z0-9_-]+)/.exec(unescaped)
  if (!match) return null
  const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const url = Buffer.from(padded, 'base64').toString('utf8')
    return /^https?:\/\//.test(url) ? url : null
  } catch {
    return null
  }
}

/**
 * 可达性校验：HEAD 优先，被拒时 1 字节 GET 兜底；反爬/TLS 失败视为「未验证」而非「不可达」。
 * @param url 待校验 URL
 * @param signal 取消信号
 * @returns ok = 2xx/3xx；unverified = 其他情况
 */
async function checkUrlReachable(url: string, signal: AbortSignal): Promise<'ok' | 'unverified'> {
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    if (head.status >= 200 && head.status < 400) return 'ok'
    if (![400, 403, 405, 416, 501].includes(head.status)) return 'unverified'
  } catch {
    if (signal.aborted) return 'unverified'
  }
  try {
    const get = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    return get.status >= 200 && get.status < 400 ? 'ok' : 'unverified'
  } catch {
    return 'unverified'
  }
}
