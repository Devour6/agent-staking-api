import { Connection, PublicKey, Commitment, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';

class SolanaService {
  private connection: Connection;
  private backupConnection?: Connection;
  private cachedBlockhash: BlockhashWithExpiryBlockHeight | null = null;
  private blockhashCacheMs = 30000; // 30 seconds
  private lastBlockhashFetch = 0;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: 'confirmed' as Commitment,
      confirmTransactionInitialTimeout: 30000,
    });

    if (config.solana.rpcUrlBackup) {
      this.backupConnection = new Connection(config.solana.rpcUrlBackup, {
        commitment: 'confirmed' as Commitment,
        confirmTransactionInitialTimeout: 30000,
      });
    }

    logger.info('Solana service initialized', {
      rpcUrl: config.solana.rpcUrl,
      cluster: config.solana.cluster,
      hasBackup: !!this.backupConnection,
    });
  }

  /**
   * Get primary connection with fallback to backup
   */
  getConnection(): Connection {
    return this.connection;
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
      // Try primary connection first
      this.cachedBlockhash = await this.connection.getLatestBlockhash('confirmed');
      this.lastBlockhashFetch = now;
      
      logger.debug('Fetched fresh blockhash', {
        blockhash: this.cachedBlockhash.blockhash,
        lastValidBlockHeight: this.cachedBlockhash.lastValidBlockHeight,
      });
      
      return this.cachedBlockhash;
    } catch (error) {
      logger.warn('Primary RPC failed, trying backup', { error: (error as Error).message });
      
      // Try backup connection
      if (this.backupConnection) {
        try {
          this.cachedBlockhash = await this.backupConnection.getLatestBlockhash('confirmed');
          this.lastBlockhashFetch = now;
          
          logger.info('Fetched blockhash from backup RPC', {
            blockhash: this.cachedBlockhash.blockhash,
          });
          
          return this.cachedBlockhash;
        } catch (backupError) {
          logger.error('Backup RPC also failed', { error: (backupError as Error).message });
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
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(stakeAccountSize);
      
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
      const epochInfo = await this.connection.getEpochInfo();
      
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
      // Simple slot check to verify connection
      await Promise.race([
        this.connection.getSlot(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), config.healthCheck.timeoutMs)
        )
      ]);
      
      const latency = Date.now() - startTime;
      
      logger.debug('Solana health check passed', { latency });
      
      return { healthy: true, latency };
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      logger.error('Solana health check failed', { error: errorMessage });
      
      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Get validator info (for recommendations)
   */
  async getValidatorInfo(voteAccount: string) {
    try {
      const validators = await this.connection.getVoteAccounts();
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