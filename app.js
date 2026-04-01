/* ═══════════════════════════════════════════════
   VocabQuiz — app.js
   ═══════════════════════════════════════════════ */

// ── Storage helpers ──────────────────────────────
const STORE_KEY = 'vocabquiz_sets';

function loadSets() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}
function saveSets(sets) {
  localStorage.setItem(STORE_KEY, JSON.stringify(sets));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── App state ────────────────────────────────────
let sets = loadSets();
let currentSetId = null;
let currentMode = null;

// ── Navigation ───────────────────────────────────
function navigate(screen, setId) {
  if (setId !== undefined) currentSetId = setId;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screen).classList.add('active');

  if (screen === 'home')        renderHome();
  if (screen === 'editor')      renderEditor();
  if (screen === 'modes')       renderModes();
  if (screen === 'flashcards')  initFlashcards();
  if (screen === 'quiz')        {} // initiated by startMode
  if (screen === 'results')     {} // initiated by finishSession
}

// ── HOME ─────────────────────────────────────────
function renderHome() {
  sets = loadSets();
  const list  = document.getElementById('sets-list');
  const empty = document.getElementById('empty-state');

  list.innerHTML = '';
  if (!sets.length) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  sets.forEach(set => {
    const total    = set.cards.length;
    const mastered = Object.values(set.progress || {}).filter(p => p.confidence >= 4).length;
    const pct      = total ? Math.round((mastered / total) * 100) : 0;
    const circ     = 2 * Math.PI * 16; // r=16

    const card = document.createElement('div');
    card.className = 'set-card';
    card.innerHTML = `
      <div class="set-progress-ring" title="${pct}% mastered">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle class="ring-bg" cx="22" cy="22" r="16"/>
          <circle class="ring-fill" cx="22" cy="22" r="16"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ - (circ * pct / 100)}"/>
        </svg>
        <div class="ring-text">${pct}%</div>
      </div>
      <div class="set-card-info">
        <div class="set-card-name">${esc(set.name)}</div>
        <div class="set-card-meta">${total} terms · ${mastered} mastered</div>
      </div>
      <div class="set-card-actions">
        <button class="btn-icon" title="Edit" onclick="event.stopPropagation(); navigate('editor', '${set.id}')">✏️</button>
        <button class="btn-icon" title="Delete" onclick="event.stopPropagation(); deleteSet('${set.id}')">🗑️</button>
      </div>
    `;
    card.addEventListener('click', () => navigate('modes', set.id));
    list.appendChild(card);
  });
}

function deleteSet(id) {
  if (!confirm('Delete this set? This cannot be undone.')) return;
  sets = sets.filter(s => s.id !== id);
  saveSets(sets);
  renderHome();
}

// ── EDITOR ───────────────────────────────────────
function renderEditor() {
  const set = currentSetId ? sets.find(s => s.id === currentSetId) : null;
  document.getElementById('editor-title').textContent = set ? 'Edit Set' : 'New Set';
  document.getElementById('set-name').value     = set ? set.name      : '';
  document.getElementById('set-separator').value = set ? set.separator : '—';
  document.getElementById('vocab-input').value   = set ? set.cards.map(c => `${c.term} ${set.separator} ${c.definition}`).join('\n') : '';
  updatePreview();

  // Live preview
  document.getElementById('vocab-input').oninput    = updatePreview;
  document.getElementById('set-separator').oninput  = updatePreview;
}

function updatePreview() {
  const sep  = document.getElementById('set-separator').value.trim() || '—';
  const raw  = document.getElementById('vocab-input').value;
  const cards = parseCards(raw, sep);

  const label   = document.getElementById('preview-label');
  const preview = document.getElementById('preview-cards');
  preview.innerHTML = '';

  if (!cards.length) { label.style.display = 'none'; return; }
  label.style.display = 'block';

  cards.slice(0, 8).forEach(c => {
    const el = document.createElement('div');
    el.className = 'preview-card';
    el.innerHTML = `<span class="term">${esc(c.term)}</span><span class="def">${esc(c.definition)}</span>`;
    preview.appendChild(el);
  });
  if (cards.length > 8) {
    const more = document.createElement('div');
    more.className = 'preview-label';
    more.style.marginTop = '4px';
    more.textContent = `+ ${cards.length - 8} more`;
    preview.appendChild(more);
  }
}

function parseCards(raw, sep) {
  return raw.split('\n')
    .map(line => {
      const idx = line.indexOf(sep);
      if (idx === -1) return null;
      const term = line.slice(0, idx).trim();
      const def  = line.slice(idx + sep.length).trim();
      return (term && def) ? { term, definition: def } : null;
    })
    .filter(Boolean);
}

function saveSet() {
  const name  = document.getElementById('set-name').value.trim();
  const sep   = document.getElementById('set-separator').value.trim() || '—';
  const raw   = document.getElementById('vocab-input').value;
  const cards = parseCards(raw, sep);

  if (!name)         return alert('Please enter a set name.');
  if (cards.length < 2) return alert('Please add at least 2 vocab cards.');

  sets = loadSets();
  const existing = currentSetId ? sets.find(s => s.id === currentSetId) : null;

  if (existing) {
    // Preserve confidence for existing cards
    const oldProgress = existing.progress || {};
    const newCards = cards.map((c, i) => ({ ...c, id: existing.cards[i]?.id || genId() }));
    existing.name      = name;
    existing.separator = sep;
    existing.cards     = newCards;
    existing.progress  = Object.fromEntries(
      newCards.map(c => [c.id, oldProgress[c.id] || { confidence: 0 }])
    );
  } else {
    const newCards = cards.map(c => ({ ...c, id: genId() }));
    sets.push({
      id: genId(),
      name,
      separator: sep,
      cards: newCards,
      progress: Object.fromEntries(newCards.map(c => [c.id, { confidence: 0 }]))
    });
    currentSetId = sets[sets.length - 1].id;
  }

  saveSets(sets);
  navigate('modes', currentSetId);
}

// ── MODES ────────────────────────────────────────
function renderModes() {
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) { navigate('home'); return; }

  document.getElementById('mode-set-name').textContent = set.name;

  const total    = set.cards.length;
  const progress = set.progress || {};
  const mastered = Object.values(progress).filter(p => p.confidence >= 4).length;
  const pct      = total ? Math.round((mastered / total) * 100) : 0;

  document.getElementById('set-progress-summary').innerHTML = `
    <strong>${mastered} / ${total}</strong> terms mastered &nbsp;·&nbsp; ${pct}% complete
    ${mastered === total && total > 0 ? ' 🎉' : ''}
  `;
}

function editCurrentSet() { navigate('editor', currentSetId); }

function resetSetProgress() {
  if (!confirm('Reset all progress for this set?')) return;
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) return;
  set.progress = Object.fromEntries(set.cards.map(c => [c.id, { confidence: 0 }]));
  saveSets(sets);
  renderModes();
}

function startMode(mode) {
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) return;
  currentMode = mode;

  if (mode === 'flashcards') {
    navigate('flashcards');
  } else {
    initQuizSession(set, mode);
    navigate('quiz');
  }
}

// ═══════════════════════════════════════════════
// FLASHCARDS
// ═══════════════════════════════════════════════
let fc = { cards: [], index: 0, shuffled: false };

function initFlashcards() {
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) return;
  fc.cards = set.cards.map(c => ({ ...c }));
  fc.index = 0;
  renderFlashcard();
  renderDots();
}

function renderFlashcard() {
  const card = fc.cards[fc.index];
  document.getElementById('flashcard-front-text').textContent = card.term;
  document.getElementById('flashcard-back-text').textContent  = card.definition;
  document.getElementById('flashcard-front-label').textContent = 'Term';
  document.getElementById('flashcard-back-label').textContent  = 'Definition';
  document.getElementById('flashcard-counter').textContent     = `${fc.index + 1} / ${fc.cards.length}`;
  // Reset flip
  document.getElementById('flashcard').classList.remove('flipped');
  document.getElementById('self-grade').style.display = 'none';
  updateDots();
}

function flipCard() {
  const fc_el = document.getElementById('flashcard');
  fc_el.classList.toggle('flipped');
  const grade = document.getElementById('self-grade');
  grade.style.display = fc_el.classList.contains('flipped') ? 'flex' : 'none';
}

function gradeCard(knew) {
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) return;
  const card = fc.cards[fc.index];
  const prog = set.progress[card.id] || { confidence: 0 };
  if (knew) {
    prog.confidence = Math.min(4, prog.confidence + 1);
    fc.cards[fc.index]._known = true;
  } else {
    prog.confidence = Math.max(0, prog.confidence - 1);
    fc.cards[fc.index]._known = false;
  }
  set.progress[card.id] = prog;
  saveSets(sets);
  updateDots();
  nextCard();
}

function prevCard() {
  fc.index = (fc.index - 1 + fc.cards.length) % fc.cards.length;
  renderFlashcard();
}
function nextCard() {
  fc.index = (fc.index + 1) % fc.cards.length;
  renderFlashcard();
}

function shuffleFlashcards() {
  fc.cards = shuffleArr([...fc.cards]);
  fc.index = 0;
  renderFlashcard();
  renderDots();
}

function renderDots() {
  const wrap = document.getElementById('flashcard-dots');
  wrap.innerHTML = '';
  const max = Math.min(fc.cards.length, 50);
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'fc-dot' + (i === fc.index ? ' active' : '') + (fc.cards[i]._known === true ? ' known' : '');
    wrap.appendChild(d);
  }
}
function updateDots() {
  const dots = document.querySelectorAll('.fc-dot');
  dots.forEach((d, i) => {
    d.className = 'fc-dot' + (i === fc.index ? ' active' : '') + (fc.cards[i]?._known === true ? ' known' : '');
  });
}

// ═══════════════════════════════════════════════
// QUIZ SESSION (MC + Typing + Learn)
// ═══════════════════════════════════════════════
let session = {};

function initQuizSession(set, mode) {
  const cards = set.cards;
  const progress = set.progress || {};

  // For Learn: prioritise unmastered cards, weight by confidence
  let orderedCards;
  if (mode === 'learn') {
    orderedCards = shuffleArr([...cards]).sort((a, b) => {
      const ca = (progress[a.id] || {}).confidence || 0;
      const cb = (progress[b.id] || {}).confidence || 0;
      return ca - cb; // lowest confidence first
    });
  } else {
    orderedCards = shuffleArr([...cards]);
  }

  session = {
    mode,
    set,
    cards,         // master list
    queue: orderedCards.map(c => ({ ...c, _confidence: (progress[c.id] || {}).confidence || 0 })),
    retryImmediate: null,    // card to retry right after next card
    current: null,
    questionType: null,      // 'mc' | 'typing'
    direction: null,         // 'term->def' | 'def->term'
    correct: 0,
    wrong: 0,
    wrongCards: [],
    total: cards.length,
    masteredIds: new Set(cards.filter(c => (progress[c.id] || {}).confidence >= 4).map(c => c.id)),
    answered: false,
  };

  document.getElementById('quiz-mode-label').textContent = modeLabel(mode);
  document.getElementById('learn-status-bar').style.display = (mode === 'learn') ? 'flex' : 'none';

  nextQuestion();
}

function modeLabel(mode) {
  return { 'multiple-choice': 'MC', 'typing': 'Write', 'learn': 'Learn' }[mode] || mode;
}

function pickQuestionType(card) {
  if (session.mode === 'multiple-choice') return 'mc';
  if (session.mode === 'typing')          return 'typing';
  // Learn: low confidence → mc, higher → typing
  return card._confidence < 2 ? 'mc' : 'typing';
}

function pickDirection() {
  return Math.random() < 0.5 ? 'term->def' : 'def->term';
}

function nextQuestion() {
  session.answered = false;

  // Hide feedback
  document.getElementById('quiz-feedback').style.display = 'none';
  document.getElementById('mc-options').innerHTML = '';
  document.getElementById('typing-area').style.display = 'none';
  const ti = document.getElementById('typing-input');
  ti.value = '';
  ti.className = 'typing-input';

  // Pick next card
  let card;
  if (session.retryImmediate) {
    card = session.retryImmediate;
    session.retryImmediate = null;
  } else if (session.queue.length > 0) {
    card = session.queue.shift();
  } else {
    // All queued — check if done (Learn mode)
    if (session.mode === 'learn') {
      const unmastered = session.cards.filter(c => !session.masteredIds.has(c.id));
      if (unmastered.length === 0) {
        finishSession(true);
        return;
      }
      // Re-queue unmastered sorted by confidence
      session.queue = shuffleArr(unmastered.map(c => ({
        ...c,
        _confidence: (session.set.progress[c.id] || {}).confidence || 0
      })));
      card = session.queue.shift();
    } else {
      finishSession(false);
      return;
    }
  }

  session.current = card;
  session.direction = pickDirection();
  session.questionType = pickQuestionType(card);

  const prompt  = session.direction === 'term->def' ? card.term : card.definition;
  const dirText = session.direction === 'term->def' ? 'Definition' : 'Term';
  const dirHint = session.direction === 'term->def' ? 'What is the definition?' : 'What is the term?';

  document.getElementById('quiz-direction-label').textContent = dirHint;
  document.getElementById('quiz-prompt').textContent = prompt;

  if (session.questionType === 'mc') {
    renderMCOptions(card);
  } else {
    document.getElementById('typing-area').style.display = 'flex';
    document.getElementById('typing-input').focus();
  }

  updateQuizProgress();
}

// ── Multiple choice ──────────────────────────────
function renderMCOptions(card) {
  const correct = session.direction === 'term->def' ? card.definition : card.term;
  // Pick 3 distractors from other cards
  const others = session.cards.filter(c => c.id !== card.id);
  const distractors = shuffleArr(others)
    .slice(0, 3)
    .map(c => session.direction === 'term->def' ? c.definition : c.term);

  const choices = shuffleArr([correct, ...distractors]);
  const letters = ['A', 'B', 'C', 'D'];
  const wrap    = document.getElementById('mc-options');
  wrap.innerHTML = '';

  choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'mc-option';
    btn.innerHTML = `<span class="mc-letter">${letters[i]}</span><span>${esc(text)}</span>`;
    btn.addEventListener('click', () => {
      if (session.answered) return;
      selectMCOption(btn, text === correct, correct, choices);
    });
    wrap.appendChild(btn);
  });
}

function selectMCOption(selectedBtn, isCorrect, correct, allChoices) {
  session.answered = true;
  const options = document.querySelectorAll('.mc-option');

  options.forEach(opt => {
    opt.classList.add('disabled');
    const text = opt.querySelector('span:last-child').textContent;
    if (text === correct) opt.classList.add('correct');
    else if (opt === selectedBtn && !isCorrect) opt.classList.add('wrong');
  });

  recordAnswer(isCorrect, correct);
}

// ── Typing ───────────────────────────────────────
function handleTypingKey(e) {
  if (e.key === 'Enter') checkTypingAnswer();
}

function checkTypingAnswer() {
  if (session.answered) return;
  const input   = document.getElementById('typing-input');
  const userAns = input.value.trim();
  if (!userAns) return;

  const card    = session.current;
  const correct = session.direction === 'term->def' ? card.definition : card.term;
  const result  = gradeTyping(userAns, correct);

  input.className = 'typing-input ' + (result === 'correct' ? 'correct' : (result === 'almost' ? 'wrong' : 'wrong'));
  session.answered = true;
  recordAnswer(result === 'correct' || result === 'almost', correct, result);
}

function gradeTyping(user, correct) {
  const u = user.toLowerCase().trim();
  const c = correct.toLowerCase().trim();
  if (u === c) return 'correct';
  if (levenshtein(u, c) <= Math.max(1, Math.floor(c.length * 0.1))) return 'almost';
  return 'wrong';
}

// ── Answer recording ─────────────────────────────
function recordAnswer(isCorrect, correctText, result) {
  const card = session.current;

  // Update local confidence
  if (isCorrect) {
    card._confidence = Math.min(5, (card._confidence || 0) + 1);
    session.correct++;
    if (session.mode === 'learn' && card._confidence >= 4) {
      session.masteredIds.add(card.id);
    }
  } else {
    card._confidence = Math.max(0, (card._confidence || 0) - 1);
    session.wrong++;
    if (!session.wrongCards.find(c => c.id === card.id)) {
      session.wrongCards.push(card);
    }
    // Immediate retry: card will come back after the next card
    if (session.mode === 'learn' || session.mode === 'typing' || session.mode === 'multiple-choice') {
      session.retryImmediate = { ...card };
    }
  }

  // Persist progress
  persistProgress(card, isCorrect);

  // Show feedback
  showFeedback(isCorrect, correctText, result);
  updateLearnStatus();
  updateQuizProgress();
}

function persistProgress(card, isCorrect) {
  const sets2 = loadSets();
  const set   = sets2.find(s => s.id === session.set.id);
  if (!set) return;
  const prog = set.progress[card.id] || { confidence: 0 };
  prog.confidence = isCorrect ? Math.min(4, prog.confidence + 1) : Math.max(0, prog.confidence - 1);
  set.progress[card.id] = prog;
  saveSets(sets2);
}

// ── Feedback display ─────────────────────────────
function showFeedback(isCorrect, correctText, result) {
  const banner  = document.getElementById('feedback-banner');
  const detail  = document.getElementById('feedback-correct-answer');
  const fb      = document.getElementById('quiz-feedback');

  let bannerClass, bannerText;
  if (result === 'almost') {
    bannerClass = 'almost';
    bannerText  = '~ Almost! (counted as correct)';
  } else if (isCorrect) {
    bannerClass = 'correct';
    bannerText  = '✓ Correct!';
  } else {
    bannerClass = 'wrong';
    bannerText  = '✗ Incorrect';
  }

  banner.className = 'feedback-banner ' + bannerClass;
  banner.textContent = bannerText;

  if (!isCorrect || result === 'almost') {
    detail.style.display = 'block';
    detail.innerHTML = `<strong>Correct answer:</strong> ${esc(correctText)}`;
  } else {
    detail.style.display = 'none';
  }

  fb.style.display = 'flex';
  document.getElementById('btn-continue').focus();
}

// ── Progress UI ──────────────────────────────────
function updateQuizProgress() {
  const total    = session.total;
  const mastered = session.masteredIds.size;
  let pct;

  if (session.mode === 'learn') {
    pct = total ? (mastered / total) * 100 : 0;
  } else {
    const done = session.correct + session.wrong;
    pct = total ? Math.min(100, (done / total) * 100) : 0;
  }

  document.getElementById('quiz-progress-bar').style.width = pct + '%';
}

function updateLearnStatus() {
  if (session.mode !== 'learn') return;
  const mastered   = session.masteredIds.size;
  const remaining  = session.total - mastered;
  document.getElementById('learn-mastered-count').textContent  = `${mastered} mastered`;
  document.getElementById('learn-remaining-count').textContent  = `${remaining} remaining`;
}

// ── Session finish ───────────────────────────────
function confirmQuit() {
  if (confirm('Quit this session? Progress is saved.')) navigate('modes');
}

function finishSession(allMastered) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-results').classList.add('active');

  const { correct, wrong, wrongCards, mode, total } = session;

  document.getElementById('results-icon').textContent  = allMastered ? '🎉' : (wrong === 0 ? '🏆' : '📊');
  document.getElementById('results-title').textContent = allMastered
    ? 'You mastered everything!'
    : (wrong === 0 ? 'Perfect score!' : 'Round Complete');

  document.getElementById('results-stats').innerHTML = `
    <div class="stat-box stat-correct">
      <div class="stat-number">${correct}</div>
      <div class="stat-label">Correct</div>
    </div>
    <div class="stat-box stat-wrong">
      <div class="stat-number">${wrong}</div>
      <div class="stat-label">Incorrect</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${total}</div>
      <div class="stat-label">Terms</div>
    </div>
  `;

  const wrongList = document.getElementById('results-wrong-list');
  wrongList.innerHTML = '';
  if (wrongCards.length) {
    const lbl = document.createElement('div');
    lbl.className = 'preview-label';
    lbl.style.marginBottom = '8px';
    lbl.textContent = 'Review these:';
    wrongList.appendChild(lbl);

    wrongCards.forEach(c => {
      const el = document.createElement('div');
      el.className = 'wrong-item';
      el.innerHTML = `<div class="wi-term">${esc(c.term)}</div><div class="wi-def">${esc(c.definition)}</div>`;
      wrongList.appendChild(el);
    });
  }
}

function restartSession() {
  sets = loadSets();
  const set = sets.find(s => s.id === currentSetId);
  if (!set) return;
  initQuizSession(set, currentMode);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-quiz').classList.add('active');
}

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// ── Boot ─────────────────────────────────────────
renderHome();
