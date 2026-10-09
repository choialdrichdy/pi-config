---
name: spec-driven
description: Implements features against a structured PRD spec. Traces every code change to acceptance criteria, prevents scope creep, and flags ambiguous requirements before coding. Activate when starting implementation from a PRD.
---

# Spec-Driven Implementation

Follow this workflow when implementing a feature from a PRD document.

## Prerequisites

A PRD document must exist before any code is written. The PRD should have been generated using the PRD engineering skill or an equivalent structured process.

## Workflow

### Step 1: Load the Spec

Ask the user: "Which PRD are we implementing? Point me to the file."

Read the PRD file. Extract:
- Acceptance criteria (AC-1, AC-2, etc.)
- Architecture constraints
- Edge cases
- Non-goals

### Step 2: Plan the Implementation

Before writing any code, present a brief plan:

```
## Implementation Plan: [Feature Name]

### Files to create/modify
- [file1] — [purpose]
- [file2] — [purpose]

### AC coverage
- AC-1: [approach]
- AC-2: [approach]
- ...

### Edge cases to handle
- [edge case 1]
- [edge case 2]
```

Ask for confirmation before proceeding.

### Step 3: Implement Against the Spec

Implement changes directly against the approved spec. Keep acceptance-criteria coverage in the implementation plan, tests, and completion summary.

### Step 4: Handle Edge Cases from the PRD

For every edge case listed in the PRD, ensure there is explicit handling. If the PRD doesn't specify an edge case you encounter, flag it:

- "The PRD doesn't specify what happens when [condition]. I'll [default behavior]. Is that correct?"

### Step 5: Non-Goals Check

When you find yourself implementing something that touches a non-goal, **stop and ask**:

- "This is touching a non-goal from the PRD ([cite non-goal]). Should I include it or stop?"

### Step 6: Completion Summary

When done, present a summary:

```
## Implementation Complete: [Feature Name]

### AC Status
- [ ] AC-1: [pass/fail]
- [ ] AC-2: [pass/fail]
- [ ] AC-3: [pass/fail]

### Files Changed
- [file1] — [summary of changes]
- [file2] — [summary of changes]

### Open Questions
- [anything that needs user input]
```

## When There's No Spec

If the user asks you to implement something without a spec:

1. Say: "I don't have a spec for this. Let me create one quickly."
2. Activate the PRD engineering skill.
3. Capture goal + 3 acceptance criteria + non-goals (minimal version, 2 minutes).
4. Get approval.
5. Then implement.

## Guardrails

- **Do not** implement acceptance criteria that are not in the approved PRD
- **Do not** skip edge case handling
- **Do not** add features outside the PRD's scope