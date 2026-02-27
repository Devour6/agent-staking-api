import { apiKeyManager, ApiKeyTier } from '../../src/services/apiKeyManager';

// Mock logger
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ApiKeyManager', () => {
  beforeEach(() => {
    // Clear any existing keys for clean test state
    (apiKeyManager as any).keys.clear();
  });

  describe('generateApiKey', () => {
    it('should generate an API key with default free tier', () => {
      const result = apiKeyManager.generateApiKey();
      
      expect(result.keyId).toBeDefined();
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toHaveLength(64); // 32 bytes as hex = 64 chars
    });

    it('should generate an API key with specified tier', () => {
      const result = apiKeyManager.generateApiKey({ 
        tier: 'pro',
        description: 'Test pro key' 
      });
      
      expect(result.keyId).toBeDefined();
      expect(result.apiKey).toBeDefined();
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key', () => {
      const { keyId, apiKey } = apiKeyManager.generateApiKey({ tier: 'pro' });
      
      const result = apiKeyManager.validateApiKey(apiKey);
      
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe(keyId);
      expect(result.tier).toBe('pro');
    });

    it('should reject an invalid API key', () => {
      const result = apiKeyManager.validateApiKey('invalid-key');
      
      expect(result.valid).toBe(false);
      expect(result.keyId).toBeUndefined();
      expect(result.tier).toBeUndefined();
    });

    it('should update lastUsed timestamp on validation', () => {
      const { apiKey } = apiKeyManager.generateApiKey();
      
      const beforeValidation = new Date();
      apiKeyManager.validateApiKey(apiKey);
      
      // Access internal state to check lastUsed was updated
      const keys = (apiKeyManager as any).keys as Map<string, any>;
      const keyInfo = Array.from(keys.values())[0];
      
      expect(keyInfo.lastUsed).toBeDefined();
      expect(keyInfo.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeValidation.getTime());
    });
  });

  describe('listKeys', () => {
    it('should list all keys without sensitive data', async () => {
      apiKeyManager.generateApiKey({ tier: 'free', description: 'Free key' });
      apiKeyManager.generateApiKey({ tier: 'pro', description: 'Pro key' });
      
      const keys = await apiKeyManager.listKeys();
      
      expect(keys).toHaveLength(2);
      expect(keys[0]).toHaveProperty('keyId');
      expect(keys[0]).toHaveProperty('tier');
      expect(keys[0]).toHaveProperty('description');
      expect(keys[0]).toHaveProperty('isActive');
      expect(keys[0]).not.toHaveProperty('hashedKey');
    });
  });

  describe('getActiveKeyCount', () => {
    it('should return count of active keys only', async () => {
      // Create active keys
      const key1 = apiKeyManager.generateApiKey();
      const key2 = apiKeyManager.generateApiKey();
      
      // Create inactive key
      const key3 = apiKeyManager.generateApiKey();
      await apiKeyManager.revokeKey(key3.keyId);
      
      const activeCount = await apiKeyManager.getActiveKeyCount();
      
      expect(activeCount).toBe(2);
    });
  });

  describe('createKey', () => {
    it('should create a new API key', async () => {
      const result = await apiKeyManager.createKey({
        tier: 'enterprise',
        description: 'Enterprise test key'
      });
      
      expect(result.keyId).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('revokeKey', () => {
    it('should revoke an existing key', async () => {
      const { keyId } = apiKeyManager.generateApiKey();
      
      const result = await apiKeyManager.revokeKey(keyId);
      
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const result = await apiKeyManager.revokeKey('non-existent-key');
      
      expect(result).toBe(false);
    });

    it('should make revoked key inactive', async () => {
      const { keyId, apiKey } = apiKeyManager.generateApiKey();
      
      await apiKeyManager.revokeKey(keyId);
      
      const validation = apiKeyManager.validateApiKey(apiKey);
      expect(validation.valid).toBe(false);
    });
  });

  describe('getTierLimits', () => {
    it('should return correct limits for free tier', () => {
      const limits = apiKeyManager.getTierLimits('free');
      
      expect(limits.requestsPerMinute).toBe(10);
    });

    it('should return correct limits for pro tier', () => {
      const limits = apiKeyManager.getTierLimits('pro');
      
      expect(limits.requestsPerMinute).toBe(100);
    });

    it('should return correct limits for enterprise tier', () => {
      const limits = apiKeyManager.getTierLimits('enterprise');
      
      expect(limits.requestsPerMinute).toBe(1000);
    });

    it('should default to free tier for unknown tier', () => {
      const limits = apiKeyManager.getTierLimits('unknown' as ApiKeyTier);
      
      expect(limits.requestsPerMinute).toBe(10);
    });
  });
});