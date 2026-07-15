# Dev-local API_BEARER_TOKEN rotation (interim mitigation)

Context: `stack-deploy.yaml` previously had a hardcoded `API_BEARER_TOKEN` in git history (local commits after `dbf8aea`). That history was already rewritten and force-pushed clean (task `t_fae65b62`) — `origin/dispenser` and local `dispenser` now only reference `${API_BEARER_TOKEN}` as an env var, no literal value in the repo. Verified: `git log origin/dispenser -p -- stack-deploy.yaml` shows no hardcoded value.

**This does not undo the fact the old token value was visible in git history at some point.** Production rotation is tracked separately in Kanban task `t_bd40d81a` (blocked, needs human access to the real production secret store — do not touch that).

This task is a narrower, dev-safe interim step: rotate the value in the **local, gitignored `.env`** file only (never tracked by git — confirmed via `git ls-files`).

## Rules

- Never print, echo, log, or include the old or new token value anywhere — not in comments, not in the report, not in commit messages.
- Do not touch any production secret store, remote deployment, or `docker-compose.prod*`/`stack-deploy.yaml` committed files.
- Do not force-push or rewrite git history further — that part is already done.
- Only file in scope: local `.env` (untracked, gitignored). Do not create or modify any tracked file.

## Steps

1. Read the current `.env` `API_BEARER_TOKEN` value privately (do not output it).
2. Generate a new cryptographically random token (e.g. 32+ bytes, base64 or hex) and write it into `.env`, replacing the old value.
3. If a local dev server process is currently running against the old token, restart it so it picks up the new value. If nothing is running locally, just note that.
4. Verify: a request with the OLD token is rejected (401/403) and a request with the NEW token succeeds — without printing either value. Report only pass/fail of each check.
5. Do not modify `.env.example` (it already correctly has no default value).

## Report

Comment on Kanban task (this task's own card) with: confirmation that `.env` was rotated, old-token-rejected check result, new-token-accepted check result, whether a local server was restarted. No token values in the comment.

Do not touch `t_bd40d81a` — production rotation there remains a separate, still-blocked human action.
