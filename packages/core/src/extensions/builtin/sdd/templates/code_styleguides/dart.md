# Dart Code Style Guide

This guide summarizes key recommendations from the official Effective Dart
documentation, covering style, documentation, language usage, and API design
principles. Adhering to these guidelines promotes consistent, readable, and
maintainable Dart code.

## 1. Style

### 1.1. Identifiers

- **DO** name types, extensions, and enum types using `UpperCamelCase`.
- **DO** name packages, directories, and source files using
  `lowercase_with_underscores`.
- **DO** name import prefixes using `lowercase_with_underscores`.
- **DO** name other identifiers (class members, top-level definitions,
  variables, parameters) using `lowerCamelCase`.
- **PREFER** using `lowerCamelCase` for constant names.
- **DO** capitalize acronyms and abbreviations longer than two letters like
  words (e.g., `Http`, `Nasa`, `Uri`). Two-letter acronyms (e.g., `ID`, `TV`,
  `UI`) should remain capitalized.
- **PREFER** using wildcards (`_`) for unused callback parameters in anonymous
  and local functions.
- **DON'T** use a leading underscore for identifiers that aren't private.
- **DON'T** use prefix letters (e.g., `kDefaultTimeout`).
- **DON'T** explicitly name libraries using the `library` directive.

### 1.2. Ordering

- **DO** place `dart:` imports before other imports.
- **DO** place `package:` imports before relative imports.
- **DO** specify exports in a separate section after all imports.
- **DO** sort sections alphabetically.

### 1.3. Formatting

- **DO** format your code using `dart format`.
- **CONSIDER** changing your code to make it more formatter-friendly (e.g.,
  shortening long identifiers, simplifying nested expressions).
- **PREFER** lines 80 characters or fewer.
- **DO** use curly braces for all flow control statements (`if`, `for`, `while`,
  `do`, `try`, `catch`, `finally`).

## 2. Documentation

### 2.1. Comments

- **DO** format comments like sentences (capitalize the first word, end with a
  period).
- **DON'T** use block comments (`/* ... */`) for documentation; use `//` for
  regular comments.

### 2.2. Doc Comments

- **DO** use `///` doc comments to document members and types.
- **PREFER** writing doc comments for public APIs.
- **CONSIDER** writing a library-level doc comment.
- **CONSIDER** writing doc comments for private APIs.
- **DO** start doc comments with a single-sentence summary.
- **DO** separate the first sentence of a doc comment into its own paragraph.
- **AVOID** redundancy with the surrounding context (e.g., don't repeat the
  class name in its doc comment).
- **PREFER** starting comments of a function or method with third-person verbs
  if its main purpose is a side effect (e.g., "Connects to...").
- **PREFER** starting a non-boolean variable or property comment with a noun
  phrase (e.g., "The current day...").
- **PREFER** starting a boolean variable or property comment with "Whether"
  followed by a noun or gerund phrase (e.g., "Whether the modal is...").
- **PREFER** a noun phrase or non-imperative verb phrase for a function or
  method if returning a value is its primary purpose.
- **DON'T** write documentation for both the getter and setter of a property.
- **PREFER** starting library or type comments with noun phrases.
- **CONSIDER** including code samples in doc comments using triple backticks.
- **DO** use square brackets (`[]`) in doc comments to refer to in-scope
  identifiers (e.g., `[StateError]`, `[anotherMethod()]`, `[Duration.inDays]`,
  `[Point.new]`).
- **DO** use prose to explain parameters, return values, and exceptions.
- **DO** put doc comments before metadata annotations.

### 2.3. Markdown

- **AVOID** using markdown excessively.
- **AVOID** using HTML for formatting.
- **PREFER** backtick fences (```) for code blocks.

### 2.4. Writing

- **PREFER** brevity.
- **AVOID** abbreviations and acronyms unless they are obvious.
- **PREFER** using "this" instead of "the" to refer to a member's instance.

## 3. Usage

### 3.1. Libraries

- **DO** use strings in `part of` directives.
- **DON'T** import libraries that are inside the `src` directory of another
  package.
- **DON'T** allow an import path to reach into or out of `lib`.
- **PREFER** relative import paths when not crossing the `lib` boundary.

### 3.2. Null Safety

- **DON'T** explicitly initialize variables to `null`.
- **DON'T** use an explicit default value of `null`.
- **DON'T** use `true` or `false` in equality operations (e.g.,
  `if (nonNullableBool == true)`).
- **AVOID** `late` variables if you need to check whether they are initialized;
  prefer nullable types.
- **CONSIDER** type promotion or null-check patterns for using nullable types.

### 3.3. Strings

- **DO** use adjacent strings to concatenate string literals.
- **PREFER** using interpolation (`$variable`, `${expression}`) to compose
  strings and values.
- **AVOID** using curly braces in interpolation when not needed (e.g., `'$name'`
  instead of `'${name}'`).

### 3.4. Collections

- **DO** use collection literals (`[]`, `{}`, `<type>{}`) when possible.
- **DON'T** use `.length` to check if a collection is empty; use `.isEmpty` or
  `.isNotEmpty`.
- **AVOID** using `Iterable.forEach()` with a function literal; prefer `for-in`
  loops.
- **DON'T** use `List.from()` unless you intend to change the type of the
  result; prefer `.toList()`.
- **DO** use `whereType()` to filter a collection by type.
- **AVOID** using `cast()` when a nearby operation (like `List<T>.from()` or
  `map<T>()`) will do.

### 3.5. Functions

- **DO** use a function declaration to bind a function to a name.
- **DON'T** create a lambda when a tear-off will do (e.g., `list.forEach(print)`
  instead of `list.forEach((e) => print(e))`).

### 3.6. Variables

- **DO** follow a consistent rule for `var` and `final` on local variables
  (either `final` for non-reassigned and `var` for reassigned, or `var` for all
  locals).
- **AVOID** storing what you can calculate (e.g., don't store `area` if you have
  `radius`).

### 3.7. Members

- **DON'T** wrap a field in a getter and setter unnecessarily.
- **PREFER** using a `final` field to make a read-only property.
- **CONSIDER** using `=>` for simple members (getters, setters,
  single-expression methods).
- **DON'T** use `this.` except to redirect to a named constructor or to avoid
  shadowing.
- **DO** initialize fields at their declaration when possible.

### 3.8. Constructors

- **DO** use initializing formals (`this.field`) when possible.
- **DON'T** use `late` when a constructor initializer list will do.
- **DO** use `;` instead of `{}` for empty constructor bodies.
- **DON'T** use `new`.
- **DON'T** use `const` redundantly in constant contexts.

### 3.9. Error Handling

- **AVOID** `catch` clauses without `on` clauses.
- **DON'T** discard errors from `catch` clauses without `on` clauses.
- **DO** throw objects that implement `Error` only for programmatic errors.
- **DON'T** explicitly catch `Error` or types that implement it.
- **DO** use `rethrow` to rethrow a caught exception to preserve the original
  stack trace.

### 3.10. Asynchrony

- **PREFER** `async`/`await` over using raw `Future`s.
- **DON'T** use `async` when it has no useful effect.
- **CONSIDER** using higher-order methods to transform a stream.
- **AVOID** using `Completer` directly.

## 4. API Design

### 4.1. Names

- **DO** use terms consistently.
- **AVOID** abbreviations unless more common than the unabbreviated term.
- **PREFER** putting the most descriptive noun last (e.g., `pageCount`).
- **CONSIDER** making the code read like a sentence when using the API.
- **PREFER** a noun phrase for a non-boolean property or variable.
- **PREFER** a non-imperative verb phrase for a boolean property or variable
  (e.g., `isEnabled`, `canClose`).
- **CONSIDER** omitting the verb for a named boolean parameter (e.g.,
  `growable: true`).
- **PREFER** the "positive" name for a boolean property or variable (e.g.,
  `isConnected` over `isDisconnected`).
- **PREFER** an imperative verb phrase for a function or method whose main
  purpose is a side effect (e.g., `list.add()`, `window.refresh()`).
- **PREFER** a noun phrase or non-imperative verb phrase for a function or
  method if returning a value is its primary purpose (e.g.,
  `list.elementAt(3)`).
- **CONSIDER** an imperative verb phrase for a function or method if you want to
  draw attention to the work it performs (e.g., `database.downloadData()`).
- **AVOID** starting a method name with `get`.
- **PREFER** naming a method `to___()` if it copies the object's state to a new
  object (e.g., `toList()`).
- **PREFER** naming a method `as___()` if it returns a different representation
  backed by the original object (e.g., `asMap()`).
- **AVOID** describing the parameters in the function's or method's name.
- **DO** follow existing mnemonic conventions when naming type parameters (e.g.,
  `E` for elements, `K`, `V` for map keys/values, `T`, `S`, `U` for general
  types).

### 4.2. Libraries

- **PREFER** making declarations private (`_`).
- **CONSIDER** declaring multiple classes in the same library if they logically
  belong together.

### 4.3. Classes and Mixins

- **AVOID** defining a one-member abstract class when a simple function
  (`typedef`) will do.
- **AVOID** defining a class that contains only static members; prefer top-level
  functions/variables or a library.
- **AVOID** extending a class that isn't intended to be subclassed.
- **DO** use class modifiers (e.g., `final`, `interface`, `sealed`) to control
  if your class can be extended.
- **AVOID** implementing a class that isn't intended to be an interface.
- **DO** use class modifiers to control if your class can be an interface.
- **PREFER** defining a pure mixin or pure class to a `mixin class`.

### 4.4. Constructors

- **CONSIDER** making your constructor `const` if the class supports it (all
  fields are `final` and initialized in the constructor).

### 4.5. Members

- **PREFER** making fields and top-level variables `final`.
- **DO** use getters for operations that conceptually access properties (no
  arguments, returns a result, no user-visible side effects, idempotent).
- **DO** use setters for operations that conceptually change properties (single
  argument, no result, changes state, idempotent).
- **DON'T** define a setter without a corresponding getter.
- **AVOID** using runtime type tests to fake overloading.
- **AVOID** public `late final` fields without initializers.
- **AVOID** returning nullable `Future`, `Stream`, and collection types; prefer
  empty containers or non-nullable futures of nullable types.
- **AVOID** returning `this` from methods just to enable a fluent interface;
  prefer method cascades.

### 4.6. Types

- **DO** type annotate variables without initializers.
- **DO** type annotate fields and top-level variables if the type isn't obvious.
- **DON'T** redundantly type annotate initialized local variables.
- **DO** annotate return types on function declarations.
- **DO** annotate parameter types on function declarations.
- **DON'T** annotate inferred parameter types on function expressions.
- **DON'T** type annotate initializing formals.
- **DO** write type arguments on generic invocations that aren't inferred.
- **DON'T** write type arguments on generic invocations that are inferred.
- **AVOID** writing incomplete generic types.
- **DO** annotate with `dynamic` instead of letting inference fail silently.
- **PREFER** signatures in function type annotations.
- **DON'T** specify a return type for a setter.
- **DON'T** use the legacy `typedef` syntax.
- **PREFER** inline function types over `typedef`s.
- **PREFER** using function type syntax for parameters.
- **AVOID** using `dynamic` unless you want to disable static checking.
- **DO** use `Future<void>` as the return type of asynchronous members that do
  not produce values.
- **AVOID** using `FutureOr<T>` as a return type.

### 4.7. Parameters

- **AVOID** positional boolean parameters.
- **AVOID** optional positional parameters if the user may want to omit earlier
  parameters.
- **AVOID** mandatory parameters that accept a special "no argument" value.
- **DO** use inclusive start and exclusive end parameters to accept a range.

### 4.8. Equality

- **DO** override `hashCode` if you override `==`.
- **DO** make your `==` operator obey the mathematical rules of equality
  (reflexive, symmetric, transitive, consistent).
- **AVOID** defining custom equality for mutable classes.
- **DON'T** make the parameter to `==` nullable.

_Sources:_

- [Effective Dart: Style](https://dart.dev/effective-dart/style)
- [Effective Dart: Documentation](https://dart.dev/effective-dart/documentation)
- [Effective Dart: Usage](https://dart.dev/effective-dart/usage)
- [Effective Dart: Design](https://dart.dev/effective-dart/design)
