import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/utils'
import { Boxes, FileText, Package, Settings, Wrench } from 'lucide-react'

const navItems = [
  { to: '/apps', label: '应用管理', icon: Boxes },
  { to: '/pkgs', label: '安装包管理', icon: Package },
  { to: '/docs', label: '文档管理', icon: FileText },
]

export default function Layout() {
  return (
    <div className="flex h-screen flex-col">
      {/* 顶部导航 */}
      <header className="flex items-center h-12 bg-card border-b shrink-0 px-5 gap-1">
        <div className="flex items-center gap-2.5 mr-6">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Wrench className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Softwares Manager</span>
        </div>

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ml-1',
              isActive
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
            )
          }
        >
          <Settings className="h-4 w-4" />
          系统设置
        </NavLink>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
