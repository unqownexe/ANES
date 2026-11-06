"""Example 8 — print one conversation's message history by id.

Shows the `GET /v1/conversations/{conversation_id}/messages` endpoint, which
returns every message in a saved thread, oldest first. Each message is
OpenAI-shaped (`role` + `content`); DeepThink text, when present, sits in
`reasoning_content`.

Install requests first:

    pip install requests

Start the server in another terminal:

    python app.py

Then run this from the project root (it picks the newest conversation; pass an
id as the first argument to inspect a specific one):

    python examples/08_server_conversation_history.py            # newest thread
    python examples/08_server_conversation_history.py abc123     # by id
"""

import sys

import requests

BASE = "http://localhost:8000"


def fetch_history(conversation_id: str) -> dict:
    resp = requests.get(f"{BASE}/v1/conversations/{conversation_id}/messages")
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    # Resolve an id: from argv, else the newest conversation in the account.
    if len(sys.argv) > 1:
        conversation_id = sys.argv[1]
    else:
        listing = requests.get(
            f"{BASE}/v1/conversations", params={"count": 1}
        ).json()["data"]
        if not listing:
            print("No conversations found.")
            return
        conversation_id = listing[0]["id"]

    payload = fetch_history(conversation_id)
    messages = payload["data"]

    print(f"Conversation {conversation_id} — {len(messages)} message(s)\n")
    for m in messages:
        label = m["role"].upper()
        print(f"--- {label} ---")
        # DeepThink reasoning, if this reply used it.
        if m.get("reasoning_content"):
            print(f"[reasoning] {m['reasoning_content']}")
        print(m["content"])
        print()


if __name__ == "__main__":
    main()