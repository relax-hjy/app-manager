import { useState, useEffect, useCallback } from 'react'
import type { AppCategory, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '../components/ui/select'
import { Plus, Trash2, Edit2, X, Play, Briefcase, Code2, Wrench, Ellipsis, Grid3X3, Layers } from 'lucide-react'

const ALL_CAT = '__all__'

const CAT_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  '办公工具': Briefcase,
  '开发工具': Code2,
  '实用工具': Wrench,
  '其他工具': Ellipsis,
}

function catIcon(name: string) {
  return CAT_ICONS[name] || Layers
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

export default function AppsPage() {
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [selectedCat, setSelectedCat] = useState(ALL_CAT)
  const [apps, setApps] = useState<AppInfo[]>([])
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingApp, setEditingApp] = useState<AppInfo | null>(null)
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

  async function handleDeleteApp(id: string) {
    await api.deleteApp(id)
    setSelectedApp(null)
    loadApps(selectedCat)
    loadCategories()
  }

  async function handleDeleteCat(name: string) {
    await api.deleteCategory(name)
    if (selectedCat === name) setSelectedCat('')
    setSelectedApp(null)
    loadCategories()
  }

  async function handleAddCat() {
    const name = prompt('输入新分类名称：')
    if (!name?.trim()) return
    const res = await api.addCategory(name.trim())
    if (res.success) {
      setSelectedCat(name.trim())
      loadCategories()
    } else alert(res.message)
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
        toast('添加成功')
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
    <div className="flex gap-4 h-full">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col rounded-xl border bg-card px-2 shadow-sm pb-3">
        <div className="flex items-center justify-between px-2 pt-4 pb-3">
          <span className="text-base font-semibold">工具类目</span>
          <Button size="icon" variant="ghost" onClick={handleAddCat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-0.5">
        {/* 全部工具 */}
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
      </aside>

      {/* Main content */}
      <section className="flex-1 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selectedCat === ALL_CAT ? '全部工具' : (selectedCat || '选择类目')}
          </h2>
          <Button size="sm" onClick={() => { setEditingApp(null); setShowForm(true) }} disabled={!selectedCat || selectedCat === ALL_CAT}>
            <Plus className="h-4 w-4" /> 添加应用
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-sm">暂无应用，点击上方按钮添加</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {apps.map(app => (
                <div
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`rounded-xl border bg-white cursor-pointer transition-all hover:shadow-md flex flex-col
                    ${selectedApp?.id === app.id ? 'border-[1a1a1a]/40 ring-1 ring-[1a1a1a]/20' : 'border-[#e5e6e8] hover:border-[#c5c7cc]'}`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4 pb-2">
                    <div className={`h-10 w-10 rounded-lg ${catColor(app.category).bg} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {app.name.charAt(0)}
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
                  <div className="flex items-center gap-1 px-4 py-2.5 mt-1 border-t border-[#f0f0f0]">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingApp(app); setShowForm(true) }}
                      className="text-[#646a73] hover:text-[1a1a1a] hover:bg-[#f2f3f5] rounded px-2.5 py-1 transition-colors select-none"
                      style={{ fontSize: 13 }}
                    >
                      编辑
                    </button>
                    <div className="flex-1" />
                    {app.path && app.is_installed && (
                      <button
                        onClick={e => { e.stopPropagation(); handleLaunch(app.path!) }}
                        className="text-[#1a1a1a] hover:bg-[#f5f5f5] rounded px-2.5 py-1 transition-colors select-none font-medium"
                        style={{ fontSize: 13 }}
                      >
                        启动
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Detail Panel */}
      {selectedApp && (
        <aside className="w-72 rounded-xl border bg-card p-5 shadow-sm overflow-auto space-y-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${catColor(selectedApp.category).bg} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
              {selectedApp.name.charAt(0)}
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
          </div>

          <div className="space-y-3 text-sm">
            <Field label="路径" value={selectedApp.path || '—'} mono />
            <Field label="描述" value={selectedApp.description || '—'} />
            <Field label="EXE 包" value={selectedApp.exe_pkg || '—'} mono />
            <Field label="ZIP 包" value={selectedApp.zip_pkg || '—'} mono />
          </div>

          <div className="space-y-2 pt-1">
            {selectedApp.path && selectedApp.is_installed && (
              <Button size="sm" className="w-full bg-[#1a1a1a] hover:bg-[#333] text-white" onClick={() => handleLaunch(selectedApp.path!)}>
                <Play className="h-3.5 w-3.5" /> 启动应用
              </Button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingApp(selectedApp); setShowForm(true) }}>
                <Edit2 className="h-3.5 w-3.5" /> 编辑
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => { if (confirm('删除此应用？')) handleDeleteApp(selectedApp.id) }}>
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </Button>
            </div>
          </div>
        </aside>
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
    </div>
  )
}

function Field({ label, value, mono, valueChip }: { label: string; value: string; mono?: boolean; valueChip?: 'installed' | 'not' }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      {valueChip ? (
        <span
          className="inline-block font-medium select-none"
          style={{
            fontSize: 12, borderRadius: 4, padding: '2px 8px',
            color: valueChip === 'installed' ? '#16a34a' : '#dc2626',
            background: valueChip === 'installed' ? '#f0fdf4' : '#fef2f2',
          }}
        >
          {valueChip === 'installed' ? '已安装' : '未安装'}
        </span>
      ) : (
        <div className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</div>
      )}
    </div>
  )
}

function AppForm({ app, category, categories, onClose, onSubmit }: {
  app: AppInfo | null; category: string; categories: string[]; onClose: () => void
  onSubmit: (data: any) => void
}) {
  const [name, setName] = useState(app?.name || '')
  const [selectedCat, setSelectedCat] = useState(app?.category || category || '')
  const [version, setVersion] = useState(app?.version || '')
  const [path, setPath] = useState(app?.path || '')
  const [description, setDescription] = useState(app?.description || '')
  const [installDir, setInstallDir] = useState('')

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
        <Input value={path} onChange={e => setPath(e.target.value)} placeholder="可执行文件路径" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">描述</label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="应用功能简介" rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  )
}
