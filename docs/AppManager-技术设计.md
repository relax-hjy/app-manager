# App Manager 技术设计

## 架构概览

```
浏览器 (React SPA)
  │  fetch /api/**（开发态经 Vite proxy 转发）
  ▼
Express (backend, 默认端口 3001)
  ├── routes/apps.ts    → database.ts（sql.js）
  ├── routes/docs.ts    → database.ts + fs（文档扫描）
  └── routes/native.ts  → child_process / fs / PowerShell
  ▼
SQLite (backend/data/app-manager.db)  +  本地磁盘（安装包、文档、图标缓存）
```

- 单体三层：前端 SPA → REST API → sql.js 持久层 + 本机文件操作
- 原生能力（启动 EXE、打开目录、提取图标）全部收口在 `routes/native.ts`

## 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI 原语 + lucide-react
- 后端：Node.js + Express + TypeScript（tsx）
- 数据库：sql.js（SQLite WASM，内存操作，每次写入后持久化到磁盘）
- 部署：开发模式根目录 `npm run dev` 一键拉起双进程（concurrently + scripts/preflight.mjs 端口预检）；生产模式单进程托管前端静态文件；打包与分发方案见 README

## 数据模型

### categories
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 分类 ID |
| name | TEXT UNIQUE NOT NULL | 分类名 |

### apps
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID v4 |
| name | TEXT NOT NULL | 应用名称（允许重复） |
| version | TEXT | 版本号 |
| path | TEXT | EXE 路径 |
| description | TEXT | 描述 |
| is_installed | INTEGER (0/1) | 是否已安装 |
| exe_pkg | TEXT | EXE 安装包路径 |
| zip_pkg | TEXT | ZIP 安装包路径 |
| download_url | TEXT | 安装包下载地址 |
| sort_order | INTEGER NOT NULL DEFAULT 0 | 全局拖拽排序键（唯一，0 表示待回填） |
| find_candidates | TEXT | 下载链接查找结果：候选 JSON 数组（空串=无结果，失败/取消不覆盖旧结果） |
| find_message | TEXT | 查找结果说明（如「找到 3 个候选链接」） |
| find_finished_at | TEXT | 查找完成时间（ISO，结果持久化时间戳） |
| category_id | INTEGER FK → categories(id) ON DELETE CASCADE | 所属分类 |

### documents
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 文档名称（允许重复） |
| path | TEXT | 文件路径 |
| format | TEXT | 格式（如「知识总结」） |
| category | TEXT | 领域（如「Python」） |
| app_id | TEXT FK → apps(id) ON DELETE SET NULL | 关联应用 |
| description | TEXT | 描述 |

### config
| 字段 | 类型 | 说明 |
|---|---|---|
| key | TEXT PK | 配置键 |
| value | TEXT | 配置值 |

配置键：`base_directory`（安装包管理根目录）、`install_directory`（应用安装目录）、`doc_directory`（文档目录）、`anthropic_api_key`（智能体 LLM 密钥，环境变量 ANTHROPIC_API_KEY 优先）。

## API 设计

### apps（分类 + 应用 + 配置）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/apps/categories | 获取所有分类及应用 |
| POST | /api/apps/categories | 添加分类 |
| DELETE | /api/apps/categories/:name | 删除分类（级联删除应用） |
| GET | /api/apps/categories/:name/apps | 获取分类下应用 |
| POST | /api/apps/apps | 添加应用（sort_order = 全局 MAX+1） |
| PATCH | /api/apps/apps/reorder | 批量保存拖拽排序 `{ids}`（须注册在 /apps/:id 之前） |
| PATCH | /api/apps/apps/:id | 更新应用字段（含 category 变更；不含 sort_order） |
| DELETE | /api/apps/apps/:id | 删除应用 |
| GET | /api/apps/config | 获取配置 |
| PUT | /api/apps/config | 更新配置（部分更新） |

### docs
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/docs | 获取文档列表（支持 ?search=） |
| POST | /api/docs | 添加文档 |
| PATCH | /api/docs/:id | 更新文档 |
| DELETE | /api/docs/:id | 删除文档 |
| GET | /api/docs/by-app/:appId | 获取某应用的文档 |
| GET | /api/docs/categories | 获取已使用的文档分类 |

### agent（自动安装智能体 + 下载链接查找）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/agent/install | 启动批量安装 `{appIds?}`（409=已有任务在跑） |
| GET | /api/agent/status | 任务状态 + llmAvailable（前端 1s 轮询） |
| POST | /api/agent/cancel | 取消（应用间生效 + kill 子进程） |
| POST | /api/agent/find-download | 启动手动查找下载链接 `{appId}`（fire-and-forget，只出候选不写库） |
| GET | /api/agent/find-status | 查找状态：`{ tasks（内存任务）, results（已持久化结果）, llmAvailable }`（前端 1s 轮询） |
| POST | /api/agent/find-apply | 点选候选写入 download_url `{appId, url}`（总是覆盖） |
| POST | /api/agent/find-cancel | 取消查找任务 `{appId}`（幂等） |

### native（本机操作）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/native/icon/:appId | 获取应用图标（EXE 提取，缓存） |
| POST | /api/native/launch | 启动 exe |
| POST | /api/native/open-file | 用默认程序打开文件 |
| POST | /api/native/open-folder | 在资源管理器打开目录 |
| POST | /api/native/check-path | 检查路径是否存在 |
| POST | /api/native/pick-file | 打开 Windows 原生文件选择窗（{currentPath?} 定位初始目录；返回完整路径，取消为空串） |
| POST | /api/native/copy-pkg | 复制安装包到管理目录 |
| POST | /api/native/upload-pkg | 上传安装包（multer） |
| POST | /api/native/scan-docs | 扫描文档目录（新增/失效） |
| POST | /api/native/save-doc | 保存文档内容到文件 |
| POST | /api/native/ensure-doc-dirs | 创建默认文档类型目录 |
| POST | /api/native/delete-category | 删除文档分类目录（无关联文档时） |

## 模块依赖
- `frontend/src/pages/*` → `frontend/src/api.ts` → 后端 routes → `database.ts` / `fs` / `child_process`
- 自动安装智能体：`routes/agent.ts` → `agent/installer.ts`（任务编排/执行/规则表）→ `agent/llm.ts`（`@anthropic-ai/sdk` + zod 结构化输出，模型 `claude-opus-5`，带 server-side fallback）；LLM 不可用/失败降级规则表
- 下载链接查找：`routes/agent.ts` → `agent/find-download.ts`（Bing 搜索真实结果 → `agent/llm.ts` 排序 → 可达性校验；任务态内存保留最新一个，成功结果落库 `apps.find_*` 持久化；注册后自动回填走 auto 模式只写空 download_url）
- `shared/types.ts` 为前后端共享类型源；`frontend/src/types.ts` 为前端本地类型
- native 图标提取依赖 PowerShell `ExtractAssociatedIcon`，缓存于 `backend/data/icons/{appId}.png`

## 技术约束
- 平台：Windows（原生操作依赖 `start` / `explorer` / PowerShell）
- 数据库写入后整体持久化到 `backend/data/app-manager.db`
- 后端端口默认 3001（`PORT` 可覆盖）；Vite dev 端口 5173 且 `strictPort: true`（被占明确报错不跳口），`/api` 代理到 3001
- 启动预检 `scripts/preflight.mjs`：检测依赖与端口占用，**仅提示不杀进程**；后端 `app.listen` 挂 `error` 处理，EADDRINUSE 打印友好提示后退出
- CORS 全开放（开发用途）
- 仅支持 `.md` 和 `.pdf` 文档；文档目录约定 `{doc_directory}/{format}/{category}/{filename}`
- EXE 与 ZIP 安装包互斥；download_url 不参与互斥
- 拖拽排序：全局 `sort_order` 一列，所有视图按它排序；拖动落点后把「可见子集」的 sort 键多重集按新视觉顺序重赋值（服务端 `reassignVisibleSortOrders`），不可见应用不受影响；类目视图与「全部工具」共用此规则
- 删除分类级联删除应用；删除应用时文档 app_id 置 NULL
- UI 规范：极简黑白灰（主色 `#1a1a1a`，背景 `#f5f5f5`，边框 `#e8e8e8`）；顶部导航 h-12；卡片三段式
- 悬浮弹层（找链接候选等）：Radix Popover，Portal 渲染不嵌滚动容器（防裁剪）+ popper 定位贴触发器、视口边缘自动翻转避让 + `updatePositionStrategy="always"`（滚动/缩放实时跟随）
- 应用/安装包页布局：三栏 flex + `container-type: inline-size`，全比例 cqw（侧栏 14cqw、列轨道 20cqw、间距 1cqw、详情面板 20cqw=一列）；卡片网格 `repeat(4|3, 20cqw)`，开详情面板 4→3 列且前三列轨道不变；面板底部操作按钮固定（上区滚动）
- 启动/打开操作为 fire-and-forget，立即返回

## 第三方集成
- PowerShell `ExtractAssociatedIcon`：从 EXE 提取图标
- PowerShell WinForms `OpenFileDialog`：原生文件选择窗（pick-file；BOM 脚本防中文乱码 + Base64 回传避开控制台编码，Per-Monitor V2 DPI 感知 + 隐形居中 owner）
- Windows shell `start` / `explorer`：启动应用、打开文件/目录
- 无外部云服务依赖

---

## 集群部署与执行代理（规划，未实现）

> 2026-10-12 规划。目标：App Manager 容器化部署到 WSL kind 集群（多端浏览器访问）；并抽出可复用的 **Windows 执行代理（win-agent）**，「中心服务 + 本地 Agent」两层架构，其它含 Windows 原生能力的项目可共用同一 Agent。
> 命名区分：「自动安装智能体」= 现有 LLM 安装编排模块（routes/agent.ts）；「执行代理 win-agent」= 本节的 Windows 本机执行进程。

### 架构

```
┌───────────────────── WSL kind 集群 ─────────────────────┐
│  App Manager 中心服务                                    │
│  ├─ Web UI / REST API                                    │
│  ├─ AgentManager（Agent 注册表 + 命令下发 + 结果路由）     │
│  └─ NativeExecutor 接口                                  │
│       ├─ LocalDriver   ← 单机模式：直接调 Windows API     │
│       └─ AgentDriver   ← 集群模式：命令发给 Agent          │
└───────────────────────┬─────────────────────────────────┘
                        │ WSS 长连接（Agent 主动连出）
                        │ JSON 消息：command / result / event
        ┌───────────────┴───────────────┐
        ▼                               ▼
  ┌─────────────┐                 ┌─────────────┐
  │  win-agent  │                 │  win-agent  │
  │ (Windows)   │                 │ (Windows)   │
  │ 启动exe等   │                 │ ...         │
  └─────────────┘                 └─────────────┘
```

- 核心原则：中心只表达意图（「启动 VSCode」），Agent 在本机执行；中心**永不**下发任意 shell 命令
- 原生能力收敛到 Agent 层：launch / open-file / open-folder / check-path / extract-icon / save-doc / scan-docs / copy-pkg / ensure-doc-dirs / delete-category-dir
- 容器化后失效的能力（启动 exe、打开目录等 GUI 操作）由 Agent 承接；图标提取可用 icoutils / 纯 JS 解析 PE，不必依赖 Windows

### NativeExecutor 双驱动

```ts
/** 原生能力执行器：单机/集群两种部署形态的统一抽象 */
export interface NativeExecutor {
  launch(path: string): Promise<{ pid: number }>
  openFile(path: string): Promise<void>
  openFolder(path: string): Promise<void>
  checkPath(path: string): Promise<boolean>
  extractIcon(path: string): Promise<Buffer>
  saveDoc(path: string, content: string): Promise<void>
}
```

- `LocalDriver`：现 `routes/native.ts` 的 `exec` 逻辑原样迁入（单机模式保持可用）
- `AgentDriver`：调用序列化为 command 发给指定 Agent（按 `apps.agent_id` 路由），等 result
- 路由层 `/api/native/*` 不再直接 `exec`，按部署形态选 Driver

### 通信协议

- 传输：WebSocket over TLS（`wss://`），**Agent 主动连出**，Windows 不开入站端口；禁 WS 网络降级 HTTPS 长轮询
- 消息三类：

```jsonc
// 中心 → Agent：命令（带 id，要求回执）
{ "type": "command", "id": "cmd_xxx", "action": "launch",
  "params": { "path": "D:\\...\\Code.exe" }, "timeoutMs": 10000 }

// Agent → 中心：结果
{ "type": "result", "id": "cmd_xxx", "ok": true, "data": { "pid": 12345 } }
{ "type": "result", "id": "cmd_xxx", "ok": false,
  "error": { "code": "PATH_NOT_FOUND", "message": "文件不存在" } }

// Agent → 中心：事件 / 心跳
{ "type": "event", "event": "agent.ready",
  "data": { "hostname": "PC-01", "agentVersion": "1.0.0", "capabilities": [...] } }
{ "type": "heartbeat", "ts": 1760260000000 }
```

- 可靠性：命令 id 幂等 + 中心 pending 表超时清理（默认 10s，icon 类 30s）；断线指数退避重连（1s→30s 封顶）；心跳 30s 判活，掉线则前端原生按钮置灰；大文件（upload-pkg）不走 WS，走独立 HTTPS 端点
- 命令集白名单固定 10 个 action，参数 zod 校验；**禁止** `exec`/`run-command` 类任意命令

### Agent 本体

- 技术栈：Node.js + TypeScript（与主项目同语言，native 逻辑直接复用），打包单文件 `app-agent.exe`（Node SEA / pkg）
- **形态：用户登录自启（任务计划程序 At log on）+ 托盘图标，不做 Windows 服务**——服务跑在 Session 0 无桌面，`start`/`explorer` 启动的 GUI 用户看不见
- 模块：config（server URL/token/路径白名单）→ transport（WS 客户端/心跳/重连）→ command-router（白名单分发）→ executor/*（逐命令实现）→ tray
- 单实例锁；配置文件 `config.json`；安装脚本 `install.ps1`（写配置 + 注册自启），升级第一版手动覆盖

### 安全

1. 配对 Token：Agent 安装时带随机 token（或中心「添加机器」生成一次性配对码换取），`wss://` 连接带 `Authorization: Bearer`
2. TLS：内网自签 + 证书指纹 pinning，有域名用 Let's Encrypt
3. 命令白名单 + zod 参数校验；路径参数必须落在配置允许根内（拒绝 `..`/任意 UNC），防路径穿越
4. Agent 以普通用户运行，不申请管理员；提权操作（安装软件）后续单独走 UAC 流程

### 部署形态

- 中心服务：单容器（前端 `vite build` 产物并入后端 `public/`，与 README 打包目标一致）部署到 kind 集群
- 持久化：`app-manager.db`、图标缓存、安装包/文档挂 PVC（集群已有 local-path-storage）
- 流水线：待定。候选：GitHub Actions + WSL 自托管 Runner（全自动）、本地一键部署脚本（build → docker build → kind load → kubectl apply）、Actions 构建 + 手动部署、ArgoCD GitOps。约束：kind 在本机 WSL，GitHub 托管 Runner 够不到集群

### 落地步骤（两阶段）

**第一阶段：纯容器化**
1. 补 Dockerfile（前端产物并入后端）+ K8s 清单（Deployment + Service + PVC）
2. 部署到 WSL kind 集群，原生功能 UI 降级隐藏
3. 流水线选型落地（待定，见上）

**第二阶段：Agent 化**
4. 抽 `NativeExecutor` 接口 + `LocalDriver`（纯重构，行为不变）
5. `shared/types.ts` 定义 command/result 协议类型与 action 枚举
6. win-agent MVP（transport + launch / open-folder / check-path 三命令，本机对本机调试）
7. 中心加 AgentManager + AgentDriver，`/api/agents`（列表/状态/配对）
8. UI：设置页「受管机器」面板，原生按钮按 Agent 在线状态降级
9. 补全命令集 → 打包 exe → 安装脚本 → 自动更新（可选）
