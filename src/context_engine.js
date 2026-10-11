const fs = require("fs");
const path = require("path");
const { getEncoding } = require("js-tiktoken");

// count tokens using the standard openai encoding
const tokenizer = getEncoding("cl100k_base");
const sessions = {};

function countTokens(text) {
  if (!text) return 0;
  return tokenizer.encode(text).length;
}

function getSession(sessionId) {
  if (!sessions[sessionId]) {
    const logFile = path.join(__dirname, "..", "logs", `context_${sessionId}.json`);
    if (fs.existsSync(logFile)) {
      try {
        sessions[sessionId] = JSON.parse(fs.readFileSync(logFile, "utf-8"));
        return sessions[sessionId];
      } catch {}
    }

    sessions[sessionId] = {
      session_id: sessionId,
      active_topic: "general",
      pinned: {
        ticket_id: null
      },
      recent: [],
      total_recent_tokens: 0
    };
  }
  return sessions[sessionId];
}

function extractTicket(message) {
  const match = message.match(/IT-\d{4}/i);
  return match ? match[0].toUpperCase() : null;
}

function detectTopic(message, currentTopic) {
  const text = message.toLowerCase();
  if (text.includes("wifi") || text.includes("network") || text.includes("internet") || text.includes("connection")) {
    return "wifi_issue";
  }
  if (text.includes("ticket") || /it-\d{4}/i.test(message) || text.includes("status")) {
    return "ticket_inquiry";
  }
  if (text.includes("hi") || text.includes("hello") || text.includes("hey") || text.includes("help")) {
    return "general";
  }
  return currentTopic || "general";
}

// trim older chat history when we go past our token budget
function pruneRecentMessages(recent, tokenLimit) {
  let total = recent.reduce((sum, msg) => sum + countTokens(msg.content), 0);
  while (recent.length > 0 && total > tokenLimit) {
    const dropped = recent.shift();
    total -= countTokens(dropped.content);
  }
  return total;
}

// write the session context to disk so we can inspect it later
function saveContext(session) {
  const logsDir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const filePath = path.join(logsDir, `context_${session.session_id}.json`);
  const data = {
    session_id: session.session_id,
    active_topic: session.active_topic,
    pinned: session.pinned,
    recent: session.recent.map((m) => ({
      role: m.role,
      content: m.content
    })),
    total_recent_tokens: session.total_recent_tokens
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  sessions,
  countTokens,
  getSession,
  extractTicket,
  detectTopic,
  pruneRecentMessages,
  saveContext
};
