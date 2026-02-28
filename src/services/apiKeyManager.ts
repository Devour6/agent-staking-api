import crypto from 'crypto';
import { logger } from './logger';

export type ApiKeyTier = 'free' | 'pro' | 'enterprise';

interface ApiKeyInfo {
  keyId: string;
  hashedKey: string;
  createdAt: Date;
  lastUsed: Date | undefined;
  isActive: boolean;
  rotationScheduledAt: Date | undefined;
  tier: ApiKeyTier;
  description: string | undefined;
  // Agent-specific fields for self-registration
  agentName?: string;
  agentWallet?: string;
  email?: string;
  registeredAt?: Date;
  selfRegistered?: boolean;
}

class ApiKeyManager {
  private keys: Map<string, ApiKeyInfo> = new Map();
  private rotationIntervalMs: number;
  private rotationSchedulerInterval?: NodeJS.Timeout | undefined;

  constructor() {
    // Default rotation every 30 days
    this.rotationIntervalMs = 30 * 24 * 60 * 60 * 1000;
    this.loadExistingKeys();
    
    // Don't start scheduler during tests
    if (process.env.NODE_ENV !== 'test') {
      this.startRotationScheduler();
    }
  }

  /**
   * Load existing keys from environment or storage
   */
  private loadExistingKeys(): void {
    // For now, create a default key from the existing secret
    const defaultSecret = process.env.API_KEY_SECRET;
    if (defaultSecret && defaultSecret.length >= 32) {
      const keyId = 'default';
      const hashedKey = this.hashKey(defaultSecret);
      
      this.keys.set(keyId, {
        keyId,
        hashedKey,
        createdAt: new Date(),
        lastUsed: undefined,
        isActive: true,
        rotationScheduledAt: undefined,
        tier: 'free',
        description: 'Default API key from environment'
      });

      logger.info('Loaded default API key', { keyId });
    }
  }

  /**
   * Generate a new API key
   */
  generateApiKey(options: { 
    tier?: ApiKeyTier; 
    description?: string;
    agentName?: string;
    agentWallet?: string;
    email?: string;
    registeredAt?: Date;
    selfRegistered?: boolean;
  } = {}): { keyId: string; apiKey: string } {
    const keyId = crypto.randomUUID();
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = this.hashKey(apiKey);

    const keyInfo: ApiKeyInfo = {
      keyId,
      hashedKey,
      createdAt: new Date(),
      lastUsed: undefined,
      isActive: true,
      rotationScheduledAt: new Date(Date.now() + this.rotationIntervalMs),
      tier: options.tier || 'free',
      description: options.description,
      agentName: options.agentName,
      agentWallet: options.agentWallet,
      email: options.email,
      registeredAt: options.registeredAt,
      selfRegistered: options.selfRegistered
    };

    this.keys.set(keyId, keyInfo);

    logger.info('Generated new API key', { 
      keyId, 
      tier: keyInfo.tier,
      agentName: options.agentName,
      agentWallet: options.agentWallet ? `${options.agentWallet.substring(0, 4)}...${options.agentWallet.substring(options.agentWallet.length - 4)}` : undefined,
      selfRegistered: options.selfRegistered,
      rotationScheduledAt: keyInfo.rotationScheduledAt 
    });

    return { keyId, apiKey };
  }

  /**
   * Validate an API key
   */
  validateApiKey(apiKey: string): { valid: boolean; keyId?: string; tier?: ApiKeyTier } {
    const hashedKey = this.hashKey(apiKey);

    for (const [keyId, keyInfo] of this.keys.entries()) {
      if (keyInfo.isActive && keyInfo.hashedKey === hashedKey) {
        // Update last used timestamp
        keyInfo.lastUsed = new Date();
        
        logger.debug('API key validated', { keyId, tier: keyInfo.tier });
        
        return { valid: true, keyId, tier: keyInfo.tier };
      }
    }

    logger.warn('Invalid API key attempted', { hashedKey: hashedKey.substring(0, 8) + '...' });
    return { valid: false };
  }

  /**
   * Rotate an API key
   */
  rotateApiKey(keyId: string): { newKeyId: string; newApiKey: string } | null {
    const existingKey = this.keys.get(keyId);
    if (!existingKey) {
      logger.error('Attempted to rotate non-existent key', { keyId });
      return null;
    }

    // Generate new key
    const { keyId: newKeyId, apiKey: newApiKey } = this.generateApiKey();

    // Mark old key as inactive (but keep for grace period)
    existingKey.isActive = false;

    logger.info('API key rotated', { 
      oldKeyId: keyId, 
      newKeyId,
      gracePeriodMs: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Schedule cleanup of old key after grace period
    setTimeout(() => {
      this.keys.delete(keyId);
      logger.info('Old API key cleaned up after grace period', { keyId });
    }, 24 * 60 * 60 * 1000); // 24 hours

    return { newKeyId, newApiKey };
  }

  /**
   * Get key statistics
   */
  getKeyStats(): { active: number; total: number; oldestKey: Date | null } {
    const activeKeys = Array.from(this.keys.values()).filter(k => k.isActive);
    const oldestKey = activeKeys.reduce((oldest, key) => {
      return !oldest || key.createdAt < oldest ? key.createdAt : oldest;
    }, null as Date | null);

    return {
      active: activeKeys.length,
      total: this.keys.size,
      oldestKey,
    };
  }

  /**
   * List keys due for rotation
   */
  getKeysForRotation(): string[] {
    const now = new Date();
    const keysForRotation: string[] = [];

    for (const [keyId, keyInfo] of this.keys.entries()) {
      if (keyInfo.isActive && 
          keyInfo.rotationScheduledAt && 
          keyInfo.rotationScheduledAt <= now) {
        keysForRotation.push(keyId);
      }
    }

    return keysForRotation;
  }

  /**
   * Start automatic rotation scheduler
   */
  private startRotationScheduler(): void {
    // Check for keys needing rotation every hour
    this.rotationSchedulerInterval = setInterval(() => {
      const keysForRotation = this.getKeysForRotation();
      
      if (keysForRotation.length > 0) {
        logger.info('Keys scheduled for rotation detected', { 
          count: keysForRotation.length,
          keyIds: keysForRotation 
        });
        
        // In production, this would trigger rotation notifications
        // For now, just log the need for manual rotation
        for (const keyId of keysForRotation) {
          logger.warn('API key requires rotation', { 
            keyId,
            action: 'Manual rotation required'
          });
        }
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  /**
   * Stop the rotation scheduler (for cleanup)
   */
  stopRotationScheduler(): void {
    if (this.rotationSchedulerInterval) {
      clearInterval(this.rotationSchedulerInterval);
      this.rotationSchedulerInterval = undefined;
    }
  }

  /**
   * Find API key by agent wallet address
   */
  async findKeyByWallet(agentWallet: string): Promise<{
    keyId: string;
    createdAt: Date;
    lastUsed: Date | undefined;
    isActive: boolean;
    tier: ApiKeyTier;
    description: string | undefined;
    agentName?: string;
  } | null> {
    for (const [keyId, keyInfo] of this.keys.entries()) {
      if (keyInfo.agentWallet === agentWallet) {
        return {
          keyId: keyInfo.keyId,
          createdAt: keyInfo.createdAt,
          lastUsed: keyInfo.lastUsed,
          isActive: keyInfo.isActive,
          tier: keyInfo.tier,
          description: keyInfo.description,
          agentName: keyInfo.agentName
        };
      }
    }
    return null;
  }

  /**
   * List all API keys (without sensitive data)
   */
  async listKeys(): Promise<Array<{
    keyId: string;
    createdAt: Date;
    lastUsed: Date | undefined;
    isActive: boolean;
    tier: ApiKeyTier;
    description: string | undefined;
  }>> {
    return Array.from(this.keys.values()).map(key => ({
      keyId: key.keyId,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      isActive: key.isActive,
      tier: key.tier,
      description: key.description
    }));
  }

  /**
   * Get count of active API keys
   */
  async getActiveKeyCount(): Promise<number> {
    return Array.from(this.keys.values()).filter(key => key.isActive).length;
  }

  /**
   * Create a new API key with specified tier and agent metadata
   */
  async createKey(options: { 
    tier?: ApiKeyTier; 
    description?: string;
    agentName?: string;
    agentWallet?: string;
    email?: string;
    registeredAt?: Date;
    selfRegistered?: boolean;
  }): Promise<{
    keyId: string;
    key: string;
    createdAt: Date;
  }> {
    const { keyId, apiKey } = this.generateApiKey({
      tier: options.tier,
      description: options.description,
      agentName: options.agentName,
      agentWallet: options.agentWallet,
      email: options.email,
      registeredAt: options.registeredAt,
      selfRegistered: options.selfRegistered
    });
    const keyInfo = this.keys.get(keyId)!;
    
    return {
      keyId,
      key: apiKey,
      createdAt: keyInfo.createdAt
    };
  }

  /**
   * Revoke (deactivate) an API key
   */
  async revokeKey(keyId: string): Promise<boolean> {
    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return false;
    }

    keyInfo.isActive = false;
    logger.info('API key revoked', { keyId });
    
    return true;
  }

  /**
   * Get tier rate limits
   */
  getTierLimits(tier: ApiKeyTier): { requestsPerMinute: number } {
    switch (tier) {
      case 'free':
        return { requestsPerMinute: 10 };
      case 'pro':
        return { requestsPerMinute: 100 };
      case 'enterprise':
        return { requestsPerMinute: 1000 };
      default:
        return { requestsPerMinute: 10 };
    }
  }

  /**
   * Hash an API key for secure storage
   */
  private hashKey(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
  }
}

export const apiKeyManager = new ApiKeyManager();