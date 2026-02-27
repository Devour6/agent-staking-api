import crypto from 'crypto';
import { storage } from '@/services/storage';
import { logger } from '@/services/logger';
import { 
  WebhookEventType, 
  WebhookEvent, 
  WebhookPayload, 
  WebhookDelivery, 
  WebhookRegistration 
} from '@/types/webhook';

export class WebhookDeliveryService {
  private maxRetries = 3;
  private initialDelayMs = 1000; // 1 second
  private maxDelayMs = 60000; // 1 minute
  private deliveryTimeoutMs = 10000; // 10 seconds

  async deliverWebhook<T extends WebhookEventType>(
    event: T,
    eventData: WebhookEvent[T]
  ): Promise<void> {
    try {
      const webhooks = await storage.getWebhooks();
      const activeWebhooks = webhooks.filter(w => 
        w.active && w.events.includes(event)
      );

      logger.info('Delivering webhook event', {
        event,
        webhookCount: activeWebhooks.length,
      });

      // Create delivery records for each webhook
      const deliveries = await Promise.all(
        activeWebhooks.map(webhook => 
          this.createDeliveryRecord(webhook, event, eventData)
        )
      );

      // Attempt immediate delivery for all webhooks (only once, retries go to background queue)
      await Promise.all(
        deliveries.map(delivery => this.attemptInitialDelivery(delivery))
      );

    } catch (error) {
      logger.error('Failed to initiate webhook deliveries', {
        event,
        error: (error as Error).message,
      });
    }
  }

  private async createDeliveryRecord<T extends WebhookEventType>(
    webhook: WebhookRegistration,
    event: T,
    eventData: WebhookEvent[T]
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: this.generateDeliveryId(),
      webhookId: webhook.id,
      event,
      payload: eventData,
      attempt: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await storage.saveDelivery(delivery);
    return delivery;
  }

  private async attemptInitialDelivery(delivery: WebhookDelivery): Promise<void> {
    // Initial delivery attempt only - no retries, failures go to background queue
    try {
      const webhook = await storage.getWebhookById(delivery.webhookId);
      if (!webhook || !webhook.active) {
        logger.warn('Webhook not found or inactive', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
        });
        return;
      }

      delivery.attempt = 1;
      
      logger.info('Attempting webhook delivery', {
        deliveryId: delivery.id,
        webhookId: delivery.webhookId,
        url: webhook.url,
        attempt: delivery.attempt,
        event: delivery.event,
      });

      const payload: WebhookPayload = {
        event: delivery.event,
        data: delivery.payload,
        webhook: {
          id: webhook.id,
          timestamp: new Date().toISOString(),
        },
      };

      const signature = this.generateSignature(payload, webhook.secret);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.deliveryTimeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature-256': `sha256=${signature}`,
          'X-Webhook-ID': delivery.webhookId,
          'X-Webhook-Event': delivery.event,
          'User-Agent': 'Phase-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      delivery.responseStatus = response.status;
      delivery.responseBody = await response.text().catch(() => '');

      if (response.ok) {
        delivery.status = 'success';
        delivery.deliveredAt = new Date().toISOString();
        
        webhook.lastDeliveryAt = delivery.deliveredAt;
        webhook.failureCount = 0;
        await storage.saveWebhook(webhook);

        logger.info('Webhook delivered successfully', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          responseStatus: response.status,
          attempt: delivery.attempt,
        });
      } else {
        // Mark as failed and set for retry queue
        delivery.status = 'failed';
        delivery.nextRetryAt = this.calculateNextRetry(delivery.attempt);
        
        webhook.failureCount += 1;
        await storage.saveWebhook(webhook);

        logger.warn('Webhook delivery failed', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          responseStatus: delivery.responseStatus,
          attempt: delivery.attempt,
        });
      }

    } catch (error) {
      // Mark as failed and set for retry queue
      delivery.status = 'failed';
      delivery.nextRetryAt = this.calculateNextRetry(1);
      
      const webhook = await storage.getWebhookById(delivery.webhookId);
      if (webhook) {
        webhook.failureCount += 1;
        await storage.saveWebhook(webhook);
      }

      logger.error('Webhook delivery error', {
        deliveryId: delivery.id,
        webhookId: delivery.webhookId,
        error: (error as Error).message,
        attempt: delivery.attempt,
      });
    } finally {
      await storage.saveDelivery(delivery);
    }
  }

  private async attemptDelivery(delivery: WebhookDelivery): Promise<void> {
    try {
      const webhook = await storage.getWebhookById(delivery.webhookId);
      if (!webhook || !webhook.active) {
        logger.warn('Webhook not found or inactive', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
        });
        return;
      }

      delivery.attempt += 1;
      
      logger.info('Attempting webhook delivery', {
        deliveryId: delivery.id,
        webhookId: delivery.webhookId,
        url: webhook.url,
        attempt: delivery.attempt,
        event: delivery.event,
      });

      const payload: WebhookPayload = {
        event: delivery.event,
        data: delivery.payload,
        webhook: {
          id: webhook.id,
          timestamp: new Date().toISOString(),
        },
      };

      const signature = this.generateSignature(payload, webhook.secret);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.deliveryTimeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature-256': `sha256=${signature}`,
          'X-Webhook-ID': delivery.webhookId,
          'X-Webhook-Event': delivery.event,
          'User-Agent': 'Phase-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      delivery.responseStatus = response.status;
      delivery.responseBody = await response.text().catch(() => '');

      if (response.ok) {
        delivery.status = 'success';
        delivery.deliveredAt = new Date().toISOString();
        
        // Update webhook last delivery time
        webhook.lastDeliveryAt = delivery.deliveredAt;
        webhook.failureCount = 0; // Reset failure count on success
        await storage.saveWebhook(webhook);

        logger.info('Webhook delivered successfully', {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          responseStatus: response.status,
          attempt: delivery.attempt,
        });

      } else {
        await this.handleDeliveryFailure(delivery, webhook);
      }

    } catch (error) {
      await this.handleDeliveryError(delivery, error as Error);
    } finally {
      await storage.saveDelivery(delivery);
    }
  }

  private async handleDeliveryFailure(
    delivery: WebhookDelivery, 
    webhook: WebhookRegistration
  ): Promise<void> {
    logger.warn('Webhook delivery failed', {
      deliveryId: delivery.id,
      webhookId: delivery.webhookId,
      responseStatus: delivery.responseStatus,
      attempt: delivery.attempt,
    });

    webhook.failureCount += 1;

    if (delivery.attempt >= this.maxRetries) {
      delivery.status = 'max_retries_reached';
      
      // Disable webhook after too many failures
      if (webhook.failureCount >= 10) {
        webhook.active = false;
        logger.warn('Webhook disabled due to excessive failures', {
          webhookId: webhook.id,
          failureCount: webhook.failureCount,
        });
      }
    } else {
      delivery.status = 'failed';
      delivery.nextRetryAt = this.calculateNextRetry(delivery.attempt);
    }

    await storage.saveWebhook(webhook);
  }

  private async handleDeliveryError(
    delivery: WebhookDelivery, 
    error: Error
  ): Promise<void> {
    logger.error('Webhook delivery error', {
      deliveryId: delivery.id,
      webhookId: delivery.webhookId,
      error: error.message,
      attempt: delivery.attempt,
    });

    const webhook = await storage.getWebhookById(delivery.webhookId);
    if (webhook) {
      webhook.failureCount += 1;
      await storage.saveWebhook(webhook);
    }

    if (delivery.attempt >= this.maxRetries) {
      delivery.status = 'max_retries_reached';
    } else {
      delivery.status = 'failed';
      delivery.nextRetryAt = this.calculateNextRetry(delivery.attempt);
    }
  }

  private calculateNextRetry(attempt: number): string {
    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const delayMs = Math.min(
      this.initialDelayMs * Math.pow(2, attempt - 1),
      this.maxDelayMs
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delayMs;
    const totalDelay = delayMs + jitter;
    
    return new Date(Date.now() + totalDelay).toISOString();
  }

  private generateSignature(payload: WebhookPayload, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  private generateDeliveryId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Process retry queue (called by background worker)
  async processRetryQueue(): Promise<void> {
    try {
      const pendingDeliveries = await storage.getPendingDeliveries();
      
      if (pendingDeliveries.length === 0) {
        return;
      }

      logger.info('Processing retry queue', {
        pendingCount: pendingDeliveries.length,
      });

      // Process deliveries in parallel with limited concurrency
      const concurrency = 5;
      for (let i = 0; i < pendingDeliveries.length; i += concurrency) {
        const batch = pendingDeliveries.slice(i, i + concurrency);
        await Promise.all(
          batch.map(delivery => this.attemptDelivery(delivery))
        );
      }

    } catch (error) {
      logger.error('Failed to process retry queue', {
        error: (error as Error).message,
      });
    }
  }

  // Start background retry processor
  startRetryProcessor(intervalMs: number = 30000): NodeJS.Timeout {
    logger.info('Starting webhook retry processor', {
      intervalMs,
    });

    const timer = setInterval(() => {
      this.processRetryQueue().catch(error => {
        logger.error('Retry processor error', {
          error: (error as Error).message,
        });
      });
    }, intervalMs);
    
    // Unref the timer to prevent it from keeping the process alive
    timer.unref();
    
    return timer;
  }
}

// Singleton instance
export const webhookDeliveryService = new WebhookDeliveryService();