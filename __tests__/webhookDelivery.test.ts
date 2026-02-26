import { webhookDeliveryService } from '../src/services/webhookDelivery';
import { storage } from '../src/services/storage';
import { WebhookRegistration } from '../src/types/webhook';

// Mock fetch for testing webhook delivery
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('WebhookDeliveryService', () => {
  beforeAll(async () => {
    await storage.init();
  });

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('deliverWebhook', () => {
    let testWebhook: WebhookRegistration;

    beforeEach(async () => {
      testWebhook = {
        id: 'test-webhook-id',
        apiKey: 'test-api-key',
        url: 'https://example.com/webhook',
        events: ['stake_confirmed', 'stake_activated'],
        secret: 'test-secret',
        active: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
      };

      await storage.saveWebhook(testWebhook);
    });

    it('should deliver webhook successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      expect(mockFetch).toHaveBeenCalledWith(
        testWebhook.url,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature-256': expect.stringMatching(/^sha256=[a-f0-9]+$/),
            'X-Webhook-ID': testWebhook.id,
            'X-Webhook-Event': 'stake_confirmed',
            'User-Agent': 'Phase-Webhooks/1.0',
          }),
          body: expect.stringContaining('"event":"stake_confirmed"'),
        })
      );
    });

    it('should include correct payload structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      const call = mockFetch.mock.calls[0];
      const payload = JSON.parse(call[1].body);

      expect(payload).toHaveProperty('event', 'stake_confirmed');
      expect(payload).toHaveProperty('data', eventData);
      expect(payload).toHaveProperty('webhook');
      expect(payload.webhook).toHaveProperty('id', testWebhook.id);
      expect(payload.webhook).toHaveProperty('timestamp');
    });

    it('should generate correct HMAC signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      const call = mockFetch.mock.calls[0];
      const signature = call[1].headers['X-Webhook-Signature-256'];
      
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      
      // Verify signature can be computed
      const crypto = require('crypto');
      const payload = call[1].body;
      const expectedSignature = crypto
        .createHmac('sha256', testWebhook.secret)
        .update(payload, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(`sha256=${expectedSignature}`);
    });

    it('should handle webhook delivery failure with retry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      // Should still call fetch once (retry logic happens in background)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Check that delivery record was created
      const deliveries = await storage.getDeliveriesByWebhookId(testWebhook.id);
      expect(deliveries.length).toBe(1);
      expect(deliveries[0]?.status).toBe('failed');
      expect(deliveries[0]).toHaveProperty('nextRetryAt');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Check that delivery record was created with error status
      const deliveries = await storage.getDeliveriesByWebhookId(testWebhook.id);
      expect(deliveries.length).toBe(1);
      expect(deliveries[0]?.status).toBe('failed');
    });

    it('should only deliver to webhooks subscribed to the event', async () => {
      // Create webhook that doesn't subscribe to the event
      const otherWebhook: WebhookRegistration = {
        id: 'other-webhook-id',
        apiKey: 'other-api-key',
        url: 'https://other.example.com/webhook',
        events: ['validator_delinquent'], // Different event
        secret: 'other-secret',
        active: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
      };

      await storage.saveWebhook(otherWebhook);

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      // Should only call the subscribed webhook
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        testWebhook.url,
        expect.anything()
      );
    });

    it('should not deliver to inactive webhooks', async () => {
      // Deactivate the webhook
      testWebhook.active = false;
      await storage.saveWebhook(testWebhook);

      const eventData = {
        transactionSignature: 'test-signature',
        amount: 1000000000,
        validatorVoteAccount: 'test-validator',
        agentWallet: 'test-agent',
        stakeAccount: 'test-stake',
        timestamp: new Date().toISOString(),
      };

      await webhookDeliveryService.deliverWebhook('stake_confirmed', eventData);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('processRetryQueue', () => {
    it('should retry failed deliveries', async () => {
      // Create a failed delivery record
      const failedDelivery = {
        id: 'failed-delivery-id',
        webhookId: 'test-webhook-id',
        event: 'stake_confirmed' as const,
        payload: {
          transactionSignature: 'test-signature',
          amount: 1000000000,
          validatorVoteAccount: 'test-validator',
          agentWallet: 'test-agent',
          stakeAccount: 'test-stake',
          timestamp: new Date().toISOString(),
        },
        attempt: 1,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      await storage.saveDelivery(failedDelivery);

      // Create webhook for the delivery
      const webhook: WebhookRegistration = {
        id: 'test-webhook-id',
        apiKey: 'test-api-key',
        url: 'https://retry.example.com/webhook',
        events: ['stake_confirmed'],
        secret: 'test-secret',
        active: true,
        createdAt: new Date().toISOString(),
        failureCount: 1,
      };

      await storage.saveWebhook(webhook);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      await webhookDeliveryService.processRetryQueue();

      expect(mockFetch).toHaveBeenCalledWith(
        webhook.url,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should not retry deliveries that have reached max attempts', async () => {
      const maxRetriesDelivery = {
        id: 'max-retries-delivery-id',
        webhookId: 'test-webhook-id',
        event: 'stake_confirmed' as const,
        payload: {
          transactionSignature: 'test-signature',
          amount: 1000000000,
          validatorVoteAccount: 'test-validator',
          agentWallet: 'test-agent',
          stakeAccount: 'test-stake',
          timestamp: new Date().toISOString(),
        },
        attempt: 3, // Already at max retries
        status: 'max_retries_reached' as const,
        createdAt: new Date().toISOString(),
      };

      await storage.saveDelivery(maxRetriesDelivery);

      await webhookDeliveryService.processRetryQueue();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});