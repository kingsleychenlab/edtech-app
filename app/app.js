let state = null;
let premiumCatalogue = { plans: [], features: [], currency: "GBP" };
let focusRemaining = 0;
let focusInterval = null;
let toastTimer = null;
let saveQueue = Promise.resolve();
const aiOutputs = {};
const remoteData = { leaderboard: null, classes: null };

const view = document.getElementById("view");
const sidebar = document.getElementById("sidebar");
const menuScrim = document.getElementById("menuScrim");
const modal = document.getElementById("appModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalEyebrow = document.getElementById("modalEyebrow");

const routes = new Set(["dashboard", "quizzes", "notes", "flashcards", "papers", "resources", "planner", "tutor", "focus", "progress", "premium", "homework", "homework-solver", "note-condenser", "ai-examiner", "ai-study-plan", "beyond-theory", "grade9-studio", "model-answers", "predicted-papers", "virtual-sessions", "work-experience", "support", "cram-mode", "leaderboard", "competition-classes", "mind-map", "heatmap", "predicted-grades", "settings"]);

async function apiRequest(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("../public/login.html");
    throw new Error("Your session has ended.");
  }
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

async function loadState() {
  const data = await apiRequest("/api/workspace");
  return {
    ...data.workspace,
    quizzes: Array.isArray(data.workspace.quizzes) ? data.workspace.quizzes : [],
    quizAttempts: Array.isArray(data.workspace.quizAttempts) ? data.workspace.quizAttempts : [],
    mindMaps: Array.isArray(data.workspace.mindMaps) ? data.workspace.mindMaps : [],
    virtualSessions: Array.isArray(data.workspace.virtualSessions) ? data.workspace.virtualSessions : [],
    opportunities: Array.isArray(data.workspace.opportunities) ? data.workspace.opportunities : [],
    supportTickets: Array.isArray(data.workspace.supportTickets) ? data.workspace.supportTickets : [],
    generatedResources: Array.isArray(data.workspace.generatedResources) ? data.workspace.generatedResources : [],
    predictedPapers: Array.isArray(data.workspace.predictedPapers) ? data.workspace.predictedPapers : [],
    subscription: data.workspace.subscription || { status: "free", plan: null, currentPeriodEnd: null }
  };
}

async function loadPremiumCatalogue() {
  return apiRequest("/api/premium/catalogue");
}

function saveState() {
  updateProfileUI();
  const snapshot = JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => apiRequest("/api/workspace", { method: "PUT", body: JSON.stringify({ workspace: snapshot }) }))
    .catch(() => showToast("Your latest change could not be saved."));
  return saveQueue;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentRoute() {
  const route = location.hash.replace("#", "") || "dashboard";
  return routes.has(route) ? route : "dashboard";
}

function routeTo(route) {
  location.hash = route;
  closeMenu();
}

function updateProfileUI() {
  const name = state.profile.name || "Student";
  const email = state.profile.email || "";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  document.getElementById("sidebarName").textContent = name.split(" ")[0];
  document.getElementById("sidebarEmail").textContent = email;
  document.getElementById("sidebarAvatar").textContent = initial;
  document.getElementById("headerAvatar").textContent = initial;
}

function render() {
  const route = currentRoute();
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === route));

  const renderers = {
    dashboard: renderDashboard,
    premium: renderPremium,
    quizzes: renderQuizzes,
    notes: renderNotes,
    flashcards: renderFlashcards,
    papers: renderPapers,
    resources: renderResources,
    planner: renderPlanner,
    tutor: renderTutor,
    "homework-solver": renderHomeworkSolver,
    "note-condenser": renderNoteCondenser,
    "ai-examiner": renderAiExaminer,
    "ai-study-plan": renderAiStudyPlan,
    "beyond-theory": renderBeyondTheory,
    "grade9-studio": renderGrade9Studio,
    "model-answers": renderModelAnswers,
    "predicted-papers": renderPredictedPapers,
    "virtual-sessions": renderVirtualSessions,
    "work-experience": renderWorkExperience,
    support: renderSupport,
    "cram-mode": renderCramMode,
    leaderboard: renderLeaderboard,
    "competition-classes": renderCompetitionClasses,
    focus: renderFocus,
    progress: renderProgress,
    homework: renderHomework,
    "mind-map": renderMindMap,
    heatmap: renderHeatmap,
    "predicted-grades": renderPredictedGrades,
    settings: renderSettings
  };

  view.innerHTML = renderers[route]();
  view.focus({ preventScroll: true });
  refreshIcons();
  bindViewEvents(route);
}

function pageHead(title, copy, action = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${copy}</p></div>${action}</div>`;
}

function renderDashboard() {
  const firstName = escapeHTML((state.profile.name || "Student").split(" ")[0]);
  const cards = state.decks.reduce((total, deck) => total + deck.cards.length, 0);
  const quizAverage = averageScores(state.quizAttempts);
  const scoredPapers = state.papers.filter((paper) => paper.score > 0);
  const average = scoredPapers.length
    ? Math.round(scoredPapers.reduce((total, paper) => total + (paper.score / paper.max) * 100, 0) / scoredPapers.length)
    : 0;
  const pendingTasks = state.tasks.filter((task) => !task.done).slice(0, 4);
  const subjectProgress = buildSubjectAnalytics();

  return `
    <section class="dashboard-hero">
      <p class="eyebrow">Your workspace</p>
      <h1>Good ${getDayPart()}, ${firstName}.</h1>
      <p>Keep today focused: complete one priority task, review a small set of cards and record what needs attention next.</p>
      <div class="hero-actions">
        <button class="button" type="button" data-route-button="focus"><i data-lucide="play"></i>Start focus session</button>
        <button class="button-secondary" type="button" data-action="new-note"><i data-lucide="plus"></i>New note</button>
      </div>
    </section>

    <section class="stats-grid" aria-label="Workspace summary">
      <div class="stat-card"><span>Notes</span><strong>${state.notes.length}</strong></div>
      <div class="stat-card"><span>Flashcards</span><strong>${cards}</strong></div>
      <div class="stat-card"><span>Quiz average</span><strong>${quizAverage}%</strong></div>
      <div class="stat-card"><span>Paper average</span><strong>${average}%</strong></div>
    </section>

    <div class="section-head"><h2>Study tools</h2></div>
    <section class="tools-grid">
      ${toolCard("quizzes", "circle-help", "Quizzes", "Build questions and test active recall.", "pink")}
      ${toolCard("notes", "notebook-tabs", "Exam notes", "Organise concise notes by subject and topic.", "")}
      ${toolCard("flashcards", "layers-3", "Flashcards", "Review key facts with active recall.", "green")}
      ${toolCard("papers", "file-text", "Past papers", "Track attempts, marks and improvement.", "blue")}
      ${toolCard("resources", "library", "Resource library", "Keep generated lessons and practice resources.", "green")}
      ${toolCard("tutor", "sparkles", "AI tutor", "Ask for explanations and practice questions.", "pink")}
      ${toolCard("progress", "chart-no-axes-column-increasing", "Progress", "Find strengths and topics needing attention.", "blue")}
    </section>

    <section class="dashboard-row">
      <div class="panel">
        <div class="panel-title"><h2>Subject progress</h2><span class="badge indigo">This term</span></div>
        <div class="progress-list">${subjectProgress.length ? subjectProgress.slice(0, 5).map((item) => progressRow(item.subject, item.value)).join("") : `<div class="empty-state"><strong>No results yet</strong><p>Complete a quiz or add a scored paper to see progress.</p></div>`}</div>
      </div>
      <div class="panel">
        <div class="panel-title"><h2>Up next</h2><button class="button-secondary" type="button" data-route-button="planner">View plan</button></div>
        <div class="task-list">
          ${pendingTasks.length ? pendingTasks.map(taskRow).join("") : `<div class="empty-state"><strong>Plan is clear</strong><p>Add a task when you are ready.</p></div>`}
        </div>
      </div>
    </section>`;
}

function renderPremium() {
  return `
    <section class="premium-hero">
      <p class="eyebrow">Revizely Premium</p>
      <h1>More support for serious revision.</h1>
      <p>Unlock advanced study tools, deeper performance insight and expanded AI-powered support in the same focused workspace.</p>
    </section>
    <div class="section-head"><h2>Choose your plan</h2><span class="badge">Secure checkout</span></div>
    <section class="pricing-grid">
      ${premiumCatalogue.plans.map(pricingCard).join("")}
    </section>
    <div class="section-head"><h2>Premium tools</h2><span class="badge indigo">${premiumCatalogue.features.length} features</span></div>
    <section class="content-grid">
      ${premiumCatalogue.features.map(premiumFeatureCard).join("")}
    </section>`;
}

function pricingCard(plan) {
  return `<article class="price-card ${plan.badge ? "featured" : ""}">
    <div class="card-topline"><h3>${escapeHTML(plan.label)}</h3>${plan.badge ? `<span class="badge indigo">${escapeHTML(plan.badge)}</span>` : ""}</div>
    <div class="price">£${Number(plan.price).toFixed(2)} <small>${escapeHTML(plan.period)}</small></div>
    <p>${escapeHTML(plan.description)}</p>
    <button class="${plan.badge ? "button" : "button-secondary"}" type="button" data-action="select-plan" data-plan="${plan.type}">Choose ${escapeHTML(plan.label)}</button>
  </article>`;
}

function premiumFeatureCard(feature) {
  const labels = {
    available: "Available",
    included: "Included",
    "requires-ai": "AI setup needed",
    "content-required": "Content needed",
    "coming-soon": "Coming soon"
  };
  const canOpen = Boolean(feature.route);
  return `<article class="tool-card premium-feature-card">
    <div class="card-topline"><span class="tool-icon"><i data-lucide="${escapeHTML(feature.icon)}"></i></span><span class="badge feature-status">${labels[feature.availability] || "Premium"}</span></div>
    <h3>${escapeHTML(feature.title)}</h3><p>${escapeHTML(feature.description)}</p>
    <div class="card-actions">${canOpen ? `<button class="button-secondary" type="button" data-route-button="${feature.route}">Open tool<i data-lucide="arrow-right"></i></button>` : `<button class="button-secondary" type="button" data-action="feature-info" data-availability="${feature.availability}">Details</button>`}</div>
  </article>`;
}

function toolCard(route, icon, title, copy, colour) {
  return `<a class="tool-card" href="#${route}"><span class="tool-icon ${colour}"><i data-lucide="${icon}"></i></span><h3>${title}</h3><p>${copy}</p></a>`;
}

function progressRow(label, value) {
  return `<div class="progress-row"><span>${label}</span><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div><strong>${value}%</strong></div>`;
}

function averageScores(items) {
  const scored = items.filter((item) => Number(item.max) > 0);
  if (!scored.length) return 0;
  return Math.round(scored.reduce((sum, item) => sum + (Number(item.score) / Number(item.max)) * 100, 0) / scored.length);
}

function buildSubjectAnalytics() {
  const grouped = new Map();
  const add = (subject, score, max) => {
    if (!subject || !Number(max)) return;
    const scores = grouped.get(subject) || [];
    scores.push(Math.round((Number(score) / Number(max)) * 100));
    grouped.set(subject, scores);
  };
  state.papers.filter((paper) => paper.score > 0).forEach((paper) => add(paper.subject, paper.score, paper.max));
  state.quizAttempts.forEach((attempt) => add(attempt.subject, attempt.score, attempt.max));
  return [...grouped.entries()]
    .map(([subject, scores]) => ({ subject, value: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length), attempts: scores.length }))
    .sort((a, b) => a.value - b.value);
}

function renderQuizzes() {
  return `
    ${pageHead("Quizzes", `${state.quizzes.length} quizzes · ${state.quizAttempts.length} completed attempts.`, `<button class="button" type="button" data-action="new-quiz"><i data-lucide="plus"></i>New quiz</button>`)}
    <section class="content-grid">
      ${state.quizzes.length ? state.quizzes.map(quizCard).join("") : emptyState("circle-help", "No quizzes yet", "Create a quiz from the topics you are revising.")}
    </section>`;
}

function quizCard(quiz) {
  const attempts = state.quizAttempts.filter((attempt) => attempt.quizId === quiz.id);
  const latest = attempts[0];
  const result = latest ? `${Math.round((latest.score / latest.max) * 100)}% latest score` : "Not attempted yet";
  return `<article class="deck-card">
    <div class="card-topline"><span class="tool-icon pink"><i data-lucide="circle-help"></i></span><span class="badge">${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"}</span></div>
    <h3>${escapeHTML(quiz.title)}</h3><p>${escapeHTML(quiz.subject)} · ${escapeHTML(quiz.topic)} · ${result}</p>
    <div class="card-actions"><button class="button-secondary" type="button" data-action="take-quiz" data-id="${quiz.id}"><i data-lucide="play"></i>Start</button><button class="button-secondary" type="button" data-action="add-question" data-id="${quiz.id}"><i data-lucide="plus"></i>Question</button><button class="button-danger" type="button" data-action="delete-quiz" data-id="${quiz.id}" aria-label="Delete ${escapeHTML(quiz.title)}"><i data-lucide="trash-2"></i></button></div>
  </article>`;
}

function taskRow(task) {
  return `<div class="task-row ${task.done ? "done" : ""}"><input type="checkbox" data-task-id="${task.id}" aria-label="Mark ${escapeHTML(task.title)} complete" ${task.done ? "checked" : ""}/><span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.subject)} · ${escapeHTML(task.due)}</small></span><button class="icon-button" type="button" data-action="delete-task" data-id="${task.id}" aria-label="Delete ${escapeHTML(task.title)}"><i data-lucide="trash-2"></i></button></div>`;
}

function renderNotes() {
  const subjects = [...new Set(state.notes.map((note) => note.subject))].sort();
  return `
    ${pageHead("Exam notes", `${state.notes.length} notes across ${subjects.length} subjects.`, `<button class="button" type="button" data-action="new-note"><i data-lucide="plus"></i>New note</button>`)}
    <div class="toolbar">
      <div class="search-wrap"><i data-lucide="search"></i><input class="field" id="noteSearch" type="search" placeholder="Search notes" /></div>
      <select class="select" id="noteSubject" aria-label="Filter notes by subject"><option value="">All subjects</option>${subjects.map((subject) => `<option>${escapeHTML(subject)}</option>`).join("")}</select>
    </div>
    <section class="content-grid" id="notesGrid">
      ${state.notes.length ? state.notes.map(noteCard).join("") : emptyState("notebook-tabs", "No notes yet", "Create your first revision note.")}
    </section>`;
}

function noteCard(note) {
  const searchable = escapeHTML(`${note.title} ${note.subject} ${note.topic} ${note.content}`.toLowerCase());
  return `<article class="list-card" data-note-card data-subject="${escapeHTML(note.subject)}" data-searchable="${searchable}">
    <div class="card-topline"><span class="badge indigo">${escapeHTML(note.subject)}</span><span class="badge">${escapeHTML(note.updated)}</span></div>
    <h3>${escapeHTML(note.title)}</h3>
    <p>${escapeHTML(note.content.slice(0, 125))}${note.content.length > 125 ? "..." : ""}</p>
    <div class="card-actions"><button class="button-secondary" type="button" data-action="edit-note" data-id="${note.id}"><i data-lucide="pencil"></i>Edit</button><button class="button-danger" type="button" data-action="delete-note" data-id="${note.id}" aria-label="Delete ${escapeHTML(note.title)}"><i data-lucide="trash-2"></i></button></div>
  </article>`;
}

function renderFlashcards() {
  const total = state.decks.reduce((sum, deck) => sum + deck.cards.length, 0);
  return `
    ${pageHead("Flashcards", `${state.decks.length} decks with ${total} cards ready to review.`, `<button class="button" type="button" data-action="new-deck"><i data-lucide="plus"></i>New deck</button>`)}
    <section class="content-grid">
      ${state.decks.length ? state.decks.map(deckCard).join("") : emptyState("layers-3", "No decks yet", "Create a deck to begin active recall.")}
    </section>`;
}

function deckCard(deck) {
  return `<article class="deck-card">
    <div class="card-topline"><span class="tool-icon ${deck.colour || ""}"><i data-lucide="layers-3"></i></span><span class="badge">${deck.cards.length} cards</span></div>
    <h3>${escapeHTML(deck.title)}</h3><p>${escapeHTML(deck.subject)} · Review the deck at your own pace.</p>
    <div class="card-actions"><button class="button-secondary" type="button" data-action="review-deck" data-id="${deck.id}"><i data-lucide="play"></i>Review</button><button class="button-secondary" type="button" data-action="add-card" data-id="${deck.id}"><i data-lucide="plus"></i>Add card</button><button class="button-danger" type="button" data-action="delete-deck" data-id="${deck.id}" aria-label="Delete ${escapeHTML(deck.title)}"><i data-lucide="trash-2"></i></button></div>
  </article>`;
}

function renderPapers() {
  return `
    ${pageHead("Past papers", "Record timed attempts and use your marks to choose what to revise next.", `<button class="button" type="button" data-action="new-paper"><i data-lucide="plus"></i>Add paper</button>`)}
    <section class="content-grid">
      ${state.papers.length ? state.papers.map(paperCard).join("") : emptyState("file-text", "No papers added", "Add an attempt to start tracking progress.")}
    </section>`;
}

function renderResources() {
  const resources = [...state.generatedResources, ...state.predictedPapers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `
    ${pageHead("Resource library", "Saved AI lessons, study plans, feedback and original practice papers.")}
    <section class="content-grid">${resources.length ? resources.map((item) => `<article class="list-card"><div class="card-topline"><span class="badge indigo">${escapeHTML(item.type.replaceAll("-", " "))}</span><span class="badge">${escapeHTML(item.createdAt)}</span></div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.content.slice(0, 150))}${item.content.length > 150 ? "..." : ""}</p><div class="card-actions"><button class="button-secondary" type="button" data-action="view-resource" data-id="${item.id}"><i data-lucide="eye"></i>Open</button><button class="button-danger" type="button" data-action="delete-resource" data-id="${item.id}" aria-label="Delete ${escapeHTML(item.title)}"><i data-lucide="trash-2"></i></button></div></article>`).join("") : emptyState("library", "No saved resources", "Generate a premium resource and choose Save to keep it here.")}</section>`;
}

function paperCard(paper) {
  const percentage = paper.max ? Math.round((paper.score / paper.max) * 100) : 0;
  return `<article class="paper-card">
    <div class="card-topline"><span class="badge indigo">${escapeHTML(paper.subject)}</span><span class="badge">${escapeHTML(paper.board)} · ${escapeHTML(paper.year)}</span></div>
    <h3>${escapeHTML(paper.title)}</h3><p>${paper.score ? `Latest score: ${paper.score} out of ${paper.max}.` : "No score recorded yet."}</p>
    <div class="paper-progress"><div class="progress-track"><div class="progress-fill" style="width:${percentage}%"></div></div><strong>${percentage}%</strong></div>
    <div class="card-actions"><button class="button-secondary" type="button" data-action="edit-paper" data-id="${paper.id}"><i data-lucide="pencil"></i>Update</button><button class="button-danger" type="button" data-action="delete-paper" data-id="${paper.id}" aria-label="Delete ${escapeHTML(paper.title)}"><i data-lucide="trash-2"></i></button></div>
  </article>`;
}

function renderPlanner() {
  const open = state.tasks.filter((task) => !task.done).length;
  return `
    ${pageHead("Study plan", `${open} tasks remaining. Keep the plan short enough to finish.`, `<button class="button" type="button" data-action="new-task"><i data-lucide="plus"></i>Add task</button>`)}
    <section class="planner-layout">
      <div class="panel">
        <div class="panel-title"><h2>Your tasks</h2><span class="badge indigo">${open} open</span></div>
        <div class="task-list">${state.tasks.length ? state.tasks.map(taskRow).join("") : emptyState("calendar-days", "Nothing planned", "Add one clear task for your next study block.")}</div>
      </div>
      <aside class="panel">
        <div class="panel-title"><h2>Daily target</h2></div>
        <div class="stat-card"><span>Focused study</span><strong>${state.profile.dailyGoal} min</strong></div>
        <div class="section-head"><h2>Simple rhythm</h2></div>
        <div class="progress-list">
          <div class="task-row"><span class="badge indigo">1</span><span><strong>Choose one priority</strong><small>Start with the task that needs the most thought.</small></span></div>
          <div class="task-row"><span class="badge indigo">2</span><span><strong>Work without switching</strong><small>Use focus mode for one uninterrupted block.</small></span></div>
          <div class="task-row"><span class="badge indigo">3</span><span><strong>Review the result</strong><small>Record what still needs attention.</small></span></div>
        </div>
      </aside>
    </section>`;
}

function renderTutor() {
  return `
    ${pageHead("AI tutor", "Ask for a clear explanation, a short quiz or feedback on your approach.")}
    <section class="tutor-layout">
      <div class="panel chat-panel">
        <div class="chat-log" id="chatLog">${state.chat.length ? state.chat.map((message) => `<div class="chat-bubble ${message.role === "user" ? "user" : ""}">${escapeHTML(message.text)}</div>`).join("") : `<div class="empty-state"><i data-lucide="sparkles"></i><strong>Ask your first question</strong><p>Get a clear explanation, worked method or short practice quiz.</p></div>`}</div>
        <form class="chat-form" id="chatForm"><input class="field" id="chatInput" autocomplete="off" placeholder="Ask a revision question" required /><button class="button" type="submit" aria-label="Send question"><i data-lucide="send"></i>Send</button></form>
      </div>
      <aside class="panel">
        <div class="panel-title"><h2>Try asking</h2></div>
        <button class="suggestion-button" type="button" data-suggestion="Explain osmosis simply">Explain a topic simply</button>
        <button class="suggestion-button" type="button" data-suggestion="Quiz me on cell biology">Create a short quiz</button>
        <button class="suggestion-button" type="button" data-suggestion="Help me structure a GCSE English paragraph">Structure an exam answer</button>
      </aside>
    </section>`;
}

function aiToolPage({ route, title, copy, fields, button, icon }) {
  const output = aiOutputs[route];
  return `
    ${pageHead(title, copy)}
    <section class="ai-tool-layout">
      <form class="panel form-grid ai-tool-form" data-ai-form="${route}">
        ${fields}
        <button class="button" type="submit"><i data-lucide="${icon}"></i><span>${button}</span></button>
      </form>
      <aside class="panel ai-result" aria-live="polite">
        <div class="panel-title"><h2>Result</h2>${output ? `<div class="card-actions"><button class="button-secondary" type="button" data-action="copy-ai-output" data-output="${route}"><i data-lucide="copy"></i>Copy</button><button class="button-secondary" type="button" data-action="save-ai-output" data-output="${route}"><i data-lucide="save"></i>Save</button></div>` : ""}</div>
        <div id="aiResult">${output ? `<div class="ai-output">${escapeHTML(output)}</div>` : `<div class="empty-state"><i data-lucide="${icon}"></i><strong>Ready when you are</strong><p>Complete the fields and Revizely will place the result here.</p></div>`}</div>
      </aside>
    </section>`;
}

function renderHomeworkSolver() {
  return aiToolPage({
    route: "homework-solver",
    title: "Homework solver",
    copy: "Work through a question with the method and reasoning made clear.",
    fields: `<label class="field-label">Subject<input class="field" name="subject" placeholder="e.g. Mathematics" required /></label><label class="field-label">Homework question<textarea class="textarea textarea-large" name="question" placeholder="Type the full question, including any values or instructions." required></textarea></label>`,
    button: "Work through question",
    icon: "square-function"
  });
}

function renderNoteCondenser() {
  return aiToolPage({
    route: "note-condenser",
    title: "Note condenser",
    copy: "Reduce long material to the facts, terms and questions worth revising.",
    fields: `<label class="field-label">Subject<input class="field" name="subject" placeholder="e.g. Biology" required /></label><label class="field-label">Notes<textarea class="textarea textarea-large" name="notes" placeholder="Paste your lesson or revision notes." required></textarea></label>`,
    button: "Condense notes",
    icon: "file-down"
  });
}

function renderAiExaminer() {
  return aiToolPage({
    route: "ai-examiner",
    title: "AI examiner",
    copy: "Get a guided mark, specific feedback and an improved response.",
    fields: `<div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Exam board<input class="field" name="board" placeholder="e.g. AQA" required /></label></div><label class="field-label">Exam question<textarea class="textarea" name="question" required></textarea></label><label class="field-label">Your answer<textarea class="textarea textarea-large" name="answer" required></textarea></label><label class="field-label">Maximum marks<input class="field" type="number" name="maxMarks" min="1" max="100" value="6" required /></label>`,
    button: "Mark answer",
    icon: "scan-text"
  });
}

function renderAiStudyPlan() {
  return aiToolPage({
    route: "ai-study-plan",
    title: "AI study plan",
    copy: "Create a realistic weekly revision structure around your exams and available time.",
    fields: `<label class="field-label">Subjects<input class="field" name="subjects" placeholder="e.g. Maths, Biology, English Literature" required /></label><div class="form-grid two"><label class="field-label">First exam date<input class="field" type="date" name="examDate" required /></label><label class="field-label">Hours each week<input class="field" type="number" name="weeklyHours" min="1" max="60" value="6" required /></label></div><label class="field-label">Priorities or weak areas<textarea class="textarea" name="priorities" placeholder="Optional: topics, commitments or days to avoid"></textarea></label>`,
    button: "Create study plan",
    icon: "calendar-cog"
  });
}

function renderBeyondTheory() {
  return aiToolPage({
    route: "beyond-theory", title: "Beyond theory", copy: "Connect a curriculum topic to a practical application and worked example.", icon: "book-open-check", button: "Create applied lesson",
    fields: `<label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Topic<input class="field" name="topic" placeholder="e.g. Electromagnetic induction" required /></label>`
  });
}

function renderGrade9Studio() {
  return aiToolPage({
    route: "grade9-studio", title: "Grade 9 studio", copy: "Create a demanding revision resource with precise terminology and higher-mark thinking.", icon: "graduation-cap", button: "Generate resource",
    fields: `<label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Topic<input class="field" name="topic" required /></label><label class="field-label">Format<select class="select" name="format"><option value="notes">Revision notes</option><option value="flashcards">Flashcards</option></select></label>`
  });
}

function renderModelAnswers() {
  return aiToolPage({
    route: "model-answers", title: "Model answers", copy: "See what a strong response looks like and why it earns marks.", icon: "file-check-2", button: "Create model answer",
    fields: `<label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Exam question<textarea class="textarea textarea-large" name="question" required></textarea></label><label class="field-label">Marks<input class="field" type="number" name="marks" min="1" max="100" value="12" required /></label>`
  });
}

function renderPredictedPapers() {
  return aiToolPage({
    route: "predicted-papers", title: "Practice paper generator", copy: "Create an original, unofficial exam-style paper for the topics you choose.", icon: "file-clock", button: "Generate practice paper",
    fields: `<div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Exam board style<input class="field" name="board" placeholder="e.g. AQA" required /></label></div><label class="field-label">Topics<textarea class="textarea" name="topics" placeholder="Enter the topics to cover" required></textarea></label><label class="field-label">Total marks<input class="field" type="number" name="marks" min="20" max="100" value="60" required /></label>`
  });
}

function renderVirtualSessions() {
  return `
    ${pageHead("Virtual sessions", "Plan tutoring or group revision sessions and keep the joining details together.")}
    <section class="dashboard-row">
      <form class="panel form-grid" data-collection-form="virtualSessions">
        <div class="panel-title"><h2>Schedule session</h2></div>
        <label class="field-label">Session title<input class="field" name="title" required /></label>
        <div class="form-grid two"><label class="field-label">Date and time<input class="field" type="datetime-local" name="startsAt" required /></label><label class="field-label">Duration (minutes)<input class="field" type="number" name="duration" min="15" max="240" value="45" required /></label></div>
        <label class="field-label">Joining link<input class="field" type="url" name="url" placeholder="https://..." /></label>
        <button class="button" type="submit"><i data-lucide="calendar-plus"></i>Schedule session</button>
      </form>
      <div class="panel"><div class="panel-title"><h2>Upcoming</h2><span class="badge">${state.virtualSessions.length}</span></div>${collectionRows(state.virtualSessions, "virtualSessions", (item) => `${formatDateTime(item.startsAt)} · ${item.duration} min`, "video")}</div>
    </section>`;
}

function renderWorkExperience() {
  return `
    ${pageHead("Work experience", "Track opportunities and applications without losing deadlines or links.")}
    <section class="dashboard-row">
      <form class="panel form-grid" data-collection-form="opportunities">
        <div class="panel-title"><h2>Add opportunity</h2></div>
        <label class="field-label">Organisation<input class="field" name="title" required /></label>
        <label class="field-label">Role or programme<input class="field" name="role" required /></label>
        <div class="form-grid two"><label class="field-label">Deadline<input class="field" type="date" name="due" required /></label><label class="field-label">Status<select class="select" name="status"><option>Considering</option><option>Applying</option><option>Submitted</option><option>Accepted</option></select></label></div>
        <label class="field-label">Application link<input class="field" type="url" name="url" placeholder="https://..." /></label>
        <button class="button" type="submit"><i data-lucide="plus"></i>Add opportunity</button>
      </form>
      <div class="panel"><div class="panel-title"><h2>Applications</h2><span class="badge">${state.opportunities.length}</span></div>${collectionRows(state.opportunities, "opportunities", (item) => `${item.role} · ${item.status} · due ${item.due}`, "briefcase-business")}</div>
    </section>`;
}

function renderSupport() {
  return `
    ${pageHead("Priority support", "Create a support request and track its status from your workspace.")}
    <section class="dashboard-row">
      <form class="panel form-grid" data-collection-form="supportTickets">
        <div class="panel-title"><h2>New request</h2></div>
        <label class="field-label">Subject<input class="field" name="title" required /></label>
        <label class="field-label">Details<textarea class="textarea textarea-large" name="details" required></textarea></label>
        <button class="button" type="submit"><i data-lucide="send"></i>Submit request</button>
      </form>
      <div class="panel"><div class="panel-title"><h2>Your requests</h2><span class="badge">${state.supportTickets.length}</span></div>${collectionRows(state.supportTickets, "supportTickets", (item) => `${item.status} · ${item.createdAt}`, "life-buoy")}</div>
    </section>`;
}

function collectionRows(items, type, detail, icon) {
  if (!items.length) return emptyState(icon, "Nothing here yet", "Use the form to add the first item.");
  return `<div class="insight-list">${items.map((item) => `<div class="insight-row"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(detail(item))}</small></span><div class="card-actions">${item.details ? `<button class="icon-button" type="button" data-action="view-collection-item" data-collection="${type}" data-id="${item.id}" aria-label="Open ${escapeHTML(item.title)}"><i data-lucide="eye"></i></button>` : ""}${safeHttpUrl(item.url) ? `<a class="icon-button" href="${escapeHTML(item.url)}" target="_blank" rel="noopener" aria-label="Open link"><i data-lucide="external-link"></i></a>` : ""}<button class="icon-button" type="button" data-action="delete-collection-item" data-collection="${type}" data-id="${item.id}" aria-label="Delete ${escapeHTML(item.title)}"><i data-lucide="trash-2"></i></button></div></div>`).join("")}</div>`;
}

function safeHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function renderCramMode() {
  const analytics = buildSubjectAnalytics();
  const urgent = state.tasks.filter((task) => !task.done).sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 4);
  const weak = analytics.slice(0, 3);
  return `
    ${pageHead("Cram mode", "A short, evidence-led plan for the revision time you have left.", `<button class="button" type="button" data-route-button="focus"><i data-lucide="play"></i>Start focus block</button>`)}
    <section class="stats-grid"><div class="stat-card"><span>Open tasks</span><strong>${state.tasks.filter((task) => !task.done).length}</strong></div><div class="stat-card"><span>Weak subjects</span><strong>${weak.length}</strong></div><div class="stat-card"><span>Focus target</span><strong>${state.profile.dailyGoal} min</strong></div><div class="stat-card"><span>Cards ready</span><strong>${state.decks.reduce((sum, deck) => sum + deck.cards.length, 0)}</strong></div></section>
    <section class="dashboard-row"><div class="panel"><div class="panel-title"><h2>Do first</h2></div>${urgent.length ? `<div class="task-list">${urgent.map(taskRow).join("")}</div>` : emptyState("check-check", "No urgent tasks", "Your task list is clear.")}</div><div class="panel"><div class="panel-title"><h2>Revise next</h2></div>${weak.length ? `<div class="progress-list">${weak.map((item) => progressRow(item.subject, item.value)).join("")}</div>` : emptyState("chart-no-axes-column-increasing", "No weak areas measured", "Complete a quiz or paper to receive priorities.")}</div></section>`;
}

function renderLeaderboard() {
  return `${pageHead("Leaderboard", "Revision points reward completed work, not time spent staring at a screen.")}<section class="panel" id="leaderboardPanel">${leaderboardRows(remoteData.leaderboard)}</section>`;
}

function leaderboardRows(entries) {
  if (!entries) return emptyState("loader-circle", "Loading leaderboard", "Calculating revision points.");
  if (!entries.length) return emptyState("trophy", "No scores yet", "Complete study work to earn points.");
  return `<div class="leaderboard-list">${entries.map((entry, index) => `<div class="leaderboard-row ${entry.current ? "current" : ""}"><span class="leaderboard-rank">${index + 1}</span><strong>${escapeHTML(entry.name)}${entry.current ? " (you)" : ""}</strong><span>${entry.points} pts</span></div>`).join("")}</div>`;
}

function renderCompetitionClasses() {
  return `
    ${pageHead("Competition classes", "Create a private class or join one with a six-character code.")}
    <section class="dashboard-row"><form class="panel form-grid" data-class-form="create"><div class="panel-title"><h2>Create class</h2></div><label class="field-label">Class name<input class="field" name="name" required /></label><button class="button" type="submit"><i data-lucide="plus"></i>Create class</button></form><form class="panel form-grid" data-class-form="join"><div class="panel-title"><h2>Join class</h2></div><label class="field-label">Class code<input class="field" name="code" maxlength="6" required /></label><button class="button-secondary" type="submit"><i data-lucide="log-in"></i>Join class</button></form></section>
    <div class="section-head"><h2>Your classes</h2></div><section id="classesPanel">${classesMarkup(remoteData.classes)}</section>`;
}

function classesMarkup(classes) {
  if (!classes) return emptyState("loader-circle", "Loading classes", "Checking your memberships.");
  if (!classes.length) return emptyState("users-round", "No classes yet", "Create one or enter a class code to join.");
  return `<div class="content-grid">${classes.map((item) => `<article class="panel"><div class="card-topline"><h3>${escapeHTML(item.name)}</h3><span class="badge indigo">${item.code}</span></div><p>${item.members} member${item.members === 1 ? "" : "s"}</p>${leaderboardRows(item.leaderboard)}</article>`).join("")}</div>`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function renderFocus() {
  return `
    ${pageHead("Focus mode", "One task, one timer and no extra noise.")}
    <section class="focus-wrap">
      <div>
        <p class="eyebrow">Focus session</p>
        <div class="timer-display" id="timerDisplay">${formatTime(focusRemaining)}</div>
        <p class="timer-copy">${state.focusMinutes}-minute revision block · ${state.focusSessions} sessions completed</p>
        <div class="timer-actions">
          <button class="button" type="button" id="toggleTimer"><i data-lucide="play"></i>${focusInterval ? "Pause" : "Start"}</button>
          <button class="button-secondary" type="button" id="resetTimer"><i data-lucide="rotate-ccw"></i>Reset</button>
        </div>
      </div>
    </section>`;
}

function renderProgress() {
  const analytics = buildSubjectAnalytics();
  const quizAverage = averageScores(state.quizAttempts);
  const paperAverage = averageScores(state.papers.filter((paper) => paper.score > 0));
  const weakest = analytics[0];
  return `
    ${pageHead("Progress", "Use completed work to decide where your next study session will have the most impact.")}
    <section class="stats-grid" aria-label="Progress summary">
      <div class="stat-card"><span>Quiz attempts</span><strong>${state.quizAttempts.length}</strong></div>
      <div class="stat-card"><span>Quiz average</span><strong>${quizAverage}%</strong></div>
      <div class="stat-card"><span>Paper average</span><strong>${paperAverage}%</strong></div>
      <div class="stat-card"><span>Subjects measured</span><strong>${analytics.length}</strong></div>
    </section>
    <section class="dashboard-row">
      <div class="panel">
        <div class="panel-title"><h2>Subject performance</h2><span class="badge indigo">All attempts</span></div>
        <div class="progress-list">${analytics.length ? analytics.map((item) => progressRow(item.subject, item.value)).join("") : emptyState("chart-no-axes-column-increasing", "No performance data", "Complete a quiz or record a paper score to begin.")}</div>
      </div>
      <aside class="panel">
        <div class="panel-title"><h2>Next best step</h2></div>
        ${weakest ? `<div class="insight-list"><div class="insight-row"><span><strong>Prioritise ${escapeHTML(weakest.subject)}</strong><small>${weakest.attempts} measured attempt${weakest.attempts === 1 ? "" : "s"}</small></span><span class="badge indigo">${weakest.value}%</span></div><button class="button" type="button" data-action="plan-weakest" data-subject="${escapeHTML(weakest.subject)}"><i data-lucide="calendar-plus"></i>Add to study plan</button></div>` : `<div class="empty-state"><strong>No recommendation yet</strong><p>Add results and Revizely will identify the lowest-scoring subject.</p></div>`}
      </aside>
    </section>
    <div class="section-head"><h2>Recent quiz attempts</h2></div>
    <section class="panel">
      <div class="insight-list">${state.quizAttempts.length ? state.quizAttempts.slice(0, 8).map((attempt) => `<div class="insight-row"><span><strong>${escapeHTML(attempt.title)}</strong><small>${escapeHTML(attempt.subject)} · ${escapeHTML(attempt.completedAt)}</small></span><span class="badge indigo">${attempt.score}/${attempt.max}</span></div>`).join("") : `<div class="empty-state"><strong>No attempts yet</strong><p>Quiz results will appear here.</p></div>`}</div>
    </section>`;
}

function renderHomework() {
  const overdue = state.tasks.filter((task) => !task.done && isOverdue(task.due)).length;
  const complete = state.tasks.filter((task) => task.done).length;
  return `
    ${pageHead("Homework tracker", "Keep assignments, deadlines and completion status in one place.", `<button class="button" type="button" data-action="new-task"><i data-lucide="plus"></i>Add homework</button>`)}
    <section class="stats-grid">
      <div class="stat-card"><span>Total assignments</span><strong>${state.tasks.length}</strong></div>
      <div class="stat-card"><span>Open</span><strong>${state.tasks.length - complete}</strong></div>
      <div class="stat-card"><span>Completed</span><strong>${complete}</strong></div>
      <div class="stat-card"><span>Overdue</span><strong>${overdue}</strong></div>
    </section>
    <div class="section-head"><h2>Assignments</h2></div>
    <section class="panel"><div class="task-list">${state.tasks.length ? state.tasks.map(taskRow).join("") : emptyState("calendar-check", "No homework added", "Add an assignment and its deadline to begin.")}</div></section>`;
}

function isOverdue(value) {
  if (!value) return false;
  const due = new Date(value);
  return !Number.isNaN(due.getTime()) && due < new Date(new Date().setHours(0, 0, 0, 0));
}

function renderHeatmap() {
  const analytics = buildSubjectAnalytics();
  return `
    ${pageHead("Performance heat map", "A simple red, amber and green view of your recorded subject performance.")}
    <section class="heatmap-grid">
      ${analytics.length ? analytics.map((item) => `<article class="heatmap-tile ${item.value >= 70 ? "good" : item.value >= 50 ? "mid" : "low"}"><strong>${escapeHTML(item.subject)}</strong><span>${item.value}%</span><small>${item.attempts} attempt${item.attempts === 1 ? "" : "s"}</small></article>`).join("") : emptyState("layout-grid", "No heat map yet", "Complete quizzes or record paper marks to populate it.")}
    </section>`;
}

function renderPredictedGrades() {
  const analytics = buildSubjectAnalytics();
  return `
    ${pageHead("Predicted grades", "Working-grade estimates based only on the results recorded in this workspace.")}
    <section class="content-grid">
      ${analytics.length ? analytics.map((item) => `<article class="stat-card"><span>${escapeHTML(item.subject)}</span><strong>Grade ${gradeFromPercentage(item.value)}</strong><p class="settings-copy">${item.value}% average across ${item.attempts} attempt${item.attempts === 1 ? "" : "s"}.</p></article>`).join("") : emptyState("calculator", "No grade estimates yet", "Add scored work before using predicted grades.")}
    </section>
    <p class="settings-copy" style="margin-top:1rem">These are broad working estimates, not official exam-board grade boundaries.</p>`;
}

function gradeFromPercentage(value) {
  if (value >= 80) return 9;
  if (value >= 70) return 8;
  if (value >= 60) return 7;
  if (value >= 50) return 6;
  if (value >= 40) return 5;
  if (value >= 30) return 4;
  if (value >= 20) return 3;
  if (value >= 10) return 2;
  return 1;
}

function renderMindMap() {
  const latest = state.mindMaps[0];
  return `
    ${pageHead("Mind map generator", "Turn one topic and its key points into a clean revision map.")}
    <section class="dashboard-row">
      <form class="panel form-grid" id="mindMapForm">
        <div class="panel-title"><h2>Map content</h2></div>
        <label class="field-label">Central topic<input class="field" name="title" placeholder="e.g. Cell biology" required /></label>
        <label class="field-label">Key points<textarea class="textarea" name="points" placeholder="Enter one point per line" required></textarea></label>
        <button class="button" type="submit"><i data-lucide="network"></i>Generate map</button>
      </form>
      <aside class="panel"><div class="panel-title"><h2>Saved maps</h2><span class="badge">${state.mindMaps.length}</span></div><div class="insight-list">${state.mindMaps.length ? state.mindMaps.slice(0, 6).map((map) => `<div class="insight-row"><span><strong>${escapeHTML(map.title)}</strong><small>${map.points.length} branches</small></span><button class="icon-button" type="button" data-action="delete-map" data-id="${map.id}" aria-label="Delete ${escapeHTML(map.title)}"><i data-lucide="trash-2"></i></button></div>`).join("") : `<div class="empty-state"><strong>No saved maps</strong><p>Your generated maps will appear here.</p></div>`}</div></aside>
    </section>
    <div class="section-head"><h2>Latest map</h2></div>
    ${latest ? mindMapPreview(latest) : `<div class="empty-state"><i data-lucide="network"></i><strong>No map generated</strong><p>Add a central topic and key points to create one.</p></div>`}`;
}

function mindMapPreview(map) {
  return `<div class="mind-map-canvas"><div class="mind-map-root">${escapeHTML(map.title)}</div><div class="mind-map-branches">${map.points.map((point) => `<div class="mind-map-branch">${escapeHTML(point)}</div>`).join("")}</div></div>`;
}

function renderSettings() {
  return `
    ${pageHead("Settings", "Keep your account details and study preferences up to date.")}
    <section class="settings-layout">
      <form class="panel form-grid" id="settingsForm">
        <div class="panel-title"><h2>Profile</h2></div>
        <label class="field-label">Full name<input class="field" name="name" value="${escapeHTML(state.profile.name)}" required /></label>
        <label class="field-label">Email address<input class="field" type="email" name="email" value="${escapeHTML(state.profile.email)}" readonly /></label>
        <div class="form-grid two">
          <label class="field-label">Exam year<input class="field" name="examYear" inputmode="numeric" value="${escapeHTML(state.profile.examYear)}" required /></label>
          <label class="field-label">Daily goal (minutes)<input class="field" type="number" name="dailyGoal" min="10" max="240" value="${state.profile.dailyGoal}" required /></label>
        </div>
        <div class="form-actions"><button class="button" type="submit">Save changes</button></div>
      </form>
      <aside class="panel">
        <div class="panel-title"><h2>Account</h2></div>
        <p class="settings-copy">Your study data is held by the Revizely server for this workspace. Database storage is not connected yet.</p>
        <div class="form-grid" style="margin-top:1rem">
          <button class="button-secondary" type="button" data-action="reset-workspace"><i data-lucide="rotate-ccw"></i>Reset workspace</button>
          <button class="button-danger" type="button" data-action="signout"><i data-lucide="log-out"></i>Log out</button>
        </div>
      </aside>
    </section>`;
}

function emptyState(icon, title, copy) {
  return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`;
}

function bindViewEvents(route) {
  view.querySelectorAll("[data-route-button]").forEach((button) => button.addEventListener("click", () => routeTo(button.dataset.routeButton)));
  view.querySelectorAll("[data-task-id]").forEach((checkbox) => checkbox.addEventListener("change", () => toggleTask(checkbox.dataset.taskId)));

  if (route === "notes") {
    const search = document.getElementById("noteSearch");
    const subject = document.getElementById("noteSubject");
    const filter = () => {
      const query = search.value.trim().toLowerCase();
      view.querySelectorAll("[data-note-card]").forEach((card) => {
        card.hidden = !card.dataset.searchable.includes(query) || (subject.value && card.dataset.subject !== subject.value);
      });
    };
    search.addEventListener("input", filter);
    subject.addEventListener("change", filter);
  }

  if (route === "tutor") {
    const form = document.getElementById("chatForm");
    const input = document.getElementById("chatInput");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendTutorMessage(input.value);
    });
    view.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => sendTutorMessage(button.dataset.suggestion)));
    const log = document.getElementById("chatLog");
    log.scrollTop = log.scrollHeight;
  }

  if (route === "focus") {
    document.getElementById("toggleTimer").addEventListener("click", toggleFocusTimer);
    document.getElementById("resetTimer").addEventListener("click", resetFocusTimer);
  }

  if (route === "settings") {
    document.getElementById("settingsForm").addEventListener("submit", saveSettings);
  }

  if (route === "mind-map") {
    document.getElementById("mindMapForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const points = data.points.split("\n").map((point) => point.trim()).filter(Boolean);
      state.mindMaps.unshift({ id: uid("map"), title: data.title.trim(), points, createdAt: new Date().toISOString() });
      await saveState();
      render();
      showToast("Mind map saved.");
    });
  }

  const aiForm = view.querySelector("[data-ai-form]");
  if (aiForm) aiForm.addEventListener("submit", submitAiTool);

  view.querySelectorAll("[data-collection-form]").forEach((form) => form.addEventListener("submit", submitCollectionItem));
  view.querySelectorAll("[data-class-form]").forEach((form) => form.addEventListener("submit", submitClassForm));
  if (route === "leaderboard") loadLeaderboard();
  if (route === "competition-classes") loadClasses();
}

async function submitAiTool(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const route = form.dataset.aiForm;
  const action = {
    "homework-solver": "homework-solver", "note-condenser": "note-condenser", "ai-examiner": "examiner", "ai-study-plan": "study-plan",
    "beyond-theory": "beyond-theory", "grade9-studio": "grade9-resource", "model-answers": "model-answer", "predicted-papers": "predicted-paper"
  }[route];
  const button = form.querySelector("button[type='submit']");
  const label = button.querySelector("span");
  const originalLabel = label.textContent;
  button.disabled = true;
  label.textContent = "Working...";
  try {
    const payload = Object.fromEntries(new FormData(form));
    const data = await apiRequest(`/api/ai/${action}`, { method: "POST", body: JSON.stringify(payload) });
    aiOutputs[route] = data.answer;
    render();
  } catch (error) {
    const result = document.getElementById("aiResult");
    if (result) result.innerHTML = `<div class="empty-state error-state"><i data-lucide="circle-alert"></i><strong>Could not generate a result</strong><p>${escapeHTML(error.message)}</p></div>`;
    refreshIcons();
  } finally {
    button.disabled = false;
    label.textContent = originalLabel;
  }
}

async function submitCollectionItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.collectionForm;
  const data = Object.fromEntries(new FormData(form));
  let item;
  if (type === "virtualSessions") item = { id: uid("session"), title: data.title.trim(), startsAt: data.startsAt, duration: Number(data.duration), url: data.url.trim() };
  if (type === "opportunities") item = { id: uid("opportunity"), title: data.title.trim(), role: data.role.trim(), due: data.due, status: data.status, url: data.url.trim() };
  if (type === "supportTickets") item = { id: uid("ticket"), title: data.title.trim(), details: data.details.trim(), status: "Open", createdAt: new Date().toLocaleDateString("en-GB") };
  if (!item) return;
  state[type].unshift(item);
  await saveState();
  render();
  showToast("Saved.");
}

async function loadLeaderboard() {
  try {
    remoteData.leaderboard = (await apiRequest("/api/leaderboard")).entries;
    const panel = document.getElementById("leaderboardPanel");
    if (panel) { panel.innerHTML = leaderboardRows(remoteData.leaderboard); refreshIcons(); }
  } catch (error) { showToast(error.message); }
}

async function loadClasses() {
  try {
    remoteData.classes = (await apiRequest("/api/classes")).classes;
    const panel = document.getElementById("classesPanel");
    if (panel) { panel.innerHTML = classesMarkup(remoteData.classes); refreshIcons(); }
  } catch (error) { showToast(error.message); }
}

async function submitClassForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { action: form.dataset.classForm, ...Object.fromEntries(new FormData(form)) };
  try {
    await apiRequest("/api/classes", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    await loadClasses();
    showToast(payload.action === "create" ? "Class created." : "Class joined.");
  } catch (error) { showToast(error.message); }
}

function openModal(eyebrow, title, body) {
  modalEyebrow.textContent = eyebrow;
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modal.showModal();
  refreshIcons();
  const firstInput = modalBody.querySelector("input, textarea, select");
  if (firstInput) firstInput.focus();
}

function closeModal() {
  if (modal.open) modal.close();
}

function noteForm(note = {}) {
  openModal(note.id ? "Update" : "Create", note.id ? "Edit note" : "New note", `
    <form class="form-grid" data-modal-form="note" data-id="${note.id || ""}">
      <label class="field-label">Title<input class="field" name="title" value="${escapeHTML(note.title || "")}" required /></label>
      <div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" value="${escapeHTML(note.subject || "")}" required /></label><label class="field-label">Topic<input class="field" name="topic" value="${escapeHTML(note.topic || "")}" required /></label></div>
      <label class="field-label">Note<textarea class="textarea" name="content" required>${escapeHTML(note.content || "")}</textarea></label>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Save note</button></div>
    </form>`);
}

function deckForm() {
  openModal("Create", "New flashcard deck", `
    <form class="form-grid" data-modal-form="deck">
      <label class="field-label">Deck name<input class="field" name="title" placeholder="e.g. Chemistry: Bonding" required /></label>
      <label class="field-label">Subject<input class="field" name="subject" placeholder="Chemistry" required /></label>
      <label class="field-label">First question<input class="field" name="front" required /></label>
      <label class="field-label">Answer<textarea class="textarea" name="back" required></textarea></label>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Create deck</button></div>
    </form>`);
}

function cardForm(deck) {
  openModal("Build deck", `Add to ${deck.title}`, `
    <form class="form-grid" data-modal-form="card" data-id="${deck.id}">
      <label class="field-label">Question<input class="field" name="front" required /></label>
      <label class="field-label">Answer<textarea class="textarea" name="back" required></textarea></label>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Add card</button></div>
    </form>`);
}

function quizQuestionFields() {
  return `
    <label class="field-label">Question<input class="field" name="prompt" required /></label>
    <div class="form-grid two">
      <label class="field-label">Option A<input class="field" name="optionA" required /></label>
      <label class="field-label">Option B<input class="field" name="optionB" required /></label>
      <label class="field-label">Option C<input class="field" name="optionC" required /></label>
      <label class="field-label">Option D<input class="field" name="optionD" required /></label>
    </div>
    <label class="field-label">Correct answer<select class="select" name="correct" required><option value="0">Option A</option><option value="1">Option B</option><option value="2">Option C</option><option value="3">Option D</option></select></label>`;
}

function quizForm() {
  openModal("Create", "New quiz", `
    <form class="form-grid" data-modal-form="quiz">
      <label class="field-label">Quiz title<input class="field" name="title" required /></label>
      <div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" required /></label><label class="field-label">Topic<input class="field" name="topic" required /></label></div>
      ${quizQuestionFields()}
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Create quiz</button></div>
    </form>`);
}

function questionForm(quiz) {
  openModal("Build quiz", `Add to ${quiz.title}`, `
    <form class="form-grid" data-modal-form="question" data-id="${quiz.id}">
      ${quizQuestionFields()}
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Add question</button></div>
    </form>`);
}

function paperForm(paper = {}) {
  openModal(paper.id ? "Update" : "Create", paper.id ? "Update paper" : "Add past paper", `
    <form class="form-grid" data-modal-form="paper" data-id="${paper.id || ""}">
      <label class="field-label">Paper title<input class="field" name="title" value="${escapeHTML(paper.title || "")}" required /></label>
      <div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" value="${escapeHTML(paper.subject || "")}" required /></label><label class="field-label">Exam board<input class="field" name="board" value="${escapeHTML(paper.board || "")}" required /></label></div>
      <div class="form-grid two"><label class="field-label">Year<input class="field" name="year" inputmode="numeric" value="${escapeHTML(paper.year || "")}" required /></label><label class="field-label">Maximum mark<input class="field" type="number" name="max" min="1" value="${paper.max || ""}" required /></label></div>
      <label class="field-label">Your score<input class="field" type="number" name="score" min="0" value="${paper.score ?? 0}" required /></label>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Save paper</button></div>
    </form>`);
}

function taskForm(defaults = {}) {
  openModal("Plan", "Add study task", `
    <form class="form-grid" data-modal-form="task">
      <label class="field-label">Task<input class="field" name="title" value="${escapeHTML(defaults.title || "")}" placeholder="e.g. Review algebra mistakes" required /></label>
      <div class="form-grid two"><label class="field-label">Subject<input class="field" name="subject" value="${escapeHTML(defaults.subject || "")}" required /></label><label class="field-label">Due<input class="field" type="date" name="due" required /></label></div>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Add task</button></div>
    </form>`);
}

function reviewDeck(deck) {
  if (!deck.cards.length) return showToast("This deck has no cards yet.");
  let index = 0;
  let flipped = false;
  const draw = () => {
    const card = deck.cards[index];
    modalBody.innerHTML = `
      <div class="panel" style="min-height:14rem;display:grid;place-items:center;text-align:center">
        <div><span class="badge indigo">Card ${index + 1} of ${deck.cards.length}</span><h3 style="margin:1rem 0 0;font-size:1.15rem;font-weight:900">${escapeHTML(flipped ? card.back : card.front)}</h3><p>${flipped ? "Answer" : "Question"}</p></div>
      </div>
      <div class="form-actions"><button class="button-secondary" type="button" id="flipCard"><i data-lucide="rotate-ccw"></i>${flipped ? "Show question" : "Show answer"}</button><button class="button" type="button" id="nextCard">${index === deck.cards.length - 1 ? "Finish" : "Next"}<i data-lucide="arrow-right"></i></button></div>`;
    refreshIcons();
    document.getElementById("flipCard").addEventListener("click", () => { flipped = !flipped; draw(); });
    document.getElementById("nextCard").addEventListener("click", () => {
      if (index === deck.cards.length - 1) {
        closeModal();
        showToast("Deck review complete.");
        return;
      }
      index += 1;
      flipped = false;
      draw();
    });
  };
  modalEyebrow.textContent = deck.subject;
  modalTitle.textContent = deck.title;
  modal.showModal();
  draw();
}

function takeQuiz(quiz) {
  if (!quiz.questions.length) return showToast("Add a question before starting this quiz.");
  let index = 0;
  let score = 0;
  const draw = () => {
    const question = quiz.questions[index];
    modalEyebrow.textContent = `${quiz.subject} · Question ${index + 1} of ${quiz.questions.length}`;
    modalTitle.textContent = quiz.title;
    modalBody.innerHTML = `
      <form id="quizAttemptForm">
        <h3 style="margin:0;color:#0f172a;font-size:1.08rem;font-weight:900;line-height:1.5">${escapeHTML(question.prompt)}</h3>
        <div class="quiz-options">${question.options.map((option, optionIndex) => `<label class="quiz-option"><input type="radio" name="answer" value="${optionIndex}" required /><span>${escapeHTML(option)}</span></label>`).join("")}</div>
        <div class="form-actions"><button class="button" type="submit">${index === quiz.questions.length - 1 ? "Finish quiz" : "Next question"}<i data-lucide="arrow-right"></i></button></div>
      </form>`;
    refreshIcons();
    document.getElementById("quizAttemptForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const answer = Number(new FormData(event.currentTarget).get("answer"));
      if (answer === Number(question.correct)) score += 1;
      if (index < quiz.questions.length - 1) {
        index += 1;
        draw();
        return;
      }
      state.quizAttempts.unshift({
        id: uid("attempt"),
        quizId: quiz.id,
        title: quiz.title,
        subject: quiz.subject,
        topic: quiz.topic,
        score,
        max: quiz.questions.length,
        completedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      });
      await saveState();
      closeModal();
      render();
      showToast(`Quiz complete: ${score}/${quiz.questions.length}.`);
    });
  };
  modal.showModal();
  draw();
}

function handleModalSubmit(form) {
  const data = Object.fromEntries(new FormData(form));
  const type = form.dataset.modalForm;
  const id = form.dataset.id;

  if (type === "note") {
    const note = { id: id || uid("note"), title: data.title.trim(), subject: data.subject.trim(), topic: data.topic.trim(), content: data.content.trim(), updated: "Just now" };
    state.notes = id ? state.notes.map((item) => item.id === id ? note : item) : [note, ...state.notes];
    showToast(id ? "Note updated." : "Note created.");
  }

  if (type === "deck") {
    state.decks.unshift({ id: uid("deck"), title: data.title.trim(), subject: data.subject.trim(), colour: "", cards: [{ front: data.front.trim(), back: data.back.trim() }] });
    showToast("Flashcard deck created.");
  }

  if (type === "card") {
    state.decks = state.decks.map((deck) => deck.id === id ? { ...deck, cards: [...deck.cards, { front: data.front.trim(), back: data.back.trim() }] } : deck);
    showToast("Card added.");
  }

  if (type === "quiz") {
    state.quizzes.unshift({
      id: uid("quiz"),
      title: data.title.trim(),
      subject: data.subject.trim(),
      topic: data.topic.trim(),
      questions: [{ id: uid("question"), prompt: data.prompt.trim(), options: [data.optionA.trim(), data.optionB.trim(), data.optionC.trim(), data.optionD.trim()], correct: Number(data.correct) }]
    });
    showToast("Quiz created.");
  }

  if (type === "question") {
    state.quizzes = state.quizzes.map((quiz) => quiz.id === id ? {
      ...quiz,
      questions: [...quiz.questions, { id: uid("question"), prompt: data.prompt.trim(), options: [data.optionA.trim(), data.optionB.trim(), data.optionC.trim(), data.optionD.trim()], correct: Number(data.correct) }]
    } : quiz);
    showToast("Question added.");
  }

  if (type === "paper") {
    const max = Number(data.max);
    const score = Math.min(Number(data.score), max);
    const paper = { id: id || uid("paper"), title: data.title.trim(), subject: data.subject.trim(), board: data.board.trim(), year: data.year.trim(), max, score };
    state.papers = id ? state.papers.map((item) => item.id === id ? paper : item) : [paper, ...state.papers];
    showToast(id ? "Paper updated." : "Paper added.");
  }

  if (type === "task") {
    state.tasks.unshift({ id: uid("task"), title: data.title.trim(), subject: data.subject.trim(), due: data.due.trim(), done: false });
    showToast("Task added to your plan.");
  }

  saveState();
  closeModal();
  render();
}

function toggleTask(id) {
  state.tasks = state.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task);
  saveState();
  render();
}

async function sendTutorMessage(text) {
  const question = text.trim();
  if (!question) return;
  const history = state.chat.slice(-8);
  state.chat.push({ role: "user", text: question });
  render();
  try {
    const data = await apiRequest("/api/tutor", { method: "POST", body: JSON.stringify({ question, history }) });
    state.chat.push({ role: "assistant", text: data.answer });
  } catch (error) {
    state.chat.push({ role: "assistant", text: error.message });
  }
  await saveState();
  render();
}

function toggleFocusTimer() {
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
    render();
    return;
  }
  focusInterval = setInterval(() => {
    focusRemaining -= 1;
    const display = document.getElementById("timerDisplay");
    if (display) display.textContent = formatTime(focusRemaining);
    if (focusRemaining <= 0) {
      clearInterval(focusInterval);
      focusInterval = null;
      state.focusSessions += 1;
      saveState();
      focusRemaining = state.focusMinutes * 60;
      showToast("Focus session complete.");
      render();
    }
  }, 1000);
  render();
}

function resetFocusTimer() {
  clearInterval(focusInterval);
  focusInterval = null;
  focusRemaining = state.focusMinutes * 60;
  render();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function saveSettings(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.profile = { ...state.profile, name: data.name.trim(), examYear: data.examYear.trim(), dailyGoal: Number(data.dailyGoal) };
  saveState();
  showToast("Settings saved.");
  render();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function getDayPart() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
}

function openMenu() {
  sidebar.classList.add("open");
  menuScrim.classList.add("show");
}

function closeMenu() {
  sidebar.classList.remove("open");
  menuScrim.classList.remove("show");
}

document.getElementById("openMenu").addEventListener("click", openMenu);
document.getElementById("closeMenu").addEventListener("click", closeMenu);
menuScrim.addEventListener("click", closeMenu);
document.getElementById("closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route-button]");
  if (routeButton && !view.contains(routeButton)) routeTo(routeButton.dataset.routeButton);

  const action = event.target.closest("[data-action]");
  if (!action) return;
  const id = action.dataset.id;

  if (action.dataset.action === "new-note") noteForm();
  if (action.dataset.action === "edit-note") noteForm(state.notes.find((note) => note.id === id));
  if (action.dataset.action === "delete-note" && confirm("Delete this note?")) { state.notes = state.notes.filter((note) => note.id !== id); saveState(); render(); showToast("Note deleted."); }
  if (action.dataset.action === "new-deck") deckForm();
  if (action.dataset.action === "add-card") cardForm(state.decks.find((deck) => deck.id === id));
  if (action.dataset.action === "review-deck") reviewDeck(state.decks.find((deck) => deck.id === id));
  if (action.dataset.action === "delete-deck" && confirm("Delete this deck?")) { state.decks = state.decks.filter((deck) => deck.id !== id); saveState(); render(); showToast("Deck deleted."); }
  if (action.dataset.action === "new-quiz") quizForm();
  if (action.dataset.action === "add-question") questionForm(state.quizzes.find((quiz) => quiz.id === id));
  if (action.dataset.action === "take-quiz") takeQuiz(state.quizzes.find((quiz) => quiz.id === id));
  if (action.dataset.action === "delete-quiz" && confirm("Delete this quiz and its attempt history?")) {
    state.quizzes = state.quizzes.filter((quiz) => quiz.id !== id);
    state.quizAttempts = state.quizAttempts.filter((attempt) => attempt.quizId !== id);
    saveState();
    render();
    showToast("Quiz deleted.");
  }
  if (action.dataset.action === "new-paper") paperForm();
  if (action.dataset.action === "edit-paper") paperForm(state.papers.find((paper) => paper.id === id));
  if (action.dataset.action === "delete-paper" && confirm("Delete this paper?")) { state.papers = state.papers.filter((paper) => paper.id !== id); saveState(); render(); showToast("Paper deleted."); }
  if (action.dataset.action === "new-task") taskForm();
  if (action.dataset.action === "delete-task" && confirm("Delete this task?")) { state.tasks = state.tasks.filter((task) => task.id !== id); saveState(); render(); showToast("Task deleted."); }
  if (action.dataset.action === "plan-weakest") taskForm({ subject: action.dataset.subject, title: `Review ${action.dataset.subject} weak areas` });
  if (action.dataset.action === "quick-focus") routeTo("focus");
  if (action.dataset.action === "select-plan") selectPremiumPlan(action.dataset.plan);
  if (action.dataset.action === "feature-info") {
    const messages = { "requires-ai": "This tool needs an AI provider configured on the backend.", "content-required": "This tool is ready for supplied premium learning content.", "coming-soon": "This feature is marked as coming soon in the reference product.", included: "This benefit is included with Premium." };
    showToast(messages[action.dataset.availability] || "Premium feature.");
  }
  if (action.dataset.action === "copy-ai-output") {
    const output = aiOutputs[action.dataset.output];
    if (output) navigator.clipboard.writeText(output).then(() => showToast("Result copied.")).catch(() => showToast("Could not copy the result."));
  }
  if (action.dataset.action === "save-ai-output") {
    const route = action.dataset.output;
    const output = aiOutputs[route];
    if (output) {
      const titles = { "homework-solver": "Homework solution", "note-condenser": "Condensed notes", "ai-examiner": "Examiner feedback", "ai-study-plan": "AI study plan", "beyond-theory": "Applied lesson", "grade9-studio": "Grade 9 resource", "model-answers": "Model answer", "predicted-papers": "Practice paper" };
      const item = { id: uid("resource"), title: titles[route] || "AI resource", type: route, content: output, createdAt: new Date().toLocaleDateString("en-GB") };
      if (route === "predicted-papers") state.predictedPapers.unshift(item); else state.generatedResources.unshift(item);
      saveState();
      showToast("Saved to your workspace.");
    }
  }
  if (action.dataset.action === "delete-collection-item" && confirm("Delete this item?")) {
    const collection = action.dataset.collection;
    if (Array.isArray(state[collection])) {
      state[collection] = state[collection].filter((item) => item.id !== id);
      saveState(); render(); showToast("Deleted.");
    }
  }
  if (action.dataset.action === "view-collection-item") {
    const item = state[action.dataset.collection]?.find((entry) => entry.id === id);
    if (item) openModal(item.status || "Saved item", item.title, `<div class="ai-output resource-preview">${escapeHTML(item.details || "")}</div><div class="form-actions"><button class="button" type="button" data-close-modal>Done</button></div>`);
  }
  if (action.dataset.action === "view-resource") {
    const resource = [...state.generatedResources, ...state.predictedPapers].find((item) => item.id === id);
    if (resource) openModal(resource.type.replaceAll("-", " "), resource.title, `<div class="ai-output resource-preview">${escapeHTML(resource.content)}</div><div class="form-actions"><button class="button-secondary" type="button" data-action="copy-resource" data-id="${resource.id}"><i data-lucide="copy"></i>Copy</button><button class="button" type="button" data-close-modal>Done</button></div>`);
  }
  if (action.dataset.action === "copy-resource") {
    const resource = [...state.generatedResources, ...state.predictedPapers].find((item) => item.id === id);
    if (resource) navigator.clipboard.writeText(resource.content).then(() => showToast("Resource copied.")).catch(() => showToast("Could not copy the resource."));
  }
  if (action.dataset.action === "delete-resource" && confirm("Delete this saved resource?")) {
    state.generatedResources = state.generatedResources.filter((item) => item.id !== id);
    state.predictedPapers = state.predictedPapers.filter((item) => item.id !== id);
    saveState(); render(); showToast("Resource deleted.");
  }
  if (action.dataset.action === "delete-map" && confirm("Delete this mind map?")) {
    state.mindMaps = state.mindMaps.filter((map) => map.id !== id);
    saveState();
    render();
    showToast("Mind map deleted.");
  }
  if (action.dataset.action === "reset-workspace" && confirm("Reset all workspace data?")) resetWorkspace();
  if (action.dataset.action === "signout") signOut();
});

modalBody.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeModal();
});

modalBody.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-modal-form]");
  if (!form) return;
  event.preventDefault();
  handleModalSubmit(form);
});

window.addEventListener("hashchange", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n" && currentRoute() === "notes") {
    event.preventDefault();
    noteForm();
  }
});

async function resetWorkspace() {
  try {
    const data = await apiRequest("/api/workspace", { method: "DELETE" });
    state = data.workspace;
    focusRemaining = state.focusMinutes * 60;
    render();
    updateProfileUI();
    showToast("Workspace reset.");
  } catch (error) {
    showToast(error.message);
  }
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.href = "../public/login.html";
}

async function selectPremiumPlan(plan) {
  try {
    const data = await apiRequest("/api/premium/checkout", { method: "POST", body: JSON.stringify({ plan }) });
    window.location.href = data.checkoutUrl;
  } catch (error) {
    showToast(error.message);
  }
}

async function initialise() {
  try {
    const [workspace, catalogue] = await Promise.all([loadState(), loadPremiumCatalogue()]);
    state = workspace;
    premiumCatalogue = catalogue;
    if (!state) return;
    focusRemaining = state.focusMinutes * 60;
    updateProfileUI();
    render();
    refreshIcons();
  } catch (error) {
    view.innerHTML = `<div class="empty-state"><strong>Workspace unavailable</strong><p>${escapeHTML(error.message)}</p></div>`;
  }
}

initialise();
