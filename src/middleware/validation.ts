import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '@/services/logger';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Joi schema for Solana public key validation
 */
const publicKeySchema = Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).message('Invalid Solana public key format');

/**
 * Validation schemas for API requests
 */
export const validationSchemas = {
  nativeStakeRequest: Joi.object({
    agentWallet: publicKeySchema.required(),
    amount: Joi.number()
      .integer()
      .min(1000000) // Minimum 0.001 SOL
      .max(1000 * LAMPORTS_PER_SOL) // Maximum 1000 SOL per transaction
      .required()
      .description('Stake amount in lamports'),
    validatorVoteAccount: publicKeySchema.optional(),
    stakeAuthority: publicKeySchema.optional(),
  }),

  liquidStakeRequest: Joi.object({
    agentWallet: publicKeySchema.required(),
    amount: Joi.number()
      .integer()
      .min(1000000) // Minimum 0.001 SOL
      .max(1000 * LAMPORTS_PER_SOL) // Maximum 1000 SOL per transaction
      .required()
      .description('Stake amount in lamports'),
    slippageTolerance: Joi.number()
      .min(0)
      .max(10) // Maximum 10% slippage
      .default(0.5)
      .optional(),
  }),

  unstakeRequest: Joi.object({
    agentWallet: publicKeySchema.required(),
    stakeAccount: publicKeySchema.when('type', {
      is: 'native',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    liquidTokens: Joi.number()
      .integer()
      .min(1)
      .when('type', {
        is: 'liquid',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    type: Joi.string()
      .valid('native', 'liquid')
      .required(),
  }),

  transactionSubmitRequest: Joi.object({
    signedTransaction: Joi.string()
      .required()
      .description('Base64 encoded signed transaction'),
    maxRetries: Joi.number()
      .integer()
      .min(0)
      .max(5)
      .default(3)
      .optional(),
    priorityFee: Joi.number()
      .integer()
      .min(0)
      .max(1000000) // Maximum 0.001 SOL priority fee
      .optional(),
  }),
};

/**
 * Generic validation middleware factory
 */
export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false, // Show all validation errors
        stripUnknown: true, // Remove unknown fields
      });

      if (error) {
        const errorDetails = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));

        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: errorDetails,
          agentWallet: req.body?.agentWallet,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: errorDetails,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Replace req.body with validated and sanitized data
      req.body = value;

      logger.debug('Request validation passed', {
        path: req.path,
        method: req.method,
        agentWallet: value.agentWallet,
      });

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        error: (error as Error).message,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Internal validation error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errorDetails = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));

        logger.warn('Query validation failed', {
          path: req.path,
          method: req.method,
          errors: errorDetails,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter validation failed',
            details: errorDetails,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      req.query = value;
      next();
    } catch (error) {
      logger.error('Query validation middleware error', {
        error: (error as Error).message,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Internal query validation error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Validate path parameters
 */
export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errorDetails = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));

        logger.warn('Path parameter validation failed', {
          path: req.path,
          method: req.method,
          errors: errorDetails,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Path parameter validation failed',
            details: errorDetails,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      req.params = value;
      next();
    } catch (error) {
      logger.error('Path parameter validation middleware error', {
        error: (error as Error).message,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Internal path parameter validation error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };
}