# Dynamic Prompt System - Flow Diagrams

## Work Context Detection Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Request  │    │   CLI Package    │    │  Core Package   │
└─────────┬───────┘    └────────┬─────────┘    └─────────┬───────┘
          │                     │                        │
          │  1. Command Input   │                        │
          ├────────────────────►│                        │
          │                     │                        │
          │                     │ 2. Process Request     │
          │                     ├───────────────────────►│
          │                     │                        │
          │                     │                        │ ┌─────────────────┐
          │                     │                        │ │ Config Service  │
          │                     │                        │ └─────────┬───────┘
          │                     │                        │           │
          │                     │                        │ 3. Check  │
          │                     │                        │ Dynamic   │
          │                     │                        │ Prompt    │
          │                     │                        │ Enabled   │
          │                     │                        │ ◄─────────┤
          │                     │                        │           │
          │                     │                        │           │
          │                     │                        │ ┌─────────▼───────┐
          │                     │                        │ │ Work Context    │
          │                     │                        │ │ Detector        │
          │                     │                        │ └─────────┬───────┘
          │                     │                        │           │
          │                     │                        │ 4. Check  │
          │                     │                        │ Cache     │
          │                     │                        │ ◄─────────┤
          │                     │                        │           │
          │                     │                        │           │
          │                     │                        │ 5. Detect │
          │                     │                        │ Context   │
          │                     │                        │ (if miss) │
          │                     │                        │ ◄─────────┤
          │                     │                        │           │
          │                     │                        │           │
          │                     │                        │ ┌─────────▼───────┐
          │                     │                        │ │ File System     │
          │                     │                        │ │ Analysis        │
          │                     │                        │ └─────────┬───────┘
          │                     │                        │           │
          │                     │                        │           │
┌─────────▼───────┐    ┌────────▼─────────┐    ┌─────────▼───────┐   │
│ Project Type    │    │ Language         │    │ Framework       │   │
│ Detection       │    │ Analysis         │    │ Detection       │   │
│                 │    │                  │    │                 │   │
│ • package.json  │    │ • File extensions│    │ • Dependencies  │   │
│ • Cargo.toml    │    │ • Language %     │    │ • File patterns │   │
│ • setup.py      │    │ • File counts    │    │ • Versions      │   │
└─────────┬───────┘    └────────┬─────────┘    └─────────┬───────┘   │
          │                     │                        │           │
          │                     │                        │           │
          └─────────────────────┼────────────────────────┘           │
                                │                                    │
                                │                                    │
          ┌─────────────────────▼────────────────────────┐           │
          │         Git State Analysis                   │           │
          │                                              │           │
          │ • Repository check                           │           │
          │ • Current branch                             │           │
          │ • Dirty state                                │           │
          │ • Commit status                              │           │
          └─────────────────────┬────────────────────────┘           │
                                │                                    │
                                │                                    │
          ┌─────────────────────▼────────────────────────┐           │
          │       Tool Usage Pattern Analysis            │           │
          │                                              │           │
          │ • Recent tool calls                          │           │
          │ • Usage categories                           │           │
          │ • Workflow patterns                          │           │
          └─────────────────────┬────────────────────────┘           │
                                │                                    │
                                │ 6. Return Context Info             │
                                └───────────────────────────────────►│
                                                                     │
                                ┌─────────────────────┐              │
                                │ Prompt Generator    │              │
                                └─────────┬───────────┘              │
                                          │                          │
                                          │ 7. Generate Dynamic      │
                                          │ Sections                 │
                                          ◄──────────────────────────┤
                                          │                          │
```

## Prompt Generation with Dynamic Sections

```
┌─────────────────────────────────────────────────────────────┐
│                    Base System Prompt                      │
│                                                             │
│ • Core mandates and guidelines                              │
│ • Tool usage instructions                                   │
│ • Workflow definitions                                      │
│ • Safety and security rules                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ +
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 Work Context Adaptations                   │
│                                                             │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│ │ Project Type    │ │ Language        │ │ Framework       ││
│ │ Guidelines      │ │ Best Practices  │ │ Instructions    ││
│ │                 │ │                 │ │                 ││
│ │ • Web app focus │ │ • TypeScript    │ │ • React hooks   ││
│ │ • Library APIs  │ │ • Python PEP 8  │ │ • Django models ││
│ │ • CLI UX        │ │ • Rust safety   │ │ • Express middleware││
│ └─────────────────┘ └─────────────────┘ └─────────────────┘│
│                                                             │
│ ┌─────────────────┐ ┌─────────────────┐                   │
│ │ Git Workflow    │ │ Tool Usage      │                   │
│ │ Adaptations     │ │ Patterns        │                   │
│ │                 │ │                 │                   │
│ │ • Main branch   │ │ • File ops      │                   │
│ │ • Feature dev   │ │ • Development   │                   │
│ │ • Bugfix focus  │ │ • Search/analysis│                  │
│ └─────────────────┘ └─────────────────┘                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ +
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    User Memory                              │
│                                                             │
│ • Personal preferences                                      │
│ • Remembered facts                                          │
│ • Project-specific context                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ =
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                Final System Prompt                         │
│                                                             │
│ Sent to Gemini API for processing                           │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points Between Components

```
┌───────────────────┐
│   CLI Package     │
│                   │
│ • User interface  │
│ • Command parsing │
│ • Output display  │
└─────────┬─────────┘
          │
          │ Request
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Package                            │
│                                                             │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│ │ Content         │ │ Configuration   │ │ Tool Registry   ││
│ │ Generator       │ │ Service         │ │                 ││
│ │                 │ │                 │ │ • File tools    ││
│ │ • Prompt build  │ │ • Dynamic prompt│ │ • Shell tools   ││
│ │ • API calls     │ │ • Working dir   │ │ • Search tools  ││
│ │ • Response      │ │ • Tool history  │ │ • MCP tools     ││
│ └─────────┬───────┘ └─────────┬───────┘ └─────────────────┘│
│           │                   │                             │
│           │                   │                             │
│           │ ┌─────────────────▼─────────────────┐           │
│           │ │     Work Context Detector        │           │
│           │ │                                  │           │
│           │ │ • Project type detection         │           │
│           │ │ • Language analysis              │           │
│           │ │ • Framework detection            │           │
│           │ │ • Git state analysis             │           │
│           │ │ • Tool usage patterns            │           │
│           │ │ • Caching layer                  │           │
│           │ └─────────────────┬─────────────────┘           │
│           │                   │                             │
│           │                   │ Context Info                │
│           │ ┌─────────────────▼─────────────────┐           │
│           │ │     Prompt Generator             │           │
│           │ │                                  │           │
│           │ │ • Base prompt loading            │           │
│           │ │ • Dynamic section generation     │           │
│           │ │ • Template application           │           │
│           │ │ • Memory integration             │           │
│           │ └─────────────────┬─────────────────┘           │
│           │                   │                             │
│           │ ◄─────────────────┘ Final Prompt                │
│           │                                                 │
│           │                                                 │
│           ▼                                                 │
│ ┌─────────────────────────────────────────────────────────┐│
│ │                 Gemini API                              ││
│ │                                                         ││
│ │ • Model processing                                      ││
│ │ • Tool call requests                                    ││
│ │ • Response generation                                   ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Cache Strategy and Performance Flow

```
┌─────────────────┐
│ Session Start   │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐    ┌─────────────────┐
│ Request Context │    │ Cache Lookup    │
│ Detection       │───►│ Key: ${cwd}     │
└─────────────────┘    └─────────┬───────┘
                                 │
                            Cache Hit?
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼ Yes                     ▼ No
          ┌─────────────────┐       ┌─────────────────┐
          │ Return Cached   │       │ Perform Full    │
          │ Context         │       │ Analysis        │
          └─────────────────┘       └─────────┬───────┘
                    │                         │
                    │                         │
                    │               ┌─────────▼───────┐
                    │               │ File System     │
                    │               │ Analysis        │
                    │               │                 │
                    │               │ • Max 500 files │
                    │               │ • Max depth 10  │
                    │               │ • Respect       │
                    │               │   .gitignore    │
                    │               └─────────┬───────┘
                    │                         │
                    │               ┌─────────▼───────┐
                    │               │ Context         │
                    │               │ Generation      │
                    │               └─────────┬───────┘
                    │                         │
                    │               ┌─────────▼───────┐
                    │               │ Cache Storage   │
                    │               │ Session-scoped  │
                    │               └─────────┬───────┘
                    │                         │
                    └─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Dynamic Prompt  │
                    │ Generation      │
                    └─────────────────┘
```