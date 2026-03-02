-- Copyright 2026 Google LLC
-- SPDX-License-Identifier: Apache-2.0

local M = {}

--- Generate a UUID v4 token.
--- @return string
function M.generate_token()
  -- Use /dev/urandom for randomness, fall back to math.random
  local ok, bytes = pcall(function()
    local f = io.open("/dev/urandom", "rb")
    if not f then
      return nil
    end
    local data = f:read(16)
    f:close()
    return data
  end)

  if ok and bytes and #bytes == 16 then
    -- Set version 4 and variant bits
    local b = { string.byte(bytes, 1, 16) }
    b[7] = bit.bor(bit.band(b[7], 0x0F), 0x40) -- version 4
    b[9] = bit.bor(bit.band(b[9], 0x3F), 0x80) -- variant 1
    return string.format(
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8],
      b[9], b[10], b[11], b[12], b[13], b[14], b[15], b[16]
    )
  end

  -- Fallback: math.random-based UUID
  math.randomseed(os.time() + os.clock() * 1000)
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return string.gsub(template, "[xy]", function(c)
    local v = (c == "x") and math.random(0, 0xf) or math.random(8, 0xb)
    return string.format("%x", v)
  end)
end

--- Validate a Bearer token from an HTTP Authorization header.
--- @param header string|nil The Authorization header value
--- @param expected_token string The expected token
--- @return boolean
function M.validate_bearer(header, expected_token)
  if not header then
    return false
  end
  local parts = {}
  for part in header:gmatch("%S+") do
    table.insert(parts, part)
  end
  if #parts ~= 2 or parts[1] ~= "Bearer" then
    return false
  end
  return parts[2] == expected_token
end

return M
