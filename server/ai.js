const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function requireText(value, label, maxLength = 12000) {
  const text = String(value || "").trim();
  if (!text) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  if (text.length > maxLength) throw Object.assign(new Error(`${label} is too long.`), { status: 400 });
  return text;
}

async function callGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("AI tools need a GROQ_API_KEY on the server."), { status: 503 });
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens || 1600
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || "The AI provider could not complete this request.";
    throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 });
  }
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw Object.assign(new Error("The AI provider returned an empty response."), { status: 502 });
  return answer;
}

function systemPrompt(task) {
  return `You are Revizely, a concise UK secondary-school revision assistant. Use UK spelling. ${task} Do not claim certainty where evidence is missing. Keep the response clear, practical and age-appropriate.`;
}

async function runAiAction(action, body) {
  if (action === "chat") {
    const question = requireText(body.question, "Question", 4000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const messages = [
      { role: "system", content: systemPrompt("Explain ideas rather than merely giving an answer. Use short sections where useful.") },
      ...history.filter((item) => ["user", "assistant"].includes(item.role) && item.text).map((item) => ({ role: item.role, content: String(item.text).slice(0, 4000) })),
      { role: "user", content: question }
    ];
    return { answer: await callGroq(messages) };
  }

  if (action === "homework-solver") {
    const subject = requireText(body.subject, "Subject", 100);
    const question = requireText(body.question, "Homework question", 6000);
    return { answer: await callGroq([
      { role: "system", content: systemPrompt("Guide the student through the problem step by step. Show method, reasoning and key concepts, then provide a brief final answer.") },
      { role: "user", content: `Subject: ${subject}\n\nQuestion:\n${question}` }
    ]) };
  }

  if (action === "note-condenser") {
    const subject = requireText(body.subject, "Subject", 100);
    const notes = requireText(body.notes, "Notes", 12000);
    return { answer: await callGroq([
      { role: "system", content: systemPrompt("Condense the material into: Summary, Key concepts, Essential terms, and five Review questions. Preserve important facts and never invent missing details.") },
      { role: "user", content: `Subject: ${subject}\n\nNotes:\n${notes}` }
    ], { maxTokens: 2000 }) };
  }

  if (action === "examiner") {
    const subject = requireText(body.subject, "Subject", 100);
    const board = requireText(body.board, "Exam board", 100);
    const question = requireText(body.question, "Exam question", 5000);
    const answer = requireText(body.answer, "Student answer", 8000);
    const maxMarks = Math.max(1, Math.min(100, Number(body.maxMarks) || 1));
    return { answer: await callGroq([
      { role: "system", content: systemPrompt(`Act as a fair GCSE examiner. Award a mark out of ${maxMarks}, explain why, identify what was done well, give precise improvements, and provide an improved model response. State that this is guidance, not official marking.`) },
      { role: "user", content: `Subject: ${subject}\nExam board: ${board}\nQuestion (${maxMarks} marks): ${question}\n\nStudent answer:\n${answer}` }
    ], { maxTokens: 2200 }) };
  }

  if (action === "study-plan") {
    const subjects = requireText(body.subjects, "Subjects", 1000);
    const examDate = requireText(body.examDate, "Exam date", 40);
    const weeklyHours = Math.max(1, Math.min(60, Number(body.weeklyHours) || 1));
    const priorities = String(body.priorities || "").trim().slice(0, 2000);
    return { answer: await callGroq([
      { role: "system", content: systemPrompt("Create a realistic weekly revision plan with manageable sessions, active recall, past-paper practice, breaks and a weekly review. Do not overfill the timetable.") },
      { role: "user", content: `Subjects: ${subjects}\nExam date: ${examDate}\nHours available each week: ${weeklyHours}\nPriorities or weak areas: ${priorities || "Not supplied"}` }
    ], { maxTokens: 2200 }) };
  }

  if (action === "beyond-theory") {
    const subject = requireText(body.subject, "Subject", 100);
    const topic = requireText(body.topic, "Topic", 300);
    return { answer: await callGroq([
      { role: "system", content: systemPrompt("Create an applied lesson with: Core idea, Real-world application, Worked example, Common misconception, three Check questions, and a practical extension. Align the depth to GCSE study.") },
      { role: "user", content: `Subject: ${subject}\nTopic: ${topic}` }
    ], { maxTokens: 2200 }) };
  }

  if (action === "grade9-resource") {
    const subject = requireText(body.subject, "Subject", 100);
    const topic = requireText(body.topic, "Topic", 300);
    const format = ["notes", "flashcards"].includes(body.format) ? body.format : "notes";
    const task = format === "flashcards"
      ? "Create 12 challenging Grade 9 flashcards as clearly separated Question and Answer pairs. Include precise terminology and application questions."
      : "Create a concise Grade 9 revision resource with key knowledge, high-mark analysis, common traps, and five retrieval questions.";
    return { answer: await callGroq([
      { role: "system", content: systemPrompt(task) },
      { role: "user", content: `Subject: ${subject}\nTopic: ${topic}` }
    ], { maxTokens: 2400 }) };
  }

  if (action === "model-answer") {
    const subject = requireText(body.subject, "Subject", 100);
    const question = requireText(body.question, "Exam question", 5000);
    const marks = Math.max(1, Math.min(100, Number(body.marks) || 1));
    return { answer: await callGroq([
      { role: "system", content: systemPrompt(`Write a high-quality model response for a ${marks}-mark GCSE question, then annotate why it earns marks and provide a reusable answer structure. Do not imply this is an official mark scheme.`) },
      { role: "user", content: `Subject: ${subject}\nQuestion: ${question}` }
    ], { maxTokens: 2200 }) };
  }

  if (action === "predicted-paper") {
    const subject = requireText(body.subject, "Subject", 100);
    const board = requireText(body.board, "Exam board", 100);
    const topics = requireText(body.topics, "Topics", 1500);
    const marks = Math.max(20, Math.min(100, Number(body.marks) || 60));
    return { answer: await callGroq([
      { role: "system", content: systemPrompt(`Create an original ${marks}-mark GCSE-style practice paper with varied command words, mark values, a total, and a concise mark scheme. Never reproduce or claim to predict confidential exam content; label it clearly as unofficial practice.`) },
      { role: "user", content: `Subject: ${subject}\nExam board style: ${board}\nTopics to cover: ${topics}` }
    ], { maxTokens: 3500 }) };
  }

  throw Object.assign(new Error("Unknown AI action."), { status: 404 });
}

module.exports = { runAiAction };
