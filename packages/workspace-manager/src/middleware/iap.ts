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
  };
}

/**
 * Middleware to extract user identity from Google IAP headers.
 * In a real production environment, the JWT signature should also be verified.
 */
export const iapMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userEmail = req.header('x-goog-authenticated-user-email');
  const userId = req.header('x-goog-authenticated-user-id');

  // If running locally or without IAP, use a dev user
  if (!userEmail || !userId) {
    if (process.env['NODE_ENV'] === 'production') {
        res.status(401).json({ error: 'Missing IAP authentication headers' });
        return;
    }
    
    (req as AuthenticatedRequest).user = {
      id: 'dev-user-id',
      email: 'dev-user@google.com',
    };
    next();
    return;
  }

  // Remove the "accounts.google.com:" prefix if present
  const cleanId = userId.replace('accounts.google.com:', '');
  const cleanEmail = userEmail.replace('accounts.google.com:', '');

  (req as AuthenticatedRequest).user = {
    id: cleanId,
    email: cleanEmail,
  };

  next();
};
