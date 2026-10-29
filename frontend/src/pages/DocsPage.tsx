import { useState, useEffect, useCallback, useMemo } from 'react'
import type { DocInfo, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Panel, PanelBody, PanelFooter } from '../components/ui/panel'
import { paletteOf, TYPE_TILE } from '../lib/palette'
import { cn } from '../lib/utils'
import { Plus, Trash2, Search, FileText, Edit2, ExternalLink, BookOpen, Wrench, Lightbulb, Ellipsis, Grid3X3, FolderSearch, CheckSquare, Square, X } from 'lucide-react'

const DOC_TYPES = ['知识总结', '工具指南', '参考文档', '工作日记', '其他']
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '知识总结': BookOpen,
  '工具指南': Wrench,
  '参考文档': Lightbulb,
  '工作日记': FileText,
  '其他': Ellipsis,
}

/** 文档类型徽章：OKLCH 实心底 + 白字，双主题下均保对比度 */
function DocTypeChip({ format, className }: { format: string; className?: string }) {
  const tile = TYPE_TILE[format] || paletteOf(format)
  return (
    <span className={cn('inline-block rounded px-1.5 py-px text-xs font-medium text-white', tile.bg, className)}>
      {format}
    </span>
  )
}

const ALL = '__all__'

export default function DocsPage() {
  const [docs, setDocs] = useState<DocInfo[]>([])
  const [apps, setApps] = useState<AppInfo[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocInfo | null>(null)
  const [search, setSearch] = useState('')
  const [selType, setSelType] = useState<string>(ALL)
  const [selLingyu, setSelLingyu] = useState<string>(ALL)
  const { toast } = useToast()

  // 扫描
  const [showScanDialog, setShowScanDialog] = useState(false)
  const [scanData, setScanData] = useState<{
    docDir: string; newFiles: { name: string; path: string; format: string; category: string }[]
    newCategories: { format: string; category: string; fileCount: number }[]
    allCategories: { format: string; category: string; fileCount: number }[]
    deletedDocs: { id: string; name: string; path: string; format: string; category: string }[]
    totalScanned: number
  } | null>(null)
  const [scanSelected, setScanSelected] = useState<Set<string>>(new Set())
  const [deleteSelected, setDeleteSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)

  async function handleScan() {
    setScanning(true)
    try {
      const scope: { format?: string; category?: string } = {}
      if (selType !== ALL) scope.format = selType
      if (selLingyu !== ALL) scope.category = selLingyu
      const res = await api.scanDocs(scope.format ? scope : undefined)
      if (res.success && res.data) {
        if (res.data.newFiles.length === 0 && res.data.newCategories.length === 0 && res.data.deletedDocs.length === 0) {
          toast('没有发现变动')
        } else {
          setScanData(res.data)
          setScanSelected(new Set(res.data.newFiles.map(f => f.path)))
          setDeleteSelected(new Set(res.data.deletedDocs.map(d => d.id)))
          setShowScanDialog(true)
        }
      } else {
        toast(res.message || '扫描失败', 'error')
      }
    } catch {
      toast('扫描失败', 'error')
    } finally {
      setScanning(false)
    }
  }

  async function handleCleanDeleted() {
    if (!scanData) return
    const toDelete = scanData.deletedDocs.filter(d => deleteSelected.has(d.id))
    if (toDelete.length === 0) { toast('未选中任何文档', 'error'); return }
    let removed = 0
    for (const d of toDelete) {
      try {
        await api.deleteDoc(d.id)
        removed++
      } catch { /* continue */ }
    }
    toast(`已清理 ${removed} 个失效文档`)
    setShowScanDialog(false)
    setScanData(null)
    loadDocs(search)
  }

  async function handleBatchAdd() {
    if (!scanData) return
    const toAdd = scanData.newFiles.filter(f => scanSelected.has(f.path))
    if (toAdd.length === 0) { toast('未选中任何文件', 'error'); return }
    let added = 0
    for (const f of toAdd) {
      try {
        const res = await api.addDoc({ name: f.name, path: f.path, format: f.format, category: f.category, description: '' })
        if (res.success) added++
      } catch { /* continue */ }
    }
    toast(`已添加 ${added} 个文档`)
    setShowScanDialog(false)
    setScanData(null)
    loadDocs(search)
  }

  function toggleScanFile(filePath: string) {
    setScanSelected(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  function toggleDeleteDoc(id: string) {
    setDeleteSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDeleteAll() {
    if (!scanData) return
    if (deleteSelected.size === scanData.deletedDocs.length) {
      setDeleteSelected(new Set())
    } else {
      setDeleteSelected(new Set(scanData.deletedDocs.map(d => d.id)))
    }
  }

  function toggleScanAll() {
    if (!scanData) return
    if (scanSelected.size === scanData.newFiles.length) {
      setScanSelected(new Set())
    } else {
      setScanSelected(new Set(scanData.newFiles.map(f => f.path)))
    }
  }

  const loadDocs = useCallback(async (s?: string) => {
    const res = await api.getDocs(s)
    if (res.success && res.data) setDocs(res.data)
  }, [])

  const loadApps = useCallback(async () => {
    const res = await api.getCategories()
    if (res.success && res.data) {
      const all: AppInfo[] = []
      res.data.forEach(c => all.push(...c.apps))
      setApps(all)
    }
  }, [])

  useEffect(() => {
    loadDocs()
    loadApps()
    api.ensureDocDirs()
  }, [loadDocs, loadApps])

  useEffect(() => {
    const t = setTimeout(() => loadDocs(search), 200)
    return () => clearTimeout(t)
  }, [search, loadDocs])

  const sidebar = useMemo(() => {
    const result: { type: string; lingyus: string[]; count: number }[] = []
    DOC_TYPES.forEach(type => {
      const typeDocs = docs.filter(d => d.format === type)
      const lingyuSet = new Set<string>()
      typeDocs.forEach(d => { if (d.category) lingyuSet.add(d.category) })
      result.push({
        type,
        lingyus: Array.from(lingyuSet).sort(),
        count: typeDocs.length,
      })
    })
    const otherDocs = docs.filter(d => !DOC_TYPES.includes(d.format))
    if (otherDocs.length > 0) {
      const lingyuSet = new Set<string>()
      otherDocs.forEach(d => { if (d.category) lingyuSet.add(d.category) })
      result.push({
        type: '其他',
        lingyus: Array.from(lingyuSet).sort(),
        count: otherDocs.length,
      })
    }
    return result
  }, [docs])

  const filtered = useMemo(() => {
    let list = docs
    if (selType !== ALL) {
      list = list.filter(d => d.format === selType)
      if (selLingyu !== ALL) {
        list = list.filter(d => d.category === selLingyu)
      }
    }
    return list
  }, [docs, selType, selLingyu])

  async function handleDelete(id: string) {
    await api.deleteDoc(id)
    setSelectedDoc(null)
    loadDocs(search)
    toast('文档已删除')
  }

  async function handleSubmit(data: Partial<DocInfo> & { name: string }) {
    try {
      const payload = { ...data }
      if (editingDoc) {
        const res = await api.updateDoc(editingDoc.id, payload)
        if (!res.success) { toast(res.message || '更新失败', 'error'); return }
        toast('文档已更新')
      } else {
        const res = await api.addDoc(payload)
        if (!res.success) { toast(res.message || '添加失败', 'error'); return }
        toast('文档已添加')
      }
      setShowForm(false)
      setEditingDoc(null)
      setSelectedDoc(null)
      loadDocs(search)
    } catch {
      toast('操作失败', 'error')
    }
  }

  async function handleOpenPath(path: string) {
    try {
      await api.openFileInSystem(path)
    } catch {
      toast('打开失败', 'error')
    }
  }

  function handleSelectType(type: string) {
    setSelType(type)
    setSelLingyu(ALL)
  }

  async function handleDeleteCategory(format: string, category: string) {
    if (!confirm(`删除领域「${category}」及其目录？`)) return
    try {
      const res = await api.deleteDocCategory(format, category)
      if (res.success) {
        toast(`领域「${category}」已删除`)
        if (selLingyu === category) setSelLingyu(ALL)
        loadDocs(search)
      } else {
        toast(res.message || '删除失败', 'error')
      }
    } catch {
      toast('删除失败', 'error')
    }
  }

  const linkedAppName = selectedDoc?.app_id
    ? apps.find(a => a.id === selectedDoc.app_id)?.name || ''
    : ''

  return (
    <div
      className="app-shell flex h-full"
      data-panel-open={selectedDoc ? 'true' : undefined}
      style={{
        gap: 'var(--card-gap)',
        '--side-w': 'clamp(176px, 15cqw, 240px)',
        '--card-gap': 'clamp(10px, 1.2cqw, 18px)',
      } as React.CSSProperties}
    >
      {/* Sidebar */}
      <aside className="flex h-full flex-none flex-col rounded-xl border border-border bg-card pb-2 shadow-sm" style={{ width: 'var(--side-w)' }}>
        <div className="flex items-center px-3 pt-4 pb-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">文档类目</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1">
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setSelType(ALL); setSelLingyu(ALL) }}
            onKeyDown={e => { if (e.key === 'Enter') { setSelType(ALL); setSelLingyu(ALL) } }}
            className={cn(
              'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              ALL === selType
                ? 'bg-brand-soft font-semibold text-accent-foreground before:absolute before:inset-y-[22%] before:left-[6px] before:w-[2px] before:rounded-full before:bg-brand before:content-[""]'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
            )}
          >
            <Grid3X3 className={cn('h-4 w-4', ALL === selType ? 'text-brand' : 'text-muted-foreground')} />
            <span className="flex-1 truncate">全部文档</span>
            <span className={cn('w-5 shrink-0 text-right text-xs', ALL === selType ? 'text-accent-foreground/70' : 'text-muted-foreground/60')}>{docs.length}</span>
            <span className="shrink-0 w-4" />
          </div>

          {sidebar.map(group => {
            const Icon = TYPE_ICONS[group.type] || Ellipsis
            const isTypeActive = selType === group.type
            return (
              <div key={group.type}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectType(group.type)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSelectType(group.type) } }}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    isTypeActive
                      ? 'bg-brand-soft font-semibold text-accent-foreground before:absolute before:inset-y-[22%] before:left-[6px] before:w-[2px] before:rounded-full before:bg-brand before:content-[""]'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', isTypeActive ? 'text-brand' : (TYPE_TILE[group.type] || paletteOf(group.type)).text)} />
                  <span className="flex-1 truncate">{group.type}</span>
                  <span className={cn('w-5 shrink-0 text-right text-xs', isTypeActive ? 'text-accent-foreground/70' : 'text-muted-foreground/60')}>{group.count}</span>
                  <span className="shrink-0 w-4" />
                </div>
                {isTypeActive && group.lingyus.length > 0 && (
                  <div className="ml-6 mt-0.5 mb-0.5 flex flex-col gap-0.5">
                    {group.lingyus.map(ly => (
                      <div
                        key={ly}
                        onClick={() => setSelLingyu(ly)}
                        className={cn(
                          'group/ly flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                          selLingyu === ly
                            ? 'bg-secondary font-medium text-secondary-foreground'
                            : 'text-muted-foreground hover:bg-secondary/40'
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', paletteOf(ly).bg)} />
                        <span className="flex-1 truncate">{ly}</span>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteCategory(group.type, ly) }}
                          title={`删除领域 ${ly}`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover/ly:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* Main content */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-[1cqw] pt-4 pb-3">
          <h2 className="shrink-0 text-base font-semibold leading-none m-0">
            {selType === ALL ? '全部文档' : selLingyu !== ALL ? `${selType} · ${selLingyu}` : selType}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({filtered.length} 篇)</span>
          </h2>
          {/* 搜索框可伸缩：窄窗下让出空间，按钮不换行 */}
          <div className="relative ml-auto min-w-0 max-w-56 flex-1 basis-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索名称/描述…" className="h-8 w-full pl-8 text-xs"
            />
          </div>
          {/* 扫描是次要维护动作：用中性 secondary，避免琥珀色在靛蓝界面里抢主操作 */}
          <Button size="sm" variant="secondary" className="shrink-0" onClick={handleScan} disabled={scanning}>
            <FolderSearch className="h-4 w-4" /> {scanning ? '扫描中…' : '扫描文件'}
          </Button>
          <Button size="sm" className="shrink-0" onClick={() => { setEditingDoc(null); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> 新建文档
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-[1cqw] pb-4" style={{ scrollbarGutter: 'stable' }}>
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 text-brand">
                {search ? <Search className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
              </div>
              <p className="text-sm">{search ? '未找到匹配文档' : '暂无文档，点击上方按钮创建'}</p>
            </div>
          ) : (
            // 与应用页同一套恒定轨道网格：4/3/2 列，开详情面板少一列
            <div className="app-grid">
              {filtered.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={cn(
                    'flex cursor-pointer flex-col rounded-xl border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-none dark:hover:shadow-[0_8px_24px_-8px_oklch(0.05_0.02_262/0.6)]',
                    selectedDoc?.id === doc.id ? 'border-brand/60 ring-2 ring-brand/35' : 'border-border hover:border-brand/55'
                  )}
                >
                  <div className="flex items-start gap-3 p-4 pb-2">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', (TYPE_TILE[doc.format] || paletteOf(doc.format || 'doc')).bg)}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold leading-5 text-foreground" title={doc.name}>{doc.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {doc.format && <DocTypeChip format={doc.format} />}
                        {doc.category && (
                          <span className="inline-block rounded border border-border px-1.5 py-px text-xs text-muted-foreground">
                            {doc.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {doc.description && (
                    <div className="px-4 pb-1 flex-1">
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{doc.description}</p>
                    </div>
                  )}

                  {/* 底栏节奏与应用卡片一致：次级操作（编辑/删除）靠左，主操作「打开」靠右 */}
                  <div className="mt-auto flex items-center gap-1 border-t border-border/60 px-2.5 py-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑文档" aria-label="编辑文档"
                      onClick={e => { e.stopPropagation(); setEditingDoc(doc); setShowForm(true) }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-danger-soft hover:text-danger" title="删除文档" aria-label="删除文档"
                      onClick={e => { e.stopPropagation(); if (confirm('删除此文档？')) handleDelete(doc.id) }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <span className="ml-1 truncate text-xs text-muted-foreground">
                      {doc.app_id ? apps.find(a => a.id === doc.app_id)?.name || '' : ''}
                    </span>
                    <div className="flex-1" />
                    {/* 与「启动 / 安装」统一：卡片主操作用品牌色文字按钮，而非灰色实心块 */}
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs font-semibold text-brand hover:bg-brand-soft hover:text-brand"
                      onClick={e => { e.stopPropagation(); doc.path ? handleOpenPath(doc.path) : toast('未关联文件', 'error') }}>
                      <ExternalLink className="h-3.5 w-3.5" /> 打开
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Detail Panel */}
      {selectedDoc && (
        <Panel className="w-[var(--panel-w)]">
          <PanelBody>
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', (TYPE_TILE[selectedDoc.format] || paletteOf(selectedDoc.format || 'doc')).bg)}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold leading-5 text-foreground" title={selectedDoc.name}>{selectedDoc.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {selectedDoc.format && <DocTypeChip format={selectedDoc.format} />}
                  {selectedDoc.category && (
                    <span className="inline-block rounded border border-border px-1.5 py-px text-xs text-muted-foreground">
                      {selectedDoc.category}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="关闭详情"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <Field label="类型" value={selectedDoc.format || '—'} />
              <Field label="领域" value={selectedDoc.category || '—'} />
              <Field label="关联应用" value={linkedAppName || '—'} />
              <Field label="描述" value={selectedDoc.description || '—'} />
              <Field label="文件路径" value={selectedDoc.path || '—'} mono />
            </div>
          </PanelBody>

          {/* 动作固定在底栏，长内容滚动时不会被卷走（与应用 / 安装包面板一致） */}
          <PanelFooter>
            {selectedDoc.path && (
              <Button size="sm" className="w-full" onClick={() => handleOpenPath(selectedDoc.path!)}>
                <ExternalLink className="h-3.5 w-3.5" /> 打开文件
              </Button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingDoc(selectedDoc); setShowForm(true) }}>
                <Edit2 className="h-3.5 w-3.5" /> 编辑
              </Button>
              <Button size="sm" variant="outline" className="flex-1 border-danger/35 text-danger hover:border-danger/60 hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm('删除此文档？')) handleDelete(selectedDoc.id) }}>
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingDoc(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? '编辑文档' : '新建文档'}</DialogTitle>
          </DialogHeader>
          <DocForm
            doc={editingDoc}
            apps={apps}
            categories={sidebar.flatMap(g => g.lingyus)}
            onClose={() => { setShowForm(false); setEditingDoc(null) }}
            onSubmit={handleSubmit}
            onDelete={editingDoc ? () => { if (confirm('删除此文档？')) handleDelete(editingDoc.id); setShowForm(false); setEditingDoc(null) } : undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Scan Dialog */}
      <Dialog open={showScanDialog} onOpenChange={(open) => { if (!open) { setShowScanDialog(false); setScanData(null) } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>扫描结果</DialogTitle>
          </DialogHeader>
          {scanData && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground space-y-1">
                <div>扫描目录：<span className="font-mono text-xs">{scanData.docDir}</span></div>
                <div>
                  已扫描 <span className="font-semibold text-foreground">{scanData.totalScanned}</span> 个文件，
                  发现 <span className="font-semibold text-foreground">{scanData.newFiles.length}</span> 个新文件
                  {scanData.newCategories.length > 0 && (
                    <span>，<span className="font-semibold text-warning">{scanData.newCategories.length} 个新领域</span></span>
                  )}
                  {scanData.deletedDocs.length > 0 && (
                    <span>，<span className="font-semibold text-danger">{scanData.deletedDocs.length} 个文件已删除</span></span>
                  )}
                </div>
              </div>

              {/* 新领域列表 */}
              {scanData.newCategories.length > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning-soft p-3">
                  <div className="mb-2 text-xs font-semibold text-warning">新领域</div>
                  <div className="space-y-1">
                    {(() => {
                      const grouped = new Map<string, typeof scanData.newCategories>()
                      for (const c of scanData.newCategories) {
                        const key = c.format
                        if (!grouped.has(key)) grouped.set(key, [])
                        grouped.get(key)!.push(c)
                      }
                      return Array.from(grouped.entries()).map(([format, cats]) => (
                        <div key={format} className="flex items-center gap-2 text-xs">
                          <DocTypeChip format={format} />
                          <span className="text-warning">
                            {cats.map(c => (
                              <span key={c.category} className="mr-2 inline-flex items-center gap-1">
                                {c.category}
                                {c.fileCount === 0 && <span className="opacity-60">(空)</span>}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}

              {/* 已删除的文档 */}
              {scanData.deletedDocs.length > 0 && (
                <div className="rounded-lg border border-danger/25 bg-danger-soft p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-danger">文件已被删除</span>
                    <button
                      onClick={toggleDeleteAll}
                      className="inline-flex items-center gap-1.5 text-xs text-danger hover:brightness-90"
                    >
                      {deleteSelected.size === scanData.deletedDocs.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      全选 / 取消
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {scanData.deletedDocs.map(d => (
                      <div
                        key={d.id}
                        onClick={() => toggleDeleteDoc(d.id)}
                        className="flex cursor-pointer items-center gap-3 rounded px-2.5 py-1.5 text-sm transition-colors hover:bg-danger/10"
                      >
                        <span className="shrink-0">
                          {deleteSelected.has(d.id)
                            ? <CheckSquare className="h-4 w-4 text-danger" />
                            : <Square className="h-4 w-4 opacity-40" />
                          }
                        </span>
                        <Trash2 className="h-4 w-4 shrink-0 opacity-60" />
                        <span className="flex-1 truncate">{d.name}</span>
                        <span className={cn('shrink-0 rounded px-1.5 py-px text-xs font-medium', d.path ? 'bg-danger/15 text-danger' : 'bg-secondary text-muted-foreground')}>
                          {d.path ? '已删除' : '无文件'}
                        </span>
                        {d.format && <DocTypeChip format={d.format} className="shrink-0" />}
                        {d.category && <span className="text-xs text-muted-foreground">{d.category}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 新文件列表 */}
              {scanData.newFiles.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleScanAll}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {scanSelected.size === scanData.newFiles.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      全选 / 取消
                    </button>
                    <span className="text-xs text-muted-foreground">已选 {scanSelected.size} / {scanData.newFiles.length}</span>
                  </div>

                  <div className="max-h-80 overflow-auto rounded-lg border border-border">
                    {(() => {
                      const grouped = new Map<string, typeof scanData.newFiles>()
                      for (const f of scanData.newFiles) {
                        const key = `${f.format} / ${f.category}` || '未分类'
                        if (!grouped.has(key)) grouped.set(key, [])
                        grouped.get(key)!.push(f)
                      }
                      const newCatKeys = new Set(scanData.newCategories.map(c => `${c.format} / ${c.category}`))
                      return Array.from(grouped.entries()).map(([key, files]) => (
                        <div key={key}>
                          <div className="flex items-center gap-2 border-b border-border sticky top-0 bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                            <span className={cn('h-1.5 w-1.5 rounded-full', paletteOf(key).bg)} />
                            {key}
                            {newCatKeys.has(key) && (
                              <span className="rounded bg-warning-soft px-1.5 py-px font-medium text-warning">新领域</span>
                            )}
                            <span className="opacity-60">({files.length})</span>
                          </div>
                          {files.map(f => (
                            <div
                              key={f.path}
                              onClick={() => toggleScanFile(f.path)}
                              className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                            >
                              <span className="shrink-0">
                                {scanSelected.has(f.path)
                                  ? <CheckSquare className="h-4 w-4 text-brand" />
                                  : <Square className="h-4 w-4 opacity-40" />
                                }
                              </span>
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate font-medium">{f.name}</span>
                              <DocTypeChip format={f.format} className="shrink-0" />
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                </>
              )}

              <div className="flex justify-between pt-1">
                <div>
                  {scanData.deletedDocs.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleCleanDeleted} disabled={deleteSelected.size === 0}>
                      <Trash2 className="h-3.5 w-3.5" /> 清理失效 ({deleteSelected.size})
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowScanDialog(false); setScanData(null) }}>关闭</Button>
                  {scanData.newFiles.length > 0 && (
                    <Button size="sm" onClick={handleBatchAdd} disabled={scanSelected.size === 0}>
                      添加选中 ({scanSelected.size})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
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

function DocForm({ doc, apps, categories, onClose, onSubmit, onDelete }: {
  doc: DocInfo | null; apps: AppInfo[]; categories: string[]
  onClose: () => void; onSubmit: (data: Partial<DocInfo> & { name: string }) => void; onDelete?: () => void
}) {
  const [name, setName] = useState(doc?.name || '')
  const [docType, setDocType] = useState(doc?.format || '')
  const [category, setCategory] = useState(doc?.category || '')
  const [appId, setAppId] = useState(doc?.app_id || '')
  const [description, setDescription] = useState(doc?.description || '')

  const mergedCategories = [...new Set([...categories, category].filter(Boolean))]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(), format: docType, category: category.trim(),
      app_id: appId || '', path: doc?.path || '',
      description: description.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">名称 *</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="文档标题" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">类型</label>
        <Select value={docType || '__none__'} onValueChange={v => setDocType(v === '__none__' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">领域</label>
        <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="自由输入，如 Python、前端" list="doc-lingyus" />
        <datalist id="doc-lingyus">
          {mergedCategories.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">关联应用</label>
        <Select value={appId || '__none__'} onValueChange={v => setAppId(v === '__none__' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="不关联" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不关联</SelectItem>
            {apps.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">描述</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="简短摘要，显示在卡片上" />
      </div>

      {doc?.path && (
        <div className="text-xs text-muted-foreground truncate">当前文件：{doc.path}</div>
      )}

      <div className="flex justify-between pt-2">
        <div>
          {onDelete && (
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> 删除
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">保存</Button>
        </div>
      </div>
    </form>
  )
}
