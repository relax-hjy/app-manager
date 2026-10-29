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
  /** 卡片内容渲染（各页保留自己的卡片布局） */
  renderItem: (app: AppInfo, ctx: { isDragging: boolean }) => ReactNode
}

/**
 * 可拖拽排序的应用卡片网格。
 * 2D 网格使用 rectSortingStrategy；PointerSensor 以 8px 位移阈值区分点击与拖动，
 * 点击卡片打开详情、拖动卡片排序互不干扰。
 * 列数与轨道宽完全由 .app-shell 的 CSS 变量决定（见 index.css），组件不感知宽度。
 */
export default function SortableAppGrid({ apps, onReorder, disabled, renderItem }: SortableAppGridProps) {
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
        <div className="app-grid">
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
      // 拖拽中保持不透明：opacity<1 会让下层卡片透上来；rounded-xl 让 ring 跟随卡片圆角，避免方形双边框
      className={`touch-none select-none ${isDragging ? 'z-10 rounded-xl bg-card shadow-[0_20px_40px_-16px_oklch(0.2_0.03_264/0.45)] ring-2 ring-brand/45 cursor-grabbing dark:shadow-[0_24px_44px_-16px_oklch(0.05_0.02_262/0.8)]' : ''}`}
    >
      {renderItem(app, { isDragging })}
    </div>
  )
}
