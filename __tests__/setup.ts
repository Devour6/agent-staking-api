// Mock prom-client FIRST, before any other imports
jest.mock('prom-client', () => require('../__mocks__/prom-client.js'));

// Set up test environment variables before importing other modules
process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_CLUSTER = 'mainnet-beta';
process.env.PHASE_FEE_WALLET = '11111111111111111111111111111112';
process.env.PHASE_VALIDATOR_VOTE_ACCOUNT = '11111111111111111111111111111113';
process.env.API_KEY_SECRET = 'a'.repeat(64);
// Increase rate limits for tests to prevent 429 errors
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

import { stakeMonitoringService } from '../src/services/monitoring';
import { webhookDeliveryService } from '../src/services/webhookDelivery';
import { apiKeyManager } from '../src/services/apiKeyManager';

// Jest setup for all tests

// Set up test API keys
beforeAll(async () => {
  // Create the second test API key for multi-user testing
  // We need to directly add it to the manager since createKey doesn't support custom keys
  const otherApiKey = 'b'.repeat(64);
  const hashedKey = (apiKeyManager as any).hashKey(otherApiKey);
  
  (apiKeyManager as any).keys.set('test-key-b', {
    keyId: 'test-key-b',
    hashedKey: hashedKey,
    createdAt: new Date(),
    lastUsed: undefined,
    isActive: true,
    rotationScheduledAt: undefined,
    tier: 'free',
    description: 'Test API Key B'
  });
});

// Prevent monitoring services from starting during tests
jest.spyOn(stakeMonitoringService, 'startMonitoring').mockImplementation(() => {
  // Do nothing in tests
});

jest.spyOn(stakeMonitoringService, 'startValidatorMonitoring').mockImplementation(() => {
  return {} as any; // Return mock timeout
});

// Mock webhook retry processor to prevent background timers in tests
jest.spyOn(webhookDeliveryService, 'startRetryProcessor').mockImplementation(() => {
  // Return a mock timer that we can track
  const mockTimer = { unref: () => {}, [Symbol.toPrimitive]: () => 1 } as any;
  return mockTimer;
});

// Track all intervals and timeouts created during tests
const originalSetInterval = global.setInterval;
const originalSetTimeout = global.setTimeout;
const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];

global.setInterval = ((callback: any, ms?: number) => {
  const interval = originalSetInterval(callback, ms || 0);
  interval.unref(); // Prevent hanging
  intervals.push(interval);
  return interval;
}) as any;

global.setTimeout = ((callback: any, ms?: number) => {
  const timeout = originalSetTimeout(callback, ms || 0);
  timeout.unref(); // Prevent hanging
  timeouts.push(timeout);
  return timeout;
}) as any;

// Clean up all timers after each test
afterEach(() => {
  intervals.forEach(interval => clearInterval(interval));
  timeouts.forEach(timeout => clearTimeout(timeout));
  intervals.length = 0;
  timeouts.length = 0;
});

// Final cleanup after all tests
afterAll(() => {
  intervals.forEach(interval => clearInterval(interval));
  timeouts.forEach(timeout => clearTimeout(timeout));
});