# Campus IT Helpdesk Agent (Context Management Engine)

A lightweight Express/Node.js backend for a conversational IT helpdesk bot that implements explicit **context engineering**. 

Instead of naively appending chat messages until the token window overflows, this system splits memory into three parts: permanent facts (`pinned`), temporary rolling chat history (`recent`), and dynamic conversation focus (`active_topic`). This prevents "context amnesia"—ensuring critical information like support ticket IDs are never forgotten even when older messages get evicted from the prompt.

---

## The Problem Solved

Consider this multi-turn conversation:

```text
User: Hi, I need help.
Bot:  Sure, how can I help?
User: My ticket is IT-9921.
Bot:  Got it!
User: Actually, my library WiFi stopped working on my Mac. It says connected without internet.
Bot:  Let's troubleshoot your WiFi...
...several turns of WiFi troubleshooting...
User: Okay, WiFi is working now. What was the status of my original ticket?
```

In standard chatbots with fixed token limits, older messages get dropped. By turn 5, the message containing `IT-9921` is gone, and the bot replies: *"Sorry, I don't know which ticket you're referring to."*

Here, the ticket ID is extracted and saved into **`pinned` memory**, which bypasses eviction and is always injected into the system prompt.

---

## Core Memory Architecture

Each conversation maintains an inspectable context state:

```json
{
  "session_id": "abc123",
  "active_topic": "ticket_inquiry",
  "pinned": {
    "ticket_id": "IT-9921"
  },
  "recent": [
    {
      "role": "user",
      "content": "What was the status of my ticket?"
    },
    {
      "role": "assistant",
      "content": "Ticket IT-9921 status is open."
    }
  ],
  "total_recent_tokens": 24
}
```

- **`pinned`**: Critical user facts (such as ticket IDs matching `IT-XXXX`). Never evicted.
- **`recent`**: A rolling FIFO window of recent messages. Governed by `TOKEN_BUDGET_LIMIT`.
- **`active_topic`**: Dynamically switches based on user intent (`general`, `ticket_inquiry`, `wifi_issue`).
- **`total_recent_tokens`**: Measured using exact `cl100k_base` BPE tokenization (`js-tiktoken`).

---

## Project Structure

```text
├── src/
│   ├── api.js             # Express web server & routes
│   ├── context_engine.js  # Token budgeting, topic detection & session state
│   └── llm_client.js      # System prompt construction & OpenAI/mock completions
├── logs/                  # Persisted context_{session_id}.json state dumps
├── eval_5_turns.js        # 5-turn evaluation script in Node.js
├── eval_5_turns.py        # 5-turn evaluation script in Python
├── Dockerfile             # Container definition
├── docker-compose.yml     # Docker Compose configuration
├── .env.example           # Example environment variables
└── package.json           # Dependencies and scripts
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- *(Optional)* Python 3.8+ if you want to run the Python eval script.

### 1. Installation

Clone or open the repository, then install the dependencies:

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default settings in `.env`:
```ini
PORT=8000
TOKEN_BUDGET_LIMIT=4000
OPENAI_API_KEY=mock
OPENAI_MODEL=gpt-4o-mini
```

> **Note on LLM:** If `OPENAI_API_KEY=mock` (or not set), the server uses built-in mock responses for fast offline testing. To connect to real OpenAI, set your real `OPENAI_API_KEY=sk-...`.

---

## Running the Application

### Option A: Direct Node.js (Recommended for Local Dev)

Start the server:

```bash
node src/api.js
```

Or using npm:

```bash
npm start
```

The server will start on port `8000`:
```text
Server listening on port 8000
```

### Option B: Using Docker

```bash
docker compose up -d
```

---

## API Endpoints

### 1. Health Check
- **`GET /health`**
- **Response:**
  ```json
  { "status": "ok" }
  ```

### 2. Send Message
- **`POST /v1/chat`**
- **Request Body:**
  ```json
  {
    "session_id": "user_42",
    "message": "My ticket is IT-9921."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "response": "Ticket IT-9921 status is open.",
    "active_topic": "ticket_inquiry"
  }
  ```

### 3. Inspect Session Memory
- **`GET /v1/context/:session_id`**
- **Response (200 OK):**
  ```json
  {
    "session_id": "user_42",
    "active_topic": "ticket_inquiry",
    "pinned": {
      "ticket_id": "IT-9921"
    },
    "recent": [
      {
        "role": "user",
        "content": "My ticket is IT-9921."
      },
      {
        "role": "assistant",
        "content": "Ticket IT-9921 status is open."
      }
    ],
    "total_recent_tokens": 22
  }
  ```
- **Response (404 Not Found):** If session does not exist.

---

## Running the 5-Turn Evaluation

The evaluation script simulates the full topic-switch and token eviction sequence across 5 turns:

1. **Turn 1:** User greets $\to$ topic is `general`.
2. **Turn 2:** User provides ticket `IT-8812` $\to$ pinned to memory.
3. **Turn 3:** User asks long question about Mac WiFi $\to$ topic shifts to `wifi_issue`.
4. **Turn 4:** User asks for Mac WiFi troubleshooting steps.
5. **Turn 5:** User asks *"What was the status of the ticket I mentioned earlier?"*

The script verifies:
- `context.pinned.ticket_id` still equals `"IT-8812"`.
- The bot response explicitly mentions `"IT-8812"`.
- Older messages from Turns 1 and 2 were pruned from `recent` due to the token budget limit.

### Run with Node.js:
```bash
node eval_5_turns.js
```

### Run with Python:
```bash
python eval_5_turns.py
```

Expected output:
```text
Starting 5-turn evaluation test...
Turn 1: Greeting...
Turn 2: Ticket info...
Turn 3: Switching topic to WiFi...
Turn 4: Following up on WiFi...
Turn 5: Asking about original ticket...
Final context: {
  "session_id": "eval_session_8812",
  "active_topic": "ticket_inquiry",
  "pinned": {
    "ticket_id": "IT-8812"
  },
  ...
}
Success: Old messages were properly evicted from recent history!
All evaluation checks passed successfully!
```

---

## Error Handling & Reliability

- **Safe Rollback on LLM Failure:** If the upstream model throws an error (e.g. invalid API key, network timeout), the API returns a 500 error and rolls back the user's message from the `recent` array so the conversation state is not corrupted.
- **Disk Hydration:** Session states are saved to `./logs/context_{session_id}.json` after every turn and automatically reloaded if the server restarts.
