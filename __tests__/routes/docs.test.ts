import request from 'supertest';
import express from 'express';
import router from '../../src/routes/index';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../src/services/logger');
jest.mock('fs');
jest.mock('path');
jest.mock('swagger-ui-express', () => ({
  serve: jest.fn((req: any, res: any, next: any) => next()),
  setup: jest.fn().mockReturnValue((req: any, res: any) => {
    res.setHeader('content-type', 'text/html');
    res.status(200).send('<!DOCTYPE html><html><body>swagger-ui</body></html>');
  })
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

// Create test app
const app = express();
app.use(express.json());
app.use(router);

describe('Documentation Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock path.join to return a predictable path
    mockPath.join.mockReturnValue('/mock/path/openapi.yaml');
  });

  describe('GET /api/docs', () => {
    it('should return API documentation JSON', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('endpoints');
      expect(Array.isArray(response.body.data.endpoints)).toBe(true);
      
      // Should contain main endpoints
      const endpoints = response.body.data.endpoints;
      expect(endpoints.some((ep: any) => ep.path === '/health')).toBe(true);
      expect(endpoints.some((ep: any) => ep.path === '/stake/build')).toBe(true);
    });

    it('should include authentication requirements in documentation', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.body.data.authentication).toHaveProperty('type');
      expect(response.body.data.authentication).toHaveProperty('description');
      expect(response.body.data.authentication).toHaveProperty('header');
      
      // Should specify API key authentication
      expect(response.body.data.authentication.type).toBe('API Key');
      expect(response.body.data.authentication.header).toContain('Authorization');
    });

    it('should include rate limiting information', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.body.data.rateLimit).toHaveProperty('windowMs');
      expect(response.body.data.rateLimit).toHaveProperty('maxRequests');
      expect(response.body.data.rateLimit).toHaveProperty('description');
    });
  });

  describe('GET /api/docs/openapi', () => {
    it('should return OpenAPI specification when file exists', async () => {
      const mockYamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      summary: Test endpoint
      `;
      
      mockFs.readFileSync.mockReturnValue(mockYamlContent);
      
      const response = await request(app)
        .get('/api/docs/openapi')
        .expect(200);

      expect(response.body.openapi).toBe('3.0.3');
      expect(response.body.info.title).toBe('Test API');
      expect(response.body.paths).toHaveProperty('/test');
      
      // Should update servers with current host
      expect(response.body.servers).toBeDefined();
      expect(Array.isArray(response.body.servers)).toBe(true);
    });

    it('should return fallback spec when file reading fails', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const response = await request(app)
        .get('/api/docs/openapi')
        .expect(200);

      expect(response.body.openapi).toBe('3.0.3');
      expect(response.body.info.title).toBe('Phase Agent Staking API');
      expect(response.body.paths).toHaveProperty('/health');
    });

    it('should inject current server URL into OpenAPI spec', async () => {
      const mockYamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
servers:
  - url: https://api.example.com
    description: Production server
paths: {}
      `;
      
      mockFs.readFileSync.mockReturnValue(mockYamlContent);
      
      const response = await request(app)
        .get('/api/docs/openapi')
        .set('Host', 'localhost:3000')
        .expect(200);

      const currentServerUrl = 'http://localhost:3000/';  // escapeServerUrl normalizes with trailing slash
      expect(response.body.servers[0].url).toBe(currentServerUrl);
      expect(response.body.servers[0].description).toContain('Development');
      
      // Original server should still be present
      expect(response.body.servers.some((s: any) => s.url === 'https://api.example.com')).toBe(true);
    });
  });

  describe('GET /docs (Swagger UI)', () => {
    it('should return Swagger UI HTML page', async () => {
      // Mock successful file read for swagger setup
      mockFs.readFileSync.mockReturnValue(`
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
      `);

      const response = await request(app)
        .get('/docs')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('swagger-ui'); // Swagger UI includes this
    });

    it('should handle file reading errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('OpenAPI file not found');
      });

      // Should still return HTML page with fallback document
      const response = await request(app)
        .get('/docs')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
    });
  });

  describe('Documentation Security', () => {
    it('should not require authentication for documentation endpoints', async () => {
      // These tests verify that documentation endpoints work without auth middleware

      await request(app)
        .get('/api/docs')
        .expect(200);

      await request(app)
        .get('/api/docs/openapi')
        .expect(200);

      await request(app)
        .get('/docs')
        .expect(200);
    });

    it('should include proper Content-Type headers', async () => {
      const docsResponse = await request(app)
        .get('/api/docs')
        .expect(200);
      expect(docsResponse.headers['content-type']).toContain('application/json');

      const openApiResponse = await request(app)
        .get('/api/docs/openapi')
        .expect(200);
      expect(openApiResponse.headers['content-type']).toContain('application/json');

      // Mock file read for Swagger UI
      mockFs.readFileSync.mockReturnValue('openapi: 3.0.3\ninfo:\n  title: Test\npaths: {}');
      const swaggerResponse = await request(app)
        .get('/docs')
        .expect(200);
      expect(swaggerResponse.headers['content-type']).toContain('text/html');
    });
  });
});