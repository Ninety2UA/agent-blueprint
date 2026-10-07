# Worked example: an authentication feature

Loaded on demand from SKILL.md when writing the scope list, the classification, the revised plan or the cut summary.

## Step 1 list

```markdown
## Current Scope: [feature name]

1. User authentication with email/password
2. OAuth integration (Google, GitHub)
3. Password reset flow
4. Email verification
5. Remember me / persistent sessions
6. Account settings page
7. Profile picture upload
8. Two-factor authentication
9. Session management (view/revoke active sessions)
10. Audit log of login events
```

## Step 2 classification

```markdown
## Scope Classification

### Must Have (ship-blocking)
1. User authentication with email/password
4. Email verification

### Should Have (next iteration)
3. Password reset flow
5. Remember me / persistent sessions
6. Account settings page

### Could Have (if time permits)
2. OAuth integration (Google, GitHub)
7. Profile picture upload

### Won't Have (future work)
8. Two-factor authentication
9. Session management
10. Audit log
```

## Step 4 revised plan

```markdown
## Revised Plan: [feature name] — MVP

### This Iteration
- [ ] Task 1: [must-have item]
- [ ] Task 2: [must-have item]
- [ ] Task 3: [must-have item]

### Follow-up (add to BACKLOG.md, each with its target)
- Password reset flow (next iteration)
- Remember me / persistent sessions (next iteration)
- Account settings page (next iteration)
- OAuth integration (if time permits, else the following iteration)
- Profile picture upload (if time permits, else the following iteration)
- Two-factor authentication (future milestone)
- Session management (future milestone)
- Audit log (future milestone)
```

## Step 5 cut summary

```markdown
## Scope Reduction: [feature name]

**Original scope:** 10 items
**Revised scope:** 2 items (Must Haves only)
**Reason:** [complexity exceeded estimate / time constraint / dependency blocked]

**What ships now:**
- Email/password authentication
- Email verification

**What ships next:**
- Password reset, persistent sessions, account settings

**What's deferred:**
- OAuth, 2FA, session management, audit log

**Trade-off:** Users can sign up and log in. They can't reset passwords yet —
support team handles resets manually until the next iteration.
```
