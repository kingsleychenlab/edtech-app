const usersByEmail = new Map();
const usersById = new Map();
const sessions = new Map();
const workspaces = new Map();
const competitionClasses = new Map();
const friendCodes = new Map();
const challenges = new Map();

const CURRICULA = ["GCSE", "IGCSE", "A-Level", "SAT"];

// XP awarded per completed action. The client mirrors this table so it can show
// the reward immediately; the server keeps it authoritative for the leaderboard.
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

function createProfile(user) {
  const parts = String(user.name || "").trim().split(/\s+/);
  return {
    name: user.name,
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
    email: user.email,
    school: "",
    year: "",
    curriculum: "",
    subjects: [],
    examYear: "",
    dailyGoal: 45,
    onboarded: false
  };
}

function createWorkspace(user) {
  return {
    profile: createProfile(user),
    preferences: {
      theme: "system",
      aiEnabled: true
    },
    notifications: {
      study: true,
      progress: true,
      content: true,
      achievements: true
    },
    streak: {
      current: 0,
      longest: 0,
      lastActiveDate: null
    },
    xp: {
      total: 0,
      history: []
    },
    notes: [],
    decks: [],
    papers: [],
    tasks: [],
    quizzes: [],
    quizAttempts: [],
    mindMaps: [],
    virtualSessions: [],
    opportunities: [],
    extracurriculars: [],
    cv: {
      headline: "",
      summary: "",
      education: [],
      experience: [],
      skills: [],
      achievements: []
    },
    supportTickets: [],
    generatedResources: [],
    predictedPapers: [],
    chat: [],
    subscription: {
      status: "free",
      plan: null,
      currentPeriodEnd: null
    },
    focusMinutes: 25,
    focusSessions: 0
  };
}

module.exports = {
  usersByEmail,
  usersById,
  sessions,
  workspaces,
  competitionClasses,
  friendCodes,
  challenges,
  createWorkspace,
  createProfile,
  CURRICULA,
  XP_REWARDS
};
