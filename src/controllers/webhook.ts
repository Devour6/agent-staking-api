import { Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from '@/services/storage';
import { logger } from '@/services/logger';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { 
  WebhookRegistration,
  RegisterWebhookRequest, 
  RegisterWebhookResponse,
  ListWebhooksResponse,
  WebhookEventType
} from '@/types/webhook';

const WEBHOOK_EVENTS: WebhookEventType[] = [
  'stake_confirmed',
  'stake_activated', 
  'unstake_completed',
  'reward_earned',
  'validator_delinquent'
];

/**
 * Register a new webhook
 * POST /webhooks/register
 */
export const registerWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const apiKey = req.apiKey!; // Set by auth middleware
    
    logger.info('Registering webhook', {
      requestId,
      url: req.body.url,
      events: req.body.events,
    });

    try {
      const { url, events, secret }: RegisterWebhookRequest = req.body;

      // Validate URL
      if (!url || !isValidUrl(url)) {
        throw createApiError(
          'Invalid webhook URL. Must be a valid HTTPS URL.',
          400,
          'INVALID_URL'
        );
      }

      // Validate events
      if (!events || !Array.isArray(events) || events.length === 0) {
        throw createApiError(
          'At least one event must be specified',
          400,
          'INVALID_EVENTS'
        );
      }

      const invalidEvents = events.filter(event => !WEBHOOK_EVENTS.includes(event));
      if (invalidEvents.length > 0) {
        throw createApiError(
          `Invalid events: ${invalidEvents.join(', ')}. Valid events: ${WEBHOOK_EVENTS.join(', ')}`,
          400,
          'INVALID_EVENTS'
        );
      }

      // Check for existing webhook with same URL and API key
      const existingWebhooks = await storage.getWebhooksByApiKey(apiKey);
      const duplicateWebhook = existingWebhooks.find(w => w.url === url && w.active);
      
      if (duplicateWebhook) {
        throw createApiError(
          'A webhook with this URL is already registered',
          409,
          'WEBHOOK_ALREADY_EXISTS'
        );
      }

      // Create webhook registration first to get ID
      const webhook: WebhookRegistration = {
        id: generateWebhookId(),
        apiKey,
        url,
        events,
        secret: '', // Will be set below
        active: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
      };

      // Generate or use provided webhook secret with persistence
      const webhookSecret = secret || await storage.generateWebhookSecret(webhook.id);
      webhook.secret = webhookSecret;

      await storage.saveWebhook(webhook);

      logger.info('Webhook registered successfully', {
        requestId,
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events,
      });

      const response: RegisterWebhookResponse = {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret,
        createdAt: webhook.createdAt,
      };

      res.status(201).json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to register webhook', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * List webhooks for the authenticated API key
 * GET /webhooks
 */
export const listWebhooks = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const apiKey = req.apiKey!; // Set by auth middleware

    logger.info('Listing webhooks', { requestId });

    try {
      const webhooks = await storage.getWebhooksByApiKey(apiKey);

      const response: ListWebhooksResponse = {
        webhooks: webhooks.map(w => ({
          id: w.id,
          url: w.url,
          events: w.events,
          active: w.active,
          createdAt: w.createdAt,
          failureCount: w.failureCount,
          ...(w.lastDeliveryAt && { lastDeliveryAt: w.lastDeliveryAt }),
        })),
      };

      logger.info('Webhooks listed successfully', {
        requestId,
        count: webhooks.length,
      });

      res.json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to list webhooks', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * Delete a webhook
 * DELETE /webhooks/:id
 */
export const deleteWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const apiKey = req.apiKey!; // Set by auth middleware
    const webhookId = req.params.id as string;

    logger.info('Deleting webhook', {
      requestId,
      webhookId,
    });

    try {
      if (!webhookId) {
        throw createApiError(
          'Webhook ID is required',
          400,
          'MISSING_WEBHOOK_ID'
        );
      }

      const deleted = await storage.deleteWebhook(webhookId, apiKey);

      if (!deleted) {
        throw createApiError(
          'Webhook not found or not owned by this API key',
          404,
          'WEBHOOK_NOT_FOUND'
        );
      }

      logger.info('Webhook deleted successfully', {
        requestId,
        webhookId,
      });

      res.json(createApiResponse({
        message: 'Webhook deleted successfully',
        webhookId,
      }));

    } catch (error) {
      logger.error('Failed to delete webhook', {
        requestId,
        webhookId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

/**
 * Get webhook delivery status
 * GET /webhooks/:id/deliveries
 */
export const getWebhookDeliveries = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const apiKey = req.apiKey!; // Set by auth middleware
    const webhookId = req.params.id as string;
    const limit = parseInt((req.query.limit as string) || '50');
    const offset = parseInt((req.query.offset as string) || '0');

    logger.info('Getting webhook deliveries', {
      requestId,
      webhookId,
      limit,
      offset,
    });

    try {
      // Verify webhook ownership
      const webhook = await storage.getWebhookById(webhookId);
      if (!webhook || webhook.apiKey !== apiKey) {
        throw createApiError(
          'Webhook not found or not owned by this API key',
          404,
          'WEBHOOK_NOT_FOUND'
        );
      }

      const allDeliveries = await storage.getDeliveriesByWebhookId(webhookId);
      const sortedDeliveries = allDeliveries
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit);

      const response = {
        deliveries: sortedDeliveries.map(d => ({
          id: d.id,
          event: d.event,
          status: d.status,
          attempt: d.attempt,
          responseStatus: d.responseStatus,
          deliveredAt: d.deliveredAt,
          createdAt: d.createdAt,
          nextRetryAt: d.nextRetryAt,
        })),
        total: allDeliveries.length,
        limit,
        offset,
      };

      logger.info('Webhook deliveries retrieved', {
        requestId,
        webhookId,
        count: sortedDeliveries.length,
        total: allDeliveries.length,
      });

      res.json(createApiResponse(response));

    } catch (error) {
      logger.error('Failed to get webhook deliveries', {
        requestId,
        webhookId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
);

// Utility functions
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:'; // Require HTTPS for security
  } catch {
    return false;
  }
}

function generateWebhookId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}