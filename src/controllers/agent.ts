import { Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from '@/services/storage';
import { logger } from '@/services/logger';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { 
  AgentRegistration,
  AgentApiKey,
  RegisterAgentRequest,
  RegisterAgentResponse,
  AgentProfileResponse,
  UpdateAgentRequest,
  UpdateAgentResponse,
  AgreeTermsRequest,
  AgreeTermsResponse,
  AgentTier,
  AGENT_TIERS,
  CURRENT_TERMS_VERSION,
  AGENT_NAME_REGEX,
  AGENT_DESCRIPTION_MAX_LENGTH
} from '@/types/agent';

/**
 * Register a new agent
 * POST /agents/register
 */
export const registerAgent = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    logger.info('Registering new agent', {
      requestId,
      name: req.body.name,
      tierPreference: req.body.tierPreference,
    });

    try {
      const { name, description, callbackUrl, tierPreference }: RegisterAgentRequest = req.body;

      // Validate agent name
      if (!name || !AGENT_NAME_REGEX.test(name)) {
        throw createApiError(
          'Invalid agent name. Must be 2-50 characters, start and end with alphanumeric, contain only letters, numbers, spaces, hyphens, underscores, and dots.',
          400,
          'INVALID_AGENT_NAME'
        );
      }

      // Validate description
      if (!description || description.trim().length === 0) {
        throw createApiError(
          'Agent description is required',
          400,
          'MISSING_DESCRIPTION'
        );
      }

      if (description.length > AGENT_DESCRIPTION_MAX_LENGTH) {
        throw createApiError(
          `Description too long. Maximum ${AGENT_DESCRIPTION_MAX_LENGTH} characters.`,
          400,
          'DESCRIPTION_TOO_LONG'
        );
      }

      // Validate tier preference
      if (!tierPreference || !AGENT_TIERS[tierPreference]) {
        throw createApiError(
          `Invalid tier preference. Valid tiers: ${Object.keys(AGENT_TIERS).join(', ')}`,
          400,
          'INVALID_TIER'
        );
      }

      // Validate callback URL if provided
      if (callbackUrl && !isValidUrl(callbackUrl)) {
        throw createApiError(
          'Invalid callback URL. Must be a valid HTTPS URL.',
          400,
          'INVALID_CALLBACK_URL'
        );
      }

      // Check for existing agent with same name
      const existingAgents = await storage.getAgents();
      const duplicateAgent = existingAgents.find(a => 
        a.name.toLowerCase() === name.toLowerCase() && a.active
      );
      
      if (duplicateAgent) {
        throw createApiError(
          'An agent with this name is already registered',
          409,
          'AGENT_NAME_EXISTS'
        );
      }

      // Generate agent ID and API key
      const agentId = generateAgentId();
      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      // Create agent registration
      const agent: AgentRegistration = {
        id: agentId,
        name: name.trim(),
        description: description.trim(),
        ...(callbackUrl && { callbackUrl: callbackUrl.trim() }),
        tier: tierPreference,
        apiKeyHash,
        registrationDate: new Date().toISOString(),
        tosAccepted: false,
        usageStats: {
          totalRequests: 0,
          requestsThisMonth: 0,
          monthlyResets: {},
        },
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create API key record
      const apiKeyRecord: AgentApiKey = {
        agentId,
        keyHash: apiKeyHash,
        createdAt: new Date().toISOString(),
      };

      // Save to storage
      await storage.saveAgent(agent);
      await storage.saveAgentApiKey(apiKeyRecord);

      logger.info('Agent registered successfully', {
        requestId,
        agentId: agent.id,
        name: agent.name,
        tier: agent.tier,
      });

      const tierInfo = AGENT_TIERS[tierPreference];
      const response: RegisterAgentResponse = {
        agentId: agent.id,
        apiKey,
        tier: agent.tier,
        rateLimitInfo: {
          requestsPerHour: tierInfo.rateLimit.requestsPerHour,
          burstLimit: tierInfo.rateLimit.burstLimit,
        },
        createdAt: agent.createdAt,
      };

      res.status(201).json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to register agent', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * Get agent profile
 * GET /agents/:agentId
 */
export const getAgentProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const agentId = req.params.agentId as string;

    logger.info('Getting agent profile', {
      requestId,
      agentId,
    });

    try {
      if (!agentId) {
        throw createApiError(
          'Agent ID is required',
          400,
          'MISSING_AGENT_ID'
        );
      }

      const agent = await storage.getAgentById(agentId);

      if (!agent || !agent.active) {
        throw createApiError(
          'Agent not found',
          404,
          'AGENT_NOT_FOUND'
        );
      }

      // Mock stake positions for now (would integrate with actual staking data)
      const activeStakePositions = {
        totalStaked: 0, // Would calculate from actual stake accounts
        activePositions: 0, // Would count active stake accounts
      };

      const response: AgentProfileResponse = {
        agentId: agent.id,
        name: agent.name,
        description: agent.description,
        ...(agent.callbackUrl && { callbackUrl: agent.callbackUrl }),
        tier: agent.tier,
        registrationDate: agent.registrationDate,
        tosAccepted: agent.tosAccepted,
        ...(agent.tosAcceptedAt && { tosAcceptedAt: agent.tosAcceptedAt }),
        usageStats: {
          totalRequests: agent.usageStats.totalRequests,
          requestsThisMonth: agent.usageStats.requestsThisMonth,
          ...(agent.usageStats.lastRequestAt && { lastRequestAt: agent.usageStats.lastRequestAt }),
        },
        activeStakePositions,
      };

      logger.info('Agent profile retrieved successfully', {
        requestId,
        agentId,
      });

      res.json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to get agent profile', {
        requestId,
        agentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * Update agent profile
 * PUT /agents/:agentId
 */
export const updateAgentProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const agentId = req.params.agentId as string;

    logger.info('Updating agent profile', {
      requestId,
      agentId,
      updates: Object.keys(req.body),
    });

    try {
      if (!agentId) {
        throw createApiError(
          'Agent ID is required',
          400,
          'MISSING_AGENT_ID'
        );
      }

      const agent = await storage.getAgentById(agentId);

      if (!agent || !agent.active) {
        throw createApiError(
          'Agent not found',
          404,
          'AGENT_NOT_FOUND'
        );
      }

      const { description, callbackUrl, tierUpgradeRequest }: UpdateAgentRequest = req.body;
      const changes: string[] = [];

      // Update description
      if (description !== undefined) {
        if (description.trim().length === 0) {
          throw createApiError(
            'Description cannot be empty',
            400,
            'EMPTY_DESCRIPTION'
          );
        }

        if (description.length > AGENT_DESCRIPTION_MAX_LENGTH) {
          throw createApiError(
            `Description too long. Maximum ${AGENT_DESCRIPTION_MAX_LENGTH} characters.`,
            400,
            'DESCRIPTION_TOO_LONG'
          );
        }

        agent.description = description.trim();
        changes.push('description');
      }

      // Update callback URL
      if (callbackUrl !== undefined) {
        if (callbackUrl && !isValidUrl(callbackUrl)) {
          throw createApiError(
            'Invalid callback URL. Must be a valid HTTPS URL.',
            400,
            'INVALID_CALLBACK_URL'
          );
        }

        agent.callbackUrl = callbackUrl?.trim();
        changes.push('callbackUrl');
      }

      // Handle tier upgrade request
      let tierUpgradeStatus: 'pending' | 'approved' | 'denied' | undefined;
      if (tierUpgradeRequest !== undefined) {
        if (!AGENT_TIERS[tierUpgradeRequest]) {
          throw createApiError(
            `Invalid tier. Valid tiers: ${Object.keys(AGENT_TIERS).join(', ')}`,
            400,
            'INVALID_TIER'
          );
        }

        // Check if it's actually an upgrade
        const tierOrder: AgentTier[] = ['basic', 'standard', 'premium'];
        const currentTierIndex = tierOrder.indexOf(agent.tier);
        const requestedTierIndex = tierOrder.indexOf(tierUpgradeRequest);

        if (requestedTierIndex <= currentTierIndex) {
          throw createApiError(
            'Tier request must be an upgrade to a higher tier',
            400,
            'INVALID_TIER_UPGRADE'
          );
        }

        // For now, auto-approve all tier upgrades (in production, this would require admin approval)
        agent.tier = tierUpgradeRequest;
        agent.tierUpgradeRequest = {
          requestedTier: tierUpgradeRequest,
          requestedAt: new Date().toISOString(),
          status: 'approved',
        };
        tierUpgradeStatus = 'approved';
        changes.push('tier upgrade');
      }

      if (changes.length === 0) {
        throw createApiError(
          'No valid updates provided',
          400,
          'NO_UPDATES'
        );
      }

      agent.updatedAt = new Date().toISOString();
      await storage.saveAgent(agent);

      logger.info('Agent profile updated successfully', {
        requestId,
        agentId,
        changes,
      });

      const response: UpdateAgentResponse = {
        agentId: agent.id,
        updatedAt: agent.updatedAt,
        changes,
        ...(tierUpgradeStatus && { tierUpgradeStatus }),
      };

      res.json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to update agent profile', {
        requestId,
        agentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * Accept terms of service
 * POST /agents/:agentId/agree
 */
export const acceptTerms = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const agentId = req.params.agentId as string;

    logger.info('Processing terms acceptance', {
      requestId,
      agentId,
    });

    try {
      if (!agentId) {
        throw createApiError(
          'Agent ID is required',
          400,
          'MISSING_AGENT_ID'
        );
      }

      const agent = await storage.getAgentById(agentId);

      if (!agent || !agent.active) {
        throw createApiError(
          'Agent not found',
          404,
          'AGENT_NOT_FOUND'
        );
      }

      if (agent.tosAccepted) {
        throw createApiError(
          'Terms of service already accepted',
          409,
          'TERMS_ALREADY_ACCEPTED'
        );
      }

      const now = new Date().toISOString();
      agent.tosAccepted = true;
      agent.tosAcceptedAt = now;
      agent.tosVersion = CURRENT_TERMS_VERSION;
      agent.updatedAt = now;

      await storage.saveAgent(agent);

      logger.info('Terms of service accepted', {
        requestId,
        agentId,
        termsVersion: CURRENT_TERMS_VERSION,
      });

      const response: AgreeTermsResponse = {
        agentId: agent.id,
        termsAccepted: true,
        acceptedAt: agent.tosAcceptedAt!,
        termsVersion: CURRENT_TERMS_VERSION,
      };

      res.json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to accept terms', {
        requestId,
        agentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

// Utility functions
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:'; // Require HTTPS for security
  } catch {
    return false;
  }
}

function generateAgentId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `agent_${timestamp}_${random}`;
}

function generateApiKey(): string {
  const prefix = 'ak_';
  const key = crypto.randomBytes(32).toString('hex');
  return `${prefix}${key}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}