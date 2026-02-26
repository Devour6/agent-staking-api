import request from 'supertest';
import app from '../src/app';
import { storage } from '../src/services/storage';

describe('Webhook API', () => {
  const validApiKey = 'a'.repeat(64); // Valid hex string format
  const testWebhookUrl = 'https://example.com/webhook';

  beforeAll(async () => {
    // Initialize storage for tests
    await storage.init();
  });

  beforeEach(async () => {
    // Clean up any existing webhooks to avoid duplicates
    const webhooks = await storage.getWebhooksByApiKey(validApiKey);
    for (const webhook of webhooks) {
      await storage.deleteWebhook(webhook.id, validApiKey);
    }
  });

  describe('POST /webhooks/register', () => {
    it('should register a new webhook successfully', async () => {
      const webhookData = {
        url: `${testWebhookUrl}/register-${Date.now()}`,
        events: ['stake_confirmed', 'stake_activated'],
      };

      const response = await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('secret');
      expect(response.body.data.url).toBe(testWebhookUrl);
      expect(response.body.data.events).toEqual(webhookData.events);
      expect(response.body.data).toHaveProperty('createdAt');
    });

    it('should reject invalid webhook URL', async () => {
      const webhookData = {
        url: 'http://example.com/webhook', // HTTP not allowed
        events: ['stake_confirmed'],
      };

      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(400);
    });

    it('should reject invalid events', async () => {
      const webhookData = {
        url: testWebhookUrl,
        events: ['invalid_event'],
      };

      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(400);
    });

    it('should require authentication', async () => {
      const webhookData = {
        url: testWebhookUrl,
        events: ['stake_confirmed'],
      };

      await request(app)
        .post('/webhooks/register')
        .send(webhookData)
        .expect(401);
    });

    it('should prevent duplicate webhook URLs', async () => {
      const webhookData = {
        url: 'https://unique.example.com/webhook',
        events: ['stake_confirmed'],
      };

      // Register first webhook
      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(201);

      // Try to register duplicate
      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(409);
    });

    it('should accept custom secret', async () => {
      const customSecret = 'my-custom-secret-key';
      const webhookData = {
        url: 'https://custom-secret.example.com/webhook',
        events: ['stake_confirmed'],
        secret: customSecret,
      };

      const response = await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(webhookData)
        .expect(201);

      expect(response.body.data.secret).toBe(customSecret);
    });
  });

  describe('GET /webhooks', () => {
    beforeEach(async () => {
      // Clean up and register test webhook
      const testWebhook = {
        url: `https://list-test.example.com/webhook/${Date.now()}`,
        events: ['stake_confirmed', 'validator_delinquent'],
      };

      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(testWebhook);
    });

    it('should list webhooks for authenticated user', async () => {
      const response = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('webhooks');
      expect(Array.isArray(response.body.data.webhooks)).toBe(true);
      expect(response.body.data.webhooks.length).toBeGreaterThan(0);

      const webhook = response.body.data.webhooks[0];
      expect(webhook).toHaveProperty('id');
      expect(webhook).toHaveProperty('url');
      expect(webhook).toHaveProperty('events');
      expect(webhook).toHaveProperty('active');
      expect(webhook).toHaveProperty('createdAt');
      expect(webhook).not.toHaveProperty('secret'); // Should not expose secret
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/webhooks')
        .expect(401);
    });

    it('should only show webhooks for the authenticated API key', async () => {
      const otherApiKey = 'b'.repeat(64);
      
      // Register webhook with different API key
      await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${otherApiKey}`)
        .send({
          url: 'https://other-api-key.example.com/webhook',
          events: ['stake_confirmed'],
        });

      // List webhooks with original API key
      const response = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      // Should not see webhooks from other API key
      const otherKeyWebhooks = response.body.data.webhooks.filter(
        (w: any) => w.url === 'https://other-api-key.example.com/webhook'
      );
      expect(otherKeyWebhooks.length).toBe(0);
    });
  });

  describe('DELETE /webhooks/:id', () => {
    let webhookId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          url: `https://delete-test.example.com/webhook/${Date.now()}`,
          events: ['stake_confirmed'],
        });

      webhookId = response.body.data?.id;
    });

    it('should delete webhook successfully', async () => {
      const response = await request(app)
        .delete(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.webhookId).toBe(webhookId);

      // Verify webhook is deleted
      const listResponse = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${validApiKey}`);

      const deletedWebhook = listResponse.body.data.webhooks.find(
        (w: any) => w.id === webhookId
      );
      expect(deletedWebhook).toBeUndefined();
    });

    it('should return 404 for non-existent webhook', async () => {
      await request(app)
        .delete('/webhooks/non-existent-id')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete(`/webhooks/${webhookId}`)
        .expect(401);
    });

    it('should only allow deletion of own webhooks', async () => {
      const otherApiKey = 'b'.repeat(64);

      await request(app)
        .delete(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${otherApiKey}`)
        .expect(404);
    });
  });

  describe('GET /webhooks/:id/deliveries', () => {
    let webhookId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/webhooks/register')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          url: `https://deliveries-test.example.com/webhook/${Date.now()}`,
          events: ['stake_confirmed'],
        });

      webhookId = response.body.data?.id;
    });

    it('should return delivery history for webhook', async () => {
      const response = await request(app)
        .get(`/webhooks/${webhookId}/deliveries`)
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('deliveries');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('limit');
      expect(response.body.data).toHaveProperty('offset');
      expect(Array.isArray(response.body.data.deliveries)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get(`/webhooks/${webhookId}/deliveries?limit=10&offset=5`)
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.offset).toBe(5);
    });

    it('should require authentication', async () => {
      await request(app)
        .get(`/webhooks/${webhookId}/deliveries`)
        .expect(401);
    });

    it('should return 404 for webhooks not owned by API key', async () => {
      const otherApiKey = 'b'.repeat(64);

      await request(app)
        .get(`/webhooks/${webhookId}/deliveries`)
        .set('Authorization', `Bearer ${otherApiKey}`)
        .expect(404);
    });
  });
});