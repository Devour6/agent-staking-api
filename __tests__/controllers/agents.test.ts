import { Request, Response } from 'express';
import { registerAgent, getAgentStatus } from '@/controllers/agents';
import { apiKeyManager } from '@/services/apiKeyManager';
import { createApiError } from '@/middleware/errorHandler';
import { PublicKey } from '@solana/web3.js';

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

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      headers: {}
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

        await registerAgent(req as Request, res as Response);

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

        await registerAgent(req as Request, res as Response);

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
        req.body = { ...validAgentData, tier: 'enterprise' };
        req.headers = {}; // No API key

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Enterprise registration requires valid API key authentication',
            statusCode: 401
          })
        );
      });

      it('should require admin API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise' };
        req.headers = { 'x-api-key': 'non-admin-key' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue({
          keyId: 'test-key',
          tier: 'free',
          isActive: true
        } as any);

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Enterprise registration requires admin API key',
            statusCode: 403
          })
        );
      });

      it('should register enterprise agent with valid admin key', async () => {
        req.body = { ...validAgentData, tier: 'enterprise' };
        req.headers = { 'x-api-key': 'admin-key' };
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

        await registerAgent(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'enterprise'
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

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Agent wallet already registered. Use existing API key or contact support.',
            statusCode: 409
          })
        );
      });

      it('should fail with inactive admin key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise' };
        req.headers = { 'x-api-key': 'inactive-admin-key' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue({
          keyId: 'admin-key',
          tier: 'admin',
          isActive: false
        } as any);

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Enterprise registration requires admin API key',
            statusCode: 403
          })
        );
      });

      it('should fail with non-existent API key for enterprise registration', async () => {
        req.body = { ...validAgentData, tier: 'enterprise' };
        req.headers = { 'x-api-key': 'non-existent-key' };
        mockedApiKeyManager.getKeyInfo.mockResolvedValue(null);

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Enterprise registration requires admin API key',
            statusCode: 403
          })
        );
      });
    });

    describe('Edge cases', () => {
      it('should handle apiKeyManager.createKey failure', async () => {
        req.body = validAgentData;
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockRejectedValue(new Error('Database error'));

        await expect(registerAgent(req as Request, res as Response)).rejects.toThrow('Database error');
      });

      it('should handle optional fields correctly', async () => {
        req.body = {
          agentName: 'Minimal Agent',
          agentWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          agreesToTerms: true
          // No email, description, or tier (should default to 'free')
        };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);
        mockedApiKeyManager.createKey.mockResolvedValue({
          keyId: 'minimal-key-id',
          key: 'minimal-api-key',
          createdAt: new Date()
        });

        await registerAgent(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedApiKeyManager.createKey).toHaveBeenCalledWith(
          expect.objectContaining({
            tier: 'free',
            agentName: 'Minimal Agent',
            email: undefined
          })
        );
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

        await getAgentStatus(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              registered: true,
              agentId: 'test-key-id',
              tier: 'pro',
              isActive: true
            })
          })
        );
      });

      it('should return unregistered status for unknown wallet', async () => {
        req.params = { wallet: testWallet };
        mockedApiKeyManager.findKeyByWallet.mockResolvedValue(null);

        await getAgentStatus(req as Request, res as Response);

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

        await expect(getAgentStatus(req as Request, res as Response)).rejects.toThrow('Database connection error');
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

        await getAgentStatus(req as Request, res as Response);

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

        await getAgentStatus(req as Request, res as Response);

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