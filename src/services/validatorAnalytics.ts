/**
 * Validator Analytics Service
 * Integrates with external validator analytics API to provide live validator data
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';
import { config } from './config';

// Types for validator analytics API
interface ValidatorMetrics {
  voteAccount: string;
  name: string;
  commission: number;
  apy: number;
  totalStake: number;
  epochCredits: number;
  skipRate: number;
  health: 'excellent' | 'good' | 'fair' | 'poor';
  uptime: number;
  datacenter: string;
  isDelinquent: boolean;
  rank: number;
}

interface ValidatorAnalyticsResponse {
  validators: ValidatorMetrics[];
  epoch: number;
  lastUpdated: string;
  totalValidators: number;
}

export interface ValidatorInfo {
  voteAccount: string;
  name: string;
  commission: number;
  apy: number;
  isPhaseValidator: boolean;
  health: 'excellent' | 'good' | 'fair' | 'poor';
  totalStake?: number;
  uptime?: number;
  skipRate?: number;
  datacenter?: string;
  rank?: number;
}

class ValidatorAnalyticsService {
  private client: AxiosInstance;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private cache: {
    data: ValidatorAnalyticsResponse | null;
    timestamp: number;
  } = {
    data: null,
    timestamp: 0
  };

  constructor() {
    const baseURL = process.env.VALIDATOR_ANALYTICS_API_URL || 'https://validators.app/api/v1';
    const apiKey = process.env.VALIDATOR_ANALYTICS_API_KEY;

    this.client = axios.create({
      baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug('Validator analytics API request', {
        url: config.url,
        method: config.method,
        baseURL: config.baseURL
      });
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Validator analytics API response', {
          status: response.status,
          dataSize: JSON.stringify(response.data).length
        });
        return response;
      },
      (error) => {
        logger.error('Validator analytics API error', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );

    logger.info('Validator Analytics Service initialized', {
      baseURL,
      hasApiKey: !!apiKey,
      cacheTimeoutMs: this.cacheTimeout
    });
  }

  /**
   * Fetch live validator data from analytics API
   */
  async fetchValidatorData(): Promise<ValidatorAnalyticsResponse> {
    try {
      // Check cache first
      if (this.cache.data && (Date.now() - this.cache.timestamp) < this.cacheTimeout) {
        logger.debug('Returning cached validator data');
        return this.cache.data;
      }

      logger.info('Fetching fresh validator data from analytics API');
      const startTime = Date.now();

      // Try different endpoint variations based on the API
      let response;
      try {
        // Try validators.app API format first
        response = await this.client.get('/validators', {
          params: {
            cluster: config.solana.cluster,
            limit: 100,
            order: 'apy desc'
          }
        });
      } catch (error) {
        logger.warn('Primary API endpoint failed, trying alternative', { error: (error as Error).message });
        
        // Try alternative endpoint format
        response = await this.client.get('/validator/list', {
          params: {
            network: config.solana.cluster === 'mainnet-beta' ? 'mainnet' : config.solana.cluster
          }
        });
      }

      const processingTime = Date.now() - startTime;
      
      // Transform response data to our format
      const validatorData = this.transformValidatorData(response.data);
      
      // Update cache
      this.cache.data = validatorData;
      this.cache.timestamp = Date.now();

      logger.info('Validator data fetched successfully', {
        totalValidators: validatorData.totalValidators,
        processingTimeMs: processingTime,
        cached: true
      });

      return validatorData;

    } catch (error) {
      logger.error('Failed to fetch validator data', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });

      // Return fallback data if API is unavailable
      return this.getFallbackValidatorData();
    }
  }

  /**
   * Transform API response to our internal format
   */
  private transformValidatorData(rawData: any): ValidatorAnalyticsResponse {
    // Handle different API response formats
    let validators: any[] = [];
    
    if (rawData.validators) {
      validators = rawData.validators;
    } else if (Array.isArray(rawData)) {
      validators = rawData;
    } else if (rawData.data && Array.isArray(rawData.data)) {
      validators = rawData.data;
    }

    const transformedValidators: ValidatorMetrics[] = validators.slice(0, 20).map((validator, index) => {
      // Handle different field names across APIs
      const voteAccount = validator.vote_account || validator.voteAccount || validator.account || validator.pubkey;
      const name = validator.name || validator.moniker || validator.identity || 'Unknown Validator';
      const commission = validator.commission !== undefined ? validator.commission : (validator.commission_rate || 10);
      const apy = validator.apy !== undefined ? validator.apy : (validator.apr || validator.yield || 6.5);
      const totalStake = validator.activated_stake || validator.total_stake || validator.stake || 0;
      const skipRate = validator.skip_rate !== undefined ? validator.skip_rate : (validator.skipRate || 0);
      
      // Calculate health based on available metrics
      let health: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
      if (skipRate < 2 && !validator.delinquent) {
        health = 'excellent';
      } else if (skipRate < 5) {
        health = 'good';
      } else if (skipRate < 10) {
        health = 'fair';
      } else {
        health = 'poor';
      }

      return {
        voteAccount,
        name,
        commission: Number(commission),
        apy: Number(apy),
        totalStake: Number(totalStake),
        epochCredits: validator.epoch_credits || validator.credits || 0,
        skipRate: Number(skipRate),
        health,
        uptime: validator.uptime || 99,
        datacenter: validator.data_center || validator.datacenter || 'Unknown',
        isDelinquent: Boolean(validator.delinquent),
        rank: index + 1
      };
    });

    return {
      validators: transformedValidators,
      epoch: rawData.epoch || 0,
      lastUpdated: new Date().toISOString(),
      totalValidators: transformedValidators.length
    };
  }

  /**
   * Get fallback validator data when API is unavailable
   */
  private getFallbackValidatorData(): ValidatorAnalyticsResponse {
    logger.warn('Using fallback validator data due to API unavailability');
    
    return {
      validators: [
        {
          voteAccount: config.phase.validatorVoteAccount,
          name: 'Phase Validator',
          commission: 5,
          apy: 7.2,
          totalStake: 50000000000000, // 50k SOL
          epochCredits: 400,
          skipRate: 0.5,
          health: 'excellent',
          uptime: 99.9,
          datacenter: 'US-EAST',
          isDelinquent: false,
          rank: 1
        },
        {
          voteAccount: 'CertusDeBmqN8ZawdkxK5kFGMwBXdudvWLSGq6UKHLVa',
          name: 'Certus One',
          commission: 7,
          apy: 6.8,
          totalStake: 80000000000000,
          epochCredits: 380,
          skipRate: 1.2,
          health: 'excellent',
          uptime: 99.5,
          datacenter: 'EU-WEST',
          isDelinquent: false,
          rank: 2
        },
        {
          voteAccount: '9QU2QSxhb24FUX3Tu2FpczXjpK3VYrvRudywSgW5kP8M',
          name: 'Staking Fund',
          commission: 6,
          apy: 6.9,
          totalStake: 60000000000000,
          epochCredits: 390,
          skipRate: 0.8,
          health: 'excellent',
          uptime: 99.7,
          datacenter: 'US-WEST',
          isDelinquent: false,
          rank: 3
        }
      ],
      epoch: 500,
      lastUpdated: new Date().toISOString(),
      totalValidators: 3
    };
  }

  /**
   * Get recommended validators for staking
   */
  async getRecommendedValidators(limit: number = 10): Promise<ValidatorInfo[]> {
    try {
      const data = await this.fetchValidatorData();
      
      // Sort validators by a combination of APY, health, and skip rate
      const sortedValidators = data.validators
        .filter(v => !v.isDelinquent) // Exclude delinquent validators
        .sort((a, b) => {
          // Scoring algorithm: weight APY highly, penalize high skip rates and commissions
          const scoreA = a.apy - (a.skipRate * 0.5) - (a.commission * 0.1);
          const scoreB = b.apy - (b.skipRate * 0.5) - (b.commission * 0.1);
          return scoreB - scoreA;
        });

      // Ensure Phase validator is prioritized if present
      const phaseValidatorIndex = sortedValidators.findIndex(
        v => v.voteAccount === config.phase.validatorVoteAccount
      );
      
      if (phaseValidatorIndex > 0) {
        // Move Phase validator to front
        const phaseValidator = sortedValidators.splice(phaseValidatorIndex, 1)[0];
        sortedValidators.unshift(phaseValidator);
      }

      // Transform to ValidatorInfo format
      const recommendations: ValidatorInfo[] = sortedValidators
        .slice(0, limit)
        .map(validator => ({
          voteAccount: validator.voteAccount,
          name: validator.name,
          commission: validator.commission,
          apy: validator.apy,
          isPhaseValidator: validator.voteAccount === config.phase.validatorVoteAccount,
          health: validator.health,
          totalStake: validator.totalStake,
          uptime: validator.uptime,
          skipRate: validator.skipRate,
          datacenter: validator.datacenter,
          rank: validator.rank
        }));

      logger.info('Validator recommendations generated', {
        totalRecommendations: recommendations.length,
        phaseValidatorIncluded: recommendations.some(v => v.isPhaseValidator),
        averageAPY: (recommendations.reduce((sum, v) => sum + v.apy, 0) / recommendations.length).toFixed(2)
      });

      return recommendations;

    } catch (error) {
      logger.error('Failed to get validator recommendations', {
        error: (error as Error).message
      });

      // Return fallback recommendations
      const fallbackData = this.getFallbackValidatorData();
      return fallbackData.validators.map(validator => ({
        voteAccount: validator.voteAccount,
        name: validator.name,
        commission: validator.commission,
        apy: validator.apy,
        isPhaseValidator: validator.voteAccount === config.phase.validatorVoteAccount,
        health: validator.health,
        totalStake: validator.totalStake,
        uptime: validator.uptime,
        skipRate: validator.skipRate,
        datacenter: validator.datacenter,
        rank: validator.rank
      }));
    }
  }

  /**
   * Clear cache - useful for testing or forced refresh
   */
  clearCache(): void {
    this.cache.data = null;
    this.cache.timestamp = 0;
    logger.info('Validator analytics cache cleared');
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { isCached: boolean; age: number; remainingMs: number } {
    const age = Date.now() - this.cache.timestamp;
    const remainingMs = Math.max(0, this.cacheTimeout - age);
    
    return {
      isCached: !!this.cache.data,
      age,
      remainingMs
    };
  }
}

// Export singleton instance
export const validatorAnalyticsService = new ValidatorAnalyticsService();