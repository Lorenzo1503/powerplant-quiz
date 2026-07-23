const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDb } = require('../db');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

router.use(ensureAuthenticated, ensureAdmin);

router.get('/dashboard', async (req, res) => {
  try {
    const db = await getDb();
    const totalStudents = db.exec('SELECT COUNT(*) as count FROM users WHERE role = ?', { bind: ['student'] });
    const totalQuestions = db.exec('SELECT COUNT(*) as count FROM questions');
    const totalQuizzes = db.exec('SELECT COUNT(*) as count FROM quiz_attempts');

    const recentUsers = db.exec('SELECT id, username, email, role, full_name, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 10');
    const recentQuizzes = db.exec('SELECT qa.id, u.username, qa.score, qa.total_questions, qa.correct_count, qa.completed_at FROM quiz_attempts qa JOIN users u ON qa.user_id = u.id ORDER BY qa.completed_at DESC LIMIT 10');
    const moduleStats = db.exec('SELECT module, COUNT(*) as count FROM questions WHERE module IS NOT NULL AND module != "" GROUP BY module ORDER BY count DESC');

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        totalStudents: totalStudents[0]?.values[0]?.[0] || 0,
        totalQuestions: totalQuestions[0]?.values[0]?.[0] || 0,
        totalQuizzes: totalQuizzes[0]?.values[0]?.[0] || 0
      },
      recentUsers: recentUsers[0]?.values?.map(v => ({ id: v[0], username: v[1], email: v[2], role: v[3], full_name: v[4], is_active: v[5], created_at: v[6] })) || [],
      recentQuizzes: recentQuizzes[0]?.values?.map(v => ({ id: v[0], username: v[1], score: v[2], total_questions: v[3], correct_count: v[4], completed_at: v[5] })) || [],
      moduleStats: moduleStats[0]?.values?.map(v => ({ module: v[0], count: v[1] })) || []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/');
  }
});

router.get('/users', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec('SELECT id, username, email, role, full_name, student_id, is_active, created_at FROM users ORDER BY created_at DESC');
    const users = result[0]?.values?.map(v => ({ id: v[0], username: v[1], email: v[2], role: v[3], full_name: v[4], student_id: v[5], is_active: v[6], created_at: v[7] })) || [];
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
    const db = await getDb();
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, email, password, role, full_name, student_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [username, email, hashedPassword, role || 'student', full_name || '', student_id || '']);
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
    const db = await getDb();
    const userId = req.params.id;
    const user = db.exec('SELECT is_active FROM users WHERE id = ?', { bind: [userId] });
    if (!user.length || !user[0].values.length) { req.flash('error_msg', 'User not found'); return res.redirect('/admin/users'); }
    const currentStatus = user[0].values[0][0];
    db.run('UPDATE users SET is_active = ? WHERE id = ?', [currentStatus ? 0 : 1, userId]);
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
    const db = await getDb();
    const userId = req.params.id;
    db.run('DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?)', [userId]);
    db.run('DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
    db.run('DELETE FROM users WHERE id = ?', [userId]);
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
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const countResult = db.exec('SELECT COUNT(*) as count FROM questions');
    const totalQuestions = countResult[0]?.values[0]?.[0] || 0;
    const totalPages = Math.ceil(totalQuestions / limit);
    const result = db.exec('SELECT id, type, module, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, ai_review_status, confidence_level, human_review_required FROM questions ORDER BY id ASC LIMIT ? OFFSET ?', { bind: [limit, offset] });
    const questions = result[0]?.values?.map(v => ({ id: v[0], type: v[1], module: v[2], topic: v[3], difficulty: v[4], question_text: v[5], option_a: v[6], option_b: v[7], option_c: v[8], option_d: v[9], correct_answer: v[10], ai_review_status: v[11], confidence_level: v[12], human_review_required: v[13] })) || [];
    res.render('admin/questions', { title: 'Question Bank', questions, currentPage: page, totalPages, totalQuestions });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading questions');
    res.redirect('/admin/dashboard');
  }
});

router.post('/questions/edit/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { question_text, option_a, option_b, option_c, option_d, correct_answer, module, topic } = req.body;
    db.run('UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, module = ?, topic = ? WHERE id = ?', [question_text, option_a, option_b, option_c, option_d, correct_answer, module, topic, req.params.id]);
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
    const db = await getDb();
    const quizStats = db.exec('SELECT u.username, u.email, u.role, COUNT(qa.id) as quiz_count, AVG(qa.score) as avg_score, SUM(qa.correct_count) as total_correct, SUM(qa.total_questions) as total_questions FROM users u LEFT JOIN quiz_attempts qa ON u.id = qa.user_id GROUP BY u.id ORDER BY quiz_count DESC');
    const dailyStats = db.exec("SELECT DATE(completed_at) as date, COUNT(*) as count, AVG(score) as avg_score FROM quiz_attempts GROUP BY DATE(completed_at) ORDER BY date DESC LIMIT 30");
    res.render('admin/reports', { title: 'Quiz Reports', quizStats: quizStats[0]?.values?.map(v => ({ username: v[0], email: v[1], role: v[2], quiz_count: v[3], avg_score: v[4], total_correct: v[5], total_questions: v[6] })) || [], dailyStats: dailyStats[0]?.values?.map(v => ({ date: v[0], count: v[1], avg_score: v[2] })) || [] });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading reports');
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;

