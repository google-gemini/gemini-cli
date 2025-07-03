# Sensei-AI アーキテクチャ設計

## システムアーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────┐
│                   Web/Mobile UI                      │
│                  (React/React Native)                │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────┐
│                 Sensei-AI Core                       │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Learning    │  │ Content      │  │ Progress   │ │
│  │ Tools       │  │ Generator    │  │ Tracker    │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Context     │  │ Agent        │  │ Storage    │ │
│  │ Manager     │  │ Loop         │  │ Abstraction│ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────┐
│              Gemini API / LLM Backend                │
└─────────────────────────────────────────────────────┘
```

## コンポーネント詳細

### 1. Storage Abstraction Layer（データ保存抽象化層）

```typescript
// 学習データストレージインターフェース
interface LearningDataStorage {
  // セッション管理
  saveSession(session: LearningSession): Promise<void>;
  loadSession(sessionId: string): Promise<LearningSession>;
  listSessions(userId: string): Promise<LearningSession[]>;
  
  // ユーザープロファイル
  saveUserProfile(profile: UserProfile): Promise<void>;
  loadUserProfile(userId: string): Promise<UserProfile>;
  
  // 学習パス
  saveLearningPath(path: LearningPath): Promise<void>;
  loadLearningPath(pathId: string): Promise<LearningPath>;
  
  // トピック管理
  saveTopicProgress(topic: TopicProgress): Promise<void>;
  loadTopicProgress(topicId: string): Promise<TopicProgress>;
}

// データモデル
interface LearningSession {
  id: string;
  userId: string;
  topics: Map<string, TopicSession>;
  currentTopicId: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

interface TopicSession {
  id: string;
  subject: string; // "線形代数", "日本の歴史"
  learningPathId: string;
  currentCheckpoint: number;
  understandingProfile: UnderstandingProfile;
  startedAt: Date;
  completionPercentage: number;
}

interface UnderstandingProfile {
  topicId: string;
  knowledgeMap: Map<string, KnowledgeLevel>;
  weakPoints: ConceptNode[];
  strongPoints: ConceptNode[];
  lastUpdated: Date;
}
```

### 2. Learning Tools（学習専用ツール）

```typescript
// 問題生成ツール
export class QuizGeneratorTool extends BaseTool<QuizParams, QuizResult> {
  static readonly Name = 'generate_quiz';
  
  async execute(params: QuizParams): Promise<QuizResult> {
    // ユーザーの理解度に基づいて動的に難易度調整
    const userProfile = await this.storage.loadUserProfile(params.userId);
    const difficulty = this.calculateDifficulty(userProfile, params.topic);
    
    return this.generateAdaptiveQuiz(params.topic, difficulty);
  }
}

// 学習パス生成ツール
export class LearningPathTool extends BaseTool<PathParams, LearningPath> {
  static readonly Name = 'create_learning_path';
  
  async execute(params: PathParams): Promise<LearningPath> {
    // 学習目標と現在の理解度から最適パスを生成
    const profile = await this.storage.loadUserProfile(params.userId);
    return this.generateOptimalPath(params.goal, profile);
  }
}

// 理解度分析ツール
export class ComprehensionAnalysisTool extends BaseTool<AnalysisParams, AnalysisResult> {
  static readonly Name = 'analyze_comprehension';
  
  async execute(params: AnalysisParams): Promise<AnalysisResult> {
    // チェックポイントごとの理解度を分析
    return this.analyzeUserResponses(params.responses, params.checkpoint);
  }
}

// 概念説明ツール
export class ConceptExplanationTool extends BaseTool<ConceptParams, Explanation> {
  static readonly Name = 'explain_concept';
  
  async execute(params: ConceptParams): Promise<Explanation> {
    // ユーザーの理解レベルに応じた説明を生成
    const profile = await this.storage.loadUserProfile(params.userId);
    return this.generateAdaptiveExplanation(params.concept, profile);
  }
}
```

### 3. Context Management（コンテキスト管理）

```typescript
export class LearningContextManager {
  private storage: LearningDataStorage;
  
  // チェックポイント単位のコンテキスト管理
  async getCheckpointContext(
    sessionId: string, 
    checkpointId: number
  ): Promise<Context> {
    const session = await this.storage.loadSession(sessionId);
    const topic = session.topics.get(session.currentTopicId);
    
    return {
      // 現在のチェックポイント以降のコンテキストのみ
      currentContent: this.getCurrentCheckpointContent(topic, checkpointId),
      userProfile: topic.understandingProfile,
      learningPath: await this.storage.loadLearningPath(topic.learningPathId),
      previousCheckpoints: this.getPreviousCheckpointsSummary(topic, checkpointId)
    };
  }
  
  // トピック切り替え
  async switchTopic(sessionId: string, topicId: string): Promise<void> {
    const session = await this.storage.loadSession(sessionId);
    session.currentTopicId = topicId;
    await this.storage.saveSession(session);
  }
  
  // 付箋機能用のコンテキストスタック
  private contextStack: ConceptStack[] = [];
  
  async pushPrerequisiteConcept(concept: ConceptNode, reason: string): Promise<void> {
    this.contextStack.push({
      concept,
      reason,
      returnPoint: await this.getCurrentContext()
    });
  }
}
```

### 4. System Prompts（システムプロンプト）

```typescript
export const EDUCATIONAL_SYSTEM_PROMPT = `
あなたはSensei-AI、適応型学習アシスタントです。

## 基本原則
1. ユーザーの理解度に完全に適応した説明を行う
2. 段階的な学習を促進し、理解が不十分な場合は先に進まない
3. 知的好奇心を刺激し、学習の楽しさを伝える
4. 具体例と抽象概念のバランスを保つ

## 学習フロー
1. 学習内容の深掘りと目的確認
   - なぜこれを学びたいのか理解する
   - 最終的な目標を明確にする

2. 理解度評価
   - 様々な角度から質問を行う
   - 前提知識の有無を確認する

3. 個別最適化された学習パス生成
   - ユーザーの現在地と目標をつなぐ最短経路
   - 必要な前提知識を含む

4. 動的なコンテンツ生成
   - ユーザーの理解レベルに完全に合わせる
   - つまずきを検出したら即座に調整

5. チェックポイントでの確認
   - 理解度を5段階で自己評価してもらう
   - 3以下の場合は別角度から再説明

## 重要な機能
- 概念ハイパーテキスト: 重要な用語は深掘り可能
- 範囲選択: 特定の部分について詳細説明可能
- 付箋機能: 前提知識の不足を検出し後で学習

## トーン
- 親しみやすく励ましの言葉を使う
- 難しい概念も恐れずに挑戦する勇気を与える
- 小さな進歩も認めて褒める
`;
```

### 5. UI/UX Components

```typescript
// トピック切り替えコマンド
export const topicCommands = {
  '/switch': async (topicName: string) => {
    // トピックを切り替え
    await contextManager.switchTopic(sessionId, topicName);
  },
  
  '/topics': async () => {
    // 現在学習中のトピック一覧を表示
    const sessions = await storage.listSessions(userId);
    return formatTopicList(sessions);
  },
  
  '/progress': async () => {
    // 現在のトピックの進捗を表示
    const progress = await storage.loadTopicProgress(currentTopicId);
    return formatProgress(progress);
  }
};

// チェックポイントUI
export const CheckpointComponent: React.FC = () => {
  const [understanding, setUnderstanding] = useState<number>(0);
  
  return (
    <Box borderStyle="round" padding={1}>
      <Text>この内容の理解度を教えてください：</Text>
      <SelectInput
        items={[
          {label: '1 - 全くわからない', value: 1},
          {label: '2 - あまりわからない', value: 2},
          {label: '3 - なんとなくわかる', value: 3},
          {label: '4 - だいたいわかる', value: 4},
          {label: '5 - 完全に理解した', value: 5}
        ]}
        onSelect={handleUnderstandingSelect}
      />
    </Box>
  );
};
```

## 実装優先順位

1. **Phase 1: 基盤構築**
   - Storage Abstraction Layer
   - 基本的な学習ツール実装
   - システムプロンプトの置き換え

2. **Phase 2: 学習フロー**
   - Context Manager実装
   - チェックポイントシステム
   - 基本的なWeb UI

3. **Phase 3: 高度な機能**
   - 付箋機能
   - 概念ハイパーテキスト
   - 範囲選択チャット