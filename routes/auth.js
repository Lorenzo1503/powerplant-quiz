const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { getDb, queryOne, execute, saveDb } = require('../db');

// ===== LOGIN =====
router.get('/login', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.render('auth/login', { title: 'Login', hasGoogle });
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// ===== GOOGLE OAUTH =====
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureFlash: true 
  }),
  (req, res) => {
    req.flash('success_msg', 'Successfully signed in with Google!');
    res.redirect('/');
  }
);

// ===== REGISTER =====
router.get('/register', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('auth/register', { title: 'Create Account' });
});

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
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, and underscores');
    }

    if (errors.length) {
      req.flash('error_msg', errors.join('. '));
      return res.redirect('/register');
    }

    await getDb();
    const existingUser = queryOne('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [username, email]);
    if (existingUser) {
      req.flash('error_msg', 'Username or email already exists');
      return res.redirect('/register');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    execute(
      'INSERT INTO users (username, email, password, role, full_name, student_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [username, email, hashedPassword, 'student', full_name || username, student_id || '']
    );
    saveDb();

    req.flash('success_msg', 'Account created successfully! Please log in.');
    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error_msg', 'An error occurred during registration. Please try again.');
    res.redirect('/register');
  }
});

// ===== LOGOUT =====
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    req.flash('success_msg', 'You have been logged out successfully');
    res.redirect('/login');
  });
});

// ===== FORGOT PASSWORD =====
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    await getDb();
    const user = queryOne('SELECT id, username FROM users WHERE email = ? LIMIT 1', [email]);
    
    if (user) {
      console.log(`Password reset requested for user: ${user.username} (${email})`);
      // In production, send actual email here
    }

    req.flash('success_msg', 'If an account with that email exists, password reset instructions have been sent.');
    res.redirect('/login');
  } catch (err) {
    console.error('Forgot password error:', err);
    req.flash('error_msg', 'An error occurred. Please try again.');
    res.redirect('/forgot-password');
  }
});

module.exports = router;

