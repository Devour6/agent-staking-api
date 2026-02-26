import { Router } from 'express';
import { 
  buildNativeStakeTransaction, 
  buildLiquidStakeTransaction, 
  buildUnstakeTransaction,
  buildAndMonitorStakeTransaction,
  monitorStakeTransaction
} from '@/controllers/stake';
import {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  getWebhookDeliveries
} from '@/controllers/webhook';
import { 
  healthCheck, 
  livenessCheck, 
  readinessCheck 
} from '@/controllers/health';
import { 
  getApiDocumentation, 
  getOpenApiSpec 
} from '@/controllers/docs';
import { 
  authenticateApiKey, 
  extractAgentWallet 
} from '@/middleware/auth';
import { 
  walletRateLimit, 
  readOnlyRateLimit 
} from '@/middleware/rateLimit';
import { 
  validateRequest, 
  validationSchemas 
} from '@/middleware/validation';

const router = Router();

// Health check endpoints (no auth required)
router.get('/health', readOnlyRateLimit, healthCheck);
router.get('/health/live', livenessCheck);
router.get('/health/ready', readinessCheck);

// API documentation endpoints (no auth required)
router.get('/api/docs', readOnlyRateLimit, getApiDocumentation);
router.get('/api/docs/openapi', readOnlyRateLimit, getOpenApiSpec);

// Authenticated endpoints
router.use('/stake', authenticateApiKey, extractAgentWallet);
router.use('/unstake', authenticateApiKey, extractAgentWallet);
router.use('/webhooks', authenticateApiKey);

// Native staking endpoint
router.post(
  '/stake/build',
  walletRateLimit,
  validateRequest(validationSchemas.nativeStakeRequest),
  buildNativeStakeTransaction
);

// Liquid staking endpoint (Phase 2)
router.post(
  '/stake/liquid/build',
  walletRateLimit,
  validateRequest(validationSchemas.liquidStakeRequest),
  buildLiquidStakeTransaction
);

// Unstaking endpoint (Phase 2)
router.post(
  '/unstake/build',
  walletRateLimit,
  validateRequest(validationSchemas.unstakeRequest),
  buildUnstakeTransaction
);

// Enhanced staking endpoints
router.post(
  '/stake/build-and-monitor',
  walletRateLimit,
  validateRequest(validationSchemas.buildAndMonitorRequest),
  buildAndMonitorStakeTransaction
);

router.post(
  '/stake/monitor',
  walletRateLimit,
  validateRequest(validationSchemas.monitorStakeRequest),
  monitorStakeTransaction
);

// Webhook endpoints
router.post(
  '/webhooks/register',
  readOnlyRateLimit,
  validateRequest(validationSchemas.registerWebhookRequest),
  registerWebhook
);

router.get(
  '/webhooks',
  readOnlyRateLimit,
  listWebhooks
);

router.delete(
  '/webhooks/:id',
  readOnlyRateLimit,
  deleteWebhook
);

router.get(
  '/webhooks/:id/deliveries',
  readOnlyRateLimit,
  getWebhookDeliveries
);

export default router;