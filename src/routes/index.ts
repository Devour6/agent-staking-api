import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { 
  buildNativeStakeTransaction, 
  buildLiquidStakeTransaction, 
  buildUnstakeTransaction,
  buildAndMonitorStakeTransaction,
  monitorStakeTransaction,
  submitTransaction,
  getStakeRecommendations,
  getAgentPositions
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
  getOpenApiSpec,
  getSwaggerUiSetup
} from '@/controllers/docs';
import {
  getAdminDashboard,
  getRateLimitDashboard,
  getApiKeys,
  createApiKey,
  revokeApiKey
} from '@/controllers/admin';
import { 
  authenticateApiKey, 
  extractAgentWallet 
} from '@/middleware/auth';
import { 
  walletRateLimit, 
  readOnlyRateLimit,
  tieredRateLimit 
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

// Swagger UI documentation endpoint
const swaggerSetup = getSwaggerUiSetup();
router.use('/docs', swaggerUi.serve);
router.get('/docs', swaggerUi.setup(swaggerSetup.swaggerDocument, swaggerSetup.options));

// Admin endpoints (authentication required)
router.get('/admin/dashboard', authenticateApiKey, readOnlyRateLimit, getAdminDashboard);
router.get('/admin/rate-limits', authenticateApiKey, readOnlyRateLimit, getRateLimitDashboard);
router.get('/admin/api-keys', authenticateApiKey, readOnlyRateLimit, getApiKeys);
router.post('/admin/api-keys', authenticateApiKey, readOnlyRateLimit, createApiKey);
router.delete('/admin/api-keys/:keyId', authenticateApiKey, readOnlyRateLimit, revokeApiKey);

// Authenticated endpoints
router.use('/stake', authenticateApiKey, extractAgentWallet);
router.use('/unstake', authenticateApiKey, extractAgentWallet);
router.use('/webhooks', authenticateApiKey);

// Native staking endpoint
router.post(
  '/stake/build',
  tieredRateLimit,
  validateRequest(validationSchemas.nativeStakeRequest),
  buildNativeStakeTransaction
);

// Liquid staking endpoint (Phase 2)
router.post(
  '/stake/liquid/build',
  tieredRateLimit,
  validateRequest(validationSchemas.liquidStakeRequest),
  buildLiquidStakeTransaction
);

// Unstaking endpoint (Phase 2)
router.post(
  '/unstake/build',
  tieredRateLimit,
  validateRequest(validationSchemas.unstakeRequest),
  buildUnstakeTransaction
);

// Enhanced staking endpoints
router.post(
  '/stake/build-and-monitor',
  tieredRateLimit,
  validateRequest(validationSchemas.buildAndMonitorRequest),
  buildAndMonitorStakeTransaction
);

router.post(
  '/stake/monitor',
  tieredRateLimit,
  validateRequest(validationSchemas.monitorStakeRequest),
  monitorStakeTransaction
);

// Transaction submission endpoint
router.post(
  '/tx/submit',
  authenticateApiKey,
  extractAgentWallet,
  tieredRateLimit,
  validateRequest(validationSchemas.transactionSubmitRequest),
  submitTransaction
);

// Staking recommendations endpoint
router.get(
  '/stake/recommend',
  authenticateApiKey,
  readOnlyRateLimit,
  getStakeRecommendations
);

// Agent positions endpoint
router.get(
  '/positions/:wallet',
  authenticateApiKey,
  readOnlyRateLimit,
  getAgentPositions
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