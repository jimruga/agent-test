---
name: fictiv-implement
description: "Implement a Jira story."
disable-model-invocation: true
---

Implement the work described by the story. A Jira issue ID should be specified in the conversation context; if it is not, get it from the user. Using the Atlassian MCP, pull the story and implement it as described. You may also need further context from the following sources:

- The Jira epic (parent of the specified story), whose description contains the PRD.
- The technical design document - stored in this repository in docs/tdds, the filename should contain the epic ID
- The visual designs - the TDD should contain a link to the Claude Design project.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.
