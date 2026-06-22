const usersByEmail = new Map();
const usersById = new Map();
const sessions = new Map();
const workspaces = new Map();
const competitionClasses = new Map();

function createWorkspace(user) {
  return {
    profile: {
      name: user.name,
      email: user.email,
      examYear: "",
      dailyGoal: 45
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

module.exports = { usersByEmail, usersById, sessions, workspaces, competitionClasses, createWorkspace };
