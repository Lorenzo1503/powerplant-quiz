const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');

// All student routes require authentication
router.use(ensureAuthenticated);

// Student Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const db = await getDb();
    
    // Get student stats
    const quizStats = db.exec(`
      SELECT COUNT(*) as total_quizzes, 
             AVG(score) as avg_score,
             SUM(correct_count) as total_correct,
             SUM(total_questions) as total_questions
      FROM quiz_attempts WHERE user_id = ?
    `, { bind: [req.user.id] });

    const recentQuizzes = db.exec(`
      SELECT id, score, total_questions, correct_count, time_taken_seconds, completed_at
      FROM quiz_attempts WHERE user_id = ?
      ORDER BY completed_at DESC LIMIT 10
    `, { bind: [req.user.id] });

    // Get available modules for quiz
    const modules = db.exec(`
      SELECT DISTINCT module FROM questions 
      WHERE module IS NOT NULL AND module != '' AND active = 1
      ORDER BY module
    `);

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      user: req.user,
      stats: {
        totalQuizzes: quizStats[0]?.values[0]?.[0] || 0,
        avgScore: Math.round(quizStats[0]?.values[0]?.[1] || 0),
        totalCorrect: quizStats[0]?.values[0]?.[2] || 0,
        totalQuestions: quizStats[0]?.values[0]?.[3] || 0
      },
      recentQuizzes: recentQuizzes[0]?.values?.map(v => ({
        id: v[0], score: v[1], total_questions: v[2],
        correct_count: v[3], time_taken_seconds: v[4], completed_at: v[5]
      })) || [],
      modules: modules[0]?.values?.map(v => v[0]) || []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/');
  }
});

// Profile page
router.get('/profile', async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec('SELECT id, username, email, role, full_name, student_id, created_at FROM users WHERE id = ?', 
      { bind: [req.user.id] });
    
    const userData = result[0]?.values[0];
    res.render('student/profile', {
      title: 'My Profile',
      profile: userData ? {
        id: userData[0], username: userData[1], email: userData[2],
        role: userData[3], full_name: userData[4], student_id: userData[5], created_at: userData[6]
      } : {}
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading profile');
    res.redirect('/student/dashboard');
  }
});

// Update profile
router.post('/profile/update', async (req, res) => {
  try {
    const db = await getDb();
    const { full_name, student_id } = req.body;
    
    db.run('UPDATE users SET full_name = ?, student_id = ? WHERE id = ?',
      [full_name, student_id, req.user.id]);
    
    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/student/profile');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/student/profile');
  }
});

// Change password
router.post('/profile/change-password', async (req, res) => {
  try {
    const db = await getDb();
    const { current_password, new_password, confirm_password } = req.body;

    // Verify current password
    const result = db.exec('SELECT password FROM users WHERE id = ?', { bind: [req.user.id] });
    const storedPassword = result[0]?.values[0]?.[0];
    
    const isMatch = await bcrypt.compare(current_password, storedPassword);
    if (!isMatch) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/student/profile');
    }

    if (new_password !== confirm_password) {
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/student/profile');
    }

    if (new_password.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/student/profile');
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    
    req.flash('success_msg', 'Password changed successfully');
    res.redirect('/student/profile');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error changing password');
    res.redirect('/student/profile');
  }
});

module.exports = router;

