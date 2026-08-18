// db.js
// ไฟล์นี้คือ "แกนฐานข้อมูล" ของระบบ ใช้ SQLite (เก็บเป็นไฟล์ rental.db)
// ถ้าต้องการเพิ่ม/แก้ไข field ให้แก้ไข SQL ด้านล่างนี้ได้เลย
// แล้วลบไฟล์ rental.db เก่าทิ้ง (หรือเขียน ALTER TABLE เพิ่มเอง) เพื่อให้ตารางอัปเดต

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'rental.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ ตารางพนักงาน (employees) และบัญชีผู้ใช้งาน (accounts) ============
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_url        TEXT,
  full_name        TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  id_card          TEXT,
  address          TEXT,
  facebook         TEXT,
  instagram        TEXT,
  tiktok           TEXT,
  license_no       TEXT,
  position         TEXT,
  department       TEXT,
  start_date       TEXT,
  is_active        INTEGER DEFAULT 1,
  notes            TEXT,
  extra_data       TEXT,
  created_at       TEXT DEFAULT (datetime('now','localtime')),
  updated_at       TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  username         TEXT NOT NULL UNIQUE,
  password         TEXT NOT NULL,
  role             TEXT DEFAULT 'staff' CHECK(role IN ('admin','staff')),
  is_active        INTEGER DEFAULT 1,
  created_by       INTEGER,
  created_at       TEXT DEFAULT (datetime('now','localtime')),
  updated_at       TEXT DEFAULT (datetime('now','localtime'))
);
`);

// ============ ตารางลูกค้า (customers) ============
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_url        TEXT,      -- รูปหน้าลูกค้า (path ไฟล์ที่อัปโหลด)
  full_name        TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  id_card           TEXT,      -- เลขบัตรประชาชน / พาสปอร์ต
  address           TEXT,
  facebook          TEXT,
  instagram         TEXT,
  tiktok            TEXT,
  license_no        TEXT,      -- เลขที่ใบขับขี่
  is_blacklisted    INTEGER DEFAULT 0,   -- 0 = ปกติ, 1 = ติด blacklist
  blacklist_reason  TEXT,      -- เหตุผลที่ติด blacklist
  notes             TEXT,
  extra_data        TEXT,      -- JSON string สำหรับเก็บฟิลด์ custom เพิ่มเติมได้อิสระ
  created_at        TEXT DEFAULT (datetime('now','localtime')),
  updated_at        TEXT DEFAULT (datetime('now','localtime'))
);
`);

// ============ ตารางรถ (vehicles) ============
db.exec(`
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_url     TEXT,      -- รูปรถ (path ไฟล์ที่อัปโหลด)
  type          TEXT NOT NULL CHECK(type IN ('bike','car')), -- bike = บิ๊กไบค์, car = รถยนต์
  brand         TEXT,
  model         TEXT,
  year          INTEGER,
  license_plate TEXT,
  color         TEXT,
  daily_rate    REAL DEFAULT 0,     -- ราคาเช่าต่อวัน
  deposit_rate  REAL DEFAULT 0,     -- ค่ามัดจำ
  status        TEXT DEFAULT 'available' CHECK(status IN ('available','rented','maintenance')),
  notes         TEXT,
  extra_data    TEXT,      -- JSON string สำหรับฟิลด์ custom เพิ่มเติม
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);
`);

// ============ ตารางรายการเช่า (rentals) ============
// หมายเหตุ: start_datetime / end_datetime / actual_return_datetime เก็บเป็น 'YYYY-MM-DD HH:MM'
db.exec(`
CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id             INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id              INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  start_datetime          TEXT NOT NULL,   -- วันเวลาที่ส่งรถให้ลูกค้า
  end_datetime            TEXT NOT NULL,   -- วันเวลากำหนดคืนรถ
  actual_return_datetime  TEXT,            -- วันเวลาที่คืนจริง (null = ยังไม่คืน)
  total_price             REAL DEFAULT 0,
  deposit_paid            REAL DEFAULT 0,
  status                  TEXT DEFAULT 'active' CHECK(status IN ('active','returned','overdue','cancelled')),
  pickup_location         TEXT,
  return_location         TEXT,
  notes                   TEXT,
  extra_data              TEXT,      -- JSON string สำหรับฟิลด์ custom เพิ่มเติม
  created_at              TEXT DEFAULT (datetime('now','localtime')),
  updated_at              TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  app_name TEXT DEFAULT 'PY GARAGE MENU',
  app_subtitle TEXT DEFAULT 'Rental Ops',
  app_title TEXT DEFAULT 'PY GARAGE MENU',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

const defaultAdmin = db.prepare(`SELECT * FROM accounts WHERE username = ?`).get('admin');
if (!defaultAdmin) {
  db.prepare(`
    INSERT INTO accounts (employee_id, username, password, role, is_active, created_by)
    VALUES (NULL, 'admin', 'admin123', 'admin', 1, NULL)
  `).run();
}

const defaultSettings = db.prepare(`SELECT * FROM app_settings WHERE id = 1`).get();
if (!defaultSettings) {
  db.prepare(`
    INSERT INTO app_settings (id, app_name, app_subtitle, app_title)
    VALUES (1, 'PY GARAGE MENU', 'Rental Ops', 'PY GARAGE MENU')
  `).run();
}

module.exports = db;
