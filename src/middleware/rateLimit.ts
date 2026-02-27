import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '@/services/config';
import { logger } from '@/services/logger';
import { apiKeyManager, ApiKeyTier } from '@/services/apiKeyManager';

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
    // API key logging removed for security (sensitive information)
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

/**
 * Tiered rate limiting based on API key tier
 * Uses API key tier to determine rate limits:
 * - Free: 10 req/min
 * - Pro: 100 req/min  
 * - Enterprise: 1000 req/min
 */
export const tieredRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req: Request): number => {
    // In test environment, use much higher limits to avoid blocking tests
    if (process.env.NODE_ENV === 'test') {
      return 1000;
    }
    
    // Get the tier from the request (set by auth middleware)
    const tier = (req as any).apiKeyTier as ApiKeyTier;
    
    if (!tier) {
      // No tier info, fall back to free tier limits
      return 10;
    }
    
    const limits = apiKeyManager.getTierLimits(tier);
    return limits.requestsPerMinute;
  },
  keyGenerator: createKeyGenerator(),
  handler: (req: Request, res: Response) => {
    const tier = (req as any).apiKeyTier as ApiKeyTier || 'free';
    const limits = apiKeyManager.getTierLimits(tier);
    const identifier = req.agentWallet ? req.agentWallet : req.ip;
    const type = req.agentWallet ? 'wallet' : 'ip';
    
    logger.warn('Tiered rate limit exceeded', {
      type,
      identifier,
      tier,
      limit: limits.requestsPerMinute,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests for ${tier} tier. Limit: ${limits.requestsPerMinute} per minute`,
        details: {
          tier,
          limit: limits.requestsPerMinute,
          windowMs: 60000,
          retryAfter: 60,
        },
      },
      timestamp: new Date().toISOString(),
    });
  },
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

logger.info('Rate limiting configured', {
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  strictMax: Math.floor(config.rateLimit.maxRequests / 2),
  readOnlyMax: config.rateLimit.maxRequests * 3,
  tierLimits: {
    free: apiKeyManager.getTierLimits('free'),
    pro: apiKeyManager.getTierLimits('pro'),
    enterprise: apiKeyManager.getTierLimits('enterprise'),
  }
});