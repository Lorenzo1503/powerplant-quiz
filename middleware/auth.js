const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const { getDb, queryOne, execute, saveDb } = require('../db');

// ===== LOCAL STRATEGY =====
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const db = await getDb();
    const user = queryOne(
      'SELECT id, username, email, password, role, full_name, is_active FROM users WHERE (username = ? OR email = ?) LIMIT 1',
      [username, username]
    );

    if (!user) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return done(null, false, { message: 'Account is deactivated. Contact an administrator.' });
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

// ===== GOOGLE OAUTH STRATEGY =====
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const db = await getDb();
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      const googleId = profile.id;

      // Try to find existing user by Google ID or email
      let user = null;
      if (email) {
        user = queryOne('SELECT id, username, email, password, role, full_name, is_active FROM users WHERE email = ? LIMIT 1', [email]);
      }
      if (!user && googleId) {
        user = queryOne('SELECT id, username, email, password, role, full_name, is_active FROM users WHERE google_id = ? LIMIT 1', [googleId]);
      }

      if (user) {
        // Update Google ID if not set
        if (!user.google_id) {
          execute('UPDATE users SET google_id = ?, full_name = COALESCE(NULLIF(?, ""), full_name) WHERE id = ?', [googleId, profile.displayName, user.id]);
          saveDb();
        }
        // Check if active
        if (!user.is_active) {
          return done(null, false, { message: 'Account is deactivated. Contact an administrator.' });
        }
        return done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          full_name: user.full_name
        });
      } else {
        // Create new user from Google profile
        const username = email ? email.split('@')[0] : `google_${googleId}`;
        const fullName = profile.displayName || username;
        const hashedPassword = await bcrypt.hash(googleId + process.env.SESSION_SECRET, 10);
        
        execute(
          'INSERT INTO users (username, email, password, role, full_name, google_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [username, email || '', hashedPassword, 'student', fullName, googleId]
        );
        saveDb();

        const newUser = queryOne('SELECT id, username, email, role, full_name FROM users WHERE google_id = ? LIMIT 1', [googleId]);
        return done(null, {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          full_name: newUser.full_name
        });
      }
    } catch (err) {
      return done(err);
    }
  }));
}

// ===== SERIALIZATION =====
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

// ===== MIDDLEWARE =====
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Access denied. Admin privileges required.');
  res.redirect('/login');
}

function ensureStudent(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'student') {
    return next();
  }
  req.flash('error_msg', 'Access denied. Student access required.');
  res.redirect('/login');
}

module.exports = { ensureAuthenticated, ensureAdmin, ensureStudent };

