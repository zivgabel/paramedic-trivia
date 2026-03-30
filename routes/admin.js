const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { generateToken, authMiddleware } = require('../auth');

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = get('SELECT * FROM admin_users WHERE username = ?', [username]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
  res.json({ token, username: user.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = get('SELECT * FROM admin_users WHERE id = ?', [req.user.id]);

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ ok: true });
});

// Get all questions (with filters)
router.get('/questions', authMiddleware, (req, res) => {
  const { status, subject_id, page = 1, limit = 50 } = req.query;
  let where = [];
  let params = [];

  if (status) { where.push('q.status = ?'); params.push(status); }
  if (subject_id) { where.push('q.subject_id = ?'); params.push(subject_id); }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = get(`SELECT COUNT(*) as count FROM questions q ${whereClause}`, params);

  const questions = all(`
    SELECT q.*, s.name_he as subject_name_he, s.name_en as subject_name_en
    FROM questions q
    LEFT JOIN subjects s ON s.id = q.subject_id
    ${whereClause}
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parseInt(limit), offset]);

  const parsed = questions.map(q => ({
    ...q,
    options_he: q.options_he ? JSON.parse(q.options_he) : null,
    options_en: q.options_en ? JSON.parse(q.options_en) : null,
  }));

  res.json({ questions: parsed, total: total?.count || 0, page: parseInt(page), limit: parseInt(limit) });
});

// Create a question
router.post('/questions', authMiddleware, (req, res) => {
  const { subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en } = req.body;

  const result = run(
    `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
    [
      subject_id, type, question_he, question_en,
      options_he ? JSON.stringify(options_he) : null,
      options_en ? JSON.stringify(options_en) : null,
      String(correct),
      explanation_he || '', explanation_en || ''
    ]
  );

  res.json({ id: result.lastInsertRowid });
});

// Update a question
router.put('/questions/:id', authMiddleware, (req, res) => {
  const { subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status } = req.body;

  // Get current question
  const current = get('SELECT * FROM questions WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Not found' });

  run(`
    UPDATE questions SET
      subject_id = ?, type = ?, question_he = ?, question_en = ?,
      options_he = ?, options_en = ?, correct = ?,
      explanation_he = ?, explanation_en = ?, status = ?
    WHERE id = ?
  `, [
    subject_id || current.subject_id,
    type || current.type,
    question_he || current.question_he,
    question_en || current.question_en,
    options_he ? JSON.stringify(options_he) : current.options_he,
    options_en ? JSON.stringify(options_en) : current.options_en,
    correct != null ? String(correct) : current.correct,
    explanation_he ?? current.explanation_he,
    explanation_en ?? current.explanation_en,
    status || current.status,
    req.params.id
  ]);

  res.json({ ok: true });
});

// Delete a question
router.delete('/questions/:id', authMiddleware, (req, res) => {
  run('DELETE FROM questions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/questions/:id/approve', authMiddleware, (req, res) => {
  run('UPDATE questions SET status = ? WHERE id = ?', ['approved', req.params.id]);
  res.json({ ok: true });
});

router.post('/questions/:id/reject', authMiddleware, (req, res) => {
  run('UPDATE questions SET status = ? WHERE id = ?', ['rejected', req.params.id]);
  res.json({ ok: true });
});

// Bulk import
router.post('/import', authMiddleware, (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'questions must be an array' });
  }

  for (const q of questions) {
    // Ensure subject exists
    run('INSERT OR IGNORE INTO subjects (id, name_he, name_en) VALUES (?, ?, ?)',
      [q.subject_id, q.subject_name_he || q.subject_id, q.subject_name_en || q.subject_id]);

    run(
      `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [
        q.subject_id, q.type, q.question_he, q.question_en,
        q.options_he ? JSON.stringify(q.options_he) : null,
        q.options_en ? JSON.stringify(q.options_en) : null,
        String(q.correct),
        q.explanation_he || '', q.explanation_en || ''
      ]
    );
  }

  res.json({ imported: questions.length });
});

// Manage subjects
router.post('/subjects', authMiddleware, (req, res) => {
  const { id, name_he, name_en, icon } = req.body;
  run('INSERT OR REPLACE INTO subjects (id, name_he, name_en, icon) VALUES (?, ?, ?, ?)', [id, name_he, name_en, icon || '📚']);
  res.json({ ok: true });
});

router.delete('/subjects/:id', authMiddleware, (req, res) => {
  run('DELETE FROM questions WHERE subject_id = ?', [req.params.id]);
  run('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Dashboard stats
router.get('/stats', authMiddleware, (req, res) => {
  const totalQuestions = get('SELECT COUNT(*) as count FROM questions WHERE status = ?', ['approved']);
  const pendingQuestions = get('SELECT COUNT(*) as count FROM questions WHERE status = ?', ['pending']);
  const totalSubjects = get('SELECT COUNT(*) as count FROM subjects');
  const totalPlayers = get('SELECT COUNT(DISTINCT player_name) as count FROM leaderboard');
  const totalGames = get('SELECT COUNT(*) as count FROM leaderboard');

  res.json({
    totalQuestions: totalQuestions?.count || 0,
    pendingQuestions: pendingQuestions?.count || 0,
    totalSubjects: totalSubjects?.count || 0,
    totalPlayers: totalPlayers?.count || 0,
    totalGames: totalGames?.count || 0,
  });
});

router.delete('/leaderboard', authMiddleware, (req, res) => {
  run('DELETE FROM leaderboard');
  res.json({ ok: true });
});

module.exports = router;
