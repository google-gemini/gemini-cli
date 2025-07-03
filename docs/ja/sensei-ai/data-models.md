# Sensei-AI データモデル仕様

## 概要

Sensei-AIのデータモデルは、ユーザーの学習状態を包括的に管理し、パーソナライズされた学習体験を実現するために設計されています。

## コアエンティティ

### 1. User (ユーザー)

```typescript
interface User {
  id: string;                    // UUID
  email?: string;               // メールアドレス（認証用）
  displayName: string;          // 表示名
  createdAt: Date;             // アカウント作成日時
  lastActiveAt: Date;          // 最終アクセス日時
  preferences: UserPreferences; // ユーザー設定
  stats: LearningStats;        // 学習統計
}

interface UserPreferences {
  language: 'ja' | 'en';       // 言語設定
  learningStyle: LearningStyle; // 学習スタイル
  dailyGoalMinutes: number;    // 1日の学習目標時間
  reminderEnabled: boolean;    // リマインダー設定
  theme: 'light' | 'dark';     // UIテーマ
}

interface LearningStyle {
  preferredDifficulty: 'easy' | 'normal' | 'hard';
  detailLevel: 'concise' | 'balanced' | 'detailed';
  examplePreference: 'many' | 'some' | 'few';
  visualLearner: boolean;      // 視覚的説明を好むか
}

interface LearningStats {
  totalLearningMinutes: number;
  topicsCompleted: number;
  currentStreak: number;        // 連続学習日数
  longestStreak: number;
  totalCheckpoints: number;
  averageComprehension: number; // 平均理解度
}
```

### 2. LearningSession (学習セッション)

```typescript
interface LearningSession {
  id: string;                   // UUID
  userId: string;              // ユーザーID
  topics: Map<string, TopicSession>; // トピックID -> セッション
  currentTopicId: string;      // 現在のトピックID
  createdAt: Date;            // セッション開始日時
  lastAccessedAt: Date;       // 最終アクセス日時
  metadata: SessionMetadata;   // セッションメタデータ
}

interface SessionMetadata {
  device: 'web' | 'mobile' | 'desktop';
  clientVersion: string;
  sessionDuration: number;     // 累計セッション時間（分）
}

interface TopicSession {
  id: string;                  // UUID
  subject: string;            // トピック名（例: "線形代数"）
  description: string;        // トピックの説明
  learningPathId: string;     // 学習パスID
  currentNodeId: string;      // 現在のノードID
  currentCheckpoint: number;   // 現在のチェックポイント番号
  understandingProfile: UnderstandingProfile;
  startedAt: Date;
  lastAccessedAt: Date;
  completionPercentage: number; // 完了率（0-100）
  status: TopicStatus;
}

type TopicStatus = 'active' | 'paused' | 'completed' | 'abandoned';
```

### 3. LearningPath (学習パス)

```typescript
interface LearningPath {
  id: string;                  // UUID
  topicId: string;            // トピックID
  userId: string;             // ユーザーID
  goal: LearningGoal;         // 学習目標
  nodes: LearningNode[];      // 学習ノードの配列
  edges: PathEdge[];          // ノード間の関係
  createdAt: Date;
  lastModifiedAt: Date;
  adaptationHistory: PathAdaptation[]; // パス修正履歴
}

interface LearningGoal {
  description: string;         // 目標の説明
  targetLevel: ProficiencyLevel;
  estimatedHours: number;      // 推定学習時間
  prerequisites: string[];     // 前提知識
}

interface LearningNode {
  id: string;                  // UUID
  title: string;              // ノードタイトル
  description: string;        // 内容の説明
  concepts: Concept[];        // 含まれる概念
  estimatedMinutes: number;   // 推定学習時間
  difficulty: Difficulty;     // 難易度
  type: NodeType;            // ノードタイプ
  content?: NodeContent;      // ノードコンテンツ（生成後）
  checkpoint?: Checkpoint;    // チェックポイント情報
}

interface PathEdge {
  from: string;               // 元ノードID
  to: string;                 // 先ノードID
  type: 'sequential' | 'prerequisite' | 'optional';
  condition?: EdgeCondition;  // 遷移条件
}

interface PathAdaptation {
  timestamp: Date;
  reason: string;             // 修正理由
  changes: PathChange[];      // 変更内容
  triggerCheckpoint?: string; // トリガーとなったチェックポイント
}

type NodeType = 'introduction' | 'concept' | 'practice' | 'review' | 'assessment';
type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
type ProficiencyLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
```

### 4. UnderstandingProfile (理解度プロファイル)

```typescript
interface UnderstandingProfile {
  topicId: string;
  userId: string;
  knowledgeMap: Map<string, KnowledgeLevel>; // 概念ID -> 知識レベル
  weakPoints: WeakPoint[];     // 弱点
  strongPoints: StrongPoint[]; // 強み
  learningPatterns: LearningPattern[]; // 学習パターン
  lastUpdated: Date;
  checkpointHistory: CheckpointResult[]; // チェックポイント履歴
}

interface KnowledgeLevel {
  conceptId: string;          // 概念ID
  concept: string;            // 概念名
  proficiency: number;        // 習熟度（0-1）
  confidence: number;         // 自信度（0-1）
  lastAssessed: Date;        // 最終評価日
  assessmentCount: number;    // 評価回数
  retentionRate: number;      // 定着率
}

interface WeakPoint {
  conceptId: string;
  concept: string;
  identifiedAt: Date;
  reason: string;             // 弱点の理由
  suggestedActions: string[]; // 推奨アクション
  improved: boolean;          // 改善されたか
}

interface StrongPoint {
  conceptId: string;
  concept: string;
  identifiedAt: Date;
  evidence: string[];         // 強みの根拠
}

interface LearningPattern {
  pattern: string;            // パターンの説明
  frequency: number;          // 頻度
  impact: 'positive' | 'negative' | 'neutral';
  recommendations: string[];  // 推奨事項
}
```

### 5. Checkpoint (チェックポイント)

```typescript
interface Checkpoint {
  id: string;                  // UUID
  nodeId: string;             // 学習ノードID
  sessionId: string;          // セッションID
  position: number;           // チェックポイント番号
  createdAt: Date;
  result?: CheckpointResult;  // 結果（実施後）
}

interface CheckpointResult {
  checkpointId: string;
  userId: string;
  timestamp: Date;
  selfAssessment: 1 | 2 | 3 | 4 | 5; // 自己評価
  quizResults?: QuizResult[];  // クイズ結果
  comprehensionScore: number;   // 理解度スコア（0-1）
  timeSpent: number;           // 所要時間（秒）
  feedback?: string;           // ユーザーフィードバック
  analysis: ComprehensionAnalysis;
}

interface ComprehensionAnalysis {
  overallLevel: 'low' | 'medium' | 'high';
  misunderstoodConcepts: string[]; // 誤解された概念
  wellUnderstoodConcepts: string[]; // よく理解された概念
  recommendations: string[];        // 推奨事項
  shouldReview: boolean;           // 復習が必要か
}
```

### 6. Content (コンテンツ)

```typescript
interface NodeContent {
  nodeId: string;
  type: ContentType;
  title: string;
  body: string;                // メインコンテンツ（Markdown）
  concepts: ConceptReference[]; // 概念への参照
  examples: Example[];         // 例
  visualAids?: VisualAid[];   // 視覚的補助
  generatedAt: Date;
  generationContext: GenerationContext;
}

interface ConceptReference {
  conceptId: string;
  concept: string;
  startIndex: number;         // テキスト内の開始位置
  endIndex: number;           // テキスト内の終了位置
  isClickable: boolean;       // クリック可能か
}

interface Example {
  id: string;
  description: string;
  code?: string;              // コード例
  explanation: string;
  difficulty: Difficulty;
}

interface VisualAid {
  type: 'diagram' | 'chart' | 'illustration';
  description: string;        // 視覚的要素の説明
  altText: string;           // アクセシビリティ用
}

interface GenerationContext {
  userProfile: UnderstandingProfile;
  previousContent?: string;    // 前のコンテンツ
  adaptationReason?: string;   // 適応の理由
  promptTemplate: string;      // 使用されたプロンプト
}

type ContentType = 'explanation' | 'example' | 'exercise' | 'summary' | 'quiz';
```

### 7. Quiz (クイズ)

```typescript
interface Quiz {
  id: string;                  // UUID
  checkpointId: string;       // チェックポイントID
  questions: Question[];      // 質問配列
  difficulty: Difficulty;     // 全体の難易度
  timeLimit?: number;         // 制限時間（秒）
  adaptiveHints: boolean;     // 適応的ヒントを使用するか
  generatedAt: Date;
}

interface Question {
  id: string;
  type: QuestionType;
  content: string;            // 質問文
  options?: string[];         // 選択肢（選択式の場合）
  correctAnswer: string | string[]; // 正解
  explanation: string;        // 解説
  hints: string[];           // ヒント（段階的）
  concepts: string[];        // 関連する概念
  difficulty: Difficulty;
  points: number;            // 配点
}

interface QuizResult {
  quizId: string;
  questionId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  timeSpent: number;         // 回答時間（秒）
  hintsUsed: number;         // 使用したヒント数
  attemptNumber: number;     // 試行回数
}

type QuestionType = 
  | 'multiple-choice'        // 択一
  | 'multiple-select'        // 複数選択
  | 'true-false'            // 正誤
  | 'short-answer'          // 短答
  | 'fill-in-blank'         // 穴埋め
  | 'ordering';             // 順序付け
```

### 8. StickyNote (付箋)

```typescript
interface StickyNote {
  id: string;                // UUID
  userId: string;
  sessionId: string;
  triggerNodeId: string;     // トリガーとなったノード
  prerequisiteConcept: Concept; // 前提となる概念
  reason: string;            // なぜ必要と判断したか
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  completedAt?: Date;
  relatedPath?: LearningPath; // 関連する学習パス
}
```

### 9. Concept (概念)

```typescript
interface Concept {
  id: string;                // UUID
  name: string;              // 概念名
  category: string;          // カテゴリー
  description: string;       // 説明
  difficulty: Difficulty;
  prerequisites: string[];   // 前提概念ID
  relatedConcepts: string[]; // 関連概念ID
  resources: Resource[];     // 学習リソース
}

interface Resource {
  type: 'article' | 'video' | 'exercise' | 'external';
  title: string;
  url?: string;
  description: string;
  estimatedMinutes: number;
}
```

## データ関係図

```
User
 ├── LearningSession[]
 │    └── TopicSession[]
 │         ├── LearningPath
 │         │    └── LearningNode[]
 │         │         ├── NodeContent
 │         │         └── Checkpoint
 │         │              └── CheckpointResult
 │         │                   └── QuizResult[]
 │         └── UnderstandingProfile
 │              ├── KnowledgeLevel[]
 │              ├── WeakPoint[]
 │              └── StrongPoint[]
 └── StickyNote[]
```

## インデックス戦略

### プライマリインデックス
- User.id
- LearningSession.id
- LearningPath.id
- LearningNode.id
- Checkpoint.id

### セカンダリインデックス
- LearningSession.userId
- TopicSession.subject
- LearningPath.topicId
- CheckpointResult.userId + timestamp
- StickyNote.userId + status

## データ保存形式

### ファイルベース（MVP）
```
~/.sensei-ai/
├── users/
│   └── {userId}/
│       ├── profile.json
│       └── preferences.json
├── sessions/
│   └── {userId}/
│       └── {sessionId}/
│           ├── metadata.json
│           └── topics/
│               └── {topicId}.json
├── paths/
│   └── {pathId}.json
├── checkpoints/
│   └── {userId}/
│       └── {checkpointId}.json
└── content/
    └── {nodeId}/
        ├── content.md
        └── metadata.json
```

### データベース移行時
- PostgreSQL: リレーショナルデータ（User, Session, Path等）
- MongoDB: ドキュメント型データ（Content, Profile等）
- Redis: キャッシュ（頻繁にアクセスされるProfile, 現在のSession）