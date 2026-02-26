/**
 * Jest setup file for global test configuration
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
process.env.SOLANA_CLUSTER = 'mainnet-beta';
process.env.PHASE_FEE_WALLET = 'Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D';
process.env.PHASE_VALIDATOR_VOTE_ACCOUNT = '8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm';
process.env.RAKE_FEE_BASIS_POINTS = '10';
process.env.API_KEY_SECRET = 'test-secret-key-that-is-long-enough-for-validation';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.HEALTH_CHECK_TIMEOUT_MS = '2000';

// Mock console methods to reduce test output noise
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Set longer timeout for integration tests
jest.setTimeout(30000);