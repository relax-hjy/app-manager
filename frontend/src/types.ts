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
  download_url: string
  category: string
  sort_order: number
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
  anthropic_api_key: string
}

// ===== 自动安装智能体 =====

export interface InstallJobItem {
  appId: string
  name: string
  pkgPath: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'manual' | 'skipped'
  step: string
  message: string
  logTail?: string
}

export interface InstallJob {
  id: string
  status: 'running' | 'done' | 'canceled'
  createdAt: string
  items: InstallJobItem[]
  cancelRequested: boolean
}

export interface AgentStatus {
  job: InstallJob | null
  llmAvailable: boolean
}

// ===== 下载链接查找 =====

/** 下载链接候选（按可靠性降序，直链优先） */
export interface DownloadLinkCandidate {
  url: string
  isDirect: boolean
  note: string
}

/** 单应用下载链接查找任务 */
export interface FindTask {
  appId: string
  name: string
  status: 'running' | 'success' | 'failed' | 'canceled' | 'skipped'
  step: string
  message: string
  candidates?: DownloadLinkCandidate[]
  url?: string
  createdAt: string
  finishedAt?: string
}

/** 查找任务状态轮询返回 */
export interface FindStatus {
  tasks: FindTask[]
  /** 已持久化的查找结果（每应用最新一条成功结果，落库、重启不丢） */
  results: FindTask[]
  llmAvailable: boolean
}


export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}
