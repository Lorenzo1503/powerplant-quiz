const { getDb, run, execute, queryOne, saveDb, closeDb } = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

async function initializeDatabase() {
  const db = await getDb();

  console.log('Creating tables...');
  
  // Create tables
  run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      full_name TEXT,
      student_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY,
      type TEXT,
      module TEXT,
      topic TEXT,
      difficulty TEXT,
      difficulty_value INTEGER,
      question_text TEXT,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer TEXT,
      curriculum_map_id TEXT,
      course_code TEXT,
      subtopic TEXT,
      discrimination REAL,
      guessing REAL,
      active INTEGER DEFAULT 1,
      exposure_count INTEGER DEFAULT 0,
      attempt_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      average_time_seconds REAL DEFAULT 0,
      explanation TEXT,
      learning_outcome TEXT,
      ai_review_status TEXT,
      fields_changed TEXT,
      correction_summary TEXT,
      refs TEXT,
      confidence_level TEXT,
      human_review_required TEXT DEFAULT 'No',
      human_review_reason TEXT,
      ai_reviewed_date TEXT,
      batch_number INTEGER
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      score REAL,
      total_questions INTEGER,
      correct_count INTEGER,
      time_taken_seconds INTEGER,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_answer TEXT,
      is_correct INTEGER,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // Create admin user if not exists
  const existingAdmin = queryOne("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync('Admin@123', 10);
    execute(
      'INSERT INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin', 'admin@powerplant.edu', hashedPassword, 'admin', 'System Administrator', 1]
    );
    console.log('Admin user created: admin / Admin@123');
  }
  
  // Create a test student if not exists
  const existingStudent = queryOne("SELECT id FROM users WHERE username = 'student' LIMIT 1");
  if (!existingStudent) {
    const hashedPassword = bcrypt.hashSync('Student@123', 10);
    execute(
      "INSERT INTO users (username, email, password, role, full_name, is_active) VALUES (?, ?, ?, 'student', ?, 1)",
      ['student', 'student@powerplant.edu', hashedPassword, 'Demo Student']
    );
    console.log('Student user created: student / Student@123');
  }

  // Import questions from CSV
  let csvFilename = 'question_bank.csv';
  if (!fs.existsSync(path.join(__dirname, csvFilename))) {
    csvFilename = 'questions.csv';
    if (!fs.existsSync(path.join(__dirname, csvFilename))) {
      // Try to find any CSV in the directory
      const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.csv'));
      if (files.length > 0) csvFilename = files[0];
    }
  }
  
  const csvPath = path.join(__dirname, csvFilename);
  if (fs.existsSync(csvPath)) {
    console.log(`Importing questions from: ${csvFilename}`);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });

    let importedCount = 0;
    let skippedCount = 0;

    for (const row of records) {
      try {
        const id = parseInt(row.ID);
        if (!id) { skippedCount++; continue; }
        
        // Check if question already exists
        const existing = queryOne('SELECT id FROM questions WHERE id = ?', [id]);
        if (existing) { skippedCount++; continue; }
        
        execute(
          `INSERT OR IGNORE INTO questions (
            id, type, module, topic, difficulty, difficulty_value,
            question_text, option_a, option_b, option_c, option_d,
            correct_answer, curriculum_map_id, course_code, subtopic,
            discrimination, guessing, active, exposure_count, attempt_count,
            correct_count, average_time_seconds, explanation, learning_outcome
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            row.Type || '',
            row.Module || '',
            row.Topic || '',
            row.Difficulty || '',
            parseInt(row.DifficultyValue) || 0,
            row.QuestionText || '',
            row.OptionA || '',
            row.OptionB || '',
            row.OptionC || '',
            row.OptionD || '',
            row.CorrectAnswer || '',
            row.CurriculumMapID || '',
            row.CourseCode || '',
            row.Subtopic || '',
            parseFloat(row.Discrimination) || 0,
            parseFloat(row.Guessing) || 0,
            row.Active === 'TRUE' ? 1 : 0,
            parseInt(row.ExposureCount) || 0,
            parseInt(row.AttemptCount) || 0,
            parseInt(row.CorrectCount) || 0,
            parseFloat(row.AverageTimeSeconds) || 0,
            row.Explanation || '',
            row.LearningOutcome || ''
          ]
        );
        importedCount++;
      } catch (e) {
        skippedCount++;
      }
    }
    console.log(`Imported ${importedCount} questions from CSV (${skippedCount} skipped)`);
  } else {
    console.log('No CSV file found. Run with questions.csv in the project directory.');
  }

  saveDb();
  await closeDb();
  console.log('Database initialized successfully!');
}

module.exports = initializeDatabase;

// Run directly if this file is executed standalone
if (require.main === module) {
  initializeDatabase().catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
}
