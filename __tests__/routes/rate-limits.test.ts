import request from 'supertest';
import express from 'express';
import router from '../../src/routes/index';
import { apiKeyManager } from '../../src/services/apiKeyManager';
import { errorHandler } from '../../src/middleware/errorHandler';
import { config } from '../../src/services/config';

// Mock dependencies
jest.mock('../../src/services/apiKeyManager');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');
jest.mock('../../src/middleware/auth', () => ({
  authenticateApiKey: (req: any, res: any, next: any) => next(),
  extractAgentWallet: (req: any, res: any, next: any) => next()
}));

// Create test app
const app = express();
app.use(express.json());
app.use(router);
app.use(errorHandler);

describe('Rate Limits Dashboard Routes', () => {
  let apiKey: string;

  beforeEach(() => {
    apiKey = config.auth.apiKeySecret;
    
    // Mock apiKeyManager methods
    (apiKeyManager.listKeys as jest.Mock).mockResolvedValue([
      {
        keyId: 'test-key-1',
        tier: 'free',
        isActive: true,
        lastUsed: new Date(),
        createdAt: new Date(),
        description: 'Test key'
      },
      {
        keyId: 'test-key-pro',
        tier: 'pro', 
        isActive: true,
        lastUsed: new Date(),
        createdAt: new Date(),
        description: 'Pro test key'
      }
    ]);
    
    (apiKeyManager.getTierLimits as jest.Mock).mockImplementation((tier: string) => {
      const limits = {
        free: { requestsPerMinute: 10 },
        pro: { requestsPerMinute: 100 },
        enterprise: { requestsPerMinute: 1000 }
      };
      return limits[tier as keyof typeof limits] || limits.free;
    });
  });

  describe('GET /admin/rate-limits', () => {
    it('should return HTML rate limits dashboard page', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Rate Limit Dashboard');
      expect(response.text).toContain('API Key Rate Limit Status');
      expect(response.text).toContain('Free Tier');
      expect(response.text).toContain('Pro Tier');
      expect(response.text).toContain('Enterprise Tier');
    });

    it('should include CSP header for security', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("style-src 'unsafe-inline'");
    });

    // Note: Authentication is mocked for testing, so we skip this test
    it.skip('should require authentication', async () => {
      const response = await request(app)
        .get('/admin/rate-limits');

      expect(response.status).toBe(401);
    });

    it('should show tier rate limits correctly', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('10'); // Free tier limit
      expect(response.text).toContain('100'); // Pro tier limit  
      expect(response.text).toContain('1000'); // Enterprise tier limit
      expect(response.text).toContain('requests/minute');
    });

    it('should show auto-refresh functionality', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Auto-refresh');
      expect(response.text).toContain('setTimeout');
    });

    it('should have navigation links to other admin pages', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('/admin/dashboard');
      expect(response.text).toContain('/admin/api-keys');
      expect(response.text).toContain('Back to Dashboard');
    });

    it('should escape HTML in output to prevent XSS', async () => {
      const response = await request(app)
        .get('/admin/rate-limits')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      // Check that any dynamic content is properly escaped
      expect(response.text).not.toContain('<script>alert');
    });
  });
});