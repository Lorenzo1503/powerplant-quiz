const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { getDb, queryOne, execute } = require('../db');

// Login page
router.get('/login', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('auth/login', { title: 'Login' });
});

// Login handler
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// Register page
router.get('/register', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('auth/register', { title: 'Create Account' });
});

// Register handler
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirm_password, full_name, student_id } = req.body;
    const errors = [];
    if (!username || !email || !password || !confirm_password) {
      errors.push('Please fill in all required fields');
    }
    if (password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }
    if (password !== confirm_password) {
      errors.push('Passwords do not match');
    }
    if (!email.includes('@')) {
      errors.push('Please enter a valid email address');
    }
    if (errors.length) {
      req.flash('error_msg', errors.join('. '));
      return res.redirect('/register');
    }
    const existingUser = queryOne('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [username, email]);
    if (existingUser) {
      req.flash('error_msg', 'Username or email already exists');
      return res.redirect('/register');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    execute(
      'INSERT INTO users (username, email, password, role, full_name, student_id) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, 'student', full_name || username, student_id || '']
    );
    req.flash('success_msg', 'Account created successfully! Please log in.');
    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error_msg', 'An error occurred during registration');
    res.redirect('/register');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error(err);
    req.flash('success_msg', 'You have been logged out');
    res.redirect('/login');
  });
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!user) {
      req.flash('success_msg', 'If an account with that email exists, password reset instructions have been sent.');
      return res.redirect('/login');
    }
    req.flash('success_msg', 'Password reset link sent to your email. (Demo mode)');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'An error occurred');
    res.redirect('/forgot-password');
  }
});

module.exports = router;