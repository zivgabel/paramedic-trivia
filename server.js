const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { initDb, get, run } = require('./db');

async function autoSeed() {
  // Check if DB already has questions
  const count = await get('SELECT COUNT(*) as count FROM questions');
  if (parseInt(count?.count || 0) > 0) {
    console.log(`Database already has ${count.count} questions, skipping seed`);
    return;
  }

  const seedFile = path.join(__dirname, 'seed_questions.json');
  if (!fs.existsSync(seedFile)) {
    console.log('No seed_questions.json found, skipping seed');
    return;
  }

  console.log('Empty database detected — seeding...');
  const questions = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));

  const subjectIcons = {
    water_electrolytes: '💧', oxygen: '🫁', acid_base: '⚗️', aed: '⚡',
    legal: '⚖️', lung_volumes: '📏', cpr_intro: '❤️', electrophysiology: '💓',
    medical_terminology: '📖', respiratory_anatomy: '🫁', chemistry: '🧪',
    body_structure: '🧬', blood_vessels: '🩸', urinary_system: '🔬',
    cell_respiration: '🔋', nervous_system: '🧠', cardiovascular: '❤️‍🔥',
  };

  const subjects = new Map();
  for (const q of questions) {
    if (!subjects.has(q.subject_id)) {
      subjects.set(q.subject_id, {
        id: q.subject_id, name_he: q.subject_name_he,
        name_en: q.subject_name_en, icon: subjectIcons[q.subject_id] || '📚',
      });
    }
  }

  let sortOrder = 0;
  for (const [, s] of subjects) {
    await run(
      `INSERT INTO subjects (id, name_he, name_en, icon, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name_he = $2, name_en = $3, icon = $4, sort_order = $5`,
      [s.id, s.name_he, s.name_en, s.icon, sortOrder++]
    );
  }

  for (const q of questions) {
    await run(
      `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')`,
      [
        q.subject_id, q.type, q.question_he, q.question_en,
        q.options_he ? JSON.stringify(q.options_he) : null,
        q.options_en ? JSON.stringify(q.options_en) : null,
        String(q.correct), q.explanation_he || '', q.explanation_en || ''
      ]
    );
  }

  console.log(`Seeded ${subjects.size} subjects and ${questions.length} questions`);
}

async function start() {
  await initDb();
  await autoSeed();

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
