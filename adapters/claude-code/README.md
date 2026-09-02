# Claude Code hook adapter

This official adapter maps Claude Code lifecycle hooks into `watchdog.telemetry.v2` without reading the transcript or retaining prompts, tool arguments, tool outputs, commands, paths, or working directories. It preserves source session, prompt, tool-call, and agent IDs as provenance; records payload byte counts; and submits through the bounded, metadata-only shared client.

Configure command hooks for the desired events in Claude Code settings. Each command must pass the configured event explicitly:

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event SessionStart", "timeout": 2}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event UserPromptSubmit", "timeout": 2}]}],
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event PreToolUse", "timeout": 2}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event PostToolUse", "timeout": 2}]}],
    "PostToolUseFailure": [{"matcher": "*", "hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event PostToolUseFailure", "timeout": 2}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event Stop", "timeout": 2}]}],
    "SessionEnd": [{"hooks": [{"type": "command", "command": "node /absolute/path/watchdog/adapters/claude-code/watchdog-claude-hook.mjs --event SessionEnd", "timeout": 2}]}]
  }
}
```

Set `WATCHDOG_TELEMETRY_URL` and, when Watchdog requires auth, `WATCHDOG_TELEMETRY_TOKEN` in the hook process environment. Loopback HTTP and remote HTTPS are accepted. Delivery failure never blocks Claude Code; retryable batches enter a 0600, bounded local spool. `WATCHDOG_TELEMETRY_DEBUG=1` enables bounded diagnostics on stderr.

The supported input fields and event names are based on the current [official Claude Code hooks reference](https://code.claude.com/docs/en/hooks). Unknown fields are ignored. Content capture stays off even if the hook schema later adds new content-bearing fields.

