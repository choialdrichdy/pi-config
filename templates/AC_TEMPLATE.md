# Writing Good Acceptance Criteria for AI

Good acceptance criteria are the **contract between you and the AI**. They tell the model what "done" means more precisely than any natural-language prompt.

## Rule of thumb

Each AC should be testable by a human or script in under 30 seconds. If you can't tell whether it passes or fails, it's too vague.

---

## The Patterns

### 1. Action → Result (Happy Path)

```
[A user can] [do something] and [see a specific outcome]
```

**Vague:** "The export should work well"
**Good:** "A user can click 'Export PDF' and receive a downloadable file within 5 seconds"
**Why:** Specifies the trigger, the output, and a performance bound

### 2. Condition → Behavior (Edge Cases)

```
When [condition], the system [specific behavior]
```

**Vague:** "Handle errors gracefully"
**Good:** "When the PDF service returns a 503, the user sees 'Export temporarily unavailable — try again in a few minutes' and the button re-enables after 30 seconds"
**Why:** Specifies the exact error, the exact UI state, and the recovery behavior

### 3. Negative Constraint (What NOT to do)

```
The system must NOT [undesired behavior]
```

**Vague:** "Don't expose internal data"
**Good:** "The export must NOT include internal user IDs, database timestamps, or admin-only fields"
**Why:** AI loves to include "helpful" debug info. Explicit negatives stop it.

### 4. State Transition (Before/After)

```
When [user does X] then [state A] → [state B]
```

**Vague:** "Track the export status"
**Good:** "After clicking Export, the status shows 'Generating...', then changes to 'Ready for download' with a link, or to 'Failed' with a retry button"
**Why:** Maps the full lifecycle so the AI doesn't skip intermediate states

### 5. Quantitative Bound (Performance/Scale)

```
[Action] completes within [time limit] under [conditions]
```

**Vague:** "The page should load fast"
**Good:** "The report list page renders the first 50 results in under 2 seconds on a 4G connection"
**Why:** Gives the AI a concrete target to optimize toward

---

## Common AC Anti-Patterns

| Bad Pattern | Why It Fails | Fix |
|---|---|---|
| "Should work well" | Untestable | Add a measurable bound |
| "Handle errors" | Vague — which errors? | Name specific error codes/conditions |
| "Be responsive" | Subjective | Target specific device/viewport |
| "Support multiple formats" | Unbounded | List the exact formats: PDF, CSV |
| "Keep it secure" | Too broad | Name specific threats: no SQLi, no hardcoded keys |
| "Follow existing patterns" | Assumes the AI knows them | Link to an example file or pattern doc |

---

## Placement in PRD

Write ACs **before** implementation starts. The paper calls them "the contract with the AI." They serve double duty:

1. **Specification** — tells the AI what correct looks like
2. **Eval suite** — becomes the test checklist for verification

When you review AI-generated code, check each AC one by one. If the AI missed one, it's not done.
