const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'tahfidz-ibnu-qoyyim-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads/audio'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Initialize database
initializeDatabase();

// Routes
app.get('/', (req, res) => {
  if (req.session.user) {
    const role = req.session.user.role;
    if (role === 'admin') {
      return res.redirect('/pages/admin-dashboard.html');
    } else if (role === 'guru') {
      return res.redirect('/pages/guru-dashboard.html');
    } else if (role === 'siswa') {
      return res.redirect('/pages/siswa-dashboard.html');
    }
  }
  res.sendFile(path.join(__dirname, 'public/pages/login.html'));
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/guru', require('./routes/guru'));
app.use('/api/siswa', require('./routes/siswa'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('📚 Tahfidz Ibnu Qoyyim Application Started');
});

module.exports = app;
