---
name: prd-engineering
description: Interview the user to generate PRD
---

# PRD Engineering

Transforms rough feature ideas into structured, implementable Product Requirements Documents. The goal is to produce specs tight enough that AI can build without constant steering.

## When to use this skill

Activate when the user says anything about planning a feature, writing requirements, creating a PRD, or describing something they want to build. Also activate when the user gives a vague paragraph + bullet points — this skill's job is to tighten that into a real spec.

## Core principles

1. **Intent over implementation.** First capture _why_ and _what success looks like_ before discussing _how_.
2. **Boundaries prevent steering.** Explicit non-goals and edge cases eliminate the 20% of ambiguity that causes the most rework.
3. **Acceptance criteria are the contract.** Testable "this works when" statements become both the spec and the eval suite.
4. **Architecture constraints upfront.** Existing patterns, file locations, and conventions must be stated before any code is discussed.

## Workflow: The PRD Interview

When the user describes a feature, do NOT jump to implementation. Instead, run this structured interview. Ask questions one at a time — don't dump everything at once.

### Phase 1: Intent Capture (2-3 questions)

Ask these in order, one at a time:

1. **Core goal:** "What's the single most important thing this feature needs to accomplish? If nothing else works, this must work."
2. **User perspective:** "Who is this for, and what are they trying to do that they can't do today?"
3. **Success signal:** "How will we know this is working? What measurable change will we see?"

### Phase 2: Scope & Boundaries (2-3 questions)

1. **Explicit non-goals:** "What is explicitly NOT in scope for this feature? What are we deliberately NOT solving?"
2. **Edge cases:** "What unusual situations could happen? Empty states, error conditions, permission boundaries?"
3. **Constraints:** "Are there technical or business constraints? Performance requirements? Browser support? Mobile?"

**After each answer, confirm by restating what you heard before moving on.**

❌ Don't: silently accept and move to next question
✅ Do: "Self-hosted on homelab, accessed via Tailscale — got it. Let me note that and move on."

### Phase 3: Acceptance Criteria (collaborative)

Work with the user to write 3-7 concrete, testable acceptance criteria. Do NOT write them all yourself — ask the user to help shape them.

Start with: "Let's write a few acceptance criteria together. What's the first thing that should work?"

Each criterion should be a single sentence starting with a verb:

- "A user can [action] and see [result]"
- "When [condition], the system [behavior]"
- "The system must NOT [undesired behavior]"

Bad: "The export should work well"
Good: "A user can click 'Export PDF' and receive a downloadable PDF within 5 seconds"

After the user gives 1-2, fill in the rest and ask: "These are the ones I'd add — do they match what you're thinking?"

### Phase 4: Architecture Touchpoints (1-2 questions)

Ask even if the project is greenfield — there are always preferences:

1. "Any existing project conventions or preferences? Go project layout, coding style, testing patterns?"
2. "Are there existing services, auth systems, or infrastructure this needs to integrate with (reverse proxy, SSO, monitoring)?"

If working in an existing project, also ask them to point you to relevant files.

### Phase 5: Check before drafting

Before writing the PRD, check with the user:

"I think I have enough to draft a PRD. Shall I write it up?"

This gives the user control over the pace. If they agree, proceed to produce the
structured PRD document (see template). Present it for review before any
implementation begins.

## PRD output format

Use the template at `templates/PRD_TEMPLATE.md`. Fill in every section. If a section genuinely has no content, mark it as "TBD" rather than leaving it blank — that flags it as a known gap.

## Making recommendations

You are always welcome to make recommendations, but frame them as questions first.

❌ Don't: "My recommendation is HTMX."
✅ Do: "For the dashboard, would you prefer minimal Go templates or something with more interactivity like HTMX?"

After the user responds, then offer your recommendation: "I'd lean toward HTMX for this — it gives you a smooth dashboard without a JS framework. But your call."

## Handling vague answers

If the user gives a vague answer to any question, don't just accept it. Push gently:

- "To make sure I understand — could you give me a concrete example?"
- "What would a bad outcome look like for that?"
- "If I had to pick one, which is most important?"

## Pacing: offer the lightweight option proactively

At the start of the interview, offer the user a choice:

"I can do a full PRD (10 sections, ~5 minutes) or a lightweight version (goal + 3 acceptance criteria + non-goals, ~2 minutes). Which do you prefer?"

If the user says "just build it" or seems impatient:

1. Acknowledge the urge — "I get it, let's keep this fast."
2. Do the minimal version: just capture goal + 3 acceptance criteria + non-goals.
3. Produce a lightweight PRD in 2 minutes.
4. Say: "Here's the minimal spec. If anything's wrong, it'll be cheaper to fix now than during implementation."

## Integration with implementation

When the PRD is done and approved:

1. Save it to a `prd/` directory in the project.
2. Reference it in all subsequent implementation conversations.
3. When generating code, cite the specific acceptance criteria you're satisfying.
4. When done, map each acceptance criterion to a test or manual verification step.

## References

Based on "The New SDLC with Vibe Coding" (Day 1 v3):

- Context Engineering: Intent over syntax, structured context reduces steering
- The Factory Model: Specs are the input to the factory; quality of spec determines quality of output
- The 80% Problem: Edge cases and error handling are where AI fails; explicit boundaries fix this
- Conductor vs Orchestrator: Good PRDs let you switch from conductor to orchestrator mode
