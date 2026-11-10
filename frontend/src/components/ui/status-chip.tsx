import { cn } from '../../lib/utils'

/** 安装状态小徽章：药丸形 + 发丝线描边 + 色点，灰阶文字不抢主色 */
export function StatusChip({ installed, className }: { installed: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground',
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', installed ? 'bg-success' : 'bg-muted-foreground/60')} />
      {installed ? '已安装' : '未安装'}
    </span>
  )
}
