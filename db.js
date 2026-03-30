const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name_he TEXT NOT NULL,
        name_en TEXT NOT NULL,
        icon TEXT DEFAULT '📚',
        sort_order INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        type TEXT NOT NULL,
        question_he TEXT NOT NULL,
        question_en TEXT NOT NULL,
        options_he TEXT,
        options_en TEXT,
        correct TEXT NOT NULL,
        explanation_he TEXT,
        explanation_en TEXT,
        status TEXT DEFAULT 'approved',
        submitted_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        percentage REAL NOT NULL,
        subjects TEXT NOT NULL,
        time_seconds INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes (ignore if exist)
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id)').catch(() => {});
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)').catch(() => {});
    await client.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_percentage ON leaderboard(percentage DESC)').catch(() => {});

    // Create default admin if none exists
    const adminCheck = await client.query('SELECT COUNT(*) as count FROM admin_users');
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await client.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
      console.log('Default admin created: admin / admin123');
    }

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// Helper: run query and get all rows
async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Helper: get single row
async function get(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

// Helper: run insert/update/delete
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

module.exports = { initDb, all, get, run, pool };
