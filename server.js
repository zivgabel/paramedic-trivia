const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db');

async function start() {
  await initDb();

  const apiRoutes = require('./routes/api');
  const adminRoutes = require('./routes/admin');

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', apiRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('*', (req, res) => {
    if (req.path.startsWith('/admin')) {
      return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Paramedic Trivia running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
