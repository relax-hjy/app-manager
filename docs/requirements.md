# App Manager 需求文档

> 本地生产力工具管理系统 — 功能需求、业务规则与数据模型

---

## 一、系统概述

### 1.1 目标

管理 Windows 本地的应用软件、安装包和相关文档，提供统一的入口启动应用、管理安装包、查阅文档。

### 1.2 用户场景

| 场景 | 描述 |
|------|------|
| 日常使用 | 快速找到并启动常用工具 |
| 工具管理 | 记录工具的版本、路径、安装状态 |
| 安装包归档 | 集中管理 EXE/ZIP 安装包，便于重装 |
| 文档查阅 | 按类型和领域浏览关联文档 |
| 文档扫描 | 自动发现新增/失效的文档文件 |

---

## 二、功能模块

### 2.1 应用管理

**功能清单**：
- 按分类组织应用（办公工具、开发工具、实用工具等）
- 添加 / 编辑 / 删除应用
- 启动应用（调用本地 EXE）
- 查看应用详情（路径、版本、描述、安装状态）
- 自动提取 EXE 图标作为应用图标

**字段定义**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | 文本 | ✅ | 应用名称 |
| version | 文本 | | 版本号 |
| path | 文本 | | EXE 路径 |
| description | 文本 | | 描述 |
| is_installed | 布尔 | | 是否已安装 |
| category | 文本 | ✅ | 所属分类（关联分类表） |

**业务规则**：
- 应用名称允许重复（无唯一约束）
- 删除分类时，该分类下所有应用**级联删除**
- 应用 ID 使用 UUID v4 自动生成
- 更新应用路径时，自动清除图标缓存以重新提取

---

### 2.2 分类管理

**功能清单**：
- 添加 / 删除分类
- 分类下显示应用数量

**字段定义**：

| 字段 | 类型 | 约束 |
|------|------|------|
| name | 文本 | NOT NULL, UNIQUE |

**业务规则**：
- 分类名称不可重复
- 删除分类会级联删除其下所有应用
- 首次运行自动创建默认分类：办公工具、开发工具、实用工具、其他工具

---

### 2.3 安装包管理

**功能清单**：
- 为应用设置 EXE 或 ZIP 安装包
- 支持文件上传或手动输入路径
- 复制安装包到统一管理目录
- 设置安装包下载地址（外部链接）

**字段定义**：

| 字段 | 类型 | 说明 |
|------|------|------|
| exe_pkg | 文本 | EXE 安装包路径 |
| zip_pkg | 文本 | ZIP 安装包路径 |
| download_url | 文本 | 安装包下载地址（HTTP/HTTPS） |

**业务规则**：
- EXE 和 ZIP **互斥**：设置一个时自动清空另一个
- `download_url` 不参与互斥，可与 EXE/ZIP 共存
- 安装包复制到 `{base_directory}/{appName}/` 目录
- 支持两种设置方式：文件浏览上传 / 手动粘贴路径
- 卡片上有"下载"按钮时，点击在新标签页打开下载链接

---

### 2.4 文档管理

**功能清单**：
- 添加 / 编辑 / 删除文档
- 按格式（知识总结、工具指南等）和领域分类
- 模糊搜索（匹配名称、描述、分类、格式）
- 扫描文档目录，发现新增/失效文件
- 关联文档到应用

**字段定义**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | 文本 | ✅ | 文档名称 |
| path | 文本 | | 文件路径 |
| format | 文本 | | 格式（如"知识总结"） |
| category | 文本 | | 领域（如"Python"） |
| app_id | 文本 | | 关联应用 ID |
| description | 文本 | | 描述 |

**业务规则**：
- 文档名称允许重复
- 删除应用时，关联文档的 `app_id` 置为 NULL（文档不删除）
- `app_id` 存储时不校验应用是否存在（由外键约束保证）
- 仅支持 `.md` 和 `.pdf` 文件
- 文档目录约定：`{doc_directory}/{format}/{category}/{filename}`

**扫描逻辑**：
- 对比磁盘文件与数据库记录
- 返回：新增文件、新增分类、失效文档（数据库有但磁盘无）
- 支持按 format/category 缩小扫描范围
- 跳过以 `.` 开头的隐藏文件/目录

---

### 2.5 系统配置

**配置项**：

| Key | 说明 | 默认值 |
|-----|------|--------|
| base_directory | 安装包管理根目录 | `D:\Installation` |
| install_directory | 应用安装目录 | `D:\Software` |
| doc_directory | 文档目录 | `D:\Documents` |

**业务规则**：
- 配置更新为部分更新（只更新传入的 key）
- 首次运行自动写入默认配置

---

### 2.6 本机操作

| 操作 | 说明 | 实现方式 |
|------|------|----------|
| 启动应用 | 运行 EXE 文件 | `start "" "{path}"` |
| 打开文件 | 用默认程序打开 | `start "" "{path}"` |
| 打开目录 | 在资源管理器打开 | `explorer "{dir}"` |
| 检查路径 | 判断文件/目录是否存在 | `fs.existsSync` |
| 复制安装包 | 复制到管理目录 | `fs.copyFileSync` |
| 上传安装包 | 浏览器上传到管理目录 | `multer` + `fs.writeFileSync` |
| 保存文档 | 写入文件内容 | `fs.writeFileSync` |
| 提取图标 | 从 EXE 提取图标 | PowerShell `ExtractAssociatedIcon` |

**业务规则**：
- 启动/打开操作为 fire-and-forget，立即返回
- 图标缓存在 `data/icons/{appId}.png`，路径变更时自动失效
- 删除文档分类前，检查是否有文档引用该分类，有则拒绝删除

---

## 三、数据模型

### 3.1 ER 关系

```
categories (1) ──< (N) apps (1) ──< (N) documents
```

- 一个分类包含多个应用（级联删除）
- 一个应用关联多个文档（删除应用时文档 app_id 置空）

### 3.2 表结构

**categories**
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
)
```

**apps**
```sql
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_installed INTEGER NOT NULL DEFAULT 0,
  exe_pkg TEXT NOT NULL DEFAULT '',
  zip_pkg TEXT NOT NULL DEFAULT '',
  download_url TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
)
```

**documents**
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  app_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
)
```

**config**
```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
)
```

---

## 四、API 设计

### 4.1 应用与分类

| 方法 | 路径 | 说明 | 校验 |
|------|------|------|------|
| GET | /api/apps/categories | 获取所有分类及应用 | — |
| POST | /api/apps/categories | 添加分类 | name 必填，不可重复 |
| DELETE | /api/apps/categories/:name | 删除分类（级联删除应用） | — |
| GET | /api/apps/categories/:name/apps | 获取分类下应用 | — |
| POST | /api/apps/apps | 添加应用 | name + category 必填，分类须存在 |
| PATCH | /api/apps/apps/:id | 更新应用字段 | 至少一个有效字段 |
| DELETE | /api/apps/apps/:id | 删除应用 | — |
| GET | /api/apps/config | 获取配置 | — |
| PUT | /api/apps/config | 更新配置（部分更新） | — |

### 4.2 文档

| 方法 | 路径 | 说明 | 校验 |
|------|------|------|------|
| GET | /api/docs | 获取文档列表（支持 ?search=） | — |
| POST | /api/docs | 添加文档 | name 必填 |
| PATCH | /api/docs/:id | 更新文档 | 至少一个有效字段 |
| DELETE | /api/docs/:id | 删除文档 | — |
| GET | /api/docs/by-app/:appId | 获取应用关联文档 | — |
| GET | /api/docs/categories | 获取已使用的文档分类 | — |

### 4.3 本机操作

| 方法 | 路径 | 说明 | 校验 |
|------|------|------|------|
| GET | /api/native/icon/:appId | 获取应用图标 | 应用须存在且有路径 |
| POST | /api/native/launch | 启动 EXE | filePath 必填，文件须存在 |
| POST | /api/native/open-file | 默认程序打开文件 | filePath 必填，文件须存在 |
| POST | /api/native/open-folder | 资源管理器打开目录 | filePath 必填 |
| POST | /api/native/check-path | 检查路径是否存在 | — |
| POST | /api/native/copy-pkg | 复制安装包到管理目录 | sourcePath + appName 必填 |
| POST | /api/native/upload-pkg | 上传安装包 | 文件 + appName 必填 |
| POST | /api/native/scan-docs | 扫描文档目录 | doc_directory 须已配置 |
| POST | /api/native/save-doc | 保存文档内容到文件 | filePath 必填 |
| POST | /api/native/ensure-doc-dirs | 创建默认文档类型目录 | doc_directory 须已配置 |
| POST | /api/native/delete-category | 删除文档分类目录 | format + category 必填，且无关联文档 |

---

## 五、技术约束

| 项目 | 说明 |
|------|------|
| 数据库 | sql.js（SQLite WASM），内存中操作，每次写入后持久化到磁盘 |
| 数据库文件 | `backend/data/app-manager.db` |
| 图标缓存 | `backend/data/icons/{appId}.png` |
| 平台 | Windows（原生操作依赖 Windows shell 命令） |
| 端口 | 后端默认 3001，可通过 PORT 环境变量覆盖 |
| CORS | 全开放（开发用途） |
| 支持的文档格式 | `.md`、`.pdf` |

---

## 六、已知约束与边界

| 项目 | 说明 |
|------|------|
| 应用名称不唯一 | 同名应用可存在多个 |
| 文档名称不唯一 | 同名文档可存在多个 |
| 删除分类无二次确认 | 依赖前端 `confirm()` 弹窗 |
| app_id 无前端校验 | 创建文档时 app_id 直接存储，由数据库外键约束 |
| 原生操作无错误回传 | 启动/打开操作为 fire-and-forget |
| 图标提取仅限 EXE | ZIP 安装包无图标 |
