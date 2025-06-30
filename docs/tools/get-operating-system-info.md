# Get Operating System Info (`get_operating_system_info`)

**Description:**

The `get_operating_system_info` tool retrieves information about the operating system and hardware environment of the device where the Gemini CLI agent is running. It can provide general OS details or more specific information about CPU, memory, disk, or network interfaces.

This tool is particularly useful for agents that need to adapt their behavior based on the local environment, perform diagnostics, or report on system capabilities.

**Parameters:**

The tool accepts an optional `detail` parameter to specify the category of information to retrieve:

*   `detail` (string, optional): Specifies the category of information.
    *   If omitted, general OS information (OS type, release, hostname, uptime) is returned.
    *   Possible values:
        *   `"cpu"`: Returns detailed CPU information (architecture, model, number of cores, speed).
        *   `"memory"`: Returns detailed memory information (total, free, and used memory in bytes).
        *   `"disk"`: Returns disk space information. (Note: Current implementation provides placeholder data; full functionality is platform-dependent).
        *   `"network"`: Returns basic information about network interfaces (name, IP addresses, MAC address).
        *   `"all"`: Returns all available information categories (general, CPU, memory, disk, network).

**Example Usage:**

To get general OS information:

```json
{
  "tool_code": "get_operating_system_info"
}
```

To get CPU specific information:

```json
{
  "tool_code": "get_operating_system_info",
  "tool_params": {
    "detail": "cpu"
  }
}
```

To get all available information:

```json
{
  "tool_code": "get_operating_system_info",
  "tool_params": {
    "detail": "all"
  }
}
```

**Example Output (for `detail: "all"`):**

```json
{
  "osType": "Darwin",
  "osRelease": "23.1.0",
  "hostname": "my-macbook.local",
  "uptimeSeconds": 783450,
  "cpuInfo": {
    "architecture": "arm64",
    "model": "Apple M1 Pro",
    "cores": 10,
    "speed": "3220 MHz"
  },
  "memoryInfo": {
    "totalBytes": 17179869184,
    "freeBytes": 2147483648,
    "usedBytes": 15032385536
  },
  "diskInfo": [
    {
      "filesystem": "N/A (Detail requires platform-specific implementation)",
      "sizeBytes": 0,
      "usedBytes": 0,
      "availableBytes": 0,
      "mountpoint": "/Users/jules"
    }
  ],
  "networkInfo": [
    {
      "name": "en0",
      "ip4Address": "192.168.1.123",
      "ip6Address": "fe80::abc:def:ghi:jkl%en0",
      "macAddress": "a0:b1:c2:d3:e4:f5"
    },
    {
      "name": "awdl0",
      "ip6Address": "fe80::123:4567:89ab:cdef%awdl0",
      "macAddress": "1a:2b:3c:4d:5e:6f"
    }
    // ... other interfaces
  ]
}
```

**Notes:**

*   The output is a JSON string.
*   The `diskInfo` section currently provides placeholder information. A full implementation requires platform-specific commands or libraries to determine actual disk usage.
*   The availability and detail of network information can vary based on the system's configuration.
