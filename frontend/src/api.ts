import type { AppInfo, AppCategory, DocInfo, AppConfig, ApiResponse, FindTask, FindStatus } from './types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((err as any).message || 'Request failed')
  }
  return res.json()
}

// 分类
export function getCategories() {
  return request<AppCategory[]>('/apps/categories')
}

export function addCategory(name: string) {
  return request('/apps/categories', {
    method: 'POST', body: JSON.stringify({ name }),
  })
}

export function deleteCategory(name: string) {
  return request(`/apps/categories/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

// 应用
export function getAppsByCategory(name: string) {
  return request<AppInfo[]>(`/apps/categories/${encodeURIComponent(name)}/apps`)
}

export function addApp(data: Partial<AppInfo> & { name: string; category: string }) {
  return request<AppInfo & { findStarted?: boolean }>('/apps/apps', {
    method: 'POST', body: JSON.stringify(data),
  })
}

export function deleteApp(id: string) {
  return request(`/apps/apps/${id}`, { method: 'DELETE' })
}

export function updateApp(id: string, data: Partial<AppInfo>) {
  return request(`/apps/apps/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  })
}

/** 批量保存拖拽排序：ids 为可见卡片的新顺序（可为全部应用的子集） */
export function reorderApps(ids: string[]) {
  return request<{ id: string; sort_order: number }[]>('/apps/apps/reorder', {
    method: 'PATCH', body: JSON.stringify({ ids }),
  })
}

// 文档
export function getDocs(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return request<DocInfo[]>(`/docs${query}`)
}

export function addDoc(data: Partial<DocInfo> & { name: string }) {
  return request<DocInfo>('/docs', {
    method: 'POST', body: JSON.stringify(data),
  })
}

export function updateDoc(id: string, data: Partial<DocInfo>) {
  return request(`/docs/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  })
}

export function deleteDoc(id: string) {
  return request(`/docs/${id}`, { method: 'DELETE' })
}

export function getDocsByApp(appId: string) {
  return request<DocInfo[]>(`/docs/by-app/${appId}`)
}

export function getDocCategories() {
  return request<string[]>('/docs/categories')
}

export function saveDocFile(filePath: string, content: string) {
  return request<{ path: string }>('/native/save-doc', {
    method: 'POST', body: JSON.stringify({ filePath, content }),
  })
}

export function deleteDocCategory(format: string, category: string) {
  return request('/native/delete-category', { method: 'POST', body: JSON.stringify({ format, category }) })
}

export function ensureDocDirs() {
  return request<{ created: string[] }>('/native/ensure-doc-dirs', { method: 'POST' })
}

export function scanDocs(scope?: { format?: string; category?: string }) {
  return request<{
    docDir: string
    newFiles: { name: string; path: string; format: string; category: string }[]
    newCategories: { format: string; category: string; fileCount: number }[]
    allCategories: { format: string; category: string; fileCount: number }[]
    deletedDocs: { id: string; name: string; path: string; format: string; category: string }[]
    totalScanned: number
    totalNew: number
  }>('/native/scan-docs', { method: 'POST', body: JSON.stringify(scope || {}) })
}

// 应用图标（返回图片 URL，由 <img> src 直接使用）
export function getAppIconUrl(appId: string) {
  return `${BASE}/native/icon/${encodeURIComponent(appId)}`
}

// 原生操作
export function launchApp(filePath: string) {
  return request('/native/launch', { method: 'POST', body: JSON.stringify({ filePath }) })
}

export function openFileInSystem(filePath: string) {
  return request('/native/open-file', { method: 'POST', body: JSON.stringify({ filePath }) })
}

export function openFolderInSystem(filePath: string) {
  return request('/native/open-folder', { method: 'POST', body: JSON.stringify({ filePath }) })
}

export function checkPathExists(filePath: string) {
  return request<{ exists: boolean; path: string }>('/native/check-path', {
    method: 'POST', body: JSON.stringify({ filePath }),
  })
}

/** 打开 Windows 原生文件选择窗，返回选中文件的完整路径（取消时为空串） */
export function pickFile(currentPath?: string) {
  return request<{ path: string }>('/native/pick-file', {
    method: 'POST', body: JSON.stringify({ currentPath: currentPath || '' }),
  })
}

export function copyPkg(sourcePath: string, appName: string) {
  return request<{ path: string }>('/native/copy-pkg', {
    method: 'POST', body: JSON.stringify({ sourcePath, appName }),
  })
}

export function uploadPkg(file: File, appName: string) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('appName', appName)
  return fetch('/api/native/upload-pkg', {
    method: 'POST',
    body: formData,
  }).then(res => {
    if (!res.ok) return res.json().then(err => { throw new Error((err as any).message || 'Upload failed') })
    return res.json()
  }) as Promise<ApiResponse<{ path: string }>>
}

// 自动安装智能体
export function startInstall(appIds?: string[]) {
  return request<{ jobId: string }>('/agent/install', {
    method: 'POST', body: JSON.stringify(appIds ? { appIds } : {}),
  })
}

export function getAgentStatus() {
  return request<import('./types').AgentStatus>('/agent/status')
}

export function cancelInstall() {
  return request('/agent/cancel', { method: 'POST' })
}

// 下载链接查找
/** 启动手动查找下载链接（fire-and-forget，完成后任务带 3 个候选） */
export function startFindDownloadUrl(appId: string) {
  return request<{ task: FindTask }>('/agent/find-download', {
    method: 'POST', body: JSON.stringify({ appId }),
  })
}

/** 查询全部查找任务状态（前端轮询） */
export function getFindStatus() {
  return request<FindStatus>('/agent/find-status')
}

/** 将点选的候选链接写入 download_url（总是覆盖） */
export function applyFindCandidate(appId: string, url: string) {
  return request('/agent/find-apply', {
    method: 'POST', body: JSON.stringify({ appId, url }),
  })
}

/** 请求取消查找任务（幂等） */
export function cancelFindDownloadUrl(appId: string) {
  return request('/agent/find-cancel', {
    method: 'POST', body: JSON.stringify({ appId }),
  })
}

// 配置
export function getConfig() {
  return request<AppConfig>('/apps/config')
}

export function updateConfig(data: Partial<AppConfig>) {
  return request('/apps/config', {
    method: 'PUT', body: JSON.stringify(data),
  })
}
