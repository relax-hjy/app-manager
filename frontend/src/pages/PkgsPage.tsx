import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppCategory, AppInfo, FindStatus } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import SortableAppGrid from '../components/SortableAppGrid'
import InstallAgentCard from '../components/InstallAgentCard'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover'
import { Check, FileDown, FolderArchive, FolderOpen, Trash2, Briefcase, Code2, Wrench, Ellipsis, Grid3X3, Layers, X, Plus, ExternalLink, Search, Loader2 } from 'lucide-react'

const ALL_CAT = '__all__'

const CAT_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  '办公工具': Briefcase,
  '开发工具': Code2,
  '实用工具': Wrench,
  '其他工具': Ellipsis,
}

function catIcon(name: string) { return CAT_ICONS[name] || Layers }

const COLORS = [
  { text: 'text-stone-600', bg: 'bg-stone-600' },
  { text: 'text-emerald-700', bg: 'bg-emerald-700' },
  { text: 'text-amber-700', bg: 'bg-amber-700' },
  { text: 'text-rose-700', bg: 'bg-rose-700' },
  { text: 'text-violet-700', bg: 'bg-violet-700' },
  { text: 'text-teal-700', bg: 'bg-teal-700' },
]
function catColor(name: string) {
  let hash = 0
  for (const c of name) hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function PkgsPage() {
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [selectedCat, setSelectedCat] = useState(ALL_CAT)
  const [apps, setApps] = useState<AppInfo[]>([])
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [pkgType, setPkgType] = useState<'exe_pkg' | 'zip_pkg' | 'download_url'>('exe_pkg')
  // 下载链接查找：任务状态、候选下拉开关、点选写入中
  const [findStatus, setFindStatus] = useState<FindStatus | null>(null)
  const [showFindMenu, setShowFindMenu] = useState(false)
  const [applying, setApplying] = useState(false)
  const findPrevRef = useRef<Map<string, string>>(new Map())
  const { toast } = useToast()

  const loadCategories = useCallback(async () => {
    const res = await api.getCategories()
    if (res.success && res.data) setCategories(res.data)
  }, [])

  const loadApps = useCallback(async (cat: string) => {
    if (cat === ALL_CAT) {
      const res = await api.getCategories()
      if (res.success && res.data) {
        const all: AppInfo[] = []
        res.data.forEach(c => all.push(...c.apps))
        all.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        setApps(all)
      }
    } else if (cat) {
      const res = await api.getAppsByCategory(cat)
      if (res.success && res.data) setApps(res.data)
    } else {
      setApps([])
    }
  }, [])

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { loadApps(selectedCat) }, [selectedCat, loadApps])

  /** 拉取查找任务状态；检测 running→完成跳变并弹 toast，自动回填完成时刷新列表与选中应用 */
  const refreshFindStatus = useCallback(async () => {
    const res = await api.getFindStatus()
    if (!res.success || !res.data) return
    const prev = findPrevRef.current
    for (const task of res.data.tasks) {
      const before = prev.get(task.appId)
      if (before === 'running' && task.status !== 'running') {
        if (task.status === 'success') toast(task.url ? '已找到下载链接' : task.message)
        else if (task.status === 'failed') toast(task.message, 'error')
        else toast(task.message)
        if (task.url) {
          setSelectedApp(prevApp => prevApp && prevApp.id === task.appId ? { ...prevApp, download_url: task.url as string } : prevApp)
          loadApps(selectedCat)
        }
      }
      prev.set(task.appId, task.status)
    }
    setFindStatus(res.data)
  }, [loadApps, selectedCat, toast])

  // 首次挂载重连任务状态；有任务运行中时 1s 轮询
  useEffect(() => { void refreshFindStatus() }, [refreshFindStatus])
  const hasRunningFind = findStatus?.tasks.some(t => t.status === 'running') ?? false
  useEffect(() => {
    if (!hasRunningFind) return
    const timer = window.setInterval(() => { void refreshFindStatus() }, 1000)
    return () => window.clearInterval(timer)
  }, [hasRunningFind, refreshFindStatus])

  /** 打开/关闭找链接弹层；打开时若无进行中任务则启动查找（重新查找语义） */
  function handleFindOpenChange(open: boolean) {
    setShowFindMenu(open)
    if (open) void startFind()
  }

  /** 启动手动查找下载链接（已有进行中任务或写入中时跳过）；完成后以候选下拉展示 */
  async function startFind() {
    if (!selectedApp || isFinding || applying) return
    try {
      await api.startFindDownloadUrl(selectedApp.id)
      await refreshFindStatus()
    } catch (err) {
      toast(err instanceof Error ? err.message : '查找失败', 'error')
      setShowFindMenu(false)
    }
  }

  /** 取消进行中的查找任务 */
  async function handleCancelFind() {
    if (!selectedApp) return
    try {
      await api.cancelFindDownloadUrl(selectedApp.id)
      await refreshFindStatus()
    } catch (err) {
      toast(err instanceof Error ? err.message : '取消失败', 'error')
    }
  }

  /** 点选候选链接，写入 download_url（总是覆盖） */
  async function handleApplyCandidate(url: string) {
    if (!selectedApp) return
    setApplying(true)
    try {
      await api.applyFindCandidate(selectedApp.id, url)
      setSelectedApp({ ...selectedApp, download_url: url })
      setShowFindMenu(false)
      toast('已写入下载地址')
      loadApps(selectedCat)
    } catch (err) {
      toast(err instanceof Error ? err.message : '写入失败', 'error')
    } finally {
      setApplying(false)
    }
  }

  // 当前选中应用的查找任务（每应用最新一个）
  const selectedFindTask = selectedApp
    ? findStatus?.tasks.find(t => t.appId === selectedApp.id)
    : undefined
  const isFinding = selectedFindTask?.status === 'running'

  /** 拖拽排序：乐观更新本地顺序，失败回滚并提示 */
  const handleReorder = useCallback(async (newOrder: AppInfo[]) => {
    const prev = apps
    setApps(newOrder)
    try {
      const res = await api.reorderApps(newOrder.map(a => a.id))
      if (!res.success) throw new Error(res.message)
    } catch {
      setApps(prev)
      toast('排序保存失败', 'error')
    }
  }, [apps, toast])

  async function handleDeleteCat(name: string) {
    await api.deleteCategory(name)
    if (selectedCat === name) setSelectedCat(ALL_CAT)
    setSelectedApp(null)
    loadCategories()
  }

  async function handleSavePkg(type: 'exe_pkg' | 'zip_pkg' | 'download_url', value: string) {
    if (!selectedApp) return
    const updates: Record<string, string> = { [type]: value }
    // EXE 和 ZIP 二选一：设置一个时清除另一个（download_url 不参与互斥）
    if (type === 'exe_pkg' || type === 'zip_pkg') {
      const otherType = type === 'exe_pkg' ? 'zip_pkg' : 'exe_pkg'
      if (value) updates[otherType] = ''
    }
    await api.updateApp(selectedApp.id, updates)
    setShowForm(false)
    loadApps(selectedCat)
    const res = await api.getAppsByCategory(selectedCat)
    if (res.success && res.data) {
      const updated = res.data.find(a => a.id === selectedApp.id)
      if (updated) setSelectedApp(updated)
    }
  }

  async function handleLaunchPkg(app: AppInfo) {
    const filePath = app.exe_pkg || app.zip_pkg
    if (!filePath) {
      alert('未设置安装包')
      return
    }
    try {
      const res = await api.launchApp(filePath)
      if (res.success) {
        toast(res.message || '启动成功')
      } else {
        toast(res.message || '启动失败', 'error')
      }
    } catch {
      toast('启动失败，请检查文件路径', 'error')
    }
  }

  async function handleToggleInstall(app: AppInfo) {
    await api.updateApp(app.id, { is_installed: !app.is_installed } as any)
    loadApps(selectedCat)
    if (selectedApp?.id === app.id) {
      setSelectedApp({ ...selectedApp, is_installed: !app.is_installed })
    }
  }

  return (
    <div
      className="flex h-full"
      style={{
        containerType: 'inline-size',
        gap: '1cqw',
        '--side-w': 'max(14cqw, 148px)',
        '--card-track': '20cqw',
        '--card-gap': '1cqw',
      } as React.CSSProperties}
    >
      {/* Sidebar */}
      <aside className="flex-none flex flex-col rounded-xl border bg-card px-2 shadow-sm pb-3" style={{ width: 'var(--side-w)' }}>
        <div className="flex items-center justify-between px-2 pt-4 pb-3">
          <span className="text-base font-semibold">工具类目</span>
          <Button size="icon" variant="ghost" className="invisible">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-0.5">
        <button
          onClick={() => { setSelectedCat(ALL_CAT); setSelectedApp(null) }}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors
            ${ALL_CAT === selectedCat ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
        >
          <Grid3X3 className={`h-4 w-4 ${ALL_CAT === selectedCat ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="flex-1 truncate">全部工具</span>
          <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">
            {categories.reduce((s, c) => s + c.apps.length, 0)}
          </span>
          <span className="shrink-0 w-4" />
        </button>
        {categories.map(cat => {
          const Icon = catIcon(cat.name)
          return (
          <div
            key={cat.name}
            role="button"
            tabIndex={0}
            onClick={() => { setSelectedCat(cat.name); setSelectedApp(null) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCat(cat.name); setSelectedApp(null) } }}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors cursor-pointer select-none
              ${cat.name === selectedCat ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${catColor(cat.name).text}`} />
            <span className="flex-1 truncate">{cat.name}</span>
            <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">{cat.apps.length}</span>
            <button
              onClick={e => { e.stopPropagation(); if (confirm(`删除类目「${cat.name}」？`)) handleDeleteCat(cat.name) }}
              className="shrink-0 rounded p-0.5 opacity-0 hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )})}
        </div>
        <InstallAgentCard apps={apps} onFinished={() => { loadApps(selectedCat); loadCategories() }} />
      </aside>

      {/* Main */}
      <section className="flex-1 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-[1cqw] pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selectedCat === ALL_CAT ? '全部工具' : (selectedCat || '选择类目')}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({apps.length} 个应用)</span>
          </h2>
          <Button size="sm" className="invisible">
            <Plus className="h-4 w-4" /> 添加
          </Button>
        </div>

        {/* scrollbar-gutter: stable —— 纵向滚动条常驻占位，出现时不挤占卡片宽度导致横向滚动 */}
        <div className="flex-1 min-w-0 overflow-auto px-[1cqw] pb-4" style={{ scrollbarGutter: 'stable' }}>
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-5xl mb-3">📦</div>
              <p className="text-sm">该分类下暂无应用</p>
              <p className="text-xs mt-1">先在应用管理中添加应用，再返回这里设置安装包</p>
            </div>
          ) : (
            <SortableAppGrid apps={apps} onReorder={handleReorder} disabled={showForm}
              cols={selectedApp ? 3 : 4}
              renderItem={app => (
                <div
                  onClick={() => { setSelectedApp(app); setShowFindMenu(false) }}
                  className={`rounded-xl border bg-white cursor-pointer transition-[border-color,box-shadow] hover:shadow-md flex flex-col
                    ${selectedApp?.id === app.id ? 'border-[1a1a1a]/40 ring-1 ring-[1a1a1a]/20' : 'border-[#e5e6e8] hover:border-[#c5c7cc]'}`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4 pb-2">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden ${app.path && app.is_installed ? 'bg-white' : `${catColor(app.category).bg} text-white`}`}>
                      {app.path && app.is_installed ? (
                        <img
                          src={api.getAppIconUrl(app.id)}
                          alt={app.name}
                          className="h-full w-full object-contain"
                          onError={e => {
                            const img = e.target as HTMLImageElement
                            img.style.display = 'none'
                            const fallback = img.nextElementSibling as HTMLElement
                            if (fallback) { fallback.style.display = ''; fallback.textContent = app.name.charAt(0) }
                          }}
                        />
                      ) : null}
                      <span style={app.path && app.is_installed ? { display: 'none' } : undefined}>{app.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#1f2329] truncate" style={{ fontSize: 16 }}>
                        {app.name}
                        <span className="inline-block rounded border border-[#e5e6e8] px-1.5 py-px ml-2 font-normal align-middle" style={{ fontSize: 12, color: '#646a73' }}>{app.category}</span>
                      </div>
                      <div className="text-[#646a73] truncate" style={{ fontSize: 13 }}>
                        {app.version ? `v${app.version}` : ''}
                      </div>
                    </div>
                    <span
                      className="shrink-0 font-medium select-none"
                      style={{
                        fontSize: 12, borderRadius: 4, padding: '2px 8px',
                        color: app.is_installed ? '#16a34a' : '#dc2626',
                        background: app.is_installed ? '#f0fdf4' : '#fef2f2',
                      }}
                    >
                      {app.is_installed ? '已安装' : '未安装'}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="px-4 pb-1 flex-1">
                    <p className="text-[#646a73] leading-relaxed line-clamp-2" style={{ fontSize: 13 }}>
                      {app.description || '暂无描述'}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-wrap items-center gap-1 px-4 py-2.5 mt-1 border-t border-[#f0f0f0]">
                    <button
                      onClick={e => { e.stopPropagation(); setPkgType('exe_pkg'); setSelectedApp(app); setShowForm(true) }}
                      className="whitespace-nowrap text-[#646a73] hover:text-[1a1a1a] hover:bg-[#f2f3f5] rounded px-2.5 py-1 transition-colors select-none"
                      style={{ fontSize: 13 }}
                    >
                      设置EXE
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setPkgType('zip_pkg'); setSelectedApp(app); setShowForm(true) }}
                      className="whitespace-nowrap text-[#646a73] hover:text-[1a1a1a] hover:bg-[#f2f3f5] rounded px-2.5 py-1 transition-colors select-none"
                      style={{ fontSize: 13 }}
                    >
                      设置ZIP
                    </button>
                    <div className="flex-1" />
                    {app.download_url && (
                      <button
                        onClick={e => { e.stopPropagation(); window.open(app.download_url, '_blank') }}
                        className="whitespace-nowrap text-[#646a73] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] rounded px-2.5 py-1 transition-colors select-none"
                        style={{ fontSize: 13 }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 inline mr-0.5" />下载
                      </button>
                    )}
                    {(app.exe_pkg || app.zip_pkg) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleLaunchPkg(app) }}
                        className="whitespace-nowrap text-[#1a1a1a] hover:bg-[#f5f5f5] rounded px-2.5 py-1 transition-colors select-none font-medium"
                        style={{ fontSize: 13 }}
                      >
                        安装
                      </button>
                    )}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </section>

      {/* Detail Panel */}
      {selectedApp && (
        <aside className="flex-none flex flex-col rounded-xl border bg-card shadow-sm shrink-0" style={{ width: 'var(--card-track)', minWidth: 280 }}>
          {/* 可滚动内容区 */}
          <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden ${selectedApp.path && selectedApp.is_installed ? 'bg-white' : `${catColor(selectedApp.category).bg} text-white`}`}>
              {selectedApp.path && selectedApp.is_installed ? (
                <img
                  src={api.getAppIconUrl(selectedApp.id)}
                  alt={selectedApp.name}
                  className="h-full w-full object-contain"
                  onError={e => {
                    const img = e.target as HTMLImageElement
                    img.style.display = 'none'
                    const fallback = img.nextElementSibling as HTMLElement
                    if (fallback) { fallback.style.display = ''; fallback.textContent = selectedApp.name.charAt(0) }
                  }}
                />
              ) : null}
              <span style={selectedApp.path && selectedApp.is_installed ? { display: 'none' } : undefined}>{selectedApp.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#1f2329] truncate" style={{ fontSize: 16 }}>
                {selectedApp.name}
                <span className="inline-block rounded border border-[#e5e6e8] px-1.5 py-px ml-2 font-normal align-middle" style={{ fontSize: 12, color: '#646a73' }}>{selectedApp.category}</span>
              </div>
              <div className="text-[#646a73] truncate" style={{ fontSize: 13 }}>
                {selectedApp.version ? `v${selectedApp.version}` : ''}
              </div>
            </div>
            <span
              className="shrink-0 font-medium select-none"
              style={{
                fontSize: 12, borderRadius: 4, padding: '2px 8px',
                color: selectedApp.is_installed ? '#16a34a' : '#dc2626',
                background: selectedApp.is_installed ? '#f0fdf4' : '#fef2f2',
              }}
            >
              {selectedApp.is_installed ? '已安装' : '未安装'}
            </span>
            <button
              onClick={() => { setSelectedApp(null); setShowFindMenu(false) }}
              className="shrink-0 rounded p-1 text-[#646a73] hover:bg-[#f2f3f5] hover:text-[#1a1a1a] transition-colors"
              title="关闭详情"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* EXE */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><FileDown className="h-4 w-4" /> EXE 安装包</span>
              <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => { setPkgType('exe_pkg'); setShowForm(true) }}>
                {selectedApp.exe_pkg ? '更换' : '设置'}
              </Button>
            </div>
            {selectedApp.exe_pkg ? (
              <p className="font-mono text-xs text-muted-foreground break-all leading-relaxed">{selectedApp.exe_pkg}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">未添加</p>
            )}
          </div>

          {/* ZIP */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><FolderArchive className="h-4 w-4" /> ZIP 压缩包</span>
              <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => { setPkgType('zip_pkg'); setShowForm(true) }}>
                {selectedApp.zip_pkg ? '更换' : '设置'}
              </Button>
            </div>
            {selectedApp.zip_pkg ? (
              <p className="font-mono text-xs text-muted-foreground break-all leading-relaxed">{selectedApp.zip_pkg}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">未添加</p>
            )}
          </div>

          {/* Download URL */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><ExternalLink className="h-4 w-4" /> 下载地址</span>
              {findStatus && !findStatus.llmAvailable ? (
                <span className="text-xs text-muted-foreground/80 whitespace-nowrap">规则模式（未配置 API Key）</span>
              ) : (
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  {isFinding && (
                    <Button size="sm" variant="ghost" onClick={handleCancelFind}>取消</Button>
                  )}
                  <Popover open={showFindMenu} onOpenChange={handleFindOpenChange}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="ghost" disabled={applying}>
                        {isFinding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        {isFinding ? '查找中…' : selectedApp.download_url ? '重新查找' : 'AI 找链接'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      {isFinding ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#646a73]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在联网查找，请稍候…
                        </div>
                      ) : selectedFindTask?.status === 'success' && selectedFindTask.candidates?.length ? (
                        selectedFindTask.candidates.map((c, i) => (
                          <button
                            key={c.url}
                            onClick={() => handleApplyCandidate(c.url)}
                            disabled={applying}
                            className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[#f2f3f5] disabled:opacity-50"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="shrink-0 font-medium text-[#646a73]" style={{ fontSize: 12 }}>#{i + 1}</span>
                              <span className="flex-1 min-w-0 truncate text-xs text-blue-600">{c.url}</span>
                              {c.isDirect && (
                                <span className="shrink-0 rounded border border-[#e5e6e8] px-1 py-px" style={{ fontSize: 11, color: '#16a34a' }}>直链</span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[#646a73]" style={{ fontSize: 11 }}>{c.note}</p>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-[#646a73]">
                          {selectedFindTask?.message || '未找到候选链接'}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Button size="sm" variant="ghost" onClick={() => { setPkgType('download_url'); setShowForm(true) }}>
                    {selectedApp.download_url ? '更换' : '设置'}
                  </Button>
                </div>
              )}
            </div>
            {selectedApp.download_url ? (
              <a href={selectedApp.download_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline break-all leading-relaxed">
                {selectedApp.download_url}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">未添加</p>
            )}
          </div>

          {selectedApp.path && (
            <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">应用路径</span>
              <p className="font-mono text-xs break-all">{selectedApp.path}</p>
            </div>
          )}
          </div>

          {/* 固定底部操作区 */}
          <div className="shrink-0 border-t border-[#f0f0f0] p-5 pt-3">
            <button
              onClick={() => handleToggleInstall(selectedApp)}
              className="w-full py-2 rounded-lg font-medium text-sm transition-colors select-none"
              style={{
                color: selectedApp.is_installed ? '#16a34a' : '#dc2626',
                background: selectedApp.is_installed ? '#f0fdf4' : '#fef2f2',
              }}
            >
              <Check className="h-4 w-4 inline mr-1" />
              {selectedApp.is_installed ? '已安装（点击切换）' : '未安装（点击切换）'}
            </button>
          </div>
        </aside>
      )}

      {/* Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pkgType === 'exe_pkg' ? '设置 EXE 安装包' : pkgType === 'zip_pkg' ? '设置 ZIP 压缩包' : '设置下载地址'}</DialogTitle>
          </DialogHeader>
          <PkgForm
            type={pkgType}
            currentValue={selectedApp?.[pkgType] || ''}
            appName={selectedApp?.name || ''}
            onClose={() => setShowForm(false)}
            onSave={(value) => handleSavePkg(pkgType, value)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PkgForm({ type, currentValue, appName, onClose, onSave }: {
  type: 'exe_pkg' | 'zip_pkg' | 'download_url'; currentValue: string; appName: string
  onClose: () => void; onSave: (value: string) => void
}) {
  const [value, setValue] = useState(currentValue)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleBrowse() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setValue(file.name)
    setError('')
    // 重置 input，允许重复选择同一文件
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // 下载地址：直接保存 URL
    if (isDownloadUrl) {
      const url = value.trim()
      if (!url) {
        setError('请输入下载地址')
        return
      }
      onSave(url)
      return
    }

    // 优先使用浏览选择的文件进行上传
    if (selectedFile) {
      setCopying(true)
      try {
        const res = await api.uploadPkg(selectedFile, appName)
        if (res.success && res.data) {
          onSave(res.data.path)
        } else {
          setError(res.message || '上传安装包失败')
        }
      } catch (err: any) {
        setError(err?.message || '上传安装包失败')
      } finally {
        setCopying(false)
      }
      return
    }

    // 否则使用手动输入的路径
    const src = value.trim()
    if (!src) {
      setError('请输入文件路径或点击浏览选择文件')
      return
    }
    setCopying(true)
    try {
      const res = await api.copyPkg(src, appName)
      if (res.success && res.data) {
        onSave(res.data.path)
      } else {
        setError(res.message || '复制安装包失败')
      }
    } catch (err: any) {
      setError(err?.message || '复制安装包失败，请检查文件路径是否正确')
    } finally {
      setCopying(false)
    }
  }

  const isDownloadUrl = type === 'download_url'
  const accept = type === 'exe_pkg' ? '.exe' : '.zip'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      <p className="text-sm text-muted-foreground">
        为 <strong>{appName}</strong> 设置 {isDownloadUrl ? '下载地址' : type === 'exe_pkg' ? 'EXE 安装包' : 'ZIP 安装包'}
      </p>
      {isDownloadUrl ? (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">下载地址</label>
          <Input value={value} onChange={e => { setValue(e.target.value); setError('') }}
            placeholder="https://example.com/download/app-setup.exe" />
          <p className="text-xs text-muted-foreground">
            填写安装包的下载链接（HTTP/HTTPS）
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{type === 'exe_pkg' ? 'EXE 安装包' : 'ZIP 压缩包'}</label>
          <div className="flex gap-2">
            <Input value={value} onChange={e => { setValue(e.target.value); setSelectedFile(null); setError('') }} className="flex-1"
              placeholder={type === 'exe_pkg' ? '选择 .exe 文件或粘贴完整路径' : '选择 .zip 文件或粘贴完整路径'} />
            <Button type="button" variant="outline" size="icon" onClick={handleBrowse} title="浏览并上传文件">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            点击浏览按钮选择文件将直接上传；也可手动粘贴完整路径（如 <code>D:\Downloads\setup.exe</code>）
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit" disabled={copying}>{copying ? '复制中...' : '保存'}</Button>
      </div>
      {currentValue && (
        <Button type="button" variant="destructive" className="w-full" onClick={() => onSave('')}>
          <Trash2 className="h-4 w-4" /> {isDownloadUrl ? '移除下载地址' : '移除安装包'}
        </Button>
      )}
    </form>
  )
}
