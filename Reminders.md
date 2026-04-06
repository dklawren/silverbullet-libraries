---
name: "Library/Dklawren/Reminders"
tags: meta/library
files:
  - RemindersNotify.js
---

# Task Reminders

Fires browser notifications for tasks that are due today, and optionally sends push notifications via **[ntfy.sh](https://ntfy.sh)** so you get alerted on your phone or other devices even when the browser tab is not in focus.

---

## Requirements

- **[Silverbullet](https://silverbullet.md)** — this library is written in Space Lua and only runs inside Silverbullet.
- A modern browser (Chrome, Edge, Firefox) for browser notifications.
- An [ntfy.sh](https://ntfy.sh) account *(optional)* for cross-device push notifications.

---

## Quick Start

1. **Copy this page** into your Silverbullet space (e.g. `Library/Custom/Reminders.md`).
2. **Grant notification permission** — run the slash command `/requestNotificationPermission` in any page.
3. **Add a due date to a task**, for example:
   ```
   - [ ] Submit expense report [due:: 2026-04-15]
   ```
4. **Test it** by running `/testReminder` — you should see a browser notification.
5. *(Optional)* Configure ntfy.sh for phone/desktop push — see [ntfy.sh Setup](#ntfysh-setup) below.

---

## Task Syntax

Add a `[due:: YYYY-MM-DD]` attribute to any task. An optional `[remindAt:: HH:MM]` attribute overrides the default reminder time for that specific task.

| Task | Notification fires at |
|------|-----------------------|
| `- [ ] Buy milk [due:: 2026-04-15]` | 09:00 on Apr 15 *(default time)* |
| `- [ ] Call dentist [due:: 2026-04-15] [remindAt:: 14:30]` | 14:30 on Apr 15 |
| `- [ ] Standup [due:: 2026-04-15] [remindAt:: 09:00]` | 08:45 on Apr 15 *(if `minutesBefore = 15`)* |

---

## Configuration Reference

Edit the `config.set("reminders", { ... })` block below. All fields are optional.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultTime` | `"HH:MM"` | `"09:00"` | Reminder time for tasks without a `[remindAt::]` attribute |
| `minutesBefore` | number | `0` | Fire the reminder this many minutes *before* the target time |
| `ntfy.topic` | string | `""` | Your ntfy.sh topic name — leave empty to disable push |
| `ntfy.token` | string | `nil` | Bearer token for private/protected topics |
| `ntfy.serverUrl` | string | `"https://ntfy.sh"` | Override for self-hosted ntfy instances |

---

## ntfy.sh Setup

[ntfy.sh](https://ntfy.sh) is a free, open-source push notification service. It delivers notifications to the **ntfy mobile app** (iOS/Android) and the web UI without requiring an account for basic use.

### Basic (no account required)

1. Install the **ntfy app** on your phone ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)) or open [ntfy.sh](https://ntfy.sh) in a browser.
2. Subscribe to a topic — use something hard to guess, e.g. `reminders-jsmith-k7x2`.
3. Set `ntfy.topic` in the config block below to that topic name.

> **Note:** public topics (no auth) are visible to anyone who knows the name. Use a random, unguessable string or upgrade to a private topic.

### Private topic (account required)

1. Create a free account at [ntfy.sh](https://ntfy.sh) (or self-host).
2. Generate an **access token** in *Account → Access tokens*.
3. Set both `ntfy.topic` and `ntfy.token` in the config block below.

### Self-hosted ntfy

Set `ntfy.serverUrl` to your server's base URL, e.g. `"https://ntfy.example.com"`.

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/requestNotificationPermission` | Opens the browser permission prompt |
| `/testReminder` | Fires a test notification (browser + ntfy if configured) |

---

## Configuration

Edit the block below to customise reminder behaviour.

```lua
config.set("reminders", {
  -- Default time to fire when a task has no [remindAt:: HH:MM] attribute.
  defaultTime = "09:00",

  -- Fire the reminder this many minutes BEFORE the target time.
  -- 0 = fire exactly at the target time.
  minutesBefore = 0,

  -- ntfy.sh push notifications (optional).
  -- Leave topic empty (or remove this block) to disable.
  ntfy = {
    topic     = "",                  -- required: your ntfy.sh topic name
    token     = nil,                 -- optional: Bearer token for private topics
    serverUrl = "https://ntfy.sh",   -- optional: override for self-hosted ntfy
  },
})
```

## Setup

Browser notification permission is requested automatically on startup, but some
browsers require a user gesture. If permission was denied or not yet granted, run:

- `/requestNotificationPermission` — opens the browser permission prompt
- `/testReminder` — fires a test notification to confirm everything is working

```space-lua
-- =====================================================================
-- Task Reminder Notifications
-- Monitors tasks with [due:: YYYY-MM-DD] and optional [remindAt:: HH:MM]
--
-- Reads config from config.get("reminders"):
--   defaultTime   (string "HH:MM") – fallback time, default "09:00"
--   minutesBefore (number)         – lead time in minutes, default 0
--   ntfy.topic    (string)         – ntfy.sh topic; leave empty to disable
--   ntfy.token    (string|nil)     – Bearer token for private topics
--   ntfy.serverUrl (string)        – ntfy server base URL
-- =====================================================================

-- In-session deduplication table.
-- Prevents re-firing if the cron tick overlaps a minute boundary.
-- Key: task.ref (page + char offset) + YYYY-MM-DD + HH:MM
local _remindersSent = {}

-- Notification helpers loaded from companion JS module.
local _notify = js.import("/.fs/Library/Custom/RemindersNotify.js")

-- Parse "HH:MM" string into (hour, minute) numbers.
-- Returns nil, nil if the format is invalid.
local function parseTime(s)
  if not s then return nil, nil end
  s = tostring(s)
  s = string.gsub(s, "^%s+", "")
  s = string.gsub(s, "%s+$", "")
  local h, m = string.match(s, "^(%d%d?):(%d%d)$")
  return tonumber(h), tonumber(m)
end

-- Read and normalise the reminders config table.
local function getReminderConfig()
  local cfg = config.get("reminders") or {}
  local defaultH, defaultM = parseTime(cfg.defaultTime)
  if not defaultH then defaultH, defaultM = 9, 0 end
  return {
    defaultH      = defaultH,
    defaultM      = defaultM,
    minutesBefore = tonumber(cfg.minutesBefore) or 0,
    ntfy          = cfg.ntfy or {},
  }
end

-- Send a push notification via ntfy.sh (best-effort; errors are swallowed).
local function sendNtfy(title, body, ntfyCfg)
  if not ntfyCfg or not ntfyCfg.topic or ntfyCfg.topic == "" then return end
  local serverUrl = ntfyCfg.serverUrl or "https://ntfy.sh"
  local url = serverUrl .. "/" .. ntfyCfg.topic
  local headers = { Title = title, ["Content-Type"] = "text/plain" }
  if ntfyCfg.token and ntfyCfg.token ~= "" then
    headers["Authorization"] = "Bearer " .. ntfyCfg.token
  end
  js.log("[Reminders] sending ntfy push to topic '" .. ntfyCfg.topic .. "'")
  pcall(function()
    net.proxyFetch(url, { method = "POST", headers = headers, body = body })
  end)
end

-- Query all incomplete tasks due today and fire notifications
-- for those whose fire time (target − minutesBefore) matches the current HH:MM.
local function checkReminders()
  local cfg   = getReminderConfig()
  local today = os.date("%Y-%m-%d")
  local nowH  = tonumber(os.date("%H"))
  local nowM  = tonumber(os.date("%M"))

  local tasks = query[[
    from index.tag "task"
    where not done and due
  ]]

  js.log("[Reminders] checking at " .. string.format("%02d:%02d", nowH, nowM) .. " — " .. (tasks and #tasks or 0) .. " due tasks found")

  if not tasks or #tasks == 0 then return end

  for _, task in ipairs(tasks) do
    local due = tostring(task.due or "")
    due = string.gsub(due, "^%s+", "")
    due = string.gsub(due, "%s+$", "")

    if due ~= today then goto continue end

    -- Determine target time: use remindAt if present, otherwise config default.
    local targetH, targetM = parseTime(task.remindAt)
    if not targetH then targetH, targetM = cfg.defaultH, cfg.defaultM end

    -- Apply minutesBefore offset (with midnight wrap-around).
    local fireMins = (targetH * 60 + targetM - cfg.minutesBefore) % 1440
    local fireH    = math.floor(fireMins / 60)
    local fireM    = fireMins % 60

    if nowH ~= fireH or nowM ~= fireM then goto continue end

    -- Dedup: skip if we already fired this notification in the current session.
    local fireKey = string.format("%02d:%02d", fireH, fireM)
    local key = tostring(task.ref or task.page or "") .. "|" .. today .. "|" .. fireKey
    if _remindersSent[key] then goto continue end
    _remindersSent[key] = true

    -- Build notification content.
    local title = "Task Due Today"
    local body  = task.name or "Unnamed task"
    if task.page and task.page ~= "" then
      body = body .. "\n" .. task.page
    end

    js.log("[Reminders] sending notification: '" .. (task.name or "Unnamed task") .. "' due " .. today .. " at " .. fireKey)
    _notify.send(title, body, key)
    _notify.playSound()
    sendNtfy(title, body, cfg.ntfy)

    ::continue::
  end
end

-- Request notification permission at startup.
-- Best-effort: browsers may silently ignore this without a prior user gesture.
event.listen {
  name = "editor:init",
  run  = function()
    _notify.requestPermission()
  end
}

-- Wake up on every cron tick and check reminders once per minute.
local reminderLastMinute = -1

event.listen {
  name = "cron:secondPassed",
  run = function()
    local h = tonumber(os.date("%H"))
    local m = tonumber(os.date("%M"))
    local currentMinute = h * 60 + m
    if currentMinute ~= reminderLastMinute then
      reminderLastMinute = currentMinute
      checkReminders()
    end
  end
}

-- Slash command: manually request browser notification permission.
-- Useful when the automatic startup request was denied or ignored.
slashCommand.define {
  name = "requestNotificationPermission",
  run  = function()
    local perm = _notify.requestPermission()
    editor.flashNotification("Notification permission: " .. tostring(perm))
  end
}

-- Slash command: fire a test notification immediately.
-- Use this to verify the setup is working before relying on it for real tasks.
slashCommand.define {
  name = "testReminder",
  run  = function()
    local cfg  = getReminderConfig()
    local perm = _notify.permission()
    local msgs = {}

    if perm == "granted" then
      _notify.send("Test Reminder", "Reminders are working correctly.", "test-" .. os.time())
      _notify.playSound()
      table.insert(msgs, "Browser notification sent")
    else
      table.insert(msgs, "Browser permission not granted (run /requestNotificationPermission)")
    end

    local ntfy = cfg.ntfy
    if ntfy and ntfy.topic and ntfy.topic ~= "" then
      sendNtfy("Test Reminder", "ntfy.sh reminders are working correctly.", ntfy)
      table.insert(msgs, "ntfy.sh notification sent to '" .. ntfy.topic .. "'")
    end

    editor.flashNotification(table.concat(msgs, " · "))
  end
}

slashCommand.define {
  name = "due",
  description = "Set a due date for the task",
  run = function()
    editor.insertAtCursor("[due:: \"|^|\"]", false, true)
  end
}

slashCommand.define {
  name = "remindAt",
  description = "Insert hour and minutes to remind about the task",
  run = function()
    editor.insertAtCursor("[remindAt:: \"|^|\"]", false, true)
  end
}
```
