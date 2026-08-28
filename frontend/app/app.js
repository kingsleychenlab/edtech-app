let state = null;
let currentUser = { id: "", name: "", email: "", roles: ["student"], friendCode: "" };
let premiumCatalogue = { plans: [], features: [], currency: "GBP" };
let focusRemaining = 0;
let focusInterval = null;
let toastTimer = null;
let saveQueue = Promise.resolve();
const aiOutputs = {};
const remoteData = { leaderboard: null, classes: null, friends: null, challenges: null };

// XP awarded per completed action, mirroring backend/store.js.
const XP_REWARDS = {
  task: 10,
  quiz: 25,
  note: 5,
  card: 2,
  paper: 15,
  focus: 15,
  deck: 5,
  resource: 10,
  extracurricular: 10,
  opportunity: 10
};

const FOCUS_PRESETS = [5, 10, 15, 25, 30, 45, 60, 90];
const CURRICULA = ["GCSE", "IGCSE", "A-Level", "SAT"];
const YEAR_GROUPS = ["Year 9", "Year 10", "Year 11", "Year 12", "Year 13", "Other"];
const SUBJECT_SUGGESTIONS = [
  "Mathematics", "Further Mathematics", "English Language", "English Literature",
  "Biology", "Chemistry", "Physics", "Combined Science", "Computer Science",
  "History", "Geography", "Economics", "Business", "Psychology", "Sociology",
  "French", "Spanish", "German", "Art & Design", "Music", "Physical Education",
  "Religious Studies", "Design & Technology", "Drama"
];

const view = document.getElementById("view");
const sidebar = document.getElementById("sidebar");
const menuScrim = document.getElementById("menuScrim");
const modal = document.getElementById("appModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalEyebrow = document.getElementById("modalEyebrow");

const routes = new Set(["dashboard", "quizzes", "notes", "flashcards", "papers", "resources", "planner", "tutor", "focus", "progress", "premium", "homework", "homework-solver", "note-condenser", "ai-examiner", "ai-study-plan", "beyond-theory", "grade9-studio", "model-answers", "predicted-papers", "virtual-sessions", "work-experience", "support", "cram-mode", "leaderboard", "competition-classes", "mind-map", "heatmap", "predicted-grades", "settings", "friends", "challenges", "extracurriculars", "cv-builder", "creator-portal", "admin-portal"]);

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
  return normaliseWorkspace(data.workspace);
}

// Defaults every field the UI reads, so a workspace saved by an older build
// still renders instead of throwing on a missing object.
function normaliseWorkspace(workspace) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const profile = workspace.profile || {};
  const nameParts = String(profile.name || "").trim().split(/\s+/);
  return {
    ...workspace,
    profile: {
      name: "",
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" "),
      email: "",
      school: "",
      year: "",
      curriculum: "",
      examYear: "",
      dailyGoal: 45,
      onboarded: false,
      ...profile,
      subjects: list(profile.subjects)
    },
    preferences: { theme: "system", aiEnabled: true, ...(workspace.preferences || {}) },
    notifications: { study: true, progress: true, content: true, achievements: true, ...(workspace.notifications || {}) },
    streak: { current: 0, longest: 0, lastActiveDate: null, ...(workspace.streak || {}) },
    xp: { total: 0, ...(workspace.xp || {}), history: list(workspace.xp?.history) },
    cv: {
      headline: "",
      summary: "",
      ...(workspace.cv || {}),
      education: list(workspace.cv?.education),
      experience: list(workspace.cv?.experience),
      skills: list(workspace.cv?.skills),
      achievements: list(workspace.cv?.achievements)
    },
    notes: list(workspace.notes),
    decks: list(workspace.decks),
    papers: list(workspace.papers),
    tasks: list(workspace.tasks),
    chat: list(workspace.chat),
    quizzes: list(workspace.quizzes),
    quizAttempts: list(workspace.quizAttempts),
    mindMaps: list(workspace.mindMaps),
    virtualSessions: list(workspace.virtualSessions),
    opportunities: list(workspace.opportunities),
    extracurriculars: list(workspace.extracurriculars),
    supportTickets: list(workspace.supportTickets),
    generatedResources: list(workspace.generatedResources),
    predictedPapers: list(workspace.predictedPapers),
    subscription: workspace.subscription || { status: "free", plan: null, currentPeriodEnd: null },
    focusMinutes: Number(workspace.focusMinutes) || 25,
    focusSessions: Number(workspace.focusSessions) || 0
  };
}

async function loadPremiumCatalogue() {
  return apiRequest("/api/premium/catalogue");
}

function saveState() {
  updateProfileUI();
  updateHeaderMetrics();
  const snapshot = JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => apiRequest("/api/workspace", { method: "PUT", body: JSON.stringify({ workspace: snapshot }) }))
    .catch(() => showToast("Your latest change could not be saved."));
  return saveQueue;
}

/* ---------------------------------------------------------------------------
 * Theme
 * ------------------------------------------------------------------------ */

const THEME_KEY = "revizely-theme";

function resolvedTheme(preference) {
  if (preference === "dark" || preference === "light") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference) {
  const theme = resolvedTheme(preference);
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* private mode */ }
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    toggle.setAttribute("title", theme === "dark" ? "Light mode" : "Dark mode");
  }
  refreshIcons();
}

function setTheme(preference) {
  state.preferences.theme = preference;
  applyTheme(preference);
  saveState();
}

function cycleTheme() {
  // The button flips between the two concrete themes; "system" is chosen in Settings.
  setTheme(resolvedTheme(state.preferences.theme) === "dark" ? "light" : "dark");
}

/* ---------------------------------------------------------------------------
 * Streak
 * ------------------------------------------------------------------------ */

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromKey, toKey) {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

// Called once on load and again whenever the student completes something.
// Returns true when the streak changed, so the caller can celebrate it.
function touchStreak() {
  const today = todayKey();
  const streak = state.streak;
  if (streak.lastActiveDate === today) return false;

  const gap = streak.lastActiveDate ? daysBetween(streak.lastActiveDate, today) : null;
  streak.current = gap === 1 ? streak.current + 1 : 1;
  streak.lastActiveDate = today;
  streak.longest = Math.max(streak.longest || 0, streak.current);
  return true;
}

// A streak only lapses once the student is *two* days past their last activity,
// so an untouched workspace opened the next morning still shows yesterday's run.
function reconcileStreak() {
  const streak = state.streak;
  if (!streak.lastActiveDate) return;
  const gap = daysBetween(streak.lastActiveDate, todayKey());
  if (gap !== null && gap > 1) streak.current = 0;
}

/* ---------------------------------------------------------------------------
 * XP
 * ------------------------------------------------------------------------ */

function levelFromXp(total) {
  // Each level costs 100 XP more than the last: 100, 300, 600, 1000, ...
  return Math.floor((Math.sqrt(1 + (8 * Math.max(0, total)) / 100) - 1) / 2) + 1;
}

function xpForLevel(level) {
  return (100 * (level - 1) * level) / 2;
}

function levelProgress(total) {
  const level = levelFromXp(total);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return {
    level,
    into: total - floor,
    span: ceiling - floor,
    percent: Math.round(((total - floor) / (ceiling - floor)) * 100)
  };
}

// Awards XP, shows the floating reward and keeps the streak fresh.
// `render` is skipped by callers that re-render themselves straight after.
function awardXp(kind, label, options = {}) {
  const amount = XP_REWARDS[kind] || 0;
  if (!amount) return 0;

  const beforeLevel = levelFromXp(state.xp.total);
  state.xp.total += amount;
  state.xp.history.unshift({ kind, label, amount, at: new Date().toISOString() });
  state.xp.history = state.xp.history.slice(0, 50);

  const streakChanged = touchStreak();
  const afterLevel = levelFromXp(state.xp.total);

  showXpReward(amount, label);
  updateHeaderMetrics();

  if (afterLevel > beforeLevel) {
    setTimeout(() => showToast(`Level ${afterLevel} reached.`), 400);
  } else if (streakChanged && state.streak.current > 1) {
    setTimeout(() => showToast(`${state.streak.current}-day streak.`), 400);
  }

  if (options.save !== false) saveState();
  return amount;
}

function showXpReward(amount, label) {
  const layer = document.getElementById("xpLayer");
  if (!layer) return;
  const chip = document.createElement("div");
  chip.className = "xp-pop";
  chip.innerHTML = `<strong>+${amount} XP</strong>${label ? `<small>${escapeHTML(label)}</small>` : ""}`;
  layer.appendChild(chip);
  chip.addEventListener("animationend", () => chip.remove());
  // Belt-and-braces cleanup for browsers that drop the animation event.
  setTimeout(() => chip.remove(), 2600);
}

function updateHeaderMetrics() {
  const target = document.getElementById("headerMetrics");
  if (!target || !state) return;
  const progress = levelProgress(state.xp.total);
  target.innerHTML = `
    <span class="metric-chip streak-chip" title="${state.streak.current}-day study streak">
      <i data-lucide="flame"></i><strong>${state.streak.current}</strong>
    </span>
    <span class="metric-chip xp-chip" title="Level ${progress.level} · ${state.xp.total} XP total">
      <i data-lucide="zap"></i><strong>${state.xp.total}</strong><small>XP</small>
    </span>`;
  refreshIcons();
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

/* ---------------------------------------------------------------------------
 * Onboarding
 * ------------------------------------------------------------------------ */

const onboardingLayer = document.getElementById("onboardingLayer");
let onboardingStep = 0;
let onboardingDraft = null;

function needsOnboarding() {
  return !state.profile.onboarded;
}

function startOnboarding() {
  onboardingStep = 0;
  onboardingDraft = {
    firstName: state.profile.firstName || (state.profile.name || "").split(" ")[0] || "",
    lastName: state.profile.lastName || (state.profile.name || "").split(" ").slice(1).join(" "),
    year: state.profile.year || "",
    curriculum: state.profile.curriculum || "",
    subjects: [...state.profile.subjects],
    examYear: state.profile.examYear || String(new Date().getFullYear() + 1),
    dailyGoal: state.profile.dailyGoal || 45
  };
  onboardingLayer.hidden = false;
  document.body.classList.add("onboarding-open");
  renderOnboarding();
}

function finishOnboarding() {
  onboardingLayer.hidden = true;
  onboardingLayer.innerHTML = "";
  document.body.classList.remove("onboarding-open");
}

const ONBOARDING_STEPS = [
  { title: "Welcome to Revizely", copy: "Revise wisely with Revizely. Let's set up your workspace — it takes about a minute." },
  { title: "Where are you studying?", copy: "This shapes the exam board language used across your notes, papers and AI tools." },
  { title: "Which subjects are you taking?", copy: "Pick everything you are revising. You can change these any time in Settings." },
  { title: "Set your daily target", copy: "A realistic target you can hit most days beats an ambitious one you cannot." }
];

function renderOnboarding() {
  const step = ONBOARDING_STEPS[onboardingStep];
  const bodies = [onboardingNameStep, onboardingStageStep, onboardingSubjectsStep, onboardingGoalStep];
  const isLast = onboardingStep === ONBOARDING_STEPS.length - 1;

  onboardingLayer.innerHTML = `
    <div class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <div class="onboarding-head">
        <img class="brand-logo" src="../assets/revizely-logo.png" alt="" />
        <span class="brand-wordmark">
          <strong>Revizely.ai</strong>
          <small class="brand-slogan">Revise wisely with Revizely</small>
        </span>
      </div>
      <div class="onboarding-progress" aria-hidden="true">
        ${ONBOARDING_STEPS.map((_, index) => `<span class="${index <= onboardingStep ? "done" : ""}"></span>`).join("")}
      </div>
      <p class="eyebrow">Step ${onboardingStep + 1} of ${ONBOARDING_STEPS.length}</p>
      <h1 id="onboardingTitle">${escapeHTML(step.title)}</h1>
      <p class="onboarding-copy">${escapeHTML(step.copy)}</p>
      <form class="onboarding-body form-grid" id="onboardingForm">
        ${bodies[onboardingStep]()}
        <div class="onboarding-actions">
          ${onboardingStep > 0 ? `<button class="button-secondary" type="button" data-onboarding="back"><i data-lucide="arrow-left"></i>Back</button>` : `<span></span>`}
          <button class="button" type="submit">${isLast ? "Finish setup" : "Continue"}<i data-lucide="arrow-right"></i></button>
        </div>
      </form>
    </div>`;

  refreshIcons();
  bindOnboardingEvents();
  const firstField = onboardingLayer.querySelector("input, select");
  if (firstField) firstField.focus();
}

function onboardingNameStep() {
  return `
    <div class="form-grid two">
      <label class="field-label">First name<input class="field" name="firstName" value="${escapeHTML(onboardingDraft.firstName)}" required autocomplete="given-name" /></label>
      <label class="field-label">Last name<input class="field" name="lastName" value="${escapeHTML(onboardingDraft.lastName)}" autocomplete="family-name" /></label>
    </div>`;
}

function onboardingStageStep() {
  return `
    <fieldset class="choice-grid">
      <legend class="field-label-text">Qualification</legend>
      ${CURRICULA.map((item) => `<label class="choice-card"><input type="radio" name="curriculum" value="${item}" ${onboardingDraft.curriculum === item ? "checked" : ""} required /><span>${item}</span></label>`).join("")}
    </fieldset>
    <div class="form-grid two">
      <label class="field-label">Year or grade<select class="select" name="year" required><option value="">Select…</option>${YEAR_GROUPS.map((item) => `<option ${onboardingDraft.year === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      <label class="field-label">Exam year<input class="field" name="examYear" inputmode="numeric" value="${escapeHTML(onboardingDraft.examYear)}" required /></label>
    </div>`;
}

function onboardingSubjectsStep() {
  return `
    <div class="subject-picker" data-subject-picker>
      ${SUBJECT_SUGGESTIONS.map((subject) => `<button class="subject-chip ${onboardingDraft.subjects.includes(subject) ? "selected" : ""}" type="button" data-subject="${escapeHTML(subject)}">${escapeHTML(subject)}</button>`).join("")}
    </div>
    <label class="field-label">Add another subject
      <span class="inline-add">
        <input class="field" id="customSubject" placeholder="e.g. Latin" />
        <button class="button-secondary" type="button" data-onboarding="add-subject"><i data-lucide="plus"></i>Add</button>
      </span>
    </label>
    <p class="field-hint" id="subjectCount">${onboardingDraft.subjects.length} selected</p>`;
}

function onboardingGoalStep() {
  return `
    <label class="field-label">Daily focused study target
      <select class="select" name="dailyGoal">
        ${[20, 30, 45, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${Number(onboardingDraft.dailyGoal) === minutes ? "selected" : ""}>${minutes} minutes</option>`).join("")}
      </select>
    </label>
    <div class="onboarding-summary">
      <h2>Your setup</h2>
      <dl>
        <div><dt>Name</dt><dd>${escapeHTML(`${onboardingDraft.firstName} ${onboardingDraft.lastName}`.trim() || "—")}</dd></div>
        <div><dt>Qualification</dt><dd>${escapeHTML(onboardingDraft.curriculum || "—")}</dd></div>
        <div><dt>Year</dt><dd>${escapeHTML(onboardingDraft.year || "—")}</dd></div>
        <div><dt>Subjects</dt><dd>${onboardingDraft.subjects.length ? escapeHTML(onboardingDraft.subjects.join(", ")) : "—"}</dd></div>
      </dl>
    </div>`;
}

function bindOnboardingEvents() {
  const form = document.getElementById("onboardingForm");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    if (onboardingStep === 0) {
      onboardingDraft.firstName = String(data.firstName || "").trim();
      onboardingDraft.lastName = String(data.lastName || "").trim();
    }
    if (onboardingStep === 1) {
      onboardingDraft.curriculum = String(data.curriculum || "");
      onboardingDraft.year = String(data.year || "");
      onboardingDraft.examYear = String(data.examYear || "").trim();
    }
    if (onboardingStep === 2 && !onboardingDraft.subjects.length) {
      showToast("Choose at least one subject.");
      return;
    }
    if (onboardingStep === 3) {
      onboardingDraft.dailyGoal = Number(data.dailyGoal) || 45;
      completeOnboarding();
      return;
    }

    onboardingStep += 1;
    renderOnboarding();
  });

  onboardingLayer.querySelectorAll("[data-subject]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const subject = chip.dataset.subject;
      onboardingDraft.subjects = onboardingDraft.subjects.includes(subject)
        ? onboardingDraft.subjects.filter((item) => item !== subject)
        : [...onboardingDraft.subjects, subject];
      chip.classList.toggle("selected");
      const count = document.getElementById("subjectCount");
      if (count) count.textContent = `${onboardingDraft.subjects.length} selected`;
    });
  });

  const back = onboardingLayer.querySelector('[data-onboarding="back"]');
  if (back) back.addEventListener("click", () => { onboardingStep -= 1; renderOnboarding(); });

  const addSubject = onboardingLayer.querySelector('[data-onboarding="add-subject"]');
  if (addSubject) {
    const input = document.getElementById("customSubject");
    const add = () => {
      const value = input.value.trim();
      if (!value) return;
      if (!onboardingDraft.subjects.includes(value)) onboardingDraft.subjects.push(value);
      input.value = "";
      renderOnboarding();
    };
    addSubject.addEventListener("click", add);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); add(); }
    });
  }
}

async function completeOnboarding() {
  const fullName = `${onboardingDraft.firstName} ${onboardingDraft.lastName}`.trim();
  state.profile = {
    ...state.profile,
    firstName: onboardingDraft.firstName,
    lastName: onboardingDraft.lastName,
    name: fullName || state.profile.name,
    year: onboardingDraft.year,
    curriculum: onboardingDraft.curriculum,
    examYear: onboardingDraft.examYear,
    subjects: onboardingDraft.subjects,
    dailyGoal: onboardingDraft.dailyGoal,
    onboarded: true
  };
  touchStreak();
  finishOnboarding();
  updateProfileUI();
  updateHeaderMetrics();
  await saveState();
  render();
  showToast(`Welcome to Revizely, ${onboardingDraft.firstName || "student"}.`);
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
    friends: renderFriends,
    challenges: renderChallenges,
    extracurriculars: renderExtracurriculars,
    "cv-builder": renderCvBuilder,
    "creator-portal": renderCreatorPortal,
    "admin-portal": renderAdminPortal,
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
  const progress = levelProgress(state.xp.total);

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

    <section class="streak-grid" aria-label="Streak and experience">
      <div class="streak-card">
        <span class="streak-icon"><i data-lucide="flame"></i></span>
        <div>
          <p class="eyebrow">Study streak</p>
          <strong>${state.streak.current} day${state.streak.current === 1 ? "" : "s"}</strong>
          <small>${state.streak.current ? `Longest run: ${state.streak.longest} days` : "Complete anything today to start a streak."}</small>
        </div>
      </div>
      <div class="streak-card xp-card">
        <span class="streak-icon xp"><i data-lucide="zap"></i></span>
        <div>
          <p class="eyebrow">Experience</p>
          <strong>${state.xp.total} XP</strong>
          <small>Level ${progress.level} · ${progress.into} / ${progress.span} to level ${progress.level + 1}</small>
          <div class="progress-track xp-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div>
        </div>
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
  const running = Boolean(focusInterval);
  return `
    ${pageHead("Focus mode", "One task, one timer and no extra noise.")}
    <section class="focus-wrap">
      <div>
        <p class="eyebrow">Focus session</p>
        <div class="timer-display" id="timerDisplay">${formatTime(focusRemaining)}</div>
        <p class="timer-copy">${state.focusMinutes}-minute revision block · ${state.focusSessions} session${state.focusSessions === 1 ? "" : "s"} completed · +${XP_REWARDS.focus} XP each</p>

        <div class="duration-picker" role="group" aria-label="Session length">
          ${FOCUS_PRESETS.map((minutes) => `<button class="duration-chip ${state.focusMinutes === minutes ? "selected" : ""}" type="button" data-action="set-focus-minutes" data-minutes="${minutes}" ${running ? "disabled" : ""}>${minutes}m</button>`).join("")}
          <button class="duration-chip ${FOCUS_PRESETS.includes(state.focusMinutes) ? "" : "selected"}" type="button" data-action="custom-focus-minutes" ${running ? "disabled" : ""}>
            ${FOCUS_PRESETS.includes(state.focusMinutes) ? "Custom" : `${state.focusMinutes}m`}
          </button>
        </div>
        ${running ? `<p class="field-hint">Pause or reset the timer to change the length.</p>` : ""}

        <div class="timer-actions">
          <button class="button" type="button" id="toggleTimer"><i data-lucide="${running ? "pause" : "play"}"></i>${running ? "Pause" : "Start"}</button>
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

/* ---------------------------------------------------------------------------
 * Study — friends and challenges
 * ------------------------------------------------------------------------ */

function renderFriends() {
  return `
    ${pageHead("Friends", "Add classmates with their friend code to compare progress and set challenges.")}
    <section class="dashboard-row">
      <div class="panel">
        <div class="panel-title"><h2>Your friend code</h2></div>
        <p class="settings-copy">Share this code so classmates can add you.</p>
        <div class="code-display"><code id="friendCodeValue">${escapeHTML(currentUser.friendCode || "······")}</code><button class="button-secondary" type="button" data-action="copy-friend-code"><i data-lucide="copy"></i>Copy</button></div>
        <form class="form-grid" data-friend-form style="margin-top:1.25rem">
          <label class="field-label">Add a friend by code<input class="field" name="code" maxlength="6" placeholder="A1B2C3" required /></label>
          <button class="button" type="submit"><i data-lucide="user-round-plus"></i>Add friend</button>
        </form>
      </div>
      <div class="panel">
        <div class="panel-title"><h2>Your friends</h2><span class="badge">${remoteData.friends ? remoteData.friends.length : "—"}</span></div>
        <div id="friendsPanel">${friendsMarkup(remoteData.friends)}</div>
      </div>
    </section>`;
}

function friendsMarkup(friends) {
  if (!friends) return emptyState("loader-circle", "Loading friends", "Fetching your list.");
  if (!friends.length) return emptyState("user-round-plus", "No friends yet", "Add a classmate with their six-character friend code.");
  return `<div class="insight-list">${friends.map((friend) => `
    <div class="insight-row">
      <span><strong>${escapeHTML(friend.name)}</strong><small>${friend.points} pts · ${friend.xp} XP · ${friend.streak}-day streak</small></span>
      <div class="card-actions"><button class="icon-button" type="button" data-action="remove-friend" data-id="${friend.id}" aria-label="Remove ${escapeHTML(friend.name)}"><i data-lucide="user-round-minus"></i></button></div>
    </div>`).join("")}</div>`;
}

function renderChallenges() {
  return `
    ${pageHead("Challenges", "Set a shared target with friends and track who is closest to it.")}
    <section class="dashboard-row">
      <form class="panel form-grid" data-challenge-form>
        <div class="panel-title"><h2>New challenge</h2></div>
        <label class="field-label">Challenge name<input class="field" name="title" placeholder="e.g. Half-term push" required /></label>
        <div class="form-grid two">
          <label class="field-label">Measure<select class="select" name="metric"><option value="xp">XP earned</option><option value="tasks">Tasks completed</option><option value="focus">Focus sessions</option><option value="quizzes">Quiz attempts</option></select></label>
          <label class="field-label">Target<input class="field" type="number" name="target" min="1" value="500" required /></label>
        </div>
        <label class="field-label">Runs for<select class="select" name="days"><option value="3">3 days</option><option value="7" selected>1 week</option><option value="14">2 weeks</option><option value="30">1 month</option></select></label>
        <button class="button" type="submit"><i data-lucide="swords"></i>Create challenge</button>
      </form>
      <div class="panel">
        <div class="panel-title"><h2>Open to join</h2></div>
        <p class="settings-copy">Challenges your friends have started.</p>
        <div id="openChallengesPanel">${openChallengesMarkup(remoteData.openChallenges)}</div>
      </div>
    </section>
    <div class="section-head"><h2>Your challenges</h2></div>
    <section id="challengesPanel">${challengesMarkup(remoteData.challenges)}</section>`;
}

const CHALLENGE_METRICS = { xp: "XP", tasks: "tasks", focus: "focus sessions", quizzes: "quiz attempts" };

function challengesMarkup(items) {
  if (!items) return emptyState("loader-circle", "Loading challenges", "Checking what you have joined.");
  if (!items.length) return emptyState("swords", "No challenges yet", "Create one and your friends can join it.");
  return `<div class="content-grid">${items.map((item) => {
    const you = item.standings.find((entry) => entry.current);
    const percent = Math.min(100, Math.round(((you?.value || 0) / item.target) * 100));
    return `<article class="panel">
      <div class="card-topline"><h3>${escapeHTML(item.title)}</h3><span class="badge indigo">${item.target} ${escapeHTML(CHALLENGE_METRICS[item.metric] || item.metric)}</span></div>
      <p>Ends ${escapeHTML(formatDateTime(item.endsAt))} · ${item.members} taking part</p>
      <div class="paper-progress"><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><strong>${percent}%</strong></div>
      <div class="leaderboard-list">${item.standings.map((entry, index) => `<div class="leaderboard-row ${entry.current ? "current" : ""}"><span class="leaderboard-rank">${index + 1}</span><strong>${escapeHTML(entry.name)}${entry.current ? " (you)" : ""}</strong><span>${entry.value}</span></div>`).join("")}</div>
      <div class="card-actions"><button class="button-secondary" type="button" data-action="leave-challenge" data-id="${item.id}"><i data-lucide="log-out"></i>Leave</button></div>
    </article>`;
  }).join("")}</div>`;
}

function openChallengesMarkup(items) {
  if (!items) return emptyState("loader-circle", "Loading", "Checking for friend challenges.");
  if (!items.length) return emptyState("users-round", "Nothing open", "When a friend starts a challenge it appears here.");
  return `<div class="insight-list">${items.map((item) => `
    <div class="insight-row">
      <span><strong>${escapeHTML(item.title)}</strong><small>${item.target} ${escapeHTML(CHALLENGE_METRICS[item.metric] || item.metric)} · ${item.members} taking part</small></span>
      <div class="card-actions"><button class="button-secondary" type="button" data-action="join-challenge" data-id="${item.id}">Join</button></div>
    </div>`).join("")}</div>`;
}

/* ---------------------------------------------------------------------------
 * Career
 * ------------------------------------------------------------------------ */

function renderExtracurriculars() {
  const totalHours = state.extracurriculars.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  return `
    ${pageHead("Extracurriculars", "Record clubs, teams, volunteering and leadership roles while you remember the detail.")}
    <section class="stats-grid">
      <div class="stat-card"><span>Activities</span><strong>${state.extracurriculars.length}</strong></div>
      <div class="stat-card"><span>Logged hours</span><strong>${totalHours}</strong></div>
      <div class="stat-card"><span>Leadership roles</span><strong>${state.extracurriculars.filter((item) => item.leadership).length}</strong></div>
      <div class="stat-card"><span>On your CV</span><strong>${state.cv.experience.length}</strong></div>
    </section>
    <section class="dashboard-row">
      <form class="panel form-grid" data-collection-form="extracurriculars">
        <div class="panel-title"><h2>Add activity</h2></div>
        <label class="field-label">Activity<input class="field" name="title" placeholder="e.g. Debate Society" required /></label>
        <label class="field-label">Your role<input class="field" name="role" placeholder="e.g. Team captain" required /></label>
        <div class="form-grid two">
          <label class="field-label">Category<select class="select" name="category"><option>Sport</option><option>Music &amp; arts</option><option>Volunteering</option><option>Academic club</option><option>Leadership</option><option>Work</option><option>Other</option></select></label>
          <label class="field-label">Hours so far<input class="field" type="number" name="hours" min="0" value="0" /></label>
        </div>
        <label class="field-label">What you did<textarea class="textarea" name="details" placeholder="A sentence you could reuse on an application."></textarea></label>
        <label class="checkbox-row"><input type="checkbox" name="leadership" /><span>This is a leadership position</span></label>
        <button class="button" type="submit"><i data-lucide="plus"></i>Add activity</button>
      </form>
      <div class="panel">
        <div class="panel-title"><h2>Your activities</h2><span class="badge">${state.extracurriculars.length}</span></div>
        ${state.extracurriculars.length ? `<div class="insight-list">${state.extracurriculars.map((item) => `
          <div class="insight-row">
            <span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.role)} · ${escapeHTML(item.category || "Other")} · ${Number(item.hours) || 0}h${item.leadership ? " · leadership" : ""}</small></span>
            <div class="card-actions">
              <button class="icon-button" type="button" data-action="cv-add-activity" data-id="${item.id}" aria-label="Add to CV" title="Add to CV"><i data-lucide="file-plus"></i></button>
              ${item.details ? `<button class="icon-button" type="button" data-action="view-collection-item" data-collection="extracurriculars" data-id="${item.id}" aria-label="Open ${escapeHTML(item.title)}"><i data-lucide="eye"></i></button>` : ""}
              <button class="icon-button" type="button" data-action="delete-collection-item" data-collection="extracurriculars" data-id="${item.id}" aria-label="Delete ${escapeHTML(item.title)}"><i data-lucide="trash-2"></i></button>
            </div>
          </div>`).join("")}</div>` : emptyState("drama", "Nothing logged yet", "Add a club, team, role or volunteering commitment.")}
      </div>
    </section>`;
}

function renderCvBuilder() {
  const cv = state.cv;
  const sections = [
    { key: "education", title: "Education", icon: "graduation-cap", fields: ["Institution", "Qualification", "Dates"] },
    { key: "experience", title: "Experience & activities", icon: "briefcase-business", fields: ["Organisation", "Role", "Dates"] },
    { key: "achievements", title: "Achievements", icon: "award", fields: ["Achievement", "Detail", "Year"] }
  ];
  return `
    ${pageHead("CV builder", "Build a clean one-page CV from your school record, activities and work experience.", `<button class="button" type="button" data-action="preview-cv"><i data-lucide="eye"></i>Preview CV</button>`)}
    <section class="dashboard-row">
      <form class="panel form-grid" id="cvHeaderForm">
        <div class="panel-title"><h2>Header</h2></div>
        <label class="field-label">Headline<input class="field" name="headline" value="${escapeHTML(cv.headline)}" placeholder="e.g. Year 12 student — aspiring engineer" /></label>
        <label class="field-label">Personal statement<textarea class="textarea textarea-large" name="summary" placeholder="Three or four sentences on who you are and what you are aiming for.">${escapeHTML(cv.summary)}</textarea></label>
        <button class="button" type="submit"><i data-lucide="save"></i>Save header</button>
      </form>
      <div class="panel">
        <div class="panel-title"><h2>Skills</h2><span class="badge">${cv.skills.length}</span></div>
        <form class="form-grid" data-cv-skill-form>
          <label class="field-label">Add a skill<span class="inline-add"><input class="field" name="skill" placeholder="e.g. Public speaking" required /><button class="button-secondary" type="submit"><i data-lucide="plus"></i>Add</button></span></label>
        </form>
        <div class="subject-picker" style="margin-top:1rem">
          ${cv.skills.length ? cv.skills.map((skill, index) => `<span class="subject-chip selected">${escapeHTML(skill)}<button class="chip-remove" type="button" data-action="cv-remove-skill" data-index="${index}" aria-label="Remove ${escapeHTML(skill)}">&times;</button></span>`).join("") : `<p class="settings-copy">No skills added yet.</p>`}
        </div>
      </div>
    </section>
    ${sections.map((section) => `
      <div class="section-head"><h2>${section.title}</h2><button class="button-secondary" type="button" data-action="cv-add-entry" data-section="${section.key}"><i data-lucide="plus"></i>Add entry</button></div>
      <section class="panel">
        ${cv[section.key].length ? `<div class="insight-list">${cv[section.key].map((entry) => `
          <div class="insight-row">
            <span><strong>${escapeHTML(entry.primary)}</strong><small>${escapeHTML([entry.secondary, entry.dates].filter(Boolean).join(" · "))}</small></span>
            <div class="card-actions"><button class="icon-button" type="button" data-action="cv-remove-entry" data-section="${section.key}" data-id="${entry.id}" aria-label="Remove ${escapeHTML(entry.primary)}"><i data-lucide="trash-2"></i></button></div>
          </div>`).join("")}</div>` : emptyState(section.icon, `No ${section.title.toLowerCase()} yet`, `Use Add entry to build this section.`)}
      </section>`).join("")}`;
}

function cvDocumentMarkup() {
  const cv = state.cv;
  const profile = state.profile;
  const block = (title, entries) => entries.length ? `
    <section class="cv-section"><h3>${title}</h3>${entries.map((entry) => `
      <div class="cv-entry"><strong>${escapeHTML(entry.primary)}</strong><span>${escapeHTML([entry.secondary, entry.dates].filter(Boolean).join(" · "))}</span></div>`).join("")}</section>` : "";
  return `
    <article class="cv-document">
      <header>
        <h2>${escapeHTML(`${profile.firstName} ${profile.lastName}`.trim() || profile.name || "Your name")}</h2>
        <p>${escapeHTML([cv.headline, profile.school, profile.email].filter(Boolean).join(" · "))}</p>
      </header>
      ${cv.summary ? `<section class="cv-section"><h3>Personal statement</h3><p>${escapeHTML(cv.summary)}</p></section>` : ""}
      ${block("Education", cv.education)}
      ${block("Experience &amp; activities", cv.experience)}
      ${block("Achievements", cv.achievements)}
      ${cv.skills.length ? `<section class="cv-section"><h3>Skills</h3><p>${escapeHTML(cv.skills.join(" · "))}</p></section>` : ""}
      ${profile.subjects.length ? `<section class="cv-section"><h3>Subjects</h3><p>${escapeHTML(profile.subjects.join(" · "))}</p></section>` : ""}
    </article>`;
}

function renderSettings() {
  const profile = state.profile;
  const subscription = state.subscription;
  const roles = currentUser.roles || ["student"];
  const themes = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "monitor" }
  ];
  const notificationRows = [
    { key: "study", title: "Study notifications", copy: "Reminders for planned sessions and due tasks." },
    { key: "progress", title: "Progress updates", copy: "Weekly summaries of quiz and paper performance." },
    { key: "content", title: "New content alerts", copy: "Tell me when new resources and papers are added." },
    { key: "achievements", title: "Achievement notifications", copy: "Streak milestones, levels and challenge results." }
  ];
  const legalLinks = [
    { key: "terms", title: "Terms and conditions", icon: "scroll-text" },
    { key: "privacy", title: "Privacy policy", icon: "shield-check" },
    { key: "refund", title: "Refund policy", icon: "receipt" }
  ];

  return `
    ${pageHead("Settings", "Manage your profile, notifications, privacy and subscription.")}

    <section class="settings-stack">
      <form class="panel form-grid" id="settingsForm">
        <div class="panel-title"><h2><i data-lucide="user-round"></i>Profile</h2></div>
        <div class="form-grid two">
          <label class="field-label">First name<input class="field" name="firstName" value="${escapeHTML(profile.firstName)}" required /></label>
          <label class="field-label">Last name<input class="field" name="lastName" value="${escapeHTML(profile.lastName)}" /></label>
        </div>
        <label class="field-label">Email address<input class="field" type="email" name="email" value="${escapeHTML(profile.email)}" readonly /></label>
        <label class="field-label">School or college<input class="field" name="school" value="${escapeHTML(profile.school)}" placeholder="e.g. Northgate High School" /></label>
        <div class="form-grid two">
          <label class="field-label">Year or grade<select class="select" name="year">${["", ...YEAR_GROUPS].map((item) => `<option value="${escapeHTML(item)}" ${profile.year === item ? "selected" : ""}>${item || "Select…"}</option>`).join("")}</select></label>
          <label class="field-label">Qualification<select class="select" name="curriculum">${["", ...CURRICULA].map((item) => `<option value="${escapeHTML(item)}" ${profile.curriculum === item ? "selected" : ""}>${item || "Select…"}</option>`).join("")}</select></label>
        </div>
        <div class="form-grid two">
          <label class="field-label">Exam year<input class="field" name="examYear" inputmode="numeric" value="${escapeHTML(profile.examYear)}" /></label>
          <label class="field-label">Daily goal (minutes)<input class="field" type="number" name="dailyGoal" min="10" max="240" value="${profile.dailyGoal}" required /></label>
        </div>
        <div class="field-label">
          <span class="field-label-text">Subjects</span>
          <div class="subject-picker" style="margin-top:0.5rem">
            ${profile.subjects.length ? profile.subjects.map((subject, index) => `<span class="subject-chip selected">${escapeHTML(subject)}<button class="chip-remove" type="button" data-action="remove-subject" data-index="${index}" aria-label="Remove ${escapeHTML(subject)}">&times;</button></span>`).join("") : `<p class="settings-copy">No subjects selected.</p>`}
          </div>
          <span class="inline-add" style="margin-top:0.75rem">
            <input class="field" id="settingsSubject" placeholder="Add a subject" />
            <button class="button-secondary" type="button" data-action="add-subject"><i data-lucide="plus"></i>Add</button>
          </span>
        </div>
        <div class="form-actions"><button class="button" type="submit"><i data-lucide="save"></i>Save profile</button></div>
      </form>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="palette"></i>Appearance</h2></div>
        <p class="settings-copy">Choose how Revizely looks. System follows your device setting.</p>
        <div class="choice-grid" style="margin-top:1rem">
          ${themes.map((theme) => `<button class="choice-card ${state.preferences.theme === theme.value ? "selected" : ""}" type="button" data-action="set-theme" data-theme="${theme.value}"><i data-lucide="${theme.icon}"></i><span>${theme.label}</span></button>`).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="bell"></i>Notifications</h2></div>
        <div class="toggle-list">
          ${notificationRows.map((row) => `
            <div class="toggle-row">
              <span><strong>${row.title}</strong><small>${row.copy}</small></span>
              <label class="switch"><input type="checkbox" data-notification="${row.key}" ${state.notifications[row.key] ? "checked" : ""} /><span class="switch-track"></span><span class="sr-only">${row.title}</span></label>
            </div>`).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="sparkles"></i>AI features</h2></div>
        <div class="toggle-list">
          <div class="toggle-row">
            <span><strong>Enable AI tools</strong><small>Turns the AI tutor, solver, examiner and generators on or off across the workspace.</small></span>
            <label class="switch"><input type="checkbox" data-preference="aiEnabled" ${state.preferences.aiEnabled ? "checked" : ""} /><span class="switch-track"></span><span class="sr-only">Enable AI tools</span></label>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="credit-card"></i>Subscription</h2><span class="badge ${subscription.status === "active" ? "indigo" : ""}">${subscription.status === "active" ? "Premium" : "Free plan"}</span></div>
        <p class="settings-copy">${subscription.status === "active"
          ? `You are on the ${escapeHTML(subscription.plan || "premium")} plan${subscription.currentPeriodEnd ? `, renewing ${escapeHTML(subscription.currentPeriodEnd)}` : ""}.`
          : "You are on the free plan. Premium unlocks the full set of AI study tools."}</p>
        <div class="form-actions">
          ${subscription.status === "active"
            ? `<button class="button-danger" type="button" data-action="cancel-subscription"><i data-lucide="x-circle"></i>Cancel subscription</button>`
            : `<button class="button" type="button" data-route-button="premium"><i data-lucide="crown"></i>See premium plans</button>`}
        </div>
      </section>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="scale"></i>Legal</h2></div>
        <div class="link-list">
          ${legalLinks.map((link) => `<button class="link-row" type="button" data-action="legal" data-doc="${link.key}"><i data-lucide="${link.icon}"></i><span>${link.title}</span><i data-lucide="chevron-right"></i></button>`).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-title"><h2><i data-lucide="id-card"></i>Roles and portals</h2></div>
        <p class="settings-copy">Your account roles: ${roles.map((role) => `<span class="badge">${escapeHTML(role)}</span>`).join(" ")}</p>
        <div class="link-list" style="margin-top:1rem">
          ${roles.includes("creator")
            ? `<button class="link-row" type="button" data-route-button="creator-portal"><i data-lucide="pen-tool"></i><span>Creator dashboard</span><i data-lucide="chevron-right"></i></button>`
            : `<div class="link-row muted"><i data-lucide="lock"></i><span>Creator dashboard — not enabled for this account</span></div>`}
          ${roles.includes("admin")
            ? `<button class="link-row" type="button" data-route-button="admin-portal"><i data-lucide="shield"></i><span>Admin dashboard</span><i data-lucide="chevron-right"></i></button>`
            : `<div class="link-row muted"><i data-lucide="lock"></i><span>Admin dashboard — not enabled for this account</span></div>`}
        </div>
      </section>

      <section class="panel danger-panel">
        <div class="panel-title"><h2><i data-lucide="triangle-alert"></i>Privacy</h2></div>
        <p class="settings-copy">Reset clears your workspace but keeps your account. Deleting removes your account, workspace, friends and challenge history permanently.</p>
        <div class="form-actions">
          <button class="button-secondary" type="button" data-action="reset-workspace"><i data-lucide="rotate-ccw"></i>Reset workspace</button>
          <button class="button-secondary" type="button" data-action="signout"><i data-lucide="log-out"></i>Log out</button>
          <button class="button-danger" type="button" data-action="delete-account"><i data-lucide="trash-2"></i>Delete account</button>
        </div>
      </section>
    </section>`;
}

const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms and conditions",
    body: `1. About us and these terms

1.1 These Terms and Conditions ("Terms") govern your access to and use of the REVIZELY website, web application and related services located at www.revizely.ai (the "Website") and any content, materials, products or services offered through it (together, the "Services").

1.2 The Website is operated by REVIZELY LTD, a company registered in the United Kingdom with company number 17046803 and registered office at 61 Bridge Street, Kington, HR5 3DJ ("REVIZELY", "we", "us", "our").

1.3 By accessing or using the Website or Services, you agree to be bound by these Terms. If you do not agree, you must not use the Website or Services.

1.4 We may revise these Terms from time to time. The latest version will always be available on the Website and will apply from the date of publication. If you continue to use the Website after changes are posted, you will be deemed to have accepted the updated Terms.

2. Eligibility and accounts

2.1 You must be at least 13 years old, or have the consent of a parent or legal guardian, to create an account and use the Services.

2.2 When you create an account, you must provide accurate, current and complete information and keep this information up to date.

2.3 You are responsible for maintaining the confidentiality of your login details (including username and password) and for all activities that occur under your account. You must not share your account details with anyone else.

2.4 We reserve the right to suspend, restrict or terminate any account at any time if, in our reasonable opinion, you have breached these Terms, created risk or possible legal exposure for us, or for any other reasonable business purpose.

3. Subscription services and payments

3.1 Certain content and features on REVIZELY are available only to paying subscribers ("Subscription"). Details of Subscription plans, pricing and term lengths are described on the Website from time to time.

3.2 By starting a Subscription, you authorise us and our third-party payment processors (including Wise and Stripe) to charge you the Subscription fee and any applicable taxes at the rate notified to you at the time of purchase.

3.3 Unless otherwise stated, Subscriptions are provided on a recurring basis (e.g. monthly, termly, annually) and will automatically renew at the end of each billing period, using the payment method you provided, until you cancel.

3.4 You can cancel your Subscription at any time via your account settings or by contacting us at hello@revizely.ai. Cancellation will take effect at the end of your current billing period, and you will retain access to paid features until that date. We do not provide pro-rated refunds for unused periods unless required by applicable law or explicitly stated otherwise in writing.

3.5 We may change our Subscription prices or structure from time to time. Any changes will take effect at the start of your next billing period and we will give you reasonable prior notice where required. If you do not agree to the change, you may cancel your Subscription before the new price takes effect.

3.6 You are responsible for ensuring that your payment information is correct and that you have sufficient funds or credit available. If payment is not successfully processed, we may suspend or terminate your Subscription and/or account.

4. Use of the Website and Services

4.1 The Website and Services are provided for personal, non-commercial use for educational and revision purposes only, unless we expressly agree otherwise in writing.

4.2 You agree that you will not:
- Use the Website for any unlawful purpose or in breach of any applicable local, national or international law or regulation.
- Copy, reproduce, distribute, sell, resell, or exploit any part of the Website or its content for commercial purposes without our prior written consent.
- Attempt to circumvent or bypass any access or usage restrictions or security measures on the Website.
- Upload, post or transmit any content that is unlawful, defamatory, obscene, harassing, discriminatory, infringing or otherwise objectionable.
- Use any automated system, including "bots," "scrapers" or similar technologies, to access the Website without our prior written permission, except for bona fide search engine indexing.

4.3 We may monitor use of the Website and remove or disable access to any content that we reasonably believe breaches these Terms or applicable law.

5. Intellectual property

5.1 All content on the Website, including (without limitation) text, questions, model answers, explanations, diagrams, videos, images, graphics, logos, icons, user interface design and software code, is owned by or licensed to REVIZELY and is protected by copyright, trade marks and other intellectual property rights.

5.2 Subject to your compliance with these Terms and payment of any applicable Subscription fees, we grant you a limited, non-exclusive, non-transferable, revocable licence to access and use the Website and Services for your own personal, non-commercial educational use only.

5.3 You must not:
- Copy, reproduce, modify, adapt, translate, create derivative works of, distribute, transmit, sell, lease, or otherwise exploit the content or any part of the Website, except as expressly permitted in these Terms.
- Remove, alter or obscure any copyright, trade mark or other proprietary rights notices on the Website or in any of its content.

5.4 All trade marks, logos and trade names displayed on the Website (including "REVIZELY" and any related marks) are the property of REVIZELY or their respective owners. You may not use these marks without our prior written consent.

6. User-generated content

6.1 You may be able to submit, upload, post or otherwise share content on or through the Website (for example, comments, questions, answers, notes or other materials) ("User Content").

6.2 You remain the owner of any intellectual property rights you hold in your User Content. However, by submitting User Content, you grant REVIZELY a worldwide, non-exclusive, royalty-free, transferable, sub-licensable licence to use, host, store, reproduce, modify, create derivative works of, communicate, publish, publicly display and distribute your User Content in connection with operating, improving and promoting the Website and Services.

6.3 You are solely responsible for your User Content and for ensuring that it:
- Is accurate and not misleading.
- Does not infringe any copyright, trade mark, moral right, privacy, data protection or other rights of any third party.
- Is lawful and not defamatory, obscene, harassing, hateful, discriminatory or otherwise objectionable.

6.4 We may remove or disable access to any User Content at any time, without notice, if we reasonably believe it breaches these Terms or applicable law.

7. No guarantee of exam results

7.1 REVIZELY provides revision resources, practice questions, model answers, explanations and related content for educational support only.

7.2 We do not guarantee that use of the Website or Services will result in any particular exam grade, academic outcome, admission to an institution, or other result.

7.3 You remain responsible for your own learning, exam preparation and performance, including checking that any materials are suitable for your specific exam board, syllabus and year.

8. Availability, changes and suspension

8.1 We do not guarantee that the Website or any content will always be available or uninterrupted. We may suspend, withdraw or restrict the availability of all or any part of the Website for business or operational reasons.

8.2 We may update or change the Website, the Services or any content at any time, for example to reflect changes to our users' needs, exam specifications, or our business priorities.

8.3 We will try to give you reasonable notice of any significant changes that materially affect your existing Subscription, where practicable.

9. Disclaimers

9.1 The Website and Services are provided on an "as is" and "as available" basis and are intended for general information and educational purposes only.

9.2 To the fullest extent permitted by law, we disclaim all warranties, representations or conditions, whether express or implied, including (without limitation) implied warranties of satisfactory quality, fitness for a particular purpose, accuracy, completeness and non-infringement.

9.3 While we take reasonable steps to ensure that content is accurate and up to date, we do not warrant that any content is complete, current or error-free, or that it will always reflect the latest exam specifications or mark schemes.

10. Limitation of liability

10.1 Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law, including liability for death or personal injury caused by our negligence, or for fraud or fraudulent misrepresentation.

10.2 Subject to clause 10.1, we shall not be liable to you, whether in contract, tort (including negligence), breach of statutory duty, or otherwise, arising out of or in connection with these Terms, for:
- Any loss of profits, loss of revenue, loss of anticipated savings, loss of business or loss of opportunity.
- Any loss of data, corruption of data, or loss of goodwill or reputation.
- Any indirect or consequential loss or damage.

10.3 Subject to clause 10.1, our total aggregate liability to you in respect of all losses arising under or in connection with your use of the Website and Services shall in no circumstances exceed the greater of (a) the total amount you have paid to us in Subscription fees in the twelve (12) months preceding the event giving rise to the claim, and (b) £100.

10.4 You are responsible for ensuring that your devices and software are compatible with the Website and for implementing appropriate security measures (such as anti-virus software and secure passwords).

11. Indemnity

11.1 You agree to indemnify and hold harmless REVIZELY, its directors, officers, employees and contractors from and against any and all claims, liabilities, damages, losses, costs and expenses (including reasonable legal fees) arising out of or in connection with:
- Your breach of these Terms.
- Your use of the Website or Services.
- Your User Content.

12. Third-party links and services

12.1 The Website may contain links to third-party websites or services that are not owned or controlled by us.

12.2 We have no control over, and assume no responsibility for, the content, privacy policies or practices of any third-party websites or services. You access any third-party sites at your own risk.

13. Termination

13.1 We may suspend or terminate your access to the Website or any part of the Services at any time if you materially breach these Terms, misuse the Website, or if required to do so by law or regulatory authority.

13.2 Upon termination, your right to use the Services will immediately cease. Any provisions of these Terms which by their nature should reasonably survive termination shall survive, including but not limited to clauses relating to intellectual property, liability, indemnity and governing law.

14. Governing law and jurisdiction

14.1 These Terms, their subject matter and their formation are governed by the laws of England and Wales.

14.2 You and we agree that the courts of England and Wales shall have exclusive jurisdiction to resolve any dispute or claim arising out of or in connection with these Terms or your use of the Website, except that if you are a consumer resident in another part of the UK, you may bring proceedings in your local courts as required by consumer law.

15. Contact us

15.1 If you have any questions about these Terms, please contact us at:
Email: hello@revizely.ai
Postal address: 61 Bridge Street, Kington, HR5 3DJ`
  },
  privacy: {
    title: "Privacy policy",
    body: `We store the account details you give us — your name, email address, school, year group and subjects — together with the study data you create in your workspace.

Study data is used to power your workspace features: progress analytics, streaks, XP, leaderboards and the resources you save. Friends and classmates can see only your display name, points, XP and streak.

Questions you send to the AI tools are passed to our AI provider to generate a response. Do not include personal details about yourself or anyone else in those questions.

You can delete your account at any time from Settings. Deletion removes your workspace, friend links and challenge history.`
  },
  refund: {
    title: "Refund policy",
    body: `Digital Services Refund Policy
Revizely.ai provides digital subscription services

Since Revizely.ai is a digital service providing access to online study tools and features, we operate under specific refund policies designed for digital products.

Premium Subscription Refunds

14-Day Cooling-Off Period
Under UK consumer law, you may cancel within 14 days of each purchase or renewal and receive a full refund. After that period, you can still cancel from Settings, but premium access continues until the end of your billing period and no refund is issued.

How to Cancel or Request a Refund
Go to Settings → Subscription to cancel premium. If you are within the 14-day cooling-off period, a full refund is processed automatically when you cancel. Refunds typically appear within 5–10 business days on your original payment method.

Cancellation Policy
You may cancel your Premium subscription at any time from your account settings. Cancellation will take effect at the end of your current billing period. You will continue to have access to Premium features until the end of your paid period.

Important: Cancelling your subscription does not automatically entitle you to a refund for the current billing period. Refunds are only available within the 14-day money-back guarantee period for new subscriptions.`
  }
};

function renderCreatorPortal() {
  const resources = [...state.generatedResources, ...state.predictedPapers];
  return `
    ${pageHead("Creator dashboard", "Review the learning material you have produced and saved into Revizely.")}
    <section class="stats-grid">
      <div class="stat-card"><span>Saved resources</span><strong>${resources.length}</strong></div>
      <div class="stat-card"><span>Practice papers</span><strong>${state.predictedPapers.length}</strong></div>
      <div class="stat-card"><span>Quizzes authored</span><strong>${state.quizzes.length}</strong></div>
      <div class="stat-card"><span>Notes written</span><strong>${state.notes.length}</strong></div>
    </section>
    <div class="section-head"><h2>Recent output</h2></div>
    <section class="panel">
      ${resources.length ? `<div class="insight-list">${resources.slice(0, 12).map((item) => `<div class="insight-row"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(String(item.type).replaceAll("-", " "))} · ${escapeHTML(item.createdAt)}</small></span><div class="card-actions"><button class="icon-button" type="button" data-action="view-resource" data-id="${item.id}" aria-label="Open ${escapeHTML(item.title)}"><i data-lucide="eye"></i></button></div></div>`).join("")}</div>` : emptyState("pen-tool", "Nothing created yet", "Generate a resource from any AI tool and save it.")}
    </section>`;
}

function renderAdminPortal() {
  const entries = remoteData.leaderboard;
  return `
    ${pageHead("Admin dashboard", "Service-wide activity for the accounts on this Revizely instance.")}
    <section class="stats-grid">
      <div class="stat-card"><span>Ranked students</span><strong>${entries ? entries.length : "—"}</strong></div>
      <div class="stat-card"><span>Total points</span><strong>${entries ? entries.reduce((sum, entry) => sum + entry.points, 0) : "—"}</strong></div>
      <div class="stat-card"><span>Total XP</span><strong>${entries ? entries.reduce((sum, entry) => sum + (entry.xp || 0), 0) : "—"}</strong></div>
      <div class="stat-card"><span>Longest streak</span><strong>${entries && entries.length ? Math.max(...entries.map((entry) => entry.streak || 0)) : "—"}</strong></div>
    </section>
    <div class="section-head"><h2>Accounts by activity</h2></div>
    <section class="panel" id="leaderboardPanel">
      ${entries ? `<div class="insight-list">${entries.map((entry, index) => `<div class="insight-row"><span><strong>${index + 1}. ${escapeHTML(entry.name)}${entry.current ? " (you)" : ""}</strong><small>${entry.points} pts · ${entry.xp || 0} XP · ${entry.streak || 0}-day streak</small></span></div>`).join("")}</div>` : emptyState("loader-circle", "Loading accounts", "Fetching service activity.")}
      <p class="settings-copy" style="margin-top:1rem">Data is held in memory by this server instance and resets when it restarts.</p>
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

  if (route === "settings") {
    view.querySelectorAll("[data-notification]").forEach((input) => input.addEventListener("change", () => {
      state.notifications[input.dataset.notification] = input.checked;
      saveState();
      showToast(input.checked ? "Notification enabled." : "Notification disabled.");
    }));
    view.querySelectorAll("[data-preference]").forEach((input) => input.addEventListener("change", () => {
      state.preferences[input.dataset.preference] = input.checked;
      saveState();
      showToast(input.checked ? "AI features enabled." : "AI features disabled.");
    }));
  }

  if (route === "cv-builder") {
    document.getElementById("cvHeaderForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      state.cv.headline = String(data.headline || "").trim();
      state.cv.summary = String(data.summary || "").trim();
      saveState();
      showToast("CV header saved.");
    });
    const skillForm = view.querySelector("[data-cv-skill-form]");
    if (skillForm) skillForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = String(new FormData(event.currentTarget).get("skill") || "").trim();
      if (!value) return;
      if (!state.cv.skills.includes(value)) state.cv.skills.push(value);
      saveState();
      render();
    });
  }

  const friendForm = view.querySelector("[data-friend-form]");
  if (friendForm) friendForm.addEventListener("submit", submitFriendForm);

  const challengeForm = view.querySelector("[data-challenge-form]");
  if (challengeForm) challengeForm.addEventListener("submit", submitChallengeForm);

  view.querySelectorAll("[data-collection-form]").forEach((form) => form.addEventListener("submit", submitCollectionItem));
  view.querySelectorAll("[data-class-form]").forEach((form) => form.addEventListener("submit", submitClassForm));
  if (route === "leaderboard" || route === "admin-portal") loadLeaderboard();
  if (route === "competition-classes") loadClasses();
  if (route === "friends") loadFriends();
  if (route === "challenges") loadChallenges();
}

async function submitFriendForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const code = String(new FormData(form).get("code") || "").trim().toUpperCase();
  try {
    const data = await apiRequest("/api/friends", { method: "POST", body: JSON.stringify({ action: "add", code }) });
    remoteData.friends = data.friends;
    form.reset();
    render();
    showToast("Friend added.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitChallengeForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await apiRequest("/api/challenges", {
      method: "POST",
      body: JSON.stringify({ action: "create", title: data.title, metric: data.metric, target: Number(data.target), days: Number(data.days) })
    });
    remoteData.challenges = result.challenges;
    form.reset();
    render();
    showToast("Challenge created.");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadFriends() {
  try {
    const data = await apiRequest("/api/friends");
    remoteData.friends = data.friends;
    if (data.friendCode) currentUser.friendCode = data.friendCode;
    const panel = document.getElementById("friendsPanel");
    if (panel) panel.innerHTML = friendsMarkup(remoteData.friends);
    const code = document.getElementById("friendCodeValue");
    if (code) code.textContent = currentUser.friendCode;
    refreshIcons();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadChallenges() {
  try {
    const [mine, open] = await Promise.all([
      apiRequest("/api/challenges"),
      apiRequest("/api/challenges/open").catch(() => ({ challenges: [] }))
    ]);
    remoteData.challenges = mine.challenges;
    remoteData.openChallenges = open.challenges;
    const panel = document.getElementById("challengesPanel");
    if (panel) panel.innerHTML = challengesMarkup(remoteData.challenges);
    const openPanel = document.getElementById("openChallengesPanel");
    if (openPanel) openPanel.innerHTML = openChallengesMarkup(remoteData.openChallenges);
    refreshIcons();
  } catch (error) {
    showToast(error.message);
  }
}

async function challengeAction(action, id) {
  try {
    const data = await apiRequest("/api/challenges", { method: "POST", body: JSON.stringify({ action, id }) });
    remoteData.challenges = data.challenges;
    remoteData.openChallenges = null;
    render();
    loadChallenges();
  } catch (error) {
    showToast(error.message);
  }
}

async function removeFriend(id) {
  try {
    const data = await apiRequest("/api/friends", { method: "POST", body: JSON.stringify({ action: "remove", id }) });
    remoteData.friends = data.friends;
    render();
    showToast("Friend removed.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitAiTool(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const route = form.dataset.aiForm;
  const action = {
    "homework-solver": "homework-solver", "note-condenser": "note-condenser", "ai-examiner": "examiner", "ai-study-plan": "study-plan",
    "beyond-theory": "beyond-theory", "grade9-studio": "grade9-resource", "model-answers": "model-answer", "predicted-papers": "predicted-paper"
  }[route];
  if (!state.preferences.aiEnabled) {
    showToast("AI features are switched off in Settings.");
    return;
  }
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
  if (type === "extracurriculars") item = {
    id: uid("activity"),
    title: data.title.trim(),
    role: data.role.trim(),
    category: data.category,
    hours: Number(data.hours) || 0,
    details: String(data.details || "").trim(),
    leadership: Boolean(data.leadership),
    createdAt: new Date().toLocaleDateString("en-GB")
  };
  if (!item) return;
  state[type].unshift(item);
  form.reset();

  const xpKind = { extracurriculars: "extracurricular", opportunities: "opportunity" }[type];
  if (xpKind) {
    awardXp(xpKind, item.title);
    await saveQueue;
  } else {
    await saveState();
  }
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
        <h3 style="margin:0;color:var(--app-ink);font-size:1.08rem;font-weight:900;line-height:1.5">${escapeHTML(question.prompt)}</h3>
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
      awardXp("quiz", `${quiz.title} · ${score}/${quiz.questions.length}`);
      await saveQueue;
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

  if (type === "focus-minutes") {
    closeModal();
    setFocusMinutes(data.minutes);
    return;
  }

  if (type === "cv-entry") {
    const section = form.dataset.section;
    state.cv[section] = [...state.cv[section], {
      id: uid("cv"),
      primary: String(data.primary || "").trim(),
      secondary: String(data.secondary || "").trim(),
      dates: String(data.dates || "").trim()
    }];
    showToast("Added to your CV.");
  }

  // Creating study material is itself worth XP; awardXp saves for us.
  const xpKinds = { note: "note", deck: "deck", card: "card", quiz: "quiz", paper: "paper" };
  const xpLabels = { note: "New note", deck: "New deck", card: "New flashcard", quiz: "New quiz", paper: "Paper logged" };
  if (xpKinds[type] && !id) {
    awardXp(xpKinds[type], xpLabels[type]);
  } else {
    saveState();
  }

  closeModal();
  render();
}

function toggleTask(id) {
  const target = state.tasks.find((task) => task.id === id);
  const completing = target && !target.done;
  state.tasks = state.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task);
  // XP is awarded on completion only, and never twice for the same task —
  // `awarded` is read from the pre-update object and persisted on the new one.
  if (completing && !target.awarded) {
    state.tasks = state.tasks.map((task) => task.id === id ? { ...task, awarded: true } : task);
    awardXp("task", target.title);
  } else {
    saveState();
  }
  render();
}

async function sendTutorMessage(text) {
  const question = text.trim();
  if (!question) return;
  if (!state.preferences.aiEnabled) {
    showToast("AI features are switched off in Settings.");
    return;
  }
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
      focusRemaining = state.focusMinutes * 60;
      awardXp("focus", `${state.focusMinutes}-minute focus session`);
      showToast("Focus session complete.");
      render();
    }
  }, 1000);
  render();
}

function setFocusMinutes(minutes) {
  const value = Math.min(Math.max(Math.round(Number(minutes) || 0), 1), 240);
  if (!value) return;
  state.focusMinutes = value;
  clearInterval(focusInterval);
  focusInterval = null;
  focusRemaining = value * 60;
  saveState();
  render();
}

function promptCustomFocusMinutes() {
  openModal("Focus mode", "Custom session length", `
    <form class="form-grid" data-modal-form="focus-minutes">
      <label class="field-label">Minutes<input class="field" type="number" name="minutes" min="1" max="240" value="${state.focusMinutes}" required autofocus /></label>
      <p class="field-hint">Anything from 1 to 240 minutes.</p>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Set length</button></div>
    </form>`);
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
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  state.profile = {
    ...state.profile,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim() || state.profile.name,
    school: String(data.school || "").trim(),
    year: String(data.year || ""),
    curriculum: String(data.curriculum || ""),
    examYear: String(data.examYear || "").trim(),
    dailyGoal: Number(data.dailyGoal) || state.profile.dailyGoal
  };
  saveState();
  showToast("Profile saved.");
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

  if (action.dataset.action === "toggle-theme") cycleTheme();
  if (action.dataset.action === "set-theme") { setTheme(action.dataset.theme); render(); }

  if (action.dataset.action === "set-focus-minutes") setFocusMinutes(action.dataset.minutes);
  if (action.dataset.action === "custom-focus-minutes") promptCustomFocusMinutes();

  if (action.dataset.action === "copy-friend-code") {
    navigator.clipboard.writeText(currentUser.friendCode || "")
      .then(() => showToast("Friend code copied."))
      .catch(() => showToast("Could not copy the code."));
  }
  if (action.dataset.action === "remove-friend" && confirm("Remove this friend?")) removeFriend(id);
  if (action.dataset.action === "join-challenge") challengeAction("join", id);
  if (action.dataset.action === "leave-challenge" && confirm("Leave this challenge?")) challengeAction("leave", id);

  if (action.dataset.action === "add-subject") {
    const input = document.getElementById("settingsSubject");
    const value = input.value.trim();
    if (!value) return;
    if (!state.profile.subjects.includes(value)) state.profile.subjects.push(value);
    saveState();
    render();
  }
  if (action.dataset.action === "remove-subject") {
    state.profile.subjects.splice(Number(action.dataset.index), 1);
    saveState();
    render();
  }

  if (action.dataset.action === "cv-remove-skill") {
    state.cv.skills.splice(Number(action.dataset.index), 1);
    saveState();
    render();
  }
  if (action.dataset.action === "cv-add-entry") cvEntryForm(action.dataset.section);
  if (action.dataset.action === "cv-remove-entry") {
    const section = action.dataset.section;
    state.cv[section] = state.cv[section].filter((entry) => entry.id !== id);
    saveState();
    render();
  }
  if (action.dataset.action === "cv-add-activity") {
    const activity = state.extracurriculars.find((item) => item.id === id);
    if (activity) {
      state.cv.experience = [...state.cv.experience, {
        id: uid("cv"),
        primary: activity.title,
        secondary: activity.role,
        dates: `${Number(activity.hours) || 0} hours`
      }];
      saveState();
      showToast("Added to your CV.");
    }
  }
  if (action.dataset.action === "preview-cv") {
    openModal("CV builder", "CV preview", `${cvDocumentMarkup()}<div class="form-actions"><button class="button-secondary" type="button" data-action="print-cv"><i data-lucide="printer"></i>Print</button><button class="button" type="button" data-close-modal>Done</button></div>`);
  }
  if (action.dataset.action === "print-cv") window.print();

  if (action.dataset.action === "legal") {
    const doc = LEGAL_DOCUMENTS[action.dataset.doc];
    if (doc) openModal("Legal", doc.title, `<div class="ai-output resource-preview">${escapeHTML(doc.body)}</div><div class="form-actions"><button class="button" type="button" data-close-modal>Close</button></div>`);
  }

  if (action.dataset.action === "cancel-subscription" && confirm("Cancel your premium subscription?")) cancelSubscription();
  if (action.dataset.action === "delete-account") deleteAccount();
});

function cvEntryForm(section) {
  const labels = {
    education: { title: "Add education", primary: "Institution", secondary: "Qualification and grades", dates: "Dates" },
    experience: { title: "Add experience", primary: "Organisation", secondary: "Role and responsibilities", dates: "Dates" },
    achievements: { title: "Add achievement", primary: "Achievement", secondary: "Detail", dates: "Year" }
  };
  const copy = labels[section];
  if (!copy) return;
  openModal("CV builder", copy.title, `
    <form class="form-grid" data-modal-form="cv-entry" data-section="${section}">
      <label class="field-label">${copy.primary}<input class="field" name="primary" required /></label>
      <label class="field-label">${copy.secondary}<input class="field" name="secondary" /></label>
      <label class="field-label">${copy.dates}<input class="field" name="dates" placeholder="e.g. 2023 – 2025" /></label>
      <div class="form-actions"><button class="button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Add entry</button></div>
    </form>`);
}

async function cancelSubscription() {
  try {
    const data = await apiRequest("/api/premium/cancel", { method: "POST" });
    state.subscription = data.subscription;
    render();
    showToast("Subscription cancelled.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteAccount() {
  if (!confirm("Delete your account? This permanently removes your workspace, friends and challenge history.")) return;
  if (!confirm("This cannot be undone. Delete your Revizely account for good?")) return;
  try {
    await apiRequest("/api/account", { method: "DELETE" });
    window.location.href = "../public/signup.html";
  } catch (error) {
    showToast(error.message);
  }
}

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
  if (!onboardingLayer.hidden) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n" && currentRoute() === "notes") {
    event.preventDefault();
    noteForm();
  }
});

async function resetWorkspace() {
  try {
    const data = await apiRequest("/api/workspace", { method: "DELETE" });
    state = normaliseWorkspace(data.workspace);
    focusRemaining = state.focusMinutes * 60;
    applyTheme(state.preferences.theme);
    render();
    updateProfileUI();
    updateHeaderMetrics();
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
    const [workspace, catalogue, session] = await Promise.all([
      loadState(),
      loadPremiumCatalogue(),
      apiRequest("/api/session").catch(() => null)
    ]);
    state = workspace;
    premiumCatalogue = catalogue;
    if (session?.user) currentUser = { ...currentUser, ...session.user };
    if (!state) return;

    applyTheme(state.preferences.theme);
    reconcileStreak();
    focusRemaining = state.focusMinutes * 60;
    updateProfileUI();
    updateHeaderMetrics();
    render();
    refreshIcons();

    if (needsOnboarding()) {
      startOnboarding();
    } else if (touchStreak()) {
      // Opening the workspace on a new day keeps the streak alive.
      updateHeaderMetrics();
      saveState();
      if (currentRoute() === "dashboard") render();
    }
  } catch (error) {
    view.innerHTML = `<div class="empty-state"><strong>Workspace unavailable</strong><p>${escapeHTML(error.message)}</p></div>`;
  }
}

// Follow the device when the student has chosen "system".
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state && state.preferences.theme === "system") applyTheme("system");
});

initialise();
