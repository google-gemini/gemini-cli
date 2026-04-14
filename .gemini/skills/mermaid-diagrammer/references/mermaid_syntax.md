# Mermaid Syntax & Best Practices

Use this reference as a template and guide for generating high-quality, robust Mermaid diagrams.

## Core Rules for AI Generation
- **Syntax Robustness:** Always wrap labels in double quotes if they contain special characters (parentheses, brackets, etc.) to prevent renderer crashes.
  - *Correct:* `A["User (Admin)"]`
  - *Incorrect:* `A[User (Admin)]`
- **Reserved Words:** Avoid using reserved words (e.g., `end`, `graph`, `subgraph`) as node IDs.
- **Accessibility:** Always include `accTitle` and `accDescr` for screen readers.

## Diagram Selection Guide
| Use Case | Recommended Type | Layout |
| :--- | :--- | :--- |
| **Logic/Algorithms** | `flowchart` | `TD` (Top-Down) |
| **Data Pipelines/Process** | `flowchart` | `LR` (Left-Right) |
| **API/Interactions** | `sequenceDiagram` | N/A |
| **Database Schema** | `erDiagram` | N/A |
| **State Machines** | `stateDiagram-v2` | N/A |

## Flowchart (Best Practices)
Use `classDef` for consistent styling instead of inline styles.

```mermaid
graph TD
    accTitle: System Logic
    accDescr: High-level logic for the authentication service.
    
    classDef primary fill:#f9f,stroke:#333,stroke-width:2px;
    classDef database fill:#f96,stroke:#333,stroke-width:2px;

    Start --> Auth{{"Authorized?"}}
    Auth -- Yes --> Process[Process Request]:::primary
    Auth -- No --> DB[(Log Error)]:::database
```

## Sequence Diagram
Use `participant` aliases for cleaner code.

```mermaid
sequenceDiagram
    accTitle: API Authentication
    participant U as User
    participant A as Auth Service
    U->>A: Request Token
    A-->>U: JWT Token
```

## Styling and Theming
Prefer logical grouping using `subgraph` to manage complexity.

```mermaid
graph LR
    subgraph Client
        A[Mobile]
        B[Web]
    end
    subgraph Server
        C[API]
    end
    Client --> Server
```
