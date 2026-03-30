const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { generateToken, authMiddleware } = require('../auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await get('SELECT * FROM admin_users WHERE username = $1', [username]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await get('SELECT * FROM admin_users WHERE id = $1', [req.user.id]);

    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Current password incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    await run('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all questions (with filters)
router.get('/questions', authMiddleware, async (req, res) => {
  try {
    const { status, subject_id, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];
    let paramIndex = 1;

    if (status) { where.push(`q.status = $${paramIndex++}`); params.push(status); }
    if (subject_id) { where.push(`q.subject_id = $${paramIndex++}`); params.push(subject_id); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = await get(`SELECT COUNT(*) as count FROM questions q ${whereClause}`, params);

    const questions = await all(`
      SELECT q.*, s.name_he as subject_name_he, s.name_en as subject_name_en
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      ${whereClause}
      ORDER BY q.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, parseInt(limit), offset]);

    const parsed = questions.map(q => ({
      ...q,
      options_he: q.options_he ? JSON.parse(q.options_he) : null,
      options_en: q.options_en ? JSON.parse(q.options_en) : null,
    }));

    res.json({ questions: parsed, total: parseInt(total?.count || 0), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a question
router.post('/questions', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en } = req.body;

    const result = await get(
      `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved') RETURNING id`,
      [
        subject_id, type, question_he, question_en,
        options_he ? JSON.stringify(options_he) : null,
        options_en ? JSON.stringify(options_en) : null,
        String(correct),
        explanation_he || '', explanation_en || ''
      ]
    );

    res.json({ id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a question
router.put('/questions/:id', authMiddleware, async (req, res) => {
  try {
    const { subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status } = req.body;

    const current = await get('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Not found' });

    await run(`
      UPDATE questions SET
        subject_id = $1, type = $2, question_he = $3, question_en = $4,
        options_he = $5, options_en = $6, correct = $7,
        explanation_he = $8, explanation_en = $9, status = $10
      WHERE id = $11
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a question
router.delete('/questions/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM questions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/questions/:id/approve', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE questions SET status = $1 WHERE id = $2', ['approved', req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/questions/:id/reject', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE questions SET status = $1 WHERE id = $2', ['rejected', req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import
router.post('/import', authMiddleware, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'questions must be an array' });
    }

    for (const q of questions) {
      // Ensure subject exists
      await run(
        `INSERT INTO subjects (id, name_he, name_en) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [q.subject_id, q.subject_name_he || q.subject_id, q.subject_name_en || q.subject_id]
      );

      await run(
        `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')`,
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manage subjects
router.post('/subjects', authMiddleware, async (req, res) => {
  try {
    const { id, name_he, name_en, icon } = req.body;
    await run(
      `INSERT INTO subjects (id, name_he, name_en, icon) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name_he = $2, name_en = $3, icon = $4`,
      [id, name_he, name_en, icon || '📚']
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/subjects/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM questions WHERE subject_id = $1', [req.params.id]);
    await run('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const totalQuestions = await get('SELECT COUNT(*) as count FROM questions WHERE status = $1', ['approved']);
    const pendingQuestions = await get('SELECT COUNT(*) as count FROM questions WHERE status = $1', ['pending']);
    const totalSubjects = await get('SELECT COUNT(*) as count FROM subjects');
    const totalPlayers = await get('SELECT COUNT(DISTINCT player_name) as count FROM leaderboard');
    const totalGames = await get('SELECT COUNT(*) as count FROM leaderboard');

    res.json({
      totalQuestions: parseInt(totalQuestions?.count || 0),
      pendingQuestions: parseInt(pendingQuestions?.count || 0),
      totalSubjects: parseInt(totalSubjects?.count || 0),
      totalPlayers: parseInt(totalPlayers?.count || 0),
      totalGames: parseInt(totalGames?.count || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/leaderboard', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM leaderboard');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
