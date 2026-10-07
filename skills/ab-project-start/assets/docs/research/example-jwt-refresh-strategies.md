# JWT Refresh Token Strategies

> **Note:** This is an example research doc showing the expected format. Delete this file when you start your project.

**Date:** 2026-03-04
**Context:** Evaluating refresh token strategies for the auth system. Need to balance security with UX (avoiding frequent re-logins).

## Summary

Compared three refresh token approaches: rotating refresh tokens, long-lived refresh tokens with blacklisting, and sliding session windows. Rotating tokens offer the best security/UX tradeoff for our use case.

## Findings

### Rotating Refresh Tokens
- Each refresh issues a new refresh token and invalidates the old one
- If a stolen token is reused, the server detects the reuse and invalidates the entire token family
- Recommended by OAuth 2.0 Security Best Current Practice (RFC 6819)
- **Complexity:** Medium — requires token family tracking in DB

### Long-Lived Refresh + Blacklist
- Single long-lived refresh token (30-90 days)
- Revocation via server-side blacklist (Redis or DB)
- Simpler implementation but no theft detection
- **Complexity:** Low — just a blacklist check on each refresh

### Sliding Session Window
- No refresh tokens — access token extended on each API call
- Simple but no offline/background refresh capability
- Requires all API calls to check and potentially update tokens
- **Complexity:** Low, but invasive (touches every endpoint)

## Recommendations

Use **rotating refresh tokens** (option 1). The theft detection is worth the moderate complexity increase. Implementation plan in `docs/plans/2026-03-04-example-user-auth.md`.

Decision recorded in ADR-001.

## Sources

- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Auth0: Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
