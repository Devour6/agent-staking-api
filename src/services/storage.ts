import fs from 'fs/promises';
import path from 'path';
import { WebhookRegistration, WebhookDelivery } from '@/types/webhook';
import { AgentRegistration, AgentApiKey } from '@/types/agent';
import { logger } from '@/services/logger';

export class SimpleJsonStorage {
  private dataDir: string;
  private webhooksFile: string;
  private deliveriesFile: string;
  private agentsFile: string;
  private agentApiKeysFile: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.webhooksFile = path.join(dataDir, 'webhooks.json');
    this.deliveriesFile = path.join(dataDir, 'deliveries.json');
    this.agentsFile = path.join(dataDir, 'agents.json');
    this.agentApiKeysFile = path.join(dataDir, 'agent-api-keys.json');
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

      try {
        await fs.access(this.agentsFile);
      } catch {
        await fs.writeFile(this.agentsFile, JSON.stringify([], null, 2));
      }

      try {
        await fs.access(this.agentApiKeysFile);
      } catch {
        await fs.writeFile(this.agentApiKeysFile, JSON.stringify([], null, 2));
      }

      logger.info('Storage initialized', {
        dataDir: this.dataDir,
        webhooksFile: this.webhooksFile,
        deliveriesFile: this.deliveriesFile,
        agentsFile: this.agentsFile,
        agentApiKeysFile: this.agentApiKeysFile,
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

  // Agent operations
  async getAgents(): Promise<AgentRegistration[]> {
    try {
      const data = await fs.readFile(this.agentsFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read agents', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  async getAgentById(id: string): Promise<AgentRegistration | null> {
    const agents = await this.getAgents();
    return agents.find(a => a.id === id) || null;
  }

  async getAgentByApiKeyHash(keyHash: string): Promise<AgentRegistration | null> {
    const agents = await this.getAgents();
    return agents.find(a => a.apiKeyHash === keyHash) || null;
  }

  async saveAgent(agent: AgentRegistration): Promise<void> {
    try {
      const agents = await this.getAgents();
      const existingIndex = agents.findIndex(a => a.id === agent.id);
      
      if (existingIndex >= 0) {
        agents[existingIndex] = agent;
      } else {
        agents.push(agent);
      }

      await fs.writeFile(this.agentsFile, JSON.stringify(agents, null, 2));
      logger.debug('Agent saved', { agentId: agent.id });
    } catch (error) {
      logger.error('Failed to save agent', {
        agentId: agent.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async deleteAgent(id: string): Promise<boolean> {
    try {
      const agents = await this.getAgents();
      const initialLength = agents.length;
      const filteredAgents = agents.filter(a => a.id !== id);
      
      if (filteredAgents.length === initialLength) {
        return false; // Agent not found
      }

      await fs.writeFile(this.agentsFile, JSON.stringify(filteredAgents, null, 2));
      logger.info('Agent deleted', { agentId: id });
      return true;
    } catch (error) {
      logger.error('Failed to delete agent', {
        agentId: id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Agent API Key operations
  async getAgentApiKeys(): Promise<AgentApiKey[]> {
    try {
      const data = await fs.readFile(this.agentApiKeysFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read agent API keys', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  async saveAgentApiKey(apiKey: AgentApiKey): Promise<void> {
    try {
      const keys = await this.getAgentApiKeys();
      const existingIndex = keys.findIndex(k => k.agentId === apiKey.agentId);
      
      if (existingIndex >= 0) {
        keys[existingIndex] = apiKey;
      } else {
        keys.push(apiKey);
      }

      await fs.writeFile(this.agentApiKeysFile, JSON.stringify(keys, null, 2));
      logger.debug('Agent API key saved', { agentId: apiKey.agentId });
    } catch (error) {
      logger.error('Failed to save agent API key', {
        agentId: apiKey.agentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async getAgentApiKeyByHash(keyHash: string): Promise<AgentApiKey | null> {
    const keys = await this.getAgentApiKeys();
    return keys.find(k => k.keyHash === keyHash) || null;
  }

  async deleteAgentApiKey(agentId: string): Promise<boolean> {
    try {
      const keys = await this.getAgentApiKeys();
      const initialLength = keys.length;
      const filteredKeys = keys.filter(k => k.agentId !== agentId);
      
      if (filteredKeys.length === initialLength) {
        return false; // Key not found
      }

      await fs.writeFile(this.agentApiKeysFile, JSON.stringify(filteredKeys, null, 2));
      logger.info('Agent API key deleted', { agentId });
      return true;
    } catch (error) {
      logger.error('Failed to delete agent API key', {
        agentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async updateAgentUsage(agentId: string, increment: number = 1): Promise<void> {
    try {
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      agent.usageStats.totalRequests += increment;
      agent.usageStats.requestsThisMonth += increment;
      agent.usageStats.lastRequestAt = now.toISOString();
      
      // Reset monthly stats if it's a new month
      if (!agent.usageStats.monthlyResets[currentMonth]) {
        agent.usageStats.monthlyResets[currentMonth] = agent.usageStats.requestsThisMonth;
        // Reset current month counter
        agent.usageStats.requestsThisMonth = increment;
      }

      agent.updatedAt = now.toISOString();
      await this.saveAgent(agent);
    } catch (error) {
      logger.error('Failed to update agent usage', {
        agentId,
        increment,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// Singleton instance
export const storage = new SimpleJsonStorage();