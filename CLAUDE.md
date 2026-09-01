# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

全栈 Web 应用 —— 生产力工具管理系统。React 前端 + Node.js/Express 后端 + SQLite。

## 目录结构

```
app-manager/
├── shared/              # 前后端共享 TypeScript 类型
│   └── types.ts         # AppInfo, DocInfo, AppConfig, ApiResponse
├── backend/             # Node.js + Express + TypeScript + sql.js
│   └── src/
│       ├── index.ts     # 入口
│       ├── app.ts       # Express 应用配置
│       ├── database.ts  # sql.js 初始化、建表、持久化
│       └── routes/
│           ├── apps.ts  # 分类 CRUD + 应用 CRUD + 配置
│           ├── docs.ts  # 文档 CRUD
│           └── native.ts # 原生操作（启动 exe、打开文件/目录）
└── frontend/     # React + TypeScript + Vite
    └── src/
        ├── lib/utils.ts          # cn() 工具
        ├── components/
        │   ├── Layout.tsx        # 顶部导航栏 + 路由出口
        │   └── ui/               # UI 组件（Button/Card/Input/Dialog/Select/Badge/Textarea/Toast）
        ├── pages/
        │   ├── AppsPage.tsx      # 应用管理（侧栏「工具类目」+ 网格卡片 + 详情面板）
        │   ├── PkgsPage.tsx      # 安装包管理（同 AppsPage 布局 + EXE/ZIP 设置）
        │   ├── DocsPage.tsx      # 文档管理（表格 + 搜索 + 格式标签）
        │   └── SettingsPage.tsx  # 系统设置（目录配置）
        ├── api.ts       # HTTP API 封装（含原生操作 launchApp/openFile/openFolder）
        └── types.ts     # 前端类型定义

pre_code/               # 旧版 Python/PyQt5 参考实现（不再维护）
learn/                  # 学习文档
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 路由 | react-router-dom (BrowserRouter) |
| 样式 | Tailwind CSS v4 + 自建 shadcn 风格组件（Radix UI 原语） |
| 图标 | lucide-react |
| 后端 | Express + TypeScript + tsx |
| 数据库 | sql.js（SQLite WASM，纯 JS 零编译依赖） |

## API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查 |
| GET | /api/apps/categories | 获取所有分类及应用 |
| POST | /api/apps/categories | 添加分类 `{name}` |
| DELETE | /api/apps/categories/:name | 删除分类 |
| GET | /api/apps/categories/:name/apps | 获取分类下应用 |
| POST | /api/apps/apps | 添加应用 |
| DELETE | /api/apps/apps/:id | 删除应用 |
| PATCH | /api/apps/apps/:id | 更新应用字段（含 category 类目变更） |
| GET | /api/apps/config | 获取配置 |
| PUT | /api/apps/config | 更新配置 |
| GET | /api/docs | 获取所有文档 |
| POST | /api/docs | 添加文档 |
| DELETE | /api/docs/:id | 删除文档 |
| GET | /api/docs/by-app/:appId | 获取某应用的文档 |
| POST | /api/native/launch | 启动 exe `{filePath}` |
| POST | /api/native/open-file | 用默认程序打开文件 |
| POST | /api/native/open-folder | 在资源管理器打开目录 |
| POST | /api/native/check-path | 检查路径是否存在 |
| POST | /api/native/copy-pkg | 复制安装包到管理目录 `{sourcePath, appName}` |

## 数据表结构

- **categories**: id INTEGER PK AUTOINCREMENT, name TEXT UNIQUE NOT NULL
- **apps**: id TEXT PK, name, version, path, description, is_installed(0/1), exe_pkg, zip_pkg, download_url, category_id(FK→categories)
- **documents**: id TEXT PK, name, path, format, category, app_id(FK→apps)
- **config**: key TEXT PK, value TEXT

数据库文件 `backend/data/app-manager.db`，首次启动自动建表并写入默认类目和配置。

## 文档体系

本项目有三份核心文档，各司其职：

1. **CLAUDE.md**（本文件）— 项目规则，你每次必读
2. **docs/requirements.md** — 需求目标、数据模型、API 设计、业务规则
3. **docs/ux-patterns.md** — 可复用的 UI/UX 设计模式库

### 文档生成指引
当用户说"帮我初始化项目文档"时，请按以下步骤操作：

1. 根据用户描述的需求，生成 requirements 文档（使用需求文档模板）
2. 根据技术栈和需求，生成 ux-patterns 文档（使用技术设计模板）
3. 每生成一份文档，先给用户确认，确认后再写入文件
4. 文档中的不确定部分用 [待定] 标记，不要编造

### 每次迭代的文档更新
当用户说"本轮完成"或"更新需求文档"时：
1. 将已完成的功能从"当前需求"移到"已完成"区
2. 检查"停车场"，建议哪些可以加入下一轮
3. 如有重大方向变化，记录到"决策日志"

## 前端设计约定

### 布局
- **顶部导航栏**：h-12，Logo + 页面标签（应用/安装包/文档）+ 系统设置
- **页面内**：左侧「工具类目」侧边栏（w-44，展开文字 + 计数 + hover 删除） + 右侧网格卡片区
- **类目栏**：第一项固定为「全部工具」（显示所有类目应用汇总），其余为实际类目
- **卡片**：flex flex-col 三段式 —— Header（图标 + 名称同行类目标签 + 版本下行 + 状态徽章）/ Body（描述）/ Footer（操作按钮）
- **详情面板**：右侧 w-72，与卡片相同的头部布局（图标 + 名称版本 + 类目框 + 徽章）+ 下方字段 + 操作按钮
- **网格**：`repeat(auto-fill, minmax(320px, 1fr))` 自适应列数
- **标题栏**：`pt-4 pb-3` 统一间距，Buttons 组件确保跨页高度一致
- **Toast**：右上角弹出通知，success（绿勾）/ error（红叉），3 秒自动消失

### 配色（极简黑白灰）
- 主色 `#1a1a1a`（深黑），背景 `#f5f5f5`，卡片白底
- 类目图标色：stone / emerald / amber / rose / violet / teal（无蓝）
- 文字：`#1f2329` / `#646a73`，边框 `#e8e8e8`
- 徽章：`bg-[#f2f3f5] text-[#646a73] rounded-[4px]`
- 类目标签：`border border-[#e5e6e8] rounded` 细边框

### 表单校验
- 应用名称（必填）、类目（必填）：提交时校验，不通过直接 return
- 后端 PATCH 路由支持 category 字段，前端修改类目后保存即可更新 category_id
