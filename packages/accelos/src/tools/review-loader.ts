import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { ReviewAssessmentSchema, type ReviewAssessment } from './review-storage.js';

export const reviewLoaderTool = createTool({
  id: 'load-reviews',
  description: 'Load production-review agent assessments from the data/reviews directory with filtering and pagination',
  inputSchema: z.object({
    type: z.enum(['production-review', 'code-quality', 'security', 'performance']).optional()
      .describe('Filter by review type'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
      .describe('Filter by severity level'),
    dateFrom: z.string().optional()
      .describe('Filter reviews created after this date (ISO format)'),
    dateTo: z.string().optional()
      .describe('Filter reviews created before this date (ISO format)'),
    page: z.number().default(1).describe('Page number for pagination (starting from 1)'),
    pageSize: z.number().default(10).describe('Number of reviews per page'),
    includeContent: z.boolean().default(true)
      .describe('Include full assessment content or just metadata'),
    sortBy: z.enum(['createdAt', 'updatedAt', 'score', 'type']).default('createdAt')
      .describe('Field to sort by'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
      .describe('Sort order'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reviews: z.array(ReviewAssessmentSchema.partial({ assessment: true })),
    pagination: z.object({
      currentPage: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
      totalReviews: z.number(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    }),
    filters: z.object({
      type: z.string().optional(),
      severity: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }),
    stats: z.object({
      totalReviews: z.number(),
      byType: z.record(z.number()),
      bySeverity: z.record(z.number()),
      averageScore: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const {
      type,
      severity,
      dateFrom,
      dateTo,
      page,
      pageSize,
      includeContent,
      sortBy,
      sortOrder,
    } = context;

    const reviewsDir = getCompatiblePaths(defaultConfig).reviewsDirectory;

    try {
      // Check if reviews directory exists
      try {
        await fs.access(reviewsDir);
      } catch {
        // Directory doesn't exist, return empty results
        return {
          success: true,
          reviews: [],
          pagination: {
            currentPage: page,
            pageSize,
            totalPages: 0,
            totalReviews: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
          filters: { type, severity, dateFrom, dateTo },
          stats: { totalReviews: 0, byType: {}, bySeverity: {}, averageScore: 0 },
          message: 'Reviews directory not found. No reviews available.',
        };
      }

      // Load all review files
      const files = await fs.readdir(reviewsDir);
      const reviewFiles = files.filter(file => file.endsWith('.json'));
      
      const allReviews: ReviewAssessment[] = [];
      for (const file of reviewFiles) {
        try {
          const filePath = path.join(reviewsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const review = ReviewAssessmentSchema.parse(JSON.parse(content));
          allReviews.push(review);
        } catch (fileError) {
          console.warn(`Failed to load review file ${file}:`, fileError);
        }
      }

      // Apply filters
      let filteredReviews = allReviews.filter(review => {
        // Type filter
        if (type && review.type !== type) return false;
        
        // Severity filter
        if (severity && review.metadata.severity !== severity) return false;
        
        // Date filters
        if (dateFrom && new Date(review.createdAt) < new Date(dateFrom)) return false;
        if (dateTo && new Date(review.createdAt) > new Date(dateTo)) return false;
        
        return true;
      });

      // Sort reviews
      filteredReviews.sort((a, b) => {
        let valueA: any;
        let valueB: any;

        switch (sortBy) {
          case 'createdAt':
          case 'updatedAt':
            valueA = new Date(a[sortBy]).getTime();
            valueB = new Date(b[sortBy]).getTime();
            break;
          case 'score':
            valueA = a.assessment.score;
            valueB = b.assessment.score;
            break;
          case 'type':
            valueA = a.type;
            valueB = b.type;
            break;
          default:
            valueA = a.createdAt;
            valueB = b.createdAt;
        }

        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });

      // Calculate pagination
      const totalReviews = filteredReviews.length;
      const totalPages = Math.ceil(totalReviews / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalReviews);
      
      // Get current page
      const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

      // Generate statistics
      const stats = {
        totalReviews: allReviews.length,
        byType: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        averageScore: 0,
      };

      let totalScore = 0;
      allReviews.forEach(review => {
        // Count by type
        stats.byType[review.type] = (stats.byType[review.type] || 0) + 1;
        
        // Count by severity
        if (review.metadata.severity) {
          stats.bySeverity[review.metadata.severity] = (stats.bySeverity[review.metadata.severity] || 0) + 1;
        }
        
        // Sum scores for average
        totalScore += review.assessment.score;
      });

      stats.averageScore = allReviews.length > 0 ? Math.round(totalScore / allReviews.length) : 0;

      // Prepare output reviews (optionally exclude assessment content)
      const outputReviews = paginatedReviews.map(review => 
        includeContent ? review : {
          ...review,
          assessment: undefined, // Exclude assessment content if requested
        }
      );

      return {
        success: true,
        reviews: outputReviews,
        pagination: {
          currentPage: page,
          pageSize,
          totalPages,
          totalReviews,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { type, severity, dateFrom, dateTo },
        stats,
        message: `Loaded ${paginatedReviews.length} reviews (page ${page} of ${totalPages})`,
      };
    } catch (error) {
      return {
        success: false,
        reviews: [],
        pagination: {
          currentPage: page,
          pageSize,
          totalPages: 0,
          totalReviews: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        filters: { type, severity, dateFrom, dateTo },
        stats: { totalReviews: 0, byType: {}, bySeverity: {}, averageScore: 0 },
        message: `Failed to load reviews: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});