import type { ReactNode } from 'react'
import { paletteOf } from '../lib/palette'
import { cn } from '../lib/utils'

/** 卡片/面板头部所需的最小应用字段（兼容完整 AppInfo） */
interface AppLite {
  id: string
  name: string
  category: string
  version: string
  path: string
  is_installed: boolean
}

/** 应用图标瓦片：已安装取真实图标，否则类目色首字瓦片；图标加载失败回退首字 */
export function AppIconTile({ app, iconUrl, className = 'h-10 w-10' }: { app: AppLite; iconUrl: string; className?: string }) {
  const showIcon = !!(app.path && app.is_installed)
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-bold ${
        showIcon ? 'bg-card ring-1 ring-border' : `${paletteOf(app.category).bg} text-white`
      } ${className}`}
    >
      {showIcon ? (
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={e => {
            const img = e.target as HTMLImageElement
            img.style.display = 'none'
            const fallback = img.nextElementSibling as HTMLElement
            if (fallback) fallback.style.display = ''
          }}
        />
      ) : null}
      <span className="text-sm" style={showIcon ? { display: 'none' } : undefined}>
        {app.name.charAt(0)}
      </span>
    </div>
  )
}

/**
 * 应用标题区（图标 + 名称 + 类目/版本 + 状态），卡片与详情面板共用。
 * 名称独占一行，类目、版本与状态放在次行，避免状态徽章挤占应用名。
 * trailing 放右上角操作（详情面板的关闭按钮），status 放次行右侧（安装状态）。
 */
export function AppCardHead({ app, iconUrl, trailing, status, className }: {
  app: AppLite
  iconUrl: string
  trailing?: ReactNode
  status?: ReactNode
  /** 覆盖外层内边距：详情面板内已由 PanelBody 留白，传 p-0 去掉重复间距 */
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 p-4 pb-2', className)}>
      <AppIconTile app={app} iconUrl={iconUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-foreground" title={app.name}>
            {app.name}
          </div>
          {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
        </div>
        {/* @container：卡片被挤窄（多列 + 详情面板）时版本号放不下，整段隐藏，避免截成「· v1…」这种残句 */}
        <div className="@container/meta mt-1 flex min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={app.version ? `${app.category} · v${app.version}` : app.category}
          >
            {app.category}
            {app.version && (
              <span className="hidden text-muted-foreground/60 @[170px]/meta:inline"> · v{app.version}</span>
            )}
          </span>
          {status && <div className="shrink-0">{status}</div>}
        </div>
      </div>
    </div>
  )
}
