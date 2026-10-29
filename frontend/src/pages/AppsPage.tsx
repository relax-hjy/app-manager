import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { AppCategory, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import SortableAppGrid from '../components/SortableAppGrid'
import CategorySidebar from '../components/CategorySidebar'
import { StatusChip } from '../components/ui/status-chip'
import { Panel, PanelBody, PanelFooter } from '../components/ui/panel'
import { AppCardHead } from '../components/app-bits'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '../components/ui/select'
import { Briefcase, Code2, Edit2, Ellipsis, FolderOpen, Grid3X3, Layers, Play, Plus, Trash2, Wrench, X } from 'lucide-react'

const ALL_CAT = '__all__'

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '办公工具': Briefcase,
  '开发工具': Code2,
  '实用工具': Wrench,
  '其他工具': Ellipsis,
}

function catIcon(name: string) {
  return CAT_ICONS[name] || Layers
}

/** 页面空状态：虚线框 + 图标瓦片 + 双行文案 */
function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 text-brand [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </div>
      <p className="text-sm">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

export default function AppsPage() {
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [selectedCat, setSelectedCat] = useState(ALL_CAT)
  const [apps, setApps] = useState<AppInfo[]>([])
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingApp, setEditingApp] = useState<AppInfo | null>(null)
  const [showCatDialog, setShowCatDialog] = useState(false)
  const [catName, setCatName] = useState('')
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

  async function handleDeleteApp(id: string) {
    await api.deleteApp(id)
    setSelectedApp(null)
    loadApps(selectedCat)
    loadCategories()
  }

  async function handleDeleteCat(name: string) {
    await api.deleteCategory(name)
    if (selectedCat === name) setSelectedCat(ALL_CAT)
    setSelectedApp(null)
    loadCategories()
  }

  /** 新增类目（对话框表单提交） */
  async function handleAddCatSubmit() {
    const name = catName.trim()
    if (!name) return
    const res = await api.addCategory(name)
    if (res.success) {
      setSelectedCat(name)
      setShowCatDialog(false)
      setCatName('')
      loadCategories()
    } else {
      toast(res.message || '新增类目失败', 'error')
    }
  }

  async function handleSubmitApp(data: Partial<AppInfo> & { name: string; category: string }) {
    try {
      if (editingApp) {
        const res = await api.updateApp(editingApp.id, data)
        if (!res.success) { toast(res.message || '更新失败', 'error'); return }
        toast('更新成功')
      } else {
        data.category = selectedCat
        const res = await api.addApp(data)
        if (!res.success) { toast(res.message || '添加失败', 'error'); return }
        toast(res.data?.findStarted ? '添加成功，正在后台查找下载链接' : '添加成功')
      }
      setShowForm(false)
      setEditingApp(null)
      loadApps(selectedCat)
      loadCategories()
    } catch {
      toast('操作失败，请稍后重试', 'error')
    }
  }

  async function handleLaunch(filePath: string) {
    try {
      const res = await api.launchApp(filePath)
      if (res.success) {
        toast(res.message || '启动成功')
      } else {
        toast(res.message || '启动失败', 'error')
      }
    } catch {
      toast('启动失败，请检查路径是否有效', 'error')
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
        iconFor={name => catIcon(name)}
        onSelect={key => { setSelectedCat(key); setSelectedApp(null) }}
        onAdd={() => setShowCatDialog(true)}
        onDeleteCat={handleDeleteCat}
      />

      {/* Main content */}
      <section className="flex-1 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-[1cqw] pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selectedCat === ALL_CAT ? '全部工具' : (selectedCat || '选择类目')}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({apps.length})</span>
          </h2>
          <Button size="sm" onClick={() => { setEditingApp(null); setShowForm(true) }} disabled={!selectedCat || selectedCat === ALL_CAT}>
            <Plus className="h-4 w-4" /> 添加应用
          </Button>
        </div>

        {/* scrollbar-gutter: stable —— 纵向滚动条常驻占位，出现时不挤占卡片宽度导致横向滚动 */}
        <div className="flex-1 min-w-0 overflow-auto px-[1cqw] pb-4" style={{ scrollbarGutter: 'stable' }}>
          {apps.length === 0 ? (
            <EmptyState icon={<Grid3X3 />} title="暂无应用，点击上方按钮添加" hint="选中左侧具体类目后即可添加应用" />
          ) : (
            <SortableAppGrid apps={apps} onReorder={handleReorder} disabled={showForm}
              renderItem={app => (
                <div
                  onClick={() => setSelectedApp(app)}
                  className={`group/card flex cursor-pointer flex-col rounded-xl border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-none dark:hover:shadow-[0_8px_24px_-8px_oklch(0.05_0.02_262/0.6)]
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

                  {/* Footer：编辑降为图标，启动作为卡片主操作（品牌色文字按钮） */}
                  <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-border/60 px-2.5 py-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="编辑应用" aria-label="编辑应用"
                      onClick={e => { e.stopPropagation(); setEditingApp(app); setShowForm(true) }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex-1" />
                    {app.path && app.is_installed && (
                      <Button variant="ghost" size="sm"
                        className="h-8 gap-1.5 px-2.5 text-xs font-semibold text-brand hover:bg-brand-soft hover:text-brand"
                        onClick={e => { e.stopPropagation(); handleLaunch(app.path!) }}>
                        <Play className="h-3.5 w-3.5" /> 启动
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
                  onClick={() => setSelectedApp(null)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="关闭详情"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            />

            <div className="space-y-3 text-sm">
              <Field label="路径" value={selectedApp.path || '—'} mono />
              <Field label="描述" value={selectedApp.description || '—'} />
              <Field label="EXE 包" value={selectedApp.exe_pkg || '—'} mono />
              <Field label="ZIP 包" value={selectedApp.zip_pkg || '—'} mono />
            </div>

          </PanelBody>

          {/* 固定底部操作区 */}
          <PanelFooter>
            {selectedApp.path && selectedApp.is_installed && (
              <Button size="sm" className="w-full" onClick={() => handleLaunch(selectedApp.path!)}>
                <Play className="h-3.5 w-3.5" /> 启动应用
              </Button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingApp(selectedApp); setShowForm(true) }}>
                <Edit2 className="h-3.5 w-3.5" /> 编辑
              </Button>
              {/* 删除是破坏性操作：描边危险色，不做实心红块抢占面板底栏 */}
              <Button size="sm" variant="outline" className="flex-1 border-danger/35 text-danger hover:border-danger/60 hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm('删除此应用？')) handleDeleteApp(selectedApp.id) }}>
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingApp(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingApp ? '编辑应用' : '添加应用'}</DialogTitle>
          </DialogHeader>
          <AppForm
            app={editingApp}
            category={selectedCat}
            categories={categories.map(c => c.name)}
            onClose={() => { setShowForm(false); setEditingApp(null) }}
            onSubmit={handleSubmitApp}
          />
        </DialogContent>
      </Dialog>

      {/* 新增类目 Dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增类目</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleAddCatSubmit() }} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">类目名称 *</label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="如 设计工具" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCatDialog(false)}>取消</Button>
              <Button type="submit" disabled={!catName.trim()}>添加</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</div>
    </div>
  )
}

function AppForm({ app, category, categories, onClose, onSubmit }: {
  app: AppInfo | null; category: string; categories: string[]; onClose: () => void
  onSubmit: (data: Partial<AppInfo> & { name: string; category: string }) => void
}) {
  const [name, setName] = useState(app?.name || '')
  const [selectedCat, setSelectedCat] = useState(app?.category || category || '')
  const [version, setVersion] = useState(app?.version || '')
  const [path, setPath] = useState(app?.path || '')
  const [description, setDescription] = useState(app?.description || '')
  const [installDir, setInstallDir] = useState('')
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')

  useEffect(() => {
    api.getConfig().then(res => {
      if (res.success && res.data?.install_directory) {
        setInstallDir(res.data.install_directory)
      }
    })
  }, [])

  useEffect(() => {
    // 新增应用时，名称变化自动填充 path；用户手动修改后不再覆盖
    if (!app && name.trim() && installDir) {
      const autoPath = `${installDir}\\${name.trim()}\\${name.trim()}.exe`
      setPath(autoPath)
    }
  }, [name, installDir])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !selectedCat) return
    onSubmit({ name: name.trim(), version: version.trim(), path: path.trim(), description: description.trim(), category: selectedCat })
  }

  /** 打开 Windows 原生文件选择窗，选中后回填路径（取消则不改动） */
  async function handleBrowse() {
    setPickError('')
    setPicking(true)
    try {
      const res = await api.pickFile(path.trim())
      if (res.success && res.data?.path) setPath(res.data.path)
    } catch (e) {
      setPickError(e instanceof Error ? e.message : '打开文件选择窗失败')
    } finally {
      setPicking(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">名称 *</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="应用名称" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">类目 *</label>
        <Select value={selectedCat} onValueChange={setSelectedCat}>
          <SelectTrigger><SelectValue placeholder="选择类目" /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">版本</label>
        <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="如 1.0.0" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">路径</label>
        <div className="flex gap-2">
          <Input value={path} onChange={e => { setPath(e.target.value); setPickError('') }} placeholder="选择 .exe 文件或粘贴完整路径" className="flex-1" />
          <Button type="button" variant="outline" size="icon" onClick={handleBrowse} disabled={picking} title="浏览选择文件">
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          点击浏览按钮选择文件；也可手动粘贴完整路径（如 <code>D:\Softwares\VSCode\Code.exe</code>）
        </p>
        {pickError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{pickError}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">描述</label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="应用功能简介" rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-6">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  )
}
