// ===== 应用管理 =====

export interface AppInfo {
  id: string
  name: string
  version: string
  path: string
  description: string
  is_installed: boolean
  exe_pkg: string
  zip_pkg: string
  category: string
}

export interface AppCategory {
  name: string
  apps: AppInfo[]
}

// ===== 文档管理 =====

export interface DocInfo {
  id: string
  name: string
  path: string
  format: string
  category: string
  app_id: string
  description: string
}

// ===== 配置 =====

export interface AppConfig {
  base_directory: string
  install_directory: string
  doc_directory: string
}

// ===== API 响应格式 =====

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}
