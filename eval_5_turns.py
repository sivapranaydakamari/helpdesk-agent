import os
import sys
import json
import urllib.request
import urllib.error

PORT = int(os.getenv("PORT", 8000))
BASE_URL = f"http://127.0.0.1:{PORT}"
SESSION_ID = "eval_session_py_8812"

# simple helper for sending requests with urllib
def send_request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode("utf-8") if data else None
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        return e.code, json.loads(content) if content else {}

# run the 5 turns to verify topic switch and pinned memory
def main():
    try:
        print("Starting 5-turn evaluation in Python...")

        # Turn 1: Greet
        s, r = send_request("POST", "/v1/chat", {"session_id": SESSION_ID, "message": "Hi, I need help.", "token_budget_limit": 80})
        assert s == 200, f"Turn 1 failed: {s}"

        # Turn 2: Provide Ticket ID
        s, r = send_request("POST", "/v1/chat", {"session_id": SESSION_ID, "message": "My ticket is IT-8812.", "token_budget_limit": 80})
        assert s == 200, f"Turn 2 failed: {s}"

        # Turn 3: Ask long question about Mac WiFi
        s, r = send_request("POST", "/v1/chat", {
            "session_id": SESSION_ID,
            "message": "Actually, before we do that, my WiFi in the library just dropped. I am using a Mac. It says 'connected without internet'.",
            "token_budget_limit": 80
        })
        assert s == 200, f"Turn 3 failed: {s}"

        # Turn 4: Follow up on WiFi
        s, r = send_request("POST", "/v1/chat", {
            "session_id": SESSION_ID,
            "message": "Can you give me the Mac troubleshooting steps?",
            "token_budget_limit": 80
        })
        assert s == 200, f"Turn 4 failed: {s}"

        # Turn 5: Ask about original ticket
        s, r = send_request("POST", "/v1/chat", {
            "session_id": SESSION_ID,
            "message": "What was the status of the ticket I mentioned earlier?",
            "token_budget_limit": 80
        })
        assert s == 200, f"Turn 5 failed: {s}"
        turn5_response = r.get("response", "")

        # Check saved context log
        log_path = os.path.join(os.path.dirname(__file__), "logs", f"context_{SESSION_ID}.json")
        assert os.path.exists(log_path), "Context log file not found"

        with open(log_path, "r", encoding="utf-8") as f:
            context = json.load(f)

        print("Saved context:", json.dumps(context, indent=2))

        # Check ticket pinned
        pinned_ticket = context.get("pinned", {}).get("ticket_id")
        assert pinned_ticket == "IT-8812", f"Expected pinned ticket_id IT-8812, got {pinned_ticket}"
        assert "IT-8812" in turn5_response, f"Response does not contain IT-8812: {turn5_response}"

        recent_contents = [m.get("content", "") for m in context.get("recent", [])]
        has_turn1 = any("Hi, I need help." in c for c in recent_contents)
        has_turn2 = any("My ticket is IT-8812." in c for c in recent_contents)

        assert not has_turn1 and not has_turn2, "Turn 1 or Turn 2 was not evicted from recent history!"
        print("Verified: Older turns evicted from recent array!")
        print("5-turn evaluation passed successfully!")
        sys.exit(0)
    except Exception as e:
        print(f"Evaluation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
