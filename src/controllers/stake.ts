import { Request, Response } from 'express';
import { transactionService } from '@/services/transaction';
import { logger } from '@/services/logger';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { NativeStakeRequest, NativeStakeResponse } from '@/types/api';

/**
 * Build native staking transaction
 * POST /stake/build
 */
export const buildNativeStakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    logger.info('Building native stake transaction', {
      requestId,
      agentWallet: req.body.agentWallet,
      amount: req.body.amount,
      validatorVoteAccount: req.body.validatorVoteAccount,
    });

    try {
      const stakeRequest: NativeStakeRequest = req.body;
      
      // Build the transaction
      const stakeResponse: NativeStakeResponse = await transactionService.buildNativeStakeTransaction(stakeRequest);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Native stake transaction built successfully', {
        requestId,
        agentWallet: stakeRequest.agentWallet,
        stakeAccount: stakeResponse.stakeAccount,
        feeAmount: stakeResponse.feeAmount,
        processingTimeMs: processingTime,
      });

      // Check if response time exceeds target
      if (processingTime > 200) {
        logger.warn('Transaction building exceeded target time', {
          requestId,
          processingTimeMs: processingTime,
          target: 200,
        });
      }

      const response = createApiResponse(stakeResponse);
      response.requestId = requestId;
      
      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build native stake transaction', {
        requestId,
        agentWallet: req.body.agentWallet,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      // Determine appropriate error response
      let statusCode = 500;
      let errorCode = 'TRANSACTION_BUILD_ERROR';
      
      if ((error as Error).message.includes('Invalid')) {
        statusCode = 400;
        errorCode = 'INVALID_INPUT';
      } else if ((error as Error).message.includes('Insufficient')) {
        statusCode = 400;
        errorCode = 'INSUFFICIENT_BALANCE';
      } else if ((error as Error).message.includes('blockhash')) {
        statusCode = 503;
        errorCode = 'RPC_ERROR';
      }

      throw createApiError((error as Error).message, statusCode, errorCode, {
        requestId,
        processingTimeMs: processingTime,
      });
    }
  }
);

/**
 * Build liquid staking transaction (placeholder for Phase 2)
 * POST /stake/liquid/build
 */
export const buildLiquidStakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    logger.info('Liquid staking requested (not implemented)', {
      requestId,
      agentWallet: req.body.agentWallet,
    });

    // Phase 1: Return not implemented
    throw createApiError(
      'Liquid staking will be available in Phase 2',
      501,
      'NOT_IMPLEMENTED',
      { 
        requestId,
        availableIn: 'Phase 2 (weeks 6-8)',
        alternatives: ['Use native staking via /stake/build'],
      }
    );
  }
);

/**
 * Build unstaking transaction (placeholder for Phase 2)
 * POST /unstake/build
 */
export const buildUnstakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    logger.info('Unstaking requested (not implemented)', {
      requestId,
      agentWallet: req.body.agentWallet,
      type: req.body.type,
    });

    // Phase 1: Return not implemented
    throw createApiError(
      'Unstaking will be available in Phase 2',
      501,
      'NOT_IMPLEMENTED',
      { 
        requestId,
        availableIn: 'Phase 2 (weeks 6-8)',
        note: 'Native unstaking requires direct Solana interaction for now',
      }
    );
  }
);