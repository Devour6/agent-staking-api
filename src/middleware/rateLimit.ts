import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '@/services/config';
import { logger } from '@/services/logger';

/**
 * Create key generator that uses agent wallet address for rate limiting
 * Falls back to IP address if no agent wallet is provided
 */
const createKeyGenerator = () => {
  return (req: Request): string => {
    // Use agent wallet address for per-wallet rate limiting
    if (req.agentWallet) {
      return `wallet:${req.agentWallet}`;
    }
    
    // Fallback to IP-based rate limiting
    return `ip:${req.ip}`;
  };
};

/**
 * Custom rate limit handler with detailed logging
 */
const rateLimitHandler = (req: Request, res: Response) => {
  const identifier = req.agentWallet ? req.agentWallet : req.ip;
  const type = req.agentWallet ? 'wallet' : 'ip';
  
  logger.warn('Rate limit exceeded', {
    type,
    identifier,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    apiKey: req.apiKey?.substring(0, 8) + '...', // Log partial API key for debugging
  });
  
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Limit: ${config.rateLimit.maxRequests} per ${config.rateLimit.windowMs / 1000} seconds`,
      details: {
        limit: config.rateLimit.maxRequests,
        windowMs: config.rateLimit.windowMs,
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      },
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Skip rate limiting for certain conditions
 */
const skipRateLimit = (req: Request): boolean => {
  // Skip rate limiting for health checks
  if (req.path === '/health') {
    return true;
  }
  
  // Skip for documentation endpoints
  if (req.path.startsWith('/api/docs')) {
    return true;
  }
  
  return false;
};

/**
 * Main rate limiting middleware
 * Applied per agent wallet address with IP fallback
 */
export const walletRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyGenerator: createKeyGenerator(),
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  // Custom store could be added here for Redis-based rate limiting in production
});

/**
 * Stricter rate limiting for expensive operations
 */
export const strictRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: Math.floor(config.rateLimit.maxRequests / 2), // Half the normal rate
  keyGenerator: createKeyGenerator(),
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very permissive rate limiting for read-only operations
 */
export const readOnlyRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests * 3, // Triple the normal rate for reads
  keyGenerator: createKeyGenerator(),
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

logger.info('Rate limiting configured', {
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  strictMax: Math.floor(config.rateLimit.maxRequests / 2),
  readOnlyMax: config.rateLimit.maxRequests * 3,
});