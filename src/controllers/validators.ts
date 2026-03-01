import { Request, Response } from 'express';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { logger } from '@/services/logger';
import { PublicKey } from '@solana/web3.js';

interface ValidatorInfo {
  voteAccount: string;
  identityAccount: string;
  name: string;
  website?: string;
  details?: string;
  commission: number; // Percentage (0-100)
  apy: number; // Annual percentage yield
  totalStake: number; // In lamports
  activeStake: number; // In lamports
  dataCenter?: string;
  country?: string;
  isActive: boolean;
  isDelinquent: boolean;
  skippedSlots: number;
  lastVote: number; // Slot number
  performance: {
    skipRate: number; // Percentage
    uptimePercent: number;
    epochsActive: number;
  };
  features?: string[]; // MEV protection, etc.
}

// Mock validator data - in production this would come from Solana RPC and validator registries
const mockValidators: ValidatorInfo[] = [
  {
    voteAccount: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
    identityAccount: "GrDMoYLkXX9JSFiHwNYRLFXnJY8RjGhLzVe7vL2q9MDZ",
    name: "Phase Labs Validator",
    website: "https://phaselabs.io",
    details: "High-performance validator with MEV protection",
    commission: 5.0,
    apy: 7.2,
    totalStake: 50000000000000, // 50k SOL in lamports
    activeStake: 48500000000000,
    dataCenter: "US-East",
    country: "United States",
    isActive: true,
    isDelinquent: false,
    skippedSlots: 12,
    lastVote: 245780123,
    performance: {
      skipRate: 0.05,
      uptimePercent: 99.95,
      epochsActive: 450
    },
    features: ["MEV Protection", "Auto-updates", "Monitoring"]
  },
  {
    voteAccount: "8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm",
    identityAccount: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    name: "Solana Foundation",
    website: "https://solana.org",
    details: "Official Solana Foundation validator",
    commission: 7.0,
    apy: 6.8,
    totalStake: 100000000000000, // 100k SOL
    activeStake: 99800000000000,
    dataCenter: "US-West",
    country: "United States",
    isActive: true,
    isDelinquent: false,
    skippedSlots: 5,
    lastVote: 245780120,
    performance: {
      skipRate: 0.02,
      uptimePercent: 99.98,
      epochsActive: 600
    },
    features: ["Official", "High-uptime"]
  },
  {
    voteAccount: "J1to3PQfXidUUhprQWgdKkQAMWPJAEqSJ7amkBDE9qhF",
    identityAccount: "CakcnaRDHka2gXyfbEd2d3xsvkJkqsLw2akB3zsN1D2S",
    name: "Jupiter Validator",
    website: "https://jup.ag",
    details: "High-performance validator by Jupiter team",
    commission: 6.5,
    apy: 7.0,
    totalStake: 75000000000000, // 75k SOL
    activeStake: 74200000000000,
    dataCenter: "EU-Central",
    country: "Germany",
    isActive: true,
    isDelinquent: false,
    skippedSlots: 8,
    lastVote: 245780118,
    performance: {
      skipRate: 0.03,
      uptimePercent: 99.92,
      epochsActive: 380
    },
    features: ["DeFi-optimized", "Low latency"]
  }
];

/**
 * List all validators with performance metrics
 * GET /validators
 */
export const listValidators = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      sortBy = 'apy',
      order = 'desc',
      minApy,
      maxCommission,
      activeOnly = 'true',
      limit = '50',
      offset = '0'
    } = req.query;

    // Validate sort options
    const validSortFields = ['apy', 'commission', 'totalStake', 'uptimePercent', 'name'];
    if (typeof sortBy === 'string' && !validSortFields.includes(sortBy)) {
      throw createApiError(`Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}`, 400, 'INVALID_SORT_FIELD');
    }

    // Filter validators
    let filteredValidators = mockValidators.filter(validator => {
      if (activeOnly === 'true' && !validator.isActive) return false;
      if (minApy && validator.apy < parseFloat(minApy as string)) return false;
      if (maxCommission && validator.commission > parseFloat(maxCommission as string)) return false;
      return true;
    });

    // Sort validators
    filteredValidators.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'apy':
          aValue = a.apy;
          bValue = b.apy;
          break;
        case 'commission':
          aValue = a.commission;
          bValue = b.commission;
          break;
        case 'totalStake':
          aValue = a.totalStake;
          bValue = b.totalStake;
          break;
        case 'uptimePercent':
          aValue = a.performance.uptimePercent;
          bValue = b.performance.uptimePercent;
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        default:
          aValue = a.apy;
          bValue = b.apy;
      }

      if (order === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Pagination
    const limitNum = parseInt(limit as string) || 50;
    const offsetNum = parseInt(offset as string) || 0;
    const paginatedValidators = filteredValidators.slice(offsetNum, offsetNum + limitNum);

    logger.info('Validators listed', {
      total: filteredValidators.length,
      returned: paginatedValidators.length,
      filters: { sortBy, order, minApy, maxCommission, activeOnly }
    });

    res.json(createApiResponse({
      validators: paginatedValidators,
      pagination: {
        total: filteredValidators.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < filteredValidators.length
      },
      filters: {
        sortBy,
        order,
        minApy: minApy ? parseFloat(minApy as string) : undefined,
        maxCommission: maxCommission ? parseFloat(maxCommission as string) : undefined,
        activeOnly: activeOnly === 'true'
      }
    }));
  }
);

/**
 * Get detailed information about a specific validator
 * GET /validators/:voteAccount
 */
export const getValidatorDetails = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { voteAccount } = req.params;

    if (!voteAccount || Array.isArray(voteAccount)) {
      throw createApiError('Valid vote account address is required', 400, 'MISSING_VOTE_ACCOUNT');
    }

    // Validate Solana public key format
    try {
      new PublicKey(voteAccount);
    } catch (error) {
      throw createApiError('Invalid vote account address format', 400, 'INVALID_VOTE_ACCOUNT');
    }

    const validator = mockValidators.find(v => v.voteAccount === voteAccount);
    if (!validator) {
      throw createApiError('Validator not found', 404, 'VALIDATOR_NOT_FOUND');
    }

    logger.info('Validator details requested', { voteAccount, name: validator.name });

    res.json(createApiResponse({
      validator,
      recommendationScore: calculateRecommendationScore(validator),
      riskFactors: analyzeRiskFactors(validator)
    }));
  }
);

/**
 * Get validator recommendations for staking
 * GET /validators/recommend
 */
export const getValidatorRecommendations = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      amount,
      riskTolerance = 'medium',
      maxCommission = '10',
      diversify = 'true',
      count = '3'
    } = req.query;

    const validRiskLevels = ['low', 'medium', 'high'];
    if (typeof riskTolerance === 'string' && !validRiskLevels.includes(riskTolerance)) {
      throw createApiError(`Invalid riskTolerance. Must be one of: ${validRiskLevels.join(', ')}`, 400, 'INVALID_RISK_TOLERANCE');
    }

    const stakeAmount = amount ? parseFloat(amount as string) : undefined;
    const maxCommissionNum = parseFloat(maxCommission as string);
    const shouldDiversify = diversify === 'true';
    const recommendationCount = Math.min(parseInt(count as string) || 3, 10);

    // Filter eligible validators
    const eligibleValidators = mockValidators.filter(validator => {
      if (!validator.isActive || validator.isDelinquent) return false;
      if (validator.commission > maxCommissionNum) return false;
      return true;
    });

    // Score and rank validators
    const scoredValidators = eligibleValidators.map(validator => ({
      ...validator,
      score: calculateRecommendationScore(validator, riskTolerance as string),
      diversificationBonus: shouldDiversify ? getDiversificationBonus(validator, eligibleValidators) : 0
    }));

    // Sort by total score (recommendation + diversification)
    scoredValidators.sort((a, b) => (b.score + b.diversificationBonus) - (a.score + a.diversificationBonus));

    // Select top recommendations
    const recommendations = scoredValidators.slice(0, recommendationCount).map(validator => ({
      voteAccount: validator.voteAccount,
      name: validator.name,
      apy: validator.apy,
      commission: validator.commission,
      score: validator.score,
      riskLevel: getRiskLevel(validator),
      reason: generateRecommendationReason(validator, riskTolerance as string),
      suggestedAllocation: stakeAmount ? calculateAllocation(validator, stakeAmount, recommendationCount) : undefined
    }));

    logger.info('Validator recommendations generated', {
      requestedCount: recommendationCount,
      returnedCount: recommendations.length,
      riskTolerance,
      stakeAmount,
      diversify: shouldDiversify
    });

    res.json(createApiResponse({
      recommendations,
      criteria: {
        riskTolerance,
        maxCommission: maxCommissionNum,
        diversify: shouldDiversify,
        stakeAmount
      },
      totalValidators: eligibleValidators.length
    }));
  }
);

// Helper functions
function calculateRecommendationScore(validator: ValidatorInfo, riskTolerance: string = 'medium'): number {
  let score = 0;

  // Base score from APY (0-40 points)
  score += Math.min(validator.apy * 4, 40);

  // Commission penalty (0-20 points, lower commission = higher score)
  score += Math.max(20 - validator.commission * 2, 0);

  // Uptime bonus (0-30 points)
  score += validator.performance.uptimePercent * 0.3;

  // Skip rate penalty
  score -= validator.performance.skipRate * 100;

  // Experience bonus (0-10 points)
  score += Math.min(validator.performance.epochsActive / 100, 10);

  // Risk tolerance adjustments
  if (riskTolerance === 'low') {
    // Prefer established validators
    score += validator.performance.epochsActive > 300 ? 5 : -5;
    score += validator.performance.uptimePercent > 99.9 ? 5 : -5;
  } else if (riskTolerance === 'high') {
    // Prefer higher APY even with slightly higher risk
    score += validator.apy > 7.0 ? 5 : 0;
  }

  return Math.max(score, 0);
}

function analyzeRiskFactors(validator: ValidatorInfo): string[] {
  const risks: string[] = [];

  if (validator.commission > 8) {
    risks.push('High commission rate');
  }

  if (validator.performance.uptimePercent < 99.5) {
    risks.push('Below average uptime');
  }

  if (validator.performance.skipRate > 0.1) {
    risks.push('High skip rate');
  }

  if (validator.performance.epochsActive < 200) {
    risks.push('Relatively new validator');
  }

  if (validator.isDelinquent) {
    risks.push('Currently delinquent');
  }

  if (validator.totalStake < 10000000000000) { // Less than 10k SOL
    risks.push('Low total stake');
  }

  return risks;
}

function getDiversificationBonus(validator: ValidatorInfo, allValidators: ValidatorInfo[]): number {
  // Simple diversification scoring based on data center and country
  const sameDataCenter = allValidators.filter(v => v.dataCenter === validator.dataCenter).length;
  const sameCountry = allValidators.filter(v => v.country === validator.country).length;

  // Lower concentration = higher bonus
  const dcBonus = Math.max(5 - sameDataCenter, 0);
  const countryBonus = Math.max(5 - sameCountry, 0);

  return dcBonus + countryBonus;
}

function getRiskLevel(validator: ValidatorInfo): 'low' | 'medium' | 'high' {
  const riskFactors = analyzeRiskFactors(validator).length;

  if (riskFactors <= 1 && validator.performance.uptimePercent >= 99.9) {
    return 'low';
  } else if (riskFactors <= 3) {
    return 'medium';
  } else {
    return 'high';
  }
}

function generateRecommendationReason(validator: ValidatorInfo, riskTolerance: string): string {
  const reasons: string[] = [];

  if (validator.apy >= 7.0) {
    reasons.push('high APY');
  }

  if (validator.commission <= 5.0) {
    reasons.push('low commission');
  }

  if (validator.performance.uptimePercent >= 99.9) {
    reasons.push('excellent uptime');
  }

  if (validator.performance.epochsActive > 400) {
    reasons.push('proven track record');
  }

  if (validator.features && validator.features.includes('MEV Protection')) {
    reasons.push('MEV protection');
  }

  const reason = reasons.length > 0 ? `Recommended for ${reasons.join(', ')}` : 'Solid overall performance';
  
  if (riskTolerance === 'low') {
    return `${reason}. Low risk profile suitable for conservative staking.`;
  } else if (riskTolerance === 'high') {
    return `${reason}. Higher yield potential with acceptable risk.`;
  } else {
    return `${reason}. Well-balanced risk-reward profile.`;
  }
}

function calculateAllocation(validator: ValidatorInfo, totalAmount: number, validatorCount: number): number {
  // Simple equal allocation for now - could be weighted by score in production
  return totalAmount / validatorCount;
}