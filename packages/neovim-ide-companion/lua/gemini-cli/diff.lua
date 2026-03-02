-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local mcp = require("gemini-cli.mcp")

local M = {}

--- @type table<string, { original_buf: number, proposed_buf: number, new_content: string }> filePath -> diff state
local active_diffs = {}

--- @type function|nil Callback for broadcasting SSE notifications
local broadcast_fn = nil

--- Set the broadcast function for sending SSE notifications.
--- @param fn function
function M.set_broadcast(fn)
  broadcast_fn = fn
end

--- Open a diff view for a file.
--- @param file_path string Absolute path to the file
--- @param new_content string Proposed content
function M.open_diff(file_path, new_content)
  -- Close existing diff for this file if any
  if active_diffs[file_path] then
    M.close_diff_buffers(file_path)
  end

  -- Open the original file
  vim.cmd("edit " .. vim.fn.fnameescape(file_path))
  local original_buf = vim.api.nvim_get_current_buf()
  vim.cmd("diffthis")

  -- Create a vertical split with the proposed content
  vim.cmd("vsplit")
  local proposed_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(0, proposed_buf)

  -- Set proposed buffer content
  local lines = vim.split(new_content, "\n", { plain = true })
  vim.api.nvim_buf_set_lines(proposed_buf, 0, -1, false, lines)

  -- Configure proposed buffer
  vim.bo[proposed_buf].buftype = "nofile"
  vim.bo[proposed_buf].bufhidden = "wipe"
  vim.bo[proposed_buf].swapfile = false
  vim.bo[proposed_buf].modifiable = false

  -- Set buffer name for clarity
  local buf_name = "[Proposed] " .. vim.fn.fnamemodify(file_path, ":t")
  pcall(vim.api.nvim_buf_set_name, proposed_buf, buf_name)

  -- Enable diff mode
  vim.cmd("diffthis")

  -- Store diff state
  active_diffs[file_path] = {
    original_buf = original_buf,
    proposed_buf = proposed_buf,
    new_content = new_content,
  }

  -- Set keymaps for accept/reject
  local opts = { buffer = original_buf, silent = true }
  vim.keymap.set("n", "<leader>ga", function()
    M.accept_diff(file_path)
  end, vim.tbl_extend("force", opts, { desc = "Accept diff" }))

  vim.keymap.set("n", "<leader>gr", function()
    M.reject_diff(file_path)
  end, vim.tbl_extend("force", opts, { desc = "Reject diff" }))

  -- Also set keymaps on proposed buffer
  local proposed_opts = { buffer = proposed_buf, silent = true }
  vim.keymap.set("n", "<leader>ga", function()
    M.accept_diff(file_path)
  end, vim.tbl_extend("force", proposed_opts, { desc = "Accept diff" }))

  vim.keymap.set("n", "<leader>gr", function()
    M.reject_diff(file_path)
  end, vim.tbl_extend("force", proposed_opts, { desc = "Reject diff" }))
end

--- Accept a diff: write proposed content to file and notify.
--- @param file_path string
function M.accept_diff(file_path)
  local diff = active_diffs[file_path]
  if not diff then
    vim.notify("[gemini-cli] No active diff for: " .. file_path, vim.log.levels.WARN)
    return
  end

  local content = diff.new_content

  -- Write the proposed content to the original file buffer
  if vim.api.nvim_buf_is_valid(diff.original_buf) then
    local lines = vim.split(content, "\n", { plain = true })
    vim.bo[diff.original_buf].modifiable = true
    vim.api.nvim_buf_set_lines(diff.original_buf, 0, -1, false, lines)
    -- Save the file
    vim.api.nvim_buf_call(diff.original_buf, function()
      vim.cmd("write")
    end)
  end

  -- Close diff buffers
  M.close_diff_buffers(file_path)

  -- Send notification
  if broadcast_fn then
    broadcast_fn(mcp.diff_accepted(file_path, content))
  end

  vim.notify("[gemini-cli] Diff accepted: " .. vim.fn.fnamemodify(file_path, ":t"), vim.log.levels.INFO)
end

--- Reject a diff: close buffers and notify.
--- @param file_path string
function M.reject_diff(file_path)
  local diff = active_diffs[file_path]
  if not diff then
    vim.notify("[gemini-cli] No active diff for: " .. file_path, vim.log.levels.WARN)
    return
  end

  -- Close diff buffers
  M.close_diff_buffers(file_path)

  -- Send notification
  if broadcast_fn then
    broadcast_fn(mcp.diff_rejected(file_path))
  end

  vim.notify("[gemini-cli] Diff rejected: " .. vim.fn.fnamemodify(file_path, ":t"), vim.log.levels.INFO)
end

--- Close diff buffers for a file path.
--- @param file_path string
function M.close_diff_buffers(file_path)
  local diff = active_diffs[file_path]
  if not diff then
    return
  end

  -- Close proposed buffer
  if vim.api.nvim_buf_is_valid(diff.proposed_buf) then
    -- Find and close windows showing this buffer
    for _, win in ipairs(vim.api.nvim_list_wins()) do
      if vim.api.nvim_win_get_buf(win) == diff.proposed_buf then
        pcall(vim.api.nvim_win_close, win, true)
      end
    end
    pcall(vim.api.nvim_buf_delete, diff.proposed_buf, { force = true })
  end

  -- Turn off diff mode for original buffer
  if vim.api.nvim_buf_is_valid(diff.original_buf) then
    vim.api.nvim_buf_call(diff.original_buf, function()
      vim.cmd("diffoff")
    end)
  end

  active_diffs[file_path] = nil
end

--- Clean up all active diffs.
function M.cleanup()
  for file_path, _ in pairs(active_diffs) do
    M.close_diff_buffers(file_path)
  end
  active_diffs = {}
  broadcast_fn = nil
end

return M
