---
description: "Git workflow and safety rules for the Botro fork of World of ClaudeCraft. Covers remote checks, end-of-session commit/push policy, mandatory audits, codebase preservation, and anti-drift guardrails for agentic work."
trigger: always_on
---

# Git Workflow and Safety Rules

These are standing rules for ALL work in this repository (the Botro fork of
World of ClaudeCraft). Apply them on every task, every session.

## 1. Remote Check Before Anything

Always check the remote repository state before editing or pushing:

- Run `git fetch origin` and `git status --short --branch`.
- Compare `HEAD` against `origin/main` (`git rev-list --left-right --count`).
- Review `git diff` / `git diff --stat` to understand the working tree.
- Avoid regression: never discard or overwrite existing work.
- Purely additive changes on top of `origin/main` should fast-forward fine.
- If `origin/main` has diverged (commits not in `HEAD`): STOP, do not
  auto-merge/rebase/cherry-pick — report the divergence to the user.

## 2. End-of-Session Commit and Push

When a task is complete and verified, commit AND push so collaborating
developers can see the updated commits:

- Stage explicit paths (never blind `git add .` without auditing untracked
  files first).
- Write a descriptive commit message focused on the why/scope.
- Push normally (`git push origin HEAD:main`); NEVER force-push.
- Verify post-push: `git rev-parse HEAD` must equal `git rev-parse origin/main`.
- Do not commit broken or unverified work — gates in section 3 come first.

## 3. Review, Audit, and Verification Are Mandatory

Before any commit/push:

- `npx tsc --noEmit` must pass.
- `npm run build:bundle` must pass.
- Run all relevant tests for the changed area (PT suites, charselect,
  formation, snapshots, server, CSS as applicable).
- Review the full `git diff` of every file being committed.
- Check for secrets, generated-file drift, debug leftovers, and accidental
  deletions.
- If a pre-existing test failure is unrelated to the change, verify it on
  baseline and report it — do not hide it or fix unrelated code to silence it.

## 4. Preserve the Existing Codebase

- Maintain the current codebase structure, design, engine choices, and
  implementations.
- If a change would require major structural/design/engine modifications,
  STOP and discuss with the user first — do not silently refactor.
- Preserve prior PT work, Botro fork identity, LFS infrastructure, and all
  co-developer contributions.
- Restore build-generated file changes (e.g. `manifest.generated.ts`) to
  baseline unless they are intentional.

## 5. Agentic Anti-Drift Guardrails

When delegating to agentic tools or subagents — and in this agent's own work:

- Avoid unnecessary or new logic that is not required by the task.
- Prefer the smallest correct change over speculative abstractions.
- Watch for context drift: long sessions can cause hyper-autonomous edits
  that introduce more bugs than fixes.
- Re-read the relevant code before editing; verify assumptions with tools.
- Every modification must be explainable as safe and in-scope.
