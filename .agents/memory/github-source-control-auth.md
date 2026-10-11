---
name: GitHub source-control authentication
description: Replit's GitHub connection can report healthy while a project's configured remote still rejects Git CLI authentication.
---

After binding the GitHub source-control connection, verify the configured Git remote with `git ls-remote` or `git push`; a healthy OAuth connection does not guarantee CLI authentication works.

**Why:** The connection reported healthy, but this workspace's GitHub remote still returned an invalid username/token error. Claiming a successful push based only on connection status would be incorrect.

**How to apply:** When publishing from this workspace, check the actual remote operation and report authentication failures plainly. Never request or expose a token in chat.
