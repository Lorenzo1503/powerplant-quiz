require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');
require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'powerplant-quiz-secret',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Flash messages
app.use(flash());

// Global variables
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/student', require('./routes/student'));
app.use('/quiz', require('./routes/quiz'));

// Home route
app.get('/', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.redirect('/login');
});

// Landing page for non-authenticated users
app.get('/landing', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('landing', { title: 'PowerPlant Quiz - Engineering Exam Prep' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Initialize DB and start server
async function start() {
  try {
    // Auto-initialize database on first run
    const dbPath = path.join(__dirname, 'database.sqlite');
    if (!fs.existsSync(dbPath)) {
      console.log('Database not found. Running initialization...');
      try {
        await require('./init_db')();
        console.log('Database initialized successfully.');
      } catch (initErr) {
        console.error('Database initialization failed:', initErr.message);
        // Continue anyway - tables might already exist
      }
    }

    // Store getDb function for route access
    app.locals.getDb = getDb;

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`PowerPlant Quiz server running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
