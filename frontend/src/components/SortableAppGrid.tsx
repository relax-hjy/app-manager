import type { CSSProperties, ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AppInfo } from '../types'

export interface SortableAppGridProps {
  /** 当前可见的应用列表（有序） */
  apps: AppInfo[]
  /** 拖拽落定后回调新顺序（由页面负责持久化） */
  onReorder: (newOrder: AppInfo[]) => void
  /** 禁用拖拽（如弹窗打开时） */
  disabled?: boolean
  /** 网格列数：详情面板关闭 4 列、打开 3 列（轨道宽度恒定，前三列位置不变） */
  cols?: 3 | 4
  /** 卡片内容渲染（各页保留自己的卡片布局） */
  renderItem: (app: AppInfo, ctx: { isDragging: boolean }) => ReactNode
}

/**
 * 可拖拽排序的应用卡片网格。
 * 2D 网格使用 rectSortingStrategy；PointerSensor 以 8px 位移阈值区分点击与拖动，
 * 点击卡片打开详情、拖动卡片排序互不干扰。
 */
export default function SortableAppGrid({ apps, onReorder, disabled, cols = 4, renderItem }: SortableAppGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** 拖拽结束：位置变化时把 arrayMove 后的新顺序回调给页面 */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = apps.findIndex(a => a.id === active.id)
    const newIndex = apps.findIndex(a => a.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(apps, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={apps.map(a => a.id)} strategy={rectSortingStrategy}>
        <div
          className="grid"
          style={{
            // 轨道宽上限固定（cqw，相对页面容器），列数变化时前三列位置/大小基本不变；
            // minmax(0, …) 允许在边框/滚动条挤占宽度时轻微收缩，避免出现横向滚动条
            gridTemplateColumns: `repeat(${cols}, minmax(0, var(--card-track, 27cqw)))`,
            gap: 'var(--card-gap, 1cqw)',
          }}
        >
          {apps.map(app => (
            <SortableAppItem key={app.id} app={app} disabled={disabled} renderItem={renderItem} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

/**
 * 单个可排序卡片外壳：承载 ref/transform/拖拽监听，
 * 内层由页面渲染原卡片内容（onClick 等保持不变）。
 */
function SortableAppItem({ app, disabled, renderItem }: { app: AppInfo; disabled?: boolean; renderItem: SortableAppGridProps['renderItem'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id, disabled })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 50 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none select-none ${isDragging ? 'opacity-70 shadow-lg ring-1 ring-[#1a1a1a]/20 cursor-grabbing' : ''}`}
    >
      {renderItem(app, { isDragging })}
    </div>
  )
}
