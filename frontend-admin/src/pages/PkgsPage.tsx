import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppCategory, AppInfo } from '../types'
import * as api from '../api'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Check, FileDown, FolderArchive, FolderOpen, Trash2, Briefcase, Code2, Wrench, Ellipsis, Grid3X3, Layers, X, Plus } from 'lucide-react'

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
  const [pkgType, setPkgType] = useState<'exe_pkg' | 'zip_pkg'>('exe_pkg')
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

  async function handleDeleteCat(name: string) {
    await api.deleteCategory(name)
    if (selectedCat === name) setSelectedCat(ALL_CAT)
    setSelectedApp(null)
    loadCategories()
  }

  async function handleSavePkg(type: 'exe_pkg' | 'zip_pkg', value: string) {
    if (!selectedApp) return
    const otherType = type === 'exe_pkg' ? 'zip_pkg' : 'exe_pkg'
    const updates: Record<string, string> = { [type]: value }
    // EXE 和 ZIP 二选一：设置一个时清除另一个
    if (value) updates[otherType] = ''
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
    <div className="flex gap-4 h-full">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col rounded-xl border bg-card px-2 shadow-sm pb-3">
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
      </aside>

      {/* Main */}
      <section className="flex-1 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold leading-none m-0">
            {selectedCat === ALL_CAT ? '全部工具' : (selectedCat || '选择类目')}
            <span className="ml-2 text-sm font-normal text-muted-foreground leading-none">({apps.length} 个应用)</span>
          </h2>
          <Button size="sm" className="invisible">
            <Plus className="h-4 w-4" /> 添加
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-5xl mb-3">📦</div>
              <p className="text-sm">该分类下暂无应用</p>
              <p className="text-xs mt-1">先在应用管理中添加应用，再返回这里设置安装包</p>
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
                      onClick={e => { e.stopPropagation(); setPkgType('exe_pkg'); setSelectedApp(app); setShowForm(true) }}
                      className="text-[#646a73] hover:text-[1a1a1a] hover:bg-[#f2f3f5] rounded px-2.5 py-1 transition-colors select-none"
                      style={{ fontSize: 13 }}
                    >
                      设置EXE
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setPkgType('zip_pkg'); setSelectedApp(app); setShowForm(true) }}
                      className="text-[#646a73] hover:text-[1a1a1a] hover:bg-[#f2f3f5] rounded px-2.5 py-1 transition-colors select-none"
                      style={{ fontSize: 13 }}
                    >
                      设置ZIP
                    </button>
                    <div className="flex-1" />
                    {(app.exe_pkg || app.zip_pkg) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleLaunchPkg(app) }}
                        className="text-[#1a1a1a] hover:bg-[#f5f5f5] rounded px-2.5 py-1 transition-colors select-none font-medium"
                        style={{ fontSize: 13 }}
                      >
                        安装
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
        <aside className="w-80 rounded-xl border bg-card p-5 shadow-sm overflow-auto space-y-4 shrink-0">
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

          {/* EXE */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5"><FileDown className="h-4 w-4" /> EXE 安装包</span>
              <Button size="sm" variant="ghost" onClick={() => { setPkgType('exe_pkg'); setShowForm(true) }}>
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
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5"><FolderArchive className="h-4 w-4" /> ZIP 压缩包</span>
              <Button size="sm" variant="ghost" onClick={() => { setPkgType('zip_pkg'); setShowForm(true) }}>
                {selectedApp.zip_pkg ? '更换' : '设置'}
              </Button>
            </div>
            {selectedApp.zip_pkg ? (
              <p className="font-mono text-xs text-muted-foreground break-all leading-relaxed">{selectedApp.zip_pkg}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">未添加</p>
            )}
          </div>

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

          {selectedApp.path && (
            <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">应用路径</span>
              <p className="font-mono text-xs break-all">{selectedApp.path}</p>
            </div>
          )}
        </aside>
      )}

      {/* Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pkgType === 'exe_pkg' ? '设置 EXE 安装包' : '设置 ZIP 压缩包'}</DialogTitle>
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
  type: 'exe_pkg' | 'zip_pkg'; currentValue: string; appName: string
  onClose: () => void; onSave: (value: string) => void
}) {
  const [value, setValue] = useState(currentValue)
  const [copying, setCopying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleBrowse() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const filePath = file.name
    setValue(filePath)
    // 重置 input，允许重复选择同一文件
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const src = value.trim()
    if (!src) return
    setCopying(true)
    try {
      const res = await api.copyPkg(src, appName)
      if (res.success && res.data) {
        onSave(res.data.path)
      } else {
        alert(res.message || '复制安装包失败')
      }
    } catch {
      alert('复制安装包失败')
    } finally {
      setCopying(false)
    }
  }

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
        为 <strong>{appName}</strong> 设置 {type === 'exe_pkg' ? 'EXE' : 'ZIP'} 安装包路径
      </p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{type === 'exe_pkg' ? 'EXE 路径' : 'ZIP 路径'}</label>
        <div className="flex gap-2">
          <Input value={value} onChange={e => setValue(e.target.value)} className="flex-1"
            placeholder={type === 'exe_pkg' ? '选择 .exe 安装包' : '选择 .zip 压缩包'} />
          <Button type="button" variant="outline" size="icon" onClick={handleBrowse} title="浏览文件">
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit" disabled={copying}>{copying ? '复制中...' : '保存'}</Button>
      </div>
      {currentValue && (
        <Button type="button" variant="destructive" className="w-full" onClick={() => onSave('')}>
          <Trash2 className="h-4 w-4" /> 移除安装包
        </Button>
      )}
    </form>
  )
}
