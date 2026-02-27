// Mock prom-client before any other imports to prevent Registry constructor issues  
jest.mock('prom-client', () => require('../../__mocks__/prom-client.js'));

import { Request, Response, NextFunction } from 'express';
import { apiKeyManager } from '../../src/services/apiKeyManager';
import { 
  getAdminDashboard, 
  getApiKeys, 
  createApiKey, 
  revokeApiKey 
} from '../../src/controllers/admin';

// Mock dependencies
jest.mock('../../src/services/apiKeyManager');
jest.mock('../../src/services/logger');

const mockApiKeyManager = apiKeyManager as jest.Mocked<typeof apiKeyManager>;

// Mock request and response objects
const createMockReq = (overrides: any = {}) => ({
  params: {},
  body: {},
  ...overrides
} as Request);

const createMockRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe('Admin Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getApiKeys', () => {
    it('should return list of API keys', async () => {
      const mockKeys = [
        {
          keyId: 'test-key-1',
          createdAt: new Date('2024-01-01'),
          lastUsed: undefined,
          isActive: true,
          tier: 'free' as const,
          description: undefined
        },
        {
          keyId: 'test-key-2',
          createdAt: new Date('2024-01-02'),
          lastUsed: undefined,
          isActive: false,
          tier: 'pro' as const,
          description: undefined
        }
      ];

      mockApiKeyManager.listKeys.mockResolvedValue(mockKeys);
      (mockApiKeyManager as any).getActiveKeyCount = jest.fn().mockResolvedValue(1);

      const req = createMockReq();
      const res = createMockRes();

      const next = jest.fn() as NextFunction;
      getApiKeys(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(next).not.toHaveBeenCalled(); // Should not have errors
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keys: expect.arrayContaining([
            expect.objectContaining({
              keyId: 'test-key-1',
              tier: 'free'
            })
          ]),
          total: 2,
          active: 1
        })
      }));
    });
  });

  describe('createApiKey', () => {
    it('should create a new API key', async () => {
      const mockNewKey = {
        keyId: 'new-key-id',
        key: 'new-api-key-value',
        createdAt: new Date('2024-01-01')
      };

      mockApiKeyManager.createKey.mockResolvedValue(mockNewKey);

      const req = createMockReq({
        body: {
          tier: 'pro',
          description: 'Test API key'
        }
      });
      const res = createMockRes();

      const next = jest.fn() as NextFunction;
      await createApiKey(req, res, next);

      expect(mockApiKeyManager.createKey).toHaveBeenCalledWith({
        tier: 'pro',
        description: 'Test API key'
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyId: 'new-key-id',
          key: 'new-api-key-value'
        })
      }));
    });

    it('should reject invalid tier', async () => {
      const req = createMockReq({
        body: {
          tier: 'invalid-tier'
        }
      });
      const res = createMockRes();

      const next = jest.fn() as NextFunction;
      createApiKey(req, res, next);
      await new Promise(resolve => setImmediate(resolve));
      
      // With asyncHandler, errors are passed to next(), not thrown directly
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Invalid tier')
      }));
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', async () => {
      mockApiKeyManager.revokeKey.mockResolvedValue(true);

      const req = createMockReq({
        params: { keyId: 'test-key-id' }
      });
      const res = createMockRes();

      const next = jest.fn() as NextFunction;
      await revokeApiKey(req, res, next);

      expect(mockApiKeyManager.revokeKey).toHaveBeenCalledWith('test-key-id');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          keyId: 'test-key-id',
          revoked: true
        })
      }));
    });

    it('should throw error if key not found', async () => {
      mockApiKeyManager.revokeKey.mockResolvedValue(false);

      const req = createMockReq({
        params: { keyId: 'nonexistent-key' }
      });
      const res = createMockRes();

      const next = jest.fn() as NextFunction;
      revokeApiKey(req, res, next);
      
      // asyncHandler returns void (not Promise), so we need to flush microtasks
      await new Promise(resolve => setImmediate(resolve));
      
      // With asyncHandler, errors are passed to next(), not thrown directly
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('API key not found')
      }));
    });
  });
});