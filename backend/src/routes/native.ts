import { Router, Request, Response } from 'express'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getDb, saveDb } from '../database'

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
  const rows = (() => {
    try {
      const stmt = db.prepare('SELECT value FROM config WHERE key = ?')
      stmt.bind(['base_directory'])
      const results: any[] = []
      while (stmt.step()) results.push(stmt.getAsObject())
      stmt.free()
      return results
    } catch { return [] }
  })()
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

// 保存文档内容到文件
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

export default router
