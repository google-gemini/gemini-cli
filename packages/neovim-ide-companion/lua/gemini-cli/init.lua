-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local M = {}

--- @type boolean
local started = false

--- @type number|nil Autocmd group
local augroup = nil

--- Set up and start the Gemini CLI companion.
--- @param opts table|nil { auto_start: boolean }
function M.setup(opts)
  opts = opts or {}
  local auto = opts.auto_start ~= false -- default true

  -- Create user commands
  vim.api.nvim_create_user_command("GeminiCliStart", function()
    M.start()
  end, { desc = "Start Gemini CLI companion server" })

  vim.api.nvim_create_user_command("GeminiCliStop", function()
    M.stop()
  end, { desc = "Stop Gemini CLI companion server" })

  vim.api.nvim_create_user_command("GeminiCliStatus", function()
    M.status()
  end, { desc = "Show Gemini CLI companion status" })

  if auto then
    M.auto_start()
  end
end

--- Start the companion server.
function M.start()
  if started then
    vim.notify("[gemini-cli] Server is already running", vim.log.levels.WARN)
    return
  end

  local auth = require("gemini-cli.auth")
  local server = require("gemini-cli.server")
  local discovery = require("gemini-cli.discovery")
  local context = require("gemini-cli.context")
  local diff = require("gemini-cli.diff")

  -- Create autocmd group
  augroup = vim.api.nvim_create_augroup("GeminiCli", { clear = true })

  -- Set up context tracking
  context.setup(augroup)

  -- Set up diff broadcast
  diff.set_broadcast(function(data)
    server.broadcast_sse(data)
  end)

  -- Start server with context provider and diff handler
  local port, token = server.start({
    auth_token = auth.generate_token(),
    context_provider = function()
      return context.get_context()
    end,
    diff_handler = {
      open = function(file_path, new_content)
        diff.open_diff(file_path, new_content)
      end,
      close = function(file_path)
        diff.close_diff_buffers(file_path)
      end,
    },
  })

  -- Write discovery file
  local filepath, err = discovery.write(port, token)
  if err then
    vim.notify("[gemini-cli] " .. err, vim.log.levels.ERROR)
  end

  -- Set up context change notifications
  context.on_change(function(ctx)
    local mcp = require("gemini-cli.mcp")
    server.broadcast_sse(mcp.context_update(ctx))
  end)

  -- Clean up on exit
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = augroup,
    callback = function()
      M.stop()
    end,
  })

  started = true
  vim.notify(
    string.format("[gemini-cli] Server started on port %d (discovery: %s)", port, filepath or "none"),
    vim.log.levels.INFO
  )
end

--- Auto-start if conditions are met.
function M.auto_start()
  if started then
    return
  end
  -- Start automatically — the plugin is loaded, so the user wants it
  M.start()
end

--- Stop the companion server.
function M.stop()
  if not started then
    return
  end

  local server = require("gemini-cli.server")
  local discovery = require("gemini-cli.discovery")
  local context = require("gemini-cli.context")
  local diff = require("gemini-cli.diff")

  diff.cleanup()
  context.cleanup()
  server.stop()
  discovery.cleanup()

  if augroup then
    pcall(vim.api.nvim_del_augroup_by_id, augroup)
    augroup = nil
  end

  started = false
end

--- Show server status.
function M.status()
  if not started then
    vim.notify("[gemini-cli] Server is not running", vim.log.levels.INFO)
    return
  end

  local server = require("gemini-cli.server")
  local discovery = require("gemini-cli.discovery")
  local port = server.get_port()
  local disc_path = discovery.get_path()

  local lines = {
    "[gemini-cli] Server status:",
    "  Port: " .. (port or "unknown"),
    "  Discovery file: " .. (disc_path or "none"),
  }

  local srv_state = server.get_state()
  if srv_state then
    local session_count = 0
    for _ in pairs(srv_state.sessions) do
      session_count = session_count + 1
    end
    local sse_count = 0
    for _ in pairs(srv_state.sse_clients) do
      sse_count = sse_count + 1
    end
    table.insert(lines, "  Active sessions: " .. session_count)
    table.insert(lines, "  SSE clients: " .. sse_count)
  end

  vim.notify(table.concat(lines, "\n"), vim.log.levels.INFO)
end

return M
