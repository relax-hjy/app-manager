import { useState, useEffect, useCallback, useMemo } from 'react'
import type { DocInfo, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Plus, Trash2, Search, FileText, Edit2, ExternalLink, BookOpen, Wrench, Lightbulb, Ellipsis, Grid3X3 } from 'lucide-react'

const DOC_TYPES = ['知识总结', '工具指南', '参考文档', '其他']
const FILE_FORMATS = ['MD', 'PDF']

const TYPE_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  '知识总结': BookOpen,
  '工具指南': Wrench,
  '参考文档': Lightbulb,
  '其他': Ellipsis,
}

const TYPE_CLASSES: Record<string, string> = {
  '知识总结': 'bg-emerald-100 text-emerald-700',
  '工具指南': 'bg-blue-100 text-blue-700',
  '参考文档': 'bg-violet-100 text-violet-700',
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
  const [docDir, setDocDir] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocInfo | null>(null)
  const [search, setSearch] = useState('')
  const [selType, setSelType] = useState<string>(ALL)
  const [selLingyu, setSelLingyu] = useState<string>(ALL)
  const { toast } = useToast()

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
    api.getConfig().then(res => {
      if (res.success && res.data) setDocDir(res.data.doc_directory || '')
    })
  }, [loadDocs, loadApps])

  useEffect(() => {
    const t = setTimeout(() => loadDocs(search), 200)
    return () => clearTimeout(t)
  }, [search, loadDocs])

  // 侧边栏数据结构：按类型分组，每个类型下有领域列表
  const sidebar = useMemo(() => {
    const result: { type: string; lingyus: string[]; count: number }[] = []
    DOC_TYPES.forEach(type => {
      const typeDocs = docs.filter(d => d.format === type)
      if (typeDocs.length === 0) return
      const lingyuSet = new Set<string>()
      typeDocs.forEach(d => { if (d.category) lingyuSet.add(d.category) })
      result.push({
        type,
        lingyus: Array.from(lingyuSet).sort(),
        count: typeDocs.length,
      })
    })
    // 有文档但类型不在 DOC_TYPES 中的
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

  // 过滤文档
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
    loadDocs(search)
    toast('文档已删除')
  }

  async function handleSubmit(data: Partial<DocInfo> & { name: string; content?: string }) {
    try {
      let filePath = data.path || ''
      if (data.content?.trim() && docDir) {
        const catFolder = data.category || '未分类'
        const ext = (data as any).fileFormat === 'MD' ? '.md' : '.pdf'
        delete (data as any).fileFormat
        const safeName = data.name!.replace(/[\\/:*?"<>|]/g, '-')
        filePath = `${docDir}\\${catFolder}\\${safeName}${ext}`
        const saveRes = await api.saveDocFile(filePath, data.content)
        if (saveRes.success) {
          filePath = saveRes.data!.path
        }
      }

      const payload = { ...data, path: filePath || data.path || '' }
      delete (payload as any).content

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
          {/* 全部文档 */}
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
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelLingyu(ly)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSelLingyu(ly) } }}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors cursor-pointer select-none
                          ${selLingyu === ly ? 'bg-secondary/70 font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/40'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catColor(ly).bg}`} />
                        <span className="flex-1 truncate">{ly}</span>
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
          <Button size="sm" onClick={() => { setEditingDoc(null); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> 新建文档
          </Button>
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
                  onClick={() => { setEditingDoc(doc); setShowForm(true) }}
                  className="rounded-xl border bg-white cursor-pointer transition-all hover:shadow-md flex flex-col border-[#e5e6e8] hover:border-[#c5c7cc]"
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
                      onClick={e => { e.stopPropagation(); doc.path ? handleOpenPath(doc.path) : toast('未关联文件，请编辑文档并填写正文', 'error') }}
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

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingDoc(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? '编辑文档' : '新建文档'}</DialogTitle>
          </DialogHeader>
          <DocForm
            doc={editingDoc}
            apps={apps}
            categories={sidebar.flatMap(g => g.lingyus)}
            docDir={docDir}
            onClose={() => { setShowForm(false); setEditingDoc(null) }}
            onSubmit={handleSubmit}
            onDelete={editingDoc ? () => { if (confirm('删除此文档？')) handleDelete(editingDoc.id); setShowForm(false); setEditingDoc(null) } : undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocForm({ doc, apps, categories, docDir, onClose, onSubmit, onDelete }: {
  doc: DocInfo | null; apps: AppInfo[]; categories: string[]; docDir: string
  onClose: () => void; onSubmit: (data: any) => void; onDelete?: () => void
}) {
  const [name, setName] = useState(doc?.name || '')
  const [docType, setDocType] = useState(doc?.format || '')
  const [fileFormat, setFileFormat] = useState(() => {
    if (doc?.path) {
      const ext = doc.path.split('.').pop()?.toLowerCase()
      if (ext === 'md') return 'MD'
      if (ext === 'pdf') return 'PDF'
    }
    return 'MD'
  })
  const [category, setCategory] = useState(doc?.category || '')
  const [appId, setAppId] = useState(doc?.app_id || '')
  const [description, setDescription] = useState(doc?.description || '')
  const [content, setContent] = useState('')

  const mergedCategories = [...new Set([...categories, category].filter(Boolean))]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(), format: docType, category: category.trim(),
      app_id: appId || '', path: doc?.path || '',
      description: description.trim(), content: content.trim(),
      fileFormat,
    })
  }

  const ext = fileFormat === 'MD' ? '.md' : '.pdf'
  const previewPath = docDir && name.trim()
    ? `${docDir}\\${category.trim() || '未分类'}\\${name.trim().replace(/[\\/:*?"<>|]/g, '-')}${ext}`
    : ''

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">名称 *</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="文档标题" />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <label className="text-sm font-medium">文件格式</label>
          <Select value={fileFormat} onValueChange={setFileFormat} disabled={!!doc}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILE_FORMATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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

      <div className="space-y-1.5">
        <label className="text-sm font-medium">正文</label>
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="文档正文内容" rows={8} />
        {previewPath && (
          <p className="text-xs text-muted-foreground">保存位置：{previewPath}</p>
        )}
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
