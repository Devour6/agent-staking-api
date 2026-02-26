import { Router } from 'express';
import { 
  buildNativeStakeTransaction, 
  buildLiquidStakeTransaction, 
  buildUnstakeTransaction 
} from '@/controllers/stake';
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

export default router;