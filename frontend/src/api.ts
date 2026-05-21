import type { AppInfo, AppCategory, DocInfo, AppConfig, ApiResponse } from './types'

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
  return request<AppInfo>('/apps/apps', {
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

export function copyPkg(sourcePath: string, appName: string) {
  return request<{ path: string }>('/native/copy-pkg', {
    method: 'POST', body: JSON.stringify({ sourcePath, appName }),
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
