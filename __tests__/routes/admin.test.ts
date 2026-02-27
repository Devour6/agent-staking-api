import request from 'supertest';
import express from 'express';
import router from '../../src/routes/index';
import { apiKeyManager } from '../../src/services/apiKeyManager';

// Mock dependencies
jest.mock('../../src/services/apiKeyManager');
jest.mock('../../src/services/logger');
jest.mock('../../src/middleware/auth', () => ({
  authenticateApiKey: (req: any, res: any, next: any) => {
    req.apiKey = 'test-api-key';
    next();
  },
  extractAgentWallet: (req: any, res: any, next: any) => next()
}));
jest.mock('prom-client', () => {
  return {
    default: {
      register: {
        metrics: jest.fn().mockResolvedValue('# Mocked metrics\nhttp_requests_total{} 100\n')
      },
      Registry: jest.fn().mockImplementation(() => ({
        setDefaultLabels: jest.fn(),
        metrics: jest.fn().mockResolvedValue('# Mocked metrics\nhttp_requests_total{} 100\n')
      })),
      Counter: jest.fn(),
      Histogram: jest.fn(),
      Gauge: jest.fn()
    }
  };
});

const mockApiKeyManager = apiKeyManager as jest.Mocked<typeof apiKeyManager>;

// Create test app
const app = express();
app.use(express.json());
app.use(router);

describe('Admin Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mocks
    mockApiKeyManager.listKeys.mockResolvedValue([]);
    mockApiKeyManager.getActiveKeyCount.mockResolvedValue(0);
    mockApiKeyManager.createKey.mockResolvedValue({
      keyId: 'test-key-id',
      key: 'test-api-key',
      createdAt: new Date()
    });
    mockApiKeyManager.revokeKey.mockResolvedValue(true);
  });

  describe('GET /admin/dashboard', () => {
    it('should return HTML dashboard page', async () => {
      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Agent Staking API - Admin Dashboard');
      expect(response.text).toContain('API Calls Today');
      expect(response.text).toContain('Active API Keys');
      expect(response.text).toContain('Total SOL Staked');
    });

    it('should include CSP header for security', async () => {
      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("object-src 'none'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('should escape HTML in agent IDs to prevent XSS', async () => {
      // Mock metrics with potentially dangerous agent IDs
      jest.doMock('prom-client', () => ({
        default: {
          register: {
            metrics: jest.fn().mockResolvedValue('# Metrics with dangerous labels\nhttp_requests_total{agent="<script>alert(\'xss\')</script>"} 100\n')
          }
        }
      }));

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      // Should not contain unescaped script tags
      expect(response.text).not.toContain('<script>alert(');
      // Should contain escaped version
      expect(response.text).toContain('&lt;script&gt;');
    });
  });

  describe('GET /admin/api-keys', () => {
    it('should return JSON list of API keys', async () => {
      const mockKeys = [
        {
          keyId: 'key-1',
          isActive: true,
          createdAt: new Date('2024-01-01'),
          lastUsed: undefined,
          tier: 'free' as const,
          description: undefined
        }
      ];
      
      mockApiKeyManager.listKeys.mockResolvedValue(mockKeys);
      mockApiKeyManager.getActiveKeyCount.mockResolvedValue(1);

      const response = await request(app)
        .get('/admin/api-keys')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('keys');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('active');
      expect(Array.isArray(response.body.data.keys)).toBe(true);
    });

    it('should mask API keys in response', async () => {
      const mockKeys = [
        {
          keyId: 'very-long-api-key-id-12345',
          isActive: true,
          createdAt: new Date(),
          lastUsed: undefined,
          tier: 'pro' as const,
          description: 'Test key'
        }
      ];
      
      mockApiKeyManager.listKeys.mockResolvedValue(mockKeys);

      const response = await request(app)
        .get('/admin/api-keys')
        .expect(200);

      const key = response.body.data.keys[0];
      expect(key.maskedKey).toContain('****');
      expect(key.maskedKey).toContain('very');
      expect(key.maskedKey).toContain('345');
    });
  });

  describe('POST /admin/api-keys', () => {
    it('should create a new API key', async () => {
      const response = await request(app)
        .post('/admin/api-keys')
        .send({
          tier: 'pro',
          description: 'Test key'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('keyId');
      expect(response.body.data).toHaveProperty('key');
      expect(mockApiKeyManager.createKey).toHaveBeenCalledWith({
        tier: 'pro',
        description: 'Test key'
      });
    });

    it('should reject invalid tier', async () => {
      const response = await request(app)
        .post('/admin/api-keys')
        .send({
          tier: 'invalid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TIER');
    });

    it('should default to free tier when not specified', async () => {
      await request(app)
        .post('/admin/api-keys')
        .send({
          description: 'Test key'
        })
        .expect(201);

      expect(mockApiKeyManager.createKey).toHaveBeenCalledWith({
        tier: 'free',
        description: 'Test key'
      });
    });
  });

  describe('DELETE /admin/api-keys/:keyId', () => {
    it('should revoke an API key', async () => {
      const response = await request(app)
        .delete('/admin/api-keys/test-key-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.revoked).toBe(true);
      expect(mockApiKeyManager.revokeKey).toHaveBeenCalledWith('test-key-id');
    });

    it('should return 404 for non-existent key', async () => {
      mockApiKeyManager.revokeKey.mockResolvedValue(false);

      const response = await request(app)
        .delete('/admin/api-keys/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_NOT_FOUND');
    });

    it('should validate keyId parameter', async () => {
      const response = await request(app)
        .delete('/admin/api-keys/')
        .expect(404); // Route not found without keyId

      // Should not call the manager with empty keyId
      expect(mockApiKeyManager.revokeKey).not.toHaveBeenCalled();
    });
  });
});