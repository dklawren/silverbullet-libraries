---
name: "Library/Dklawren/Github"
tags: meta/library
---

# GitHub Pull Requests

Queries GitHub PR data via the REST Search API and renders a live widget or inline list. Supports filtering by repo, PR state, and your role (review-requested, author, assignee).

---

## Requirements

- **[Silverbullet](https://silverbullet.md)** — this library runs inside Silverbullet using Space Lua.
- A [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope *(optional — only needed for private repos or to raise the API rate limit from 60 to 5000 req/hr)*.

---

## Quick Start

1. **Copy this page** into your Silverbullet space (e.g. `Library/Custom/Github.md`).
2. **Edit the config block** below — set `username` and add your repos.
3. **Embed on any page** — add `${Github.getPRsWidget()}` to render a live PR table.

---

## Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `username` | string | *(required)* | Your GitHub username |
| `token` | string | `nil` | Personal Access Token. Create at [github.com/settings/tokens](https://github.com/settings/tokens). Needed for private repos; also raises rate limit from 60 to 5000 req/hr |
| `repos` | `{string}` | `{}` | List of `"owner/repo"` strings to restrict results to. Empty list searches all of GitHub (very broad — always set this) |

---

## Query Options

Pass an options table to `Github.getPRs(opts)` or `Github.getPRsWidget(opts)` to override config defaults per call.

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `role` | `"review-requested"`, `"author"`, `"assignee"` | `"review-requested"` | Your relationship to the PR |
| `state` | `"open"`, `"closed"`, `"merged"` | `"open"` | PR state filter |
| `review` | `"none"`, `"approved"`, `"changes_requested"`, `"required"` | *(unset)* | Filter by review status |
| `repos` | `{string}` | config `repos` | Override repo list for this call only |
| `username` | string | config `username` | Override username for this call only |

---

## Configuration

Edit the block below to configure the library.

```lua
config.set("github", {
  -- Required: your GitHub username
  username = "your-github-username",

  -- Optional: Personal Access Token
  -- Needed for private repos; raises rate limit from 60 to 5000 req/hr.
  -- Create one at: https://github.com/settings/tokens
  -- Minimum scope: "repo" for private repos, or no scopes for public-only access.
  token = nil,

  -- Repos to query. Format: "owner/repo". Always set this — an empty
  -- list will search across all of GitHub and return unexpected results.
  repos = {
    "owner/repo1",
    "owner/repo2",
  },
})
```

---

## Templates

```space-lua
-- Renders a single GitHub PR as a markdown list item.
-- Pre-computed display fields (repo, author, age, draftLabel, labelStr)
-- are added by Github.getPRs() before this template is called.
-- Usage: ${template.each(Github.getPRs(opts), templates.githubPrItem)}
templates.githubPrItem = template.new([==[
* [**${repo}#${number}**](${html_url}) ${title} — `${state}`${draftLabel} — @${author}${labelStr} — ${age}
]==])
```

---

## API

```space-lua
Github = Github or {}

-- Replace spaces with + for GitHub search query string encoding.
function Github.urlEncode(str)
  return str:gsub(" ", "+")
end

-- Make an authenticated GET request to the GitHub REST API.
function Github.apiCall(path)
  local cfg = config.get("github") or {}
  local headers = {
    ["Accept"]               = "application/vnd.github+json",
    ["X-GitHub-Api-Version"] = "2022-11-28",
    ["User-Agent"]           = "Silverbullet-Github-Library",
  }
  if cfg.token and cfg.token ~= "" then
    headers["Authorization"] = "Bearer " .. cfg.token
  end
  js.log("[Github] GET " .. path)
  return net.proxyFetch("https://api.github.com/" .. path, {
    method  = "GET",
    headers = headers,
  })
end

-- Format an ISO-8601 date string (YYYY-MM-DDTHH:MM:SSZ) as a human-readable age.
function Github.formatAge(dateStr)
  if not dateStr then return "?" end
  local y, mo, d = dateStr:match("^(%d+)-(%d+)-(%d+)")
  if not y then return "?" end
  local t    = os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d), hour = 12, min = 0, sec = 0 })
  local days = math.floor((os.time() - t) / 86400)
  if days <= 0     then return "today"
  elseif days == 1 then return "1d ago"
  elseif days < 30 then return days .. "d ago"
  elseif days < 365 then return math.floor(days / 30) .. "mo ago"
  else                   return math.floor(days / 365) .. "y ago"
  end
end

-- Add computed display fields to a raw GitHub Search API PR object.
local function enrichPR(pr)
  pr.repo       = pr.repository_url and pr.repository_url:match("repos/(.+)$") or ""
  pr.author     = pr.user and pr.user.login or "?"
  pr.age        = Github.formatAge(pr.created_at)
  pr.draftLabel = pr.draft and " _(draft)_" or ""
  local lbls = {}
  for _, lbl in ipairs(pr.labels or {}) do
    table.insert(lbls, "`" .. lbl.name .. "`")
  end
  pr.labelStr = #lbls > 0 and (" " .. table.concat(lbls, " ")) or ""
  return pr
end

-- Execute a GitHub search query and return enriched PR objects (up to 50, newest first).
function Github.searchPRs(q)
  local resp = Github.apiCall(
    "search/issues?q=" .. Github.urlEncode(q) .. "&per_page=50&sort=updated&order=desc"
  )
  js.log("[Github] status=" .. tostring(resp.status) .. " ok=" .. tostring(resp.ok))
  if not resp.ok then
    error("GitHub API error (HTTP " .. tostring(resp.status) .. ")")
  end
  local items = resp.body.items or {}
  local prs = {}
  for _, pr in ipairs(items) do
    table.insert(prs, enrichPR(pr))
  end
  return prs
end

-- Fetch pull requests matching the given options.
--
-- opts fields (all optional, fall back to config values):
--   role     "review-requested" | "author" | "assignee"  (default: "review-requested")
--   state    "open" | "closed" | "merged"                 (default: "open")
--   review   "none" | "approved" | "changes_requested" | "required"  (optional, no default)
--   repos    {string}  override config repos for this call
--   username string    override config username for this call
function Github.getPRs(opts)
  opts = opts or {}
  local cfg      = config.get("github") or {}
  local username = opts.username or cfg.username or ""
  local repos    = opts.repos    or cfg.repos    or {}
  local role     = opts.role     or "review-requested"
  local state    = opts.state    or "open"

  if username == "" then
    error("Github: username not configured — set username in config.set('github', {...})")
  end

  local stateQ = state == "merged" and "is:merged" or ("is:" .. state)
  local q      = "is:pr " .. stateQ

  if role == "review-requested" then
    q = q .. " review-requested:" .. username
  elseif role == "author" then
    q = q .. " author:" .. username
  elseif role == "assignee" then
    q = q .. " assignee:" .. username
  end

  if opts.review then
    q = q .. " review:" .. opts.review
  end

  for _, repo in ipairs(repos) do
    q = q .. " repo:" .. repo
  end

  return Github.searchPRs(q)
end

-- Build the pull-request table as a bare `dom` node (no widget wrapper),
-- so it can be embedded inside other widgets (e.g. dashboard grid cards).
-- Accepts the same opts table as Github.getPRs().
-- Columns: PR (repo#number + title) | State | Author | Labels | Age
function Github.getPRsDom(opts)
  local prs = nil
  local ok, err = pcall(function()
    prs = Github.getPRs(opts)
  end)

  if not ok then
    return dom.span {
      class = "github-error",
      "**GitHub error:** " .. tostring(err),
    }
  end

  if not prs or #prs == 0 then
    return dom.span { "Nothing right now" }
  end

  local rows = {}
  for _, pr in ipairs(prs) do
    table.insert(rows, dom.tr {
      dom.td { "[**" .. pr.repo .. "#" .. tostring(pr.number) .. "**](" .. (pr.html_url or "#") .. ") " .. (pr.title or "") },
      dom.td { "`" .. (pr.state or "open") .. "`" .. pr.draftLabel },
      dom.td { "@" .. pr.author },
      dom.td { pr.labelStr },
      dom.td { pr.age },
    })
  end

  return dom.table {
    class = "github-prs-widget",
    dom.thead {
      dom.tr {
        dom.td { "**PR**" },
        dom.td { "**State**" },
        dom.td { "**Author**" },
        dom.td { "**Labels**" },
        dom.td { "**Age**" },
      }
    },
    dom.tbody(rows),
  }
end

-- Render a live HTML widget showing pull requests (thin wrapper around
-- Github.getPRsDom so it can be dropped into a page on its own).
function Github.getPRsWidget(opts)
  return widget.htmlBlock(Github.getPRsDom(opts))
end
```

---

## Usage Examples

### PRs Awaiting Your Review (default)

```
${Github.getPRsWidget()}
```

### Your Open PRs

```
${Github.getPRsWidget({ role = "author" })}
```

### PRs Assigned to You

```
${Github.getPRsWidget({ role = "assignee" })}
```

### Closed PRs in a Specific Repo

```
${Github.getPRsWidget({ state = "closed", repos = { "owner/repo" } })}
```

### Merged PRs Authored by You

```
${Github.getPRsWidget({ role = "author", state = "merged" })}
```

### Markdown List (template.each)

Useful for embedding PR lists inside other templates or dashboards.

```
${template.each(Github.getPRs(), templates.githubPrItem) or "Nothing right now"}
```

### Combined Widget: Review Queue + Your Open PRs

```
## PRs Awaiting My Review
${Github.getPRsWidget({ role = "review-requested" })}

## My Open PRs
${Github.getPRsWidget({ role = "author" })}
```

---

## Notes

- **Rate limits** — unauthenticated requests are limited to 60/hr per IP. Set a `token` to raise this to 5000/hr.
- **Reviewers c)lumn** — the GitHub Search API does not return `requested_reviewers` on search results. Fetching it would require one additional API call per PR. Omitted to avoid rate limit pressure.
- **Result cap** — queries return at most 50 results (GitHub Search API max is 100; this library uses 50 to stay within typical rate budgets). If you need more, adjust `per_page` in `Github.searchPRs`.
- **Private repos** — set `token` with `repo` scope. Without a token, private repos are invisible to the API and queries will return no results for them without error.
