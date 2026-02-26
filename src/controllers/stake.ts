import { Request, Response } from 'express';
import crypto from 'crypto';
import { transactionService } from '@/services/transaction';
import { stakeMonitoringService } from '@/services/monitoring';
import { storage } from '@/services/storage';
import { logger } from '@/services/logger';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { NativeStakeRequest, NativeStakeResponse } from '@/types/api';
import { 
  BuildAndMonitorRequest, 
  BuildAndMonitorResponse,
  WebhookRegistration,
  WebhookEventType
} from '@/types/webhook';

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

/**
 * Build native staking transaction AND register monitoring
 * POST /stake/build-and-monitor
 */
export const buildAndMonitorStakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    const apiKey = req.apiKey!; // Set by auth middleware
    
    logger.info('Building and monitoring native stake transaction', {
      requestId,
      agentWallet: req.body.agentWallet,
      amount: req.body.amount,
      validatorVoteAccount: req.body.validatorVoteAccount,
      webhookUrl: req.body.webhookUrl,
    });

    try {
      const buildAndMonitorRequest: BuildAndMonitorRequest = req.body;
      
      // Build the transaction first (reuse existing logic)
      const nativeStakeRequest: NativeStakeRequest = {
        agentWallet: buildAndMonitorRequest.agentWallet,
        amount: buildAndMonitorRequest.amount,
        ...(buildAndMonitorRequest.validatorVoteAccount && { 
          validatorVoteAccount: buildAndMonitorRequest.validatorVoteAccount 
        }),
      };
      
      const stakeResponse: NativeStakeResponse = await transactionService.buildNativeStakeTransaction(nativeStakeRequest);
      
      let webhook: WebhookRegistration | null = null;
      
      // Auto-register webhook if URL provided
      if (buildAndMonitorRequest.webhookUrl) {
        const webhookEvents: WebhookEventType[] = buildAndMonitorRequest.webhookEvents || [
          'stake_confirmed',
          'stake_activated'
        ];

        // Generate webhook secret
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        const webhookId = crypto.randomBytes(16).toString('hex');

        webhook = {
          id: webhookId,
          apiKey,
          url: buildAndMonitorRequest.webhookUrl,
          events: webhookEvents,
          secret: webhookSecret,
          active: true,
          createdAt: new Date().toISOString(),
          failureCount: 0,
        };

        await storage.saveWebhook(webhook);

        logger.info('Auto-registered webhook for monitoring', {
          requestId,
          webhookId: webhook.id,
          url: webhook.url,
          events: webhook.events,
        });
      }

      // Note: Transaction signature will be provided when agent submits the signed transaction
      // For now, we create a placeholder monitoring record that will be updated when we receive
      // the actual transaction signature from the agent
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Build-and-monitor transaction completed', {
        requestId,
        agentWallet: buildAndMonitorRequest.agentWallet,
        stakeAccount: stakeResponse.stakeAccount,
        feeAmount: stakeResponse.feeAmount,
        webhookRegistered: !!webhook,
        processingTimeMs: processingTime,
      });

      const response: BuildAndMonitorResponse = {
        transaction: stakeResponse.transaction,
        stakeAccount: stakeResponse.stakeAccount,
        feeAmount: stakeResponse.feeAmount,
        ...(webhook && {
          webhook: {
            id: webhook.id,
            url: webhook.url,
            events: webhook.events,
          }
        }),
      };

      const apiResponse = createApiResponse(response);
      apiResponse.requestId = requestId;
      
      res.json(apiResponse);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build-and-monitor stake transaction', {
        requestId,
        agentWallet: req.body.agentWallet,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });

      // Determine appropriate error response
      let statusCode = 500;
      let errorCode = 'BUILD_AND_MONITOR_ERROR';
      
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
 * Register monitoring for an already submitted transaction
 * POST /stake/monitor
 */
export const monitorStakeTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    logger.info('Registering stake monitoring', {
      requestId,
      transactionSignature: req.body.transactionSignature,
      stakeAccount: req.body.stakeAccount,
      agentWallet: req.body.agentWallet,
    });

    try {
      const { transactionSignature, stakeAccount, agentWallet, validatorVoteAccount, amount } = req.body;

      if (!transactionSignature || !stakeAccount || !agentWallet) {
        throw createApiError(
          'transactionSignature, stakeAccount, and agentWallet are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      const monitoringId = await stakeMonitoringService.addStakeMonitoring({
        transactionSignature,
        stakeAccount,
        agentWallet,
        validatorVoteAccount: validatorVoteAccount || '',
        amount: amount || 0,
        timestamp: new Date().toISOString(),
      });

      logger.info('Stake monitoring registered', {
        requestId,
        monitoringId,
        transactionSignature,
      });

      res.json(createApiResponse({
        monitoringId,
        message: 'Stake monitoring registered successfully',
        transactionSignature,
        stakeAccount,
      }));

    } catch (error) {
      logger.error('Failed to register stake monitoring', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);