import { useState, useEffect } from 'react'
import type { AppConfig } from '../types'
import * as api from '../api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({ base_directory: '', install_directory: '', doc_directory: '' })
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
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">系统设置</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">目录配置</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">安装包基础目录</label>
              <p className="text-xs text-muted-foreground">存放安装包的根目录</p>
              <Input
                value={config.base_directory}
                onChange={e => setConfig({ ...config, base_directory: e.target.value })}
                placeholder="例如: D:\Installation"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">应用安装目录</label>
              <p className="text-xs text-muted-foreground">应用默认的安装目标目录</p>
              <Input
                value={config.install_directory}
                onChange={e => setConfig({ ...config, install_directory: e.target.value })}
                placeholder="例如: D:\Software"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">文档存储目录</label>
              <p className="text-xs text-muted-foreground">文档 .txt 文件保存到此目录，按分类自动创建子文件夹</p>
              <Input
                value={config.doc_directory}
                onChange={e => setConfig({ ...config, doc_directory: e.target.value })}
                placeholder="例如: D:\Documents"
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? '保存中...' : '保存设置'}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
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
