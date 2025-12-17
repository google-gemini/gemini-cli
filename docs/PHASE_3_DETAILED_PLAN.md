# 阶段 3: 工作区与沙箱系统 - 详细执行方案

## 📋 概览

**阶段目标**: 实现 Docker 沙箱隔离和完整的文件存储系统
**持续时间**: 2 周 (10 个工作日)  
**关键产出**: 工作区管理系统 + Docker 沙箱 + 文件存储服务 + 安全测试报告

---

## 🗓️ 时间规划

| 任务模块 | 天数 | 负责人 | 依赖 |
|---------|------|--------|------|
| 3.1 工作区服务 | 3 天 | 后端 #1 | 阶段 1, 2 完成 |
| 3.2 Docker 容器管理 | 5 天 | DevOps + 后端 #2 | 3.1 完成 |
| 3.3 文件存储服务 | 3 天 | 后端 #1 | 3.2 Day 2 完成 |
| 3.4 安全与权限 | 3 天 | 后端 #1 + #2 | 3.2, 3.3 完成 |
| 3.5 集成测试 | 2 天 | 后端 #1 + #2 | 3.1-3.4 完成 |

**注意**: 3.2 和 3.3 的后半部分可以并行

---

## 📦 任务 3.1: 工作区服务 (3 天)

### 目标
实现完整的工作区 CRUD 操作和生命周期管理。

### 详细步骤

#### Day 1: WorkspaceService 实现

**步骤 1.1: 创建 Workspace Repository** (1.5 小时)

创建 `packages/backend/src/repositories/workspace.repository.ts`:

```typescript
import { Workspace, Prisma, WorkspaceStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { prisma } from '../utils/prisma.js';

export class WorkspaceRepository extends BaseRepository<
  Workspace,
  Prisma.WorkspaceCreateInput,
  Prisma.WorkspaceUpdateInput,
  Prisma.WorkspaceWhereInput,
  Prisma.WorkspaceWhereUniqueInput
> {
  constructor() {
    super(prisma, 'Workspace');
  }

  async create(data: Prisma.WorkspaceCreateInput): Promise<Workspace> {
    return prisma.workspace.create({ data });
  }

  async findUnique(
    where: Prisma.WorkspaceWhereUniqueInput
  ): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where });
  }

  async findMany(params: {
    where?: Prisma.WorkspaceWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.WorkspaceOrderByWithRelationInput;
  }): Promise<Workspace[]> {
    return prisma.workspace.findMany(params);
  }

  async update(
    where: Prisma.WorkspaceWhereUniqueInput,
    data: Prisma.WorkspaceUpdateInput
  ): Promise<Workspace> {
    return prisma.workspace.update({ where, data });
  }

  async delete(where: Prisma.WorkspaceWhereUniqueInput): Promise<Workspace> {
    return prisma.workspace.delete({ where });
  }

  async count(where?: Prisma.WorkspaceWhereInput): Promise<number> {
    return prisma.workspace.count({ where });
  }

  /**
   * 查找用户的工作区
   */
  async findByUserId(
    userId: string,
    status?: WorkspaceStatus
  ): Promise<Workspace[]> {
    return prisma.workspace.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * 通过容器 ID 查找工作区
   */
  async findByContainerId(containerId: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({
      where: { containerId },
    });
  }

  /**
   * 更新最后使用时间
   */
  async updateLastUsedAt(workspaceId: string): Promise<Workspace> {
    return this.update(
      { id: workspaceId },
      { lastUsedAt: new Date() }
    );
  }

  /**
   * 软删除工作区
   */
  async softDelete(workspaceId: string): Promise<Workspace> {
    return this.update(
      { id: workspaceId },
      { status: WorkspaceStatus.DELETED }
    );
  }
}

// 导出单例
export const workspaceRepository = new WorkspaceRepository();
```

**步骤 1.2: 创建 WorkspaceService** (3 小时)

创建 `packages/backend/src/services/workspace.service.ts`:

```typescript
import { Workspace, WorkspaceStatus } from '@prisma/client';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../types/errors.js';
import logger from '../utils/logger.js';

export interface CreateWorkspaceDto {
  name: string;
  description?: string;
  config?: Record<string, any>;
}

export interface UpdateWorkspaceDto {
  name?: string;
  description?: string;
  config?: Record<string, any>;
}

export class WorkspaceService {
  /**
   * 创建工作区
   */
  async createWorkspace(
    userId: string,
    dto: CreateWorkspaceDto
  ): Promise<Workspace> {
    // 检查用户的工作区数量限制
    const existingCount = await workspaceRepository.count({
      userId,
      status: WorkspaceStatus.ACTIVE,
    });

    if (existingCount >= 10) {
      throw new BadRequestError(
        'Maximum number of workspaces reached (10)'
      );
    }

    // 创建工作区
    const workspace = await workspaceRepository.create({
      user: { connect: { id: userId } },
      name: dto.name,
      description: dto.description,
      config: dto.config || {},
      status: WorkspaceStatus.ACTIVE,
    });

    logger.info('Workspace created', {
      workspaceId: workspace.id,
      userId,
      name: workspace.name,
    });

    return workspace;
  }

  /**
   * 获取工作区
   */
  async getWorkspace(workspaceId: string, userId: string): Promise<Workspace> {
    const workspace = await workspaceRepository.findUnique({
      id: workspaceId,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied to this workspace');
    }

    if (workspace.status === WorkspaceStatus.DELETED) {
      throw new NotFoundError('Workspace has been deleted');
    }

    return workspace;
  }

  /**
   * 列出用户的工作区
   */
  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    return workspaceRepository.findByUserId(userId, WorkspaceStatus.ACTIVE);
  }

  /**
   * 更新工作区
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    dto: UpdateWorkspaceDto
  ): Promise<Workspace> {
    // 验证所有权
    await this.getWorkspace(workspaceId, userId);

    const workspace = await workspaceRepository.update(
      { id: workspaceId },
      dto
    );

    logger.info('Workspace updated', { workspaceId, userId });

    return workspace;
  }

  /**
   * 删除工作区（软删除）
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    // 验证所有权
    const workspace = await this.getWorkspace(workspaceId, userId);

    // 软删除
    await workspaceRepository.softDelete(workspaceId);

    // TODO: 清理相关资源（容器、文件等）

    logger.info('Workspace deleted', { workspaceId, userId });
  }

  /**
   * 启动工作区
   */
  async startWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId, userId);

    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new BadRequestError('Workspace is not in ACTIVE status');
    }

    // TODO: 启动 Docker 容器
    // TODO: 同步文件到容器

    // 更新最后使用时间
    await workspaceRepository.updateLastUsedAt(workspaceId);

    logger.info('Workspace started', { workspaceId, userId });
  }

  /**
   * 停止工作区
   */
  async stopWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId, userId);

    // TODO: 同步文件from容器
    // TODO: 停止 Docker 容器

    logger.info('Workspace stopped', { workspaceId, userId });
  }
}

// 导出单例
export const workspaceService = new WorkspaceService();
```

**步骤 1.3: 创建 Workspace API 路由** (1.5 小时)

创建 `packages/backend/src/api/workspace/routes.ts`:

```typescript
import { Router } from 'express';
import { workspaceService } from '../../services/workspace.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { ResponseHelper } from '../../utils/response.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// Schema 定义
const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    config: z.record(z.any()).optional(),
  }),
});

const updateWorkspaceSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    config: z.record(z.any()).optional(),
  }),
});

/**
 * POST /api/workspaces
 * 创建工作区
 */
router.post(
  '/',
  validate(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const workspace = await workspaceService.createWorkspace(userId, req.body);

    return ResponseHelper.created(res, workspace);
  })
);

/**
 * GET /api/workspaces
 * 列出用户的工作区
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const workspaces = await workspaceService.listUserWorkspaces(userId);

    return ResponseHelper.success(res, workspaces);
  })
);

/**
 * GET /api/workspaces/:workspaceId
 * 获取工作区详情
 */
router.get(
  '/:workspaceId',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    const workspace = await workspaceService.getWorkspace(workspaceId, userId);

    return ResponseHelper.success(res, workspace);
  })
);

/**
 * PUT /api/workspaces/:workspaceId
 * 更新工作区
 */
router.put(
  '/:workspaceId',
  validate(updateWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    const workspace = await workspaceService.updateWorkspace(
      workspaceId,
      userId,
      req.body
    );

    return ResponseHelper.success(res, workspace);
  })
);

/**
 * DELETE /api/workspaces/:workspaceId
 * 删除工作区
 */
router.delete(
  '/:workspaceId',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    await workspaceService.deleteWorkspace(workspaceId, userId);

    return ResponseHelper.noContent(res);
  })
);

/**
 * POST /api/workspaces/:workspaceId/start
 * 启动工作区
 */
router.post(
  '/:workspaceId/start',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    await workspaceService.startWorkspace(workspaceId, userId);

    return ResponseHelper.success(res, { message: 'Workspace started' });
  })
);

/**
 * POST /api/workspaces/:workspaceId/stop
 * 停止工作区
 */
router.post(
  '/:workspaceId/stop',
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    await workspaceService.stopWorkspace(workspaceId, userId);

    return ResponseHelper.success(res, { message: 'Workspace stopped' });
  })
);

export default router;
```

挂载路由到 `app.ts`:

```typescript
import workspaceRoutes from './api/workspace/routes.js';

app.use('/api/workspaces', workspaceRoutes);
```

**验证清单 Day 1**:
- [ ] Workspace Repository 实现完成
- [ ] WorkspaceService 创建成功
- [ ] Workspace API 路由实现
- [ ] 路由挂载成功
- [ ] 可以创建和查询工作区

---

#### Day 2-3: 测试和完善

**步骤 2.1: 创建 Workspace 测试** (3 小时)

创建 `packages/backend/tests/integration/workspace-api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestUser, generateAccessToken } from '../helpers.js';
import { Express } from 'express';
import { prisma } from '../../src/utils/prisma.js';

describe('Workspace API', () => {
  let app: Express;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();

    const user = await createTestUser();
    userId = user.id;
    accessToken = generateAccessToken(userId, user.email);
  });

  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { userId } });
  });

  describe('POST /api/workspaces', () => {
    it('should create new workspace', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Workspace',
          description: 'Test Description',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Workspace');
    });

    it('should enforce workspace limit', async () => {
      // 创建 10 个工作区
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/workspaces')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: `Workspace ${i}` });
      }

      // 尝试创建第 11 个
      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Workspace 11' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Maximum');
    });
  });

  describe('GET /api/workspaces', () => {
    it('should list user workspaces', async () => {
      // 创建几个工作区
      await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Workspace 1' });

      await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Workspace 2' });

      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });

  describe('PUT /api/workspaces/:workspaceId', () => {
    it('should update workspace', async () => {
      // 创建工作区
      const createResponse = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Original Name' });

      const workspaceId = createResponse.body.data.id;

      // 更新工作区
      const response = await request(app)
        .put(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
    });
  });

  describe('DELETE /api/workspaces/:workspaceId', () => {
    it('should delete workspace', async () => {
      // 创建工作区
      const createResponse = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'To Delete' });

      const workspaceId = createResponse.body.data.id;

      // 删除工作区
      const response = await request(app)
        .delete(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(204);

      // 验证已删除
      const getResponse = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });
  });
});
```

运行测试:

```bash
pnpm test workspace-api
```

**验证清单 Day 2-3**:
- [ ] 所有测试通过
- [ ] 工作区 CRUD 功能完整
- [ ] 权限验证正常
- [ ] 错误处理完善

---

继续阅读此文档以获取 Docker 容器管理、文件存储等完整实现...

