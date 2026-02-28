import { Request, Response } from 'express';
import { registerAgent, getAgentStatus } from '@/controllers/agents';
import { apiKeyManager } from '@/services/apiKeyManager';
import { createApiError } from '@/middleware/errorHandler';
import { PublicKey } from '@solana/web3.js';

// asyncHandler returns void synchronously; flush microtasks to let Promise.resolve().catch() settle
const flushPromises = () => new Promise(r => setTimeout(r, 50));

// Mock dependencies
jest.mock('@/services/apiKeyManager');
jest.mock('@/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

const mockedApiKeyManager = apiKeyManager as jest.Mocked<typeof apiKeyManager>;

describe('Agents Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    req = {
      body: {},
      params: {},
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent')
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('registerAgent', () => {
    const validAgentData = {
      agentName: 'Test Agent',
      agentWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      email: 'test@example.com',
      description: 'Test agent description',
      tier: 'free',
      agreesToTerms: true
    };

    describe('Successful registration', () => {
      it('should register a free tier agent successfully', async () => {
        req.body = validAgentData;
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'test-key-id',
          key: 'test-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              agentId: 'test-key-id',
              apiKey: 'test-api-key',
              tier: 'free'
            })
          })
        );
      });

      it('should register a pro tier agent successfully', async () => {
        req.body = { ...validAgentData, tier: 'pro' };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'test-key-id',
          key: 'test-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'pro'
          })
        );
      });
    });

    describe('Enterprise tier registration', () => {
      it('should require authentication for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = {}; // No API key

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Enterprise registration requires valid API key authentication',
            statusCode: 401
          })
        );
      });

      it('should reject empty API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': '' }; // Empty API key

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Enterprise registration requires valid API key authentication',
            statusCode: 401
          })
        );
      });

      it('should reject malformed API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'invalid@key#format!' }; // Invalid characters

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid API key format',
            statusCode: 401
          })
        );
      });

      it('should reject short API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'short' }; // Too short

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid API key format',
            statusCode: 401
          })
        );
      });

      it('should require admin API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'valid-api-key-format-but-not-admin-1234567890' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue({
          keyId: 'test-key',
          tier: 'free',
          isActive: true
        } as any);

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Enterprise registration requires admin API key',
            statusCode: 403
          })
        );
      });

      it('should register enterprise agent with valid admin key', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'valid-admin-key-format-1234567890abcdef' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue({
          keyId: 'admin-key',
          tier: 'admin',
          isActive: true
        } as any);
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'enterprise-key-id',
          key: 'enterprise-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'enterprise',
            organization: 'Test Corp',
            organizationType: 'enterprise'
          })
        );
      });
    });

    describe('Failure cases', () => {
      it('should fail when agent wallet already exists', async () => {
        req.body = validAgentData;
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue({
          keyId: 'existing-key',
          createdAt: new Date(),
          lastUsed: undefined,
          isActive: true,
          tier: 'free',
          description: 'Existing agent'
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Agent wallet already registered. Use existing API key or contact support.',
            statusCode: 409
          })
        );
      });

      it('should fail with inactive admin key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'valid-format-but-inactive-admin-key-1234567890' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue({
          keyId: 'admin-key',
          tier: 'admin',
          isActive: false
        } as any);

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'API key has been deactivated',
            statusCode: 401
          })
        );
      });

      it('should fail with non-existent API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'valid-format-but-non-existent-key-1234567890' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue(null);

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid API key',
            statusCode: 401
          })
        );
      });

      it('should handle authentication service errors gracefully', async () => {
        req.body = { ...validAgentData, tier: 'enterprise', organization: 'Test Corp', organizationType: 'enterprise' };
        req.headers = { 'x-api-key': 'valid-format-api-key-1234567890abcdef' };
        mockedApiKeyManager.getKeyInfo.mockRejectedValue(new Error('Database connection timeout'));

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Authentication service temporarily unavailable',
            statusCode: 503
          })
        );
      });
    });

    describe('Organization field validation', () => {
      it('should handle organization fields for non-enterprise tiers', async () => {
        req.body = { ...validAgentData, tier: 'pro', organization: 'Optional Corp', organizationType: 'startup' };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'pro-key-id',
          key: 'pro-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'pro',
            organization: 'Optional Corp',
            organizationType: 'startup'
          })
        );
      });

      it('should handle registration with all organization types', async () => {
        const organizationTypes = ['startup', 'enterprise', 'government', 'nonprofit', 'individual', 'other'];
        
        for (const orgType of organizationTypes) {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          req.body = { ...validAgentData, organization: 'Test Org', organizationType: orgType };
          mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
          mockedApiKeyManager.createKey.mockResolvedValue({
            keyId: `${orgType}-key-id`,
            key: `${orgType}-api-key`,
            createdAt: new Date()
          });

          registerAgent(req as Request, res as Response, next);
          await flushPromises();

          expect(res.status).toHaveBeenCalledWith(201);
          expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
            expect.objectContaining({
              organizationType: orgType
            })
          );
        }
      });
    });

    describe('Edge cases', () => {
      it('should handle apiKeyManager.createKey failure', async () => {
        req.body = validAgentData;
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockRejectedValue(new Error('Database error'));

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Database error' }));
      });

      it('should handle optional fields correctly', async () => {
        req.body = {
          agentName: 'Minimal Agent',
          agentWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          agreesToTerms: true
          // No email, description, tier, or organization (should default to 'free')
        };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'minimal-key-id',
          key: 'minimal-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'free',
            agentName: 'Minimal Agent'
          })
        );
        // email and organization should not be present when not provided
        const callArgs = mockedApiKeyManager.createKey.mock.calls[0]![0];
        expect(callArgs).not.toHaveProperty('email');
        expect(callArgs).not.toHaveProperty('organization');
      });

      it('should handle very long organization names gracefully', async () => {
        req.body = { 
          ...validAgentData, 
          organization: 'A'.repeat(150), // Over 100 char limit 
          organizationType: 'enterprise' 
        };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'truncated-org-key-id',
          key: 'truncated-org-api-key',
          createdAt: new Date()
        });

        registerAgent(req as Request, res as Response, next);
        await flushPromises();

        expect(res.status).toHaveBeenCalledWith(201);
        // Organization should be truncated by validation middleware
      });

      it('should handle wallet lookup failures gracefully', async () => {
        req.body = validAgentData;
        mockedApiKeyManager.findKeyByWallet.mockRejectedValue(new Error('Database lookup error'));

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Database lookup error' }));
      });

      it('should handle concurrent registrations of same wallet', async () => {
        req.body = validAgentData;
        // First call returns null (not found), but by the time createKey is called, another registration completed
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockRejectedValue(new Error('Unique constraint violation'));

        registerAgent(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unique constraint violation' }));
      });
    });
  });

  describe('getAgentStatus', () => {
    const testWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

    describe('Successful status retrieval', () => {
      it('should return status for registered agent', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue({
          keyId: 'test-key-id',
          createdAt: new Date(),
          lastUsed: new Date(),
          isActive: true,
          tier: 'pro',
          description: 'Test agent',
          agentName: 'Test Agent'
        });

        getAgentStatus(req as Request, res as Response, next);
        await flushPromises();

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              registered: true,
              agentId: 'test-key-id',
              tier: 'free', // getKeyTier derives from keyId, not mock data
              isActive: true
            })
          })
        );
      });

      it('should return unregistered status for unknown wallet', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);

        getAgentStatus(req as Request, res as Response, next);
        await flushPromises();

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              registered: false,
              message: 'Agent not registered'
            })
          })
        );
      });
    });

    describe('Edge cases', () => {
      it('should handle apiKeyManager.findKeyByWallet failure', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockRejectedValue(new Error('Database connection error'));

        getAgentStatus(req as Request, res as Response, next);
        await flushPromises();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Database connection error' }));
      });

      it('should handle agent with missing lastUsed field', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue({
          keyId: 'test-key-id',
          createdAt: new Date(),
          lastUsed: undefined, // Never used
          isActive: true,
          tier: 'free',
          description: 'Never used agent'
        });

        getAgentStatus(req as Request, res as Response, next);
        await flushPromises();

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              registered: true,
              lastUsed: undefined
            })
          })
        );
      });

      it('should handle inactive agent', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue({
          keyId: 'inactive-key-id',
          createdAt: new Date(),
          lastUsed: new Date(),
          isActive: false,
          tier: 'pro',
          description: 'Deactivated agent'
        });

        getAgentStatus(req as Request, res as Response, next);
        await flushPromises();

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              registered: true,
              isActive: false
            })
          })
        );
      });
    });
  });
});