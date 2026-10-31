'use strict';
// SQLite storage for DevicePassport. All data is local; no cloud, no telemetry.
// Uses Node's built-in node:sqlite (Node >= 22.5), so there are no
// native-compiled dependencies to install.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DEVICEPASSPORT_DB
  || path.join(__dirname, '..', 'devicepassport.db');

function openDb(dbPath = DB_PATH) {
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_type TEXT DEFAULT 'computer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id),
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      model TEXT DEFAULT 'unknown',
      serial TEXT DEFAULT 'unknown',
      firmware TEXT DEFAULT 'unknown',
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id),
      name TEXT NOT NULL,
      version TEXT DEFAULT 'unknown',
      provider TEXT DEFAULT 'unknown',
      device_name TEXT DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id),
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      cost TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id),
      component TEXT NOT NULL,
      provider TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id),
      label TEXT NOT NULL,
      taken_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload TEXT NOT NULL
    );
  `);
  return db;
}

function ensureDevice(db) {
  let device = db.prepare('SELECT * FROM devices ORDER BY id LIMIT 1').get();
  if (!device) {
    const r = db.prepare('INSERT INTO devices (name) VALUES (?)').run('My Computer');
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(r.lastInsertRowid);
  }
  return device;
}

function rows(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}
function row(db, sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}
function parseDetails(r) {
  if (!r) return null;
  try { r.details = r.details ? JSON.parse(r.details) : {}; } catch { r.details = {}; }
  return r;
}
function warrantyStatus(w) {
  if (!w || !w.end_date) return 'unknown';
  const end = new Date(`${w.end_date}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return 'unknown';
  const now = new Date();
  const days = Math.ceil((end - now) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring soon';
  return 'active';
}

module.exports = { openDb, ensureDevice, rows, row, parseDetails, warrantyStatus, DB_PATH };
