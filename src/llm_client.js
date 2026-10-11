const OpenAI = require("openai");

// stick the pinned facts and current topic into the system prompt
function buildPrompt(session) {
  let systemMessage = `You are a helpful university IT helpdesk agent.\n`;
  systemMessage += `Current topic: ${session.active_topic}\n`;

  if (session.pinned && session.pinned.ticket_id) {
    systemMessage += `Known user information: Ticket ID: ${session.pinned.ticket_id}.\n`;
    systemMessage += `If the user asks about their ticket, always include this ticket ID in your reply.`;
  } else {
    systemMessage += `Known user information: None.`;
  }

  const messages = [{ role: "system", content: systemMessage }];
  for (const msg of session.recent) {
    messages.push({ role: msg.role, content: msg.content });
  }

  return messages;
}

// send messages to openai or fall back to mock reply if no key is set
async function generateReply(session) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey === "mock" || process.env.MOCK_LLM === "true") {
    if (session.active_topic === "ticket_inquiry" && session.pinned && session.pinned.ticket_id) {
      return `Ticket ${session.pinned.ticket_id} status is open.`;
    }
    if (session.active_topic === "wifi_issue") {
      return "Please restart your WiFi and reconnect.";
    }
    return "Hello! How can I help you today?";
  }

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages = buildPrompt(session);

  const completion = await openai.chat.completions.create({
    model,
    messages
  });

  return completion.choices[0].message.content;
}

module.exports = {
  buildPrompt,
  generateReply
};
