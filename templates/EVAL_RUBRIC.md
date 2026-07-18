# Eval Rubric Guide

Maps acceptance criteria from a PRD to verifiable checks. Use this to evaluate AI-generated output before shipping.

## Two Kinds of Evaluation

The paper distinguishes both — you need both:

| Type | What It Checks | How |
|---|---|---|
| **Output eval** | The final artifact — does it compile, pass tests, satisfy ACs? | Run tests, manual checks |
| **Trajectory eval** | *How* the agent got there — did it take reasonable steps? Did it skip verification? | Review tool call sequence |

## Rubric Template

### AC Coverage

For each acceptance criterion from the PRD:

| AC | Pass/Fail | Notes |
|---|---|---|
| AC-1: [description] | ✅ / ❌ | [evidence or issue] |
| AC-2: [description] | ✅ / ❌ | [evidence or issue] |
| AC-3: [description] | ✅ / ❌ | [evidence or issue] |

### Code Quality

| Check | Pass/Fail | Notes |
|---|---|---|
| Compiles / passes type check | ✅ / ❌ | |
| Follows project conventions (AGENTS.md) | ✅ / ❌ | |
| Error handling on all external calls | ✅ / ❌ | |
| Loading/empty/error states present | ✅ / ❌ | |
| No dead code or commented-out blocks | ✅ / ❌ | |
| No hardcoded secrets or test data leaked | ✅ / ❌ | |

### Edge Cases

For each edge case defined in the PRD:

| Edge Case | Handled? | How |
|---|---|---|
| [empty state] | ✅ / ❌ | [handling approach] |
| [error condition] | ✅ / ❌ | [handling approach] |
| [permission boundary] | ✅ / ❌ | [handling approach] |
| [concurrency/race] | ✅ / ❌ | [handling approach] |

### AI-Specific Failure Checks

These are failure modes unique to AI-generated code:

| Check | Pass/Fail | Notes |
|---|---|---|
| Imports reference real packages (not hallucinated) | ✅ / ❌ | |
| Function signatures match actual APIs | ✅ / ❌ | |
| No plausible-looking but wrong logic | ✅ / ❌ | |
| Error messages are descriptive, not generic | ✅ / ❌ | |
| No unnecessary abstractions or over-engineering | ✅ / ❌ | |
| Tests actually test the right thing (not tautologies) | ✅ / ❌ | |

### Trajectory Evaluation

| Check | Pass/Fail | Notes |
|---|---|---|
| Agent ran tests before declaring done | ✅ / ❌ | |
| Agent handled failures with retries, not ignore | ✅ / ❌ | |
| Agent stayed within scope (didn't add extra features) | ✅ / ❌ | |

## Scoring

- **Ship-ready:** All ACs pass, no AI-specific failures, edge cases handled
- **Needs minor fixes:** ACs pass but 1-2 AI-specific failures
- **Needs rework:** Any AC fails OR trajectory eval shows skipped verification
- **Redo with better spec:** Multiple ACs fail — spec was insufficient, go back to PRD

## Usage

Include this rubric in the PRD as a final section. When implementation is complete, the agent should self-evaluate using this rubric and report results.
