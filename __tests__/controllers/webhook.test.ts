import request from 'supertest';
import { Application } from 'express';
import { createApp } from '@/app';
import { storage } from '@/services/storage';
import { WebhookRegistration } from '@/types/webhook';

jest.mock('@/services/storage');

describe('Webhook Controller', () => {
  let app: Application;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks', () => {
    it('should register a new webhook successfully', async () => {
      const mockWebhook: WebhookRegistration = {
        id: 'webhook-123',
        url: 'https://example.com/webhook',
        events: ['stake_confirmed', 'stake_activated'],
        secret: 'generated-secret-123',
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        lastDeliveryAt: undefined,
        failureCount: 0,
      };

      (storage.saveWebhook as jest.Mock).mockResolvedValue(undefined);
      (storage.generateWebhookSecret as jest.Mock).mockReturnValue('generated-secret-123');

      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['stake_confirmed', 'stake_activated'],
        })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        webhook: {
          id: expect.any(String),
          url: 'https://example.com/webhook',
          events: ['stake_confirmed', 'stake_activated'],
          secret: 'generated-secret-123',
          active: true,
          createdAt: expect.any(String),
        },
        timestamp: expect.any(String),
      });

      expect(storage.saveWebhook).toHaveBeenCalledTimes(1);
    });

    it('should validate webhook URL format', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'invalid-url',
          events: ['stake_confirmed'],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(storage.saveWebhook).not.toHaveBeenCalled();
    });

    it('should validate webhook events are supported', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['invalid_event'],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(storage.saveWebhook).not.toHaveBeenCalled();
    });

    it('should require at least one event', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: [],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(storage.saveWebhook).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      (storage.saveWebhook as jest.Mock).mockRejectedValue(mockError);

      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['stake_confirmed'],
        })
        .expect(500);

      expect(response.body.error.code).toBe('WEBHOOK_REGISTRATION_ERROR');
      expect(storage.saveWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/webhooks', () => {
    it('should list all webhooks', async () => {
      const mockWebhooks: WebhookRegistration[] = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          events: ['stake_confirmed'],
          secret: 'secret-1',
          active: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          lastDeliveryAt: undefined,
          failureCount: 0,
        },
        {
          id: 'webhook-2',
          url: 'https://example.com/webhook2',
          events: ['stake_activated'],
          secret: 'secret-2',
          active: true,
          createdAt: '2024-01-01T01:00:00.000Z',
          lastDeliveryAt: '2024-01-01T02:00:00.000Z',
          failureCount: 0,
        },
      ];

      (storage.getWebhooks as jest.Mock).mockResolvedValue(mockWebhooks);

      const response = await request(app)
        .get('/api/webhooks')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        webhooks: mockWebhooks.map(w => ({
          id: w.id,
          url: w.url,
          events: w.events,
          active: w.active,
          createdAt: w.createdAt,
          lastDeliveryAt: w.lastDeliveryAt,
          failureCount: w.failureCount,
        })),
        timestamp: expect.any(String),
      });

      expect(storage.getWebhooks).toHaveBeenCalledTimes(1);
    });

    it('should handle empty webhook list', async () => {
      (storage.getWebhooks as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/webhooks')
        .expect(200);

      expect(response.body.webhooks).toEqual([]);
      expect(storage.getWebhooks).toHaveBeenCalledTimes(1);
    });

    it('should handle storage errors', async () => {
      const mockError = new Error('Database read failed');
      (storage.getWebhooks as jest.Mock).mockRejectedValue(mockError);

      const response = await request(app)
        .get('/api/webhooks')
        .expect(500);

      expect(response.body.error.code).toBe('WEBHOOK_LIST_ERROR');
    });
  });

  describe('DELETE /api/webhooks/:id', () => {
    it('should delete webhook successfully', async () => {
      (storage.deleteWebhook as jest.Mock).mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/webhooks/webhook-123')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Webhook deleted successfully',
        timestamp: expect.any(String),
      });

      expect(storage.deleteWebhook).toHaveBeenCalledWith('webhook-123');
    });

    it('should handle webhook not found', async () => {
      (storage.deleteWebhook as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/webhooks/nonexistent')
        .expect(404);

      expect(response.body.error.code).toBe('WEBHOOK_NOT_FOUND');
      expect(storage.deleteWebhook).toHaveBeenCalledWith('nonexistent');
    });

    it('should handle storage deletion errors', async () => {
      const mockError = new Error('Database deletion failed');
      (storage.deleteWebhook as jest.Mock).mockRejectedValue(mockError);

      const response = await request(app)
        .delete('/api/webhooks/webhook-123')
        .expect(500);

      expect(response.body.error.code).toBe('WEBHOOK_DELETION_ERROR');
    });
  });
});