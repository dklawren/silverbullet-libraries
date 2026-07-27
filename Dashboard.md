---
name: "Library/Dklawren/Dashboard"
tags: meta/library
share.uri: "github:dklawren/silverbullet-libraries/Dashboard.md"
---

Small helpers for laying out dashboard pages (e.g. [[Home]]) as a responsive
grid of cards instead of one long vertical column.

SilverBullet stacks every `${...}` expression and markdown block vertically, so
a true multi-column layout has to live inside a **single** widget. `Dashboard.grid`
builds that one widget; each cell is a `Dashboard.card`. Card bodies may be a
markdown string (e.g. the output of `template.each(...)`) or a `dom` node (e.g.
`Github.getPRsDom(...)`). Styling lives in [[Library/Custom/Style]]
(`.dash-grid` / `.dash-card`).

Usage:

    ${Dashboard.grid({
      Dashboard.card("Due / Overdue", template.each(query[[ ... ]], templates.taskItemTagsDue)),
      Dashboard.card("Inbox", template.each(query[[ ... ]], templates.fullPageItem)),
    })}

```space-lua
Dashboard = Dashboard or {}

-- A single dashboard card: a heading plus a body.
-- `body` may be a markdown string or a `dom` node. Falsy bodies (a query that
-- matched nothing) fall back to a placeholder so the card never renders empty.
function Dashboard.card(title, body)
  return dom.div {
    class = "dash-card",
    dom.h3 { title },
    body or "Nothing right now",
  }
end

-- Wrap a list of cards in a responsive CSS grid, returned as one widget.
-- `cards` is an array of nodes (typically built with Dashboard.card).
function Dashboard.grid(cards)
  local node = { class = "dash-grid" }
  for _, card in ipairs(cards or {}) do
    node[#node + 1] = card
  end
  return widget.htmlBlock(dom.div(node))
end
```

### Style

```space-style
/* Dashboard grid (see Library/Custom/Dashboard). Responsive: as many columns
   as fit at >=300px each, collapsing to one on narrow windows. */
.dash-grid {
  display: grid;
  /* At most 3 columns: each column's min is the larger of 300px or a third of
     the row (minus the two gaps), so wide windows cap at 3 and narrow ones
     collapse to 2 then 1. */
  grid-template-columns: repeat(auto-fit, minmax(max(300px, (100% - 2rem) / 3), 1fr));
  gap: 1rem;
  align-items: stretch; /* cards in a row share the tallest card's height */
  margin: 0.5rem 0 1rem;
}
.dash-card {
  border: 1px solid var(--surface1);
  border-radius: 8px;
  padding: 0.4rem 1rem 0.8rem;
  background: var(--subtle-background-color);
  overflow-x: auto;
}
.dash-card > h3 {
  margin: 0.4rem 0 0.6rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--surface1);
}
.dash-card > h3:first-child { margin-top: 0.2rem; }
/* Tighten first/last block spacing inside a card */
.dash-card > *:last-child { margin-bottom: 0; }
.dash-card .github-prs-widget { font-size: 0.85em; }
/* Drop SilverBullet's default widget frame around the grid host (only the
   directive block that contains our grid, so other widgets keep their border). */
#sb-main .cm-editor .sb-lua-directive-block:has(.dash-grid) {
  border: none;
  border-radius: 0;
  min-height: 0;
}
```
