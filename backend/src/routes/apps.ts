import { Router, Request, Response } from 'express'
import { getDb, queryAll, execute, saveDb } from '../database'
import { startFindTask } from '../agent/find-download'
import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs'
import type { ApiResponse, AppInfo, AppConfig } from '../types'

const router = Router()

// 图标缓存目录
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons')

// 获取所有分类及应用
router.get('/categories', async (_req: Request, res: Response) => {
  const db = await getDb()
  const categories = queryAll(db, 'SELECT * FROM categories')
  const result = categories.map((cat: any) => {
    const apps = queryAll(db,
      `SELECT a.*, c.name as category FROM apps a
       JOIN categories c ON a.category_id = c.id
       WHERE a.category_id = ?
       ORDER BY a.sort_order ASC, a.rowid ASC`,
      [cat.id]
    ).map((a: any) => ({ ...a, is_installed: !!a.is_installed }))
    return { name: cat.name, apps }
  })
  res.json({ success: true, data: result } as ApiResponse)
})

// 添加分类
router.post('/categories', async (req: Request, res: Response) => {
  const { name } = req.body as { name: string }
  if (!name) {
    res.status(400).json({ success: false, message: '分类名称不能为空' })
    return
  }
  const db = await getDb()
  const existing = queryAll(db, 'SELECT id FROM categories WHERE name = ?', [name])
  if (existing.length > 0) {
    res.status(400).json({ success: false, message: '分类已存在' })
    return
  }
  execute(db, 'INSERT INTO categories (name) VALUES (?)', [name])
  res.json({ success: true, message: '分类创建成功' })
})

// 删除分类
router.delete('/categories/:name', async (req: Request, res: Response) => {
  const db = await getDb()
  execute(db, 'DELETE FROM categories WHERE name = ?', [req.params.name])
  res.json({ success: true, message: '分类已删除' })
})

// 获取某分类下的应用
router.get('/categories/:name/apps', async (req: Request, res: Response) => {
  const db = await getDb()
  const apps = queryAll(db,
    `SELECT a.*, c.name as category FROM apps a
     JOIN categories c ON a.category_id = c.id
     WHERE c.name = ?
     ORDER BY a.sort_order ASC, a.rowid ASC`,
    [req.params.name]
  ).map((a: any) => ({ ...a, is_installed: !!a.is_installed }))
  res.json({ success: true, data: apps } as ApiResponse)
})

// 添加应用
router.post('/apps', async (req: Request, res: Response) => {
  const db = await getDb()
  const { name, version, path, description, category, exe_pkg, zip_pkg, download_url } = req.body as {
    name: string; version?: string; path?: string; description?: string
    category: string; exe_pkg?: string; zip_pkg?: string; download_url?: string
  }
  if (!name || !category) {
    res.status(400).json({ success: false, message: '应用名称和分类不能为空' })
    return
  }
  const cat = queryAll(db, 'SELECT id FROM categories WHERE name = ?', [category])[0] as any
  if (!cat) {
    res.status(400).json({ success: false, message: '分类不存在' })
    return
  }
  const appId = uuid()
  // 新应用排到全局末尾（类目视图与全部工具视图均在最后）
  const next = queryAll(db, 'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM apps')[0] as { n: number }
  execute(db,
    `INSERT INTO apps (id, name, version, path, description, category_id, exe_pkg, zip_pkg, download_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [appId, name, version || '', path || '', description || '', cat.id, exe_pkg || '', zip_pkg || '', download_url || '', next.n]
  )
  // 注册后自动查找下载链接（fire-and-forget，仅当未提供 download_url 且 LLM 可用）
  let findStarted = false
  if (!(download_url || '').trim()) {
    const task = await startFindTask(appId, { auto: true })
    findStarted = task !== null
  }
  res.json({
    success: true,
    data: { id: appId, name, version: version || '', path: path || '', description: description || '',
            is_installed: false, exe_pkg: exe_pkg || '', zip_pkg: zip_pkg || '', download_url: download_url || '', category, sort_order: next.n, findStarted }
  } as ApiResponse)
})

// 删除应用
router.delete('/apps/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  execute(db, 'DELETE FROM apps WHERE id = ?', [req.params.id])
  res.json({ success: true, message: '应用已删除' })
})

/**
 * 将可见子集的 sort_order 键多重集按新视觉顺序重赋值。
 * 不可见应用的键不动，因此类目视图与全部工具视图共用同一规则，键永远唯一。
 * @param rows - 可见应用的当前 id 与 sort_order
 * @param newOrderIds - 拖拽后可见应用的新顺序（可为全部应用的子集）
 * @returns 新的 id → sort_order 赋值列表
 */
export function reassignVisibleSortOrders(
  rows: { id: string; sort_order: number }[],
  newOrderIds: string[]
): { id: string; sort_order: number }[] {
  const keys = rows.map(r => r.sort_order).sort((a, b) => a - b)
  return newOrderIds.map((id, i) => ({ id, sort_order: keys[i] }))
}

// 批量保存拖拽排序（必须注册在 /apps/:id 之前，否则被 :id 路由吞掉）
router.patch('/apps/reorder', async (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(i => typeof i !== 'string')) {
    res.status(400).json({ success: false, message: 'ids 必须是非空字符串数组' })
    return
  }
  const db = await getDb()
  const rows = queryAll(db,
    `SELECT id, sort_order FROM apps WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  ) as { id: string; sort_order: number }[]
  if (rows.length !== ids.length) {
    res.status(400).json({ success: false, message: '存在无效的应用 id' })
    return
  }
  const assignments = reassignVisibleSortOrders(rows, ids)
  for (const a of assignments) {
    db.run('UPDATE apps SET sort_order = ? WHERE id = ?', [a.sort_order, a.id])
  }
  saveDb()
  res.json({ success: true, data: assignments } as ApiResponse)
})

// 更新应用
router.patch('/apps/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  const appId = req.params.id
  const updates = req.body as Record<string, any>
  const allowed = ['name', 'version', 'path', 'description', 'is_installed', 'exe_pkg', 'zip_pkg', 'download_url']
  const sets: string[] = []
  const values: any[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'category') {
      const cat = queryAll(db, 'SELECT id FROM categories WHERE name = ?', [value])[0] as any
      if (!cat) {
        res.status(400).json({ success: false, message: '分类不存在' })
        return
      }
      sets.push('category_id = ?')
      values.push(cat.id)
    } else if (allowed.includes(key)) {
      sets.push(`${key} = ?`)
      values.push(key === 'is_installed' ? (value ? 1 : 0) : value)
    }
  }
  if (sets.length === 0) {
    res.status(400).json({ success: false, message: '无有效更新字段' })
    return
  }
  values.push(appId)
  execute(db, `UPDATE apps SET ${sets.join(', ')} WHERE id = ?`, values)

  // 如果更新了 path，清除图标缓存，强制重新提取
  if (updates.path !== undefined) {
    const iconPath = path.join(ICONS_DIR, `${appId}.png`)
    if (fs.existsSync(iconPath)) {
      try {
        fs.unlinkSync(iconPath)
        console.log(`[apps] cleared icon cache for app ${appId}`)
      } catch (err) {
        console.error(`[apps] failed to clear icon cache:`, err)
      }
    }
  }

  res.json({ success: true, message: '更新成功' })
})

// 配置
router.get('/config', async (_req: Request, res: Response) => {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT key, value FROM config') as any[]
  const config: AppConfig = {
    base_directory: rows.find((r: any) => r.key === 'base_directory')?.value || '',
    install_directory: rows.find((r: any) => r.key === 'install_directory')?.value || '',
    doc_directory: rows.find((r: any) => r.key === 'doc_directory')?.value || '',
    anthropic_api_key: rows.find((r: any) => r.key === 'anthropic_api_key')?.value || ''
  }
  res.json({ success: true, data: config } as ApiResponse)
})

router.put('/config', async (req: Request, res: Response) => {
  const db = await getDb()
  const { base_directory, install_directory, doc_directory, anthropic_api_key } = req.body as Partial<AppConfig>
  if (base_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [base_directory, 'base_directory'])
  }
  if (install_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [install_directory, 'install_directory'])
  }
  if (doc_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [doc_directory, 'doc_directory'])
  }
  if (anthropic_api_key !== undefined) {
    // 允许清空（回退环境变量）；不存在则插入
    const existing = queryAll(db, 'SELECT key FROM config WHERE key = ?', ['anthropic_api_key'])
    if (existing.length > 0) {
      execute(db, 'UPDATE config SET value = ? WHERE key = ?', [anthropic_api_key, 'anthropic_api_key'])
    } else {
      execute(db, 'INSERT INTO config (key, value) VALUES (?, ?)', ['anthropic_api_key', anthropic_api_key])
    }
  }
  res.json({ success: true, message: '配置已更新' })
})

export default router
