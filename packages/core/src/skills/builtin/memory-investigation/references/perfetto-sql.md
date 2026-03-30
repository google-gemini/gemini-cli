# Perfetto SQL Integration

After exporting a trace with `investigate(action="export_perfetto")`, you can run SQL queries directly against it using `PerfettoSqlIntegration`.

## Supported SQL Subset

The integration implements a subset of PerfettoSQL with these supported clauses:

- `SELECT` — with column aliases (`AS`)
- `FROM` — trace table name
- `WHERE` — comparisons (`=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`, `BETWEEN`), `AND`/`OR`
- `ORDER BY` — with `ASC`/`DESC`
- `LIMIT` / `OFFSET`
- `COUNT(*)` aggregate

## Trace Tables

| Table | Rows represent |
|-------|---------------|
| `heap_objects` | Individual heap objects (name, size, retainedSize, type) |
| `gc_events` | GC pauses (type, duration, heapBefore, heapAfter) |
| `allocations` | Allocation samples (functionName, url, lineNumber, bytes) |
| `memory_counters` | Time-series heap usage (timestamp, heapUsed, heapTotal, external) |

## Example Queries

**Top 10 largest object classes:**
```sql
SELECT name, COUNT(*) as count, SUM(retainedSize) as totalBytes
FROM heap_objects
WHERE type = 'object'
ORDER BY totalBytes DESC
LIMIT 10
```

**GC pauses longer than 100ms:**
```sql
SELECT type, duration, heapBefore, heapAfter
FROM gc_events
WHERE duration > 100
ORDER BY duration DESC
```

**Memory growth over time:**
```sql
SELECT timestamp, heapUsed, heapTotal
FROM memory_counters
ORDER BY timestamp ASC
```

**Allocation hotspots in user code:**
```sql
SELECT functionName, url, SUM(bytes) as totalBytes
FROM allocations
WHERE url NOT LIKE 'node:%'
ORDER BY totalBytes DESC
LIMIT 20
```

## Usage

```ts
const sql = new PerfettoSqlIntegration(traceData);
const result = sql.query(`
  SELECT name, SUM(retainedSize) as retained
  FROM heap_objects
  GROUP BY name
  ORDER BY retained DESC
  LIMIT 10
`);
// result.rows: array of objects
// result.columns: string[]
// result.rowCount: number
```
