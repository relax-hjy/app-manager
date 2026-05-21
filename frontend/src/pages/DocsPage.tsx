import { useState, useEffect, useCallback, useMemo } from 'react'
import type { DocInfo, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Plus, Trash2, Search, FileText, Edit2, ExternalLink, BookOpen, Wrench, Lightbulb, Ellipsis, Grid3X3, FolderSearch, CheckSquare, Square, X } from 'lucide-react'

const DOC_TYPES = ['知识总结', '工具指南', '参考文档', '工作日记', '其他']
const TYPE_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  '知识总结': BookOpen,
  '工具指南': Wrench,
  '参考文档': Lightbulb,
  '工作日记': FileText,
  '其他': Ellipsis,
}

const TYPE_CLASSES: Record<string, string> = {
  '知识总结': 'bg-emerald-100 text-emerald-700',
  '工具指南': 'bg-blue-100 text-blue-700',
  '参考文档': 'bg-violet-100 text-violet-700',
  '工作日记': 'bg-amber-100 text-amber-700',
}

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
    <div className="flex gap-4 h-full">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col rounded-xl border bg-card px-2 shadow-sm pb-3">
        <div className="flex items-center justify-between px-2 pt-4 pb-3">
          <span className="text-base font-semibold">文档类目</span>
          <Button size="icon" variant="ghost" className="invisible">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-0.5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setSelType(ALL); setSelLingyu(ALL) }}
            onKeyDown={e => { if (e.key === 'Enter') { setSelType(ALL); setSelLingyu(ALL) } }}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors cursor-pointer select-none
              ${ALL === selType ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
          >
            <Grid3X3 className={`h-4 w-4 ${ALL === selType ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="flex-1 truncate">全部文档</span>
            <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">{docs.length}</span>
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
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors cursor-pointer select-none
                    ${isTypeActive ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isTypeActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="flex-1 truncate">{group.type}</span>
                  <span className="text-xs text-muted-foreground/60 w-5 text-right shrink-0">{group.count}</span>
                  <span className="shrink-0 w-4" />
                </div>
                {isTypeActive && group.lingyus.length > 0 && (
                  <div className="ml-6 mt-0.5 mb-0.5 flex flex-col gap-0.5">
                    {group.lingyus.map(ly => (
                      <div
                        key={ly}
                        onClick={() => setSelLingyu(ly)}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors cursor-pointer select-none
                          ${selLingyu === ly ? 'bg-secondary/70 font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/40'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catColor(ly).bg}`} />
                        <span className="flex-1 truncate">{ly}</span>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteCategory(group.type, ly) }}
                          className="shrink-0 rounded p-0.5 opacity-0 hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-opacity"
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
      <section className="flex-1 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selType === ALL ? '全部文档' : selLingyu !== ALL ? `${selType} · ${selLingyu}` : selType}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({filtered.length} 篇)</span>
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索名称/描述…" className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={handleScan} disabled={scanning}>
              <FolderSearch className="h-4 w-4" /> {scanning ? '扫描中…' : '扫描文件'}
            </Button>
            <Button size="sm" onClick={() => { setEditingDoc(null); setShowForm(true) }}>
              <Plus className="h-4 w-4" /> 新建文档
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-5xl mb-3">{search ? '🔍' : '📝'}</div>
              <p className="text-sm">{search ? '未找到匹配文档' : '暂无文档，点击上方按钮创建'}</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {filtered.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`rounded-xl border bg-white cursor-pointer transition-all hover:shadow-md flex flex-col
                    ${selectedDoc?.id === doc.id ? 'border-[1a1a1a]/40 ring-1 ring-[1a1a1a]/20' : 'border-[#e5e6e8] hover:border-[#c5c7cc]'}`}
                >
                  <div className="flex items-start gap-3 p-4 pb-2">
                    <div className="h-10 w-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-white shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#1f2329] truncate" style={{ fontSize: 16 }}>
                        {doc.name}
                      </div>
                      {doc.category && (
                        <span className="inline-block rounded border border-[#e5e6e8] px-1.5 py-px mt-0.5" style={{ fontSize: 12, color: '#646a73' }}>
                          {doc.category}
                        </span>
                      )}
                      {doc.format && (
                        <span className={`inline-block rounded px-1.5 py-px ml-1.5 mt-0.5 font-medium ${TYPE_CLASSES[doc.format] || 'bg-slate-100 text-slate-700'}`} style={{ fontSize: 12 }}>
                          {doc.format}
                        </span>
                      )}
                    </div>
                  </div>

                  {doc.description && (
                    <div className="px-4 pb-1 flex-1">
                      <p className="text-[#646a73] leading-relaxed line-clamp-2" style={{ fontSize: 13 }}>
                        {doc.description}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-1 px-4 py-2.5 mt-auto border-t border-[#f0f0f0]">
                    <span className="text-xs text-muted-foreground">
                      {doc.app_id ? apps.find(a => a.id === doc.app_id)?.name || '' : ''}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={e => { e.stopPropagation(); doc.path ? handleOpenPath(doc.path) : toast('未关联文件', 'error') }}
                      className="text-[#1a1a1a] hover:bg-[#f5f5f5] rounded px-2.5 py-1 transition-colors select-none font-medium inline-flex items-center gap-1"
                      style={{ fontSize: 13 }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> 打开
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingDoc(doc); setShowForm(true) }}
                      className="text-[#646a73] hover:text-[#1a1a1a] hover:bg-[#f2f3f5] rounded px-2 py-1 transition-colors"
                      style={{ fontSize: 13 }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm('删除此文档？')) handleDelete(doc.id) }}
                      className="text-[#646a73] hover:text-red-500 hover:bg-red-50 rounded px-2 py-1 transition-colors"
                      style={{ fontSize: 13 }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Detail Panel */}
      {selectedDoc && (
        <aside className="w-72 rounded-xl border bg-card p-5 shadow-sm overflow-auto space-y-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-white shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#1f2329] truncate" style={{ fontSize: 16 }}>
                {selectedDoc.name}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {selectedDoc.format && (
                  <span className={`inline-block rounded px-1.5 py-px font-medium ${TYPE_CLASSES[selectedDoc.format] || 'bg-slate-100 text-slate-700'}`} style={{ fontSize: 12 }}>
                    {selectedDoc.format}
                  </span>
                )}
                {selectedDoc.category && (
                  <span className="inline-block rounded border border-[#e5e6e8] px-1.5 py-px" style={{ fontSize: 12, color: '#646a73' }}>
                    {selectedDoc.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <Field label="类型" value={selectedDoc.format || '—'} />
            <Field label="领域" value={selectedDoc.category || '—'} />
            <Field label="关联应用" value={linkedAppName || '—'} />
            <Field label="描述" value={selectedDoc.description || '—'} />
            <Field label="文件路径" value={selectedDoc.path || '—'} mono />
          </div>

          <div className="space-y-2 pt-1">
            {selectedDoc.path && (
              <Button size="sm" className="w-full bg-[#1a1a1a] hover:bg-[#333] text-white" onClick={() => handleOpenPath(selectedDoc.path!)}>
                <ExternalLink className="h-3.5 w-3.5" /> 打开文件
              </Button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingDoc(selectedDoc); setShowForm(true) }}>
                <Edit2 className="h-3.5 w-3.5" /> 编辑
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => { if (confirm('删除此文档？')) handleDelete(selectedDoc.id) }}>
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </Button>
            </div>
          </div>
        </aside>
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
                  已扫描 <span className="font-semibold text-[#1a1a1a]">{scanData.totalScanned}</span> 个文件，
                  发现 <span className="font-semibold text-[#1a1a1a]">{scanData.newFiles.length}</span> 个新文件
                  {scanData.newCategories.length > 0 && (
                    <span>，<span className="font-semibold text-amber-700">{scanData.newCategories.length} 个新领域</span></span>
                  )}
                  {scanData.deletedDocs.length > 0 && (
                    <span>，<span className="font-semibold text-red-600">{scanData.deletedDocs.length} 个文件已删除</span></span>
                  )}
                </div>
              </div>

              {/* 新领域列表 */}
              {scanData.newCategories.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800 mb-2">新领域</div>
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
                          <span className={`rounded px-1.5 py-px font-medium ${TYPE_CLASSES[format] || 'bg-slate-100 text-slate-700'}`}>{format}</span>
                          <span className="text-amber-700">
                            {cats.map(c => (
                              <span key={c.category} className="inline-flex items-center gap-1 mr-2">
                                {c.category}
                                {c.fileCount === 0 && <span className="text-amber-400">(空)</span>}
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
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-red-800">文件已被删除</span>
                    <button
                      onClick={toggleDeleteAll}
                      className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800"
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
                        className="flex items-center gap-3 px-2.5 py-1.5 rounded cursor-pointer hover:bg-red-100 text-sm"
                      >
                        <span className="shrink-0">
                          {deleteSelected.has(d.id)
                            ? <CheckSquare className="h-4 w-4 text-red-600" />
                            : <Square className="h-4 w-4 text-muted-foreground/40" />
                          }
                        </span>
                        <Trash2 className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="flex-1 truncate">{d.name}</span>
                        {!d.path ? (
                          <span className="shrink-0 rounded bg-slate-100 text-slate-500 px-1.5 py-px font-medium" style={{ fontSize: 12 }}>无文件</span>
                        ) : (
                          <span className="shrink-0 rounded bg-red-100 text-red-600 px-1.5 py-px font-medium" style={{ fontSize: 12 }}>已删除</span>
                        )}
                        {d.format && (
                          <span className={`shrink-0 rounded px-1.5 py-px font-medium ${TYPE_CLASSES[d.format] || 'bg-slate-100 text-slate-700'}`} style={{ fontSize: 12 }}>{d.format}</span>
                        )}
                        {d.category && (
                          <span className="text-xs text-muted-foreground">{d.category}</span>
                        )}
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
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#1a1a1a]"
                    >
                      {scanSelected.size === scanData.newFiles.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      全选 / 取消
                    </button>
                    <span className="text-xs text-muted-foreground">已选 {scanSelected.size} / {scanData.newFiles.length}</span>
                  </div>

                  <div className="max-h-80 overflow-auto border rounded-lg">
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
                          <div className="flex items-center gap-2 px-3 py-2 bg-[#f9fafb] border-b text-xs font-medium text-muted-foreground sticky top-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${catColor(key).bg}`} />
                            {key}
                            {newCatKeys.has(key) && (
                              <span className="rounded bg-amber-100 text-amber-700 px-1.5 py-px font-medium">新领域</span>
                            )}
                            <span className="text-muted-foreground/50">({files.length})</span>
                          </div>
                          {files.map(f => (
                            <div
                              key={f.path}
                              onClick={() => toggleScanFile(f.path)}
                              className="flex items-center gap-3 px-3 py-2.5 border-b border-[#f5f5f5] cursor-pointer hover:bg-[#fafafa] text-sm"
                            >
                              <span className="shrink-0">
                                {scanSelected.has(f.path)
                                  ? <CheckSquare className="h-4 w-4 text-[#1a1a1a]" />
                                  : <Square className="h-4 w-4 text-muted-foreground/40" />
                                }
                              </span>
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="flex-1 truncate font-medium">{f.name}</span>
                              <span className={`shrink-0 rounded px-1.5 py-px font-medium ${TYPE_CLASSES[f.format] || 'bg-slate-100 text-slate-700'}`} style={{ fontSize: 12 }}>
                                {f.format}
                              </span>
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
  onClose: () => void; onSubmit: (data: any) => void; onDelete?: () => void
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
