# Sensei-AI 実装ガイド

## 実装ステップ

### Step 1: プロジェクトセットアップ

#### 1.1 フォーク作成
```bash
# Gemini CLIをフォーク
git clone https://github.com/google-gemini/gemini-cli sensei-ai
cd sensei-ai

# 新しいリモートを設定
git remote rename origin upstream
git remote add origin [your-sensei-ai-repo]
```

#### 1.2 ブランチ戦略
```bash
# 開発ブランチ作成
git checkout -b feature/sensei-ai-core

# 機能別ブランチ
- feature/storage-abstraction
- feature/learning-tools
- feature/educational-prompts
- feature/ui-adaptation
```

### Step 2: Storage Abstraction Layer 実装

#### 2.1 インターフェース定義
```typescript
// packages/core/src/storage/interfaces.ts
export interface StorageAdapter {
  // 基本操作
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  
  // リスト操作
  list(prefix: string): Promise<string[]>;
  
  // トランザクション
  transaction<T>(operations: () => Promise<T>): Promise<T>;
}

// packages/core/src/storage/learning-storage.ts
export interface LearningDataStorage {
  sessions: SessionStorage;
  profiles: ProfileStorage;
  paths: PathStorage;
  topics: TopicStorage;
}
```

#### 2.2 ファイルベース実装
```typescript
// packages/core/src/storage/adapters/file-adapter.ts
export class FileStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}
  
  async get<T>(key: string): Promise<T | null> {
    const filePath = path.join(this.basePath, `${key}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  
  async set<T>(key: string, value: T): Promise<void> {
    const filePath = path.join(this.basePath, `${key}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  }
}
```

#### 2.3 ストレージファクトリー
```typescript
// packages/core/src/storage/factory.ts
export class StorageFactory {
  static create(config: Config): LearningDataStorage {
    const adapter = config.storageType === 'file' 
      ? new FileStorageAdapter(config.dataPath)
      : new DatabaseAdapter(config.dbConfig);
    
    return {
      sessions: new SessionStorage(adapter),
      profiles: new ProfileStorage(adapter),
      paths: new PathStorage(adapter),
      topics: new TopicStorage(adapter)
    };
  }
}
```

### Step 3: 学習ツール実装

#### 3.1 ツール登録
```typescript
// packages/core/src/config.ts の修正
export function createToolRegistry(config: Config): ToolRegistry {
  const registry = new ToolRegistry();
  
  // 既存のツール登録
  // ...
  
  // Sensei-AI専用ツール追加
  if (config.mode === 'educational') {
    registerCoreTool(QuizGeneratorTool, config);
    registerCoreTool(LearningPathTool, config);
    registerCoreTool(ComprehensionAnalysisTool, config);
    registerCoreTool(ConceptExplanationTool, config);
  }
  
  return registry;
}
```

#### 3.2 QuizGeneratorTool実装例
```typescript
// packages/core/src/tools/educational/quizGenerator.ts
export class QuizGeneratorTool extends BaseTool<QuizParams, QuizResult> {
  static readonly Name = 'generate_quiz';
  
  constructor(
    private config: Config,
    private storage: LearningDataStorage
  ) {
    super(
      QuizGeneratorTool.Name,
      '理解度確認クイズ生成',
      'ユーザーの理解度に応じた問題を生成します',
      {
        name: QuizGeneratorTool.Name,
        description: 'Generate adaptive quiz based on user understanding',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '問題を生成するトピック' },
            checkpointId: { type: 'string', description: 'チェックポイントID' },
            userId: { type: 'string', description: 'ユーザーID' }
          },
          required: ['topic', 'checkpointId', 'userId']
        }
      },
      true,
      false
    );
  }
  
  async execute(params: QuizParams, signal: AbortSignal): Promise<QuizResult> {
    // ユーザープロファイル取得
    const profile = await this.storage.profiles.load(params.userId);
    const topicUnderstanding = profile.knowledgeMap.get(params.topic);
    
    // 理解度に基づいて難易度決定
    const difficulty = this.calculateDifficulty(topicUnderstanding);
    
    // LLMに問題生成を依頼
    const prompt = this.buildQuizPrompt(params.topic, difficulty);
    
    // 問題生成（実際のLLM呼び出しはGeminiChat経由）
    return {
      questions: await this.generateQuestions(prompt, signal),
      difficulty,
      adaptiveHints: this.generateHints(topicUnderstanding)
    };
  }
  
  private calculateDifficulty(understanding: KnowledgeLevel): Difficulty {
    if (understanding.score < 0.3) return 'beginner';
    if (understanding.score < 0.7) return 'intermediate';
    return 'advanced';
  }
}
```

### Step 4: システムプロンプト置き換え

#### 4.1 環境変数設定
```bash
# .env ファイル
GEMINI_SYSTEM_MD=/path/to/sensei-ai-system-prompt.md
```

#### 4.2 カスタムプロンプトファイル
```markdown
# sensei-ai-system-prompt.md

あなたはSensei-AI、パーソナライズされた学習体験を提供する教育アシスタントです。

## 核心的な使命
ユーザーの理解度に完全に適応し、それぞれの学習者に最適な説明と学習パスを提供すること。

## 基本的な振る舞い

### 初回対話時
1. 学習したい内容について深く理解する
2. なぜそれを学びたいのか、最終的な目標は何かを明確にする
3. 現在の知識レベルを評価するための質問を行う

### 説明生成時
- ユーザーの理解レベルに完全に合わせる
- 専門用語の使用は理解度に応じて調整
- 具体例は学習者の背景に関連するものを選ぶ
- 視覚的な説明が有効な場合は、図解の説明を含める

### チェックポイント時
- 理解度を5段階で自己評価してもらう
- 3以下の評価の場合：
  - どの部分が難しかったか特定する
  - 別の角度から説明を試みる
  - より基礎的な概念から説明が必要か判断する

### 学習パス管理
- 前提知識の不足を検出したら、その理由と共に記録
- 学習順序は柔軟に調整可能
- 学習者の進捗と理解度に基づいて最適化

## ツール使用ガイドライン

### generate_quiz
- チェックポイントごとに理解度確認のために使用
- 問題の難易度はユーザープロファイルに基づいて調整

### create_learning_path  
- 新しいトピック開始時に使用
- 既存パスの修正が必要な場合も使用

### analyze_comprehension
- クイズやチェックポイントの結果を分析
- ユーザープロファイルの更新に使用

### explain_concept
- 概念の深掘り説明が必要な時に使用
- ユーザーの理解レベルに応じた説明を生成

## 重要な原則
1. 学習者を決して急がせない
2. 「わからない」ことを恥じさせない
3. 小さな進歩も認めて励ます
4. 知的好奇心を刺激する
5. 学ぶことの楽しさを伝える
```

### Step 5: UI/ブランディング変更

#### 5.1 AboutBox更新
```typescript
// packages/cli/src/ui/components/AboutBox.tsx
export const AboutBox = () => {
  return (
    <Box borderStyle="round" padding={1}>
      <Text bold>Sensei-AI 学習アシスタント v{version}</Text>
      <Text>
        あなたの理解度に適応する、パーソナライズされた学習体験
      </Text>
      <Text dimColor>
        Powered by Gemini • Based on Gemini CLI
      </Text>
    </Box>
  );
};
```

#### 5.2 Tips更新
```typescript
// packages/cli/src/ui/components/Tips.tsx
const educationalTips = [
  '💡 わからないことがあれば、遠慮なく質問してください',
  '📚 /topics で学習中のトピック一覧を確認できます',
  '✨ 概念をクリックすると詳細な説明が表示されます',
  '📊 /progress で学習進捗を確認できます',
  '🎯 チェックポイントで理解度を正直に評価しましょう',
];
```

### Step 6: 設定ファイル更新

#### 6.1 GEMINI.md → LEARNING.md
```typescript
// packages/core/src/services/fileDiscovery.ts
const MEMORY_FILE_NAMES = ['LEARNING.md', 'SYLLABUS.md'];

// packages/core/src/core/contentGenerator.ts
const loadEducationalContext = async () => {
  // LEARNING.md ファイルを読み込む
  return loadServerHierarchicalMemory('LEARNING.md');
};
```

#### 6.2 設定スキーマ拡張
```typescript
// packages/core/src/config.ts
export interface EducationalConfig extends Config {
  mode: 'educational';
  learningSettings: {
    checkpointInterval: number; // チェックポイントの頻度
    adaptiveLevel: 'high' | 'medium' | 'low'; // 適応度
    multiTopicEnabled: boolean; // 複数トピック並行学習
  };
}
```

## テストとデバッグ

### ユニットテスト例
```typescript
// packages/core/tests/educational/quizGenerator.test.ts
describe('QuizGeneratorTool', () => {
  it('should generate easier questions for beginners', async () => {
    const mockProfile = createMockProfile({ understanding: 0.2 });
    const tool = new QuizGeneratorTool(config, mockStorage);
    
    const result = await tool.execute({
      topic: '線形代数',
      userId: 'test-user',
      checkpointId: 'cp-1'
    });
    
    expect(result.difficulty).toBe('beginner');
    expect(result.questions[0].complexity).toBeLessThan(3);
  });
});
```

### 統合テスト
```bash
# 学習フロー全体のテスト
npm run test:integration:educational

# 特定のツールのテスト
npm run test:tool -- --tool=QuizGeneratorTool
```

## デプロイメント考慮事項

### 環境別設定
```typescript
// config/production.ts
export const productionConfig: EducationalConfig = {
  mode: 'educational',
  storageType: 'database',
  dbConfig: {
    // 本番DB設定
  },
  learningSettings: {
    checkpointInterval: 5,
    adaptiveLevel: 'high',
    multiTopicEnabled: true
  }
};
```

### パフォーマンス最適化
- ユーザープロファイルのキャッシング
- 学習パスの事前生成
- チェックポイントデータの圧縮

## 次のステップ

1. **MVP完成後**
   - ユーザーフィードバック収集
   - 学習効果の測定メトリクス実装
   - A/Bテストフレームワーク導入

2. **スケーリング準備**
   - データベースマイグレーション計画
   - API設計（REST/GraphQL）
   - 認証システムの拡張

3. **高度な機能**
   - 機械学習による理解度予測
   - ソーシャル学習機能
   - 外部教育プラットフォーム連携