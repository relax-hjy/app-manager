import { cn } from '../../lib/utils'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = forwardRef<
  HTMLDivElement, ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'end', sideOffset = 4, ...props }, ref) => (
  // Portal 渲染避开滚动容器裁剪；popper 定位贴近触发器并在视口边缘自动翻转/避让
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // always：每帧跟随锚点重定位；optimized 模式下滚动容器内滚动不触发重算，弹层会悬空
      updatePositionStrategy="always"
      className={cn(
        'z-50 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-[#e5e6e8] bg-white p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
