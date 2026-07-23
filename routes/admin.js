const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, queryAll, queryOne, execute, saveDb } = require('../db');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

router.use(ensureAuthenticated, ensureAdmin);

router.get('/dashboard', async (req, res) => {
  try {
    await getDb();
    const totalStudents = queryOne('SELECT COUNT(*) as count FROM users WHERE role = ?', ['student']);
    const totalQuestions = queryOne('SELECT COUNT(*) as count FROM questions');
    const totalQuizzes = queryOne('SELECT COUNT(*) as count FROM quiz_attempts');
    const recentUsers = queryAll('SELECT id, username, email, role, full_name, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 10');
    const recentQuizzes = queryAll('SELECT qa.id, u.username, qa.score, qa.total_questions, qa.correct_count, qa.completed_at FROM quiz_attempts qa JOIN users u ON qa.user_id = u.id ORDER BY qa.completed_at DESC LIMIT 10');
    const moduleStats = queryAll("SELECT module, COUNT(*) as count FROM questions WHERE module IS NOT NULL AND module != '' GROUP BY module ORDER BY count DESC");

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        totalStudents: totalStudents?.count || 0,
        totalQuestions: totalQuestions?.count || 0,
        totalQuizzes: totalQuizzes?.count || 0
      },
      recentUsers,
      recentQuizzes,
      moduleStats
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/');
  }
});

router.get('/users', async (req, res) => {
  try {
    await getDb();
    const users = queryAll('SELECT id, username, email, role, full_name, student_id, is_active, created_at FROM users ORDER BY created_at DESC');
    res.render('admin/users', { title: 'User Management', users });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading users');
    res.redirect('/admin/dashboard');
  }
});

router.post('/users/create', async (req, res) => {
  try {
    const { username, email, password, role, full_name, student_id } = req.body;
    await getDb();
    const hashedPassword = await bcrypt.hash(password, 10);
    execute('INSERT INTO users (username, email, password, role, full_name, student_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', 
      [username, email, hashedPassword, role || 'student', full_name || '', student_id || '']);
    req.flash('success_msg', 'User created successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating user');
    res.redirect('/admin/users');
  }
});

router.post('/users/toggle/:id', async (req, res) => {
  try {
    await getDb();
    const userId = req.params.id;
    const user = queryOne('SELECT is_active FROM users WHERE id = ?', [userId]);
    if (!user) { req.flash('error_msg', 'User not found'); return res.redirect('/admin/users'); }
    execute('UPDATE users SET is_active = ? WHERE id = ?', [user.is_active ? 0 : 1, userId]);
    req.flash('success_msg', 'User status updated');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating user');
    res.redirect('/admin/users');
  }
});

router.post('/users/delete/:id', async (req, res) => {
  try {
    await getDb();
    const userId = req.params.id;
    execute('DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?)', [userId]);
    execute('DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
    execute('DELETE FROM users WHERE id = ?', [userId]);
    req.flash('success_msg', 'User deleted successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting user');
    res.redirect('/admin/users');
  }
});

router.get('/questions', async (req, res) => {
  try {
    await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const countResult = queryOne('SELECT COUNT(*) as count FROM questions');
    const totalQuestions = countResult?.count || 0;
    const totalPages = Math.ceil(totalQuestions / limit);
    const questions = queryAll(
      'SELECT id, type, module, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, ai_review_status, confidence_level, human_review_required FROM questions ORDER BY id ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    res.render('admin/questions', { title: 'Question Bank', questions, currentPage: page, totalPages, totalQuestions });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading questions');
    res.redirect('/admin/dashboard');
  }
});

router.post('/questions/edit/:id', async (req, res) => {
  try {
    await getDb();
    const { question_text, option_a, option_b, option_c, option_d, correct_answer, module, topic } = req.body;
    execute('UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, module = ?, topic = ? WHERE id = ?',
      [question_text, option_a, option_b, option_c, option_d, correct_answer, module, topic, req.params.id]);
    req.flash('success_msg', 'Question updated successfully');
    res.redirect('/admin/questions');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating question');
    res.redirect('/admin/questions');
  }
});

router.get('/reports', async (req, res) => {
  try {
    await getDb();
    const quizStats = queryAll(
      `SELECT u.username, u.email, u.role, COUNT(qa.id) as quiz_count, AVG(qa.score) as avg_score, SUM(qa.correct_count) as total_correct, SUM(qa.total_questions) as total_questions 
       FROM users u LEFT JOIN quiz_attempts qa ON u.id = qa.user_id GROUP BY u.id ORDER BY quiz_count DESC`
    );
    const dailyStats = queryAll(
      `SELECT DATE(completed_at) as date, COUNT(*) as count, AVG(score) as avg_score FROM quiz_attempts GROUP BY DATE(completed_at) ORDER BY date DESC LIMIT 30`
    );
    res.render('admin/reports', { title: 'Quiz Reports', quizStats, dailyStats });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading reports');
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;
