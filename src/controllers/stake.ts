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
 * Build liquid staking transaction
 * POST /stake/liquid/build
 */
export const buildLiquidStakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    logger.info('Building liquid stake transaction', {
      requestId,
      agentWallet: req.body.agentWallet,
      amount: req.body.amount,
      slippageTolerance: req.body.slippageTolerance,
    });

    try {
      const stakeRequest = req.body;
      
      // Build the liquid staking transaction
      const stakeResponse = await transactionService.buildLiquidStakeTransaction(stakeRequest);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Liquid stake transaction built successfully', {
        requestId,
        agentWallet: stakeRequest.agentWallet,
        expectedTokens: stakeResponse.expectedTokens,
        exchangeRate: stakeResponse.exchangeRate,
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
      
      logger.error('Failed to build liquid stake transaction', {
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
      } else if ((error as Error).message.includes('slippage')) {
        statusCode = 400;
        errorCode = 'SLIPPAGE_EXCEEDED';
      }

      throw createApiError((error as Error).message, statusCode, errorCode, {
        requestId,
        processingTimeMs: processingTime,
      });
    }
  }
);

/**
 * Build unstaking transaction
 * POST /unstake/build
 */
export const buildUnstakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    logger.info('Building unstake transaction', {
      requestId,
      agentWallet: req.body.agentWallet,
      type: req.body.type,
      stakeAccount: req.body.stakeAccount,
      liquidTokens: req.body.liquidTokens,
    });

    try {
      const unstakeRequest = req.body;
      
      // Build the unstaking transaction
      const unstakeResponse = await transactionService.buildUnstakeTransaction(unstakeRequest);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Unstake transaction built successfully', {
        requestId,
        agentWallet: unstakeRequest.agentWallet,
        type: unstakeRequest.type,
        cooldownEpochs: unstakeResponse.cooldownEpochs,
        feeAmount: unstakeResponse.feeAmount,
        immediateSOL: unstakeResponse.immediateSOL,
        processingTimeMs: processingTime,
      });

      const response = createApiResponse(unstakeResponse);
      response.requestId = requestId;
      
      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build unstake transaction', {
        requestId,
        agentWallet: req.body.agentWallet,
        type: req.body.type,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      let statusCode = 500;
      let errorCode = 'TRANSACTION_BUILD_ERROR';
      
      if ((error as Error).message.includes('Invalid')) {
        statusCode = 400;
        errorCode = 'INVALID_INPUT';
      } else if ((error as Error).message.includes('required')) {
        statusCode = 400;
        errorCode = 'MISSING_REQUIRED_FIELD';
      }

      throw createApiError((error as Error).message, statusCode, errorCode, {
        requestId,
        processingTimeMs: processingTime,
      });
    }
  }
);

/**
 * Submit signed transaction
 * POST /tx/submit
 */
export const submitTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    logger.info('Submitting signed transaction', {
      requestId,
      maxRetries: req.body.maxRetries,
      priorityFee: req.body.priorityFee,
    });

    try {
      const submitRequest = req.body;
      
      // Submit the transaction
      const submitResponse = await transactionService.submitTransaction(submitRequest);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Transaction submitted successfully', {
        requestId,
        signature: submitResponse.signature,
        status: submitResponse.status,
        slot: submitResponse.slot,
        processingTimeMs: processingTime,
      });

      const response = createApiResponse(submitResponse);
      response.requestId = requestId;
      
      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to submit transaction', {
        requestId,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      let statusCode = 500;
      let errorCode = 'TRANSACTION_SUBMIT_ERROR';
      
      if ((error as Error).message.includes('signed')) {
        statusCode = 400;
        errorCode = 'INVALID_SIGNATURE';
      } else if ((error as Error).message.includes('timeout')) {
        statusCode = 408;
        errorCode = 'TRANSACTION_TIMEOUT';
      } else if ((error as Error).message.includes('insufficient')) {
        statusCode = 400;
        errorCode = 'INSUFFICIENT_BALANCE';
      }

      throw createApiError((error as Error).message, statusCode, errorCode, {
        requestId,
        processingTimeMs: processingTime,
      });
    }
  }
);

/**
 * Get staking recommendations
 * GET /stake/recommend
 */
export const getStakeRecommendations = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    logger.info('Getting stake recommendations', { requestId });

    try {
      // Get staking recommendations
      const recommendations = await transactionService.getStakeRecommendations();
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Stake recommendations retrieved successfully', {
        requestId,
        nativeValidators: recommendations.native.validators.length,
        liquidPools: recommendations.liquid.pools.length,
        processingTimeMs: processingTime,
      });

      const response = createApiResponse(recommendations);
      response.requestId = requestId;
      
      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to get stake recommendations', {
        requestId,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      throw createApiError((error as Error).message, 500, 'RECOMMENDATIONS_ERROR', {
        requestId,
        processingTimeMs: processingTime,
      });
    }
  }
);

/**
 * Get agent portfolio positions
 * GET /positions/:wallet
 */
export const getAgentPositions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    const walletAddress = req.params.wallet;

    if (!walletAddress || typeof walletAddress !== 'string') {
      throw createApiError('Wallet address is required', 400, 'MISSING_WALLET_ADDRESS', {
        requestId,
      });
    }
    
    logger.info('Getting agent positions', {
      requestId,
      wallet: walletAddress,
    });

    try {
      // Get agent positions
      const positions = await transactionService.getAgentPositions(walletAddress);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Agent positions retrieved successfully', {
        requestId,
        wallet: walletAddress,
        totalStaked: positions.totalStaked,
        nativeAccounts: positions.native.stakeAccounts.length,
        liquidPositions: positions.liquid.positions.length,
        processingTimeMs: processingTime,
      });

      const response = createApiResponse(positions);
      response.requestId = requestId;
      
      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to get agent positions', {
        requestId,
        wallet: walletAddress,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      let statusCode = 500;
      let errorCode = 'POSITIONS_ERROR';
      
      if ((error as Error).message.includes('Invalid wallet')) {
        statusCode = 400;
        errorCode = 'INVALID_WALLET';
      }

      throw createApiError((error as Error).message, statusCode, errorCode, {
        requestId,
        wallet: walletAddress,
        processingTimeMs: processingTime,
      });
    }
  }
);