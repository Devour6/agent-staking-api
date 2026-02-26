import request from 'supertest';
import app from '../../src/app';

describe('Health Controller', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('environment');
      expect(response.body.data).toHaveProperty('checks');

      // Verify checks structure
      const checks = response.body.data.checks;
      expect(checks).toHaveProperty('solana');
      expect(checks).toHaveProperty('api');
      expect(checks).toHaveProperty('config');

      // Verify solana check
      expect(checks.solana).toHaveProperty('healthy');
      expect(checks.solana).toHaveProperty('cluster', 'mainnet-beta');

      // Verify api check
      expect(checks.api).toHaveProperty('healthy', true);
      expect(checks.api).toHaveProperty('uptime');
      expect(checks.api).toHaveProperty('memory');

      // Verify config check
      expect(checks.config).toHaveProperty('healthy', true);
      expect(checks.config).toHaveProperty('rpcUrl');
      expect(checks.config).toHaveProperty('validatorConfigured', true);
      expect(checks.config).toHaveProperty('feeWalletConfigured', true);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});