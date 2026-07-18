---
name: code-review-ai
description: Structured code review for AI-generated code. Covers AI-specific failure modes, AC coverage, edge cases, and trajectory checks. Use when reviewing output from any coding agent before shipping.
---

# Code Review for AI-Generated Code

Reviewing AI-generated code is different from reviewing human code. The failure modes are different, and the things that "look right" are often where bugs hide.

The paper says: *"Review every line the agent produces that is going to ship. Be skeptical of anything that looks clever. Check imports for real packages. Verify that error handling covers realistic failure modes. Code that the team does not understand becomes debugging cost the team cannot afford."*

## Prerequisites

The PRD and eval rubric should exist. If they don't, create them first (use the PRD engineering skill and eval rubric template).

## Review Workflow

### Step 1: Load Context

Read:
- The PRD spec (to check AC coverage)
- All files changed by the agent
- The eval rubric (if one exists)

### Step 2: Run the AI-Specific Checklist

These are the patterns that are most common in AI-generated code and most likely to be wrong:

**Hallucinated Dependencies**
- [ ] Does every import/require resolve to a real package?
- [ ] Are there any invented API methods or properties?
- [ ] Do the installed package versions match what's in the project?

**Plausible but Wrong Logic**
- [ ] Does the logic actually do what the AC describes? (AI often writes code that *looks* correct but has off-by-one, wrong condition, or inverted logic)
- [ ] Are there any empty catch blocks or `.catch(() => {})`?
- [ ] Are there any hardcoded values that should be configurable?

**Missing Error Handling (The 20% Problem)**
- [ ] Every external call (API, DB, file system) has try/catch or equivalent
- [ ] Error messages include actionable information (what failed and why)
- [ ] Network failures have retry logic or sensible fallback
- [ ] Empty states are handled (loading, empty, error, success)

**Over-Engineering**
- [ ] Did the AI add abstractions, factories, or patterns that weren't asked for?
- [ ] Is there any dead code or unused exports?
- [ ] Is there any code that's "clever" but harder to read than a simpler version?

**Security**
- [ ] No hardcoded API keys, tokens, or credentials
- [ ] No SQL injection vectors (parameterized queries or ORM)
- [ ] No exposed internal data in responses
- [ ] Authentication/authorization checks on protected endpoints

**Testing**
- [ ] Tests actually test the behavior, not just that code runs without error
- [ ] Tests cover edge cases from the PRD, not just happy path
- [ ] No tautological tests (e.g., `expect(true).toBe(true)`)

### Step 3: Check AC Coverage

Map each acceptance criterion from the PRD to the code:

| AC | Status | Evidence |
|---|---|---|
| AC-1: [description] | ✅ / ❌ | [file:line or test] |
| AC-2: [description] | ✅ / ❌ | [file:line or test] |
| ... | | |

If any AC is not covered, flag it as a blocker.

### Step 4: Check Edge Cases

For each edge case in the PRD, verify explicit handling exists:

| Edge Case | Handled? | Where |
|---|---|---|
| [empty state] | ✅ / ❌ | [location] |
| [error condition] | ✅ / ❌ | [location] |

### Step 5: Trajectory Check

- [ ] Did the agent run tests before declaring done?
- [ ] Did the agent handle intermediate failures (test fails → fix → retest)?
- [ ] Did the agent stay within scope? (check file changes against PRD non-goals)

### Step 6: Summary

```
## Code Review Summary

### Verdict: Ship / Minor Fixes / Rework / Redo Spec

### AC Coverage: [N]/[M] passing

### Issues Found
1. [Critical] [description] — blocks shipping
2. [Minor] [description] — fix before next PR
3. [Question] [description] — needs author clarification

### Files Reviewed
- [file1] — [summary]
- [file2] — [summary]
```

## Verdict Definitions

| Verdict | Meaning | Action |
|---|---|---|
| **Ship** | All ACs satisfied, no AI-specific issues | Merge |
| **Minor Fixes** | ACs pass, 1-2 minor AI issues | Fix, then merge |
| **Rework** | Any AC fails or trajectory issues | Fix and re-review |
| **Redo Spec** | Multiple ACs fail — the spec was insufficient | Go back to PRD |

## When Reviewing Your Own Work

When I (the AI) produce code, I should self-review using this checklist before presenting the output. Flag any issues found. The paper says: *"The developers who navigate this challenge most effectively... use AI for what it's good at while reserving their own attention for what AI struggles with."*

Self-review catches the obvious AI errors. Human review catches the subtle ones.
