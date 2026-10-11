const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 8000;
const SESSION_ID = "eval_session_8812";

// small helper to make post and get calls to our api
function sendRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: PORT,
      path: endpoint,
      method: method,
      headers: { "Content-Type": "application/json" }
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// run 5 turns to test if pinned ticket survives eviction
async function runEval() {
  try {
    console.log("Starting 5-turn evaluation test...");

    // Turn 1: Greet
    console.log("Turn 1: Greeting...");
    const turn1 = await sendRequest("POST", "/v1/chat", {
      session_id: SESSION_ID,
      message: "Hi, I need help.",
      token_budget_limit: 80
    });
    if (turn1.status !== 200) throw new Error(`Turn 1 failed with status ${turn1.status}`);

    // Turn 2: Provide Ticket ID
    console.log("Turn 2: Ticket info...");
    const turn2 = await sendRequest("POST", "/v1/chat", {
      session_id: SESSION_ID,
      message: "My ticket is IT-8812.",
      token_budget_limit: 80
    });
    if (turn2.status !== 200) throw new Error(`Turn 2 failed with status ${turn2.status}`);

    // Turn 3: Ask long question about Mac WiFi
    console.log("Turn 3: Switching topic to WiFi...");
    const turn3 = await sendRequest("POST", "/v1/chat", {
      session_id: SESSION_ID,
      message: "Actually, before we do that, my WiFi in the library just dropped. I am using a Mac. It says 'connected without internet'.",
      token_budget_limit: 80
    });
    if (turn3.status !== 200) throw new Error(`Turn 3 failed with status ${turn3.status}`);

    // Turn 4: Follow up on WiFi
    console.log("Turn 4: Following up on WiFi...");
    const turn4 = await sendRequest("POST", "/v1/chat", {
      session_id: SESSION_ID,
      message: "Can you give me the Mac troubleshooting steps?",
      token_budget_limit: 80
    });
    if (turn4.status !== 200) throw new Error(`Turn 4 failed with status ${turn4.status}`);

    // Turn 5: Return to ticket
    console.log("Turn 5: Asking about original ticket...");
    const turn5 = await sendRequest("POST", "/v1/chat", {
      session_id: SESSION_ID,
      message: "What was the status of the ticket I mentioned earlier?",
      token_budget_limit: 80
    });
    if (turn5.status !== 200) throw new Error(`Turn 5 failed with status ${turn5.status}`);

    // Check saved context file
    const logFile = path.join(__dirname, "logs", `context_${SESSION_ID}.json`);
    if (!fs.existsSync(logFile)) throw new Error("Log file was not created!");

    const contextData = JSON.parse(fs.readFileSync(logFile, "utf-8"));
    console.log("Final context:", JSON.stringify(contextData, null, 2));

    // Assertions
    if (!contextData.pinned || contextData.pinned.ticket_id !== "IT-8812") {
      throw new Error(`Expected pinned ticket_id to be IT-8812, found: ${contextData.pinned?.ticket_id}`);
    }

    if (!turn5.body.response || !turn5.body.response.includes("IT-8812")) {
      throw new Error(`Expected response to include IT-8812, got: ${turn5.body?.response}`);
    }

    const hasTurn1InRecent = contextData.recent.some((m) => m.content.includes("Hi, I need help."));
    const hasTurn2InRecent = contextData.recent.some((m) => m.content.includes("My ticket is IT-8812."));

    if (hasTurn1InRecent || hasTurn2InRecent) {
      throw new Error("Turn 1 or Turn 2 was not evicted from recent conversation history!");
    }

    console.log("Success: Old messages were properly evicted from recent history!");
    console.log("All evaluation checks passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Evaluation failed:", err.message);
    process.exit(1);
  }
}

runEval();
