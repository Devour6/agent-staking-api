import { Router } from 'express';
import { 
  buildNativeStakeTransaction, 
  buildLiquidStakeTransaction, 
  buildUnstakeTransaction,
  submitTransaction,
  getStakeRecommendations,
  getAgentPositions,
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
router.use('/tx', authenticateApiKey);
router.use('/positions', authenticateApiKey);

// Native staking endpoint
router.post(
  '/stake/build',
  walletRateLimit,
  validateRequest(validationSchemas.nativeStakeRequest),
  buildNativeStakeTransaction
);

// Liquid staking endpoint
router.post(
  '/stake/liquid/build',
  walletRateLimit,
  validateRequest(validationSchemas.liquidStakeRequest),
  buildLiquidStakeTransaction
);

// Staking recommendations endpoint (no wallet needed)
router.get(
  '/stake/recommend',
  readOnlyRateLimit,
  getStakeRecommendations
);

// Unstaking endpoint
router.post(
  '/unstake/build',
  walletRateLimit,
  validateRequest(validationSchemas.unstakeRequest),
  buildUnstakeTransaction
);

// Transaction submission endpoint
router.post(
  '/tx/submit',
  walletRateLimit,
  validateRequest(validationSchemas.transactionSubmitRequest),
  submitTransaction
);

// Agent positions endpoint
router.get(
  '/positions/:wallet',
  readOnlyRateLimit,
  getAgentPositions
);

export default router;