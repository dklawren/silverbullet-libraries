---
name: "Library/Dklawren/Mindwtr"
tags: meta/library
---

## Mindwtr

You need to add an API key value to able to access your Mindwtr data.

### Example Config
```lua
config.set("mindwtr", {
  apiKey  = "api_key_here",
  apiHost = "https://example.com/v1"
})
```

### Templates

```space-lua
-- Renders a Mindwtr task object
templates.mindwtrTaskItem = template.new([==[
* **${project}** ${title} ([mindwtr](https://app.mindwtr.com/app/task/${id}))
]==])
-- Renders a Mindwtr project object
templates.mindwtrProjectItem = template.new([==[
* **${id}** ${name}
]==])
```

### Utility and Task Functions

```space-lua
Mindwtr = Mindwtr or {}
Mindwtr.areaIdMap = Mindwtr.areaIdMap or {}
Mindwtr.projectIdMap = Mindwtr.projectIdMap or {}
Mindwtr.projectAreaIdMap = Mindwtr.projectAreaIdMap or {}
Mindwtr.projectAreaTitleMap = Mindwtr.projectAreaTitleMap or {}

function Mindwtr.htmlEscape(str)
  local s = tostring(str or "")
  s = string.gsub(s, "&", "&amp;")
  s = string.gsub(s, "<", "&lt;")
  s = string.gsub(s, ">", "&gt;")
  s = string.gsub(s, '"', "&quot;")
  s = string.gsub(s, "'", "&#39;")
  return s
end

function Mindwtr.apiCall(path, method, body)
  local cfg = config.get("mindwtr") or {}
  if not cfg.apiKey then
    error("Mindwtr API key not set")
  end
  if not cfg.apiHost then
    error("Mindwtr API host not set")
  end
  if body and (method == "POST" or method == "PUT" or method == "PATCH") then
    local ok, jsonBody = pcall(function()
      return js.window.JSON.stringify(js.tojs(body))
    end)
    if not ok then
      js.log("Mindwtr.apiCall failed to encode body", body, jsonBody)
      error("Failed to encode Mindwtr API request body")
    end
    body = jsonBody
    js.log("Mindwtr.apiCall POST body", body)
  end
  return net.proxyFetch(cfg.apiHost .. "/" .. path, {
    method = method,
    headers = {
      ["Authorization"] = "Bearer " .. cfg.apiKey,
      ["Content-Type"] = "application/json",
      ["Accept"] = "application/json"
    },
    body = body
  })
end

function Mindwtr.getAreaIdMap()
  if next(Mindwtr.areaIdMap) then
    return Mindwtr.areaIdMap
  end
  local ok, resp = pcall(Mindwtr.apiCall, "areas", "GET")
  if not ok or not Mindwtr.isApiOk(resp) then
    js.log("Mindwtr area error", resp)
    error("Failed to get Mindwtr areas, see console for error")
  end
  for _, item in ipairs(resp.body.areas or {}) do
    Mindwtr.areaIdMap[item.id] = item.name
  end
  return Mindwtr.areaIdMap
end

function Mindwtr.getProjectIdMap()
  if next(Mindwtr.projectIdMap) then
    return Mindwtr.projectIdMap
  end
  local ok, resp = pcall(Mindwtr.apiCall, "projects", "GET")
  if not ok or not Mindwtr.isApiOk(resp) then
    js.log("Mindwtr project error", resp)
    error("Failed to get Mindwtr projects, see console for error")
  end
  Mindwtr.projectAreaIdMap = {}
  Mindwtr.projectAreaTitleMap = {}
  for _, item in ipairs(resp.body.projects or {}) do
    Mindwtr.projectIdMap[item.id] = item.title
    Mindwtr.projectAreaIdMap[item.id] = item.areaId
    Mindwtr.projectAreaTitleMap[item.id] = item.areaTitle
  end
  return Mindwtr.projectIdMap
end

function Mindwtr.getAreaList()
  local areaIdMap = Mindwtr.getAreaIdMap()
  local areaList = {}
  for id, name in pairs(areaIdMap) do
    table.insert(areaList, {id = id, name = name})
  end
  table.sort(areaList, function(a, b) return a.name < b.name end)
  return areaList
end

function Mindwtr.getProjectList()
  local projectIdMap = Mindwtr.getProjectIdMap()
  local projectList = {}
  for id, name in pairs(projectIdMap) do
    table.insert(projectList, {id = id, name = name})
  end
  table.sort(projectList, function(a, b) return a.name < b.name end)
  return projectList
end

function Mindwtr.urlEncode(str)
  return str:gsub("[^%w%-%.%_%~]", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
end

function Mindwtr.isApiOk(resp)
  return resp and resp.status and resp.status >= 200 and resp.status < 300
end

function Mindwtr.createTask(payload)
  local resp = Mindwtr.apiCall("tasks", "POST", payload)
  if not Mindwtr.isApiOk(resp) then
    js.log("Mindwtr createTask error", resp)
    error("Failed to create task in Mindwtr")
  end
  return resp.body and resp.body.task or resp.body
end

function Mindwtr.completeTask(id)
  local resp = Mindwtr.apiCall("tasks/" .. id .. "/complete", "POST", {})
  if not Mindwtr.isApiOk(resp) then
    js.log("Mindwtr completeTask error", resp)
    error("Failed to complete task in Mindwtr")
  end
  return resp.body
end

function Mindwtr.getTasks(filter)
  filter = filter or {}

  Mindwtr.getProjectIdMap()
  Mindwtr.getAreaIdMap()

  local tasks = {}
  local seen = {}

  if filter.isFocusedToday then
    local ok, resp = pcall(Mindwtr.apiCall, "tasks?isFocusedToday=" .. Mindwtr.urlEncode(tostring(filter.isFocusedToday)), "GET")
    if not ok or not Mindwtr.isApiOk(resp) then
      js.log("Mindwtr getTasks error for isFocusedToday", resp)
    else
      for _, item in ipairs(resp.body.tasks or {}) do
        if not seen[item.id] then
          seen[item.id] = true
          local task = {}
          for key, value in pairs(item) do
            task[key] = value
          end
          task.project = Mindwtr.projectIdMap[task.projectId] or ""
          task.area = Mindwtr.projectAreaTitleMap[task.projectId] or Mindwtr.areaIdMap[task.areaId] or ""
          table.insert(tasks, task)
        end
      end
    end
  else
    local statuses = {}
    if filter.status then
      if type(filter.status) == "string" then
        table.insert(statuses, filter.status)
      elseif type(filter.status) == "table" then
        for _, s in ipairs(filter.status) do
          table.insert(statuses, s)
        end
      end
    end
    if #statuses == 0 then
      statuses = {"inbox", "next", "waiting"}
    end

    for _, status in ipairs(statuses) do
      local ok, resp = pcall(Mindwtr.apiCall, "tasks?status=" .. Mindwtr.urlEncode(status), "GET")
      if not ok or not Mindwtr.isApiOk(resp) then
        js.log("Mindwtr getTasks error for status " .. status, resp)
      else
        for _, item in ipairs(resp.body.tasks or {}) do
          if not seen[item.id] then
            seen[item.id] = true
            local task = {}
            for key, value in pairs(item) do
              task[key] = value
            end
            task.project = Mindwtr.projectIdMap[task.projectId] or ""
            task.area = Mindwtr.projectAreaTitleMap[task.projectId] or Mindwtr.areaIdMap[task.areaId] or ""
            table.insert(tasks, task)
          end
        end
      end
    end
  end

  -- client-side filters
  if filter.projectId and filter.projectId ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.projectId == filter.projectId then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if filter.areaId and filter.areaId ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.areaId == filter.areaId or Mindwtr.projectAreaIdMap[task.projectId] == filter.areaId then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if filter.dueDateFrom and filter.dueDateFrom ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.dueDate and task.dueDate >= filter.dueDateFrom then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if filter.dueDateTo and filter.dueDateTo ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.dueDate and task.dueDate <= filter.dueDateTo then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if filter.priority and filter.priority ~= "" then
    local filtered = {}
    for _, task in ipairs(tasks) do
      if task.priority == filter.priority then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  if filter.search and filter.search ~= "" then
    local term = filter.search:lower()
    local filtered = {}
    for _, task in ipairs(tasks) do
      local text = table.concat({
        task.title or "",
        task.description or "",
        task.project or "",
        task.area or "",
        task.status or ""
      }, " "):lower()
      if text:find(term, 1, true) then
        table.insert(filtered, task)
      end
    end
    tasks = filtered
  end

  table.sort(tasks, function(a, b)
    return (a.title or "") < (b.title or "")
  end)

  return tasks
end

function Mindwtr.getTasksWidget(filter)
  local ok, tasks = pcall(Mindwtr.getTasks, filter)
  if not ok or not tasks then
    tasks = {}
  end

  local rows = {}
  for _, task in ipairs(tasks) do
    local currentTask = task
    local due = ""
    if currentTask.dueDate and type(currentTask.dueDate) == "string" then
      due = currentTask.dueDate:sub(1, 10)
    end

    local titleLimit = 80
    local fullTitle = currentTask.title or ""
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
      dom.td { currentTask.area or "" },
      dom.td { due },
      dom.td { currentTask.priority or "" },
      dom.td { currentTask.status or "" },
      dom.td {
        widgets.button("Complete", function()
          local ok2, err = pcall(Mindwtr.completeTask, currentTask.id)
          if ok2 then
            editor.flashNotification("Task marked complete in Mindwtr")
          else
            js.log("Mindwtr complete task error", err)
            editor.flashNotification("Failed to complete task: " .. tostring(err), "error")
          end
          editor.invokeCommand("Widgets: Refresh All")
        end, { class = "mindwtr-complete-btn" })
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
    class = "mindwtr-tasks-widget",
    dom.thead {
      dom.tr {
        dom.td { "Task" },
        dom.td { "Project" },
        dom.td { "Area" },
        dom.td { "Due" },
        dom.td { "Priority" },
        dom.td { "Status" },
        dom.td { "Actions" }
      }
    },
    dom.tbody(rows)
  })
end

function Mindwtr.openAddTaskDialog()
  local ok, selection = pcall(editor.getSelection)
  local defaultInput = ""
  if ok and selection and selection.text and selection.text ~= "" then
    defaultInput = selection.text
  end

  local safeInput = Mindwtr.htmlEscape(defaultInput)

  local html = [[
    <div id="mindwtr-add-task-dialog" class="mindwtr-add-task-overlay">
      <div class="mindwtr-add-task-card">
        <div class="mindwtr-add-task-header">Add Mindwtr Task</div>
        <form id="mindwtr-add-task-form">
          <label class="mindwtr-label">Quick add</label>
          <input type="text" id="mindwtr-input" class="mindwtr-input" value="]] .. safeInput .. [[" placeholder="e.g., Call mom tomorrow #personal p1" required>
          <div class="mindwtr-actions">
            <button type="button" id="mindwtr-cancel" class="mindwtr-btn mindwtr-btn-cancel">Cancel</button>
            <button type="submit" class="mindwtr-btn mindwtr-btn-submit">Add to Inbox</button>
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
      const dialog = document.getElementById('mindwtr-add-task-dialog');
      const form = document.getElementById('mindwtr-add-task-form');
      const cancel = document.getElementById('mindwtr-cancel');
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
        window.__mindwtrAddTaskHandler({
          input: document.getElementById('mindwtr-input').value
        });
        cleanup();
      });
      setTimeout(function() {
        const inputEl = document.getElementById('mindwtr-input');
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

This creates a new global command to add a task to your Mindwtr Inbox. Any highlighted text will be used as the default title.

```space-lua
command.define {
  name = "Mindwtr: Create Inbox Task",
  run = function()
    Mindwtr.openAddTaskDialog()
  end
}

-- Global handler called by the add-task dialog.
-- Overwriting it on each reload ensures the latest code is always used.
js.window.__mindwtrAddTaskHandler = function(payload)
  js.log("Mindwtr add-task payload", payload)
  if not payload or not payload.input or payload.input == "" then
    editor.flashNotification("Quick add input is required", "error")
    return
  end
  local taskPayload = {
    input = payload.input,
    props = {
      status = "inbox"
    }
  }
  js.log("Mindwtr add-task taskPayload", taskPayload)
  local ok, err = pcall(Mindwtr.createTask, taskPayload)
  if ok then
    editor.flashNotification("Task added to Mindwtr Inbox")
  else
    js.log("Mindwtr add task error", err)
    editor.flashNotification("Failed to add task: " .. tostring(err), "error")
  end
end
```

### Styles

```space-style
/* Mindwtr add-task dialog */
.mindwtr-add-task-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.mindwtr-add-task-card {
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

.mindwtr-add-task-header {
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--modal-header-label-color, #000);
}

.mindwtr-label {
  display: block;
  font-size: 0.8em;
  margin-top: 10px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.mindwtr-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 4px;
  border: 1px solid var(--modal-border-color, #ccc);
  background: var(--modal-help-background-color, #f5f5f5);
  color: var(--modal-color, #000);
  font-family: var(--ui-font, sans-serif);
}

.mindwtr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.mindwtr-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--ui-font, sans-serif);
}

.mindwtr-btn-cancel {
  background: var(--modal-help-background-color, #eee);
  color: var(--modal-color, #000);
}

.mindwtr-btn-submit {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

/* Mindwtr task widget */
table.mindwtr-tasks-widget {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

table.mindwtr-tasks-widget th,
table.mindwtr-tasks-widget td {
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--modal-border-color, #eee);
}

table.mindwtr-tasks-widget thead tr {
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
}

table.mindwtr-tasks-widget tbody tr:nth-child(even) {
  background: var(--modal-help-background-color, rgba(0, 0, 0, 0.03));
}

table.mindwtr-tasks-widget td:last-child {
  text-align: right;
  white-space: nowrap;
}

button.mindwtr-complete-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: var(--ui-accent-color, #0066cc);
  color: #fff;
  font-size: 0.85em;
}
```

### Examples

**List of Projects**

${template.each(Mindwtr.getProjectList(), templates.mindwtrProjectItem)}

**Open tasks widget**

${Mindwtr.getTasksWidget()}

**Filter by status**

\${Mindwtr.getTasksWidget({ status = "next" })}

**Filter by project and search**

\${Mindwtr.getTasksWidget({ projectId = "...", search = "bugzilla" })}
