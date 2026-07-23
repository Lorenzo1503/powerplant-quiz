const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, queryAll, queryOne, execute } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');

// All student routes require authentication
router.use(ensureAuthenticated);

// Student Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    await getDb();
    
    // Get student stats
    const quizStats = queryOne(
      `SELECT COUNT(*) as total_quizzes, 
             AVG(score) as avg_score,
             SUM(correct_count) as total_correct,
             SUM(total_questions) as total_questions
      FROM quiz_attempts WHERE user_id = ?`,
      [req.user.id]
    );

    const recentQuizzes = queryAll(
      `SELECT id, score, total_questions, correct_count, time_taken_seconds, completed_at
      FROM quiz_attempts WHERE user_id = ?
      ORDER BY completed_at DESC LIMIT 10`,
      [req.user.id]
    );

    // Get available modules for quiz
    const modules = queryAll(
      "SELECT DISTINCT module as name FROM questions WHERE module IS NOT NULL AND module != '' AND active = 1 ORDER BY module"
    );

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      user: req.user,
      stats: {
        totalQuizzes: quizStats?.total_quizzes || 0,
        avgScore: Math.round(quizStats?.avg_score || 0),
        totalCorrect: quizStats?.total_correct || 0,
        totalQuestions: quizStats?.total_questions || 0
      },
      recentQuizzes,
      modules: modules.map(m => m.name)
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
    await getDb();
    const profile = queryOne(
      'SELECT id, username, email, role, full_name, student_id, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    
    res.render('student/profile', {
      title: 'My Profile',
      profile: profile || {}
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
    await getDb();
    const { full_name, student_id } = req.body;
    
    execute('UPDATE users SET full_name = ?, student_id = ? WHERE id = ?',
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
    await getDb();
    const { current_password, new_password, confirm_password } = req.body;

    // Verify current password
    const user = queryOne('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/student/profile');
    }
    
    const isMatch = await bcrypt.compare(current_password, user.password);
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
    execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    
    req.flash('success_msg', 'Password changed successfully');
    res.redirect('/student/profile');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error changing password');
    res.redirect('/student/profile');
  }
});

module.exports = router;
