const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;

  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    try {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      // Test if users table has data
      const testResult = db.exec('SELECT COUNT(*) as cnt FROM users');
      const userCount = (testResult && testResult[0] && testResult[0].values && testResult[0].values[0]) 
        ? testResult[0].values[0][0] : 0;
      if (userCount === 0) {
        console.log('Existing DB has no users. Reinitializing schema...');
        await ensureTablesAndDefaults();
      }
    } catch (e) {
      console.log('DB corruption detected, rebuilding:', e.message);
      db = new SQL.Database();
      await ensureTablesAndDefaults();
    }
  } else {
    console.log('No database file found. Creating new database...');
    db = new SQL.Database();
    await ensureTablesAndDefaults();
  }

  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

// Helper: run a query via sql.js prepare/step pattern
function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
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
  db.run(sql, params);
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
  return [{ columns, values: rows.map(row => columns.map(col => row[col])) }];
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('Failed to save DB:', e.message);
  }
}

async function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

async function ensureTablesAndDefaults() {
  console.log('Creating database tables...');

  // Create tables using sql.js run() - no bind params for DDL
  run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, google_id TEXT, role TEXT NOT NULL DEFAULT \'student\', full_name TEXT, student_id TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  
  // Try to add google_id column if it doesn't exist (migration)
  try { run('ALTER TABLE users ADD COLUMN google_id TEXT'); } catch (e) { /* ignore */ }

  run('CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY, type TEXT, module TEXT, topic TEXT, difficulty TEXT, difficulty_value INTEGER, question_text TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_answer TEXT, curriculum_map_id TEXT, course_code TEXT, subtopic TEXT, discrimination REAL, guessing REAL, active INTEGER DEFAULT 1, exposure_count INTEGER DEFAULT 0, attempt_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, average_time_seconds REAL DEFAULT 0, explanation TEXT, learning_outcome TEXT, ai_review_status TEXT, fields_changed TEXT, correction_summary TEXT, refs TEXT, confidence_level TEXT, human_review_required TEXT DEFAULT \'No\', human_review_reason TEXT, ai_reviewed_date TEXT, batch_number INTEGER)');

  run('CREATE TABLE IF NOT EXISTS quiz_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, score REAL, total_questions INTEGER, correct_count INTEGER, time_taken_seconds INTEGER, completed_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))');

  run('CREATE TABLE IF NOT EXISTS quiz_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, question_id INTEGER NOT NULL, selected_answer TEXT, is_correct INTEGER, FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id), FOREIGN KEY (question_id) REFERENCES questions(id))');

  // Check if admin exists using sql.js compatible approach
  const adminCheck = db.exec('SELECT id FROM users WHERE role = \'admin\' LIMIT 1');
  const adminExists = adminCheck && adminCheck[0] && adminCheck[0].values && adminCheck[0].values.length > 0;
  
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('Admin@123', 10);
    db.run('INSERT OR IGNORE INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, ?, ?, ?)', 
      ['admin', 'admin@powerplant.edu', hashedPassword, 'admin', 'System Administrator', 1]);
    // Verify
    const verify = db.exec('SELECT username, role FROM users WHERE role = \'admin\' LIMIT 1');
    if (verify && verify[0] && verify[0].values && verify[0].values.length > 0) {
      console.log('✓ Created admin user (admin / Admin@123)');
    } else {
      console.error('FAILED to create admin user!');
    }
  } else {
    console.log('✓ Admin user exists');
  }

  // Check if student exists
  const studentCheck = db.exec('SELECT id FROM users WHERE username = \'student\' LIMIT 1');
  const studentExists = studentCheck && studentCheck[0] && studentCheck[0].values && studentCheck[0].values.length > 0;
  
  if (!studentExists) {
    const hashedPassword = bcrypt.hashSync('Student@123', 10);
    db.run('INSERT OR IGNORE INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, \'student\', ?, 1)',
      ['student', 'student@powerplant.edu', hashedPassword, 'Demo Student']);
    console.log('✓ Created student user (student / Student@123)');
  } else {
    console.log('✓ Student user exists');
  }

  // Import questions from CSV if questions table is empty
  const qResult = db.exec('SELECT COUNT(*) as cnt FROM questions');
  const questionCount = (qResult && qResult[0] && qResult[0].values && qResult[0].values[0]) ? qResult[0].values[0][0] : 0;
  
  if (questionCount === 0) {
    let csvFilename = 'questions.csv';
    if (!fs.existsSync(path.join(__dirname, csvFilename))) {
      if (fs.existsSync(path.join(__dirname, 'question_bank.csv'))) {
        csvFilename = 'question_bank.csv';
      }
    }
    
    const csvPath = path.join(__dirname, csvFilename);
    if (fs.existsSync(csvPath)) {
      console.log(`Importing questions from: ${csvFilename}`);
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      try {
        const records = parse(csvContent, {
          columns: true, skip_empty_lines: true, relax_column_count: true, trim: true
        });
        let imported = 0, skipped = 0;
        const insertStmt = db.prepare(`INSERT OR IGNORE INTO questions (
          id, type, module, topic, difficulty, difficulty_value,
          question_text, option_a, option_b, option_c, option_d,
          correct_answer, curriculum_map_id, course_code, subtopic,
          discrimination, guessing, active, exposure_count, attempt_count,
          correct_count, average_time_seconds, explanation, learning_outcome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        for (const row of records) {
          try {
            const id = parseInt(row.ID);
            if (!id) { skipped++; continue; }
            // Check if already exists via the OR IGNORE
            insertStmt.run([
              id, row.Type || '', row.Module || '', row.Topic || '',
              row.Difficulty || '', parseInt(row.DifficultyValue) || 0,
              row.QuestionText || '', row.OptionA || '', row.OptionB || '',
              row.OptionC || '', row.OptionD || '', row.CorrectAnswer || '',
              row.CurriculumMapID || '', row.CourseCode || '', row.Subtopic || '',
              parseFloat(row.Discrimination) || 0, parseFloat(row.Guessing) || 0,
              row.Active === 'TRUE' ? 1 : 0, parseInt(row.ExposureCount) || 0,
              parseInt(row.AttemptCount) || 0, parseInt(row.CorrectCount) || 0,
              parseFloat(row.AverageTimeSeconds) || 0,
              row.Explanation || '', row.LearningOutcome || ''
            ]);
            imported++;
          } catch (e) { skipped++; }
        }
        insertStmt.free();
        console.log(`✓ Imported ${imported} questions (${skipped} skipped)`);
      } catch (csvErr) {
        console.error('CSV parse error:', csvErr.message);
      }
    } else {
      console.log('No CSV file found. Create questions.csv to import questions.');
    }
  } else {
    console.log(`✓ Questions table has ${questionCount} questions.`);
  }

  // Save database to disk
  saveDb();
  console.log('✓ Database saved to disk');
}

module.exports = { getDb, saveDb, closeDb, queryAll, queryOne, execute, run, exec };
