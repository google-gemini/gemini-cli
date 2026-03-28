# V8 Heap Snapshot Format

Reference for the `.heapsnapshot` JSON structure produced by
`v8.writeHeapSnapshot()` and `HeapProfiler.takeHeapSnapshot` CDP command.

## Top-Level Structure

```json
{
  "snapshot": { "meta": { ... }, "node_count": N, "edge_count": M },
  "nodes": [ ...flat array... ],
  "edges": [ ...flat array... ],
  "trace_function_infos": [],
  "trace_tree": [],
  "samples": [],
  "strings": [ "string table entries" ]
}
```

## Meta Fields

`snapshot.meta` contains field descriptors that define the layout of `nodes` and
`edges` arrays:

```json
{
  "node_fields": [
    "type",
    "name",
    "id",
    "self_size",
    "edge_count",
    "trace_node_id",
    "detachedness"
  ],
  "node_types": [
    [
      "hidden",
      "array",
      "string",
      "object",
      "code",
      "closure",
      "regexp",
      "number",
      "native",
      "synthetic",
      "concatenated string",
      "sliced string",
      "symbol",
      "bigint"
    ],
    "string",
    "number",
    "number",
    "number",
    "number",
    "number"
  ],
  "edge_fields": ["type", "name_or_index", "to_node"],
  "edge_types": [
    [
      "context",
      "element",
      "property",
      "internal",
      "hidden",
      "shortcut",
      "weak"
    ],
    "string_or_number",
    "node"
  ]
}
```

## Reading Nodes

Nodes are stored as a flat array. Each node occupies `node_fields.length`
consecutive entries:

```
nodes[i * 7 + 0] = type index (into node_types[0])
nodes[i * 7 + 1] = name index (into strings[])
nodes[i * 7 + 2] = unique id
nodes[i * 7 + 3] = self_size in bytes
nodes[i * 7 + 4] = edge_count (outgoing edges)
nodes[i * 7 + 5] = trace_node_id
nodes[i * 7 + 6] = detachedness (0=attached, 1=detached)
```

**Important**: The field count (7) varies across Node.js versions. Always read
it from `meta.node_fields.length`.

## Node Types

| Type        | Description                                   |
| ----------- | --------------------------------------------- |
| `hidden`    | V8 internal objects (hidden from user)        |
| `object`    | JS objects — constructor name in `name` field |
| `closure`   | Function closures                             |
| `string`    | String primitives                             |
| `code`      | Compiled code                                 |
| `array`     | Internal arrays (not JS Array)                |
| `native`    | C++ backing objects                           |
| `synthetic` | Synthetic roots (GC roots)                    |

## Edge Types

| Type       | Description                                   |
| ---------- | --------------------------------------------- |
| `context`  | Closure variable capture                      |
| `element`  | Array element (name_or_index = numeric index) |
| `property` | Named property                                |
| `internal` | V8 internal reference                         |
| `hidden`   | Hidden reference                              |
| `shortcut` | Shortcut reference (optimization)             |
| `weak`     | Weak reference (ignored for retained size)    |

## Key Observations for Parsers

- `strings[]` is the string table — `name` fields in nodes/edges index into it
- Node IDs are unique across snapshots — use them for diffing
- `detachedness` field was added in Node 14+ — older snapshots have 6 fields per
  node
- Edge `to_node` is a **byte offset into the nodes array**, not a node index.
  Divide by `node_fields.length` to get node index
