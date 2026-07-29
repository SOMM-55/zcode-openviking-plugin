---
description: Show one-line OpenViking memory plugin status (server, last recall, pending capture).
---

Use the `openviking-usage` skill to handle this request.

The user invoked `/ov-status`. Call `mcp__openviking__health` and report a single line in the form `OV ✓ <url>` if healthy, otherwise `OV ✗ <reason>`. Don't run a shell command — call the MCP tool directly.