// State
const state = {
  lang: 'he',
  subjects: [],
  selectedSubjects: new Set(),
  questionCount: 20,
  questions: [],
  currentIndex: 0,
  score: 0,
  startTime: null,
  timerInterval: null,
  answered: false,
};

const i18n = {
  he: {
    leaderboard: 'טבלת מובילים', submit_question: 'הגש שאלה',
    choose_subjects: 'בחרו נושאים לתרגול', choose_desc: 'סמנו נושא אחד או יותר והתחילו לשחק',
    how_many: 'כמה שאלות?', all: 'הכל', start_game: 'התחילו!',
    score: 'ניקוד', next: 'הבא ←', game_over: 'סיום משחק!',
    save_score: 'שמור תוצאה', play_again: 'שחקו שוב', back_home: 'חזרה לתפריט',
    name: 'שם', time: 'זמן', subject: 'נושא', question_type: 'סוג שאלה',
    correct_answer: 'תשובה נכונה', your_name: 'השם שלך', submit: 'שלח',
    questions_word: 'שאלות', true_word: 'נכון', false_word: 'לא נכון',
    multiple_choice: 'בחירה מרובה', true_false: 'נכון/לא נכון',
  },
  en: {
    leaderboard: 'Leaderboard', submit_question: 'Submit Question',
    choose_subjects: 'Choose Subjects to Practice', choose_desc: 'Select one or more subjects and start playing',
    how_many: 'How many questions?', all: 'All', start_game: 'Start!',
    score: 'Score', next: 'Next →', game_over: 'Game Over!',
    save_score: 'Save Score', play_again: 'Play Again', back_home: 'Back to Menu',
    name: 'Name', time: 'Time', subject: 'Subject', question_type: 'Question Type',
    correct_answer: 'Correct Answer', your_name: 'Your Name', submit: 'Submit',
    questions_word: 'questions', true_word: 'True', false_word: 'False',
    multiple_choice: 'Multiple Choice', true_false: 'True/False',
  }
};

// Helpers
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function t(key) { return i18n[state.lang][key] || key; }

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
}

function updateI18n() {
  document.documentElement.dir = state.lang === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// API
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

// Load subjects
async function loadSubjects() {
  state.subjects = await api('/subjects');
  renderSubjects();
}

function renderSubjects() {
  const grid = $('#subjectGrid');
  grid.innerHTML = '';
  for (const s of state.subjects) {
    if (s.question_count === 0) continue;
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.dataset.id = s.id;
    const nameDisplay = state.lang === 'he' ? s.name_he : s.name_en;
    const nameSecondary = state.lang === 'he' ? s.name_en : s.name_he;
    card.innerHTML = `
      <div class="check">✓</div>
      <div class="icon">${s.icon}</div>
      <div class="name">${nameDisplay}</div>
      <div class="name-en">${nameSecondary}</div>
      <div class="count">${s.question_count} ${t('questions_word')}</div>
    `;
    card.onclick = () => toggleSubject(s.id, card);
    grid.appendChild(card);
  }
}

function toggleSubject(id, card) {
  if (state.selectedSubjects.has(id)) {
    state.selectedSubjects.delete(id);
    card.classList.remove('selected');
  } else {
    state.selectedSubjects.add(id);
    card.classList.add('selected');
  }
  $('#roundConfig').style.display = state.selectedSubjects.size > 0 ? 'block' : 'none';
}

// Quiz
async function startQuiz() {
  const subjectIds = Array.from(state.selectedSubjects);
  const count = state.questionCount;
  state.questions = await api('/questions', {
    method: 'POST',
    body: { subject_ids: subjectIds, count: count || 0 },
  });

  if (state.questions.length === 0) {
    toast(state.lang === 'he' ? 'אין שאלות זמינות' : 'No questions available');
    return;
  }

  state.currentIndex = 0;
  state.score = 0;
  state.answered = false;
  state.startTime = Date.now();

  // Start timer
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    $('#quizTimer').textContent = formatTime(elapsed);
  }, 1000);

  $('#totalQuestions').textContent = state.questions.length;
  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  state.answered = false;

  // Find subject name
  const subj = state.subjects.find(s => s.id === q.subject_id);
  const subjName = subj ? (state.lang === 'he' ? `${subj.icon} ${subj.name_he}` : `${subj.icon} ${subj.name_en}`) : '';
  $('#questionSubject').textContent = subjName;

  const typeLabel = q.type === 'true_false' ? t('true_false') : t('multiple_choice');
  $('#questionTypeBadge').textContent = typeLabel;

  const questionText = state.lang === 'he' ? q.question_he : q.question_en;
  $('#questionText').textContent = questionText;

  // Progress
  $('#questionNum').textContent = state.currentIndex + 1;
  $('#progressFill').style.width = `${((state.currentIndex) / state.questions.length) * 100}%`;
  $('#currentScore').textContent = state.score;

  // Options
  const container = $('#optionsContainer');
  container.innerHTML = '';

  if (q.type === 'true_false') {
    const labels = state.lang === 'he' ? ['נכון', 'לא נכון'] : ['True', 'False'];
    labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-label">${label}</span>`;
      btn.onclick = () => handleAnswer(btn, i === 0 ? 'true' : 'false', q);
      container.appendChild(btn);
    });
  } else {
    const options = state.lang === 'he' ? q.options_he : q.options_en;
    const optionLabels = ['א', 'ב', 'ג', 'ד'];
    if (state.lang === 'en') optionLabels.splice(0, 4, 'A', 'B', 'C', 'D');
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-label">${optionLabels[i]}.</span> ${opt}`;
      btn.onclick = () => handleAnswer(btn, String(i), q);
      container.appendChild(btn);
    });
  }

  // Hide explanation and next
  $('#explanation').style.display = 'none';
  $('#nextBtn').style.display = 'none';
}

function handleAnswer(btn, answer, q) {
  if (state.answered) return;
  state.answered = true;

  const correct = String(q.correct);
  const isCorrect = answer === correct;

  if (isCorrect) {
    state.score++;
    btn.classList.add('correct');
  } else {
    btn.classList.add('wrong');
    // Highlight the correct answer
    const allBtns = $$('.option-btn');
    if (q.type === 'true_false') {
      const correctIdx = correct === 'true' ? 0 : 1;
      allBtns[correctIdx]?.classList.add('correct');
    } else {
      allBtns[parseInt(correct)]?.classList.add('correct');
    }
  }

  // Disable all buttons
  $$('.option-btn').forEach(b => b.classList.add('disabled'));

  // Show explanation
  const explanation = state.lang === 'he' ? q.explanation_he : q.explanation_en;
  if (explanation) {
    $('#explanationIcon').textContent = isCorrect ? '✅' : '❌';
    $('#explanationText').textContent = explanation;
    $('#explanation').style.display = 'block';
  }

  $('#currentScore').textContent = state.score;
  $('#nextBtn').style.display = 'block';
}

function nextQuestion() {
  state.currentIndex++;
  if (state.currentIndex >= state.questions.length) {
    endQuiz();
  } else {
    renderQuestion();
    // Scroll to top of question
    $('#screen-quiz').scrollIntoView({ behavior: 'smooth' });
  }
}

function endQuiz() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const total = state.questions.length;
  const pct = Math.round((state.score / total) * 100);

  let emoji = '😅';
  if (pct >= 90) emoji = '🏆';
  else if (pct >= 75) emoji = '🌟';
  else if (pct >= 60) emoji = '👍';
  else if (pct >= 40) emoji = '📚';

  $('#resultsEmoji').textContent = emoji;
  $('#finalScore').textContent = state.score;
  $('#finalTotal').textContent = total;
  $('#resultsPercentage').textContent = `${pct}%`;
  $('#resultsPercentage').style.color = pct >= 60 ? 'var(--success)' : 'var(--danger)';
  $('#resultsTime').textContent = `⏱️ ${formatTime(elapsed)}`;

  state.elapsedTime = elapsed;
  showScreen('results');
}

async function saveScore() {
  const name = $('#playerName').value.trim();
  if (!name) {
    toast(state.lang === 'he' ? 'הכניסו שם' : 'Enter your name');
    return;
  }

  await api('/leaderboard', {
    method: 'POST',
    body: {
      player_name: name,
      score: state.score,
      total_questions: state.questions.length,
      subjects: Array.from(state.selectedSubjects),
      time_seconds: state.elapsedTime,
    },
  });

  $('#saveScore').innerHTML = `<p style="color:var(--success);font-weight:600">${state.lang === 'he' ? '✅ נשמר!' : '✅ Saved!'}</p>`;
  toast(state.lang === 'he' ? 'התוצאה נשמרה!' : 'Score saved!');
}

// Leaderboard
async function showLeaderboard() {
  const entries = await api('/leaderboard?limit=30');
  const tbody = $('#leaderboardBody');
  tbody.innerHTML = '';

  entries.forEach((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${medal}</td>
      <td>${e.player_name}</td>
      <td>${e.score}/${e.total_questions}</td>
      <td>${e.percentage}%</td>
      <td>${formatTime(e.time_seconds || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  showScreen('leaderboard');
}

// Submit Question Form
function initSubmitForm() {
  const typeSelect = $('#submitType');
  typeSelect.onchange = () => {
    const isMC = typeSelect.value === 'multiple_choice';
    $('#mcOptions').style.display = isMC ? 'block' : 'none';
    $('#tfCorrect').style.display = isMC ? 'none' : 'block';
  };

  // Build option inputs
  ['He', 'En'].forEach(lang => {
    const container = $(`#options${lang}Inputs`);
    container.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const row = document.createElement('div');
      row.className = 'option-input-row';
      row.innerHTML = `
        <input type="radio" name="correct${lang}" value="${i}" ${i === 0 ? 'checked' : ''}>
        <input type="text" placeholder="${lang === 'He' ? `תשובה ${i + 1}` : `Option ${i + 1}`}" data-opt="${lang.toLowerCase()}-${i}">
      `;
      container.appendChild(row);
    }
  });
}

function showSubmitForm() {
  // Populate subjects
  const select = $('#submitSubject');
  select.innerHTML = '';
  for (const s of state.subjects) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = state.lang === 'he' ? s.name_he : s.name_en;
    select.appendChild(opt);
  }
  initSubmitForm();
  showScreen('submit');
}

async function handleSubmitQuestion(e) {
  e.preventDefault();
  const type = $('#submitType').value;
  const data = {
    subject_id: $('#submitSubject').value,
    type,
    question_he: $('#submitQuestionHe').value,
    question_en: $('#submitQuestionEn').value,
    explanation_he: $('#submitExplHe').value,
    explanation_en: $('#submitExplEn').value,
    submitted_by: $('#submitAuthor').value || 'Anonymous',
  };

  if (type === 'multiple_choice') {
    data.options_he = [];
    data.options_en = [];
    for (let i = 0; i < 4; i++) {
      const he = $(`[data-opt="he-${i}"]`).value;
      const en = $(`[data-opt="en-${i}"]`).value;
      if (!he || !en) {
        toast(state.lang === 'he' ? 'מלאו את כל התשובות' : 'Fill all options');
        return;
      }
      data.options_he.push(he);
      data.options_en.push(en);
    }
    data.correct = parseInt($('input[name="correctHe"]:checked').value);
  } else {
    data.correct = $('#submitTfCorrect').value;
  }

  const result = await api('/submit-question', { method: 'POST', body: data });
  toast(state.lang === 'he' ? '✅ השאלה נשלחה לאישור!' : '✅ Question submitted for review!');
  showScreen('home');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSubjects();

  $('#langToggle').onclick = () => {
    state.lang = state.lang === 'he' ? 'en' : 'he';
    updateI18n();
    renderSubjects();
    // Re-select previously selected
    state.selectedSubjects.forEach(id => {
      const card = $(`.subject-card[data-id="${id}"]`);
      if (card) card.classList.add('selected');
    });
  };

  // Round count buttons
  $$('.round-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.round-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.questionCount = parseInt(btn.dataset.count);
    };
  });

  $('#startBtn').onclick = startQuiz;
  $('#nextBtn').onclick = nextQuestion;
  $('#saveScoreBtn').onclick = saveScore;
  $('#playAgainBtn').onclick = startQuiz;
  $('#backHomeBtn').onclick = () => showScreen('home');
  $('#leaderboardBtn').onclick = showLeaderboard;
  $('#lbBackBtn').onclick = () => showScreen('home');
  $('#submitQuestionBtn').onclick = showSubmitForm;
  $('#submitBackBtn').onclick = () => showScreen('home');
  $('#submitForm').onsubmit = handleSubmitQuestion;
});
