const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');

// All quiz routes require authentication
router.use(ensureAuthenticated);

// Start a new quiz
router.get('/start', async (req, res) => {
  try {
    const db = await getDb();
    
    // Get modules for selection
    const modules = db.exec(`
      SELECT DISTINCT module FROM questions 
      WHERE module IS NOT NULL AND module != '' AND active = 1
      ORDER BY module
    `);

    const topics = db.exec(`
      SELECT DISTINCT topic FROM questions 
      WHERE topic IS NOT NULL AND topic != '' AND active = 1
      ORDER BY topic
    `);

    res.render('quiz/start', {
      title: 'Start Quiz',
      modules: modules[0]?.values?.map(v => v[0]) || [],
      topics: topics[0]?.values?.map(v => v[0]) || []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading quiz setup');
    res.redirect('/student/dashboard');
  }
});

// Generate quiz
router.post('/generate', async (req, res) => {
  try {
    const db = await getDb();
    const { module, topic, difficulty, question_count } = req.body;
    const count = parseInt(question_count) || 10;
    
    let query = 'SELECT * FROM questions WHERE active = 1';
    let bindParams = [];

    if (module && module !== 'all') {
      query += ' AND module = ?';
      bindParams.push(module);
    }
    if (topic && topic !== 'all') {
      query += ' AND topic = ?';
      bindParams.push(topic);
    }
    if (difficulty && difficulty !== 'all') {
      query += ' AND difficulty = ?';
      bindParams.push(difficulty);
    }

    query += ' ORDER BY RANDOM() LIMIT ?';
    bindParams.push(count);

    const result = db.exec(query, { bind: bindParams });
    
    if (!result.length || !result[0].values.length) {
      req.flash('error_msg', 'No questions found matching your criteria');
      return res.redirect('/quiz/start');
    }

    const columns = ['id','type','module','topic','difficulty','difficulty_value','question_text',
      'option_a','option_b','option_c','option_d','correct_answer','curriculum_map_id',
      'course_code','subtopic','discrimination','guessing','active','exposure_count',
      'attempt_count','correct_count','average_time_seconds','explanation','learning_outcome',
      'ai_review_status','fields_changed','correction_summary','references','confidence_level',
      'human_review_required','human_review_reason','ai_reviewed_date','batch_number'];

    const questions = result[0].values.map(row => {
      const q = {};
      columns.forEach((col, i) => { q[col] = row[i]; });
      return q;
    });

    // Store quiz session
    req.session.quiz = {
      questions,
      currentIndex: 0,
      answers: [],
      startTime: Date.now(),
      totalQuestions: questions.length
    };

    res.redirect('/quiz/take');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error generating quiz');
    res.redirect('/quiz/start');
  }
});

// Take quiz
router.get('/take', async (req, res) => {
  if (!req.session.quiz || !req.session.quiz.questions.length) {
    req.flash('error_msg', 'No active quiz session');
    return res.redirect('/quiz/start');
  }

  const quiz = req.session.quiz;
  const question = quiz.questions[quiz.currentIndex];
  
  res.render('quiz/take', {
    title: `Question ${quiz.currentIndex + 1} of ${quiz.totalQuestions}`,
    question,
    currentIndex: quiz.currentIndex,
    totalQuestions: quiz.totalQuestions,
    progress: ((quiz.currentIndex + 1) / quiz.totalQuestions) * 100
  });
});

// Submit answer
router.post('/answer', async (req, res) => {
  if (!req.session.quiz) {
    return res.status(400).json({ error: 'No active quiz' });
  }

  const quiz = req.session.quiz;
  const { answer } = req.body;
  const currentQuestion = quiz.questions[quiz.currentIndex];
  
  const isCorrect = answer === currentQuestion.correct_answer;
  
  quiz.answers.push({
    questionId: currentQuestion.id,
    selectedAnswer: answer,
    correctAnswer: currentQuestion.correct_answer,
    isCorrect,
    questionText: currentQuestion.question_text,
    explanation: currentQuestion.explanation
  });

  // Move to next question or finish
  if (quiz.currentIndex + 1 >= quiz.totalQuestions) {
    return res.json({ finished: true });
  }

  quiz.currentIndex++;
  return res.json({ finished: false, nextIndex: quiz.currentIndex });
});

// Quiz results
router.get('/results', async (req, res) => {
  if (!req.session.quiz) {
    req.flash('error_msg', 'No quiz results available');
    return res.redirect('/student/dashboard');
  }

  const quiz = req.session.quiz;
  const correctCount = quiz.answers.filter(a => a.isCorrect).length;
  const totalQuestions = quiz.totalQuestions;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const timeTaken = Math.floor((Date.now() - quiz.startTime) / 1000);

  // Save to database
  try {
    const db = await getDb();
    db.run(
      `INSERT INTO quiz_attempts (user_id, score, total_questions, correct_count, time_taken_seconds) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, score, totalQuestions, correctCount, timeTaken]
    );
    saveDb();
  } catch (err) {
    console.error('Error saving quiz result:', err);
  }

  const results = {
    score,
    correctCount,
    totalQuestions,
    timeTaken,
    answers: quiz.answers,
    passFail: score >= 60 ? 'PASSED' : 'FAILED'
  };

  // Clear quiz session
  delete req.session.quiz;

  res.render('quiz/results', { title: 'Quiz Results', results });
});

// View quiz history
router.get('/history', async (req, res) => {
  try {
    const db = await getDb();
    const quizzes = db.exec(`
      SELECT id, score, total_questions, correct_count, time_taken_seconds, completed_at
      FROM quiz_attempts WHERE user_id = ?
      ORDER BY completed_at DESC LIMIT 50
    `, { bind: [req.user.id] });

    res.render('quiz/history', {
      title: 'Quiz History',
      quizzes: quizzes[0]?.values?.map(v => ({
        id: v[0], score: v[1], total_questions: v[2],
        correct_count: v[3], time_taken_seconds: v[4], completed_at: v[5]
      })) || []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading quiz history');
    res.redirect('/student/dashboard');
  }
});

module.exports = router;

