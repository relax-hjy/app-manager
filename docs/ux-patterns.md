# UX 设计模式库

> 记录 app-manager 项目中值得复用的 UI/UX 设计模式，供未来项目借鉴。

---

## 一、交互模式

### 1.1 侧边栏分类选择 + 键盘无障碍

**场景**：侧边栏项目包含复杂布局（图标 + 文字 + 计数 + 删除按钮），无法用原生 `<button>` 实现。

**方案**：使用 `div[role="button"]` + `tabIndex={0}` + `onKeyDown` 监听 Enter/Space。

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={() => selectCategory(cat.name)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectCategory(cat.name) }}
>
  {/* 图标 + 文字 + 计数 + 删除按钮 */}
</div>
```

**文件参考**：`AppsPage.tsx:141-178`

---

### 1.2 Hover 显示删除按钮

**场景**：列表项有删除操作，但平时不需要显示，避免视觉干扰。

**方案**：删除按钮默认 `opacity-0`，hover 时 `opacity-100`，并用 `e.stopPropagation()` 阻止冒泡。

```tsx
<div className="group relative" onClick={selectItem}>
  <span>{item.name}</span>
  <button
    className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500"
    onClick={(e) => { e.stopPropagation(); deleteItem() }}
  >
    <X size={14} />
  </button>
</div>
```

**文件参考**：`AppsPage.tsx:172`

---

### 1.3 卡片选中状态（Ring 指示器）

**场景**：卡片可点击选中，需要清晰区分选中/未选中状态。

**方案**：选中卡片加 `ring-1 ring-[#1a1a1a]/20 border-[#1a1a1a]/40`，未选中卡片 hover 时边框变深。

```tsx
className={cn(
  "border rounded-lg cursor-pointer transition-all",
  selected?.id === item.id
    ? "border-[#1a1a1a]/40 ring-1 ring-[#1a1a1a]/20 shadow-md"
    : "border-[#e5e6e8] hover:border-[#1a1a1a]/20 hover:shadow-md"
)}
```

**文件参考**：`AppsPage.tsx:203-206`

---

### 1.4 嵌套点击目标的事件冒泡控制

**场景**：卡片整体可点击，但卡片内的按钮（编辑、删除、启动）也需要独立响应。

**方案**：按钮点击时调用 `e.stopPropagation()` 阻止冒泡到卡片。

```tsx
<button onClick={(e) => { e.stopPropagation(); launchApp(app.path) }}>
  启动
</button>
```

**文件参考**：`AppsPage.tsx:256, 265`

---

### 1.5 文件选择器 + 手动输入双模式

**场景**：用户可以选择文件浏览或手动粘贴路径。

**方案**：隐藏 `<input type="file">`，用按钮触发；选择后重置 input 允许重复选择同一文件。

```tsx
const fileInputRef = useRef<HTMLInputElement>(null)

<input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
  const file = e.target.files?.[0]
  if (file) setFilePath(file.name)
  e.target.value = '' // 关键：允许重复选择同一文件
}} />

<button onClick={() => fileInputRef.current?.click()}>浏览</button>
```

**文件参考**：`PkgsPage.tsx:431-436`

---

### 1.6 互斥字段自动清空

**场景**：两个字段只能填一个（如 EXE 和 ZIP 安装包）。

**方案**：设置一个字段时，自动清空另一个。

```tsx
const handleExeChange = (value: string) => {
  setExePath(value)
  if (value) setZipPath('') // 有 EXE 则清空 ZIP
}
```

**文件参考**：`PkgsPage.tsx:76-82`

---

## 二、视觉反馈

### 2.1 Toast 通知系统（Context Provider）

**场景**：全局需要轻量级操作反馈，不想逐层传递 props。

**方案**：React Context + 固定定位 + 自动消失。

```tsx
// toast.tsx - 核心实现
const ToastContext = createContext<{ toast: (msg: string, type?: 'success' | 'error') => void }>()

// 使用方式
const { toast } = useToast()
toast('保存成功', 'success')
toast('删除失败', 'error')
```

**设计要点**：
- 位置：右上角 `fixed top-4 right-4 z-50`
- 自动消失：3 秒
- 动画：`animate-in slide-in-from-right-full fade-in`
- 类型：success（绿色勾）/ error（红色叉）

**文件参考**：`components/ui/toast.tsx`

---

### 2.2 异步操作的按钮状态

**场景**：按钮触发异步操作时，需要防止重复点击并显示进度。

**方案**：按钮文字动态变化 + 禁用。

```tsx
<button disabled={saving} onClick={handleSave}>
  {saving ? '保存中...' : '保存'}
</button>
```

**文件参考**：`SettingsPage.tsx:117`, `PkgsPage.tsx:459`, `DocsPage.tsx:371`

---

### 2.3 保存成功动画反馈

**场景**：表单保存后需要反馈，但不想用 Toast（太重）。

**方案**：绿色勾号 + 淡入动画 + 自动隐藏。

```tsx
const [saved, setSaved] = useState(false)

const handleSave = async () => {
  await save()
  setSaved(true)
  setTimeout(() => setSaved(false), 2000)
}

{saved && <span className="text-green-600 animate-in fade-in">✓ 已保存</span>}
```

**文件参考**：`SettingsPage.tsx:120-123`

---

### 2.4 表单内联错误提示

**场景**：表单验证失败，需要就近显示错误。

**方案**：红色背景块显示在表单区域内。

```tsx
{error && (
  <div className="bg-red-50 rounded-lg px-3 py-2 text-red-600 text-sm">
    {error}
  </div>
)}
```

**文件参考**：`PkgsPage.tsx:454-456`

---

### 2.5 路径字段使用等宽字体

**场景**：文件路径在 proportional 字体下难以阅读。

**方案**：路径字段加 `font-mono text-xs break-all`。

```tsx
<Field label="安装路径" value={app.path} mono />
// Field 组件内部
<span className={cn(mono && "font-mono text-xs break-all")}>{value}</span>
```

**文件参考**：`AppsPage.tsx:322-325`

---

## 三、布局模式

### 3.1 三栏布局（侧边栏 + 网格 + 详情面板）

**场景**：主页面需要分类浏览 + 列表 + 详情查看。

**方案**：Flex 布局，详情面板按需显示。

```
┌──────────┬─────────────────────┬──────────┐
│ 侧边栏   │     卡片网格        │ 详情面板  │
│ w-[220px]│     flex-1          │ w-72     │
│          │                     │ (可选)   │
└──────────┴─────────────────────┴──────────┘
```

```tsx
<div className="flex gap-4 h-full">
  {/* 侧边栏 */}
  <aside className="w-[220px] shrink-0">...</aside>

  {/* 主内容 */}
  <main className="flex-1 overflow-auto">
    <div style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {/* 卡片 */}
    </div>
  </main>

  {/* 详情面板 - 按需显示 */}
  {selectedItem && (
    <aside className="w-72 shrink-0 border-l">...</aside>
  )}
</div>
```

**文件参考**：`AppsPage.tsx:131-344`

---

### 3.2 自适应网格（零媒体查询）

**场景**：卡片网格需要根据屏幕宽度自动调整列数。

**方案**：`repeat(auto-fill, minmax(320px, 1fr))`

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
  {items.map(item => <Card key={item.id} />)}
</div>
```

**优点**：无需媒体查询，自然响应式。

**文件参考**：`AppsPage.tsx:199`

---

### 3.3 卡片三段式结构（Header / Body / Footer）

**场景**：信息卡片需要统一的视觉结构。

**方案**：三段式布局，Footer 用 `mt-auto` 推到底部。

```tsx
<Card className="flex flex-col">
  {/* Header: 图标 + 名称 + 标签 + 版本 + 状态 */}
  <div className="flex items-center gap-2">...</div>

  {/* Body: 描述（限制行数） */}
  <p className="line-clamp-2 text-sm text-[#646a73]">{description}</p>

  {/* Footer: 操作按钮（自动推到底部） */}
  <div className="mt-auto pt-3 border-t border-[#f0f0f0] flex gap-2">
    <Button size="sm">启动</Button>
  </div>
</Card>
```

**文件参考**：`AppsPage.tsx:207-272`

---

### 3.4 粘性分组标题

**场景**：长列表中有分组，滚动时需要始终看到当前分组。

**方案**：`sticky top-0` + 背景色。

```tsx
<div className="max-h-80 overflow-auto">
  {groups.map(group => (
    <>
      <div className="sticky top-0 bg-white px-3 py-2 border-b font-medium">
        {group.name}
      </div>
      {group.items.map(item => <Item key={item.id} />)}
    </>
  ))}
</div>
```

**文件参考**：`DocsPage.tsx:647`

---

### 3.5 隐藏占位元素保持布局一致

**场景**：不同页面的头部按钮数量不同，导致高度不一致。

**方案**：用 `invisible` 而非条件渲染。

```tsx
{/* AppsPage 有添加按钮 */}
<Button>添加应用</Button>

{/* PkgsPage 没有添加按钮，但用 invisible 占位 */}
<Button className="invisible">占位</Button>
```

**文件参考**：`PkgsPage.tsx:124, 174`

---

## 四、表单处理

### 4.1 根据名称自动填充路径

**场景**：新建应用时，路径有规律（如 `安装目录\应用名\应用名.exe`）。

**方案**：`useEffect` 监听名称变化，自动填充。

```tsx
useEffect(() => {
  if (!app && name && installDir) {
    setPath(`${installDir}\\${name}\\${name}.exe`)
  }
}, [name, installDir, app])
```

**文件参考**：`AppsPage.tsx:398-412`

---

### 4.2 Datalist 自动补全（自由输入 + 建议）

**场景**：输入框需要自由输入，但也希望复用已有值。

**方案**：HTML5 `<datalist>` 提供建议，不限制输入。

```tsx
<input list="categories" value={value} onChange={e => setValue(e.target.value)} />
<datalist id="categories">
  {existingCategories.map(cat => <option key={cat} value={cat} />)}
</datalist>
```

**文件参考**：`DocsPage.tsx:755-760`

---

### 4.3 Select 组件的"清空"选项

**场景**：Radix Select 原生不支持清空选择。

**方案**：用哨兵值 `'__none__'` 映射到"不关联"。

```tsx
<Select value={value || '__none__'} onValueChange={v => setValue(v === '__none__' ? '' : v)}>
  <SelectContent>
    <SelectItem value="__none__">— 不关联 —</SelectItem>
    {options.map(opt => <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>)}
  </SelectContent>
</Select>
```

**文件参考**：`DocsPage.tsx:746-751`

---

### 4.4 提交时校验必填字段

**场景**：表单提交前需要校验，但不想实时显示错误。

**方案**：提交时静默 return，配合 `*` 标记提示必填。

```tsx
const handleSubmit = () => {
  if (!name.trim() || !category) return // 静默阻止提交
  // 正常提交逻辑
}

<label>名称 <span className="text-red-500">*</span></label>
```

**文件参考**：`AppsPage.tsx:416`

---

### 4.5 创建/编辑复用同一表单

**场景**：添加和编辑的表单字段相同。

**方案**：通过 `editingItem` 状态判断模式，复用同一个 Dialog。

```tsx
const [editingApp, setEditingApp] = useState<App | null>(null)

// 添加
<Button onClick={() => { setEditingApp(null); setShowForm(true) }}>添加</Button>

// 编辑
<Button onClick={() => { setEditingApp(app); setShowForm(true) }}>编辑</Button>

// 表单内
<Dialog open={showForm} onOpenChange={(open) => {
  if (!open) { setShowForm(false); setEditingApp(null) } // 关闭时重置
}}>
  <h2>{editingApp ? '编辑' : '添加'}应用</h2>
</Dialog>
```

**文件参考**：`AppsPage.tsx:97-116`

---

## 五、导航模式

### 5.1 二级侧边栏（渐进式披露）

**场景**：分类有层级，但不想一开始就展示所有子级。

**方案**：点击父级后才展开子级，子级缩进显示。

```tsx
{categories.map(cat => (
  <>
    <div onClick={() => setSelected(cat)}>{cat.name}</div>
    {selected === cat && cat.children.map(child => (
      <div className="ml-6" onClick={() => setSelectedChild(child)}>{child.name}</div>
    ))}
  </>
))}
```

**文件参考**：`DocsPage.tsx:310-351`

---

### 5.2 "全部"作为首个侧边栏项

**场景**：用户想快速查看所有内容。

**方案**：第一项固定为"全部"，显示总数。

```tsx
<div onClick={() => setSelected(null)}>
  <GridIcon /> 全部工具
  <Badge>{categories.reduce((sum, c) => sum + c.items.length, 0)}</Badge>
</div>
```

**文件参考**：`AppsPage.tsx:142-154`

---

### 5.3 切换分类时重置选中项

**场景**：切换分类后，详情面板可能显示不属于当前分类的内容。

**方案**：切换分类时清空选中状态。

```tsx
const selectCategory = (name: string) => {
  setSelectedCategory(name)
  setSelectedItem(null) // 关键：清空选中，隐藏详情面板
}
```

**文件参考**：`AppsPage.tsx:145, 162`

---

### 5.4 搜索防抖

**场景**：搜索输入框每次按键都发请求太频繁。

**方案**：200ms 防抖。

```tsx
useEffect(() => {
  const timer = setTimeout(() => {
    fetchResults(searchTerm)
  }, 200)
  return () => clearTimeout(timer)
}, [searchTerm])
```

**文件参考**：`DocsPage.tsx:183-186`

---

## 六、巧妙方案

### 6.1 字符串哈希生成确定性颜色

**场景**：分类需要固定颜色，但不想存数据库。

**方案**：简单哈希函数映射到预设颜色。

```tsx
const COLORS = ['stone', 'emerald', 'amber', 'rose', 'violet', 'teal']

function catColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}
```

**优点**：同一名称永远同一颜色，无需存储。

**文件参考**：`AppsPage.tsx:26-38`

---

### 6.2 图片加载失败的优雅降级

**场景**：应用图标可能加载失败。

**方案**：`onError` 隐藏图片，显示首字母备用方案。

```tsx
<img
  src={getAppIconUrl(app.id)}
  onError={(e) => {
    e.currentTarget.style.display = 'none'
    e.currentTarget.nextElementSibling.style.display = 'flex'
  }}
/>
<span style={{ display: 'none' }} className="fallback-icon">
  {app.name[0]}
</span>
```

**文件参考**：`AppsPage.tsx:209-223`

---

### 6.3 批量操作的全选/反选

**场景**：扫描结果需要批量确认。

**方案**：Set 跟踪选中，toggle 逻辑判断全选/取消全选。

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set())

const toggleAll = () => {
  if (selected.size === items.length) {
    setSelected(new Set()) // 全选 → 取消全选
  } else {
    setSelected(new Set(items.map(i => i.id))) // 部分/无 → 全选
  }
}
```

**文件参考**：`DocsPage.tsx:127-161`

---

### 6.4 上下文感知的空状态

**场景**：列表为空时，需要引导用户下一步操作。

**方案**：根据上下文显示不同的空状态文案。

```tsx
{items.length === 0 && (
  <div className="text-center text-[#646a73] py-12">
    {searchTerm
      ? '🔍 未找到匹配的文档'
      : '📋 暂无文档，点击上方按钮添加'}
  </div>
)}
```

**文件参考**：`AppsPage.tsx:194-197`, `DocsPage.tsx:381-384`

---

### 6.5 设置页的"打开目录"快捷按钮

**场景**：配置目录路径后，想快速验证是否正确。

**方案**：每个路径字段旁加"打开"按钮。

```tsx
<div className="flex gap-2">
  <Input value={path} onChange={e => setPath(e.target.value)} />
  <Button
    variant="outline"
    disabled={!path}
    onClick={() => api.openFolderInSystem(path)}
  >
    打开
  </Button>
</div>
```

**文件参考**：`SettingsPage.tsx:55-63`

---

## 七、组件设计原则

### 7.1 cn() 工具函数

```tsx
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**作用**：合并 Tailwind 类名，自动解决冲突（如 `px-2 px-4` → `px-4`）。

### 7.2 Button 变体系统

```tsx
const variants = {
  default: 'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]/90',
  secondary: 'bg-[#f2f3f5] text-[#1f2329] hover:bg-[#f2f3f5]/80',
  destructive: 'bg-red-500 text-white hover:bg-red-600',
  outline: 'border border-[#e5e6e8] hover:bg-[#f5f5f5]',
  ghost: 'hover:bg-[#f5f5f5]',
}
```

### 7.3 Dialog 动画（Radix UI data-state）

```tsx
// 遮罩层
className="animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// 内容
className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
```

---

## 八、设计规范速查

| 项目 | 值 |
|------|-----|
| 主色 | `#1a1a1a` |
| 背景色 | `#f5f5f5` |
| 卡片背景 | `white` |
| 文字主色 | `#1f2329` |
| 文字次色 | `#646a73` |
| 边框色 | `#e5e6e8` / `#e8e8e8` |
| 徽章样式 | `bg-[#f2f3f5] text-[#646a73] rounded-[4px]` |
| 导航栏高度 | `h-12` |
| 侧边栏宽度 | `w-[220px]` |
| 详情面板宽度 | `w-72` |
| 网格最小列宽 | `320px` |
| 标题栏间距 | `pt-4 pb-3` |
