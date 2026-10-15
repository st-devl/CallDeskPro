import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface AppDatabase {
  db: Database.Database;
  close: () => void;
}

let dbInstance: Database.Database | null = null;

export function initDatabase(dbPath: string): Database.Database {
  if (dbInstance) return dbInstance;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // WAL modu, foreign key ve timeout ayarları
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Şema ve sürüm kontrolü
  const userVersion = db.pragma('user_version', { simple: true }) as number;

  if (userVersion === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'agent')),
        active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_open INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        organization_name TEXT NOT NULL,
        country TEXT,
        city TEXT,
        whatsapp TEXT,
        phone TEXT,
        website TEXT,
        contact_person TEXT,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TEXT,
        status TEXT CHECK(status IN ('positive', 'negative', 'follow_up') OR status IS NULL),
        note TEXT,
        last_contact_date TEXT,
        last_contact_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        follow_up_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        search_text TEXT NOT NULL,
        name_sort TEXT NOT NULL,
        whatsapp_normalized TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_org_whatsapp ON organizations(whatsapp_normalized)
        WHERE whatsapp_normalized IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_org_assigned_to ON organizations(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_org_list_id ON organizations(list_id);
      CREATE INDEX IF NOT EXISTS idx_org_status ON organizations(status);
      CREATE INDEX IF NOT EXISTS idx_org_country ON organizations(country);
      CREATE INDEX IF NOT EXISTS idx_org_city ON organizations(city);
      CREATE INDEX IF NOT EXISTS idx_org_follow_up ON organizations(follow_up_date);
      CREATE INDEX IF NOT EXISTS idx_org_pool ON organizations(assigned_to, list_id, id);

      CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('positive', 'negative', 'follow_up')),
        note TEXT,
        follow_up_date TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_calls_org ON calls(organization_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id, created_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO settings (key, value) VALUES ('uncontacted_limit', '1');

      PRAGMA user_version = 2;
    `);
  }

  // user_version kontrolü ve geriye dönük migration (website kolonu)
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < 2) {
    const tableInfo = db.prepare("PRAGMA table_info(organizations)").all() as Array<{ name: string }>;
    const hasWebsite = tableInfo.some((col) => col.name === 'website');
    if (!hasWebsite) {
      db.exec(`ALTER TABLE organizations ADD COLUMN website TEXT;`);
    }
    db.pragma('user_version = 2');
  }

  // Manuel kayıtlar için varsayılan liste oluştur
  const manualList = db.prepare("SELECT id FROM lists WHERE name = 'Manuel Kayıtlar'").get();
  if (!manualList) {
    db.prepare(`
      INSERT INTO lists (name, is_open, created_by, created_at)
      VALUES ('Manuel Kayıtlar', 0, NULL, datetime('now'))
    `).run();
  }

  dbInstance = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Veritabanı başlatılmadı! Önce initDatabase çağrılmalı.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
