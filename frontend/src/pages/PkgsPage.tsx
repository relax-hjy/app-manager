import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppCategory, AppInfo, FindStatus } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import SortableAppGrid from '../components/SortableAppGrid'
import InstallAgentCard from '../components/InstallAgentCard'
import CategorySidebar from '../components/CategorySidebar'
import { StatusChip } from '../components/ui/status-chip'
import { Panel, PanelBody, PanelFooter } from '../components/ui/panel'
import { AppCardHead } from '../components/app-bits'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover'
import { Briefcase, Check, Code2, Ellipsis, ExternalLink, FileDown, FolderArchive, FolderOpen, Grid3X3, Layers, Loader2, PackageSearch, Plus, Search, Trash2, Wrench, X } from 'lucide-react'

const ALL_CAT = '__all__'

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '办公工具': Briefcase,
  '开发工具': Code2,
  '实用工具': Wrench,
  '其他工具': Ellipsis,
}

/** 类目图标：已知类目专用图标，其余按名称哈希取通用瓦片 */
function catIcon(name: string): React.ComponentType<{ className?: string }> {
  if (name === '其他') return Ellipsis
  return CAT_ICONS[name] || Layers
}

/** 安装包状态入口：未配置显示虚线加号，已配置显示成功色勾选；点击进入设置 */
function PkgChip({ configured, label, title, onClick }: {
  configured: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors ${
        configured
          ? 'border-success/30 bg-success-soft text-success hover:border-success/60'
          : 'border-dashed border-border text-muted-foreground hover:border-brand/40 hover:bg-accent hover:text-foreground'
      }`}
    >
      {configured ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      {label}
    </button>
  )
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

  /** 当前选中应用的查找任务：运行中任务优先（进度/取消），否则已持久化结果，否则内存任务（失败提示等） */
  const memoryFindTask = selectedApp
    ? findStatus?.tasks.find(t => t.appId === selectedApp.id)
    : undefined
  const savedFindTask = selectedApp
    ? findStatus?.results?.find(t => t.appId === selectedApp.id)
    : undefined
  const selectedFindTask = memoryFindTask?.status === 'running' ? memoryFindTask : (savedFindTask ?? memoryFindTask)
  const isFinding = memoryFindTask?.status === 'running'

  /** 打开/关闭找链接弹层；打开时若无可展示的候选结果则启动查找（已有结果直接展示，不重复搜索） */
  function handleFindOpenChange(open: boolean) {
    setShowFindMenu(open)
    if (open && !selectedFindTask?.candidates?.length) void startFind()
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
      toast('未设置安装包', 'error')
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
    await api.updateApp(app.id, { is_installed: !app.is_installed } as Partial<AppInfo>)
    loadApps(selectedCat)
    if (selectedApp?.id === app.id) {
      setSelectedApp({ ...selectedApp, is_installed: !app.is_installed })
    }
  }

  return (
    <div
      className="app-shell flex h-full"
      data-panel-open={selectedApp ? 'true' : undefined}
      style={{
        gap: 'var(--card-gap)',
        '--side-w': 'clamp(176px, 15cqw, 240px)',
        '--card-gap': 'clamp(10px, 1.2cqw, 18px)',
      } as React.CSSProperties}
    >
      <CategorySidebar
        title="工具类目"
        categories={categories}
        selected={selectedCat}
        allCount={categories.reduce((s, c) => s + c.apps.length, 0)}
        allIcon={<Grid3X3 className="h-4 w-4" />}
        iconFor={catIcon}
        onSelect={key => { setSelectedCat(key); setSelectedApp(null); setShowFindMenu(false) }}
        footer={<InstallAgentCard apps={apps} onFinished={() => { loadApps(selectedCat); loadCategories() }} />}
      />

      {/* Main */}
      <section className="flex-1 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-[1cqw] pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selectedCat === ALL_CAT ? '全部工具' : (selectedCat || '选择类目')}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({apps.length} 个应用)</span>
          </h2>
        </div>

        {/* scrollbar-gutter: stable —— 纵向滚动条常驻占位，出现时不挤占卡片宽度导致横向滚动 */}
        <div className="flex-1 min-w-0 overflow-auto px-[1cqw] pb-4" style={{ scrollbarGutter: 'stable' }}>
          {apps.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 text-brand">
                <PackageSearch className="h-6 w-6" />
              </div>
              <p className="text-sm">该分类下暂无应用</p>
              <p className="text-xs text-muted-foreground/70">先在应用管理中添加应用，再返回这里设置安装包</p>
            </div>
          ) : (
            <SortableAppGrid apps={apps} onReorder={handleReorder} disabled={showForm}
              renderItem={app => (
                <div
                  onClick={() => { setSelectedApp(app); setShowFindMenu(false) }}
                  className={`flex cursor-pointer flex-col rounded-xl border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-none dark:hover:shadow-[0_8px_24px_-8px_oklch(0.05_0.02_262/0.6)]
                    ${selectedApp?.id === app.id ? 'border-brand/60 ring-2 ring-brand/35' : 'border-border hover:border-brand/55'}`}
                >
                  <AppCardHead
                    app={app}
                    iconUrl={api.getAppIconUrl(app.id)}
                    status={<StatusChip installed={app.is_installed} />}
                  />

                  {/* Body：无描述只留一行高留白，避免满屏「暂无描述」噪音 */}
                  <div className="min-h-5 flex-1 px-4 pb-1">
                    {app.description && (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                        {app.description}
                      </p>
                    )}
                  </div>

                  {/* Footer：EXE/ZIP 状态即配置入口（虚线+加号=未配置，实心勾=已配置），右侧主操作安装 */}
                  <div className="mt-1 flex items-center gap-1.5 border-t border-border/60 px-2.5 py-2">
                    <PkgChip configured={!!app.exe_pkg} label="EXE"
                      title={app.exe_pkg ? '更换 EXE 安装包' : '设置 EXE 安装包'}
                      onClick={() => { setPkgType('exe_pkg'); setSelectedApp(app); setShowForm(true) }} />
                    <PkgChip configured={!!app.zip_pkg} label="ZIP"
                      title={app.zip_pkg ? '更换 ZIP 安装包' : '设置 ZIP 安装包'}
                      onClick={() => { setPkgType('zip_pkg'); setSelectedApp(app); setShowForm(true) }} />
                    {app.download_url && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="打开下载链接"
                        onClick={e => { e.stopPropagation(); window.open(app.download_url, '_blank') }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div className="flex-1" />
                    {(app.exe_pkg || app.zip_pkg) && (
                      <Button variant="ghost" size="sm"
                        className="h-7 gap-1.5 px-2 text-xs font-semibold text-brand hover:bg-brand-soft hover:text-brand"
                        onClick={e => { e.stopPropagation(); handleLaunchPkg(app) }}>
                        安装
                      </Button>
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
        <Panel className="w-[var(--panel-w)]">
          <PanelBody>
            <AppCardHead
              app={selectedApp}
              iconUrl={api.getAppIconUrl(selectedApp.id)}
              status={<StatusChip installed={selectedApp.is_installed} />}
              className="p-0"
              trailing={
                <button
                  onClick={() => { setSelectedApp(null); setShowFindMenu(false) }}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="关闭详情"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            />

            {/* EXE */}
            <div className="rounded-lg bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><FileDown className="h-4 w-4 text-brand" /> EXE 安装包</span>
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
            <div className="rounded-lg bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><FolderArchive className="h-4 w-4 text-brand" /> ZIP 压缩包</span>
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
            <div className="rounded-lg bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <span className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"><ExternalLink className="h-4 w-4 text-brand" /> 下载地址</span>
                {/* 规则模式下只隐藏「AI 找链接」，手动设置入口必须保留（无 API Key 也要能填 URL） */}
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  {isFinding && (
                    <Button size="sm" variant="ghost" onClick={handleCancelFind}>取消</Button>
                  )}
                  {findStatus?.llmAvailable && (
                    <Popover open={showFindMenu} onOpenChange={handleFindOpenChange}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost" disabled={applying}>
                          {isFinding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          {isFinding ? '查找中…' : selectedFindTask?.candidates?.length ? '查看候选' : 'AI 找链接'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent>
                        {isFinding ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在联网查找，请稍候…
                          </div>
                        ) : selectedFindTask?.status === 'success' && selectedFindTask.candidates?.length ? (
                          selectedFindTask.candidates.map((c, i) => (
                            <button
                              key={c.url}
                              onClick={() => handleApplyCandidate(c.url)}
                              disabled={applying}
                              className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">#{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-xs text-link">{c.url}</span>
                                {c.isDirect && (
                                  <span className="shrink-0 rounded bg-success-soft px-1 py-px text-[11px] font-medium text-success">直链</span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.note}</p>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            {selectedFindTask?.message || '未找到候选链接'}
                          </div>
                        )}
                        {!isFinding && (
                          <div className="border-t border-border/60 px-2 py-1.5">
                            <button
                              onClick={() => void startFind()}
                              disabled={applying}
                              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                            >
                              <Search className="h-3.5 w-3.5" /> 重新查找
                            </button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setPkgType('download_url'); setShowForm(true) }}>
                    {selectedApp.download_url ? '更换' : '设置'}
                  </Button>
                </div>
              </div>
              {selectedApp.download_url ? (
                <a href={selectedApp.download_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-link hover:underline break-all leading-relaxed">
                  {selectedApp.download_url}
                </a>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">未添加</p>
              )}
            </div>

            {selectedApp.path && (
              <div className="rounded-lg bg-surface p-3 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">应用路径</span>
                <p className="font-mono text-xs break-all">{selectedApp.path}</p>
              </div>
            )}
          </PanelBody>

          {/* 固定底部操作区 */}
          <PanelFooter>
            <button
              onClick={() => handleToggleInstall(selectedApp)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors select-none ${
                selectedApp.is_installed
                  ? 'bg-success-soft text-success hover:brightness-95'
                  : 'bg-danger-soft text-danger hover:brightness-95'
              }`}
            >
              <Check className="h-4 w-4" />
              {selectedApp.is_installed ? '已安装（点击切换）' : '未安装（点击切换）'}
            </button>
          </PanelFooter>
        </Panel>
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
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传安装包失败')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制安装包失败，请检查文件路径是否正确')
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
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {/* 移除是破坏性次要操作：收进同一行左侧的幽灵按钮，避免整条红底横杠压过「保存」 */}
      <div className="flex items-center gap-2 pt-2">
        {currentValue && (
          <Button type="button" variant="ghost" size="sm"
            className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => onSave('')}>
            <Trash2 className="h-3.5 w-3.5" /> {isDownloadUrl ? '移除下载地址' : '移除安装包'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit" disabled={copying}>{copying ? '复制中...' : '保存'}</Button>
      </div>
    </form>
  )
}
