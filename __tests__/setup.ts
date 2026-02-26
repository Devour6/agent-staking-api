// Set up test environment variables before importing other modules
process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_CLUSTER = 'devnet';
process.env.PHASE_FEE_WALLET = '11111111111111111111111111111112';
process.env.PHASE_VALIDATOR_VOTE_ACCOUNT = '11111111111111111111111111111113';
process.env.API_KEY_SECRET = 'a'.repeat(64);

import { stakeMonitoringService } from '../src/services/monitoring';

// Jest setup for all tests

// Prevent monitoring services from starting during tests
jest.spyOn(stakeMonitoringService, 'startMonitoring').mockImplementation(() => {
  // Do nothing in tests
});

jest.spyOn(stakeMonitoringService, 'startValidatorMonitoring').mockImplementation(() => {
  return {} as any; // Return mock timeout
});

// Mock setTimeout to prevent background timers in tests
const originalSetInterval = global.setInterval;
const intervals: NodeJS.Timeout[] = [];

global.setInterval = ((callback: any, ms?: number) => {
  const interval = originalSetInterval(callback, ms || 0);
  intervals.push(interval);
  return interval;
}) as any;

afterAll(async () => {
  // Clean up intervals
  intervals.forEach(interval => clearInterval(interval));
  
  // Force cleanup of any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Global test teardown for each test file
afterEach(async () => {
  // Clear any timers that may have been set during tests
  jest.clearAllTimers();
  
  // Small delay to allow connections to cleanup
  await new Promise(resolve => setTimeout(resolve, 50));
});

// Set longer timeout for integration tests
jest.setTimeout(30000);