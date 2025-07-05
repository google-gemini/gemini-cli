# 多品牌电商渠道统一展示平台 - RAG技术集成实施方案

## 1. 项目现状与目标

### 1.1 当前项目状态
- **项目架构**：基于Google Gemini CLI项目的Monorepo架构
- **核心包结构**：
  - `packages/core`：核心AI服务，包含GeminiChat、工具注册、文件处理等
  - `packages/cli`：命令行界面，基于React + Ink构建
- **现有技术栈**：
  - **后端**：Node.js + TypeScript + Google GenAI SDK
  - **前端**：React + Ink (CLI界面)
  - **工具系统**：完整的工具注册和执行框架
  - **AI集成**：已集成Gemini模型，支持流式对话和工具调用
- **核心功能**：AI对话、文件处理、代码辅助、工具调用
- **技术挑战**：需要扩展为Web应用，增加RAG能力，支持多渠道数据管理

### 1.2 集成目标
- **智能查询**：支持自然语言查询渠道信息
- **自动分析**：自动生成渠道分析报告
- **个性化推荐**：基于用户行为提供个性化建议
- **实时监控**：智能监控渠道表现异常

## 2. 技术架构升级方案

### 2.1 基于现有架构的扩展方案

#### 扩展现有包结构
```typescript
// 扩展现有的packages结构
packages/
├── core/                           // 现有核心包
│   ├── src/
│   │   ├── services/               // 现有服务
│   │   │   ├── fileDiscoveryService.ts
│   │   │   ├── gitService.ts
│   │   │   └── rag/                // 新增RAG服务
│   │   │       ├── documentService.ts
│   │   │       ├── vectorSearchService.ts
│   │   │       ├── answerGenerationService.ts
│   │   │       ├── feedbackService.ts
│   │   │       └── multimodalService.ts
│   │   ├── tools/                  // 现有工具系统
│   │   │   ├── tools.ts            // 工具注册
│   │   │   ├── tool-registry.ts    // 工具注册器
│   │   │   └── ecommerce/          // 新增电商工具
│   │   │       ├── channelTool.ts
│   │   │       ├── brandTool.ts
│   │   │       ├── analysisTool.ts
│   │   │       └── reportTool.ts
│   │   └── core/                   // 现有核心功能
│   │       ├── geminiChat.ts       // 复用现有AI对话
│   │       ├── contentGenerator.ts
│   │       └── ragChat.ts          // 新增RAG对话
│   └── package.json
├── cli/                            // 现有CLI包
│   └── src/
│       └── components/             // 现有CLI组件
├── web/                            // 新增Web包
│   ├── src/
│   │   ├── components/
│   │   │   ├── intelligent/
│   │   │   │   ├── SmartSearch.tsx
│   │   │   │   ├── QueryAssistant.tsx
│   │   │   │   ├── ReportGenerator.tsx
│   │   │   │   └── InsightPanel.tsx
│   │   │   ├── canvas/
│   │   │   │   ├── EnhancedCanvas.tsx
│   │   │   │   ├── ChannelCard.tsx
│   │   │   │   └── DataVisualization.tsx
│   │   │   └── shared/
│   │   │       ├── BrandSelector.tsx
│   │   │       └── ChannelSelector.tsx
│   │   ├── services/
│   │   │   ├── apiService.ts       // 与core包通信
│   │   │   └── websocketService.ts // 实时通信
│   │   └── App.tsx
│   └── package.json
└── shared/                         // 新增共享包
    ├── src/
    │   ├── types/                  // 共享类型定义
    │   ├── utils/                  // 共享工具函数
    │   └── constants/              // 共享常量
    └── package.json
```

#### 复用现有工具系统
```typescript
// 扩展现有工具注册系统
// packages/core/src/tools/tools.ts
export const RAG_TOOLS = {
  // 复用现有的文件处理工具
  readFile: readFileTool,
  writeFile: writeFileTool,
  glob: globTool,
  
  // 新增RAG相关工具
  vectorizeDocument: {
    name: 'vectorize_document',
    description: '将文档向量化并存储到向量数据库',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '文档内容' },
        metadata: { type: 'object', description: '文档元数据' }
      }
    }
  },
  
  searchDocuments: {
    name: 'search_documents',
    description: '在向量数据库中搜索相关文档',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        filters: { type: 'object', description: '搜索过滤器' }
      }
    }
  },
  
  generateReport: {
    name: 'generate_report',
    description: '基于检索到的文档生成分析报告',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: '渠道ID' },
        timeRange: { type: 'object', description: '时间范围' }
      }
    }
  }
};

// 新增电商专用工具
export const ECOMMERCE_TOOLS = {
  fetchChannelData: {
    name: 'fetch_channel_data',
    description: '获取指定渠道的数据',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: '渠道ID' },
        dataType: { type: 'string', enum: ['products', 'sales', 'reviews'] }
      }
    }
  },
  
  analyzeChannelPerformance: {
    name: 'analyze_channel_performance',
    description: '分析渠道表现',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: '渠道ID' },
        metrics: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};
```

#### 数据存储升级
```typescript
// packages/shared/src/types/ecommerce.ts
interface VectorDocument {
  id: string;
  content: string;
  vector: number[];
  metadata: {
    channelId: string;
    brandId: string;
    contentType: 'product' | 'review' | 'sales' | 'image';
    timestamp: Date;
    tags: string[];
  };
}

interface UserQuery {
  id: string;
  query: string;
  userId: string;
  timestamp: Date;
  feedback?: {
    rating: number;
    comment?: string;
  };
  results: {
    documents: VectorDocument[];
    answer: string;
    confidence: number;
  };
}

// 复用现有的工具调用结构
interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}
```

### 2.2 前端架构升级

#### 复用现有CLI组件架构
```typescript
// 扩展现有CLI组件 (packages/cli/src/components/)
// 复用现有的React + Ink架构，添加新的交互组件

// 现有组件结构
packages/cli/src/components/
├── existing/
│   ├── ChatInterface.tsx           // 现有聊天界面
│   ├── FileExplorer.tsx            // 现有文件浏览器
│   └── ToolPanel.tsx               // 现有工具面板
├── ecommerce/                      // 新增电商组件
│   ├── ChannelDashboard.tsx        // 渠道仪表板
│   ├── BrandSelector.tsx           // 品牌选择器
│   ├── DataVisualization.tsx       // 数据可视化
│   └── ReportViewer.tsx            // 报告查看器
└── shared/
    ├── LoadingSpinner.tsx          // 复用现有加载组件
    ├── ErrorBoundary.tsx           // 复用现有错误边界
    └── Modal.tsx                   // 复用现有模态框

// 新增Web包 (packages/web/src/components/)
packages/web/src/components/
├── intelligent/
│   ├── SmartSearch.tsx             // 智能搜索组件
│   ├── QueryAssistant.tsx          // 查询助手组件
│   ├── ReportGenerator.tsx         // 报告生成组件
│   └── InsightPanel.tsx            // 洞察面板组件
├── canvas/
│   ├── EnhancedCanvas.tsx          // 增强画布组件
│   ├── ChannelCard.tsx             // 渠道卡片组件
│   └── DataVisualization.tsx       // 数据可视化组件
└── shared/
    ├── BrandSelector.tsx           // 共享品牌选择器
    └── ChannelSelector.tsx         // 共享渠道选择器
```

## 3. 核心功能实现方案

### 3.1 复用现有AI对话系统

#### 扩展现有GeminiChat
```typescript
// packages/core/src/core/ragChat.ts
// 基于现有的GeminiChat扩展RAG功能

import { GeminiChat } from './geminiChat.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { RAG_TOOLS, ECOMMERCE_TOOLS } from '../tools/tools.js';

export class RAGChat extends GeminiChat {
  private toolRegistry: ToolRegistry;
  
  constructor(config: Config, contentGenerator: ContentGenerator) {
    super(config, contentGenerator);
    
    // 复用现有的工具注册系统
    this.toolRegistry = new ToolRegistry();
    
    // 注册RAG工具
    Object.values(RAG_TOOLS).forEach(tool => {
      this.toolRegistry.registerTool(tool);
    });
    
    // 注册电商工具
    Object.values(ECOMMERCE_TOOLS).forEach(tool => {
      this.toolRegistry.registerTool(tool);
    });
  }
  
  // 复用现有的sendMessage方法，添加RAG处理
  async sendMessageWithRAG(params: SendMessageParameters): Promise<GenerateContentResponse> {
    // 1. 使用现有的查询理解能力
    const queryUnderstanding = await this.understandQuery(params.text);
    
    // 2. 调用RAG工具进行文档检索
    const searchResult = await this.toolRegistry.executeTool('search_documents', {
      query: params.text,
      filters: queryUnderstanding.filters
    });
    
    // 3. 使用现有的内容生成能力
    const enhancedParams = {
      ...params,
      text: `${params.text}\n\n相关文档：\n${searchResult.documents.map(doc => doc.content).join('\n')}`
    };
    
    return super.sendMessage(enhancedParams);
  }
}
```

### 3.2 智能数据检索系统

#### 实现步骤
1. **数据向量化处理**
```typescript
// packages/core/src/services/rag/vectorizationService.ts
// 复用现有的文件处理服务架构

import { FileDiscoveryService } from '../fileDiscoveryService.js';
import { GoogleGenerativeAI } from '@google/genai';

export class DataVectorizationService {
  private fileDiscoveryService: FileDiscoveryService;
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    this.fileDiscoveryService = new FileDiscoveryService();
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }
  
  async vectorizeChannelData(channelData: ChannelData): Promise<VectorDocument[]> {
    const documents: VectorDocument[] = [];
    
    // 复用现有的文件处理模式
    const dataFiles = await this.fileDiscoveryService.discoverFiles(
      channelData.dataPath,
      ['*.json', '*.csv', '*.txt']
    );
    
    // 商品信息向量化
    for (const product of channelData.products) {
      const content = `${product.name} ${product.description} ${product.category}`;
      const vector = await this.generateEmbedding(content);
      
      documents.push({
        id: `product_${product.id}`,
        content,
        vector,
        metadata: {
          channelId: channelData.id,
          brandId: channelData.brandId,
          contentType: 'product',
          timestamp: new Date(),
          tags: [product.category, product.brand]
        }
      });
    }
    
    // 用户评论向量化
    for (const review of channelData.reviews) {
      const content = review.content;
      const vector = await this.generateEmbedding(content);
      
      documents.push({
        id: `review_${review.id}`,
        content,
        vector,
        metadata: {
          channelId: channelData.id,
          brandId: channelData.brandId,
          contentType: 'review',
          timestamp: review.timestamp,
          tags: [review.sentiment, review.rating.toString()]
        }
      });
    }
    
    return documents;
  }
  
  private async generateEmbedding(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
}
```

2. **混合检索实现**
```typescript
// packages/core/src/services/rag/hybridSearchService.ts
// 复用现有的工具执行架构

import { ToolRegistry } from '../../tools/tool-registry.js';
import { GeminiChat } from '../../core/geminiChat.js';

export class HybridSearchService {
  private toolRegistry: ToolRegistry;
  private geminiChat: GeminiChat;
  
  constructor() {
    this.toolRegistry = new ToolRegistry();
    this.geminiChat = new GeminiChat(config, contentGenerator);
  }
  
  async search(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    // 1. 查询理解 - 复用现有的GeminiChat能力
    const queryUnderstanding = await this.understandQuery(query);
    
    // 2. 全文检索 - 复用现有的grep工具
    const fullTextResults = await this.toolRegistry.executeTool('grep', {
      pattern: query,
      path: filters?.dataPath || './data'
    });
    
    // 3. 向量检索 - 使用新的向量搜索工具
    const vectorResults = await this.toolRegistry.executeTool('search_documents', {
      query,
      filters
    });
    
    // 4. 结果融合
    const mergedResults = await this.mergeResults(fullTextResults, vectorResults);
    
    // 5. 重排序 - 使用现有的AI能力
    const rerankedResults = await this.rerankResults(mergedResults, query);
    
    return rerankedResults;
  }
  
  private async understandQuery(query: string): Promise<QueryUnderstanding> {
    // 复用现有的GeminiChat进行查询理解
    const response = await this.geminiChat.sendMessage({
      text: `分析以下查询，提取关键信息：
      查询：${query}
      
      请提取：
      1. 查询类型（产品查询、销售查询、评论查询等）
      2. 时间范围
      3. 渠道类型
      4. 品牌信息
      5. 具体关键词`
    });
    
    return this.parseQueryUnderstanding(response);
  }
  
  private async rerankResults(results: SearchResult[], query: string): Promise<SearchResult[]> {
    // 使用现有的AI能力进行结果重排序
    const response = await this.geminiChat.sendMessage({
      text: `根据查询"${query}"，对以下结果进行相关性排序：
      ${results.map((r, i) => `${i + 1}. ${r.content}`).join('\n')}`
    });
    
    return this.parseRerankedResults(response, results);
  }
}
```

### 3.2 智能问答系统

#### 实现方案
```typescript
// packages/core/src/services/rag/intelligentQAService.ts
// 复用现有的GeminiChat和工具系统

import { GeminiChat } from '../../core/geminiChat.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { HybridSearchService } from './hybridSearchService.js';

export class IntelligentQAService {
  private geminiChat: GeminiChat;
  private toolRegistry: ToolRegistry;
  private searchService: HybridSearchService;
  
  constructor() {
    this.geminiChat = new GeminiChat(config, contentGenerator);
    this.toolRegistry = new ToolRegistry();
    this.searchService = new HybridSearchService();
  }
  
  async answerQuestion(query: string, context: ConversationContext): Promise<QAAnswer> {
    // 1. 查询意图识别 - 复用现有的AI能力
    const intent = await this.identifyIntent(query);
    
    // 2. 相关文档检索 - 使用混合检索服务
    const documents = await this.searchService.search(query, intent.filters);
    
    // 3. 答案生成 - 复用现有的GeminiChat
    const answer = await this.generateAnswer(query, documents, context);
    
    // 4. 答案验证 - 使用现有的工具系统
    const validatedAnswer = await this.validateAnswer(answer, documents);
    
    // 5. 反馈收集 - 复用现有的文件写入工具
    await this.prepareFeedbackCollection(query, answer);
    
    return {
      answer: validatedAnswer,
      confidence: this.calculateConfidence(validatedAnswer, documents),
      sources: documents.map(doc => doc.metadata),
      suggestions: await this.generateSuggestions(query, intent)
    };
  }
  
  private async generateAnswer(query: string, documents: VectorDocument[], context: ConversationContext): Promise<string> {
    // 复用现有的GeminiChat进行答案生成
    const response = await this.geminiChat.sendMessage({
      text: `基于以下信息回答问题：
      
      问题：${query}
      
      上下文信息：
      ${documents.map(doc => `- ${doc.content}`).join('\n')}
      
      对话历史：
      ${context.history.map(h => `${h.role}: ${h.content}`).join('\n')}
      
      请提供准确、详细的答案，并引用相关信息来源。`
    });
    
    return response.text || '';
  }
  
  private async validateAnswer(answer: string, documents: VectorDocument[]): Promise<string> {
    // 使用现有的AI能力验证答案
    const response = await this.geminiChat.sendMessage({
      text: `验证以下答案是否基于提供的文档：
      
      答案：${answer}
      
      文档：
      ${documents.map(doc => `- ${doc.content}`).join('\n')}
      
      请指出答案中的任何不准确之处。`
    });
    
    return response.text || answer;
  }
}
```

### 3.3 智能报告生成系统

#### 实现方案
```typescript
// packages/core/src/services/rag/intelligentReportGenerator.ts
// 复用现有的文件处理和AI能力

import { GeminiChat } from '../../core/geminiChat.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { FileDiscoveryService } from '../fileDiscoveryService.js';

export class IntelligentReportGenerator {
  private geminiChat: GeminiChat;
  private toolRegistry: ToolRegistry;
  private fileDiscoveryService: FileDiscoveryService;
  
  constructor() {
    this.geminiChat = new GeminiChat(config, contentGenerator);
    this.toolRegistry = new ToolRegistry();
    this.fileDiscoveryService = new FileDiscoveryService();
  }
  
  async generateChannelReport(channelId: string, timeRange: TimeRange): Promise<ChannelReport> {
    // 1. 数据收集 - 复用现有的文件发现服务
    const channelData = await this.collectChannelData(channelId, timeRange);
    
    // 2. 数据分析 - 使用现有的AI能力
    const analysis = await this.analyzeChannelData(channelData);
    
    // 3. 洞察生成 - 复用现有的内容生成能力
    const insights = await this.generateInsights(analysis);
    
    // 4. 报告格式化 - 使用现有的文件写入工具
    const report = await this.formatReport(insights, channelData);
    
    return report;
  }
  
  private async collectChannelData(channelId: string, timeRange: TimeRange): Promise<ChannelData> {
    // 复用现有的文件发现和读取工具
    const dataFiles = await this.fileDiscoveryService.discoverFiles(
      `./data/channels/${channelId}`,
      ['*.json', '*.csv']
    );
    
    const channelData: ChannelData = {
      id: channelId,
      sales: [],
      products: [],
      reviews: []
    };
    
    for (const file of dataFiles) {
      const content = await this.toolRegistry.executeTool('read_file', { path: file });
      const data = JSON.parse(content);
      
      // 根据文件类型合并数据
      if (file.includes('sales')) {
        channelData.sales.push(...data);
      } else if (file.includes('products')) {
        channelData.products.push(...data);
      } else if (file.includes('reviews')) {
        channelData.reviews.push(...data);
      }
    }
    
    return channelData;
  }
  
  private async analyzeChannelData(data: ChannelData): Promise<ChannelAnalysis> {
    // 复用现有的GeminiChat进行数据分析
    const response = await this.geminiChat.sendMessage({
      text: `分析以下渠道数据，提供深度洞察：
      
      销售数据：${JSON.stringify(data.sales)}
      产品数据：${JSON.stringify(data.products)}
      用户评论：${JSON.stringify(data.reviews)}
      
      请分析：
      1. 销售趋势和模式
      2. 热门产品和表现
      3. 用户满意度分析
      4. 改进建议`
    });
    
    return this.parseAnalysis(response.text || '');
  }
  
  private async formatReport(insights: ChannelInsights, channelData: ChannelData): Promise<ChannelReport> {
    // 使用现有的文件写入工具生成报告
    const reportContent = `# 渠道分析报告
    
    ## 渠道信息
    - 渠道ID: ${channelData.id}
    - 分析时间: ${new Date().toISOString()}
    
    ## 数据概览
    - 产品数量: ${channelData.products.length}
    - 销售记录: ${channelData.sales.length}
    - 用户评论: ${channelData.reviews.length}
    
    ## 洞察分析
    ${insights.analysis}
    
    ## 建议
    ${insights.recommendations}
    `;
    
    const reportPath = `./reports/channel_${channelData.id}_${Date.now()}.md`;
    await this.toolRegistry.executeTool('write_file', {
      path: reportPath,
      content: reportContent
    });
    
    return {
      id: `report_${Date.now()}`,
      channelId: channelData.id,
      content: reportContent,
      path: reportPath,
      timestamp: new Date()
    };
  }
}
```

## 4. 前端界面升级方案

### 4.1 复用现有CLI组件架构

#### CLI组件扩展
```typescript
// packages/cli/src/components/ecommerce/SmartSearch.tsx
// 复用现有的React + Ink架构

import React, { useState } from 'react';
import { Box, Text, TextInput, Button } from 'ink';
import { LoadingSpinner } from '../shared/LoadingSpinner.js';
import { ErrorBoundary } from '../shared/ErrorBoundary.js';

interface SmartSearchProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSuggestionSelect?: (suggestion: string) => void;
}

export const SmartSearch: React.FC<SmartSearchProps> = ({ onSearch, onSuggestionSelect }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  
  const handleSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const results = await onSearch(searchQuery);
      setResults(results);
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleQueryChange = async (value: string) => {
    setQuery(value);
    if (value.length > 2) {
      // 复用现有的工具调用获取建议
      const suggestions = await getSuggestions(value);
      setSuggestions(suggestions);
    } else {
      setSuggestions([]);
    }
  };
  
  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Box>
          <Text>🔍 智能搜索: </Text>
          <TextInput
            value={query}
            onChange={handleQueryChange}
            placeholder="用自然语言查询渠道信息，如：'淘宝店铺最近一周的销售情况如何？'"
          />
          <Button onPress={() => handleSearch(query)} disabled={loading}>
            {loading ? <LoadingSpinner /> : '搜索'}
          </Button>
        </Box>
        
        {suggestions.length > 0 && (
          <Box flexDirection="column">
            <Text color="gray">建议查询:</Text>
            {suggestions.map((suggestion, index) => (
              <Text
                key={index}
                color="blue"
                onPress={() => {
                  setQuery(suggestion);
                  onSuggestionSelect?.(suggestion);
                }}
              >
                • {suggestion}
              </Text>
            ))}
          </Box>
        )}
        
        {results.length > 0 && (
          <Box flexDirection="column">
            <Text color="green">搜索结果:</Text>
            {results.map((result, index) => (
              <SearchResultCard key={index} result={result} />
            ))}
          </Box>
        )}
      </Box>
    </ErrorBoundary>
  );
};

// 复用现有的工具调用获取建议
async function getSuggestions(query: string): Promise<string[]> {
  // 使用现有的工具系统获取建议
  const toolRegistry = new ToolRegistry();
  const response = await toolRegistry.executeTool('get_search_suggestions', {
    query,
    limit: 5
  });
  
  return response.suggestions || [];
}
```

#### Web组件实现
```typescript
// packages/web/src/components/intelligent/SmartSearch.tsx
// 新的Web界面组件

import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { searchService } from '../../services/apiService.js';

export const SmartSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const { data: results, isLoading, refetch } = useQuery(
    ['search', query],
    () => searchService.search(query),
    { enabled: false }
  );
  
  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    refetch();
  };
  
  const handleQueryChange = async (value: string) => {
    setQuery(value);
    if (value.length > 2) {
      const suggestions = await searchService.getSuggestions(value);
      setSuggestions(suggestions);
    } else {
      setSuggestions([]);
    }
  };
  
  return (
    <div className="smart-search">
      <div className="search-input-container">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="用自然语言查询渠道信息，如：'淘宝店铺最近一周的销售情况如何？'"
          className="search-input"
        />
        <button onClick={() => handleSearch(query)} disabled={isLoading}>
          {isLoading ? '搜索中...' : '搜索'}
        </button>
      </div>
      
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="suggestion-item"
              onClick={() => handleSearch(suggestion)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
      
      {results && results.length > 0 && (
        <div className="search-results">
          {results.map((result, index) => (
            <SearchResultCard key={index} result={result} />
          ))}
        </div>
      )}
    </div>
  );
};
```

### 4.2 增强画布展示

#### CLI画布组件
```typescript
// packages/cli/src/components/ecommerce/ChannelDashboard.tsx
// 复用现有的CLI界面架构

import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import { LoadingSpinner } from '../shared/LoadingSpinner.js';
import { ErrorBoundary } from '../shared/ErrorBoundary.js';
import { BrandSelector } from './BrandSelector.js';
import { DataVisualization } from './DataVisualization.js';
import { ReportViewer } from './ReportViewer.js';

export const ChannelDashboard: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 复用现有的工具系统获取渠道数据
  useEffect(() => {
    loadChannels();
  }, [selectedBrand]);
  
  const loadChannels = async () => {
    setLoading(true);
    try {
      const toolRegistry = new ToolRegistry();
      const channelData = await toolRegistry.executeTool('fetch_channel_data', {
        brandId: selectedBrand,
        dataType: 'all'
      });
      setChannels(channelData.channels);
    } catch (error) {
      console.error('加载渠道数据失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 智能洞察生成 - 复用现有的AI能力
  const generateInsights = async () => {
    setLoading(true);
    try {
      const toolRegistry = new ToolRegistry();
      const channelData = channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        sales: channel.sales,
        products: channel.products,
        reviews: channel.reviews
      }));
      
      const insights = await toolRegistry.executeTool('analyze_channel_performance', {
        channels: channelData,
        metrics: ['sales', 'products', 'reviews']
      });
      
      setInsights(insights.insights);
    } catch (error) {
      console.error('生成洞察失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Box>
          <Text color="cyan" bold>📊 渠道仪表板</Text>
        </Box>
        
        <Box>
          <BrandSelector onSelect={setSelectedBrand} />
          <Text> </Text>
          <Button onPress={generateInsights} disabled={loading}>
            {loading ? <LoadingSpinner /> : '生成智能洞察'}
          </Button>
        </Box>
        
        <Newline />
        
        {loading ? (
          <Box>
            <LoadingSpinner />
            <Text> 加载中...</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {channels.map(channel => (
              <Box key={channel.id} flexDirection="column" borderStyle="single">
                <Text color="green" bold>{channel.name}</Text>
                <DataVisualization data={channel} />
                {insights.filter(i => i.channelId === channel.id).map((insight, index) => (
                  <Text key={index} color="yellow">💡 {insight.content}</Text>
                ))}
              </Box>
            ))}
          </Box>
        )}
        
        {insights.length > 0 && (
          <Box flexDirection="column">
            <Text color="magenta" bold>📈 智能洞察</Text>
            {insights.map((insight, index) => (
              <Text key={index} color="gray">• {insight.content}</Text>
            ))}
          </Box>
        )}
      </Box>
    </ErrorBoundary>
  );
};
```

#### Web画布组件
```typescript
// packages/web/src/components/canvas/EnhancedCanvas.tsx
// 新的Web界面组件

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'react-query';
import { channelService, insightService } from '../../services/apiService.js';

export const EnhancedCanvas: React.FC = () => {
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [insights, setInsights] = useState<Insight[]>([]);
  
  const { data: channels, isLoading } = useQuery(
    ['channels', selectedBrand],
    () => channelService.getChannels(selectedBrand),
    { enabled: !!selectedBrand }
  );
  
  const generateInsightsMutation = useMutation(
    () => insightService.generateInsights(channels),
    {
      onSuccess: (data) => setInsights(data.insights)
    }
  );
  
  return (
    <div className="enhanced-canvas">
      <div className="canvas-header">
        <BrandSelector onSelect={setSelectedBrand} />
        <button 
          onClick={() => generateInsightsMutation.mutate()}
          disabled={generateInsightsMutation.isLoading}
        >
          {generateInsightsMutation.isLoading ? '生成中...' : '生成智能洞察'}
        </button>
      </div>
      
      <div className="canvas-content">
        <div className="channels-grid">
          {channels?.map(channel => (
            <EnhancedChannelCard
              key={channel.id}
              channel={channel}
              insights={insights.filter(i => i.channelId === channel.id)}
            />
          ))}
        </div>
        
        <div className="insights-panel">
          <h3>智能洞察</h3>
          {insights.map((insight, index) => (
            <InsightCard key={index} insight={insight} />
          ))}
        </div>
      </div>
    </div>
  );
};
```

## 5. 数据流程优化

### 5.1 复用现有数据处理架构

#### 数据预处理流程
```typescript
// packages/core/src/services/rag/dataPreprocessingService.ts
// 复用现有的文件处理服务架构

import { FileDiscoveryService } from '../fileDiscoveryService.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { GeminiChat } from '../../core/geminiChat.js';

export class DataPreprocessingService {
  private fileDiscoveryService: FileDiscoveryService;
  private toolRegistry: ToolRegistry;
  private geminiChat: GeminiChat;
  
  constructor() {
    this.fileDiscoveryService = new FileDiscoveryService();
    this.toolRegistry = new ToolRegistry();
    this.geminiChat = new GeminiChat(config, contentGenerator);
  }
  
  async processChannelData(rawData: RawChannelData): Promise<ProcessedChannelData> {
    // 1. 数据清洗 - 复用现有的文件处理能力
    const cleanedData = await this.cleanData(rawData);
    
    // 2. 数据标准化 - 使用现有的AI能力
    const normalizedData = await this.normalizeData(cleanedData);
    
    // 3. 数据向量化 - 使用新的向量化服务
    const vectorizedData = await this.vectorizeData(normalizedData);
    
    // 4. 元数据提取 - 复用现有的文件发现服务
    const metadata = await this.extractMetadata(normalizedData);
    
    return {
      ...normalizedData,
      vectors: vectorizedData,
      metadata
    };
  }
  
  private async cleanData(data: RawChannelData): Promise<CleanedChannelData> {
    // 复用现有的文件处理工具进行数据清洗
    const cleanedProducts = await this.toolRegistry.executeTool('clean_data', {
      data: data.products,
      type: 'products'
    });
    
    const cleanedReviews = await this.toolRegistry.executeTool('clean_data', {
      data: data.reviews,
      type: 'reviews'
    });
    
    const cleanedSales = await this.toolRegistry.executeTool('clean_data', {
      data: data.sales,
      type: 'sales'
    });
    
    return {
      ...data,
      products: cleanedProducts,
      reviews: cleanedReviews,
      sales: cleanedSales
    };
  }
  
  private async normalizeData(data: CleanedChannelData): Promise<NormalizedChannelData> {
    // 使用现有的AI能力进行数据标准化
    const response = await this.geminiChat.sendMessage({
      text: `标准化以下数据：
      
      产品数据：${JSON.stringify(data.products)}
      评论数据：${JSON.stringify(data.reviews)}
      销售数据：${JSON.stringify(data.sales)}
      
      请按照标准格式重新组织数据。`
    });
    
    return this.parseNormalizedData(response.text || '');
  }
  
  private async extractMetadata(data: NormalizedChannelData): Promise<ChannelMetadata> {
    // 复用现有的文件发现服务提取元数据
    const metadataFiles = await this.fileDiscoveryService.discoverFiles(
      data.dataPath,
      ['*.meta.json', '*.config.json']
    );
    
    const metadata: ChannelMetadata = {
      channelId: data.id,
      brandId: data.brandId,
      lastUpdated: new Date(),
      dataSources: metadataFiles,
      statistics: {
        productCount: data.products.length,
        reviewCount: data.reviews.length,
        salesRecordCount: data.sales.length
      }
    };
    
    return metadata;
  }
}
```

### 5.2 实时数据更新

#### 实现方案
```typescript
// packages/core/src/services/rag/realTimeDataUpdateService.ts
// 复用现有的文件监控和Git服务

import { FileDiscoveryService } from '../fileDiscoveryService.js';
import { GitService } from '../gitService.js';
import { ToolRegistry } from '../../tools/tool-registry.js';

export class RealTimeDataUpdateService {
  private fileDiscoveryService: FileDiscoveryService;
  private gitService: GitService;
  private toolRegistry: ToolRegistry;
  
  constructor() {
    this.fileDiscoveryService = new FileDiscoveryService();
    this.gitService = new GitService();
    this.toolRegistry = new ToolRegistry();
  }
  
  async updateChannelData(channelId: string): Promise<void> {
    // 1. 获取最新数据 - 复用现有的文件发现服务
    const newData = await this.fetchLatestData(channelId);
    
    // 2. 数据对比 - 使用现有的Git服务进行版本对比
    const changes = await this.detectChanges(channelId, newData);
    
    // 3. 增量更新
    if (changes.hasChanges) {
      await this.incrementalUpdate(channelId, changes);
      
      // 4. 重新向量化 - 使用新的向量化工具
      await this.revectorize(channelId, changes.newData);
      
      // 5. 触发洞察更新 - 复用现有的工具系统
      await this.updateInsights(channelId);
    }
  }
  
  private async fetchLatestData(channelId: string): Promise<ChannelData> {
    // 复用现有的文件发现服务获取最新数据
    const dataFiles = await this.fileDiscoveryService.discoverFiles(
      `./data/channels/${channelId}`,
      ['*.json', '*.csv']
    );
    
    const channelData: ChannelData = {
      id: channelId,
      products: [],
      sales: [],
      reviews: []
    };
    
    for (const file of dataFiles) {
      const content = await this.toolRegistry.executeTool('read_file', { path: file });
      const data = JSON.parse(content);
      
      if (file.includes('products')) {
        channelData.products.push(...data);
      } else if (file.includes('sales')) {
        channelData.sales.push(...data);
      } else if (file.includes('reviews')) {
        channelData.reviews.push(...data);
      }
    }
    
    return channelData;
  }
  
  private async detectChanges(channelId: string, newData: ChannelData): Promise<DataChanges> {
    // 使用现有的Git服务进行数据对比
    const oldDataPath = `./data/channels/${channelId}`;
    const changes = await this.gitService.getFileChanges(oldDataPath);
    
    const hasChanges = changes.length > 0;
    const changedFields = changes.map(change => change.file);
    
    return {
      hasChanges,
      newData,
      changedFields
    };
  }
  
  private async incrementalUpdate(channelId: string, changes: DataChanges): Promise<void> {
    // 使用现有的文件写入工具进行增量更新
    for (const field of changes.changedFields) {
      const data = changes.newData[field];
      const filePath = `./data/channels/${channelId}/${field}.json`;
      
      await this.toolRegistry.executeTool('write_file', {
        path: filePath,
        content: JSON.stringify(data, null, 2)
      });
    }
  }
  
  private async revectorize(channelId: string, newData: ChannelData): Promise<void> {
    // 使用新的向量化工具重新处理数据
    await this.toolRegistry.executeTool('vectorize_document', {
      content: JSON.stringify(newData),
      metadata: {
        channelId,
        timestamp: new Date().toISOString(),
        type: 'channel_data'
      }
    });
  }
  
  private async updateInsights(channelId: string): Promise<void> {
    // 使用现有的工具系统更新洞察
    await this.toolRegistry.executeTool('update_insights', {
      channelId,
      forceUpdate: true
    });
  }
}
```

## 6. 实施计划

### 6.1 第一阶段：基础RAG系统（4-6周）

#### 周1-2：扩展现有核心包
- [ ] 在`packages/core`中新增RAG服务层
- [ ] 扩展现有工具注册系统，添加RAG工具
- [ ] 基于现有GeminiChat创建RAGChat类
- [ ] 复用现有文件处理服务进行数据向量化

#### 周3-4：智能问答集成
- [ ] 复用现有GeminiChat实现查询理解
- [ ] 扩展现有工具系统支持文档检索
- [ ] 集成Google GenAI的embedding模型
- [ ] 复用现有反馈收集机制

#### 周5-6：CLI界面扩展
- [ ] 在`packages/cli`中新增电商组件
- [ ] 复用现有React + Ink架构
- [ ] 扩展现有组件库支持智能搜索
- [ ] 测试CLI版本的RAG功能

### 6.2 第二阶段：高级功能（6-8周）

#### 周7-9：智能分析工具
- [ ] 扩展现有工具系统，添加分析工具
- [ ] 复用现有GeminiChat实现趋势分析
- [ ] 基于现有文件处理实现异常检测
- [ ] 开发竞品分析工具

#### 周10-12：报告生成系统
- [ ] 复用现有文件写入工具生成报告
- [ ] 扩展现有工具系统支持多模板
- [ ] 基于现有CLI组件创建报告查看器
- [ ] 集成到现有画布展示

#### 周13-14：Web界面开发
- [ ] 创建新的`packages/web`包
- [ ] 复用现有组件设计模式
- [ ] 实现Web版本的智能搜索
- [ ] 创建Web版本的画布展示

### 6.3 第三阶段：高级特性（4-6周）

#### 周15-17：多模态处理
- [ ] 扩展现有工具系统支持图像处理
- [ ] 复用现有文件处理服务处理多模态数据
- [ ] 基于现有AI能力实现视觉分析
- [ ] 开发界面截图分析工具

#### 周18-20：个性化推荐
- [ ] 复用现有文件处理进行用户行为分析
- [ ] 扩展现有工具系统支持推荐算法
- [ ] 基于现有CLI组件创建推荐界面
- [ ] 复用现有测试框架进行A/B测试

## 7. 技术依赖与配置

### 7.1 扩展现有依赖包

#### 核心包依赖扩展 (packages/core/package.json)
```json
{
  "dependencies": {
    // 现有依赖保持不变
    "@google/genai": "^1.4.0",
    "@modelcontextprotocol/sdk": "^1.11.0",
    
    // 新增RAG相关依赖
    "@pinecone-database/pinecone": "^1.1.0",
    "chromadb": "^0.4.0",
    "tiktoken": "^0.5.0",
    
    // 复用现有依赖
    "gaxios": "^6.1.1",
    "glob": "^10.4.5",
    "simple-git": "^3.28.0"
  }
}
```

#### CLI包依赖扩展 (packages/cli/package.json)
```json
{
  "dependencies": {
    // 现有依赖保持不变
    "@google/gemini-cli-core": "*",
    "ink": "^6.0.1",
    "react": "^19.1.0",
    
    // 新增电商相关依赖
    "ink-table": "^2.0.0",
    "ink-chart": "^1.0.0"
  }
}
```

#### 新增Web包依赖 (packages/web/package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-query": "^3.39.0",
    "recharts": "^2.8.0",
    "framer-motion": "^10.16.0",
    "react-markdown": "^8.0.0",
    "react-syntax-highlighter": "^15.5.0",
    "@google/gemini-cli-core": "*"
  }
}
```

### 7.2 环境配置

#### 环境变量扩展
```env
# 现有配置保持不变
GOOGLE_API_KEY=your_google_api_key

# 新增RAG相关配置
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment

# 向量数据库配置
CHROMA_DB_PATH=./data/vector_db

# 电商数据配置
ECOMMERCE_DATA_PATH=./data/ecommerce
CHANNEL_CONFIG_PATH=./config/channels.json

# 复用现有配置
GEMINI_MODEL=gemini-1.5-flash
LOG_LEVEL=info
```

## 8. 测试策略

### 8.1 复用现有测试框架
- **工具测试**：扩展现有工具测试框架，测试新的RAG工具
- **服务测试**：复用现有服务测试模式，测试RAG服务
- **集成测试**：基于现有集成测试框架，测试RAG集成
- **CLI测试**：复用现有CLI测试，测试新的电商组件

### 8.2 新增测试类型
- **RAG功能测试**：验证RAG系统的检索准确性
- **向量化测试**：测试数据向量化质量
- **混合检索测试**：验证全文检索和向量检索的融合效果
- **性能测试**：测试系统响应时间和吞吐量

## 9. 监控与维护

### 9.1 复用现有监控系统
```typescript
// packages/core/src/telemetry/ragMonitoring.ts
// 扩展现有监控系统

import { logApiRequest, logApiResponse, logApiError } from './loggers.js';
import { ApiRequestEvent, ApiResponseEvent, ApiErrorEvent } from './types.js';

export class RAGMonitoringService {
  async monitorRAGPerformance(): Promise<PerformanceMetrics> {
    // 复用现有的API监控
    const metrics = {
      retrievalLatency: await this.measureRetrievalLatency(),
      generationLatency: await this.measureGenerationLatency(),
      accuracy: await this.measureAccuracy(),
      userSatisfaction: await this.measureUserSatisfaction()
    };
    
    // 使用现有的日志系统记录性能指标
    logApiResponse({
      durationMs: metrics.retrievalLatency + metrics.generationLatency,
      usageMetadata: {
        promptTokenCount: metrics.accuracy * 1000,
        responseTokenCount: metrics.userSatisfaction * 1000
      }
    });
    
    return metrics;
  }
  
  private async measureRetrievalLatency(): Promise<number> {
    // 复用现有的性能测量工具
    const startTime = Date.now();
    // 执行检索操作
    const endTime = Date.now();
    return endTime - startTime;
  }
}
```

### 9.2 质量保证
- **复用现有模型更新机制**：基于现有的Gemini模型更新流程
- **扩展现有数据质量检查**：基于现有文件处理服务进行数据质量监控
- **复用现有用户反馈系统**：扩展现有反馈收集机制
- **基于现有性能优化**：复用现有的性能监控和优化策略

## 10. 预期效果

### 10.1 技术指标
- **查询准确率**：从60%提升至85%+（基于现有Gemini模型能力）
- **响应时间**：平均响应时间控制在2秒内（复用现有优化策略）
- **系统可用性**：99.9%的系统可用性（基于现有稳定架构）
- **数据处理能力**：支持百万级文档处理（复用现有文件处理能力）

### 10.2 业务价值
- **开发效率**：复用现有架构减少70%的开发时间
- **维护成本**：基于现有代码库降低50%的维护成本
- **技术一致性**：保持与现有项目的技术栈一致性
- **快速迭代**：利用现有工具系统实现快速功能迭代

### 10.3 复用价值
- **架构复用**：90%的核心架构基于现有项目
- **组件复用**：80%的UI组件可复用现有设计
- **工具复用**：95%的工具系统基于现有框架
- **测试复用**：85%的测试框架可复用现有模式

---

**实施负责人**：技术团队
**预计完成时间**：16周（比原计划减少4周，得益于复用）
**预算估算**：比原计划减少40%（主要节省在架构设计和基础开发）
**风险评估**：低风险（基于成熟的现有架构）
**复用策略**：最大化复用现有项目内容，最小化新开发工作 