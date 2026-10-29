/** 类目 / 文档类型调色板：低饱和 OKLCH 实心底 + 白字瓦片；text 走双主题，深色下提亮保证图标与正文可读 */

export interface PaletteTile {
  /** 文字/图标色 class，含 dark 变体（列表图标用） */
  text: string
  /** 实心背景 class（图标瓦片用，白字在其上均 ≥4.9:1） */
  bg: string
}

/** 6 色去饱和调色板（类目名哈希取色）：色相保留用于区分，彩度压低避免与品牌靛蓝抢眼 */
export const PALETTE: PaletteTile[] = [
  { text: 'text-[oklch(0.48_0.03_262)] dark:text-[oklch(0.8_0.03_262)]', bg: 'bg-[oklch(0.48_0.03_262)]' },
  { text: 'text-[oklch(0.46_0.065_158)] dark:text-[oklch(0.78_0.07_158)]', bg: 'bg-[oklch(0.46_0.065_158)]' },
  { text: 'text-[oklch(0.55_0.085_62)] dark:text-[oklch(0.8_0.085_62)]', bg: 'bg-[oklch(0.55_0.085_62)]' },
  { text: 'text-[oklch(0.52_0.105_25)] dark:text-[oklch(0.78_0.1_25)]', bg: 'bg-[oklch(0.52_0.105_25)]' },
  { text: 'text-[oklch(0.5_0.1_300)] dark:text-[oklch(0.78_0.1_300)]', bg: 'bg-[oklch(0.5_0.1_300)]' },
  { text: 'text-[oklch(0.5_0.07_195)] dark:text-[oklch(0.8_0.08_195)]', bg: 'bg-[oklch(0.5_0.07_195)]' },
]

/** 按名称哈希稳定取一色 */
export function paletteOf(name: string): PaletteTile {
  let hash = 0
  for (const c of name) hash = ((hash << 5) - hash) + c.charCodeAt(0)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/** 文档类型 → 调色板（未知名走哈希） */
export const TYPE_TILE: Record<string, PaletteTile> = {
  '知识总结': PALETTE[1],
  '工具指南': PALETTE[5],
  '参考文档': PALETTE[4],
  '工作日记': PALETTE[2],
  '其他': PALETTE[0],
}
