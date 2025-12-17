# 阶段 1: 核心基础设施 - 详细执行方案

## 📋 概览

**阶段目标**: 搭建完整的后端基础框架，实现认证系统和基础 API
**持续时间**: 2 周 (10 个工作日)
**关键产出**: 可运行的后端服务 + 认证系统 + 数据库 + API 文档

---

## 🗓️ 时间规划

| 任务模块 | 天数 | 负责人 | 依赖 |
|---------|------|--------|------|
| 1.1 后端框架搭建 | 3 天 | 后端 #1 | 阶段 0 完成 |
| 1.2 数据库设计与实现 | 4 天 | 后端 #2 | 阶段 0 完成 |
| 1.3 认证授权系统 | 4 天 | 后端 #1 + #2 | 1.1, 1.2 完成 |
| 1.4 基础 API 实现 | 3 天 | 后端 #1 | 1.1, 1.2 完成 |
| 1.5 单元测试 | 2 天 | 后端 #1 + #2 | 1.1-1.4 完成 |

**注意**: 1.1 和 1.2 可以并行进行

---

## 🚀 任务 1.1: 后端框架搭建 (3 天)

### 目标
建立完整的 Express/Fastify 后端框架，包含路由、中间件、错误处理等核心功能。

### 详细步骤

#### Day 1: Express 基础架构

**步骤 1.1: 初始化 Backend 包** (1 小时)

```bash
cd packages/backend

# 初始化 package.json（如果还没有）
cat > package.json << 'EOF'
{
  "name": "@gemini-web/backend",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "dev:debug": "tsx watch --inspect src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.1.5",
    "dotenv": "^16.4.1",
    "zod": "^3.22.4",
    "winston": "^3.11.0",
    "@prisma/client": "^5.8.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/compression": "^1.7.5",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "supertest": "^6.3.3",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.8.0"
  }
}
EOF

# 安装依赖
pnpm install
```

**步骤 1.2: 创建项目结构** (30 分钟)

```bash
# 创建目录结构
mkdir -p src/{api,middleware,services,utils,config,types}
mkdir -p src/api/{auth,chat,workspace,tools,admin}
mkdir -p tests/{unit,integration}

# 创建基础文件
touch src/server.ts
touch src/app.ts
touch src/config/index.ts
touch src/config/env.ts
touch src/middleware/errorHandler.ts
touch src/middleware/logger.ts
touch src/utils/logger.ts
touch src/types/express.d.ts
```

**步骤 1.3: 配置环境变量管理** (45 分钟)

创建 `src/config/env.ts`:

```typescript
import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

// 环境变量 Schema
const envSchema = z.object({
  // Node 环境
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 服务器配置
  BACKEND_PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('3000'),
  BACKEND_HOST: z.string().default('localhost'),

  // 数据库
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // MinIO
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.string().transform(Number).pipe(z.number().int().positive()),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string(),
  MINIO_USE_SSL: z.string().transform(val => val === 'true').default('false'),

  // Gemini API
  GEMINI_API_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate Limiting
  RATE_LIMIT_WINDOW: z.string().default('15m'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().int()).default('100'),

  // 日志
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Docker
  DOCKER_HOST: z.string().default('unix:///var/run/docker.sock'),
  SANDBOX_IMAGE: z.string().default('gemini-sandbox:latest'),
  SANDBOX_MEMORY_LIMIT: z.string().default('512m'),
  SANDBOX_CPU_LIMIT: z.string().transform(Number).pipe(z.number()).default('1'),
});

// 验证环境变量
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ 环境变量验证失败:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();

// 类型导出
export type Env = z.infer<typeof envSchema>;
```

创建 `src/config/index.ts`:

```typescript
import { env } from './env.js';

export const config = {
  // 服务器
  server: {
    port: env.BACKEND_PORT,
    host: env.BACKEND_HOST,
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  // 数据库
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
  },

  // MinIO
  minio: {
    endpoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    bucket: env.MINIO_BUCKET,
    useSSL: env.MINIO_USE_SSL,
  },

  // Gemini
  gemini: {
    apiKey: env.GEMINI_API_KEY,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  // OAuth
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_CALLBACK_URL,
    },
  },

  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseDuration(env.RATE_LIMIT_WINDOW),
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  // 日志
  logging: {
    level: env.LOG_LEVEL,
  },

  // Docker
  docker: {
    host: env.DOCKER_HOST,
    sandboxImage: env.SANDBOX_IMAGE,
    sandboxMemoryLimit: env.SANDBOX_MEMORY_LIMIT,
    sandboxCpuLimit: env.SANDBOX_CPU_LIMIT,
  },
} as const;

// 辅助函数：解析时间字符串
function parseDuration(duration: string): number {
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const [, value, unit] = match;
  return parseInt(value) * units[unit];
}

export { env };
```

**步骤 1.4: 创建 Logger** (45 分钟)

创建 `src/utils/logger.ts`:

```typescript
import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// 自定义日志格式（开发环境）
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  // 添加元数据
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  log += metaStr;

  // 添加堆栈信息
  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// 创建 logger 实例
export const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  defaultMeta: { service: 'gemini-web-backend' },
  transports: [],
});

// 根据环境添加不同的 transport
if (config.server.isDevelopment) {
  // 开发环境：彩色控制台输出
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), devFormat),
    })
  );
} else {
  // 生产环境：JSON 格式
  logger.add(
    new winston.transports.Console({
      format: json(),
    })
  );

  // 生产环境：文件输出
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: json(),
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: json(),
    })
  );
}

// 测试环境：静默
if (config.server.isTest) {
  logger.transports.forEach((t) => (t.silent = true));
}

export default logger;
```

**步骤 1.5: 创建错误处理中间件** (1 小时)

创建 `src/types/errors.ts`:

```typescript
// 自定义错误类型
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad Request') {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not Found') {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(409, message);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation Error',
    public errors?: any
  ) {
    super(422, message);
    this.errors = errors;
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal Server Error') {
    super(500, message, false);
  }
}
```

创建 `src/middleware/errorHandler.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 记录错误
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // 处理不同类型的错误
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        ...(err instanceof ValidationError && { errors: err.errors }),
      },
    });
  }

  // Zod 验证错误
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation Error',
        errors: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // Prisma 错误
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // 唯一约束冲突
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          message: 'Resource already exists',
          field: (err.meta?.target as string[])?.join(', '),
        },
      });
    }

    // 记录未找到
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Resource not found',
        },
      });
    }
  }

  // 默认错误处理
  const statusCode = 500;
  const message = config.server.isDevelopment
    ? err.message
    : 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(config.server.isDevelopment && { stack: err.stack }),
    },
  });
}

// 404 处理
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
}

// 异步错误包装器
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**验证清单 Day 1**:
- [ ] Backend package.json 创建成功
- [ ] 依赖安装完成
- [ ] 项目结构创建完整
- [ ] 环境变量验证工作正常
- [ ] Logger 正常输出
- [ ] 错误类型定义完整

---

#### Day 2: 中间件和路由系统

**步骤 2.1: 创建请求日志中间件** (45 分钟)

创建 `src/middleware/requestLogger.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // 响应完成时记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
```

**步骤 2.2: 创建验证中间件** (1 小时)

创建 `src/middleware/validate.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../types/errors.js';

export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // 验证 body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // 验证 query
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      // 验证 params
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError(
            'Validation failed',
            error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            }))
          )
        );
      } else {
        next(error);
      }
    }
  };
}
```

**步骤 2.3: 创建 Express 应用** (1.5 小时)

创建 `src/app.ts`:

```typescript
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

// 导入路由（稍后创建）
// import authRoutes from './api/auth/routes.js';
// import chatRoutes from './api/chat/routes.js';
// import workspaceRoutes from './api/workspace/routes.js';

export function createApp(): Express {
  const app = express();

  // ==================
  // 基础中间件
  // ==================

  // 安全头
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.cors.origin.split(','),
      credentials: true,
    })
  );

  // Body 解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 压缩
  app.use(compression());

  // 请求日志
  app.use(requestLogger);

  // 限流
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: {
        message: 'Too many requests, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // ==================
  // 健康检查
  // ==================

  app.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  });

  // ==================
  // API 路由
  // ==================

  // TODO: 挂载路由
  // app.use('/api/auth', authRoutes);
  // app.use('/api/chat', chatRoutes);
  // app.use('/api/workspaces', workspaceRoutes);

  // API 根路径
  app.get('/api', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Gemini Web Platform API',
        version: '0.1.0',
        docs: '/api/docs',
      },
    });
  });

  // ==================
  // 错误处理
  // ==================

  // 404 处理
  app.use(notFoundHandler);

  // 全局错误处理
  app.use(errorHandler);

  return app;
}
```

创建 `src/server.ts`:

```typescript
import { createApp } from './app.js';
import { config } from './config/index.js';
import logger from './utils/logger.js';
import { prisma } from './utils/prisma.js';

async function startServer() {
  try {
    // 创建 Express 应用
    const app = createApp();

    // 测试数据库连接
    logger.info('Testing database connection...');
    await prisma.$connect();
    logger.info('✓ Database connected');

    // 启动服务器
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `🚀 Server running on http://${config.server.host}:${config.server.port}`
      );
      logger.info(`📝 Environment: ${config.server.env}`);
      logger.info(`📊 Log level: ${config.logging.level}`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        // 关闭数据库连接
        await prisma.$disconnect();
        logger.info('Database disconnected');

        process.exit(0);
      });

      // 强制关闭超时
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();
```

创建 `src/utils/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// 日志处理
prisma.$on('query', (e) => {
  logger.debug('Query:', { sql: e.query, duration: `${e.duration}ms` });
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning:', e);
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
```

**步骤 2.4: 测试服务器** (45 分钟)

```bash
# 确保数据库和 Redis 正在运行
cd ../../infrastructure/docker
docker-compose up -d

# 返回 backend 目录
cd ../../packages/backend

# 启动开发服务器
pnpm dev
```

测试端点:

```bash
# 测试健康检查
curl http://localhost:3000/health

# 测试 API 根路径
curl http://localhost:3000/api

# 测试 404
curl http://localhost:3000/not-found

# 测试限流（发送 100+ 请求）
for i in {1..101}; do curl http://localhost:3000/api; done
```

**验证清单 Day 2**:
- [ ] 中间件创建完整
- [ ] Express 应用正常启动
- [ ] 健康检查端点工作
- [ ] 错误处理正常
- [ ] 请求日志输出
- [ ] 限流功能生效
- [ ] 数据库连接成功

---

#### Day 3: API 响应规范和工具函数

**步骤 3.1: 创建响应工具** (1 小时)

创建 `src/utils/response.ts`:

```typescript
import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    errors?: any[];
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export class ResponseHelper {
  /**
   * 成功响应
   */
  static success<T>(res: Response, data: T, statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      data,
    } as ApiResponse<T>);
  }

  /**
   * 分页响应
   */
  static paginated<T>(
    res: Response,
    data: T[],
    meta: { page: number; limit: number; total: number }
  ): Response {
    return res.status(200).json({
      success: true,
      data,
      meta: {
        ...meta,
        totalPages: Math.ceil(meta.total / meta.limit),
      },
    } as ApiResponse<T[]>);
  }

  /**
   * 创建成功响应
   */
  static created<T>(res: Response, data: T): Response {
    return ResponseHelper.success(res, data, 201);
  }

  /**
   * 无内容响应
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /**
   * 错误响应
   */
  static error(
    res: Response,
    message: string,
    statusCode = 500,
    errors?: any[]
  ): Response {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        ...(errors && { errors }),
      },
    } as ApiResponse);
  }
}
```

**步骤 3.2: 创建分页工具** (45 分钟)

创建 `src/utils/pagination.ts`:

```typescript
import { z } from 'zod';

// 分页查询 Schema
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface PaginationParams {
  skip: number;
  take: number;
  orderBy?: any;
}

/**
 * 将分页查询转换为 Prisma 参数
 */
export function getPaginationParams(
  query: PaginationQuery,
  allowedSortFields: string[] = []
): PaginationParams {
  const { page, limit, sortBy, sortOrder } = query;

  const params: PaginationParams = {
    skip: (page - 1) * limit,
    take: limit,
  };

  // 排序
  if (sortBy && allowedSortFields.includes(sortBy)) {
    params.orderBy = {
      [sortBy]: sortOrder,
    };
  }

  return params;
}

/**
 * 创建分页元数据
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
```

**步骤 3.3: 创建通用工具函数** (1 小时)

创建 `src/utils/crypto.ts`:

```typescript
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 验证密码
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 生成随机令牌
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 生成随机代码（数字）
 */
export function generateCode(length: number = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}
```

安装依赖:

```bash
pnpm add bcrypt
pnpm add -D @types/bcrypt
```

创建 `src/utils/jwt.ts`:

```typescript
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../types/errors.js';

export interface JwtPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

/**
 * 生成访问令牌
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * 生成刷新令牌
 */
export function generateRefreshToken(userId: string, email: string): string {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

/**
 * 验证令牌
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * 生成令牌对
 */
export function generateTokenPair(userId: string, email: string) {
  return {
    accessToken: generateAccessToken(userId, email),
    refreshToken: generateRefreshToken(userId, email),
  };
}
```

安装依赖:

```bash
pnpm add jsonwebtoken
pnpm add -D @types/jsonwebtoken
```

**步骤 3.4: 创建测试工具** (1.5 小时)

创建 `tests/setup.ts`:

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../src/utils/prisma.js';

// 测试前清理数据库
beforeAll(async () => {
  // 清空所有表
  await prisma.toolExecution.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
});

// 每个测试后清理
afterEach(async () => {
  await prisma.toolExecution.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
});

// 测试后断开连接
afterAll(async () => {
  await prisma.$disconnect();
});
```

创建 `tests/helpers.ts`:

```typescript
import { User, Workspace, ChatSession } from '@prisma/client';
import { prisma } from '../src/utils/prisma.js';
import { hashPassword } from '../src/utils/crypto.js';

/**
 * 创建测试用户
 */
export async function createTestUser(
  overrides: Partial<User> = {}
): Promise<User> {
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    username: `testuser-${Date.now()}`,
    passwordHash: await hashPassword('password123'),
  };

  return prisma.user.create({
    data: {
      ...defaultUser,
      ...overrides,
    },
  });
}

/**
 * 创建测试工作区
 */
export async function createTestWorkspace(
  userId: string,
  overrides: Partial<Workspace> = {}
): Promise<Workspace> {
  const defaultWorkspace = {
    name: `Test Workspace ${Date.now()}`,
    description: 'Test workspace description',
    userId,
  };

  return prisma.workspace.create({
    data: {
      ...defaultWorkspace,
      ...overrides,
    },
  });
}

/**
 * 创建测试会话
 */
export async function createTestChatSession(
  userId: string,
  workspaceId: string,
  overrides: Partial<ChatSession> = {}
): Promise<ChatSession> {
  const defaultSession = {
    userId,
    workspaceId,
    title: 'Test Session',
  };

  return prisma.chatSession.create({
    data: {
      ...defaultSession,
      ...overrides,
    },
  });
}
```

创建第一个测试 `tests/unit/utils/crypto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  generateCode,
} from '../../../src/utils/crypto.js';

describe('Crypto Utils', () => {
  describe('hashPassword', () => {
    it('should hash password', async () => {
      const password = 'test123';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'test123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'test123';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test123';
      const hash = await hashPassword(password);
      const result = await verifyPassword('wrong', hash);

      expect(result).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate token with default length', () => {
      const token = generateToken();

      expect(token).toBeTruthy();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate token with custom length', () => {
      const token = generateToken(16);

      expect(token).toBeTruthy();
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should generate different tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('generateCode', () => {
    it('should generate 6-digit code by default', () => {
      const code = generateCode();

      expect(code).toBeTruthy();
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('should generate code with custom length', () => {
      const code = generateCode(4);

      expect(code).toBeTruthy();
      expect(code.length).toBe(4);
      expect(/^\d{4}$/.test(code)).toBe(true);
    });
  });
});
```

运行测试:

```bash
pnpm test
```

**验证清单 Day 3**:
- [ ] 响应工具创建完成
- [ ] 分页工具正常工作
- [ ] 加密工具测试通过
- [ ] JWT 工具创建完成
- [ ] 测试框架配置成功
- [ ] 第一个测试通过

---

## 🗄️ 任务 1.2: 数据库设计与实现 (4 天)

### 目标
设计完整的数据库 Schema，实现 Repository 层和数据访问模式。

### 详细步骤

#### Day 4: Prisma Schema 完善

**步骤 4.1: 完善 Prisma Schema** (2 小时)

更新 `packages/backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================
// 用户相关
// ==================

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  username      String   @unique
  passwordHash  String?  @map("password_hash")

  // OAuth 登录
  oauthProvider String?  @map("oauth_provider")
  oauthId       String?  @map("oauth_id")

  // 个人信息
  displayName   String?  @map("display_name")
  avatar        String?

  // Gemini API Key (加密存储)
  geminiApiKey  String?  @map("gemini_api_key")

  // 账户状态
  isActive      Boolean  @default(true) @map("is_active")
  isVerified    Boolean  @default(false) @map("is_verified")

  // 时间戳
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  lastLoginAt   DateTime? @map("last_login_at")

  // 关系
  workspaces    Workspace[]
  chatSessions  ChatSession[]
  refreshTokens RefreshToken[]

  @@index([email])
  @@index([oauthProvider, oauthId])
  @@map("users")
}

// Refresh Token 表
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
  @@map("refresh_tokens")
}

// ==================
// 工作区相关
// ==================

model Workspace {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")

  // 基本信息
  name        String
  description String?

  // 容器信息
  containerId String?  @unique @map("container_id")
  storagePath String?  @map("storage_path")

  // 状态
  status      WorkspaceStatus @default(ACTIVE)

  // 配置
  config      Json?    // 工作区配置（环境变量、工具策略等）

  // 时间戳
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  lastUsedAt  DateTime? @map("last_used_at")

  // 关系
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatSessions ChatSession[]

  @@index([userId])
  @@index([status])
  @@map("workspaces")
}

enum WorkspaceStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

// ==================
// 聊天相关
// ==================

model ChatSession {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  userId      String   @map("user_id")

  // 基本信息
  title       String?

  // 模型配置
  model       String   @default("gemini-2.0-flash-exp")
  modelConfig Json?    @map("model_config") // temperature, topP 等

  // 状态
  status      ChatSessionStatus @default(ACTIVE)

  // 统计
  messageCount Int     @default(0) @map("message_count")
  totalTokens  Int     @default(0) @map("total_tokens")

  // 时间戳
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // 关系
  workspace      Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages       Message[]
  toolExecutions ToolExecution[]

  @@index([workspaceId])
  @@index([userId])
  @@index([status])
  @@map("chat_sessions")
}

enum ChatSessionStatus {
  ACTIVE
  ARCHIVED
  DELETED
}

model Message {
  id        String   @id @default(uuid())
  sessionId String   @map("session_id")

  // 消息内容
  role      MessageRole
  content   Json     // Gemini API 的 Content 格式

  // 元数据
  metadata  Json?    // token 数量、延迟等

  // 时间戳
  createdAt DateTime @default(now()) @map("created_at")

  // 关系
  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([createdAt])
  @@map("messages")
}

enum MessageRole {
  USER
  MODEL
  TOOL
}

// ==================
// 工具执行相关
// ==================

model ToolExecution {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")

  // 工具信息
  toolName   String   @map("tool_name")
  params     Json
  result     Json?

  // 状态
  status     ToolExecutionStatus @default(PENDING)
  error      String?  // 错误信息

  // 性能
  durationMs Int?     @map("duration_ms")

  // 时间戳
  createdAt  DateTime @default(now()) @map("created_at")
  completedAt DateTime? @map("completed_at")

  // 关系
  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([toolName])
  @@index([status])
  @@map("tool_executions")
}

enum ToolExecutionStatus {
  PENDING
  EXECUTING
  SUCCESS
  ERROR
  CANCELLED
}

// ==================
// 系统配置相关
// ==================

model SystemConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("system_configs")
}
```

运行迁移:

```bash
pnpm prisma migrate dev --name complete_schema
pnpm prisma generate
```

**步骤 4.2: 创建 Repository 基类** (1.5 小时)

创建 `src/repositories/base.repository.ts`:

```typescript
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

export abstract class BaseRepository<
  T,
  CreateInput,
  UpdateInput,
  WhereInput,
  WhereUniqueInput
> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly modelName: Prisma.ModelName
  ) {}

  /**
   * 创建记录
   */
  abstract create(data: CreateInput): Promise<T>;

  /**
   * 查找唯一记录
   */
  abstract findUnique(where: WhereUniqueInput): Promise<T | null>;

  /**
   * 查找多条记录
   */
  abstract findMany(params: {
    where?: WhereInput;
    skip?: number;
    take?: number;
    orderBy?: any;
  }): Promise<T[]>;

  /**
   * 更新记录
   */
  abstract update(
    where: WhereUniqueInput,
    data: UpdateInput
  ): Promise<T>;

  /**
   * 删除记录
   */
  abstract delete(where: WhereUniqueInput): Promise<T>;

  /**
   * 计数
   */
  abstract count(where?: WhereInput): Promise<number>;

  /**
   * 检查是否存在
   */
  async exists(where: WhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }
}
```

**步骤 4.3: 创建 User Repository** (1.5 小时)

创建 `src/repositories/user.repository.ts`:

```typescript
import { User, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { prisma } from '../utils/prisma.js';

export class UserRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput,
  Prisma.UserWhereUniqueInput
> {
  constructor() {
    super(prisma, 'User');
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async findUnique(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return prisma.user.findUnique({ where });
  }

  async findMany(params: {
    where?: Prisma.UserWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    return prisma.user.findMany(params);
  }

  async update(
    where: Prisma.UserWhereUniqueInput,
    data: Prisma.UserUpdateInput
  ): Promise<User> {
    return prisma.user.update({ where, data });
  }

  async delete(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return prisma.user.delete({ where });
  }

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  }

  /**
   * 通过邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findUnique({ email });
  }

  /**
   * 通过用户名查找用户
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.findUnique({ username });
  }

  /**
   * 通过 OAuth 查找用户
   */
  async findByOAuth(
    provider: string,
    oauthId: string
  ): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        oauthProvider: provider,
        oauthId,
      },
    });
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(userId: string): Promise<User> {
    return this.update(
      { id: userId },
      { lastLoginAt: new Date() }
    );
  }

  /**
   * 检查邮箱是否已存在
   */
  async emailExists(email: string): Promise<boolean> {
    return this.exists({ email });
  }

  /**
   * 检查用户名是否已存在
   */
  async usernameExists(username: string): Promise<boolean> {
    return this.exists({ username });
  }
}

// 导出单例
export const userRepository = new UserRepository();
```

由于响应长度限制，我会继续在下一个文件中完成剩余内容。让我先提交这部分。

