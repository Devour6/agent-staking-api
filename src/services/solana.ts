import { Connection, PublicKey, Commitment, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';
import { metricsService } from './metrics';

class SolanaService {
  private connectionPool: Connection[] = [];
  private backupConnectionPool: Connection[] = [];
  private currentConnectionIndex = 0;
  private cachedBlockhash: BlockhashWithExpiryBlockHeight | null = null;
  private blockhashCacheMs = 30000; // 30 seconds
  private lastBlockhashFetch = 0;
  private poolSize = 5; // Number of connections in the pool

  constructor() {
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

    logger.info('Solana service initialized with connection pooling', {
      rpcUrl: config.solana.rpcUrl,
      cluster: config.solana.cluster,
      poolSize: this.poolSize,
      hasBackup: this.backupConnectionPool.length > 0,
    });
  }

  /**
   * Get connection from pool using round-robin
   */
  getConnection(): Connection {
    const connection = this.connectionPool[this.currentConnectionIndex];
    if (!connection) {
      throw new Error('No connections available in pool');
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
}

export const solanaService = new SolanaService();