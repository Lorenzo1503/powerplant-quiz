const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs2 = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const IMPORT_LOCK_PATH = path.join(__dirname, '.import_complete');

let db = null; let SQL = null; let importInProgress = false; let importComplete = false;

async function getDb() {
  if (db) return db;
  SQL = await initSqlJs();
  if (fs2.existsSync(DB_PATH)) {
    try {
      const buffer = fs2.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      const tr = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1");
      if (!(tr && tr[0] && tr[0].values && tr[0].values.length > 0)) throw new Error('Tables missing');
      importComplete = fs2.existsSync(IMPORT_LOCK_PATH);
    } catch (e) {
      console.log('DB rebuild:', e.message);
      db = new SQL.Database();
      createSchema();
    }
  } else {
    db = new SQL.Database();
    createSchema();
  }
  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

function createSchema() {
  console.log('Creating schema...');
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, google_id TEXT, role TEXT NOT NULL DEFAULT 'student', full_name TEXT, student_id TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  db.run("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY, type TEXT, module TEXT, topic TEXT, difficulty TEXT, difficulty_value INTEGER, question_text TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_answer TEXT, curriculum_map_id TEXT, course_code TEXT, subtopic TEXT, discrimination REAL, guessing REAL, active INTEGER DEFAULT 1, exposure_count INTEGER DEFAULT 0, attempt_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, average_time_seconds REAL DEFAULT 0, explanation TEXT, learning_outcome TEXT, ai_review_status TEXT, fields_changed TEXT, correction_summary TEXT, refs TEXT, confidence_level TEXT, human_review_required TEXT DEFAULT 'No', human_review_reason TEXT, ai_reviewed_date TEXT, batch_number INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS quiz_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, score REAL, total_questions INTEGER, correct_count INTEGER, time_taken_seconds INTEGER, completed_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))");
  db.run("CREATE TABLE IF NOT EXISTS quiz_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, question_id INTEGER NOT NULL, selected_answer TEXT, is_correct INTEGER, FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id), FOREIGN KEY (question_id) REFERENCES questions(id))");

  var ac = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!(ac && ac[0] && ac[0].values && ac[0].values.length > 0)) {
    var hp = require('bcryptjs').hashSync('Admin@123', 10);
    db.run("INSERT OR IGNORE INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, 'admin', ?, 1)", ['admin', 'admin@powerplant.edu', hp, 'System Administrator']);
    console.log('Admin created');
  }
  var sc = db.exec("SELECT id FROM users WHERE username = 'student' LIMIT 1");
  if (!(sc && sc[0] && sc[0].values && sc[0].values.length > 0)) {
    var hp2 = require('bcryptjs').hashSync('Student@123', 10);
    db.run("INSERT OR IGNORE INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, 'student', ?, 1)", ['student', 'student@powerplant.edu', hp2, 'Demo Student']);
    console.log('Student created');
  }
  saveDb();
}

async function importQuestionsFromCsv() {
  if (importInProgress || importComplete) return;
  importInProgress = true;
  try {
    var qr = db.exec('SELECT COUNT(*) as cnt FROM questions');
    var count = (qr && qr[0] && qr[0].values && qr[0].values[0]) ? qr[0].values[0][0] : 0;
    if (count > 0) {
      importComplete = true;
      fs2.writeFileSync(IMPORT_LOCK_PATH, 'done');
      console.log('Loaded:', count);
      importInProgress = false;
      return;
    }
    var csvFn = 'questions.csv';
    if (!fs2.existsSync(path.join(__dirname, csvFn))) {
      if (fs2.existsSync(path.join(__dirname, 'question_bank.csv'))) csvFn = 'question_bank.csv';
    }
    var cp = path.join(__dirname, csvFn);
    if (!fs2.existsSync(cp)) { console.log('No CSV'); importInProgress = false; return; }
    console.log('Importing...');
    var cc = fs2.readFileSync(cp, 'utf-8');
    var records = parse(cc, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    var imported = 0; var skipped = 0;
    var cr = db.exec('SELECT COUNT(*) as c FROM questions');
    var existing = (cr && cr[0] && cr[0].values && cr[0].values[0]) ? cr[0].values[0][0] : 0;
    if (existing === 0) {
      for (var i = 0; i < records.length; i++) {
        try {
          var row = records[i];
          var id = parseInt(row.ID);
          if (!id) { skipped++; continue; }
          db.run("INSERT OR IGNORE INTO questions (id, type, module, topic, difficulty, difficulty_value, question_text, option_a, option_b, option_c, option_d, correct_answer, curriculum_map_id, course_code, subtopic, discrimination, guessing, active, exposure_count, attempt_count, correct_count, average_time_seconds, explanation, learning_outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, row.Type||'', row.Module||'', row.Topic||'', row.Difficulty||'', parseInt(row.DifficultyValue)||0, row.QuestionText||'', row.OptionA||'', row.OptionB||'', row.OptionC||'', row.OptionD||'', row.CorrectAnswer||'', row.CurriculumMapID||'', row.CourseCode||'', row.Subtopic||'', parseFloat(row.Discrimination)||0, parseFloat(row.Guessing)||0, row.Active==='TRUE'?1:0, parseInt(row.ExposureCount)||0, parseInt(row.AttemptCount)||0, parseInt(row.CorrectCount)||0, parseFloat(row.AverageTimeSeconds)||0, row.Explanation||'', row.LearningOutcome||'']);
          imported++;
          if (imported % 500 === 0) saveDb();
        } catch (e) { skipped++; }
      }
    }
    saveDb();
    importComplete = true;
    fs2.writeFileSync(IMPORT_LOCK_PATH, 'done');
    console.log('Imported ' + imported + ' (' + skipped + ' skipped)');
  } catch (err) { console.error('CSV error:', err.message); }
  importInProgress = false;
}

function startBackgroundImport() {
  if (importComplete || fs2.existsSync(IMPORT_LOCK_PATH)) { importComplete = true; return; }
  importQuestionsFromCsv().catch(function(e) { console.error('BG error:', e); });
}

function queryAll(sql, params) {
  if (!params) params = [];
  if (!db) throw new Error('DB not init');
  var stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  var rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function queryOne(sql, params) { var rows = queryAll(sql, params); return rows.length > 0 ? rows[0] : null; }
function execute(sql, params) { if (!params) params = []; if (!db) throw new Error('DB not init'); db.run(sql, params); return db.getRowsModified(); }
function exec(sql, params) { var rows = queryAll(sql, params); if (rows.length === 0) return []; var cols = Object.keys(rows[0]); return [{ columns: cols, values: rows.map(function(r) { return cols.map(function(c) { return r[c]; }); }) }]; }
function saveDb() { if (!db) return; try { var data = db.export(); fs2.writeFileSync(DB_PATH, Buffer.from(data)); } catch (e) { console.error('Save error:', e.message); } }
async function closeDb() { if (db) { saveDb(); db.close(); db = null; } }
module.exports = { getDb, saveDb, closeDb, queryAll, queryOne, execute, exec, startBackgroundImport };