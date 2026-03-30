const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'trivia.db');

let db = null;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save every 30 seconds
let saveTimer = null;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name_he TEXT NOT NULL,
      name_en TEXT NOT NULL,
      icon TEXT DEFAULT '📚',
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      percentage REAL NOT NULL,
      subjects TEXT NOT NULL,
      time_seconds INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  try { db.run('CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_percentage ON leaderboard(percentage DESC)'); } catch(e) {}

  // Create default admin if none exists
  const result = db.exec('SELECT COUNT(*) as count FROM admin_users');
  const count = result[0]?.values[0]?.[0] || 0;
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('Default admin created: admin / admin123');
  }

  saveDb();

  // Auto-save
  saveTimer = setInterval(saveDb, 30000);

  return db;
}

// Helper: run query and get all rows as objects
function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch(e) {
    console.error('SQL error:', e.message, sql);
    return [];
  }
}

// Helper: get single row
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Helper: run and return changes info
function run(sql, params = []) {
  db.run(sql, params);
  const info = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
  const lastId = info[0]?.values[0]?.[0] || 0;
  const changes = info[0]?.values[0]?.[1] || 0;
  saveDb();
  return { lastInsertRowid: lastId, changes };
}

module.exports = { initDb, all, get, run, saveDb, getDb: () => db };
