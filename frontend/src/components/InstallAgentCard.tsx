import { useState, useEffect, useRef } from 'react'
import type { AppInfo, AgentStatus, InstallJobItem } from '../types'
import * as api from '../api'
import { Bot, ChevronDown, ChevronUp, Loader2, Play, Square } from 'lucide-react'

const STATUS_LABEL: Record<InstallJobItem['status'], string> = {
  pending: '排队',
  running: '安装中',
  success: '成功',
  failed: '失败',
  manual: '需手动',
  skipped: '跳过',
}

const STATUS_COLOR: Record<InstallJobItem['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-warning',
  success: 'text-success',
  failed: 'text-danger',
  manual: 'text-violet-400',
  skipped: 'text-muted-foreground',
}

/**
 * 自动安装智能体卡片（侧栏底部）：
 * 显示待安装数量，一键批量安装（LLM 决策 + 规则兜底），任务进度与取消。
 */
export default function InstallAgentCard({ apps, onFinished }: { apps: AppInfo[]; onFinished: () => void }) {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [starting, setStarting] = useState(false)
  const finishedRef = useRef(false)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const pending = apps.filter(a => (a.exe_pkg || a.zip_pkg) && !a.is_installed)
  const job = status?.job ?? null
  const running = job?.status === 'running'
  const doneCount = job ? job.items.filter(i => i.status !== 'pending' && i.status !== 'running').length : 0
  const successCount = job ? job.items.filter(i => i.status === 'success').length : 0
  const failCount = job ? job.items.filter(i => i.status === 'failed').length : 0
  const manualCount = job ? job.items.filter(i => i.status === 'manual').length : 0

  // 挂载时读一次状态（刷新页面后能接上进行中的任务）
  useEffect(() => {
    let cancelled = false
    api.getAgentStatus()
      .then(res => { if (!cancelled && res.success && res.data) setStatus(res.data) })
      .catch(() => { /* 忽略瞬时错误 */ })
    return () => { cancelled = true }
  }, [])

  // 任务运行中每秒轮询；结束后通知父组件刷新列表
  useEffect(() => {
    if (!running) {
      if (job && job.status !== 'running' && job.items.length > 0 && !finishedRef.current) {
        finishedRef.current = true
        onFinishedRef.current()
      }
      return
    }
    finishedRef.current = false
    const timer = window.setInterval(async () => {
      try {
        const res = await api.getAgentStatus()
        if (res.success && res.data) setStatus(res.data)
      } catch { /* 忽略瞬时错误 */ }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, job])

  /** 启动一键安装（全部待安装应用） */
  async function handleStart() {
    setStarting(true)
    try {
      const res = await api.startInstall()
      if (res.success) {
        finishedRef.current = false
        setExpanded(true)
        const s = await api.getAgentStatus()
        if (s.success && s.data) setStatus(s.data)
      }
    } finally {
      setStarting(false)
    }
  }

  /** 请求取消：应用间生效，并终止当前安装子进程 */
  async function handleCancel() {
    await api.cancelInstall()
  }

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-surface p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Bot className="h-4 w-4 text-brand" />
        <span className="text-sm font-medium">自动安装智能体</span>
      </div>

      {status && !status.llmAvailable && !running && (
        <p className="text-xs text-muted-foreground/80">规则模式（未配置 API Key）</p>
      )}

      {running ? (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>安装中 {doneCount}/{job!.items.length}</span>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${job!.items.length ? (doneCount / job!.items.length) * 100 : 0}%` }}
            />
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            任务列表
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <ul className="max-h-40 space-y-1 overflow-auto pr-1">
              {job!.items.map(item => (
                <li key={item.appId} className="text-xs leading-snug">
                  <span className={`font-medium ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                  <span className="ml-1.5 text-foreground">{item.name}</span>
                  {item.message && <p className="truncate text-[11px] text-muted-foreground" title={item.message}>{item.message}</p>}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={handleCancel}
            disabled={job!.cancelRequested}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-border bg-card py-1 text-xs text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
          >
            <Square className="h-3 w-3" />
            {job!.cancelRequested ? '取消中…' : '取消'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {pending.length > 0 ? `${pending.length} 个应用待安装` : '没有待安装的应用'}
          </p>
          <button
            onClick={handleStart}
            disabled={pending.length === 0 || starting}
            className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            一键安装
          </button>
          {job && job.status !== 'running' && (
            <>
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                上次结果（成功 {successCount} · 需手动 {manualCount} · 失败 {failCount}）
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <ul className="max-h-40 space-y-1 overflow-auto pr-1">
                  {job.items.map(item => (
                    <li key={item.appId} className="text-xs leading-snug">
                      <span className={`font-medium ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                      <span className="ml-1.5 text-foreground">{item.name}</span>
                      {item.message && <p className="truncate text-[11px] text-muted-foreground" title={item.message}>{item.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
