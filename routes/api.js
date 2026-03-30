const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db');

// Get all subjects with question counts
router.get('/subjects', (req, res) => {
  const subjects = all(`
    SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id AND q.status = 'approved') as question_count
    FROM subjects s
    ORDER BY s.sort_order
  `);
  res.json(subjects);
});

// Get questions for selected subjects
router.post('/questions', (req, res) => {
  const { subject_ids, count } = req.body;
  if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
    return res.status(400).json({ error: 'subject_ids required' });
  }

  const placeholders = subject_ids.map(() => '?').join(',');
  let query = `
    SELECT id, subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en
    FROM questions
    WHERE subject_id IN (${placeholders}) AND status = 'approved'
    ORDER BY RANDOM()
  `;

  const params = [...subject_ids];
  if (count && count > 0) {
    query += ` LIMIT ?`;
    params.push(count);
  }

  const questions = all(query, params);
  const parsed = questions.map(q => ({
    ...q,
    options_he: q.options_he ? JSON.parse(q.options_he) : null,
    options_en: q.options_en ? JSON.parse(q.options_en) : null,
  }));

  res.json(parsed);
});

// Submit a score
router.post('/leaderboard', (req, res) => {
  const { player_name, score, total_questions, subjects, time_seconds } = req.body;
  if (!player_name || score == null || !total_questions) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const percentage = Math.round((score / total_questions) * 100);
  const result = run(
    `INSERT INTO leaderboard (player_name, score, total_questions, percentage, subjects, time_seconds)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [player_name, score, total_questions, percentage, JSON.stringify(subjects || []), time_seconds || 0]
  );

  res.json({ id: result.lastInsertRowid, percentage });
});

// Get leaderboard
router.get('/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const entries = all(
    `SELECT id, player_name, score, total_questions, percentage, subjects, time_seconds, created_at
     FROM leaderboard ORDER BY percentage DESC, time_seconds ASC LIMIT ?`,
    [limit]
  );

  const parsed = entries.map(e => ({
    ...e,
    subjects: e.subjects ? JSON.parse(e.subjects) : [],
  }));

  res.json(parsed);
});

// Submit a question (from users)
router.post('/submit-question', (req, res) => {
  const { subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, submitted_by } = req.body;

  if (!subject_id || !type || !question_he || !question_en || correct == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = run(
    `INSERT INTO questions (subject_id, type, question_he, question_en, options_he, options_en, correct, explanation_he, explanation_en, status, submitted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      subject_id, type, question_he, question_en,
      options_he ? JSON.stringify(options_he) : null,
      options_en ? JSON.stringify(options_en) : null,
      String(correct),
      explanation_he || '', explanation_en || '',
      submitted_by || 'Anonymous'
    ]
  );

  res.json({ id: result.lastInsertRowid, message: 'Question submitted for review!' });
});

module.exports = router;
