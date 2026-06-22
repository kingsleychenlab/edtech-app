const plans = [
  { type: "weekly", label: "Weekly", price: 0.99, period: "/ week", description: "Cancel anytime", badge: null },
  { type: "monthly", label: "Monthly", price: 3.99, period: "/ month", description: "Save vs weekly", badge: "Popular" },
  { type: "yearly", label: "Yearly", price: 25, period: "/ year", description: "Best value — full year access", badge: "Best Value" }
];

const features = [
  { key: "aiTutor", title: "AI Tutor", description: "Ask follow-up questions and receive clear, age-appropriate explanations.", icon: "bot", route: "tutor", availability: "requires-ai" },
  { key: "homeworkSolver", title: "Homework Solver", description: "Work through homework questions with method, reasoning and key concepts.", icon: "square-function", route: "homework-solver", availability: "requires-ai" },
  { key: "noteCondenser", title: "Note Condenser", description: "Turn long notes into concise summaries, key terms and review questions.", icon: "file-down", route: "note-condenser", availability: "requires-ai" },
  { key: "unlimitedQuizzes", title: "Unlimited Quizzes", description: "Build and complete topic quizzes with instant scoring and saved attempts.", icon: "zap", route: "quizzes", availability: "available" },
  { key: "beyondTheory", title: "Beyond Theory Lessons", description: "Generate applied lessons that connect GCSE knowledge to real situations.", icon: "book-open-check", route: "beyond-theory", availability: "requires-ai" },
  { key: "virtualSessions", title: "Virtual Tutoring Sessions", description: "Plan focused tutoring and collaborative revision sessions.", icon: "users", route: "virtual-sessions", availability: "available" },
  { key: "grade9", title: "Grade 9 Notes & Flashcards", description: "Generate higher-attainment resources for top-mark preparation.", icon: "graduation-cap", route: "grade9-studio", availability: "requires-ai" },
  { key: "aiExaminer", title: "AI Examiner", description: "Mark completed answers and provide personalised feedback against exam criteria.", icon: "scan-text", route: "ai-examiner", availability: "requires-ai" },
  { key: "progress", title: "Progress Analytics", description: "Combine quiz and paper evidence to reveal strengths and weak subjects.", icon: "chart-no-axes-column-increasing", route: "progress", availability: "available" },
  { key: "homework", title: "Homework Tracker", description: "Track assignments, due dates and completion from one clear view.", icon: "calendar-check", route: "homework", availability: "available" },
  { key: "studyPlans", title: "AI-Powered Study Plans", description: "Build revision schedules around exam dates, available time and weak areas.", icon: "calendar-cog", route: "ai-study-plan", availability: "requires-ai" },
  { key: "mindMap", title: "Mind Map Generator", description: "Turn a central topic and key points into a clear visual map.", icon: "network", route: "mind-map", availability: "available" },
  { key: "heatmap", title: "Performance Heat Map", description: "See red, amber and green subject performance at a glance.", icon: "layout-grid", route: "heatmap", availability: "available" },
  { key: "predictedGrades", title: "Predicted Grades", description: "Estimate working grades from recorded quizzes and past papers.", icon: "calculator", route: "predicted-grades", availability: "available" },
  { key: "focus", title: "Focus Mode", description: "Use quiet timed revision blocks without unnecessary distractions.", icon: "timer", route: "focus", availability: "available" },
  { key: "cramMode", title: "Cram Mode", description: "Prioritise weak subjects and urgent work when revision time is limited.", icon: "siren", route: "cram-mode", availability: "available" },
  { key: "modelAnswers", title: "Model Answers", description: "Generate annotated high-mark answers and reusable response structures.", icon: "file-check-2", route: "model-answers", availability: "requires-ai" },
  { key: "leaderboard", title: "Leaderboard", description: "Compare revision points earned from completed work across Revizely.", icon: "trophy", route: "leaderboard", availability: "available" },
  { key: "classes", title: "Competition Classes", description: "Create or join a private revision class using a shareable code.", icon: "users-round", route: "competition-classes", availability: "available" },
  { key: "adFree", title: "Ad-Free Experience", description: "Study in a clean interface without advertising distractions.", icon: "shield-check", route: null, availability: "included" },
  { key: "prioritySupport", title: "Priority Support", description: "Create and track support requests from your workspace.", icon: "life-buoy", route: "support", availability: "available" },
  { key: "workExperience", title: "Work Experience Tracker", description: "Organise opportunities, deadlines and application progress.", icon: "briefcase-business", route: "work-experience", availability: "available" },
  { key: "predictedPapers", title: "Practice Paper Generator", description: "Create original exam-style practice papers for selected topics.", icon: "file-clock", route: "predicted-papers", availability: "requires-ai" }
];

module.exports = { features, plans };
