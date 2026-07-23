const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;

  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');
  
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const bindParams = Array.isArray(params) ? params : (params.bind || []);
  const stmt = db.prepare(sql);
  if (bindParams.length > 0) stmt.bind(bindParams);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const bindParams = Array.isArray(params) ? params : (params.bind || []);
  db.run(sql, bindParams);
  return db.getRowsModified();
}

function run(sql) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql);
}

function exec(sql, params) {
  const rows = queryAll(sql, params);
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  return [{
    columns,
    values: rows.map(row => columns.map(col => row[col]))
  }];
}

module.exports = { getDb, saveDb, closeDb, queryAll, queryOne, execute, run, exec };
