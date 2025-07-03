# AI Learning Assistant Agent

An adaptive learning assistant powered by AI that dynamically adjusts content based on user understanding levels. Built on the Gemini CLI codebase, this project transforms the CLI foundation into an intelligent learning companion accessible through web and mobile interfaces.

## Vision

Accelerate learning by enabling instant access to knowledge driven by pure intellectual curiosity. Learn anything, anytime, at your own pace with personalized guidance.

## Core Concept

An adaptive learning application where generated text dynamically changes based on the user's comprehension level, creating a truly personalized learning experience.

## Learning Flow

1. **Initial Deep Dive**: The AI agent explores the topic and purpose of what the user wants to learn
2. **Assessment**: Generate various difficulty questions (multiple choice or written) and conceptual checks to gauge understanding
3. **Analysis**: Analyze user responses to create a comprehensive understanding profile (saved as user-understanding.md)
4. **Path Generation**: Create an optimized learning path tailored to the user's current knowledge level
5. **Content Generation**: Generate explanation text for the first node in the learning path
6. **Comprehension Check**: After reading, the AI generates understanding checks for that section
7. **Section Evaluation**: Evaluate and document the understanding level for each chapter
8. **Path Adaptation**: Determine if the learning path needs adjustment based on progress
9. **Progression**: Generate the next chapter's content based on updated understanding

Steps 6-9 repeat until the final node of the learning path is reached.

## Key Features

### Sticky Note System
When the AI detects knowledge gaps in prerequisite concepts (e.g., linear algebra for AI learning), it adds these topics to a stack with reasons for review, allowing seamless context switching without losing the main learning thread.

### Checkpoint System
- Checkpoints at each paragraph or section for understanding verification
- Users rate their understanding on a 5-point scale
- For ratings ≤3, the AI generates alternative explanations from different angles or abstraction levels
- Iterative process to identify and address true comprehension barriers
- Content regeneration based on identified obstacles

### Concept Hypertext
Important terms and concepts in explanation texts function as hyperlinks. Tapping switches to a separate chat where the AI provides detailed explanations of that specific concept.

### Range Selection Chat
Similar to GitHub's code review interface, users can select text line by line and request AI explanations for specific passages, enabling granular understanding of complex content.

## Technical Architecture

Built on the robust Gemini CLI foundation, this project extends the core functionality to support:
- Dynamic content generation based on user profiling
- Persistent learning state management
- Multi-modal interaction patterns (text, interactive elements)
- Adaptive learning algorithms

## Development Philosophy

While the process flow is defined, the system prioritizes AI agent autonomy. Rather than rigid adherence to predefined flows, we provide tools that enable the AI to achieve the ideal learning state through declarative prompts and flexible execution.

## Getting Started

[Installation and setup instructions will be added as development progresses]

## Contributing

[Contribution guidelines will be added]

## License

[License information will be added]