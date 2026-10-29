import { cn } from '../../lib/utils'

/** 安装状态小徽章：替代原先散落各页的硬编码内联样式 chip */
export function StatusChip({ installed, className }: { installed: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        installed ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', installed ? 'bg-success' : 'bg-danger')} />
      {installed ? '已安装' : '未安装'}
    </span>
  )
}
