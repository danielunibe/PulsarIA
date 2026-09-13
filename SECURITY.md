# Security policy — Pulsaria

## Supported versions

Only the newest public beta release is supported for security fixes. Older
builds may be withdrawn when an issue cannot be safely backported.

## Reporting a vulnerability

Do not disclose a vulnerability in a public GitHub issue. Use GitHub Private
Vulnerability Reporting if enabled, or contact:

Security contact: TO BE COMPLETED BEFORE RELEASE.

Include a concise description, affected version, reproduction steps, impact,
and any safe mitigation. Do not include passwords, API keys, cookies, private
videos, transcripts, or personal data.

## Response expectations

We will acknowledge receipt when possible, reproduce the report, assess
severity, coordinate a fix, and publish a release note when disclosure is
safe. Timelines depend on the beta status and the ability to reproduce the
issue.

## Security boundaries

The beta is local-first and has no remote telemetry. The application may
connect to GitHub for an explicitly requested release/update and to the
declared model host for an explicitly requested model download. Content
processed by the local pipeline must not be sent to a remote LLM.

The local LLM sidecar must bind only to loopback, run without filesystem
tools, and receive prompts only through the Tauri IPC boundary.
