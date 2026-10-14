import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(__dirname, '..', 'data', 'app-manager.db')

let db: SqlJsDatabase | null = null

function saveDb() {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH))
  } else {
    db = new SQL.Database()
  }

  initTables()
  saveDb()
  return db
}

function initTables() {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_installed INTEGER NOT NULL DEFAULT 0,
      exe_pkg TEXT NOT NULL DEFAULT '',
      zip_pkg TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      category_id INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      app_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO categories (name) VALUES ('办公工具');
    INSERT OR IGNORE INTO categories (name) VALUES ('开发工具');
    INSERT OR IGNORE INTO categories (name) VALUES ('实用工具');
    INSERT OR IGNORE INTO categories (name) VALUES ('其他工具');

    INSERT OR IGNORE INTO config (key, value) VALUES ('base_directory', 'D:\\Installation');
    INSERT OR IGNORE INTO config (key, value) VALUES ('install_directory', 'D:\\Software');
    INSERT OR IGNORE INTO config (key, value) VALUES ('doc_directory', 'D:\\Documents');
  `)

  try { db.exec(`ALTER TABLE documents ADD COLUMN description TEXT NOT NULL DEFAULT ''`) } catch {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN download_url TEXT NOT NULL DEFAULT ''`) } catch {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch {}
  // 查找结果持久化：候选 JSON、结果说明、完成时间（空串 = 无查找结果）
  try { db.exec(`ALTER TABLE apps ADD COLUMN find_candidates TEXT NOT NULL DEFAULT ''`) } catch {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN find_message TEXT NOT NULL DEFAULT ''`) } catch {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN find_finished_at TEXT NOT NULL DEFAULT ''`) } catch {}
  // 仅回填遗留行（sort_order = 0），rowid 保持插入顺序且唯一；之后为 no-op，用户排序不被覆盖
  try { db.exec(`UPDATE apps SET sort_order = rowid WHERE sort_order = 0`) } catch {}
}

export function queryAll(db: SqlJsDatabase, sql: string, params: any[] = []): Record<string, any>[] {
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows: Record<string, any>[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } catch {
    return []
  }
}

export function execute(db: SqlJsDatabase, sql: string, params: any[] = []) {
  db.run(sql, params)
  saveDb()
}

export { saveDb }
