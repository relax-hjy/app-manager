import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { Button } from './ui/button'

/**
 * 主题循环切换按钮：浅色 → 深色 → 跟随系统。
 * 跟随系统态下图标按实际生效主题显示 Sun/Moon。
 */
export default function ThemeToggle() {
  const { preference, theme, toggle } = useTheme()
  const isSystem = preference === 'system'
  const Icon = isSystem ? Monitor : theme === 'dark' ? Moon : Sun
  const label = isSystem ? `跟随系统（当前${theme === 'dark' ? '深色' : '浅色'}）` : theme === 'dark' || preference === 'dark' ? '切换为深色' : '切换为浅色'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={isSystem ? `跟随系统 · 当前${theme === 'dark' ? '深色' : '浅色'}（点击切到浅色）` : preference === 'dark' ? '当前深色（点击切到跟随系统）' : '当前浅色（点击切到深色）'}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
