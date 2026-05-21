# App Manager

本地生产力工具管理系统，用于管理 Windows 上的应用软件、安装包和相关文档。

## 功能

- **应用管理** — 按分类管理应用信息（名称、版本、路径、安装状态等）
- **文档管理** — 管理应用关联的文档，支持模糊搜索
- **安装包管理** — 管理应用的 exe / zip 安装包
- **本机操作** — 启动应用、打开文件/目录、复制安装包到管理目录
- **系统配置** — 管理基础目录、安装目录、文档目录等路径配置

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Express + sql.js (SQLite/WASM) + TypeScript |
| 前端 | React 19 + Vite 8 + Tailwind CSS 4 + shadcn/ui |
| 路由 | React Router 7 |

## 目录结构

```
app-manager/
├── backend/              # Express 后端服务
│   ├── src/
│   │   ├── index.ts      # 入口
│   │   ├── app.ts        # Express 应用配置
│   │   ├── database.ts   # 数据库初始化 & 查询工具
│   │   ├── types.ts      # 类型定义
│   │   └── routes/
│   │       ├── apps.ts   # 应用 & 分类 & 配置 API
│   │       ├── docs.ts   # 文档 CRUD API
│   │       └── native.ts # 本机操作 API（启动/打开/复制）
│   └── data/             # SQLite 数据库文件（运行时生成）
└── frontend-admin/       # React 管理前端
    └── src/
        ├── api.ts        # 后端 API 封装
        ├── App.tsx       # 路由配置
        ├── types.ts      # 前端类型定义
        ├── pages/        # 页面组件
        ├── components/   # 通用组件 & UI 组件
        └── lib/          # 工具函数
```

## 快速开始

```bash
# 1. 后端
cd backend
npm install
npm run dev        # 开发模式，默认 http://localhost:3001

# 2. 前端（新终端）
cd frontend-admin
npm install
npm run dev        # 开发模式，默认 http://localhost:5173
```

前端通过 Vite proxy 将 `/api` 请求转发到后端，无需额外配置。

## API 概览

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查 |
| `GET/POST /api/apps/categories` | 分类列表 / 新增 |
| `DELETE /api/apps/categories/:name` | 删除分类 |
| `GET /api/apps/categories/:name/apps` | 分类下的应用 |
| `POST /api/apps/apps` | 新增应用 |
| `PATCH /api/apps/apps/:id` | 更新应用 |
| `DELETE /api/apps/apps/:id` | 删除应用 |
| `GET/PUT /api/apps/config` | 获取 / 更新配置 |
| `GET/POST /api/docs` | 文档列表（支持 `?search=`）/ 新增 |
| `PATCH/DELETE /api/docs/:id` | 更新 / 删除文档 |
| `GET /api/docs/by-app/:appId` | 获取应用关联文档 |
| `POST /api/native/launch` | 启动应用 |
| `POST /api/native/open-file` | 用默认程序打开文件 |
| `POST /api/native/open-folder` | 打开文件所在目录 |
| `POST /api/native/copy-pkg` | 复制安装包到管理目录 |
| `POST /api/native/save-doc` | 保存文档内容到文件 |
| `POST /api/native/check-path` | 检查文件是否存在 |
