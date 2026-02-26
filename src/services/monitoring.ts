import { Connection, PublicKey, StakeProgram } from '@solana/web3.js';
import { webhookDeliveryService } from '@/services/webhookDelivery';
import { logger } from '@/services/logger';
import { config } from '@/services/config';

interface StakeMonitoringRequest {
  transactionSignature: string;
  stakeAccount: string;
  agentWallet: string;
  validatorVoteAccount: string;
  amount: number;
  timestamp: string;
}

interface MonitoredStake {
  id: string;
  transactionSignature: string;
  stakeAccount: string;
  agentWallet: string;
  validatorVoteAccount: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'activated' | 'failed';
  createdAt: string;
  confirmedAt?: string;
  activatedAt?: string;
  lastCheckedAt?: string;
}

export class StakeMonitoringService {
  private connection: Connection;
  private monitoredStakes: Map<string, MonitoredStake> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private checkIntervalMs = 30000; // Check every 30 seconds

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
  }

  async addStakeMonitoring(request: StakeMonitoringRequest): Promise<string> {
    const monitoringId = `stake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const monitoredStake: MonitoredStake = {
      id: monitoringId,
      transactionSignature: request.transactionSignature,
      stakeAccount: request.stakeAccount,
      agentWallet: request.agentWallet,
      validatorVoteAccount: request.validatorVoteAccount,
      amount: request.amount,
      status: 'pending',
      createdAt: request.timestamp,
    };

    this.monitoredStakes.set(monitoringId, monitoredStake);

    logger.info('Added stake monitoring', {
      monitoringId,
      transactionSignature: request.transactionSignature,
      stakeAccount: request.stakeAccount,
      agentWallet: request.agentWallet,
    });

    return monitoringId;
  }

  async checkStakeStatus(monitoredStake: MonitoredStake): Promise<void> {
    try {
      const stakeAccountPubkey = new PublicKey(monitoredStake.stakeAccount);
      
      // First, check if the transaction is confirmed
      if (monitoredStake.status === 'pending') {
        const signatureStatus = await this.connection.getSignatureStatus(
          monitoredStake.transactionSignature
        );

        if (signatureStatus?.value?.confirmationStatus === 'confirmed' || 
            signatureStatus?.value?.confirmationStatus === 'finalized') {
          
          monitoredStake.status = 'confirmed';
          monitoredStake.confirmedAt = new Date().toISOString();

          logger.info('Stake transaction confirmed', {
            monitoringId: monitoredStake.id,
            transactionSignature: monitoredStake.transactionSignature,
          });

          // Trigger stake_confirmed webhook
          await webhookDeliveryService.deliverWebhook('stake_confirmed', {
            transactionSignature: monitoredStake.transactionSignature,
            amount: monitoredStake.amount,
            validatorVoteAccount: monitoredStake.validatorVoteAccount,
            agentWallet: monitoredStake.agentWallet,
            stakeAccount: monitoredStake.stakeAccount,
            timestamp: monitoredStake.confirmedAt!,
          });
        }
      }

      // Check if stake is activated
      if (monitoredStake.status === 'confirmed') {
        const stakeAccountInfo = await this.connection.getAccountInfo(stakeAccountPubkey);
        
        if (stakeAccountInfo) {
          // Check if stake account is activated by examining the data length and structure
          // A full stake account has more data than an uninitialized one
          const isActivated = stakeAccountInfo.data.length > 200; // Rough heuristic
          
          if (isActivated) {
            monitoredStake.status = 'activated';
            monitoredStake.activatedAt = new Date().toISOString();

            logger.info('Stake activated', {
              monitoringId: monitoredStake.id,
              stakeAccount: monitoredStake.stakeAccount,
            });

            // Trigger stake_activated webhook
            await webhookDeliveryService.deliverWebhook('stake_activated', {
              transactionSignature: monitoredStake.transactionSignature,
              amount: monitoredStake.amount,
              validatorVoteAccount: monitoredStake.validatorVoteAccount,
              agentWallet: monitoredStake.agentWallet,
              stakeAccount: monitoredStake.stakeAccount,
              timestamp: monitoredStake.activatedAt!,
            });

            // Remove from active monitoring after activation
            this.monitoredStakes.delete(monitoredStake.id);
          }
        }
      }

      monitoredStake.lastCheckedAt = new Date().toISOString();

    } catch (error) {
      logger.error('Failed to check stake status', {
        monitoringId: monitoredStake.id,
        error: (error as Error).message,
      });

      // Mark as failed after 24 hours of monitoring
      const createdAt = new Date(monitoredStake.createdAt);
      const now = new Date();
      const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceCreated > 24) {
        monitoredStake.status = 'failed';
        logger.warn('Stake monitoring timeout', {
          monitoringId: monitoredStake.id,
          hoursSinceCreated,
        });
        
        // Remove failed stakes from monitoring
        this.monitoredStakes.delete(monitoredStake.id);
      }
    }
  }

  async processMonitoringQueue(): Promise<void> {
    const stakes = Array.from(this.monitoredStakes.values());
    
    if (stakes.length === 0) {
      return;
    }

    logger.debug('Processing stake monitoring queue', {
      count: stakes.length,
    });

    // Check stakes in parallel with limited concurrency
    const concurrency = 3;
    for (let i = 0; i < stakes.length; i += concurrency) {
      const batch = stakes.slice(i, i + concurrency);
      await Promise.all(
        batch.map(stake => this.checkStakeStatus(stake))
      );
    }
  }

  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already started
    }

    logger.info('Starting stake monitoring service', {
      checkIntervalMs: this.checkIntervalMs,
    });

    this.monitoringInterval = setInterval(() => {
      this.processMonitoringQueue().catch(error => {
        logger.error('Monitoring queue processing error', {
          error: (error as Error).message,
        });
      });
    }, this.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined as any;
      
      logger.info('Stopped stake monitoring service');
    }
  }

  getMonitoredStakes(): MonitoredStake[] {
    return Array.from(this.monitoredStakes.values());
  }

  getMonitoringStatus(monitoringId: string): MonitoredStake | null {
    return this.monitoredStakes.get(monitoringId) || null;
  }

  // Validator monitoring methods
  async checkValidatorPerformance(): Promise<void> {
    try {
      const voteAccounts = await this.connection.getVoteAccounts();
      const currentEpochInfo = await this.connection.getEpochInfo();
      
      // Check for delinquent validators that have monitored stakes
      const monitoredValidators = new Set(
        Array.from(this.monitoredStakes.values()).map(s => s.validatorVoteAccount)
      );

      voteAccounts.delinquent.forEach(delinquent => {
        if (monitoredValidators.has(delinquent.votePubkey)) {
          // Find all stakes for this validator
          const affectedStakes = Array.from(this.monitoredStakes.values())
            .filter(s => s.validatorVoteAccount === delinquent.votePubkey);

          affectedStakes.forEach(stake => {
            logger.warn('Validator delinquent', {
              validatorVoteAccount: delinquent.votePubkey,
              stakeAccount: stake.stakeAccount,
              agentWallet: stake.agentWallet,
            });

            // Trigger validator_delinquent webhook
            webhookDeliveryService.deliverWebhook('validator_delinquent', {
              validatorVoteAccount: delinquent.votePubkey,
              agentWallet: stake.agentWallet,
              stakeAccount: stake.stakeAccount,
              epochsDelinquent: currentEpochInfo.epoch - (delinquent.lastVote || 0),
              timestamp: new Date().toISOString(),
            }).catch(error => {
              logger.error('Failed to deliver validator delinquent webhook', {
                error: (error as Error).message,
              });
            });
          });
        }
      });

    } catch (error) {
      logger.error('Failed to check validator performance', {
        error: (error as Error).message,
      });
    }
  }

  // Start validator performance monitoring (runs less frequently)
  startValidatorMonitoring(): NodeJS.Timeout {
    logger.info('Starting validator performance monitoring');
    
    return setInterval(() => {
      this.checkValidatorPerformance().catch(error => {
        logger.error('Validator performance check error', {
          error: (error as Error).message,
        });
      });
    }, 300000); // Check every 5 minutes
  }
}

// Singleton instance
export const stakeMonitoringService = new StakeMonitoringService();