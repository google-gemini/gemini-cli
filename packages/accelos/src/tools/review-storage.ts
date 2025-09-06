import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { defaultConfig, getCompatiblePaths } from '../config.js';

// Review assessment schema
export const ReviewAssessmentSchema = z.object({
  id: z.string(),
  type: z.enum(['production-review', 'code-quality', 'security', 'performance']),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.object({
    reviewer: z.string().optional(),
    version: z.string().optional(),
    targetComponent: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }),
  assessment: z.object({
    score: z.number().min(0).max(100),
    findings: z.array(z.object({
      category: z.string(),
      issue: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      recommendation: z.string(),
      resolved: z.boolean().default(false),
    })),
    recommendations: z.array(z.string()),
    blockers: z.array(z.string()),
    summary: z.string(),
  }),
});

export type ReviewAssessment = z.infer<typeof ReviewAssessmentSchema>;

export const reviewStorageTool = createTool({
  id: 'store-review',
  description: 'Store a production-review agent assessment to the data/reviews directory',
  inputSchema: z.object({
    assessment: ReviewAssessmentSchema.omit({ id: true, createdAt: true, updatedAt: true }),
    generateId: z.boolean().default(true).describe('Automatically generate an ID if not provided'),
    overwrite: z.boolean().default(false).describe('Overwrite existing review if ID exists'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reviewId: z.string().optional(),
    filePath: z.string().optional(),
    message: z.string(),
    stats: z.object({
      totalReviews: z.number(),
      byType: z.record(z.number()),
      bySeverity: z.record(z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const { assessment, generateId, overwrite } = context;
    const reviewsDir = getCompatiblePaths(defaultConfig).reviewsDirectory;

    try {
      // Ensure reviews directory exists
      await fs.mkdir(reviewsDir, { recursive: true });

      // Generate ID if needed
      const reviewId = generateId ? 
        `REVIEW-${new Date().toISOString().split('T')[0]}-${Date.now()}` : 
        `REVIEW-${Date.now()}`;

      // Create full assessment with timestamps
      const fullAssessment: ReviewAssessment = {
        ...assessment,
        id: reviewId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Validate the full assessment
      const validatedAssessment = ReviewAssessmentSchema.parse(fullAssessment);

      // Create file path
      const fileName = `${reviewId}.json`;
      const filePath = path.join(reviewsDir, fileName);

      // Check if file exists and overwrite setting
      try {
        await fs.access(filePath);
        if (!overwrite) {
          throw new Error(`Review ${reviewId} already exists. Use overwrite=true to replace it.`);
        }
      } catch (error) {
        // File doesn't exist, which is fine for new reviews
        if (error instanceof Error && !error.message?.includes('ENOENT')) {
          throw error;
        }
      }

      // Write the review to file
      await fs.writeFile(filePath, JSON.stringify(validatedAssessment, null, 2), 'utf-8');

      // Generate stats
      const stats = await generateReviewStats(reviewsDir);

      return {
        success: true,
        reviewId,
        filePath,
        message: `Successfully stored review ${reviewId} in ${filePath}`,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to store review: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: { totalReviews: 0, byType: {}, bySeverity: {} },
      };
    }
  },
});

// Helper function to generate review statistics
async function generateReviewStats(reviewsDir: string): Promise<{
  totalReviews: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}> {
  const stats = {
    totalReviews: 0,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
  };

  try {
    const files = await fs.readdir(reviewsDir);
    const reviewFiles = files.filter(file => file.endsWith('.json'));

    for (const file of reviewFiles) {
      try {
        const filePath = path.join(reviewsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const review = JSON.parse(content) as ReviewAssessment;

        stats.totalReviews++;
        
        // Count by type
        stats.byType[review.type] = (stats.byType[review.type] || 0) + 1;
        
        // Count by severity (using metadata severity if available)
        if (review.metadata.severity) {
          stats.bySeverity[review.metadata.severity] = (stats.bySeverity[review.metadata.severity] || 0) + 1;
        }
      } catch (fileError) {
        console.warn(`Failed to process review file ${file}:`, fileError);
      }
    }
  } catch (error) {
    console.warn('Failed to generate review stats:', error);
  }

  return stats;
}