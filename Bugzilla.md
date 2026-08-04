---
name: "Library/Dklawren/Bugzilla"
tags: meta/library
---

# Bugzilla

### Important Links
- [WebService API Reference](https://bmo.readthedocs.io/en/latest/api/index.html)

### Configuration

You need to add an API key value to able to access Bugzilla data. You can get one in the User Preference section (API Keys) of your Bugzilla host.

```lua
config.set("bugzilla", {
  apiKey  = "bugzilla_api_key",
  apiHost = "https://bugzilla.mozilla.org"
})
```

### Utility Functions and Setup

```space-lua
Bugzilla = Bugzilla or {}

-- Replace spaces with + for Bugzilla search query string encoding.
function Bugzilla.urlEncode(str)
  return str:gsub(" ", "+")
end

-- Make an authenticated request to the Bugzilla REST API.
function Bugzilla.apiCall(path, method, body)
  local cfg = config.get("bugzilla") or {}
  local headers = {
    ["Accept"]       = "application/json",
    ["Content-Type"] = "application/json",
    ["User-Agent"]   = "Silverbullet-Bugzilla-Library",
  }
  if cfg.apiKey and cfg.apiKey ~= "" then
    headers["X-Bugzilla-API-Key"] = cfg.apiKey
  end
  cfg.apiHost = cfg.apiHost or "https://bugzilla.mozilla.org"
  js.log("[Bugzilla] " .. method .. " " .. path)
  js.log("[Bugzilla] " .. tostring(headers))
  local resp = net.proxyFetch(cfg.apiHost .. "/rest/" .. path, {
    method  = method,
    headers = headers,
    body    = body
  })
  if not resp.ok then
    js.log("[Bugzilla] Response:", resp.body)
    error("[Bugzilla] API error (HTTP " .. tostring(resp.status) .. ")")
  end
  js.log(resp.body)
  return resp.body
end

-- Get List of Bugs
-- The filter value is the same as what you would use for quick search in Bugzilla itself.
function Bugzilla.getBugs(search)
  local path = "bug?quicksearch=" .. Bugzilla.urlEncode(search)
  result = Bugzilla.apiCall(path, "GET")
  local bugs = {}
  for _, item in ipairs(result.bugs) do
    bugData = {}
    for key, value in pairs(item) do
      bugData[key] = value
    end
    table.insert(bugs, bugData)
  end
  return bugs
end

function Bugzilla.getBugsWidget(search)
  local bugs = Bugzilla.getBugs(search)
  local rows = {}
  for bug in bugs do
    table.insert(rows, dom.tr {
      dom.td {"[**" .. tostring(bug.id) .. "**](https://bugzilla.mozilla.org/show_bug.cgi?id=" .. tostring(bug.id) .. ")"},
      dom.td {"_" .. (bug.status or "") .. "_"},
      dom.td {(bug.summary or "")}
    })
  end
  if #rows == 0 then
    rows = {
      dom.tr {
        dom.td { colspan="1", "Nothing at this time" }
      }
    }
  end
  return widget.htmlBlock(dom.table {
    class = "bugzilla-bugs-widget",
    dom.thead {
      dom.tr {
        dom.td {"Bug"},
        dom.td {"Status"},
        dom.td {"Summary"},
      }
    },
    dom.tbody(rows)
  })
end
```

### Styles
```space-style
/* table.bugzilla-bugs-widget {
  table-layout: fixed;
}

table.bugzilla-bugs-widget tbody td {
  vertical-align: top;
  white-space: normal !important;
}

table.bugzilla-bugs-widget thead td {
  white-space: nowrap !important;
}

table.bugzilla-bugs-widget thead td:last-child {
  text-align: right;
  width: 10%;
}

table.bugzilla-bugs-widget tbody td:last-child {
  text-align: right;
  width: 10%;
} */
```

## Usage Examples

### Open bugs assigned to you

${Bugzilla.getBugsWidget("OPEN assignee:dkl@mozilla.com")}
