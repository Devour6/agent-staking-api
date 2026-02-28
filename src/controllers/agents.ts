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
    const { 
      agentName, 
      agentWallet, 
      email, 
      description, 
      tier = 'free',
      agreesToTerms 
    }: AgentRegistrationRequest = req.body;

    // Validate required fields
    if (!agentName || !agentWallet || !agreesToTerms) {
      throw createApiError('Missing required fields: agentName, agentWallet, agreesToTerms', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // Validate agent name (alphanumeric, hyphens, underscores, spaces, 3-50 chars)
    if (!/^[a-zA-Z0-9 _-]{3,50}$/.test(agentName)) {
      throw createApiError('Agent name must be 3-50 characters, alphanumeric with spaces, hyphens, or underscores only', 400, 'INVALID_AGENT_NAME');
    }

    // Validate Solana wallet address
    try {
      new PublicKey(agentWallet);
    } catch (error) {
      throw createApiError('Invalid Solana wallet address', 400, 'INVALID_WALLET_ADDRESS');
    }

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createApiError('Invalid email address format', 400, 'INVALID_EMAIL');
    }

    // Validate tier
    const validTiers = ['free', 'pro', 'enterprise'];
    if (!validTiers.includes(tier)) {
      throw createApiError('Invalid tier. Must be one of: free, pro, enterprise', 400, 'INVALID_TIER');
    }

    // Validate terms agreement
    if (!agreesToTerms) {
      throw createApiError('Must agree to terms of service', 400, 'TERMS_NOT_AGREED');
    }

    // Check if agent wallet is already registered
    const existingKey = await apiKeyManager.findKeyByWallet(agentWallet);
    if (existingKey) {
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

    logger.info('Agent self-registered', { 
      agentName, 
      agentWallet,
      keyId: newKey.keyId, 
      tier,
      email: email ? '[PROVIDED]' : '[NOT_PROVIDED]'
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
  }
);

/**
 * Get agent registration status
 * GET /agents/:wallet/status
 */
export const getAgentStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;

    if (!wallet || Array.isArray(wallet)) {
      throw createApiError('Valid wallet address is required', 400, 'MISSING_WALLET');
    }

    // Validate Solana wallet address
    try {
      new PublicKey(wallet);
    } catch (error) {
      throw createApiError('Invalid Solana wallet address', 400, 'INVALID_WALLET_ADDRESS');
    }

    const keyInfo = await apiKeyManager.findKeyByWallet(wallet);
    
    if (!keyInfo) {
      res.json(createApiResponse({
        registered: false,
        message: 'Agent not registered'
      }));
      return;
    }

    res.json(createApiResponse({
      registered: true,
      agentId: keyInfo.keyId,
      tier: getKeyTier(keyInfo.keyId),
      registeredAt: keyInfo.createdAt,
      lastUsed: keyInfo.lastUsed,
      isActive: keyInfo.isActive
    }));
  }
);

// Helper function (this should be moved to apiKeyManager service in a real implementation)
function getKeyTier(keyId: string): string {
  // This is a temporary implementation - in production this would be stored with the key
  return keyId.includes('pro') ? 'pro' : keyId.includes('enterprise') ? 'enterprise' : 'free';
}