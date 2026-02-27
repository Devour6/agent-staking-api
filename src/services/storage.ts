import fs from 'fs/promises';
import path from 'path';
import { WebhookRegistration, WebhookDelivery } from '@/types/webhook';
import { logger } from '@/services/logger';

export class SimpleJsonStorage {
  private dataDir: string;
  private webhooksFile: string;
  private deliveriesFile: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.webhooksFile = path.join(dataDir, 'webhooks.json');
    this.deliveriesFile = path.join(dataDir, 'deliveries.json');
  }

  async init(): Promise<void> {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize files if they don't exist
      try {
        await fs.access(this.webhooksFile);
      } catch {
        await fs.writeFile(this.webhooksFile, JSON.stringify([], null, 2));
      }

      try {
        await fs.access(this.deliveriesFile);
      } catch {
        await fs.writeFile(this.deliveriesFile, JSON.stringify([], null, 2));
      }

      logger.info('Storage initialized', {
        dataDir: this.dataDir,
        webhooksFile: this.webhooksFile,
        deliveriesFile: this.deliveriesFile,
      });
    } catch (error) {
      logger.error('Failed to initialize storage', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Webhook operations
  async getWebhooks(): Promise<WebhookRegistration[]> {
    try {
      const data = await fs.readFile(this.webhooksFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read webhooks', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  async getWebhooksByApiKey(apiKey: string): Promise<WebhookRegistration[]> {
    const webhooks = await this.getWebhooks();
    return webhooks.filter(w => w.apiKey === apiKey);
  }

  async getWebhookById(id: string): Promise<WebhookRegistration | null> {
    const webhooks = await this.getWebhooks();
    return webhooks.find(w => w.id === id) || null;
  }

  async saveWebhook(webhook: WebhookRegistration): Promise<void> {
    try {
      const webhooks = await this.getWebhooks();
      const existingIndex = webhooks.findIndex(w => w.id === webhook.id);
      
      if (existingIndex >= 0) {
        webhooks[existingIndex] = webhook;
      } else {
        webhooks.push(webhook);
      }

      await fs.writeFile(this.webhooksFile, JSON.stringify(webhooks, null, 2));
      logger.debug('Webhook saved', { webhookId: webhook.id });
    } catch (error) {
      logger.error('Failed to save webhook', {
        webhookId: webhook.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async deleteWebhook(id: string, apiKey: string): Promise<boolean> {
    try {
      const webhooks = await this.getWebhooks();
      const initialLength = webhooks.length;
      const filteredWebhooks = webhooks.filter(w => !(w.id === id && w.apiKey === apiKey));
      
      if (filteredWebhooks.length === initialLength) {
        return false; // Webhook not found or not owned by this API key
      }

      await fs.writeFile(this.webhooksFile, JSON.stringify(filteredWebhooks, null, 2));
      logger.info('Webhook deleted', { webhookId: id });
      return true;
    } catch (error) {
      logger.error('Failed to delete webhook', {
        webhookId: id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Delivery operations
  async getDeliveries(): Promise<WebhookDelivery[]> {
    try {
      const data = await fs.readFile(this.deliveriesFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read deliveries', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  async saveDelivery(delivery: WebhookDelivery): Promise<void> {
    try {
      const deliveries = await this.getDeliveries();
      const existingIndex = deliveries.findIndex(d => d.id === delivery.id);
      
      if (existingIndex >= 0) {
        deliveries[existingIndex] = delivery;
      } else {
        deliveries.push(delivery);
      }

      await fs.writeFile(this.deliveriesFile, JSON.stringify(deliveries, null, 2));
      logger.debug('Delivery saved', { deliveryId: delivery.id });
    } catch (error) {
      logger.error('Failed to save delivery', {
        deliveryId: delivery.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async getPendingDeliveries(): Promise<WebhookDelivery[]> {
    const deliveries = await this.getDeliveries();
    const now = new Date();
    
    return deliveries.filter(d => 
      d.status === 'pending' && 
      (!d.nextRetryAt || new Date(d.nextRetryAt) <= now)
    );
  }

  async getDeliveriesByWebhookId(webhookId: string): Promise<WebhookDelivery[]> {
    const deliveries = await this.getDeliveries();
    return deliveries.filter(d => d.webhookId === webhookId);
  }

  // Cleanup old deliveries (keep only last 1000 per webhook)
  async cleanupOldDeliveries(): Promise<void> {
    try {
      const deliveries = await this.getDeliveries();
      const webhookGroups: Record<string, WebhookDelivery[]> = {};
      
      // Group by webhook ID
      deliveries.forEach(d => {
        if (!webhookGroups[d.webhookId]) {
          webhookGroups[d.webhookId] = [];
        }
        webhookGroups[d.webhookId]!.push(d);
      });

      // Keep only latest 1000 per webhook
      const cleanedDeliveries: WebhookDelivery[] = [];
      Object.values(webhookGroups).forEach(group => {
        const sorted = group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        cleanedDeliveries.push(...sorted.slice(0, 1000));
      });

      await fs.writeFile(this.deliveriesFile, JSON.stringify(cleanedDeliveries, null, 2));
      logger.info('Cleaned up old deliveries', {
        originalCount: deliveries.length,
        cleanedCount: cleanedDeliveries.length,
      });
    } catch (error) {
      logger.error('Failed to cleanup old deliveries', {
        error: (error as Error).message,
      });
    }
  }
}

// Singleton instance
export const storage = new SimpleJsonStorage();