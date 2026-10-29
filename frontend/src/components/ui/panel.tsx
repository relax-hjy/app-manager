import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * 右侧详情面板壳：头部（可含标题行）、可滚动内容区、固定底部操作区。
 * 应用 / 安装包 / 文档三处详情面板共用，统一钻切卡片质感。
 */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <aside
      className={cn(
        'flex shrink-0 animate-in slide-in-from-right-4 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm fade-in-0 duration-200',
        className
      )}
    >
      {children}
    </aside>
  )
}

/** 面板滚动内容区 */
export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 space-y-4 overflow-auto p-5', className)}>{children}</div>
}

/** 面板底部固定操作区 */
export function PanelFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('shrink-0 space-y-2 border-t border-border/70 p-5', className)}>{children}</div>
}
