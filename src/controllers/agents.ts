import { Request, Response } from 'express';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { apiKeyManager } from '@/services/apiKeyManager';
import { logger } from '@/services/logger';
import { PublicKey } from '@solana/web3.js';

interface AgentRegistrationRequest {
  agentName: string;
  agentWallet: string;
  email?: string;
  description?: string;
  tier?: 'free' | 'pro' | 'enterprise';
  agreesToTerms: boolean;
}

interface AgentRegistrationResponse {
  success: boolean;
  data: {
    agentId: string;
    apiKey: string;
    tier: string;
    registeredAt: Date;
    message: string;
  };
}

/**
 * Self-service agent registration endpoint
 * POST /agents/register
 */
export const registerAgent = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    const { 
      agentName, 
      agentWallet, 
      email, 
      description, 
      tier = 'free',
      agreesToTerms 
    }: AgentRegistrationRequest = req.body;

    logger.info('Processing agent registration', {
      requestId,
      agentName,
      agentWallet: `${agentWallet.substring(0, 4)}...${agentWallet.substring(agentWallet.length - 4)}`,
      tier,
      hasEmail: !!email,
      hasDescription: !!description
    });

    try {
      // Note: Basic validation is handled by validateRequest middleware
      // Additional business logic validation only

      // Enterprise registrations require authentication
      if (tier === 'enterprise') {
        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey) {
          throw createApiError('Enterprise registration requires valid API key authentication', 401, 'AUTHENTICATION_REQUIRED');
        }
        
        // Verify API key has admin privileges for enterprise registration
        const keyInfo = await apiKeyManager.getKeyInfo(apiKey);
        if (!keyInfo || !keyInfo.isActive || keyInfo.tier !== 'admin') {
          throw createApiError('Enterprise registration requires admin API key', 403, 'INSUFFICIENT_PRIVILEGES');
        }

        logger.info('Enterprise registration authenticated', {
          requestId,
          adminKeyId: keyInfo.keyId
        });
      }

      // Check if agent wallet is already registered
      const existingKey = await apiKeyManager.findKeyByWallet(agentWallet);
      if (existingKey) {
        logger.warn('Attempted registration of existing wallet', {
          requestId,
          agentWallet: `${agentWallet.substring(0, 4)}...${agentWallet.substring(agentWallet.length - 4)}`,
          existingKeyId: existingKey.keyId
        });
        throw createApiError('Agent wallet already registered. Use existing API key or contact support.', 409, 'WALLET_ALREADY_REGISTERED');
      }

      // Generate API key for the agent
      const newKey = await apiKeyManager.createKey({
        tier,
        description: `Self-registered agent: ${agentName}${description ? ` - ${description}` : ''}`,
        agentName,
        agentWallet,
        email,
        registeredAt: new Date(),
        selfRegistered: true
      });

      const processingTime = Date.now() - startTime;

      logger.info('Agent registration successful', { 
        requestId,
        agentName, 
        keyId: newKey.keyId, 
        tier,
        processingTime,
        hasEmail: !!email,
        hasDescription: !!description
      });

      // Return success response with API key (only returned once)
      const response: AgentRegistrationResponse = {
        success: true,
        data: {
          agentId: newKey.keyId,
          apiKey: newKey.key,
          tier,
          registeredAt: newKey.createdAt,
          message: `Welcome ${agentName}! Your agent has been successfully registered. Please store your API key securely - it won't be shown again.`
        }
      };

      res.status(201).json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Agent registration failed', {
        requestId,
        agentName,
        tier,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
);

/**
 * Get agent registration status
 * GET /agents/:wallet/status
 */
export const getAgentStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    const { wallet } = req.params;

    logger.info('Checking agent status', {
      requestId,
      wallet: `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`
    });

    try {
      // Route parameter validation handled by middleware

      const keyInfo = await apiKeyManager.findKeyByWallet(wallet);
      const processingTime = Date.now() - startTime;
      
      if (!keyInfo) {
        logger.info('Agent not registered', {
          requestId,
          processingTime
        });

        res.json(createApiResponse({
          registered: false,
          message: 'Agent not registered'
        }));
        return;
      }

      logger.info('Agent status retrieved', {
        requestId,
        keyId: keyInfo.keyId,
        tier: getKeyTier(keyInfo.keyId),
        isActive: keyInfo.isActive,
        processingTime
      });

      res.json(createApiResponse({
        registered: true,
        agentId: keyInfo.keyId,
        tier: getKeyTier(keyInfo.keyId),
        registeredAt: keyInfo.createdAt,
        lastUsed: keyInfo.lastUsed,
        isActive: keyInfo.isActive
      }));

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Agent status check failed', {
        requestId,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
);

// Helper function (this should be moved to apiKeyManager service in a real implementation)
function getKeyTier(keyId: string): string {
  // This is a temporary implementation - in production this would be stored with the key
  return keyId.includes('pro') ? 'pro' : keyId.includes('enterprise') ? 'enterprise' : 'free';
}