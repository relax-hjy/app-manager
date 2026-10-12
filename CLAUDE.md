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
3. **[[AppManager-需求]]** — 开发计划清单、已完成功能、待办想法
4. **[[AppManager-使用文档]]** — 面向用户的使用手册，完成功能后同步更新

### 任务标识约定
"开发计划清单"中，当前正在处理的任务条目末尾加 🚧 标识；同一时间只有一条带标识。切换任务时先移除旧标识，再给新任务加上。

### 每次迭代的文档更新
当用户说"更新文档"时，只执行第一步。
当用户说"本轮完成"时，两步都执行：

**第一步：更新文档体系**

**需求文档：**
1. 回顾本轮对话，确认哪些功能已实现，将对应条目从"开发计划清单"移到"已完成"区，标注日期
2. 如本轮开发中用户提到了"以后再做""先不管""这个先放放"的想法，主动询问是否要加入"停车场"
3. 如有重大方向变化（如用户说"这个不做了""换成另一种方案"），记录到"决策日志"
4. 向"开发计划清单"补充下一轮建议要做的内容

**技术设计文档：**
5. 如本轮涉及新增/修改数据模型、API、模块依赖，同步更新技术设计文档
6. 如本轮未涉及架构变化，跳过

**使用文档：**
7. 将本轮新完成功能的使用方法写入使用文档对应章节
8. 如已有功能的操作方式发生变化，更新对应章节

**第二步：开启新一轮**

9. 询问用户下一轮目标（可从"开发计划清单"未完成条目中给出候选建议）
10. 用户确认后，按"任务标识约定"将 🚧 标识移到该任务条目上
11. 反馈"新一轮开始"，并用一句话复述本轮目标

**输出格式：**
更新完成后，给用户一个简洁的本轮总结：
- 本轮完成了什么（1-2 句话）
- 文档做了哪些更新
- 下一轮目标，以及已加 🚧 标识的任务条目（仅"本轮完成"流程）
