import type { ReactNode } from 'react'
import type { AppCategory } from '../types'
import { cn } from '../lib/utils'
import { paletteOf } from '../lib/palette'
import { Button } from './ui/button'
import { Plus, X } from 'lucide-react'

/** 侧栏单行：图标 + 文本 + 计数 +（可选悬停删除）；选中态用琥珀钻切标记 */
function NavRow({
  selected,
  onSelect,
  icon,
  iconClass,
  label,
  count,
  onDelete,
  deleteTitle,
}: {
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  iconClass?: string
  label: string
  count?: number
  onDelete?: () => void
  deleteTitle?: string
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected
          ? 'bg-brand-soft font-semibold text-accent-foreground before:absolute before:inset-y-[22%] before:left-[6px] before:w-[2px] before:rounded-full before:bg-brand before:content-[""]'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-secondary-foreground'
      )}
    >
      <span className={cn('h-4 w-4 shrink-0', iconClass)}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {typeof count === 'number' && (
        <span className={cn('w-5 shrink-0 text-right text-xs', selected ? 'text-accent-foreground/70' : 'text-muted-foreground/60')}>
          {count}
        </span>
      )}
      {onDelete ? (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title={deleteTitle}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <span className="shrink-0 w-4" />
      )}
    </div>
  )
}

/**
 * 工具类目侧栏（应用/安装包页共用）：
 * 「全部工具」+ 哈希着色类目列表，支持新增与删除；底部可挂自定义内容（如智能体卡片）。
 */
export default function CategorySidebar({
  title,
  categories,
  selected,
  allLabel = '全部工具',
  allCount,
  allIcon,
  onSelect,
  onAdd,
  onDeleteCat,
  footer,
  iconFor,
}: {
  title: string
  categories: AppCategory[]
  selected: string
  allLabel?: string
  allCount?: number
  allIcon: ReactNode
  /** 由页面注入类目名 → 图标组件 */
  iconFor: (name: string) => React.ComponentType<{ className?: string }>
  onSelect: (key: string) => void
  /** 传 onAdd 才显示新增按钮（安装包页不开放类目增删） */
  onAdd?: () => void
  onDeleteCat?: (name: string) => void
  footer?: ReactNode
}) {
  return (
    <aside
      className="flex h-full flex-none flex-col rounded-xl border border-border bg-card pb-2 shadow-sm"
      style={{ width: 'var(--side-w)' }}
    >
      <div className="flex items-center justify-between px-3 pt-4 pb-3">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
        {onAdd && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-brand hover:bg-brand-soft" onClick={onAdd} title={`新增${title}`}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1">
        <NavRow
          selected={selected === '__all__'}
          onSelect={() => onSelect('__all__')}
          icon={allIcon}
          iconClass={selected === '__all__' ? 'text-brand' : undefined}
          label={allLabel}
          count={allCount}
        />
        {categories.map(cat => {
          const Icon = iconFor(cat.name)
          return (
            <NavRow
              key={cat.name}
              selected={selected === cat.name}
              onSelect={() => onSelect(cat.name)}
              icon={<Icon className="h-4 w-4" />}
              iconClass={selected === cat.name ? undefined : paletteOf(cat.name).text}
              label={cat.name}
              count={cat.apps.length}
              onDelete={onDeleteCat ? () => { if (confirm(`删除类目「${cat.name}」？`)) onDeleteCat(cat.name) } : undefined}
              deleteTitle={`删除类目 ${cat.name}`}
            />
          )
        })}
      </div>
      {footer && <div className="mt-auto px-1 pt-2">{footer}</div>}
    </aside>
  )
}
