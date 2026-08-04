---
name: "Library/Dklawren/Todoist"
tags: meta/library
---

## Todoist

You need to add an API key value to be able to access your Todoist data.
You can get one at <https://app.todoist.com/app/settings/integrations/developer>.

### Example Config
```lua
config.set('todoist', {
  token = 'developer_api_key_here',
  host = 'https://api.todoist.com/api/v1'
})
```

### Templates

```space-lua
-- Renders a Todoist task object
templates.todoistTaskItem = template.new([==[
* **${project}** ${content} ([todoist](https://app.todoist.com/app/task/${id}))
]==])
-- Renders a Todoist project object
templates.todoistProjectItem = template.new([==[
* **${id}** ${name} ([todoist](https://app.todoist.com/app/project/${id}?fromV1Id=true))
]==])
-- Renders a Todoist section object
templates.todoistSectionItem = template.new([==[
* **${id}** ${name} (${project})
]==])
```

### Utility and Task Functions

```space-lua
Todoist = Todoist or {}
Todoist.projectIdMap = Todoist.projectIdMap or {}
Todoist.sectionIdMap = Todoist.sectionIdMap or {}
Todoist.sectionProjectIdMap = Todoist.sectionProjectIdMap or {}

function Todoist.htmlEscape(str)
  local s = tostring(str or "")
  s = string.gsub(s, "&", "&amp;")
  s = string.gsub(s, "<", "&lt;")
  s = string.gsub(s, ">", "&gt;")
  s = string.gsub(s, '"', "&quot;")
  s = string.gsub(s, "'", "&#39;")
  return s
end

function Todoist.urlEncode(str)
  return str:gsub("[^%w%-%.%_%~]", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
end

function Todoist.isApiOk(resp)
  return resp and resp.status and resp.status >= 200 and resp.status < 300
end

function Todoist.config()
  local cfg = config.get('todoist') or {}
  if not cfg.token then
    error("Todoist token not set")
  end
  cfg.host = cfg.host or 'https://api.todoist.com/api/v1'
  return cfg
end

-- Converts empty Lua tables to JS arrays ([]), required by the v1 API for
-- fields like labels. Non-empty arrays and objects are handled by js.tojs.
function Todoist.emptyTableAsArray(value)
  if type(value) ~= "table" then
    return value
  end
  if next(value) == nil then
    return js.window.Array()
  end
  for key, item in pairs(value) do
    value[key] = Todoist.emptyTableAsArray(item)
  end
  return value
end

function Todoist.encodeBody(body)
  if body == nil then
    return nil
  end
  local ok, jsonBody = pcall(function()
    return js.window.JSON.stringify(js.tojs(Todoist.emptyTableAsArray(body)))
  end)
  if not ok then
    js.log("Todoist failed to encode body", body, jsonBody)
    error("Failed to encode Todoist API request body")
  end
  return jsonBody
end

function Todoist.apiCall(path, method, body)
  local cfg = Todoist.config()
  if body and (method == "POST" or method == "PUT" or method == "PATCH") then
    body = Todoist.encodeBody(body)
  end
  return net.proxyFetch(cfg.host .. "/" .. path, {
    method = method,
    headers = {
      ["Authorization"] = "Bearer " .. cfg.token,
      ["Content-Type"] = "application/json",
      ["Accept"] = "application/json"
    },
    body = body
  })
end

function Todoist.fetchResults(path)
  local all = {}
  local seen = {}
  local cursor = nil
  for _ = 1, 100 do
    local url = path
    if cursor then
      url = url .. (path:find("?") and "&" or "?") .. "cursor=" .. Todoist.urlEncode(cursor)
    end
    local ok, resp = pcall(Todoist.apiCall, url, "GET")
    if not ok or not Todoist.isApiOk(resp) then
      js.log("Todoist API error", resp)
      error("Todoist API request failed, see console for error")
    end
    local body = resp and resp.body
    local items = {}
    if type(body) == "table" and type(body.results) == "table" then
      items = body.results
    end
    for _, item in ipairs(items) do
      if item and not seen[item.id] then
        seen[item.id] = true
        table.insert(all, item)
      end
    end
    cursor = (type(body) == "table" and body.next_cursor) or nil
    if not cursor or cursor == "" then
      break
    end
  end
  return all
end

function Todoist.getProjectIdMap()
  if next(Todoist.projectIdMap) then
    return Todoist.projectIdMap
  end
  for _, item in ipairs(Todoist.fetchResults("projects")) do
    Todoist.projectIdMap[item.id] = item.name
  end
  return Todoist.projectIdMap
end

function Todoist.getSectionIdMap()
  if next(Todoist.sectionIdMap) then
    return Todoist.sectionIdMap
  end
  Todoist.sectionProjectIdMap = {}
  for _, item in ipairs(Todoist.fetchResults("sections")) do
    Todoist.sectionIdMap[item.id] = item.name
    Todoist.sectionProjectIdMap[item.id] = item.project_id
  end
  return Todoist.sectionIdMap
end

function Todoist.getProjectList()
  local projectIdMap = Todoist.getProjectIdMap()
  local projectList = {}
  for id, name in pairs(projectIdMap) do
    table.insert(projectList, {id = id, name = name})
  end
  table.sort(projectList, function(a, b) return a.name < b.name end)
  return projectList
end

function Todoist.getSectionList()
  Todoist.getProjectIdMap()
  local sectionIdMap = Todoist.getSectionIdMap()
  local sectionList = {}
  for id, name in pairs(sectionIdMap) do
    local projectId = Todoist.sectionProjectIdMap[id]
    table.insert(sectionList, {
      id = id,
      name = name,
      project_id = projectId,
      project = Todoist.projectIdMap[projectId] or ""
    })
  end
  table.sort(sectionList, function(a, b) return a.name < b.name end)
  return sectionList
end

function Todoist.enrichTask(task)
  Todoist.getProjectIdMap()
  Todoist.getSectionIdMap()
  task.project = Todoist.projectIdMap[task.project_id] or ""
  task.section = Todoist.sectionIdMap[task.section_id] or ""
  return task
end

function Todoist.getTasks(filter)
  local apiFilter = nil
  local clientFilter = {}

  if type(filter) == "string" then
    apiFilter = filter
  elseif type(filter) == "table" then
    clientFilter = filter
    if type(filter.filter) == "string" then
      apiFilter = filter.filter
    end
  end

  local params = {}
  local path
  if apiFilter and apiFilter ~= "" then
    path = "tasks/filter"
    table.insert(params, "query=" .. Todoist.urlEncode(apiFilter))
  else
    path = "tasks"
    if clientFilter.projectId and clientFilter.projectId ~= "" then
      table.insert(params, "project_id=" .. Todoist.urlEncode(clientFilter.projectId))
    end
    if clientFilter.sectionId and clientFilter.sectionId ~= "" then
      table.insert(params, "section_id=" .. Todoist.urlEncode(clientFilter.sectionId))
    end
    if clientFilter.label and clientFilter.label ~= "" then
      table.insert(params, "label=" .. Todoist.urlEncode(clientFilter.label))
    end
  end

  if #params > 0 then
    path = path .. "?" .. table.concat(params, "&")
  end

  local tasks = {}
  for _, item in ipairs(Todoist.fetchResults(path)) do
    local task = {}
    for key, value in pairs(item) do
      task[key] = value
    end
    Todoist.enrichTask(task)
    table.insert(tasks, task)
  end

  -- Client-side filters
  if clientFilter.projectId and clientFilter.projectId ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.project_id == clientFilter.projectId then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if clientFilter.sectionId and clientFilter.sectionId ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.section_id == clientFilter.sectionId then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if clientFilter.label and clientFilter.label ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      local labels = task.labels or {}
      for _, label in ipairs(labels) do
        if label == clientFilter.label then
          table.insert(filtered, task)
          break
        end
      end
    end
    tasks = filtered
  end

  if clientFilter.dueDateFrom and clientFilter.dueDateFrom ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      local due = task.due and task.due.date
      if due and due >= clientFilter.dueDateFrom then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if clientFilter.dueDateTo and clientFilter.dueDateTo ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      local due = task.due and task.due.date
      if due and due <= clientFilter.dueDateTo then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if clientFilter.priority and clientFilter.priority ~= "" then
    local target = tonumber(clientFilter.priority)
    if target then
      local filtered = {}
      for _, task in ipairs(tasks) do
        if task.priority == target then
          table.insert(filtered, task)
        end
      end
      tasks = filtered
    end
  end

  if clientFilter.search and clientFilter.search ~= "" then
    local term = clientFilter.search:lower()
    local filtered = {}
    for _, task in ipairs(tasks) do
      local labelText = table.concat(task.labels or {}, " ")
      local text = table.concat({
        task.content or "",
        task.description or "",
        task.project or "",
        task.section or "",
        labelText
      }, " "):lower()
      if text:find(term, 1, true) then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  table.sort(tasks, function(a, b)
    return (a.content or "") < (b.content or "")
  end)

  return tasks
end

function Todoist.closeTask(id)
  local ok, resp = pcall(Todoist.apiCall, "tasks/" .. id .. "/close", "POST")
  if not ok or not Todoist.isApiOk(resp) then
    js.log("Todoist closeTask error", resp)
    error("Failed to close task in Todoist")
  end
  return resp.body
end

function Todoist.updateTask(id, payload)
  local ok, resp = pcall(Todoist.apiCall, "tasks/" .. id, "POST", payload)
  if not ok or not Todoist.isApiOk(resp) then
    js.log("Todoist updateTask error", resp)
    error("Failed to update task in Todoist")
  end
  return resp.body
end

function Todoist.createTask(payload)
  local ok, resp = pcall(Todoist.apiCall, "tasks", "POST", payload)
  if not ok or not Todoist.isApiOk(resp) then
    js.log("Todoist createTask error", resp)
    error("Failed to create task in Todoist")
  end
  return resp.body
end

function Todoist.quickAddTask(content)
  local ok, resp = pcall(Todoist.apiCall, "tasks/quick", "POST", { text = content })
  if not ok or not Todoist.isApiOk(resp) then
    js.log("Todoist quickAddTask error", resp)
    error("Failed to quick add task in Todoist")
  end
  return resp.body
end

function Todoist.formatLabelText(labels)
  local parts = {}
  for _, label in ipairs(labels or {}) do
    table.insert(parts, "@" .. label)
  end
  return table.concat(parts, " ")
end

function Todoist.getTasksWidget(filter)
  local titleLimit = 80
  local ok, tasks = pcall(Todoist.getTasks, filter)
  if not ok or not tasks then
    tasks = {}
  end

  local filterLabel = "all"
  if type(filter) == "string" then
    filterLabel = filter
  elseif type(filter) == "table" and filter.filter then
    filterLabel = filter.filter
  end

  local rows = {}
  for _, task in ipairs(tasks) do
    local currentTask = task
    local due = ""
    if currentTask.due and type(currentTask.due) == "table" then
      due = currentTask.due.date or currentTask.due.datetime or ""
    end

    local labels = table.concat(currentTask.labels or {}, ", ")
    local priority = tostring(currentTask.priority or "")

    local fullTitle = currentTask.content or ""
    local displayTitle = fullTitle
    if #displayTitle > titleLimit then
      local snip = displayTitle:sub(1, titleLimit)
      local lastSpace = snip:match(".*() ")
      if lastSpace then
        displayTitle = fullTitle:sub(1, lastSpace - 1) .. "..."
      else
        displayTitle = fullTitle:sub(1, titleLimit - 3) .. "..."
      end
    end

    table.insert(rows, dom.tr {
      dom.td { title = fullTitle, displayTitle },
      dom.td { currentTask.project or "" },
      dom.td { currentTask.section or "" },
      dom.td { labels },
      dom.td { due },
      dom.td { priority },
      dom.td {
        widgets.button("Link", function()
          js.window.open("todoist://task?id=" .. currentTask.id)
        end, { class = "todoist-link-btn" }),
        widgets.button("Postpone", function()
          local ok2, err = pcall(Todoist.updateTask, currentTask.id, { due_string = "tomorrow" })
          if ok2 then
            editor.flashNotification("Task postponed to tomorrow")
          else
            js.log("Todoist postpone task error", err)
            editor.flashNotification("Failed to postpone task: " .. tostring(err), "error")
          end
          editor.invokeCommand("Widgets: Refresh All")
        end, { class = "todoist-postpone-btn" }),
        widgets.button("Complete", function()
          local ok2, err = pcall(Todoist.closeTask, currentTask.id)
          if ok2 then
            editor.flashNotification("Task marked complete in Todoist")
          else
            js.log("Todoist complete task error", err)
            editor.flashNotification("Failed to complete task: " .. tostring(err), "error")
          end
          editor.invokeCommand("Widgets: Refresh All")
        end, { class = "todoist-complete-btn" })
      }
    })
  end

  if #rows == 0 then
    rows = {
      dom.tr {
        dom.td { colspan = "7", "_No tasks found_" }
      }
    }
  end

  return widget.htmlBlock(dom.table {
    class = "todoist-tasks-widget",
    dom.thead {
      dom.tr {
        dom.td { "Task (filter: " .. filterLabel .. ")" },
        dom.td { "Project" },
        dom.td { "Section" },
        dom.td { "Labels" },
        dom.td { "Due" },
        dom.td { "Priority" },
        dom.td { "Actions" }
      }
    },
    dom.tbody(rows)
  })
end

function Todoist.csvEscape(value)
  value = tostring(value or "")
  if value:find('["\n\r,]') then
    value = '"' .. value:gsub('"', '""') .. '"'
  end
  return value
end

function Todoist.priorityToTodoist(priority)
  if type(priority) == "number" then
    if priority >= 1 and priority <= 4 then
      return priority
    end
  elseif type(priority) == "string" then
    local lower = priority:lower()
    if lower == "highest" or lower == "high" or lower == "urgent" then
      return 1
    elseif lower == "medium" then
      return 3
    elseif lower == "low" then
      return 4
    end
    local n = tonumber(lower)
    if n and n >= 1 and n <= 4 then
      return n
    end
  end
  return 4
end

function Todoist.formatLabels(task)
  local tags = task.tags or task.itags or task.labels or {}
  local labels = {}
  for _, tag in ipairs(tags) do
    if tag ~= "task" and tag ~= "" then
      table.insert(labels, "@" .. tag)
    end
  end
  return table.concat(labels, " ")
end

function Todoist.toCsv(tasks)
  if type(tasks) ~= "table" then
    return widget.new {
      display = "block",
      markdown = "```txt\nNo tasks provided\n```"
    }
  end

  local headers = {
    "TYPE", "CONTENT", "DESCRIPTION", "PRIORITY", "INDENT",
    "AUTHOR", "RESPONSIBLE", "DATE", "DATE_LANG", "DATE_STRING",
    "TIMEZONE", "DURATION", "DURATION_UNIT", "meta", "DEADLINE",
    "DEADLINE_LANG", "IS_COLLAPSED"
  }
  local lines = { table.concat(headers, ",") }

  for _, task in ipairs(tasks) do
    local content = task.name or task.content or ""
    local labels = Todoist.formatLabels(task)
    if labels ~= "" then
      content = content .. " " .. labels
    end

    local dueDate = ""
    local dueLang = ""
    local dueString = ""
    local timezone = ""
    if type(task.due) == "table" then
      dueDate = task.due.date or task.due.datetime or ""
      dueLang = task.due.lang or ""
      dueString = task.due.string or ""
      timezone = task.due.timezone or ""
    elseif type(task.due) == "string" then
      dueDate = task.due
    end

    local duration = ""
    local durationUnit = ""
    if type(task.duration) == "table" then
      duration = task.duration.amount or ""
      durationUnit = task.duration.unit or ""
    end

    local deadline = ""
    local deadlineLang = ""
    if type(task.deadline) == "table" then
      deadline = task.deadline.date or ""
      deadlineLang = task.deadline.lang or ""
    elseif type(task.deadline) == "string" then
      deadline = task.deadline
    end

    local row = {
      Todoist.csvEscape("task"),
      Todoist.csvEscape(content),
      Todoist.csvEscape(task.description or task.page or ""),
      Todoist.csvEscape(Todoist.priorityToTodoist(task.priority)),
      Todoist.csvEscape(""),
      Todoist.csvEscape(""),
      Todoist.csvEscape(""),
      Todoist.csvEscape(dueDate),
      Todoist.csvEscape(dueLang),
      Todoist.csvEscape(dueString),
      Todoist.csvEscape(timezone),
      Todoist.csvEscape(duration),
      Todoist.csvEscape(durationUnit),
      Todoist.csvEscape(""),
      Todoist.csvEscape(deadline),
      Todoist.csvEscape(deadlineLang),
      Todoist.csvEscape(task.is_collapsed and "true" or "")
    }
    table.insert(lines, table.concat(row, ","))
  end

  local csv = table.concat(lines, "\n")
  local md = "```txt\n" .. csv .. "\n```"

  return widget.new {
    display = "block",
    markdown = md
  }
end

function Todoist.openAddTaskDialog()
  local ok, selection = pcall(editor.getSelection)
  local defaultInput = ""
  if ok and selection and selection.text and selection.text ~= "" then
    defaultInput = selection.text
  end

  local safeInput = Todoist.htmlEscape(defaultInput)

  local html = [[
    <div id="todoist-add-task-dialog" class="todoist-add-task-overlay">
      <div class="todoist-add-task-card">
        <div class="todoist-add-task-header">Add Todoist Task</div>
        <form id="todoist-add-task-form">
          <label class="todoist-label">Quick add</label>
          <input type="text" id="todoist-input" class="todoist-input" value="]] .. safeInput .. [[" placeholder="e.g., Call mom tomorrow @personal p1" required>
          <div class="todoist-actions">
            <button type="button" id="todoist-cancel" class="todoist-btn todoist-btn-cancel">Cancel</button>
            <button type="submit" class="todoist-btn todoist-btn-submit">Add to Inbox</button>
          </div>
        </form>
      </div>
    </div>
  ]]

  local container = js.window.document.createElement("div")
  container.innerHTML = html
  js.window.document.body.appendChild(container)

  local script = [[
    (function() {
      const dialog = document.getElementById('todoist-add-task-dialog');
      const form = document.getElementById('todoist-add-task-form');
      const cancel = document.getElementById('todoist-cancel');
      const cleanup = function() {
        if (dialog) dialog.remove();
        document.removeEventListener('keydown', escHandler);
      };
      function escHandler(e) {
        if (e.key === 'Escape') cleanup();
      }
      document.addEventListener('keydown', escHandler);
      cancel.addEventListener('click', cleanup);
      dialog.addEventListener('click', function(e) { if (e.target === dialog) cleanup(); });
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        window.__todoistAddTaskHandler({
          input: document.getElementById('todoist-input').value
        });
        cleanup();
      });
      setTimeout(function() {
        const inputEl = document.getElementById('todoist-input');
        if (inputEl) {
          inputEl.focus();
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        }
      }, 0);
    })();
  ]]

  local scriptEl = js.window.document.createElement("script")
  scriptEl.innerHTML = script
  js.window.document.body.appendChild(scriptEl)
end
```

### Adding a Task

This creates a new global command to add a task to your Todoist Inbox using natural-language quick add. Any highlighted text will be used as the default input.

```space-lua
command.define {
  name = "Todoist: Create Inbox Task",
  run = function()
    Todoist.openAddTaskDialog()
  end
}

-- Global handler called by the add-task dialog.
-- Overwriting it on each reload ensures the latest code is always used.
if js.window then
  js.window.__todoistAddTaskHandler = function(payload)
    js.log("Todoist add-task payload", payload)
    if not payload or not payload.input or payload.input == "" then
      editor.flashNotification("Quick add input is required", "error")
      return
    end
    local ok, err = pcall(Todoist.quickAddTask, payload.input)
    if ok then
      editor.flashNotification("Task added to Todoist Inbox")
    else
      js.log("Todoist add task error", err)
      editor.flashNotification("Failed to add task: " .. tostring(err), "error")
    end
  end
end
```

### Styles

```space-style
/* Todoist add-task dialog */
.todoist-add-task-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.todoist-add-task-card {
  background: var(--modal-background-color, #fff);
  color: var(--modal-color, #000);
  border: 1px solid var(--modal-border-color, #ccc);
  border-radius: 8px;
  padding: 20px;
  width: 420px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.todoist-add-task-header {
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--modal-header-label-color, #000);
}

.todoist-label {
  display: block;
  font-size: 0.8em;
  margin-top: 10px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.todoist-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 4px;
  border: 1px solid var(--modal-border-color, #ccc);
  background: var(--modal-help-background-color, #f5f5f5);
  color: var(--modal-color, #000);
  font-family: var(--ui-font, sans-serif);
}

.todoist-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.todoist-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--ui-font, sans-serif);
}

.todoist-btn-cancel {
  background: var(--modal-help-background-color, #eee);
  color: var(--modal-color, #000);
}

.todoist-btn-submit {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

/* Todoist task widget */
table.todoist-tasks-widget {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

table.todoist-tasks-widget th,
table.todoist-tasks-widget td {
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--modal-border-color, #eee);
}

table.todoist-tasks-widget thead tr {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

table.todoist-tasks-widget tbody tr:nth-child(even) {
  background: var(--modal-help-background-color, rgba(0, 0, 0, 0.03));
}

table.todoist-tasks-widget td:last-child {
  text-align: right;
  white-space: nowrap;
}

button.todoist-postpone-btn,
button.todoist-complete-btn,
button.todoist-link-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  margin-left: 4px;
}

button.todoist-postpone-btn {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

button.todoist-complete-btn {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

button.todoist-link-btn {
  background: transparent;
  color: var(--ui-accent-color, #0066cc);
  border: 1px solid var(--ui-accent-color, #0066cc);
}
```

### Examples

**List of Projects**

${template.each(Todoist.getProjectList(), templates.todoistProjectItem)}

**List of Sections**

${template.each(Todoist.getSectionList(), templates.todoistSectionItem)}

**Get Tasks Matching Filter**

\${Todoist.getTasks("today | overdue")}

**Open tasks widget**

${Todoist.getTasksWidget()}

**Filter by Todoist filter / project / search**

${Todoist.getTasksWidget({ filter = "(today | overdue)", projectId = "...", search = "bugzilla" })}

**Export Tasks to CSV**

${Todoist.toCsv(query[[from index.tag "task" where not done]])}
