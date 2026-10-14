import { Router, Request, Response } from 'express'
import { startInstallJob, getJob, cancelJob } from '../agent/installer'
import { startFindTask, getFindTasks, cancelFindTask, applyCandidate, getSavedFindResults } from '../agent/find-download'
import { isLlmAvailable } from '../agent/llm'
import type { ApiResponse } from '../types'

const router = Router()

/**
 * 启动批量安装（fire-and-forget，立即返回 jobId）。
 * body: { appIds?: string[] } — 不传则安装全部「有安装包且未安装」的应用。
 */
router.post('/install', async (req: Request, res: Response) => {
  const { appIds } = req.body as { appIds?: string[] }
  if (appIds !== undefined && (!Array.isArray(appIds) || appIds.some(i => typeof i !== 'string'))) {
    res.status(400).json({ success: false, message: 'appIds 必须是字符串数组' })
    return
  }
  const job = await startInstallJob(appIds)
  if (!job) {
    res.status(409).json({ success: false, message: '已有安装任务在进行中' })
    return
  }
  res.json({ success: true, data: { jobId: job.id } } as ApiResponse)
})

/** 任务状态（前端 1s 轮询）：{ job, llmAvailable } */
router.get('/status', async (_req: Request, res: Response) => {
  const llm = await isLlmAvailable()
  res.json({ success: true, data: { job: getJob(), llmAvailable: llm } } as ApiResponse)
})

/** 请求取消：应用间生效，并终止当前安装子进程 */
router.post('/cancel', async (_req: Request, res: Response) => {
  cancelJob()
  res.json({ success: true, message: '已请求取消' } as ApiResponse)
})

/**
 * 手动查找应用下载链接（fire-and-forget，立即返回任务）。
 * body: { appId: string } — 任务完成后 candidates 按可靠性降序，供前端下拉选择。
 */
router.post('/find-download', async (req: Request, res: Response) => {
  const { appId } = req.body as { appId?: string }
  if (!appId || typeof appId !== 'string') {
    res.status(400).json({ success: false, message: 'appId 无效' })
    return
  }
  if (!(await isLlmAvailable())) {
    res.status(400).json({ success: false, message: '规则模式（未配置 API Key），无法联网查找' })
    return
  }
  const running = getFindTasks().find(t => t.appId === appId && t.status === 'running')
  if (running) {
    res.status(409).json({ success: false, message: '该应用正在查找下载链接' })
    return
  }
  const task = await startFindTask(appId, { auto: false })
  if (!task) {
    res.status(404).json({ success: false, message: '应用不存在' })
    return
  }
  res.json({ success: true, data: { task } } as ApiResponse)
})

/** 查找任务状态（前端轮询）：{ tasks, results（已持久化结果）, llmAvailable } */
router.get('/find-status', async (_req: Request, res: Response) => {
  const llm = await isLlmAvailable()
  res.json({ success: true, data: { tasks: getFindTasks(), results: await getSavedFindResults(), llmAvailable: llm } } as ApiResponse)
})

/**
 * 将点选的候选链接写入 download_url（总是覆盖）。
 * body: { appId: string, url: string }
 */
router.post('/find-apply', async (req: Request, res: Response) => {
  const { appId, url } = req.body as { appId?: string; url?: string }
  if (!appId || typeof appId !== 'string' || !url || typeof url !== 'string') {
    res.status(400).json({ success: false, message: 'appId / url 无效' })
    return
  }
  const ok = await applyCandidate(appId, url)
  if (!ok) {
    res.status(404).json({ success: false, message: '应用不存在' })
    return
  }
  res.json({ success: true, message: '已写入下载地址' } as ApiResponse)
})

/** 请求取消查找任务：中止搜索与 LLM 请求（幂等） */
router.post('/find-cancel', async (req: Request, res: Response) => {
  const { appId } = req.body as { appId?: string }
  if (!appId || typeof appId !== 'string') {
    res.status(400).json({ success: false, message: 'appId 无效' })
    return
  }
  cancelFindTask(appId)
  res.json({ success: true, message: '已请求取消' } as ApiResponse)
})

export default router
