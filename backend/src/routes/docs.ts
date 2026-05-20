import { Router, Request, Response } from 'express'
import { getDb, saveDb } from '../database'
import { v4 as uuid } from 'uuid'
import type { ApiResponse, DocInfo } from '../types'

const router = Router()

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

function execute(db: any, sql: string, params: any[] = []) {
  db.run(sql, params)
  saveDb()
}

// 获取所有文档（支持 ?search= 模糊搜索）
router.get('/', async (req: Request, res: Response) => {
  const db = await getDb()
  const search = (req.query.search as string || '').trim()
  let docs: Record<string, any>[]
  if (search) {
    docs = queryAll(db,
      `SELECT * FROM documents WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR format LIKE ?`,
      [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    )
  } else {
    docs = queryAll(db, 'SELECT * FROM documents ORDER BY rowid DESC')
  }
  res.json({ success: true, data: docs } as ApiResponse)
})

// 添加文档
router.post('/', async (req: Request, res: Response) => {
  const db = await getDb()
  const { name, path, format, category, app_id, description } = req.body as {
    name: string; path?: string; format?: string; category?: string
    app_id?: string; description?: string
  }
  if (!name) {
    res.status(400).json({ success: false, message: '文档名称不能为空' })
    return
  }
  const docId = uuid()
  execute(db,
    `INSERT INTO documents (id, name, path, format, category, app_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [docId, name, path || '', format || '', category || '', app_id || '', description || '']
  )
  res.json({
    success: true,
    data: { id: docId, name, path: path || '', format: format || '', category: category || '',
            app_id: app_id || '', description: description || '' }
  } as ApiResponse)
})

// 更新文档
router.patch('/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  const updates = req.body as Record<string, any>
  const allowed = ['name', 'path', 'format', 'category', 'app_id', 'description']
  const sets: string[] = []
  const values: any[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`)
      values.push(value)
    }
  }
  if (sets.length === 0) {
    res.status(400).json({ success: false, message: '无有效更新字段' })
    return
  }
  values.push(req.params.id)
  execute(db, `UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, values)
  res.json({ success: true, message: '更新成功' })
})

// 删除文档
router.delete('/:id', async (req: Request, res: Response) => {
  const db = await getDb()
  execute(db, 'DELETE FROM documents WHERE id = ?', [req.params.id])
  res.json({ success: true, message: '文档已删除' })
})

// 获取某应用关联的文档
router.get('/by-app/:appId', async (req: Request, res: Response) => {
  const db = await getDb()
  const docs = queryAll(db, 'SELECT * FROM documents WHERE app_id = ?', [req.params.appId])
  res.json({ success: true, data: docs } as ApiResponse)
})

// 获取所有已使用的文档分类
router.get('/categories', async (_req: Request, res: Response) => {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT DISTINCT category FROM documents WHERE category != \'\'')
  res.json({ success: true, data: rows.map((r: any) => r.category) })
})

export default router
