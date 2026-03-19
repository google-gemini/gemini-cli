/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    org_id?: string;
  };
}

/**
 * Middleware to extract user identity from Google IAP headers.
 * In a real production environment, the JWT signature should also be verified.
 */
export const iapMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userEmail = req.header('x-goog-authenticated-user-email');
  const userId = req.header('x-goog-authenticated-user-id');
  const orgId = req.header('x-goog-authenticated-user-org');

  // If running locally or without IAP, use a dev user
  if (!userEmail || !userId) {
    if (process.env['NODE_ENV'] === 'production') {
        res.status(401).json({ error: 'Missing IAP authentication headers' });
        return;
    }
    
    (req as unknown as AuthenticatedRequest).user = {
      id: 'dev-user-id',
      email: 'dev-user@google.com',
      org_id: 'dev-org-id',
    };
    next();
    return;
  }

  // Remove the "accounts.google.com:" prefix if present
  const cleanId = userId.replace('accounts.google.com:', '');
  const cleanEmail = userEmail.replace('accounts.google.com:', '');

  (req as unknown as AuthenticatedRequest).user = {
    id: cleanId,
    email: cleanEmail,
    org_id: orgId,
  };

  next();
};
