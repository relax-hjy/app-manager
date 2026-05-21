// 与 backend/shared/types.ts 保持一致

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

export interface DocInfo {
  id: string
  name: string
  path: string
  format: string
  category: string
  app_id: string
  description: string
}

export interface AppConfig {
  base_directory: string
  install_directory: string
  doc_directory: string
}


export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}
