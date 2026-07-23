const express = require('express');
const router = express.Router();
const { getDb, queryAll, queryOne, execute, saveDb } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');

// All quiz routes require authentication
router.use(ensureAuthenticated);

// Start a new quiz
router.get('/start', async (req, res) => {
  try {
    await getDb();
    
    // Get modules for selection
    const modules = queryAll(
      "SELECT DISTINCT module as name FROM questions WHERE module IS NOT NULL AND module != '' AND active = 1 ORDER BY module"
    );
    const topics = queryAll(
      "SELECT DISTINCT topic as name FROM questions WHERE topic IS NOT NULL AND topic != '' AND active = 1 ORDER BY topic"
    );

    res.render('quiz/start', {
      title: 'Start Quiz',
      modules: modules.map(m => m.name),
      topics: topics.map(t => t.name)
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
    await getDb();
    const { module, topic, difficulty, question_count } = req.body;
    const count = parseInt(question_count) || 10;
    
    let query = 'SELECT * FROM questions WHERE active = 1';
    const bindParams = [];

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

    const questions = queryAll(query, bindParams);
    
    if (!questions.length) {
      req.flash('error_msg', 'No questions found matching your criteria');
      return res.redirect('/quiz/start');
    }

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

// Submit answer (AJAX)
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
    await getDb();
    execute(
      'INSERT INTO quiz_attempts (user_id, score, total_questions, correct_count, time_taken_seconds) VALUES (?, ?, ?, ?, ?)',
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
    await getDb();
    const quizzes = queryAll(
      'SELECT id, score, total_questions, correct_count, time_taken_seconds, completed_at FROM quiz_attempts WHERE user_id = ? ORDER BY completed_at DESC LIMIT 50',
      [req.user.id]
    );

    res.render('quiz/history', {
      title: 'Quiz History',
      quizzes
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading quiz history');
    res.redirect('/student/dashboard');
  }
});

module.exports = router;
