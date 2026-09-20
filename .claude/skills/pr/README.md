# pr

Conventional Commits PR, minimal body

## What it does

Opens a pull request with a Conventional Commits title derived from the branch's commits, and a body of one or two sentences. Bullets only when the branch carries several unrelated changes. No headings, no test plans, no checklists, no file-by-file summary. Pushes the branch first if it has no upstream, refuses to open a PR from the default branch, and confirms the title and body before creating.

## How to invoke

```
/pr
```

## Example output

Branch adds one endpoint.

```
Title: feat(api): add GET /users/:id/profile

Serves profile data without the full user payload, so the mobile
client does not pay for it on cold launch.

Closes #128

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Branch carries two unrelated UI fixes.

```
Title: fix(ui): correct footer wrapping and control sizing

- Footer separators no longer wrap away from the icons
- Transport controls match at every breakpoint

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## See also

- [`SKILL.md`](./SKILL.md) — full LLM-facing instructions
- [`../commit/README.md`](../commit/README.md) — the commit-message counterpart
