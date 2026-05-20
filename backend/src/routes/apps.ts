import { Router, Request, Response } from 'express'
import { getDb, saveDb } from '../database'
import { v4 as uuid } from 'uuid'
import type { ApiResponse, AppInfo, AppConfig } from '../types'

const router = Router()

// 辅助：执行 SELECT 并返回对象数组
function queryAll(db: any, sql: string, params: any[] = []): Record<string, any>[] {
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows: Record<string, any>[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } catch {
    return []
  }
}

// 辅助：执行 INSERT/UPDATE/DELETE
function execute(db: any, sql: string, params: any[] = []) {
  db.run(sql, params)
  saveDb()
}

// 获取所有分类及应用
router.get('/categories', async (_req: Request, res: Response) => {
  const db = await getDb()
  const categories = queryAll(db, 'SELECT * FROM categories')
  const result = categories.map((cat: any) => {
    const apps = queryAll(db,
      `SELECT a.*, c.name as category FROM apps a
       JOIN categories c ON a.category_id = c.id
       WHERE a.category_id = ?`,
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
     WHERE c.name = ?`,
    [req.params.name]
  ).map((a: any) => ({ ...a, is_installed: !!a.is_installed }))
  res.json({ success: true, data: apps } as ApiResponse)
})

// 添加应用
router.post('/apps', async (req: Request, res: Response) => {
  const db = await getDb()
  const { name, version, path, description, category, exe_pkg, zip_pkg } = req.body as {
    name: string; version?: string; path?: string; description?: string
    category: string; exe_pkg?: string; zip_pkg?: string
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
  execute(db,
    `INSERT INTO apps (id, name, version, path, description, category_id, exe_pkg, zip_pkg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [appId, name, version || '', path || '', description || '', cat.id, exe_pkg || '', zip_pkg || '']
  )
  res.json({
    success: true,
    data: { id: appId, name, version: version || '', path: path || '', description: description || '',
            is_installed: false, exe_pkg: exe_pkg || '', zip_pkg: zip_pkg || '', category }
  } as ApiResponse)
})

// 删除应用
router.delete('/apps/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  execute(db, 'DELETE FROM apps WHERE id = ?', [req.params.id])
  res.json({ success: true, message: '应用已删除' })
})

// 更新应用
router.patch('/apps/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  const updates = req.body as Record<string, any>
  const allowed = ['name', 'version', 'path', 'description', 'is_installed', 'exe_pkg', 'zip_pkg']
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
  values.push(req.params.id)
  execute(db, `UPDATE apps SET ${sets.join(', ')} WHERE id = ?`, values)
  res.json({ success: true, message: '更新成功' })
})

// 配置
router.get('/config', async (_req: Request, res: Response) => {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT key, value FROM config') as any[]
  const config: AppConfig = {
    base_directory: rows.find((r: any) => r.key === 'base_directory')?.value || '',
    install_directory: rows.find((r: any) => r.key === 'install_directory')?.value || '',
    doc_directory: rows.find((r: any) => r.key === 'doc_directory')?.value || ''
  }
  res.json({ success: true, data: config } as ApiResponse)
})

router.put('/config', async (req: Request, res: Response) => {
  const db = await getDb()
  const { base_directory, install_directory, doc_directory } = req.body as Partial<AppConfig>
  if (base_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [base_directory, 'base_directory'])
  }
  if (install_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [install_directory, 'install_directory'])
  }
  if (doc_directory !== undefined) {
    execute(db, 'UPDATE config SET value = ? WHERE key = ?', [doc_directory, 'doc_directory'])
  }
  res.json({ success: true, message: '配置已更新' })
})

export default router
