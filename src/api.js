require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  getSession,
  extractTicket,
  detectTopic,
  countTokens,
  pruneRecentMessages,
  saveContext,
  sessions
} = require("./context_engine");
const { generateReply } = require("./llm_client");

const app = express();
app.use(express.json());

// quick health check route to see if server is alive
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// main chat endpoint that updates memory and talks to the model
app.post("/v1/chat", async (req, res) => {
  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: "session_id and message are required" });
  }

  const session = getSession(session_id);

  // Snapshot previous state in case the LLM call fails
  const backup = {
    active_topic: session.active_topic,
    pinned: { ...session.pinned },
    recent: session.recent.map((m) => ({ ...m })),
    total_recent_tokens: session.total_recent_tokens
  };

  const detectedTicket = extractTicket(message);
  if (detectedTicket) {
    session.pinned.ticket_id = detectedTicket;
  }

  session.active_topic = detectTopic(message, session.active_topic);
  session.recent.push({ role: "user", content: message });

  const tokenLimit = parseInt(req.body.token_budget_limit || req.body.token_budget || process.env.TOKEN_BUDGET_LIMIT, 10) || 4000;
  session.total_recent_tokens = pruneRecentMessages(session.recent, tokenLimit);

  try {
    const reply = await generateReply(session);
    session.recent.push({ role: "assistant", content: reply });
    session.total_recent_tokens = pruneRecentMessages(session.recent, tokenLimit);

    saveContext(session);

    return res.json({
      response: reply,
      active_topic: session.active_topic
    });
  } catch (error) {
    session.active_topic = backup.active_topic;
    session.pinned = backup.pinned;
    session.recent = backup.recent;
    session.total_recent_tokens = backup.total_recent_tokens;
    saveContext(session);

    return res.status(500).json({ error: error.message || "Failed to generate LLM response" });
  }
});

// fetch what the bot currently remembers for this session
app.get("/v1/context/:session_id", (req, res) => {
  const sessionId = req.params.session_id;
  let session = sessions[sessionId];

  if (!session) {
    const logPath = path.join(__dirname, "..", "logs", `context_${sessionId}.json`);
    if (fs.existsSync(logPath)) {
      try {
        session = JSON.parse(fs.readFileSync(logPath, "utf-8"));
        sessions[sessionId] = session;
      } catch {}
    }
  }

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  return res.json({
    session_id: session.session_id,
    active_topic: session.active_topic,
    pinned: session.pinned,
    recent: session.recent.map((m) => ({
      role: m.role,
      content: m.content
    })),
    total_recent_tokens: session.total_recent_tokens
  });
});

const PORT = process.env.PORT || 8000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
