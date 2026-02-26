import { Request, Response, NextFunction } from 'express';
import { logger } from '@/services/logger';
import { ApiResponse, ApiError } from '@/types/api';
import { config } from '@/services/config';

/**
 * Custom error class for API errors
 */
export class ApiCustomError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.name = 'ApiCustomError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Main error handling middleware
 * Must be placed after all routes
 */
export const errorHandler = (
  error: Error | ApiCustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle different error types
  if (error instanceof ApiCustomError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (error.message.includes('rate limit')) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = error.message;
  } else {
    // Log unexpected errors with full details
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      agentWallet: req.agentWallet,
      apiKey: req.apiKey?.substring(0, 8) + '...',
    });
  }

  // Log error with appropriate level
  if (statusCode >= 500) {
    logger.error('API error', {
      statusCode,
      errorCode,
      message,
      path: req.path,
      method: req.method,
      agentWallet: req.agentWallet,
    });
  } else {
    logger.warn('API client error', {
      statusCode,
      errorCode,
      message,
      path: req.path,
      method: req.method,
      agentWallet: req.agentWallet,
    });
  }

  // Prepare error response
  const apiError: ApiError = {
    code: errorCode,
    message,
  };

  // Include details in development mode or for client errors
  if (details && (config.server.nodeEnv === 'development' || statusCode < 500)) {
    apiError.details = details;
  }

  const response: ApiResponse = {
    success: false,
    error: apiError,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(response);
};

/**
 * Async wrapper to catch promise rejections in route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Helper function to create API errors
 */
export const createApiError = (
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR',
  details?: any
): ApiCustomError => {
  return new ApiCustomError(message, statusCode, code, details);
};

/**
 * Helper function to create successful API responses
 */
export const createApiResponse = <T>(data: T): ApiResponse<T> => {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
};