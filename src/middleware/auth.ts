import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '@/services/config';
import { logger } from '@/services/logger';
import { apiKeyManager } from '@/services/apiKeyManager';

// Extend Request interface to include apiKey
declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      apiKeyId?: string;
      agentWallet?: string;
    }
  }
}

/**
 * API Key authentication middleware
 * Expects API key in Authorization header: 'Bearer <api-key>'
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_AUTH_HEADER',
          message: 'Authorization header is required',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const [scheme, token] = authHeader.split(' ');
    
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_AUTH_FORMAT',
          message: 'Authorization header must be in format: Bearer <token>',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate API key using the manager
    const validation = apiKeyManager.validateApiKey(token);
    if (!validation.valid) {
      logger.warn('Invalid API key attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Store API key and key ID in request for potential logging
    req.apiKey = token;
    if (validation.keyId) {
      req.apiKeyId = validation.keyId;
    }
    
    logger.debug('API key authenticated', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      keyId: validation.keyId,
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: (error as Error).message,
      path: req.path,
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Internal authentication error',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Legacy API key validation function (deprecated)
 * @deprecated Use apiKeyManager.validateApiKey() instead
 * This function is kept for backward compatibility but is no longer used.
 * All validation now goes through the ApiKeyManager service.
 */
function isValidApiKey(apiKey: string): boolean {
  try {
    // Basic format validation for compatibility
    if (!apiKey || apiKey.length < 32) {
      return false;
    }
    
    // Check if it's a valid hex string (basic format check)
    if (!/^[a-f0-9]+$/i.test(apiKey)) {
      return false;
    }
    
    // For development/testing, accept any valid format key
    return true;
  } catch (error) {
    logger.error('API key validation error', {
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Generate API key (utility function for development)
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Extract agent wallet from request body for rate limiting
 */
export const extractAgentWallet = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Extract agent wallet from request body if present
    if (req.body && req.body.agentWallet) {
      req.agentWallet = req.body.agentWallet;
    }
    
    next();
  } catch (error) {
    logger.error('Agent wallet extraction error', {
      error: (error as Error).message,
      path: req.path,
    });
    
    next(); // Continue even if extraction fails
  }
};