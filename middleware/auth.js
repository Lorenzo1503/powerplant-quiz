const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const db = await getDb();
    const result = db.exec(
      'SELECT id, username, email, password, role, full_name, is_active FROM users WHERE username = ? OR email = ? LIMIT 1',
      { bind: [username, username] }
    );

    if (!result.length || !result[0].values.length) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    const userData = result[0].values[0];
    const user = {
      id: userData[0],
      username: userData[1],
      email: userData[2],
      password: userData[3],
      role: userData[4],
      full_name: userData[5],
      is_active: userData[6]
    };

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
    const result = db.exec(
      'SELECT id, username, email, role, full_name FROM users WHERE id = ? LIMIT 1',
      { bind: [id] }
    );

    if (!result.length || !result[0].values.length) {
      return done(null, false);
    }

    const userData = result[0].values[0];
    done(null, {
      id: userData[0],
      username: userData[1],
      email: userData[2],
      role: userData[3],
      full_name: userData[4]
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

