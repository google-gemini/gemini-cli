# The 3-Snapshot Technique for Memory Leak Detection

## Overview

The 3-snapshot technique is a systematic approach to identifying memory leaks in
long-running applications. It uses three sequential heap snapshots to
distinguish between legitimate memory growth and actual leaks.

## How It Works

1. **Snapshot 1 (Baseline)**: Capture after the application has fully
   initialized and performed its first set of operations. This establishes the
   baseline memory state.

2. **Snapshot 2 (Working)**: Capture after the suspected leaking operations have
   been performed. Objects present in Snapshot 2 but not in Snapshot 1 include
   both leaked objects AND legitimate new allocations.

3. **Snapshot 3 (Verification)**: Repeat the same operations and capture again.
   Objects that grew between Snapshot 2 and Snapshot 3 are strong leak
   candidates — they indicate memory that accumulates with each operation cycle.

## Why 3 Snapshots?

- **2 snapshots** can show growth, but cannot distinguish one-time allocations
  from recurring leaks.
- **3 snapshots** reveal the _pattern_: if objects grow consistently between
  Snapshot 2 and 3 (just as they did between 1 and 2), that's a leak.

## Common Leak Patterns

| Pattern                     | Symptom                               | Fix                                     |
| --------------------------- | ------------------------------------- | --------------------------------------- |
| Event listener accumulation | `EventEmitter` count grows            | `removeListener()` / `off()` in cleanup |
| Closure retention           | Anonymous functions hold outer scope  | Break references, use WeakRef           |
| Cache without eviction      | Map/Set grows unbounded               | LRU cache, WeakMap, TTL                 |
| Detached DOM nodes          | DOM nodes with no parent              | Null references after removal           |
| Timer leaks                 | `setInterval` without `clearInterval` | Store handle and clear on cleanup       |
| Promise chains              | Unresolved promises hold references   | Ensure all promises resolve/reject      |

## Interpreting Results

When analyzing diff output:

- **High instance count growth**: Many objects of the same type being created
  without cleanup.
- **High size growth**: Large objects or buffers accumulating.
- **Retainer chains**: Follow the path from root to leaked object to find where
  references are held.

## References

- [Chrome DevTools Memory Panel](https://developer.chrome.com/docs/devtools/memory-problems/)
- [Node.js Diagnostics Guide](https://nodejs.org/en/guides/diagnostics/memory/using-heap-snapshot)
- [3-Snapshot Technique Original Article](https://www.jshapira.com/jekyll/update/2016/01/17/debugging-memory-leaks.html)
