import { Router, Request, Response } from 'express'
import { exec } from 'child_process'
import { randomUUID } from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { getDb, queryAll } from '../database'

const router = Router()

// 图标缓存目录
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons')

// 从 EXE 提取图标（通过应用 ID）
router.get('/icon/:appId', async (req: Request, res: Response) => {
  const db = await getDb()
  const rows = queryAll(db, 'SELECT path FROM apps WHERE id = ?', [req.params.appId]) as any[]
  if (!rows.length || !rows[0].path) {
    res.status(404).json({ success: false, message: '应用不存在或未设置路径' })
    return
  }

  const exePath = rows[0].path
  if (!fs.existsSync(exePath)) {
    res.status(404).json({ success: false, message: `文件不存在: ${exePath}` })
    return
  }

  // 检查缓存
  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true })
  const iconPath = path.join(ICONS_DIR, `${req.params.appId}.png`)
  if (fs.existsSync(iconPath)) {
    res.sendFile(iconPath)
    return
  }

  // 用 PowerShell 提取图标（写入临时脚本文件避免转义问题）
  const tmpPath = path.join(ICONS_DIR, `tmp-${randomUUID()}.png`)
  const scriptPath = path.join(ICONS_DIR, `tmp-${randomUUID()}.ps1`)
  const psScript = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${exePath.replace(/'/g, "''")}')
$bmp = $icon.ToBitmap()
$bmp.Save('${tmpPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$icon.Dispose()
`
  fs.writeFileSync(scriptPath, psScript, 'utf-8')

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (err) => {
    // 清理临时脚本
    try { fs.unlinkSync(scriptPath) } catch {}

    if (err) {
      console.error('[native] extract icon error:', err.message)
      res.status(500).json({ success: false, message: '提取图标失败' })
      return
    }
    if (!fs.existsSync(tmpPath)) {
      res.status(500).json({ success: false, message: '图标提取未生成文件' })
      return
    }
    // 重命名为正式缓存文件
    fs.renameSync(tmpPath, iconPath)
    res.sendFile(iconPath)
  })
})

// multer 配置：内存存储，单文件上传
const upload = multer({ storage: multer.memoryStorage() })

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

/** 解析文件选择窗的初始目录：当前路径所在目录优先，否则配置的安装目录；都无效返回空串 */
async function resolvePickInitialDir(currentPath?: string): Promise<string> {
  if (currentPath) {
    const dir = path.dirname(currentPath)
    try {
      if (fs.statSync(dir).isDirectory()) return dir
    } catch { /* 目录不存在则继续回退 */ }
  }
  const db = await getDb()
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['install_directory'])
  const installDir = typeof rows[0]?.value === 'string' ? rows[0].value : ''
  if (installDir) {
    try {
      if (fs.statSync(installDir).isDirectory()) return installDir
    } catch { /* 目录不存在则不指定初始目录 */ }
  }
  return ''
}

// 打开 Windows 原生文件选择窗（应用路径配置用），返回选中文件的完整路径
// 阻塞至用户选择或取消；取消时 data.path 为空串。路径经 Base64 回传，避免中文路径的控制台编码问题
router.post('/pick-file', async (req: Request, res: Response) => {
  const { currentPath } = (req.body || {}) as { currentPath?: string }
  const initialDir = await resolvePickInitialDir(currentPath)

  /** PowerShell 单引号字符串转义 */
  const escapePs = (s: string) => s.replace(/'/g, "''")
  const lines = [
    // 先声明 Per-Monitor V2 DPI 感知：powershell 进程默认无感知，高缩放屏上对话框会被位图拉伸发虚
    '$member = @\'',
    '[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError=true)]',
    'public static extern bool SetProcessDpiAwarenessContext(System.IntPtr dpiContext);',
    '[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError=true)]',
    'public static extern bool SetProcessDPIAware();',
    '\'@',
    'Add-Type -Namespace AppMgr -Name Dpi -MemberDefinition $member',
    '$ok = $false',
    'try { $ok = [AppMgr.Dpi]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { }',
    'if (-not $ok) { try { [void][AppMgr.Dpi]::SetProcessDPIAware() } catch { } }',
    '',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    '$dialog.Title = \'选择应用可执行文件\'',
    '$dialog.Filter = \'可执行文件 (*.exe)|*.exe|所有文件 (*.*)|*.*\'',
    '$dialog.CheckFileExists = $true',
    '$dialog.RestoreDirectory = $true',
  ]
  if (initialDir) lines.push(`$dialog.InitialDirectory = '${escapePs(initialDir)}'`)
  // 预选当前路径文件：对话框打开时定位到所在目录并高亮该文件
  if (currentPath && fs.existsSync(currentPath)) lines.push(`$dialog.FileName = '${escapePs(currentPath)}'`)
  // 居中弹窗：公共对话框相对 owner 窗口居中，用屏幕中心的 1x1 隐形窗体充当 owner；
  // TopMost 保证弹窗不被浏览器窗口挡住
  lines.push('$owner = New-Object System.Windows.Forms.Form')
  lines.push('$owner.StartPosition = \'CenterScreen\'')
  lines.push('$owner.FormBorderStyle = \'None\'')
  lines.push('$owner.ShowInTaskbar = $false')
  lines.push('$owner.Opacity = 0')
  lines.push('$owner.TopMost = $true')
  lines.push('$owner.Width = 1')
  lines.push('$owner.Height = 1')
  lines.push('$owner.Show()')
  // 强制精确居中：对话框可能记住上次位置而偏离，用 Timer 在模态消息循环里
  // 找到本进程的 #32770 对话框后 SetWindowPos 吸附到屏幕正中（仅移动，不改大小）
  lines.push('$win32 = @\'')
  lines.push('public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }')
  lines.push('[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]')
  lines.push('public static extern System.IntPtr FindWindowExW(System.IntPtr hWndParent, System.IntPtr hWndChildAfter, System.String lpszClass, System.IntPtr lpszWindow);')
  lines.push('[System.Runtime.InteropServices.DllImport("user32.dll")]')
  lines.push('public static extern bool GetWindowRect(System.IntPtr hWnd, ref RECT r);')
  lines.push('[System.Runtime.InteropServices.DllImport("user32.dll")]')
  lines.push('public static extern bool SetWindowPos(System.IntPtr hWnd, System.IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, System.UInt32 uFlags);')
  lines.push('[System.Runtime.InteropServices.DllImport("user32.dll")]')
  lines.push('public static extern int GetSystemMetrics(int nIndex);')
  lines.push('[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError=true)]')
  lines.push('public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out System.UInt32 pid);')
  lines.push('\'@')
  lines.push('Add-Type -Namespace AppMgr -Name Win32 -MemberDefinition $win32')
  lines.push('$timer = New-Object System.Windows.Forms.Timer')
  lines.push('$timer.Interval = 150')
  lines.push('$script:lastW = -1')
  lines.push('$script:lastHt = -1')
  lines.push('$timer.Add_Tick({')
  lines.push('  $h = [IntPtr]::Zero')
  lines.push('  while ($true) {')
  lines.push('    $h = [AppMgr.Win32]::FindWindowExW([IntPtr]::Zero, $h, \'#32770\', [IntPtr]::Zero)')
  lines.push('    if ($h -eq [IntPtr]::Zero) { break }')
  lines.push('    $wPid = [uint32]0')
  lines.push('    [void][AppMgr.Win32]::GetWindowThreadProcessId($h, [ref]$wPid)')
  lines.push('    if ($wPid -ne [uint32]$PID) { continue }')
  lines.push('    $r = New-Object AppMgr.Win32+RECT')
  lines.push('    if ([AppMgr.Win32]::GetWindowRect($h, [ref]$r)) {')
  lines.push('      $w = $r.Right - $r.Left')
  lines.push('      $ht = $r.Bottom - $r.Top')
  lines.push('      $x = [int](([AppMgr.Win32]::GetSystemMetrics(0) - $w) / 2)')
  lines.push('      $y = [int](([AppMgr.Win32]::GetSystemMetrics(1) - $ht) / 2)')
  lines.push('      [void][AppMgr.Win32]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, 0, 0, 0x15)')
  // 对话框会先按记忆尺寸展开再定型，尺寸变化期间每轮重吸，连续两轮一致才收工
  lines.push('      if ($w -eq $script:lastW -and $ht -eq $script:lastHt) {')
  lines.push('        $timer.Stop()')
  lines.push('        break')
  lines.push('      }')
  lines.push('      $script:lastW = $w')
  lines.push('      $script:lastHt = $ht')
  lines.push('    }')
  lines.push('  }')
  lines.push('})')
  lines.push('$timer.Start()')
  lines.push('try {')
  lines.push('  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {')
  lines.push('    [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.FileName)))')
  lines.push('  }')
  lines.push('} finally {')
  lines.push('  $timer.Dispose()')
  lines.push('  $owner.Close()')
  lines.push('}')

  const scriptPath = path.join(os.tmpdir(), `pick-file-${randomUUID()}.ps1`)
  // BOM 前缀让 powershell.exe 正确识别脚本中的中文标题/过滤器/路径
  const bom = String.fromCharCode(0xfeff)
  fs.writeFileSync(scriptPath, bom + lines.join('\n'), 'utf-8')

  // windowsHide 不弹出控制台黑窗；WinForms 对话框本身正常显示
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { windowsHide: true }, (err, stdout) => {
    try { fs.unlinkSync(scriptPath) } catch { /* 清理失败可忽略 */ }
    if (err) {
      console.error('[native] pick-file error:', err.message)
      res.status(500).json({ success: false, message: '打开文件选择窗失败' })
      return
    }
    const pickedB64 = stdout.trim()
    const pickedPath = pickedB64 ? Buffer.from(pickedB64, 'base64').toString('utf-8') : ''
    res.json({ success: true, data: { path: pickedPath } })
  })
})

// 复制安装包到管理目录（通过文件路径）
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
  if (!baseDir) {
    res.status(400).json({ success: false, message: '未配置安装包基础目录，请先在系统设置中配置' })
    return
  }

  const targetDir = path.join(baseDir, appName)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const filename = path.basename(sourcePath)
  const destPath = path.join(targetDir, filename)
  fs.copyFileSync(sourcePath, destPath)

  res.json({ success: true, data: { path: destPath } })
})

// 上传安装包到管理目录（通过文件上传）
router.post('/upload-pkg', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file
  const appName = req.body?.appName as string | undefined

  if (!file) {
    res.status(400).json({ success: false, message: '未选择文件' })
    return
  }
  if (!appName) {
    res.status(400).json({ success: false, message: '应用名称不能为空' })
    return
  }

  const db = await getDb()
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['base_directory'])
  const baseDir = rows[0]?.value || ''
  if (!baseDir) {
    res.status(400).json({ success: false, message: '未配置安装包基础目录，请先在系统设置中配置' })
    return
  }

  const targetDir = path.join(baseDir, appName)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const destPath = path.join(targetDir, file.originalname)
  fs.writeFileSync(destPath, file.buffer)

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
