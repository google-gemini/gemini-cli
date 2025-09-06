import { z } from 'zod';
import { ReviewAssessmentSchema, type ReviewAssessment } from '../tools/review-storage.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const ListReviewsQuerySchema = z.object({
  type: z.enum(['production-review', 'code-quality', 'security', 'performance']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'score', 'type']).default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  includeAssessment: z.union([z.string(), z.boolean()]).optional().transform(val => {
    if (val === 'false' || val === false) return false;
    if (val === 'true' || val === true) return true;
    return true; // default
  }).default(true),
});

export interface ReviewListResponse {
  data: ReviewAssessment[];
  metadata: {
    total: number;
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: string;
    filters: {
      type?: string;
      severity?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    stats: {
      totalReviews: number;
      byType: Record<string, number>;
      bySeverity: Record<string, number>;
      averageScore: number;
    };
  };
}

export interface ReviewResponse {
  data?: ReviewAssessment;
  error?: string;
}

async function loadAllReviews(): Promise<ReviewAssessment[]> {
  const reviewsDir = getCompatiblePaths(defaultConfig).reviewsDirectory;
  
  try {
    await fs.access(reviewsDir);
  } catch {
    return []; // Directory doesn't exist, return empty array
  }

  const files = await fs.readdir(reviewsDir);
  const reviewFiles = files.filter(file => file.endsWith('.json'));
  
  const reviews: ReviewAssessment[] = [];
  for (const file of reviewFiles) {
    try {
      const filePath = path.join(reviewsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const review = ReviewAssessmentSchema.parse(JSON.parse(content));
      reviews.push(review);
    } catch (error) {
      console.warn(`Failed to load review file ${file}:`, error);
    }
  }
  
  return reviews;
}

function generateReviewStats(reviews: ReviewAssessment[]) {
  const stats = {
    totalReviews: reviews.length,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    averageScore: 0,
  };

  let totalScore = 0;
  reviews.forEach(review => {
    // Count by type
    stats.byType[review.type] = (stats.byType[review.type] || 0) + 1;
    
    // Count by severity
    if (review.metadata.severity) {
      stats.bySeverity[review.metadata.severity] = (stats.bySeverity[review.metadata.severity] || 0) + 1;
    }
    
    // Sum scores for average
    totalScore += review.assessment.score;
  });

  stats.averageScore = reviews.length > 0 ? Math.round(totalScore / reviews.length) : 0;
  return stats;
}

export const createReviewsListHandler = () => {
  return async (c: any) => {
    try {
      const query = c.req.query();
      const validatedQuery = ListReviewsQuerySchema.parse(query);

      const allReviews = await loadAllReviews();

      // Apply filters
      let filteredReviews = allReviews.filter(review => {
        // Type filter
        if (validatedQuery.type && review.type !== validatedQuery.type) return false;
        
        // Severity filter
        if (validatedQuery.severity && review.metadata.severity !== validatedQuery.severity) return false;
        
        // Date filters
        if (validatedQuery.dateFrom && new Date(review.createdAt) < new Date(validatedQuery.dateFrom)) return false;
        if (validatedQuery.dateTo && new Date(review.createdAt) > new Date(validatedQuery.dateTo)) return false;
        
        return true;
      });

      // Sort reviews
      const sortBy = validatedQuery.sortBy || 'createdAt';
      const sortOrder = validatedQuery.sortOrder || 'desc';
      
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
            valueA = new Date(a.createdAt).getTime();
            valueB = new Date(b.createdAt).getTime();
        }

        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });

      const total = filteredReviews.length;
      const limit = validatedQuery.limit || 50;
      const offset = validatedQuery.offset || 0;
      const includeAssessment = validatedQuery.includeAssessment !== false;

      const paginatedReviews = filteredReviews.slice(offset, offset + limit);

      // Prepare output reviews (optionally exclude assessment content)
      const outputReviews = paginatedReviews.map(review => {
        if (includeAssessment) {
          return review;
        } else {
          const { assessment, ...reviewWithoutAssessment } = review;
          return reviewWithoutAssessment as ReviewAssessment;
        }
      });

      const stats = generateReviewStats(allReviews);

      const response: ReviewListResponse = {
        data: outputReviews,
        metadata: {
          total,
          limit,
          offset,
          sortBy,
          sortOrder,
          filters: {
            type: validatedQuery.type,
            severity: validatedQuery.severity,
            dateFrom: validatedQuery.dateFrom,
            dateTo: validatedQuery.dateTo,
          },
          stats,
        },
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
      }
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};

export const createReviewByIdHandler = () => {
  return async (c: any) => {
    try {
      const id = c.req.param('id');
      
      if (!id) {
        return c.json({ error: 'Review ID is required' }, 400);
      }

      const allReviews = await loadAllReviews();
      const review = allReviews.find(r => r.id === id);

      if (!review) {
        return c.json({ error: 'Review not found' }, 404);
      }

      const response: ReviewResponse = {
        data: review,
      };

      return c.json(response);
    } catch (error) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};