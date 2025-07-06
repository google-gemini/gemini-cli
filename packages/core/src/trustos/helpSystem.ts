/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Offline help and documentation system
 * Trust: An Open System for Modern Assurance
 */

export interface HelpTopic {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  examples?: string[];
  seeAlso?: string[];
}

export interface HelpCategory {
  id: string;
  name: string;
  description: string;
  topics: string[];
}

/**
 * Comprehensive offline help system
 */
export class TrustHelpSystem {
  private topics: Map<string, HelpTopic> = new Map();
  private categories: Map<string, HelpCategory> = new Map();

  constructor() {
    this.initializeDocumentation();
  }

  /**
   * Get help topic by ID
   */
  getTopic(topicId: string): HelpTopic | null {
    return this.topics.get(topicId) || null;
  }

  /**
   * Get all topics in a category
   */
  getCategory(categoryId: string): HelpTopic[] {
    const category = this.categories.get(categoryId);
    if (!category) return [];
    
    return category.topics
      .map(topicId => this.topics.get(topicId))
      .filter(Boolean) as HelpTopic[];
  }

  /**
   * Search help topics
   */
  search(query: string): HelpTopic[] {
    const queryLower = query.toLowerCase();
    const results: { topic: HelpTopic; score: number }[] = [];

    for (const topic of this.topics.values()) {
      let score = 0;
      
      // Title match (highest priority)
      if (topic.title.toLowerCase().includes(queryLower)) {
        score += 10;
      }
      
      // Tag match
      for (const tag of topic.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          score += 5;
        }
      }
      
      // Content match
      if (topic.content.toLowerCase().includes(queryLower)) {
        score += 1;
      }
      
      // Description match
      if (topic.description.toLowerCase().includes(queryLower)) {
        score += 3;
      }
      
      if (score > 0) {
        results.push({ topic, score });
      }
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .map(result => result.topic);
  }

  /**
   * Get all categories
   */
  getCategories(): HelpCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * Get related topics
   */
  getRelatedTopics(topicId: string): HelpTopic[] {
    const topic = this.topics.get(topicId);
    if (!topic || !topic.seeAlso) return [];
    
    return topic.seeAlso
      .map(id => this.topics.get(id))
      .filter(Boolean) as HelpTopic[];
  }

  /**
   * Format topic for display
   */
  formatTopic(topic: HelpTopic): string {
    let output = `# ${topic.title}\\n\\n`;
    output += `${topic.description}\\n\\n`;
    output += `${topic.content}\\n\\n`;
    
    if (topic.examples && topic.examples.length > 0) {
      output += `## Examples\\n\\n`;
      for (const example of topic.examples) {
        output += `\`\`\`bash\\n${example}\\n\`\`\`\\n\\n`;
      }
    }
    
    if (topic.seeAlso && topic.seeAlso.length > 0) {
      output += `## See Also\\n\\n`;
      for (const relatedId of topic.seeAlso) {
        const related = this.topics.get(relatedId);
        if (related) {
          output += `- ${related.title}\\n`;
        }
      }
      output += '\\n';
    }
    
    return output;
  }

  private initializeDocumentation(): void {
    // Initialize categories
    this.categories.set('getting-started', {
      id: 'getting-started',
      name: 'Getting Started',
      description: 'Basic concepts and first steps with Trust CLI',
      topics: ['installation', 'quick-start', 'first-model'],
    });

    this.categories.set('models', {
      id: 'models',
      name: 'Model Management',
      description: 'Managing AI models and configurations',
      topics: ['model-list', 'model-download', 'model-switch', 'model-verify', 'model-recommend'],
    });

    this.categories.set('performance', {
      id: 'performance',
      name: 'Performance',
      description: 'Monitoring and optimizing performance',
      topics: ['perf-status', 'perf-monitor', 'perf-optimize', 'hardware-detection'],
    });

    this.categories.set('privacy', {
      id: 'privacy',
      name: 'Privacy & Security',
      description: 'Privacy modes and security features',
      topics: ['privacy-modes', 'privacy-strict', 'privacy-moderate', 'privacy-open'],
    });

    this.categories.set('advanced', {
      id: 'advanced',
      name: 'Advanced Features',
      description: 'Advanced usage and configuration',
      topics: ['streaming', 'context-management', 'git-integration', 'benchmarking'],
    });

    // Initialize help topics
    this.initializeGettingStartedTopics();
    this.initializeModelTopics();
    this.initializePerformanceTopics();
    this.initializePrivacyTopics();
    this.initializeAdvancedTopics();
  }

  private initializeGettingStartedTopics(): void {
    this.topics.set('installation', {
      id: 'installation',
      title: 'Installation',
      description: 'How to install Trust CLI',
      content: `Trust CLI requires Node.js 18+ and can be installed from source.

## System Requirements
- Node.js 18 or higher
- 4GB+ RAM (8GB+ recommended)
- 10GB+ free disk space for models

## Installation Steps
1. Clone the repository
2. Install dependencies
3. Build the project
4. Run Trust CLI`,
      tags: ['install', 'setup', 'requirements'],
      examples: [
        'git clone https://github.com/audit-brands/trust-cli.git',
        'cd trust-cli',
        'npm install',
        'npm run build',
        'npm run bundle',
        'node bundle/trust.js'
      ],
      seeAlso: ['quick-start', 'first-model'],
    });

    this.topics.set('quick-start', {
      id: 'quick-start',
      title: 'Quick Start Guide',
      description: 'Get up and running quickly with Trust CLI',
      content: `This guide will help you get started with Trust CLI in minutes.

## First Steps
1. Check available models
2. Download a lightweight model
3. Switch to the downloaded model
4. Start a conversation

Trust CLI operates completely offline and protects your privacy.`,
      tags: ['quickstart', 'getting-started', 'tutorial'],
      examples: [
        'trust model list',
        'trust model download qwen2.5-1.5b-instruct',
        'trust model switch qwen2.5-1.5b-instruct',
        'trust'
      ],
      seeAlso: ['installation', 'first-model', 'model-download'],
    });

    this.topics.set('first-model', {
      id: 'first-model',
      title: 'Your First Model',
      description: 'Download and configure your first AI model',
      content: `Trust CLI comes with several pre-configured models optimized for different use cases.

## Recommended First Model
We recommend starting with qwen2.5-1.5b-instruct:
- Small size (2GB RAM)
- Good performance
- Suitable for most tasks
- Fast download

## Model Selection
Choose based on your available RAM:
- 4GB RAM: qwen2.5-1.5b-instruct
- 8GB+ RAM: phi-3.5-mini-instruct
- 16GB+ RAM: llama-3.1-8b-instruct`,
      tags: ['model', 'first-time', 'download', 'recommendation'],
      examples: [
        'trust model recommend quick',
        'trust model download qwen2.5-1.5b-instruct',
        'trust model verify qwen2.5-1.5b-instruct',
        'trust model switch qwen2.5-1.5b-instruct'
      ],
      seeAlso: ['model-download', 'model-recommend', 'quick-start'],
    });
  }

  private initializeModelTopics(): void {
    this.topics.set('model-list', {
      id: 'model-list',
      title: 'List Models',
      description: 'View all available models and their status',
      content: `The model list command shows all available models with their current status, system requirements, and trust scores.

## Understanding the Display
- → indicates the currently active model
- ✓/✗ shows download and verification status
- Trust scores range from 1-10 (community ratings)
- RAM requirements help you choose suitable models

## Model Status Indicators
- Downloaded: Model file is present
- Verified: SHA256 hash confirmed
- Current: Currently loaded for inference`,
      tags: ['model', 'list', 'status', 'available'],
      examples: [
        'trust model list',
        'trust model list --verbose'
      ],
      seeAlso: ['model-download', 'model-switch', 'model-verify'],
    });

    this.topics.set('model-download', {
      id: 'model-download',
      title: 'Download Models',
      description: 'Download AI models from Hugging Face',
      content: `Trust CLI downloads models directly from Hugging Face with built-in integrity verification.

## Download Process
1. Model metadata is retrieved
2. File is downloaded with progress tracking
3. SHA256 hash is computed and verified
4. Model is registered in local catalog

## Download Features
- Real-time progress with speed and ETA
- Automatic resume for interrupted downloads
- Integrity verification
- Bandwidth-efficient downloads`,
      tags: ['model', 'download', 'huggingface', 'progress'],
      examples: [
        'trust model download qwen2.5-1.5b-instruct',
        'trust model download phi-3.5-mini-instruct'
      ],
      seeAlso: ['model-list', 'model-verify', 'model-switch'],
    });

    this.topics.set('model-switch', {
      id: 'model-switch',
      title: 'Switch Models',
      description: 'Change the active model for inference',
      content: `Switch between different models based on your current task requirements.

## When to Switch Models
- Use lightweight models for quick questions
- Use coding-optimized models for programming tasks
- Use larger models for complex reasoning
- Switch based on available system resources

## Switching Process
The system will:
1. Unload the current model
2. Load the new model
3. Update configuration
4. Verify model is ready`,
      tags: ['model', 'switch', 'active', 'change'],
      examples: [
        'trust model switch qwen2.5-1.5b-instruct',
        'trust model switch phi-3.5-mini-instruct'
      ],
      seeAlso: ['model-list', 'model-recommend', 'model-verify'],
    });

    this.topics.set('model-verify', {
      id: 'model-verify',
      title: 'Verify Models',
      description: 'Check model integrity and authenticity',
      content: `Model verification ensures your downloaded models are authentic and uncorrupted.

## Verification Process
1. SHA256 hash computation
2. Comparison with known good hashes
3. File size validation
4. Basic format checks

## Why Verify?
- Ensures model integrity
- Detects corruption
- Confirms authenticity
- Required for strict privacy mode

## Verification Results
- Valid: Model passed all checks
- Invalid: Model failed verification
- Missing: Model file not found`,
      tags: ['model', 'verify', 'integrity', 'security', 'hash'],
      examples: [
        'trust model verify qwen2.5-1.5b-instruct',
        'trust model verify',
        'trust model verify --all'
      ],
      seeAlso: ['model-download', 'privacy-strict', 'model-list'],
    });

    this.topics.set('model-recommend', {
      id: 'model-recommend',
      title: 'Model Recommendations',
      description: 'Get intelligent model suggestions',
      content: `Trust CLI provides intelligent model recommendations based on your task and system resources.

## Task Types
- coding: Optimized for programming tasks
- quick: Fast models for simple queries
- complex: High-quality models for detailed work
- default: Balanced general-purpose models

## Recommendation Factors
- Available system RAM
- CPU capabilities
- Task requirements
- Model trust scores
- Download status

## Hardware Analysis
The system automatically detects:
- Total and available RAM
- CPU core count
- Current system load
- Optimal quantization settings`,
      tags: ['model', 'recommend', 'suggestion', 'task', 'hardware'],
      examples: [
        'trust model recommend coding',
        'trust model recommend quick',
        'trust model recommend complex --ram-limit 8'
      ],
      seeAlso: ['model-list', 'model-switch', 'hardware-detection'],
    });
  }

  private initializePerformanceTopics(): void {
    this.topics.set('perf-status', {
      id: 'perf-status',
      title: 'Performance Status',
      description: 'View current system performance metrics',
      content: `Get a quick overview of your system's current performance status.

## Status Information
- CPU and memory usage
- Active model information
- Inference statistics
- System health indicators

## Health Indicators
- Green: Optimal performance
- Yellow: Moderate usage
- Red: High resource usage

## When to Check Status
- Before starting intensive tasks
- When experiencing slow performance
- To monitor resource usage
- For system health checks`,
      tags: ['performance', 'status', 'metrics', 'system'],
      examples: [
        'trust perf status',
        'trust perf status --verbose'
      ],
      seeAlso: ['perf-monitor', 'perf-optimize', 'hardware-detection'],
    });

    this.topics.set('perf-monitor', {
      id: 'perf-monitor',
      title: 'Performance Monitoring',
      description: 'Real-time performance monitoring',
      content: `Monitor system performance in real-time with live updates.

## Monitoring Features
- Real-time CPU and memory usage
- Inference speed tracking
- Token generation rates
- Model performance metrics
- System load averages

## Interactive Monitoring
- Live updates every second
- Color-coded status indicators
- Historical performance trends
- Resource usage warnings

## Use Cases
- Monitoring during long inference tasks
- Debugging performance issues
- Optimizing system settings
- Capacity planning`,
      tags: ['performance', 'monitor', 'real-time', 'live'],
      examples: [
        'trust perf watch',
        'trust perf report'
      ],
      seeAlso: ['perf-status', 'perf-optimize', 'benchmarking'],
    });

    this.topics.set('perf-optimize', {
      id: 'perf-optimize',
      title: 'Performance Optimization',
      description: 'Get personalized optimization recommendations',
      content: `Receive intelligent recommendations to optimize your system for better AI performance.

## Optimization Areas
- Model selection for your hardware
- Quantization settings
- Context size optimization
- Memory allocation
- CPU utilization

## Recommendation Types
- Hardware-specific settings
- Model configuration tuning
- System resource optimization
- Performance bottleneck identification

## Implementation
Trust CLI automatically:
- Analyzes your hardware
- Identifies optimization opportunities
- Provides specific recommendations
- Explains the reasoning behind suggestions`,
      tags: ['performance', 'optimize', 'recommendations', 'tuning'],
      examples: [
        'trust perf optimize',
        'trust perf optimize --detailed'
      ],
      seeAlso: ['perf-status', 'hardware-detection', 'model-recommend'],
    });

    this.topics.set('hardware-detection', {
      id: 'hardware-detection',
      title: 'Hardware Detection',
      description: 'Automatic hardware capability detection',
      content: `Trust CLI automatically detects your hardware capabilities to provide optimal performance.

## Detection Capabilities
- CPU core count and architecture
- Total and available RAM
- System load and resource usage
- Platform-specific optimizations

## Optimization Benefits
- Automatic quantization selection
- Optimal context size settings
- Model recommendations
- Resource allocation

## Supported Platforms
- Linux (Intel/AMD/ARM)
- macOS (Intel/Apple Silicon)
- Windows (Intel/AMD)

## Detection Accuracy
The system provides:
- Real-time resource monitoring
- Dynamic optimization
- Platform-aware settings
- Performance predictions`,
      tags: ['hardware', 'detection', 'optimization', 'automatic'],
      examples: [
        'trust perf status',
        'trust model recommend default',
        'trust perf optimize'
      ],
      seeAlso: ['perf-optimize', 'model-recommend', 'perf-status'],
    });
  }

  private initializePrivacyTopics(): void {
    this.topics.set('privacy-modes', {
      id: 'privacy-modes',
      title: 'Privacy Modes Overview',
      description: 'Understanding Trust CLI privacy modes',
      content: `Trust CLI offers three privacy modes to balance security and functionality.

## Available Modes
1. **Strict**: Maximum privacy and security
2. **Moderate**: Balanced privacy and functionality  
3. **Open**: Full functionality for development

## Mode Selection
Choose based on your requirements:
- Production use: Strict or Moderate
- Development: Moderate or Open
- Testing: Open
- High-security environments: Strict

## Mode Features
Each mode has different capabilities:
- Network access restrictions
- Logging and auditing settings
- Model verification requirements
- Feature availability`,
      tags: ['privacy', 'modes', 'security', 'overview'],
      examples: [
        'trust privacy list',
        'trust privacy status',
        'trust privacy info strict'
      ],
      seeAlso: ['privacy-strict', 'privacy-moderate', 'privacy-open'],
    });

    this.topics.set('privacy-strict', {
      id: 'privacy-strict',
      title: 'Strict Privacy Mode',
      description: 'Maximum privacy and security configuration',
      content: `Strict mode provides the highest level of privacy and security.

## Strict Mode Features
- No external network connections
- Mandatory model verification
- No prompt/response logging
- Enhanced audit logging
- Offline-only operation

## Restrictions
- Model downloads disabled
- Streaming responses disabled
- Only verified models allowed
- Limited debugging information

## Use Cases
- High-security environments
- Sensitive data processing
- Production deployments
- Compliance requirements

## Switching to Strict Mode
When switching to strict mode:
- Download models first in moderate/open mode
- Verify all models are working
- Review audit logs
- Confirm all required models are available`,
      tags: ['privacy', 'strict', 'security', 'offline'],
      examples: [
        'trust privacy switch strict',
        'trust privacy info strict'
      ],
      seeAlso: ['privacy-modes', 'privacy-moderate', 'model-verify'],
    });

    this.topics.set('privacy-moderate', {
      id: 'privacy-moderate',
      title: 'Moderate Privacy Mode',
      description: 'Balanced privacy and functionality',
      content: `Moderate mode balances privacy protection with practical functionality.

## Moderate Mode Features
- Model downloads from trusted sources
- Mandatory model verification
- Optional logging with user control
- Real-time streaming responses
- Performance optimization enabled

## Network Access
- Limited to model downloads
- Hugging Face model repository access
- No telemetry or tracking
- User-controlled connections

## Logging Options
- Optional prompt/response logging
- Transparent audit trails
- User-configurable settings
- Privacy-preserving analytics

## Recommended For
- Most production use cases
- Development with privacy focus
- Team environments
- General purpose usage`,
      tags: ['privacy', 'moderate', 'balanced', 'recommended'],
      examples: [
        'trust privacy switch moderate',
        'trust privacy status'
      ],
      seeAlso: ['privacy-modes', 'privacy-strict', 'privacy-open'],
    });

    this.topics.set('privacy-open', {
      id: 'privacy-open',
      title: 'Open Privacy Mode',
      description: 'Maximum functionality for development',
      content: `Open mode provides maximum functionality for development and testing.

## Open Mode Features
- Full development capabilities
- Extended context windows
- Comprehensive debugging logs
- Flexible model management
- Performance testing tools

## Development Benefits
- Optional model verification
- Extended logging for debugging
- Higher resource limits
- Flexible configurations

## Security Considerations
- Reduced privacy protections
- More permissive settings
- Enhanced logging capabilities
- Development-focused features

## Best Practices
- Use only in development environments
- Avoid processing sensitive data
- Switch to strict/moderate for production
- Regular security reviews`,
      tags: ['privacy', 'open', 'development', 'testing'],
      examples: [
        'trust privacy switch open',
        'trust privacy info open'
      ],
      seeAlso: ['privacy-modes', 'privacy-moderate', 'privacy-strict'],
    });
  }

  private initializeAdvancedTopics(): void {
    this.topics.set('streaming', {
      id: 'streaming',
      title: 'Streaming Responses',
      description: 'Real-time streaming inference',
      content: `Trust CLI supports real-time streaming responses for immediate feedback.

## Streaming Benefits
- Immediate response start
- Real-time token generation
- Interactive conversations
- Responsive user experience

## How Streaming Works
1. Request is processed immediately
2. Tokens are generated incrementally
3. Responses stream in real-time
4. Complete response is assembled

## Performance Considerations
- Requires adequate system resources
- May impact concurrent operations
- Best with sufficient RAM
- Optimize for your hardware

## Configuration
Streaming can be:
- Enabled/disabled per privacy mode
- Configured globally
- Controlled per conversation
- Optimized for your system`,
      tags: ['streaming', 'real-time', 'responses', 'performance'],
      examples: [
        'trust --stream',
        'trust privacy switch moderate'
      ],
      seeAlso: ['privacy-modes', 'perf-optimize', 'context-management'],
    });

    this.topics.set('context-management', {
      id: 'context-management',
      title: 'Context Management',
      description: 'Managing large codebases and long conversations',
      content: `Trust CLI intelligently manages context for large codebases and extended conversations.

## Context Challenges
- Model context size limitations
- Large codebase analysis
- Long conversation histories
- Memory efficiency

## Smart Context Management
- Automatic context summarization
- Intelligent chunk selection
- Relevance-based prioritization
- Efficient memory usage

## Codebase Analysis
- Recursive directory scanning
- File type recognition
- Importance scoring
- Context optimization

## Features
- Long context handling
- Intelligent summarization
- Context window optimization
- Memory-efficient processing`,
      tags: ['context', 'management', 'codebase', 'memory'],
      examples: [
        'trust analyze ./src',
        'trust --context-size 8192'
      ],
      seeAlso: ['git-integration', 'streaming', 'perf-optimize'],
    });

    this.topics.set('git-integration', {
      id: 'git-integration',
      title: 'Git Integration',
      description: 'Git workflow automation and code review',
      content: `Trust CLI integrates with Git for automated workflow assistance.

## Git Features
- Repository analysis
- Change detection and review
- Commit message suggestions
- Workflow automation

## Code Review
- Automatic diff analysis
- Change complexity assessment
- Security and quality suggestions
- Best practice recommendations

## Workflow Integration
- Pre-commit hooks
- Automated code reviews
- Repository context analysis
- Change impact assessment

## Supported Operations
- Repository status analysis
- Staged change review
- Commit message generation
- Code quality assessment`,
      tags: ['git', 'integration', 'workflow', 'automation'],
      examples: [
        'trust git status',
        'trust git review',
        'trust git suggest-commit'
      ],
      seeAlso: ['context-management', 'advanced', 'streaming'],
    });

    this.topics.set('benchmarking', {
      id: 'benchmarking',
      title: 'Performance Benchmarking',
      description: 'Comprehensive performance testing and analysis',
      content: `Trust CLI includes comprehensive benchmarking tools for performance analysis.

## Benchmark Types
- Model inference speed
- Memory usage patterns
- Context processing efficiency
- System resource utilization

## Metrics Collected
- Tokens per second
- Memory consumption
- Response latency
- Resource utilization

## Benchmark Reports
- Detailed performance analysis
- Comparative model performance
- System optimization recommendations
- Historical performance trends

## Use Cases
- Model selection guidance
- System optimization
- Performance regression detection
- Capacity planning`,
      tags: ['benchmark', 'performance', 'testing', 'analysis'],
      examples: [
        'trust benchmark run',
        'trust benchmark compare',
        'trust perf report --detailed'
      ],
      seeAlso: ['perf-monitor', 'perf-optimize', 'hardware-detection'],
    });
  }
}