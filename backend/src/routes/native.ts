import { Router, Request, Response } from 'express'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getDb, queryAll } from '../database'

const router = Router()

// 启动应用（打开 exe 文件）
router.post('/launch', (req: Request, res: Response) => {
  const { filePath } = req.body as { filePath: string }
  if (!filePath) {
    res.status(400).json({ success: false, message: '文件路径不能为空' })
    return
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: `文件不存在: ${filePath}` })
    return
  }

  // Windows: 用 start 命令在新窗口启动，避免阻塞
  const safePath = filePath.replace(/"/g, '\\"')
  exec(`start "" "${safePath}"`, { cwd: path.dirname(filePath) }, (err) => {
    if (err) console.error('[native] launch error:', err.message)
  })

  res.json({ success: true, message: '已启动' })
})

// 打开文件（用默认程序打开）
router.post('/open-file', (req: Request, res: Response) => {
  const { filePath } = req.body as { filePath: string }
  if (!filePath) {
    res.status(400).json({ success: false, message: '文件路径不能为空' })
    return
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: `文件不存在: ${filePath}` })
    return
  }

  const safePath = filePath.replace(/"/g, '\\"')
  exec(`start "" "${safePath}"`, (err) => {
    if (err) console.error('[native] open error:', err.message)
  })

  res.json({ success: true, message: '已打开' })
})

// 打开文件所在目录
router.post('/open-folder', (req: Request, res: Response) => {
  const { filePath } = req.body as { filePath: string }
  if (!filePath) {
    res.status(400).json({ success: false, message: '路径不能为空' })
    return
  }
  let dir: string
  try {
    dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
  } catch {
    dir = path.dirname(filePath)
  }
  if (!fs.existsSync(dir)) {
    res.status(404).json({ success: false, message: `目录不存在: ${dir}` })
    return
  }

  exec(`explorer "${dir}"`, (err) => {
    if (err) console.error('[native] open folder error:', err.message)
  })

  res.json({ success: true, message: '目录已打开' })
})

// 检查文件是否存在
router.post('/check-path', (req: Request, res: Response) => {
  const { filePath } = req.body as { filePath: string }
  const exists = filePath ? fs.existsSync(filePath) : false
  res.json({ success: true, data: { exists, path: filePath } })
})

// 复制安装包到管理目录
router.post('/copy-pkg', async (req: Request, res: Response) => {
  const { sourcePath, appName } = req.body as { sourcePath: string; appName: string }
  if (!sourcePath || !appName) {
    res.status(400).json({ success: false, message: '文件路径和应用名称不能为空' })
    return
  }
  if (!fs.existsSync(sourcePath)) {
    res.status(404).json({ success: false, message: `文件不存在: ${sourcePath}` })
    return
  }

  const db = await getDb()
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['base_directory'])
  const baseDir = rows[0]?.value || ''

  const targetDir = path.join(baseDir, appName)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const filename = path.basename(sourcePath)
  const destPath = path.join(targetDir, filename)
  fs.copyFileSync(sourcePath, destPath)

  res.json({ success: true, data: { path: destPath } })
})

// 扫描文档目录，返回数据库中不存在的文件和领域
// 目录结构: {docDir}/{类型}/{领域}/{文件名}.md
// scope: { format? } 限定类型，{ format?, category? } 限定类型+领域
router.post('/scan-docs', async (req: Request, res: Response) => {
  const db = await getDb()
  const { format, category } = (req.body || {}) as { format?: string; category?: string }
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['doc_directory'])
  const docDir = rows[0]?.value || ''
  if (!docDir) {
    res.json({ success: false, message: '未配置文档目录，请先在系统设置中设置' })
    return
  }
  if (!fs.existsSync(docDir)) {
    res.json({ success: false, message: `文档目录不存在: ${docDir}` })
    return
  }

  // 扫描: docDir → 类型目录 → 领域目录(可选) → 文件
  const foundFiles: { name: string; path: string; format: string; category: string }[] = []
  const allCategories: { format: string; category: string; fileCount: number }[] = []

  function isDocFile(name: string) {
    const ext = path.extname(name).toLowerCase()
    return ext === '.md' || ext === '.pdf'
  }

  function addFile(filePath: string, fmt: string, cat: string) {
    const ext = path.extname(filePath).toLowerCase()
    foundFiles.push({ name: path.basename(filePath, ext), path: filePath, format: fmt, category: cat })
  }

  function scanDir(baseDir: string, fmt: string) {
    if (!fs.existsSync(baseDir)) return
    const entries = fs.readdirSync(baseDir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'))
    const lingyuDirs = entries.filter(e => e.isDirectory())
    const directFiles = entries.filter(e => e.isFile() && isDocFile(e.name))

    for (const file of directFiles) {
      addFile(path.join(baseDir, file.name), fmt, '')
    }
    if (directFiles.length > 0) {
      allCategories.push({ format: fmt, category: '', fileCount: directFiles.length })
    }

    for (const lingyuDir of lingyuDirs) {
      const lingyuPath = path.join(baseDir, lingyuDir.name)
      const files = fs.readdirSync(lingyuPath, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.'))
      const validFiles = files.filter(f => isDocFile(f.name))
      allCategories.push({ format: fmt, category: lingyuDir.name, fileCount: validFiles.length })
      for (const file of validFiles) {
        addFile(path.join(lingyuPath, file.name), fmt, lingyuDir.name)
      }
    }
  }

  if (format && category) {
    // 限定类型+领域
    scanDir(path.join(docDir, format, category), format)
  } else if (format) {
    // 限定类型
    scanDir(path.join(docDir, format), format)
  } else {
    // 全局扫描
    const typeDirs = fs.readdirSync(docDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))
    for (const typeDir of typeDirs) {
      scanDir(path.join(docDir, typeDir.name), typeDir.name)
    }
    // 文件直接在 docDir 下
    const rootFiles = fs.readdirSync(docDir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.') && isDocFile(e.name))
    for (const file of rootFiles) {
      addFile(path.join(docDir, file.name), '', '')
    }
  }

  // 获取数据库中已存在的路径和领域（限定范围内的）
  let existingPaths: Set<string>
  let existingCatKeys: Set<string>
  if (format && category) {
    const catRows = queryAll(db, 'SELECT path FROM documents WHERE path != \'\' AND format = ? AND category = ?', [format, category])
    existingPaths = new Set(catRows.map((r: any) => r.path))
    existingCatKeys = new Set([`${format}|||${category}`])
  } else if (format) {
    const catRows = queryAll(db, 'SELECT path FROM documents WHERE path != \'\' AND format = ?', [format])
    existingPaths = new Set(catRows.map((r: any) => r.path))
    const catEntries = queryAll(db, 'SELECT DISTINCT format, category FROM documents WHERE category != \'\' AND format = ?', [format])
    existingCatKeys = new Set(catEntries.map((r: any) => `${r.format}|||${r.category}`))
  } else {
    const allPathRows = queryAll(db, 'SELECT path FROM documents WHERE path != \'\'')
    existingPaths = new Set(allPathRows.map((r: any) => r.path))
    const allCatEntries = queryAll(db, 'SELECT DISTINCT format, category FROM documents WHERE category != \'\'')
    existingCatKeys = new Set(allCatEntries.map((r: any) => `${r.format}|||${r.category}`))
  }

  const newFiles = foundFiles.filter(f => !existingPaths.has(f.path))
  const newCategories = allCategories.filter(c => !existingCatKeys.has(`${c.format}|||${c.category}`))

  // 检查 DB 中哪些文档对应的文件已失效（限定范围内）
  let dbDocs: any[]
  if (format && category) {
    dbDocs = queryAll(db, 'SELECT id, name, path, format, category FROM documents WHERE format = ? AND category = ?', [format, category])
  } else if (format) {
    dbDocs = queryAll(db, 'SELECT id, name, path, format, category FROM documents WHERE format = ?', [format])
  } else {
    dbDocs = queryAll(db, 'SELECT id, name, path, format, category FROM documents')
  }
  const deletedDocs: { id: string; name: string; path: string; format: string; category: string }[] = []
  for (const doc of dbDocs) {
    if (!doc.path || !fs.existsSync(doc.path)) {
      deletedDocs.push({ id: doc.id, name: doc.name, path: doc.path || '', format: doc.format || '', category: doc.category || '' })
    }
  }

  res.json({
    success: true,
    data: {
      docDir,
      newFiles,
      newCategories,
      allCategories,
      deletedDocs,
      totalScanned: foundFiles.length,
      totalNew: newFiles.length,
    }
  })
})

// 保存文档内容到文件
// 目录结构: {docDir}/{format}/{category}/{name}.{ext}
router.post('/save-doc', (req: Request, res: Response) => {
  const { filePath, content } = req.body as { filePath: string; content: string }
  if (!filePath) {
    res.status(400).json({ success: false, message: '文件路径不能为空' })
    return
  }
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  res.json({ success: true, data: { path: filePath } })
})

// 确保默认类型目录存在
router.post('/ensure-doc-dirs', async (req: Request, res: Response) => {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['doc_directory'])
  const docDir = rows[0]?.value || ''
  if (!docDir) {
    res.json({ success: false, message: '未配置文档目录' })
    return
  }
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true })
  }
  const types = ['知识总结', '工具指南', '参考文档', '工作日记', '其他']
  const created: string[] = []
  for (const t of types) {
    const dir = path.join(docDir, t)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
      created.push(t)
    }
  }
  res.json({ success: true, message: created.length ? `已创建目录: ${created.join('、')}` : '所有类型目录已存在', data: { created } })
})

// 删除空领域及其目录
router.post('/delete-category', async (req: Request, res: Response) => {
  const { format, category } = req.body as { format: string; category: string }
  if (!format || !category) {
    res.status(400).json({ success: false, message: '类型和领域不能为空' })
    return
  }

  const db = await getDb()
  const count = queryAll(db,
    'SELECT COUNT(*) as cnt FROM documents WHERE format = ? AND category = ?',
    [format, category]
  )[0]?.cnt || 0

  if (count > 0) {
    res.json({ success: false, message: `该领域下还有 ${count} 个文档，无法删除` })
    return
  }

  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['doc_directory'])
  const docDir = rows[0]?.value || ''
  if (!docDir) {
    res.json({ success: false, message: '未配置文档目录' })
    return
  }

  const dirPath = path.join(docDir, format, category)
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true })
  }

  res.json({ success: true, message: `已删除领域目录: ${format}/${category}` })
})

export default router
