"""Example 7 — list your saved conversations over HTTP.

Shows the `GET /v1/conversations` endpoint, which returns the threads saved to
your DeepSeek account (the sidebar list), newest first. Each entry has an `id`,
a `title`, timestamps, and a resume-ready `conversation_id` you can pass back to
`/v1/chat/completions` to continue that thread.

Install requests first:

    pip install requests

Start the server in another terminal:

    python app.py

Then run this from the project root:

    python examples/07_server_conversations.py
"""

import requests

URL = "http://localhost:8000/v1/conversations"

# `count` is optional (1–1000, default 100): how many to fetch from DeepSeek.
resp = requests.get(URL, params={"count": 20})
resp.raise_for_status()
conversations = resp.json()["data"]

print(f"{len(conversations)} conversation(s):\n")
for c in conversations:
    pinned = " 📌" if c.get("pinned") else ""
    print(f"  [{c['id']}] {c['title']}{pinned}")

# The `conversation_id` of any entry can be reused to continue that thread:
if conversations:
    cid = conversations[0]["conversation_id"]
    reply = requests.post(
        "http://localhost:8000/v1/chat/completions",
        json={
            "conversation_id": cid,
            "messages": [{"role": "user", "content": "Continue where we left off."}],
        },
    ).json()
    print("\nResumed reply:", reply["choices"][0]["message"]["content"])
