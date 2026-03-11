# Google C# Style Guide Summary

This document summarizes key rules and best practices from the Google C# Style
Guide.

## 1. Naming Conventions

- **PascalCase:** For class names, method names, constants, properties,
  namespaces, and public fields.
  - Example: `MyClass`, `GetValue()`, `MaxValue`
- **\_camelCase:** For private, internal, and protected fields (with leading
  underscore).
  - Example: `_myField`, `_internalState`
- **camelCase:** For local variables and parameters.
  - Example: `localVariable`, `methodParameter`
- **Interfaces:** Prefix with `I` (e.g., `IMyInterface`).
- **Type Parameters:** Use descriptive names prefixed with `T` (e.g., `TValue`,
  `TKey`), or just `T` for simple cases.

## 2. Formatting Rules

- **Indentation:** Use 2 spaces (never tabs).
- **Braces:** K&R style—no line break before the opening brace; keep `} else` on
  one line; braces required even when optional.
  ```csharp
  if (condition) {
    DoSomething();
  } else {
    DoSomethingElse();
  }
  ```
- **Line Length:** Column limit 100.
- **One Statement Per Line:** Each statement on its own line.

## 3. Declaration Order

Class member ordering:

- Group members in this order:
  1. Nested classes, enums, delegates, and events
  2. Static, const, and readonly fields
  3. Fields and properties
  4. Constructors and finalizers
  5. Methods
- Within each group, order by accessibility:
  1. Public
  2. Internal
  3. Protected internal
  4. Protected
  5. Private
- Where possible, group interface implementations together.

## 4. Language Features

- **var:** Use of `var` is encouraged if it aids readability by avoiding type
  names that are noisy, obvious, or unimportant. Prefer explicit types when it
  improves clarity.
  ```csharp
  var apple = new Apple();  // Good - type is obvious
  bool success = true;  // Preferred over var for basic types
  ```
- **Expression-bodied Members:** Use sparingly for simple properties and
  lambdas; don't use on method definitions.
  ```csharp
  public int Age => _age;
  // Methods: prefer block bodies.
  ```
- **String Interpolation:** In general, use whatever is easiest to read,
  particularly for logging and assert messages.
  - Be aware that chained `operator+` concatenations can be slower and cause
    memory churn.
  - If performance is a concern, `StringBuilder` can be faster for multiple
    concatenations.
  ```csharp
  var message = $"Hello, {name}!";
  ```
- **Collection Initializers:** Use collection and object initializers when
  appropriate.
  ```csharp
  var list = new List<int> { 1, 2, 3 };
  ```
- **Null-conditional Operators:** Use `?.` and `??` to simplify null checks.
  ```csharp
  var length = text?.Length ?? 0;
  ```
- **Pattern Matching:** Use pattern matching for type checks and casts.
  ```csharp
  if (obj is string str) { /* use str */ }
  ```

## 5. Best Practices

- **Structs vs Classes**:
  - Almost always use a class.
  - Consider structs only for small, value-like types that are short-lived or
    frequently embedded.
  - Performance considerations may justify deviations from this guidance.
- **Access Modifiers:** Always explicitly declare access modifiers (don't rely
  on defaults).
- **Ordering Modifiers:** Use standard order:
  `public protected internal private new abstract virtual override sealed static readonly extern unsafe volatile async`.
- **Namespace Imports:** Place `using` directives at the top of the file
  (outside namespaces); `System` first, then alphabetical.
- **Constants:** Always make variables `const` when possible; if not, use
  `readonly`. Prefer named constants over magic numbers.
- **IEnumerable vs IList vs IReadOnlyList:** When method inputs are intended to
  be immutable, prefer the most restrictive collection type possible (e.g.,
  IEnumerable, IReadOnlyList); for return values, prefer IList when transferring
  ownership of a mutable collection, and otherwise prefer the most restrictive
  option.
- **Array vs List:** Prefer `List<>` for public variables, properties, and
  return types. Use arrays when size is fixed and known at construction time, or
  for multidimensional arrays.
- **Extension Methods:** Only use when the source is unavailable or changing it
  is infeasible. Only for core, general features. Be aware they obfuscate code.
- **LINQ:** Use LINQ for readability, but be mindful of performance in hot
  paths.

## 6. File Organization

- **One Class Per File:** Typically one class, interface, enum, or struct per
  file.
- **File Name:** Prefer the file name to match the name of the primary type it
  contains.
- **Folders and File Locations:**
  - Be consistent within the project.
  - Prefer a flat folder structure where possible.
  - Don’t force file/folder layout to match namespaces.
- **Namespaces:**
  - In general, namespaces should be no more than 2 levels deep.
  - For shared library/module code, use namespaces.
  - For leaf application code, namespaces are not necessary.
  - New top-level namespace names must be globally unique and recognizable.

## 7. Parameters and Returns

- **out Parameters:** Permitted for output-only values; place `out` parameters
  after all other parameters. Prefer tuples or return types when they improve
  clarity.
- **Argument Clarity:** When argument meaning is nonobvious, use named
  constants, replace `bool` with `enum`, use named arguments, or create a
  configuration class/struct.

  ```csharp
  // Bad
  DecimalNumber product = CalculateProduct(values, 7, false, null);

  // Good
  var options = new ProductOptions { PrecisionDecimals = 7, UseCache = CacheUsage.DontUseCache };
  DecimalNumber product = CalculateProduct(values, options, completionDelegate: null);
  ```

**BE CONSISTENT.** When editing code, follow the existing style in the codebase.

_Source:
[Google C# Style Guide](https://google.github.io/styleguide/csharp-style.html)_
