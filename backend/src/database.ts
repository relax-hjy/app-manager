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
}

export { saveDb }
