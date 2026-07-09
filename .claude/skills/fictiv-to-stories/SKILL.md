---
name: fictiv-to-stories
description: Break an Epic into independently-grabbable stories in Jira using tracer-bullet vertical slices.
---

# To Stories

Break an Epic into independently-grabbable stories using vertical slices (tracer bullets).

## Process

### 1. Gather context

1. Find the Jira epic ID from the conversation context. If you cannot find the Jira epic ID, ask the user to provide one before continuing. Fetch the epic from Jira using the Atlassian MCP and read its full body, which contains the PRD, as well as the comments.

2. Find the TDD for this epic within the docs/tdds folder of this repository. Read its full body to inform the creation of stories. The TDD filename will include the Jira epic ID.

3. The Claude Design project is linked within the TDD. Fetch the project and use it to inform your technical designs.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft the issues

Break the plan into **tracer bullet** issues, following the **Vertical slice rules**. A **wide refactor** is the exception to that rule — slice it by **expand–contract** instead (see **Wide refactors**).

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new story to Jira as a child of the project epic, using the **Issue body template**. These issues are considered ready for agentic development.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers. Link blocking issues using the Jira "blocked by" property.

Do NOT close or modify any parent issue.

## Reference

### Vertical slice rules

Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Any prefactoring should be done first

### Wide refactors

A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own issue blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in an issue blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify issue — green is promised only there.

### Issue body template

<issue-template>

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
      </issue-template>
