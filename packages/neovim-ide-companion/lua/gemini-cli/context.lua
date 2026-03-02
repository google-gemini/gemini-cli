-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local mcp = require("gemini-cli.mcp")

local M = {}

local MAX_OPEN_FILES = 10
local MAX_SELECTED_TEXT = 16384 -- 16 KiB

--- @type table<number, { path: string, timestamp: number }> Buffer number -> file info
local open_files = {}

--- @type { line: number, character: number }|nil
local cursor_pos = nil

--- @type string|nil
local selected_text = nil

--- @type number|nil Active buffer number
local active_buf = nil

--- @type function|nil Callback for context changes
local on_change_cb = nil

--- @type userdata|nil Debounce timer
local debounce_timer = nil

--- Debounce interval in milliseconds.
local DEBOUNCE_MS = 50

--- Check if a buffer is a regular file buffer.
--- @param bufnr number
--- @return boolean
local function is_file_buffer(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) then
    return false
  end
  local buftype = vim.bo[bufnr].buftype
  if buftype ~= "" then
    return false
  end
  local name = vim.api.nvim_buf_get_name(bufnr)
  if name == "" then
    return false
  end
  return true
end

--- Notify context change (debounced).
local function notify_change()
  if debounce_timer then
    debounce_timer:stop()
  end
  debounce_timer = vim.defer_fn(function()
    if on_change_cb then
      on_change_cb(M.get_context())
    end
    debounce_timer = nil
  end, DEBOUNCE_MS)
end

--- Track a buffer being entered.
--- @param bufnr number
local function on_buf_enter(bufnr)
  if not is_file_buffer(bufnr) then
    return
  end

  local path = vim.api.nvim_buf_get_name(bufnr)
  active_buf = bufnr

  open_files[bufnr] = {
    path = path,
    timestamp = os.time(),
  }

  -- Enforce max open files
  local count = 0
  for _ in pairs(open_files) do
    count = count + 1
  end
  if count > MAX_OPEN_FILES then
    -- Remove oldest entry
    local oldest_buf = nil
    local oldest_time = math.huge
    for buf, info in pairs(open_files) do
      if buf ~= active_buf and info.timestamp < oldest_time then
        oldest_time = info.timestamp
        oldest_buf = buf
      end
    end
    if oldest_buf then
      open_files[oldest_buf] = nil
    end
  end

  notify_change()
end

--- Track a buffer being deleted.
--- @param bufnr number
local function on_buf_delete(bufnr)
  open_files[bufnr] = nil
  if active_buf == bufnr then
    active_buf = nil
  end
  notify_change()
end

--- Track cursor movement.
local function on_cursor_moved()
  if not active_buf then
    return
  end
  local pos = vim.api.nvim_win_get_cursor(0)
  cursor_pos = {
    line = pos[1],
    character = pos[2] + 1,
  }
  notify_change()
end

--- Track mode changes for selection.
local function on_mode_changed()
  local mode = vim.fn.mode()
  if mode == "v" or mode == "V" or mode == "\22" then
    -- Visual mode: get selection
    vim.schedule(function()
      local _, ls, cs = unpack(vim.fn.getpos("v"))
      local _, le, ce = unpack(vim.fn.getpos("."))
      if ls > le or (ls == le and cs > ce) then
        ls, cs, le, ce = le, ce, ls, cs
      end
      local lines = vim.api.nvim_buf_get_lines(0, ls - 1, le, false)
      if #lines > 0 then
        lines[#lines] = lines[#lines]:sub(1, ce)
        lines[1] = lines[1]:sub(cs)
        local text = table.concat(lines, "\n")
        if #text > MAX_SELECTED_TEXT then
          text = text:sub(1, MAX_SELECTED_TEXT)
        end
        selected_text = text
      else
        selected_text = nil
      end
      notify_change()
    end)
  else
    if selected_text then
      selected_text = nil
      notify_change()
    end
  end
end

--- Get the current IDE context.
--- @return table
function M.get_context()
  local files = {}
  for bufnr, info in pairs(open_files) do
    local file = {
      path = info.path,
      timestamp = info.timestamp,
    }
    if bufnr == active_buf then
      file.isActive = true
      if cursor_pos then
        file.cursor = cursor_pos
      end
      if selected_text then
        file.selectedText = selected_text
      end
    end
    table.insert(files, file)
  end

  -- Sort by timestamp descending (most recent first)
  table.sort(files, function(a, b) return a.timestamp > b.timestamp end)

  return {
    workspaceState = {
      openFiles = files,
      isTrusted = true,
    },
  }
end

--- Set the callback for context changes.
--- @param cb function Called with context table on changes
function M.on_change(cb)
  on_change_cb = cb
end

--- Set up autocmds for context tracking.
--- @param group number Autocmd group ID
function M.setup(group)
  vim.api.nvim_create_autocmd("BufEnter", {
    group = group,
    callback = function(ev)
      on_buf_enter(ev.buf)
    end,
  })

  vim.api.nvim_create_autocmd("BufDelete", {
    group = group,
    callback = function(ev)
      on_buf_delete(ev.buf)
    end,
  })

  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
    group = group,
    callback = function()
      on_cursor_moved()
    end,
  })

  vim.api.nvim_create_autocmd("ModeChanged", {
    group = group,
    callback = function()
      on_mode_changed()
    end,
  })

  -- Track the current buffer on setup
  local current_buf = vim.api.nvim_get_current_buf()
  if is_file_buffer(current_buf) then
    on_buf_enter(current_buf)
  end
end

--- Clean up state.
function M.cleanup()
  open_files = {}
  cursor_pos = nil
  selected_text = nil
  active_buf = nil
  on_change_cb = nil
  if debounce_timer then
    debounce_timer:stop()
    debounce_timer = nil
  end
end

return M
