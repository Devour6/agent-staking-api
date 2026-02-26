import { Connection, PublicKey, Commitment, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';
import { metricsService } from './metrics';

interface RpcEndpointHealth {
  url: string;
  isHealthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  averageLatency: number;
  lastError?: string;
}

class SolanaService {
  private connectionPool: Connection[] = [];
  private backupConnectionPool: Connection[] = [];
  private currentConnectionIndex = 0;
  private cachedBlockhash: BlockhashWithExpiryBlockHeight | null = null;
  private blockhashCacheMs = 30000; // 30 seconds
  private lastBlockhashFetch = 0;
  private poolSize = 5; // Number of connections in the pool
  private healthMonitorInterval?: NodeJS.Timeout;
  private primaryEndpointHealth: RpcEndpointHealth;
  private backupEndpointHealth?: RpcEndpointHealth;
  private usingBackup = false;
  private readonly maxConsecutiveFailures = 3;
  private readonly healthCheckIntervalMs = 30000; // 30 seconds

  constructor() {
    // Initialize health tracking
    this.primaryEndpointHealth = {
      url: config.solana.rpcUrl,
      isHealthy: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
      averageLatency: 0,
    };

    if (config.solana.rpcUrlBackup) {
      this.backupEndpointHealth = {
        url: config.solana.rpcUrlBackup,
        isHealthy: true,
        lastChecked: new Date(),
        consecutiveFailures: 0,
        averageLatency: 0,
      };
    }

    // Create connection pool for better performance
    for (let i = 0; i < this.poolSize; i++) {
      const connection = new Connection(config.solana.rpcUrl, {
        commitment: 'confirmed' as Commitment,
        confirmTransactionInitialTimeout: 30000,
        httpAgent: false, // Use native fetch for better connection reuse
      });
      this.connectionPool.push(connection);
    }

    // Create backup connection pool if backup URL provided
    if (config.solana.rpcUrlBackup) {
      for (let i = 0; i < this.poolSize; i++) {
        const backupConnection = new Connection(config.solana.rpcUrlBackup, {
          commitment: 'confirmed' as Commitment,
          confirmTransactionInitialTimeout: 30000,
          httpAgent: false,
        });
        this.backupConnectionPool.push(backupConnection);
      }
    }

    // Start health monitoring (skip during tests)
    if (process.env.NODE_ENV !== 'test') {
      this.startHealthMonitoring();
    }

    logger.info('Solana service initialized with connection pooling and health monitoring', {
      rpcUrl: config.solana.rpcUrl,
      cluster: config.solana.cluster,
      poolSize: this.poolSize,
      hasBackup: this.backupConnectionPool.length > 0,
      healthMonitoringEnabled: process.env.NODE_ENV !== 'test',
    });
  }

  /**
   * Get connection from pool using health-aware selection
   */
  getConnection(): Connection {
    // Use backup pool if we're in failover mode
    if (this.usingBackup && this.backupConnectionPool.length > 0) {
      const connection = this.backupConnectionPool[this.currentConnectionIndex % this.backupConnectionPool.length];
      if (!connection) {
        throw new Error('No backup connections available in pool');
      }
      this.currentConnectionIndex = (this.currentConnectionIndex + 1) % this.backupConnectionPool.length;
      return connection;
    }

    // Use primary pool
    const connection = this.connectionPool[this.currentConnectionIndex];
    if (!connection) {
      throw new Error('No primary connections available in pool');
    }
    this.currentConnectionIndex = (this.currentConnectionIndex + 1) % this.poolSize;
    return connection;
  }

  /**
   * Get backup connection from pool using round-robin
   */
  private getBackupConnection(): Connection | null {
    if (this.backupConnectionPool.length === 0) {
      return null;
    }
    const connection = this.backupConnectionPool[this.currentConnectionIndex % this.backupConnectionPool.length];
    return connection || null;
  }

  /**
   * Get recent blockhash with caching
   */
  async getRecentBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    const now = Date.now();
    
    // Return cached blockhash if still valid
    if (this.cachedBlockhash && (now - this.lastBlockhashFetch) < this.blockhashCacheMs) {
      return this.cachedBlockhash;
    }

    try {
      // Try primary connection pool
      const primaryConnection = this.getConnection();
      const rpcStartTime = Date.now();
      
      this.cachedBlockhash = await primaryConnection.getLatestBlockhash('confirmed');
      this.lastBlockhashFetch = now;
      
      const rpcDuration = Date.now() - rpcStartTime;
      
      // Track metrics
      metricsService.trackSolanaRpcCall('getLatestBlockhash', true, rpcDuration);
      
      logger.logSolanaRpcCall('getLatestBlockhash', true, rpcDuration, {
        blockhash: this.cachedBlockhash.blockhash,
        lastValidBlockHeight: this.cachedBlockhash.lastValidBlockHeight,
        cacheHit: false,
      });
      
      return this.cachedBlockhash;
    } catch (error) {
      const errorMessage = (error as Error).message;
      metricsService.trackSolanaRpcCall('getLatestBlockhash', false, 0);
      
      logger.warn('Primary RPC failed, trying backup', { 
        error: errorMessage,
        rpcMethod: 'getLatestBlockhash',
      });
      
      // Try backup connection pool
      const backupConnection = this.getBackupConnection();
      if (backupConnection) {
        try {
          const backupStartTime = Date.now();
          this.cachedBlockhash = await backupConnection.getLatestBlockhash('confirmed');
          this.lastBlockhashFetch = now;
          
          const backupDuration = Date.now() - backupStartTime;
          
          // Track backup metrics
          metricsService.trackSolanaRpcCall('getLatestBlockhash_backup', true, backupDuration);
          
          logger.logSolanaRpcCall('getLatestBlockhash_backup', true, backupDuration, {
            blockhash: this.cachedBlockhash.blockhash,
            failoverReason: errorMessage,
          });
          
          return this.cachedBlockhash;
        } catch (backupError) {
          metricsService.trackSolanaRpcCall('getLatestBlockhash_backup', false, 0);
          logger.error('Backup RPC also failed', { 
            error: (backupError as Error).message,
            originalError: errorMessage,
            rpcMethod: 'getLatestBlockhash_backup',
          });
        }
      }
      
      throw new Error('Failed to fetch blockhash from all RPC endpoints');
    }
  }

  /**
   * Check if a public key is valid
   */
  isValidPublicKey(publicKeyString: string): boolean {
    try {
      new PublicKey(publicKeyString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get minimum rent for stake account
   */
  async getStakeAccountMinimumRent(): Promise<number> {
    try {
      // Stake account size is 200 bytes
      const stakeAccountSize = 200;
      const connection = this.getConnection();
      const rentExemption = await connection.getMinimumBalanceForRentExemption(stakeAccountSize);
      
      logger.debug('Fetched stake account minimum rent', { rentExemption });
      
      return rentExemption;
    } catch (error) {
      logger.error('Failed to fetch minimum rent', { error: (error as Error).message });
      // Fallback to a reasonable default (approximately 0.00228288 SOL)
      return 2282880;
    }
  }

  /**
   * Get current epoch info
   */
  async getEpochInfo() {
    try {
      const connection = this.getConnection();
      const epochInfo = await connection.getEpochInfo();
      
      logger.debug('Fetched epoch info', {
        epoch: epochInfo.epoch,
        slotIndex: epochInfo.slotIndex,
        slotsInEpoch: epochInfo.slotsInEpoch,
      });
      
      return epochInfo;
    } catch (error) {
      logger.error('Failed to fetch epoch info', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get current epoch number
   */
  async getCurrentEpoch(): Promise<number> {
    try {
      const epochInfo = await this.getEpochInfo();
      return epochInfo.epoch;
    } catch (error) {
      logger.error('Failed to fetch current epoch', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Health check - verify connection
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple slot check to verify connection using pool
      const connection = this.getConnection();
      await Promise.race([
        connection.getSlot(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), config.healthCheck.timeoutMs)
        )
      ]);
      
      const latency = Date.now() - startTime;
      
      // Track successful health check
      metricsService.trackSolanaRpcCall('getSlot_health', true, latency);
      
      logger.logSolanaRpcCall('getSlot_health', true, latency, {
        healthCheck: true,
        poolIndex: this.currentConnectionIndex,
      });
      
      return { healthy: true, latency };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const duration = Date.now() - startTime;
      
      // Track failed health check
      metricsService.trackSolanaRpcCall('getSlot_health', false, duration);
      
      logger.logSolanaRpcCall('getSlot_health', false, duration, {
        healthCheck: true,
        error: errorMessage,
      });
      
      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Get validator info (for recommendations)
   */
  async getValidatorInfo(voteAccount: string) {
    try {
      const connection = this.getConnection();
      const validators = await connection.getVoteAccounts();
      const validator = validators.current.find(v => v.votePubkey === voteAccount) ||
                      validators.delinquent.find(v => v.votePubkey === voteAccount);
      
      if (!validator) {
        throw new Error(`Validator ${voteAccount} not found`);
      }
      
      return {
        voteAccount: validator.votePubkey,
        commission: validator.commission,
        activatedStake: validator.activatedStake,
        epochCredits: validator.epochCredits,
        epochVoteAccount: validator.epochVoteAccount,
        lastVote: validator.lastVote,
      };
    } catch (error) {
      logger.error('Failed to fetch validator info', { 
        voteAccount, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  /**
   * Start continuous health monitoring of RPC endpoints
   */
  private startHealthMonitoring(): void {
    this.healthMonitorInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);

    logger.info('RPC health monitoring started', {
      intervalMs: this.healthCheckIntervalMs,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
    });
  }

  /**
   * Stop health monitoring (for cleanup)
   */
  stopHealthMonitoring(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      delete this.healthMonitorInterval;
    }
  }

  /**
   * Perform health checks on all RPC endpoints
   */
  private async performHealthChecks(): Promise<void> {
    // Check primary endpoint
    const primaryConnection = this.connectionPool[0];
    if (primaryConnection) {
      await this.checkEndpointHealth(this.primaryEndpointHealth, primaryConnection);
    }

    // Check backup endpoint if available
    if (this.backupEndpointHealth && this.backupConnectionPool.length > 0) {
      const backupConnection = this.backupConnectionPool[0];
      if (backupConnection) {
        await this.checkEndpointHealth(this.backupEndpointHealth, backupConnection);
      }
    }

    // Decide whether to use backup
    this.evaluateFailover();

    // Track metrics
    this.trackHealthMetrics();
  }

  /**
   * Check health of a specific endpoint
   */
  private async checkEndpointHealth(healthInfo: RpcEndpointHealth, connection: Connection): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Perform a lightweight health check
      await Promise.race([
        connection.getSlot(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);

      const latency = Date.now() - startTime;
      
      // Update health status
      healthInfo.isHealthy = true;
      healthInfo.lastChecked = new Date();
      healthInfo.consecutiveFailures = 0;
      healthInfo.averageLatency = (healthInfo.averageLatency + latency) / 2;
      delete healthInfo.lastError;

      logger.debug('RPC endpoint health check passed', {
        url: healthInfo.url,
        latency,
        averageLatency: healthInfo.averageLatency,
      });

    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Update health status
      healthInfo.isHealthy = false;
      healthInfo.lastChecked = new Date();
      healthInfo.consecutiveFailures++;
      healthInfo.lastError = errorMessage;

      logger.warn('RPC endpoint health check failed', {
        url: healthInfo.url,
        consecutiveFailures: healthInfo.consecutiveFailures,
        error: errorMessage,
      });
    }
  }

  /**
   * Evaluate whether to failover to backup endpoint
   */
  private evaluateFailover(): void {
    const primaryFailed = this.primaryEndpointHealth.consecutiveFailures >= this.maxConsecutiveFailures;
    const backupAvailable = this.backupEndpointHealth?.isHealthy === true;

    if (primaryFailed && backupAvailable && !this.usingBackup) {
      // Failover to backup
      this.usingBackup = true;
      logger.error('Primary RPC endpoint failed - failing over to backup', {
        primaryUrl: this.primaryEndpointHealth.url,
        backupUrl: this.backupEndpointHealth?.url,
        consecutiveFailures: this.primaryEndpointHealth.consecutiveFailures,
      });
    } else if (!primaryFailed && this.usingBackup && this.primaryEndpointHealth.isHealthy) {
      // Recover to primary
      this.usingBackup = false;
      logger.info('Primary RPC endpoint recovered - switching back from backup', {
        primaryUrl: this.primaryEndpointHealth.url,
        backupUrl: this.backupEndpointHealth?.url,
      });
    }
  }

  /**
   * Track health metrics for monitoring
   */
  private trackHealthMetrics(): void {
    // Track primary endpoint metrics
    metricsService.trackSolanaRpcCall(
      'rpc_health_primary', 
      this.primaryEndpointHealth.isHealthy, 
      this.primaryEndpointHealth.averageLatency
    );

    // Track backup endpoint metrics if available
    if (this.backupEndpointHealth) {
      metricsService.trackSolanaRpcCall(
        'rpc_health_backup', 
        this.backupEndpointHealth.isHealthy, 
        this.backupEndpointHealth.averageLatency
      );
    }

    // Track failover status
    const failoverMetrics = {
      usingBackup: this.usingBackup ? 1 : 0,
      primaryConsecutiveFailures: this.primaryEndpointHealth.consecutiveFailures,
      backupConsecutiveFailures: this.backupEndpointHealth?.consecutiveFailures || 0,
    };

    logger.debug('RPC health metrics tracked', failoverMetrics);
  }

  /**
   * Get current RPC health status for /metrics endpoint
   */
  getRpcHealthStatus() {
    const primaryStatus = {
      url: this.primaryEndpointHealth.url,
      healthy: this.primaryEndpointHealth.isHealthy,
      consecutiveFailures: this.primaryEndpointHealth.consecutiveFailures,
      averageLatency: this.primaryEndpointHealth.averageLatency,
      lastChecked: this.primaryEndpointHealth.lastChecked,
      ...(this.primaryEndpointHealth.lastError && { lastError: this.primaryEndpointHealth.lastError }),
    };

    const result: any = {
      primary: primaryStatus,
      currentlyUsing: this.usingBackup ? 'backup' as const : 'primary' as const,
    };

    if (this.backupEndpointHealth) {
      result.backup = {
        url: this.backupEndpointHealth.url,
        healthy: this.backupEndpointHealth.isHealthy,
        consecutiveFailures: this.backupEndpointHealth.consecutiveFailures,
        averageLatency: this.backupEndpointHealth.averageLatency,
        lastChecked: this.backupEndpointHealth.lastChecked,
        ...(this.backupEndpointHealth.lastError && { lastError: this.backupEndpointHealth.lastError }),
      };
    }

    return result;
  }
}

export const solanaService = new SolanaService();