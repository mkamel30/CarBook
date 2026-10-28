# Security and Trust Boundaries

**Project:** Car Maintenance Followup
**Date:** 2026-10-28T12:01:50.318Z

## Threat Model & Protections

1. **Authentication & Session Security:** Strict credential verification and session management.
2. **Input Validation & Sanitization:** Schema validation prevents injection and unauthorized mutation.
3. **Secret Isolation:** Zero credentials in client bundles or public logs.

## Core Security Rules

- **Zero Secrets in Bundles:** API keys, passwords, and tokens must never appear in client bundles, Git commits, logs, or exports.
- **SSRF Prevention:** Reject non-HTTPS or loopback/metadata endpoints for external requests.
- **Origin Validation:** Reject cross-origin state-mutating requests.
- **Safe Rendering:** Sanitize all markdown rendering; disable arbitrary raw HTML execution.
