const { initDb, run, get, pool } = require('./db');
const fs = require('fs');
const path = require('path');

async function seed() {
  await initDb();

  const QUESTIONS_FILE = process.argv[2] || path.join(__dirname, 'seed_questions.json');

  if (!fs.existsSync(QUESTIONS_FILE)) {
    console.error(`Questions file not found: ${QUESTIONS_FILE}`);
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));

  const subjectIcons = {
    water_electrolytes: '💧', oxygen: '🫁', acid_base: '⚗️', aed: '⚡',
    legal: '⚖️', lung_volumes: '📏', cpr_intro: '❤️', electrophysiology: '💓',
    medical_terminology: '📖', respiratory_anatomy: '🫁', chemistry: '🧪',
    body_structure: '🧬', blood_vessels: '🩸', urinary_system: '🔬',
    cell_respiration: '🔋', nervous_system: '🧠', cardiovascular: '❤️‍🔥',
  };

  // Extract unique subjects
  const subjects = new Map();
  for (const q of questions) {
    if (!subjects.has(q.subject_id)) {
      subjects.set(q.subject_id, {
        id: q.subject_id,
        name_he: q.subject_name_he,
        name_en: q.subject_name_en,
        icon: subjectIcons[q.subject_id] || '📚',
      });
    }
  }

  // Insert subjects
  let sortOrder = 0;
  for (const [id, s] of subjects) {
    await run(
      `INSERT INTO subjects (id, name_he, name_en, icon, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name_he = $2, name_en = $3, icon = $4, sort_order = $5`,
      [s.id, s.name_he, s.name_en, s.icon, sortOrder++]
    );
  }
  console.log(`Inserted ${subjects.size} subjects`);

  // Clear existing questions
  await run('DELETE FROM questions');

  // Insert questions
  for (const q of questions) {
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

  console.log(`Inserted ${questions.length} questions`);
  console.log('Seed complete!');
  await pool.end();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
