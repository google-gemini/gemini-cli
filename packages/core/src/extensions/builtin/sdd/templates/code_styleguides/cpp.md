# Google C++ Style Guide Summary

## 1. Naming

- **General:** Optimize for readability. Be descriptive but concise. Use
  inclusive language.
- **Files:** `.h` (headers), `.cc` (source). Lowercase with underscores (`_`) or
  dashes (`-`). Be consistent.
- **Types:** PascalCase (`MyClass`, `MyEnum`). Use `int` by default; use
  `<cstdint>` (`int32_t`) if size matters.
- **Concepts:** PascalCase (`MyConcept`).
- **Variables:** snake*case (`my_var`). Class members end with underscore
  (`my_member*`), struct members do not.
- **Constants/Enumerators:** `k` + PascalCase (`kDays`, `kOk`).
- **Template Parameters:** PascalCase for types (`T`, `MyType`),
  snake_case/kPascalCase for non-types (`N`, `kLimit`).
- **Functions:** PascalCase (`GetValue()`).
- **Accessors/Mutators:** snake_case. `count()` (not `GetCount`),
  `set_count(v)`.
- **Namespaces:** lowercase (`web_search`).
- **Macros:** ALL_CAPS (`MY_MACRO`).

## 2. Header Files

- **General:** Every `.cc` usually has a `.h`. Headers must be self-contained.
- **Guards:** Use `#define <PROJECT>_<PATH>_<FILE>_H_`.
- **IWYU:** Direct includes only. Do not rely on transitive includes.
- **Forward Decls:** Avoid. Include headers instead. **Never** forward declare
  `std::` symbols.
- **Inline Definitions:** Only short functions (<10 lines) in headers. Must be
  ODR-safe (`inline` or templates).
- **Include Order:**
  1. Related header (`foo.h`)
  2. C system (`<unistd.h>`)
  3. C++ standard (`<vector>`)
  4. Other libraries (`<Python.h>`)
  5. Project headers (`"base/logging.h"`) _Separate groups with blank lines.
     Alphabetical within groups._

## 3. Formatting

- **Indentation:** 2 spaces. **Line Length:** 80 chars.
- **Non-ASCII:** Rare, use UTF-8. Avoid `u8` prefix if possible.
- **Braces:** `if (cond) { ... }`. **Exception:** Function definition open brace
  goes on the **next line**.
- **Switch:** Always include `default`. Use `[[fallthrough]]` for explicit
  fallthrough.
- **Literals:** Floating-point must have radix point (`1.0f`).
- **Calls:** Wrap arguments at paren or 4-space indent.
- **Init Lists:** Colon on new line, indent 4 spaces.
- **Namespaces:** No indentation.
- **Vertical Whitespace:** Use sparingly. Separate related chunks, not code
  blocks.
- **Loops/Branching:** Use braces (optional if single line). No space after `(`,
  space before `{`.
- **Return:** No parens `return result;`.
- **Preprocessor:** `#` always at line start.
- **Pointers:** `char* c` (attached to type).
- **Templates:** No spaces inside `< >` (`vector<int>`).
- **Operators:** Space around assignment/binary, no space for unary.
- **Class Order:** `public`, `protected`, `private`.
- **Parameter Wrapping:** Wrap parameter lists that don't fit. Use 4-space
  indent for wrapped parameters.

## 4. Classes

- **Constructors:** `explicit` for single-arg and conversion operators.
  **Exception:** `std::initializer_list`. No virtual calls in ctors. Use
  factories for fallible init.
- **Structs:** Only for passive data. Prefer `struct` over `std::pair` or
  `std::tuple`.
- **Copy/Move:** Explicitly `= default` or `= delete`. **Rule of 5:** If
  defining one, declare all.
- **Inheritance:** `public` only. Composition > Inheritance. Use `override`
  (omit `virtual`). No multiple implementation inheritance.
- **Operator Overloading:** Judicious use only. Binary ops as non-members. Never
  overload `&&`, `||`, `,`, or unary `&`. No User-Defined Literals.
- **Access:** Data members `private` (except structs/constants).
- **Declaration Order:** `public` before `protected` before `private`. Within
  sections: Types, Constants, Factory, Constructors, Destructor, Methods, Data
  Members.

## 5. Functions

- **Params:** Inputs (`const T&`, `std::string_view`, `std::span` or value)
  first, then outputs. **Ordering:** Inputs before outputs.
- **Outputs:** Prefer return values/`std::optional`. For non-optional outputs,
  use references. For optional outputs, use pointers.
- **Optional Inputs:** Use `std::optional` for by-value, `const T*` for
  reference.
- **Nonmember vs Static:** Prefer nonmember functions in namespaces over static
  member functions.
- **Length:** Prefer small (<40 lines).
- **Overloading:** Use only when behavior is obvious. Document overload sets
  with a single umbrella comment.
- **Default Args:** Allowed on non-virtual functions only (value must be
  fixed/constant).
- **Trailing Return:** Only when necessary (lambdas).

## 6. Scoping

- **Namespaces:** No `using namespace`. Use `using std::string`. Never add to
  `namespace std`.
- **Internal:** Use anonymous namespaces or `static` in `.cc` files. Avoid in
  headers.
- **Locals:** Narrowest scope. Initialize at declaration. **Exception:** Declare
  complex objects outside loops.
- **Static/Global:** Must be **trivially destructible** (e.g., `constexpr`, raw
  pointers, arrays). No global `std::string`, `std::map`, smart pointers.
  Dynamic initialization allowed only for function-static variables.
- **Thread Local:** `thread_local` must be `constinit` if global. Prefer
  `thread_local` over other mechanisms.

## 7. Modern C++ Features

- **Version:** Target **C++20**. Do not use C++23. Consider portability for
  C++17/20 features. No non-standard extensions.
- **Modules:** Do not use C++20 Modules.
- **Coroutines:** Use approved libraries only. Do not roll your own promise or
  awaitable types.
- **Concepts:** Prefer C++20 Concepts (`requires`) over `std::enable_if`. Use
  `requires(Concept<T>)`, not `template<Concept T>`.
- **R-Value References:** Use only for move ctors/assignment, perfect
  forwarding, or consuming `*this`.
- **Smart Pointers:** `std::unique_ptr` (exclusive), `std::shared_ptr` (shared).
  No `std::auto_ptr`.
- **Auto:** Use when type is obvious (`make_unique`, iterators). Avoid for
  public APIs.
- **CTAD:** Use only if explicitly supported (deduction guides exist).
- **Structured Bindings:** Use for pairs/tuples. Comment aliased field names.
- **Nullptr:** Use `nullptr`, never `NULL` or `0`.
- **Constexpr:** Use `constexpr`/`consteval` for constants/functions whenever
  possible. Use `constinit` for static initialization.
- **Noexcept:** Specify when useful/correct. Prefer unconditional `noexcept` if
  exceptions are disabled.
- **Lambdas:** Prefer explicit captures (`[&x]`) if escaping scope. Avoid
  `std::bind`.
- **Initialization:** Prefer brace init. **Designated Initializers:** Allowed
  (C++20 ordered form only).
- **Casts:** Use C++ casts (`static_cast`). Use `std::bit_cast` for type
  punning.
- **Loops:** Prefer range-based `for`.

## 8. Best Practices

- **Const:** Mark methods/variables `const` whenever possible. `const` methods
  must be thread-safe.
- **Exceptions:** **Forbidden**.
- **RTTI:** Avoid `dynamic_cast`/`typeid`. Allowed in unit tests. Do not
  hand-implement workarounds.
- **Macros:** Avoid. Use `constexpr`/`inline`. If needed, define close to use
  and `#undef` immediately. Do not define in headers.
- **0 and nullptr:** Use `nullptr` for pointers, `\0` for chars, not `0`.
- **Streams:** Use streams primarily for logging. Prefer printf-style formatting
  or absl::StrCat.
- **Types:** Avoid `unsigned` for non-negativity. No `long double`.
- **Pre-increment:** Prefer `++i` over `i++`.
- **Sizeof:** Prefer `sizeof(varname)` over `sizeof(type)`.
- **Friends:** Allowed, usually defined in the same file.
- **Boost:** Use only approved libraries (e.g., Call Traits, Compressed Pair,
  BGL, Property Map, Iterator, etc.).
- **Aliases:** Use `using` instead of `typedef`. Public aliases must be
  documented.
- **Ownership:** Single fixed owner. Transfer via smart pointers.
- **Aliases:** Document intent. Don't use in public API for convenience.
  `using` > `typedef`.
- **Switch:** Always include `default`. Use `[[fallthrough]]` for explicit
  fallthrough.
- **Comments:** Document File, Class, Function (params/return). Use `//` or
  `/* */`. Implementation comments for tricky code. `TODO(user):` format.

**BE CONSISTENT.** Follow existing code style.

_Source:
[Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html)_
