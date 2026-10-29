import { useState, useEffect } from 'react'
import type { AppConfig } from '../types'
import * as api from '../api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { CheckCircle, FolderOpen, Laptop, Moon, Monitor, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '../lib/theme'
import { cn } from '../lib/utils'

/** 目录配置行：标签 + 说明 + 输入框 + 打开按钮 */
function DirField({ label, hint, value, placeholder, onChange }: {
  label: string; hint: string; value: string; placeholder: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!value}
          onClick={() => api.openFolderInSystem(value)}
          title="在资源管理器中打开"
        >
          <FolderOpen className="h-4 w-4" />
          打开
        </Button>
      </div>
    </div>
  )
}

/** 外观主题三选一（浅色/深色/跟随系统），即时生效并持久化 */
function AppearanceCard() {
  const { preference, setPreference } = useTheme()
  const options: { value: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="h-4 w-4 text-brand" /> 外观
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              aria-pressed={preference === value}
              className={cn(
                'flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                preference === value
                  ? 'border-brand/60 bg-brand-soft font-semibold text-accent-foreground'
                  : 'border-border text-muted-foreground hover:border-brand/35 hover:bg-accent/40 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          主题选择保存在本机浏览器；「跟随系统」将随 Windows 深浅色设置自动切换。
        </p>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({ base_directory: '', install_directory: '', doc_directory: '', anthropic_api_key: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getConfig().then(res => {
      if (res.success && res.data) setConfig(res.data)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.updateConfig(config)
      if (res.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-10">
      <div className="pt-1">
        <h2 className="text-xl font-semibold tracking-tight">系统设置</h2>
        <p className="mt-1 text-sm text-muted-foreground">目录约定与智能体密钥，保存后立即生效。</p>
      </div>

      <AppearanceCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">目录配置</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <DirField
              label="安装包基础目录"
              hint="存放安装包的根目录"
              value={config.base_directory}
              placeholder="例如: D:\Installation"
              onChange={v => setConfig({ ...config, base_directory: v })}
            />
            <DirField
              label="应用安装目录"
              hint="应用默认的安装目标目录"
              value={config.install_directory}
              placeholder="例如: D:\Software"
              onChange={v => setConfig({ ...config, install_directory: v })}
            />
            <DirField
              label="文档存储目录"
              hint="文档 .txt 文件保存到此目录，按分类自动创建子文件夹"
              value={config.doc_directory}
              placeholder="例如: D:\Documents"
              onChange={v => setConfig({ ...config, doc_directory: v })}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Claude API Key</label>
              <p className="text-xs text-muted-foreground">自动安装智能体 LLM 决策所用密钥（环境变量 ANTHROPIC_API_KEY 优先；留空则用规则模式）</p>
              <Input
                type="password"
                value={config.anthropic_api_key}
                onChange={e => setConfig({ ...config, anthropic_api_key: e.target.value })}
                placeholder="sk-ant-..."
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? '保存中...' : '保存设置'}
              </Button>
              {saved && (
                <span className="flex animate-in items-center gap-1.5 text-sm text-success fade-in">
                  <CheckCircle className="h-4 w-4" /> 已保存
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
