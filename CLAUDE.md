# 项目约定

## 项目简介
管理 Windows 本地应用软件、安装包与相关文档的生产力工具管理系统（App Manager）。

## 技术栈
<!-- 可根据项目实际情况灵活调整 -->
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI 原语（自建 shadcn 风格组件）
- 后端：Node.js + Express + TypeScript（tsx 热重载）
- 数据库：sql.js（SQLite WASM，纯 JS 零编译依赖），文件 `backend/data/app-manager.db`

## 代码规范
<!-- 根据开发语言灵活调整 -->
- 使用 2 空格缩进
- 组件用 PascalCase，工具函数用 camelCase
- 所有函数必须有 JSDoc 注释

## 禁止事项
- 不要使用 any 类型
- 不要在组件里直接发请求（一律走 `frontend/src/api.ts`）
- 不要引入新的 UI 组件库（图标统一用 lucide-react）
- 不要动 `pre_code/`（旧版 Python/PyQt5 参考实现，不再维护）

## 目录结构
```
package.json          # 根脚本：install:all / dev（一键启动+端口预检）
scripts/
  preflight.mjs       # 开发启动预检（依赖 + 端口占用，仅提示不杀）
shared/               # 前后端共享类型
  types.ts            # AppInfo, DocInfo, AppConfig, ApiResponse
backend/              # Express + sql.js
  src/
    index.ts          # 入口
    app.ts            # Express 配置（端口默认 3001）
    database.ts       # sql.js 初始化、建表、持久化
    routes/
      apps.ts         # 分类 CRUD + 应用 CRUD + 配置
      docs.ts         # 文档 CRUD + 扫描
      native.ts       # 原生操作（启动 exe、图标提取、上传安装包等）
frontend/             # React + Vite
  src/
    api.ts            # HTTP API 封装
    types.ts          # 前端类型
    components/
      Layout.tsx      # 顶部导航 + 路由出口
      ui/             # Button/Card/Input/Dialog/Select/Badge/Textarea/Toast
    pages/
      AppsPage.tsx    # 应用管理
      PkgsPage.tsx    # 安装包管理
      DocsPage.tsx    # 文档管理
      SettingsPage.tsx# 系统设置
docs/                 # 项目文档
```

开发启动：根目录 `npm run install:all`（首次）+ `npm run dev`（一键双端）。

## 文档体系
本项目有四份核心文档，各司其职：

1. **CLAUDE.md**（本文件）— 项目规则，你每次必读
2. **[[AppManager-技术设计]]** — 数据模型、API 设计、模块架构
3. **[[AppManager-需求]]** — 待办列表、已完成功能、决策日志
4. **[[AppManager-使用文档]]** — 面向用户的使用手册，完成功能后同步更新

### 每次迭代的文档更新

**开工时**（本轮要做的功能确定后）：
- 在需求文档的"待办列表"中给对应条目加上 [正在做] 标识；列表里没有对应条目的，先按格式新建一条（含 [正在做]）再开工
- 同一时间尽量只保持一个条目带 [正在做]，一次只推进一件事

**收尾时**（当用户说"本轮完成"或"更新文档"）：

**需求文档：**
1. **核对完成**：逐条检查"待办列表"，已实现且验证通过的条目移到"已完成"区——保留原序号、去掉 [正在做]、标注日期（YYYY-MM-DD）；本轮新实现但不在列表里的功能，直接补写进"已完成"
2. **处理未完成**：仍在推进的条目保留 [正在做]；中止没做完的去掉标识，按优先级留在"待办列表"
3. **补充新想法**：本轮冒出来的新想法，与用户确认后按格式 `- [ ] 序号. [优先级] 内容` 追加进"待办列表"，序号在已用过的最大序号上继续递增；拿不准要不要做的先问用户，不要擅自添加
4. **记录决策**：仅重大方向变化才记（如"这个不做了""换成另一种方案"），在"决策日志"追加 `- **YYYY-MM-DD**：[决定]，原因是 [...]`；日常小调整不记

不确定某条是否完成时，先问用户再移动，不要凭猜测修改文档。

**技术设计文档：**
5. 如本轮涉及新增/修改数据模型、API、模块依赖，同步更新技术设计文档
6. 如本轮未涉及架构变化，跳过

**使用文档：**
7. 将本轮新完成功能的使用方法写入使用文档对应章节
8. 如已有功能的操作方式发生变化，更新对应章节

**输出格式：**
更新完成后，给用户一个简洁的本轮总结：
- 本轮完成了什么（1-2 句话）
- 文档做了哪些更新
- 建议下一轮做什么
