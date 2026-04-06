---
name: "Library/Dklawren/Todoist"
tags: meta/library
---

## Todoist

You need to add a developer API key value to able to access your Todoist data.
You can get one at <https://app.todoist.com/app/settings/integrations/developer>.

### Example Config
```lua
config.set('todoistToken', 'developer_api_key_here')
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
```

### Utility and Task Functions

```space-lua
Todoist = {}
Todoist.projectIdMap = {}

function Todoist.apiCall(path, method, body)
  local token = config.get("todoistToken")
  if not token then
    error("todoistToken config not set")
  end
  return net.proxyFetch("https://api.todoist.com/api/v1/" .. path, {
    method = method,
    headers = {
      ["Authorization"] = "Bearer " .. token,
      ["Content-Type"] = "application/json",
      ["Accept"] = "application/json"
    },
    body = body
  })
end

function Todoist.getProjectIdMap()
  if next(Todoist.projectIdMap) then
    return Todoist.projectIdMap
  end
  local resp = Todoist.apiCall("projects", "GET")
  if not resp.ok then
    error("Failed to get Todoist projects, see console for error")
    js.log("Error", resp)
    return
  end
  for _, item in ipairs(resp.body.results) do
    Todoist.projectIdMap[item.id] = item.name
  end
  return Todoist.projectIdMap
end

function Todoist.getProjectList()
  local projectIdMap = Todoist.getProjectIdMap()
  local projectList = {}
  for id, name in pairs(projectIdMap) do
    table.insert(projectList, {id = id, name = name})
  end
  return projectList
end

  function Todoist.urlEncode(str)
  return str:gsub("[^%w%-%.%_%~]", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
end

function Todoist.getTasks(filter)
  local path = "tasks"
  if filter then
    path = path .. "/filter?lang=en&query=" .. Todoist.urlEncode(filter)
  end
  local resp = Todoist.apiCall(path, "GET")
  if not resp.ok then
    error("Failed to get Todoist tasks, see console for error")
    js.log("Error", resp)
    return
  end
  local projectIdMap = Todoist.getProjectIdMap()
  local tasks = {}
  for _, item in ipairs(resp.body.results) do
    taskData = {}
    for key, value in pairs(item) do
      taskData[key] = value
    end
    taskData.project = projectIdMap[taskData.project_id]
    table.insert(tasks, taskData)
  end
  return tasks
end

function Todoist.getTasksWidget(filter)
  local tasks = Todoist.getTasks(filter)
  local rows = {}
  for _, task in ipairs(tasks) do
    table.insert(rows, dom.tr {
      dom.td {
        "**" .. task.project .. "**: "
        .. task.content .. " - "
        .. (task.due and task.due.date .. " - " or "")
        .. "([todoist](https://app.todoist.com/app/task/" .. task.id .. "))"
      },
      dom.td {
        dom.span {
          widgets.button("Postpone", function()
            local resp = Todoist.apiCall("tasks/" .. task.id, "POST", { due_string = "tomorrow" })
            if not resp.ok then
              error("Failed to postpone task in Todoist. See console for error")
              js.log("Error", resp)
              return false
            end
            editor.flashNotification("Task postponed to tomorrow")
          end, { class = "postpone" }),
          widgets.button("Complete", function()
            local resp = Todoist.apiCall("tasks/" .. task.id .. "/close", "POST", {})
            if not resp.ok then
              error("Failed to mark task complete in Todoist. See console for error")
              js.log("Error", resp)
            end
            editor.flashNotification("Task marked as complete in Todoist")
          end, { class = "complete" })
        }
      }
    })
  end
  if #rows == 0 then
    rows = {
      dom.tr {
        dom.td { colspan="2", "_Nothing yet_" }
      }
    }
  end
  return widget.htmlBlock(dom.table {
    class = "todoist-tasks-widget",
    dom.thead {
      dom.tr {
        dom.td {"Todoist Tasks (filter: " .. filter .. ")"},
        dom.td {"Actions"}
      }
    },
    dom.tbody(rows)
  })
end
```

### Adding a Task

This creates a new global command to add a task to your Todoist Inbox. Any highlighted text will be included in the input.

```space-lua
command.define {
  name = "Todoist: Create Inbox Task",
  run = function()
    -- If there is selected text then prefill in the prompt
    local text = editor.getText()
    local selection = editor.getSelection()
    if selection.from ~= selection.to then
      text = text:sub(selection.from, selection.to)
    else
      text = nil;
    end

    local task = editor.prompt("Add to Todoist Inbox:", text)
    if not task then
      return
    end

    -- Find the project id for Inbox
    local inboxId = nil
    local projectIdMap = Todoist.getProjectIdMap()
    for id, name in pairs(projectIdMap) do
      if name == "Inbox" then
        inboxId = id
      end
    end

    local resp = Todoist.apiCall("tasks", "POST",
      { content = task, project_id = inboxId})

    editor.flashNotification("New task added to Todoist Inbox")
  end
}
```

### Styles

```space-style
/* table.todoist-tasks-widget {
  table-layout: fixed;
} */

table.todoist-tasks-widget tbody td {
  vertical-align: top;
  white-space: normal !important;
}

/* table.todoist-tasks-widget thead td {
  white-space: nowrap !important;
}
*/

table.todoist-tasks-widget thead td:last-child {
  text-align: right;
  width: 10%;
}

table.todoist-tasks-widget tbody td:last-child {
  text-align: right;
  width: 10%;
}
```

### Examples Queries

**List of Projects**

${template.each(Todoist.getProjectList(), templates.todoistProjectItem)}

**Get Tasks Matching Filter**
\${Todoist.getTasks("overdue|today")}

\${query[[from Todoist.getTasks()]]}
