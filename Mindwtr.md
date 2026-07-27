---
name: "Library/Dklawren/Mindwtr"
tags: meta/library
share.uri: "github:dklawren/silverbullet-libraries/Mindwtr.md"
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
-- Renders a Mindtr task object
templates.mindwtrTaskItem = template.new([==[
* **${id}** ${title}
]==])
-- Renders a Mindwtr project object
templates.mindwtrProjectItem = template.new([==[
* **${id}** ${title}
]==])
```

### Utility and Task Functions

```space-lua
Mindwtr = Mindwtr or {}
Mindwtr.areaIdMap = Mindwtr.areaIdMap or {}
Mindwtr.projectIdMap = Mindwtr.projectIdMap or {}

function Mindwtr.apiCall(path, method, body)
  local cfg = config.get("mindwtr") or {}
  if not cfg.apiKey then
    error("Mindwtr API key not set")
  end
  if not cfg.apiHost then
    error("Mindwtr API host not set")
  end
  js.log(method .. " " .. path)
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
  local resp = Mindwtr.apiCall("areas", "GET")
  if not resp.ok then
    error("Failed to get Mindwtr areas, see console for error")
    js.log("Error", resp)
    return
  end
  for _, item in ipairs(resp.body.results) do
    Mindwtr.areaIdMap[item.id] = item.title
  end
  return Mindwtr.areaIdMap
end

function Mindwtr.getProjectIdMap()
  if next(Mindwtr.projectIdMap) then
    return Mindwtr.projectIdMap
  end
  local resp = Mindwtr.apiCall("projects", "GET")
  if not resp.ok then
    error("Failed to get Mindwtr projects, see console for error")
    js.log("Error", resp)
    return
  end
  for _, item in ipairs(resp.body.projects) do
    Mindwtr.projectIdMap[item.id] = item.title
  end
  return Mindwtr.projectIdMap
end

function Mindwtr.getAreaList()
  local areaIdMap = Mindwtr.getAreaIdMap()
  local areaList = {}
  for id, name in pairs(areaIdMap) do
    table.insert(areaList, {id = id, name = title})
  end
  return areaList
end

function Mindwtr.getProjectList()
  local projectIdMap = Mindwtr.getProjectIdMap()
  local projectList = {}
  for id, name in pairs(projectIdMap) do
    table.insert(projectList, {id = id, name = name})
  end
  return projectList
end

function Mindwtr.urlEncode(str)
  return str:gsub("[^%w%-%.%_%~]", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
end

function Mindwtr.getTasks(filter)
  local path = "tasks"
  if filter then
    -- path = path .. "?" .. Mindwtr.urlEncode(filter)
    path = path .. "?" .. filter
  end
  local resp = Mindwtr.apiCall(path, "GET")
  if not resp.ok then
    error("Failed to get Mindwtr tasks, see console for error")
    js.log("Error", resp)
    return
  end
  -- local areaIdMap = Mindwtr.getAreaIdMap()
  local projectIdMap = Mindwtr.getProjectIdMap()
  local tasks = {}
  for _, item in ipairs(resp.body.tasks) do
    taskData = {}
    for key, value in pairs(item) do
      taskData[key] = value
    end
    -- taskData.area = areaIdMap[taskData.areaId]
    taskData.project = projectIdMap[taskData.projectId]
    table.insert(tasks, taskData)
  end
  return tasks
end

-- function Mindwtr.getTasksWidget(filter)
--   local tasks = Mindwtr.getTasks(filter)
--   local rows = {}
--   for _, task in ipairs(tasks) do
--     table.insert(rows, dom.tr {
--       dom.td {
--         "**" .. task.project .. "**: "
--         .. task.content .. " - "
--         .. (task.due and task.due.date .. " - " or "")
--         .. "([mindwtr](https://app.mindwtr.com/app/task/" .. task.id .. "))"
--       },
--       dom.td {
--         dom.span {
--           widgets.button("Postpone", function()
--             local resp = Mindwtr.apiCall("tasks/" .. task.id, "POST", { due_string = "tomorrow" })
--             if not resp.ok then
--               error("Failed to postpone task in Mindwtr. See console for error")
--               js.log("Error", resp)
--               return false
--             end
--             editor.flashNotification("Task postponed to tomorrow")
--           end, { class = "postpone" }),
--           widgets.button("Complete", function()
--             local resp = Mindwtr.apiCall("tasks/" .. task.id .. "/close", "POST", {})
--             if not resp.ok then
--               error("Failed to mark task complete in Mindwtr. See console for error")
--               js.log("Error", resp)
--             end
--             editor.flashNotification("Task marked as complete in Mindwtr")
--           end, { class = "complete" })
--         }
--       }
--     })
--   end
--   if #rows == 0 then
--     rows = {
--       dom.tr {
--         dom.td { colspan="2", "_Nothing yet_" }
--       }
--     }
--   end
--   return widget.htmlBlock(dom.table {
--     class = "mindwtr-tasks-widget",
--     dom.thead {
--       dom.tr {
--         dom.td {"Mindwtr Tasks (filter: " .. filter .. ")"},
--         dom.td {"Actions"}
--       }
--     },
--     dom.tbody(rows)
--   })
-- end
```

${Mindwtr.getTasks()}

### Adding a Task

This creates a new global command to add a task to your Mindwtr Inbox. Any highlighted text will be included in the input.

```space-lua
-- {
--   "input": "Call Alice due:tomorrow @phone #errands",
--   "title": "Alternative title",
--   "props": { "status": "next" }
-- }
command.define {
  name = "Mindwtr: Create Inbox Task",
  run = function()
    -- If there is selected text then prefill in the prompt
    local text = editor.getText()
    local selection = editor.getSelection()
    if selection.from ~= selection.to then
      text = text:sub(selection.from, selection.to)
    else
      text = nil;
    end

    local task = editor.prompt("Add to Mindwtr Inbox:", text)
    if not task then
      return
    end

    -- Find the project id for Inbox
--    local inboxId = nil
--    local projectIdMap = Mindwtr.getProjectIdMap()
--    for id, name in pairs(projectIdMap) do
--      if name == "Inbox" then
--        inboxId = id
--      end
--    end

    local resp = Mindwtr.apiCall("tasks", "POST", { input = task })

    editor.flashNotification("New task added to Mindwtr Inbox")
  end
}
```