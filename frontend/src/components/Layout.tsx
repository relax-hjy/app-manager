import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/utils'
import { Boxes, FileText, Package, Settings } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

/** 菱形 Logo：靛蓝钻切渐变，双轴对称，小尺寸下锐利 */
function DiamondLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="diamond-grad" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="oklch(0.9 0.07 280)" />
          <stop offset="0.55" stopColor="oklch(0.72 0.16 277)" />
          <stop offset="1" stopColor="oklch(0.52 0.22 272)" />
        </linearGradient>
      </defs>
      <path
        d="M16 7L25 16L16 25L7 16Z"
        fill="url(#diamond-grad)"
        stroke="url(#diamond-grad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M16 7L16 25M7 16L25 16" stroke="oklch(0.28 0.1 272 / 0.4)" strokeWidth="0.8" />
    </svg>
  )
}

const navItems = [
  { to: '/apps', label: '应用管理', icon: Boxes },
  { to: '/pkgs', label: '安装包管理', icon: Package },
  { to: '/docs', label: '文档管理', icon: FileText },
]

/** 导航链接统一样式：激活态扁平浅底药丸，无左侧标记（Linear 式） */
function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
    isActive
      ? 'bg-secondary font-medium text-secondary-foreground'
      : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
  )
}

export default function Layout() {
  return (
    <div className="relative flex h-screen flex-col">
      {/* 顶部导航：48px 发丝线底边，扁平无卡片底 */}
      <header className="relative z-10 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-4">
        <div className="mr-6 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card">
            <DiamondLogo className="h-4 w-4" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">
            App<span className="text-muted-foreground">Manager</span>
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <ThemeToggle />

        <NavLink to="/settings" className={navClass}>
          <Settings className="h-4 w-4" />
          系统设置
        </NavLink>
      </header>

      {/* 内容区 */}
      <main className="relative z-10 flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
