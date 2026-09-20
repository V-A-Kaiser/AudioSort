---
name: pr
description: Open a pull request with a Conventional Commits title and a minimal body. Use for /pr.
---

Open a pull request titled in the Conventional Commits format, with a body kept deliberately small.

## Title

Same shape as a commit subject:

- `<type>(<scope>): <imperative summary>` — `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove" — not "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period
- Breaking change → `!` before the colon: `feat(api)!: ...`

Derive it from the branch's commits:

- One commit → reuse its subject
- Several of one type → write a subject covering them
- Several types → use the type of the change that matters most, not `chore`

## Body

One or two sentences of plain prose: what the branch does, and why when the why is not obvious.

- Add `-` bullets only when the branch carries several unrelated changes — one per change, no nesting
- Reference an issue at the end when one applies: `Closes #42`
- End with the attribution trailer:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

**What NEVER goes in:**

- Headings, test plans, checklists, screenshot sections
- A file-by-file summary — the diff is right there
- Restating the title
- "This PR does X", "I", "we"

## Steps

1. Push the branch if it has no upstream: `git push -u origin HEAD`
2. Base on the repository's default branch unless told otherwise
3. Show the user the title and body, and confirm before opening — a PR is outward-facing
4. `gh pr create --title "<title>" --body "<body>"`
5. Report the URL

Never open a PR from the default branch. If `HEAD` is the default branch, stop and ask.

## Examples

Branch adds one endpoint:

```
Title: feat(api): add GET /users/:id/profile

Serves profile data without the full user payload, so the mobile
client does not pay for it on cold launch.

Closes #128

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Branch carries two unrelated UI fixes:

```
Title: fix(ui): correct footer wrapping and control sizing

- Footer separators no longer wrap away from the icons
- Transport controls match at every breakpoint

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
