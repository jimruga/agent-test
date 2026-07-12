#!/usr/bin/env bash
# Makes the CI checks BINDING — this is what turns verification from a script an
# agent can skip into a control it cannot bypass. Run once per repo (needs the
# GitHub CLI `gh` authenticated with admin on the repo).
#
#   ./setup-branch-protection.sh <owner> <repo> [branch]
#
# After this, on `main`:
#   • the `all-green` status check MUST pass before merge (red CI = no merge);
#   • the branch must be up to date with main before merge;
#   • at least one approving review is required, AND the last pusher cannot be
#     the approver (require_last_push_approval) — the seed of segregation of
#     duties: the agent that wrote the code cannot approve its own merge;
#   • stale approvals are dismissed on new pushes;
#   • conversations must be resolved; history stays linear;
#   • force-pushes and branch deletion are disabled; rules apply to admins too.
set -euo pipefail
OWNER="${1:?owner}"; REPO="${2:?repo}"; BRANCH="${3:-main}"
command -v gh >/dev/null || { echo "GitHub CLI 'gh' not found"; exit 1; }

gh api -X PUT "repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=all-green" \
  -F "enforce_admins=true" \
  -F "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -F "required_pull_request_reviews[require_last_push_approval]=true" \
  -F "required_linear_history=true" \
  -F "required_conversation_resolution=true" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false" \
  -F "restrictions=null"

echo "Branch protection applied to $OWNER/$REPO@$BRANCH."
echo "Note: 'all-green' must have run at least once on a PR before GitHub lists it as a known check."
echo "For stronger segregation of duties, add a CODEOWNERS file and a repository ruleset"
echo "requiring CODEOWNER review on the relevant paths (e.g. migrations/, infrastructure/)."
