# Decision: Remote History Rewrite for Exposed Bearer Token

**Status:** DECIDED — **NO-GO**  
**Date:** 2026-07-14  
**Author:** identityauth (Hermes Agent)  
**Repository:** phcaradanai/vending-3d-ctl-agent (public, 0 forks)

---

## 1. What Happened

| Detail | Value |
|---|---|
| Exposed commit | `814f4a0` — "auth bearer api protech route." |
| Author / date | Oc <oc_2012@hotmail.com>, 2026-05-12 10:35 +0700 |
| File | `.env.example` |
| Exposed value | `API_BEARER_TOKEN=-gZ5HxVWBdq1mYF8tJ-C4yAzj7ZO5XtKO2jRv188W8A` |
| "Removed" in | `e720467` — "add iso29110" (2026-05-12 11:47 +0700, ~72 min later) |
| Commits since exposure | 27 |
| Token status | **ROTATED** (no longer valid) |
| Branches affected | `main`, `dispenser` (identical history; same merge base at `d2893a0`) |
| Collaborators | 2 (phcaradanai, Oc) |

The bearer token was committed as a **default example value** in `.env.example` — a template file meant for documentation, not for live secrets. It was replaced with an empty string 72 minutes later, but the original value remains in Git history and is trivially recoverable via `git log -p`.

---

## 2. Risk Assessment

### Current state
- **Token is rotated** — the value in Git history is a dead credential. It grants zero access to any system.
- **Public repo** — anyone can discover the old token. A GitHub code search for the substring would surface it.
- **0 forks** — no downstream repositories have independently captured and re-published this token.
- **`.env.example` file** — this is a documentation template, not a committed `.env` with live secrets. The presence of a placeholder (even a real-looking one) in an example file is a documentation hygiene issue, not a live credential leak.

### If we do nothing
- The dead token remains in public Git history indefinitely.
- Any future security scanner (GitGuardian, truffleHog, GitHub secret scanning) will flag this commit as a finding — this may trigger noise in CI or security dashboards.
- There is **no operational security risk**: the credential is dead.
- Reputation: a public repo with a "leaked secret" finding may raise eyebrows, but the finding is easily explained as a rotated example value.

### If we force-push a rewrite
- All 27 commits (and their SHAs) are destroyed and recreated.
- Every collaborator must reset their local clone (`git fetch --force && git reset --hard origin/main`).
- CI/CD pipelines referencing commit SHAs break.
- Any open PRs, tags, or deployment references become invalid.
- Risk of botched rewrite: if done incorrectly, the old commits can be resurrected by a stale remote ref or reflog, making the effort wasted.

---

## 3. Decision: NO-GO

**We will NOT perform a remote history rewrite.**

### Rationale

1. **The token is dead.** A rotated credential has zero value. Rewriting history to hide something that can no longer be exploited is pure cosmetics — it does not improve security.

2. **The disruption is disproportionate.** 27 commits of collaborative work would be rewritten, requiring both contributors to re-sync their local repos, and breaking any CI/deploy pipelines that reference commit SHAs. The operational cost far exceeds the benefit of hiding a dead string.

3. **`.env.example` is documentation, not a leak.** The file is explicitly named `.env.example` — its purpose is to show the expected format. Accidentally putting a real token in the example was a mistake, but it was corrected within 72 minutes and the token was subsequently rotated. This is a documentation hygiene issue, not a breach.

4. **GitHub's own guidance** recommends against rewriting public history for rotated credentials:
   > "If you've rotated the compromised credentials, the secret is no longer valid and a rewrite may not be necessary. Consider whether the disruption to collaborators is worth the cleanup."

5. **0 forks** means no amplification — no one has independently cloned and re-published this token in their own repo. The blast radius is contained to this single repo.

---

## 4. Recommendations (Non-Rewrite Mitigations)

### Immediate (do now)
- **Verify the token is fully rotated** — confirm the new token is deployed to production and the old value is rejected by the API bearer auth middleware.
- **Add `.env` to `.gitignore`** (already done — confirmed in current tree).
- **Review all other commits** in `814f4a0..e720467` for any additional secrets — run `git log -p 814f4a0..e720467 | grep -iE '(token|secret|password|key)'` to catch any other accidental commits.

### Short-term
- **Enable GitHub secret scanning push protection** on the repo (Settings → Code security → Secret scanning). This prevents future pushes that contain detectable secret patterns.
- **Add a pre-commit hook** (`detect-secrets` or `truffleHog`) to catch secrets before they enter the commit graph.
- **Mark the finding as "resolved — rotated"** in any secret scanning dashboard (GitGuardian, truffleHog, GitHub Advanced Security if enabled) to suppress false-alarm noise.

### If rewrites are reconsidered later
- Use `git filter-repo` (not `git filter-branch`), which is the modern, safer tool.
- Coordinate a maintenance window with all collaborators.
- Ensure all tags and release refs are covered by the rewrite.
- Plan for CI/CD re-trigger and deployment validation.
- The earliest clean cut-point would be `814f4a0` (the introducing commit), meaning **all 27 subsequent commits must be rebased**.

---

## 5. Conclusion

**NO-GO on remote history rewrite.** The token is rotated and dead. The operational disruption of force-pushing 27 commits outweighs the cosmetic benefit of removing a dead credential from a public `.env.example` template. Focus effort on preventing recurrence (secret scanning, pre-commit hooks) rather than retroactive cleanup of a non-threat.
