const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { getDb, queryOne } = require('../db');

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const db = await getDb();
    const user = queryOne(
      'SELECT id, username, email, password, role, full_name, is_active FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, username]
    );

    if (!user) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return done(null, false, { message: 'Account is deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    return done(null, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name
    });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const db = await getDb();
    const user = queryOne(
      'SELECT id, username, email, role, full_name FROM users WHERE id = ? LIMIT 1',
      [id]
    );

    if (!user) {
      return done(null, false);
    }

    done(null, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name
    });
  } catch (err) {
    done(err);
  }
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/login');
}

// Middleware to check if user is admin
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Access denied. Admin privileges required.');
  res.redirect('/login');
}

module.exports = { ensureAuthenticated, ensureAdmin };
