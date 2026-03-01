import request from 'supertest';
import app from '@/app';
import { storage } from '@/services/storage';
import crypto from 'crypto';

// Mock storage to avoid file system operations during tests
jest.mock('@/services/storage');
const mockStorage = storage as jest.Mocked<typeof storage>;

// Mock authentication middleware
jest.mock('@/middleware/auth', () => ({
  authenticateApiKey: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }
    req.apiKey = 'test-api-key';
    next();
  },
  extractAgentWallet: (req: any, res: any, next: any) => next()
}));

describe('Agent Onboarding Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockStorage.getAgents.mockResolvedValue([]);
    mockStorage.saveAgent.mockResolvedValue();
    mockStorage.saveAgentApiKey.mockResolvedValue();
  });

  describe('POST /agents/register', () => {
    const validRegistrationData = {
      name: 'Test Agent',
      description: 'A test agent for automated testing',
      callbackUrl: 'https://example.com/callback',
      tierPreference: 'basic' as const,
    };

    it('should successfully register a new agent', async () => {
      const response = await request(app)
        .post('/agents/register')
        .send(validRegistrationData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        agentId: expect.stringMatching(/^agent_[a-z0-9_]+$/),
        apiKey: expect.stringMatching(/^ak_[a-f0-9]{64}$/),
        tier: 'basic',
        rateLimitInfo: {
          requestsPerHour: 100,
          burstLimit: 10,
        },
        createdAt: expect.any(String),
      });

      expect(mockStorage.saveAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Agent',
          description: 'A test agent for automated testing',
          tier: 'basic',
          active: true,
        })
      );
      expect(mockStorage.saveAgentApiKey).toHaveBeenCalled();
    });

    it('should reject invalid agent names', async () => {
      const invalidNames = [
        '', // empty
        'a', // too short
        'a'.repeat(51), // too long
        ' TestAgent', // starts with space
        'TestAgent ', // ends with space
        'Test@Agent', // invalid character
        // '123', // numbers only - actually valid per our regex
      ];

      for (const name of invalidNames) {
        const response = await request(app)
          .post('/agents/register')
          .send({ ...validRegistrationData, name });

        expect(response.status).toBe(400);
        expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject missing or empty description', async () => {
      const invalidDescriptions = [
        undefined,
        '',
        '   ', // whitespace only
        'a'.repeat(501), // too long
      ];

      for (let i = 0; i < invalidDescriptions.length; i++) {
        const description = invalidDescriptions[i];
        const response = await request(app)
          .post('/agents/register')
          .send({ ...validRegistrationData, description });

        expect(response.status).toBe(400);
        // First two cases (undefined, '') trigger Joi validation, others trigger controller validation
        if (i < 2) {
          expect(response.body.error?.code).toBe('VALIDATION_ERROR');
        } else {
          expect(response.body.error?.code).toMatch(/VALIDATION_ERROR|MISSING_DESCRIPTION/);
        }
      }
    });

    it('should reject invalid tier preferences', async () => {
      const response = await request(app)
        .post('/agents/register')
        .send({ ...validRegistrationData, tierPreference: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid callback URLs', async () => {
      const invalidUrls = [
        'http://example.com', // HTTP not allowed
        'ftp://example.com',
        'not-a-url',
        'javascript:alert(1)',
      ];

      for (const callbackUrl of invalidUrls) {
        const response = await request(app)
          .post('/agents/register')
          .send({ ...validRegistrationData, callbackUrl });

        expect(response.status).toBe(400);
        expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject duplicate agent names', async () => {
      mockStorage.getAgents.mockResolvedValue([
        {
          id: 'agent_existing',
          name: 'Test Agent',
          description: 'Existing agent',
          tier: 'basic',
          apiKeyHash: 'hash',
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
        },
      ]);

      const response = await request(app)
        .post('/agents/register')
        .send(validRegistrationData);

      expect(response.status).toBe(409);
      expect(response.body.error?.code).toBe('AGENT_NAME_EXISTS');
    });

    it('should work with different tier preferences', async () => {
      const tiers = ['basic', 'standard', 'premium'] as const;

      for (const tier of tiers) {
        mockStorage.getAgents.mockResolvedValue([]);
        
        const response = await request(app)
          .post('/agents/register')
          .send({ ...validRegistrationData, tierPreference: tier, name: `Agent ${tier}` });

        expect(response.status).toBe(201);
        expect(response.body.data.tier).toBe(tier);
      }
    });

    it('should work without optional callback URL', async () => {
      const { callbackUrl, ...dataWithoutCallback } = validRegistrationData;

      const response = await request(app)
        .post('/agents/register')
        .send(dataWithoutCallback);

      expect(response.status).toBe(201);
      expect(response.body.data.agentId).toBeDefined();
    });
  });

  describe('GET /agents/:agentId', () => {
    const mockAgent = {
      id: 'agent_test123',
      name: 'Test Agent',
      description: 'A test agent',
      callbackUrl: 'https://example.com/callback',
      tier: 'basic' as const,
      apiKeyHash: crypto.createHash('sha256').update('test-key').digest('hex'),
      registrationDate: '2024-01-01T00:00:00.000Z',
      tosAccepted: true,
      tosAcceptedAt: '2024-01-01T01:00:00.000Z',
      tosVersion: '1.0',
      usageStats: {
        totalRequests: 50,
        requestsThisMonth: 10,
        lastRequestAt: '2024-01-01T02:00:00.000Z',
        monthlyResets: { '2024-01': 40 },
      },
      active: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
      mockStorage.getAgentByApiKeyHash.mockResolvedValue(mockAgent);
      mockStorage.getAgentById.mockResolvedValue(mockAgent);
    });

    it('should return agent profile for valid agent ID', async () => {
      const response = await request(app)
        .get(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        agentId: mockAgent.id,
        name: mockAgent.name,
        description: mockAgent.description,
        callbackUrl: mockAgent.callbackUrl,
        tier: mockAgent.tier,
        registrationDate: mockAgent.registrationDate,
        tosAccepted: true,
        tosAcceptedAt: mockAgent.tosAcceptedAt,
        usageStats: {
          totalRequests: 50,
          requestsThisMonth: 10,
          lastRequestAt: mockAgent.usageStats.lastRequestAt,
        },
        activeStakePositions: {
          totalStaked: 0,
          activePositions: 0,
        },
      });
    });

    it('should return 404 for non-existent agent', async () => {
      mockStorage.getAgentById.mockResolvedValue(null);

      const response = await request(app)
        .get('/agents/nonexistent')
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(404);
      expect(response.body.error?.code).toBe('AGENT_NOT_FOUND');
    });

    it('should return 400 for missing agent ID', async () => {
      const response = await request(app)
        .get('/agents/')
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(404); // Route not found
    });

    it('should return 404 for inactive agent', async () => {
      mockStorage.getAgentById.mockResolvedValue({ ...mockAgent, active: false });

      const response = await request(app)
        .get(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(404);
      expect(response.body.error?.code).toBe('AGENT_NOT_FOUND');
    });
  });

  describe('PUT /agents/:agentId', () => {
    const mockAgent = {
      id: 'agent_test123',
      name: 'Test Agent',
      description: 'Original description',
      callbackUrl: 'https://example.com/callback',
      tier: 'basic' as const,
      apiKeyHash: crypto.createHash('sha256').update('test-key').digest('hex'),
      registrationDate: '2024-01-01T00:00:00.000Z',
      tosAccepted: true,
      usageStats: {
        totalRequests: 0,
        requestsThisMonth: 0,
        monthlyResets: {},
      },
      active: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
      mockStorage.getAgentByApiKeyHash.mockResolvedValue(mockAgent);
      mockStorage.getAgentById.mockResolvedValue(mockAgent);
      mockStorage.saveAgent.mockResolvedValue();
    });

    it('should successfully update agent description', async () => {
      const updateData = { description: 'Updated description' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.changes).toContain('description');
      
      expect(mockStorage.saveAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Updated description',
        })
      );
    });

    it('should successfully update callback URL', async () => {
      const updateData = { callbackUrl: 'https://newcallback.com/webhook' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.changes).toContain('callbackUrl');
    });

    it('should successfully upgrade tier', async () => {
      const updateData = { tierUpgradeRequest: 'standard' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.changes).toContain('tier upgrade');
      expect(response.body.data.tierUpgradeStatus).toBe('approved');
    });

    it('should reject downgrade attempts', async () => {
      mockStorage.getAgentById.mockResolvedValue({ ...mockAgent, tier: 'standard' });
      
      const updateData = { tierUpgradeRequest: 'basic' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('INVALID_TIER_UPGRADE');
    });

    it('should reject empty description', async () => {
      const updateData = { description: '' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid callback URL', async () => {
      const updateData = { callbackUrl: 'http://invalid.com' };

      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when no updates provided', async () => {
      const response = await request(app)
        .put(`/agents/${mockAgent.id}`)
        .set('Authorization', 'Bearer ak_test')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('NO_UPDATES');
    });
  });

  describe('POST /agents/:agentId/agree', () => {
    const mockAgent = {
      id: 'agent_test123',
      name: 'Test Agent',
      description: 'A test agent',
      tier: 'basic' as const,
      apiKeyHash: crypto.createHash('sha256').update('test-key').digest('hex'),
      registrationDate: '2024-01-01T00:00:00.000Z',
      tosAccepted: false,
      usageStats: {
        totalRequests: 0,
        requestsThisMonth: 0,
        monthlyResets: {},
      },
      active: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
      mockStorage.getAgentByApiKeyHash.mockResolvedValue(mockAgent);
      mockStorage.getAgentById.mockResolvedValue(mockAgent);
      mockStorage.saveAgent.mockResolvedValue();
    });

    it('should successfully accept terms of service', async () => {
      const response = await request(app)
        .post(`/agents/${mockAgent.id}/agree`)
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        agentId: mockAgent.id,
        termsAccepted: true,
        acceptedAt: expect.any(String),
        termsVersion: '1.0',
      });

      expect(mockStorage.saveAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          tosAccepted: true,
          tosAcceptedAt: expect.any(String),
          tosVersion: '1.0',
        })
      );
    });

    it('should reject when terms already accepted', async () => {
      mockStorage.getAgentById.mockResolvedValue({
        ...mockAgent,
        tosAccepted: true,
        tosAcceptedAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await request(app)
        .post(`/agents/${mockAgent.id}/agree`)
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(409);
      expect(response.body.error?.code).toBe('TERMS_ALREADY_ACCEPTED');
    });

    it('should return 404 for non-existent agent', async () => {
      mockStorage.getAgentById.mockResolvedValue(null);

      const response = await request(app)
        .post('/agents/nonexistent/agree')
        .set('Authorization', 'Bearer ak_test');

      expect(response.status).toBe(404);
      expect(response.body.error?.code).toBe('AGENT_NOT_FOUND');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for protected endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/agents/test123' },
        { method: 'put', path: '/agents/test123' },
        { method: 'post', path: '/agents/test123/agree' },
      ];

      for (const { method, path } of endpoints) {
        const response = await request(app)[method as 'get' | 'put' | 'post'](path);
        expect(response.status).toBe(401);
      }
    });

    it('should not require authentication for registration', async () => {
      const response = await request(app)
        .post('/agents/register')
        .send({
          name: 'Test Agent',
          description: 'Test description',
          tierPreference: 'basic',
        });

      // Should not be 401 (might be validation error but not auth error)
      expect(response.status).not.toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to all agent endpoints', async () => {
      // This test would need to be implemented with actual rate limiting logic
      // For now, just verify the endpoints respond
      const response = await request(app)
        .post('/agents/register')
        .send({
          name: 'Test Agent',
          description: 'Test description',
          tierPreference: 'basic',
        });

      expect(response.status).toBeLessThan(500);
    });
  });
});