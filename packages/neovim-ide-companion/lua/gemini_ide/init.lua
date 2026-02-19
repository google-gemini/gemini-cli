local M = {}

local context = require('gemini_ide.context')
local diff = require('gemini_ide.diff')

local function plugin_root()
  local source = debug.getinfo(1, 'S').source
  if source:sub(1, 1) == '@' then
    source = source:sub(2)
  end
  return vim.fn.fnamemodify(source, ':p:h:h')
end

local function bridge_dir()
  return vim.loop.os_tmpdir() .. '/gemini/ide/neovim'
end

local function default_sidecar_path()
  return plugin_root() .. '/dist/sidecar/server.js'
end

local function generate_token()
  local seed = tostring(vim.loop.hrtime()) .. tostring(math.random())
  return seed:gsub('%s+', '')
end

function M.setup(opts)
  opts = opts or {}

  local transport = opts.transport or 'stdio'
  local sidecar_path = opts.sidecar_path or default_sidecar_path()
  local workspace_path = opts.workspace_path or vim.fn.getcwd()
  local auth_token = opts.auth_token or generate_token()

  vim.env.GEMINI_CLI_IDE_WORKSPACE_PATH = workspace_path
  vim.env.GEMINI_CLI_IDE_AUTH_TOKEN = auth_token

  if vim.fn.filereadable(sidecar_path) == 0 then
    vim.notify(
      'Gemini IDE sidecar not found. Build the package to generate dist/sidecar/server.js',
      vim.log.levels.WARN
    )
  end

  if transport == 'http' then
    local cmd = opts.http_command or 'node'
    vim.fn.jobstart({ cmd, sidecar_path, '--http' }, { detach = true })
  else
    local cmd = opts.stdio_command or 'node'
    vim.env.GEMINI_CLI_IDE_SERVER_STDIO_COMMAND = cmd
    vim.env.GEMINI_CLI_IDE_SERVER_STDIO_ARGS = vim.fn.json_encode({ sidecar_path, '--stdio' })
  end

  local dir = bridge_dir()
  context.setup(dir)
  diff.start_request_poll(dir)

  vim.api.nvim_create_user_command('GeminiDiffAccept', function()
    diff.accept_current()
  end, {})

  vim.api.nvim_create_user_command('GeminiDiffReject', function()
    diff.reject_current()
  end, {})
end

return M
