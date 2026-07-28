require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
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
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
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

// Landing page
app.get('/landing', (req, res) => {
  if (req.user) {
    if (req.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('landing', { title: 'PowerPlant Quiz - Engineering Exam Prep' });
});

// Health check endpoint for Render (must be before 404 handler)
app.get('/health', async (req, res) => {
  try {
    const { queryOne } = require('./db');
    await getDb();
    const userCount = queryOne('SELECT COUNT(*) as count FROM users');
    const qCount = queryOne('SELECT COUNT(*) as count FROM questions');
    res.json({
      status: 'ok',
      users: userCount?.count || 0,
      questions: qCount?.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
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

// Quick-start with background CSV import
async function start() {
  try {
    console.log('Initializing database (lightweight mode)...');
    const db = await getDb();
    const { queryOne, startBackgroundImport } = require('./db');
    const userCount = queryOne('SELECT COUNT(*) as count FROM users');
    console.log(`Database ready: ${userCount?.count || 0} users`);
    app.locals.getDb = getDb;

    // Start importing questions in the background - non-blocking
    startBackgroundImport();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`PowerPlant Quiz server running on http://0.0.0.0:${PORT}`);
    });
    server.timeout = 30000;
  } catch (err) {
    console.error('Failed to start server:', err.message);
    // Retry once
    setTimeout(async () => {
      try {
        await getDb();
        require('./db').startBackgroundImport();
        app.listen(PORT, '0.0.0.0', () => {
          console.log(`PowerPlant Quiz server running on http://0.0.0.0:${PORT} (retry)`);
        });
      } catch (e) {
        console.error('Fatal startup failure:', e.message);
        process.exit(1);
      }
    }, 3000);
  }
}

start();
