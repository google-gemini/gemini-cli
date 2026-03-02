-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local M = {}

--- @type string|nil Path to the discovery file
local discovery_file = nil

--- Get the temp directory.
--- @return string
local function get_tmpdir()
  return os.getenv("TMPDIR") or os.getenv("TEMP") or os.getenv("TMP") or "/tmp"
end

--- Get the discovery directory path.
--- @return string
local function get_discovery_dir()
  local tmpdir = get_tmpdir()
  return tmpdir .. "/gemini/ide"
end

--- Write the discovery file.
--- @param port number
--- @param auth_token string
--- @param workspace_path string|nil
--- @return string|nil file_path, string|nil error
function M.write(port, auth_token, workspace_path)
  local dir = get_discovery_dir()
  local pid = vim.fn.getpid()
  local filename = string.format("gemini-ide-server-%d-%d.json", pid, port)

  -- Create directory recursively
  vim.fn.mkdir(dir, "p")

  local filepath = dir .. "/" .. filename

  local content = vim.json.encode({
    port = port,
    workspacePath = workspace_path or vim.fn.getcwd(),
    authToken = auth_token,
    ideInfo = {
      name = "neovim",
      displayName = "Neovim",
    },
  })

  local f, err = io.open(filepath, "w")
  if not f then
    return nil, "Failed to write discovery file: " .. (err or "unknown error")
  end
  f:write(content)
  f:close()

  -- Set file permissions to 0600
  local uv = vim.loop
  uv.fs_chmod(filepath, tonumber("600", 8))

  discovery_file = filepath
  return filepath, nil
end

--- Remove the discovery file.
function M.cleanup()
  if discovery_file then
    pcall(os.remove, discovery_file)
    discovery_file = nil
  end
end

--- Get the current discovery file path.
--- @return string|nil
function M.get_path()
  return discovery_file
end

return M
