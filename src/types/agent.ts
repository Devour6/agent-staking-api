import { PublicKey } from '@solana/web3.js';

// Agent Tier Types
export type AgentTier = 'basic' | 'standard' | 'premium';

export interface AgentTierInfo {
  name: AgentTier;
  rateLimit: {
    requestsPerHour: number;
    burstLimit: number;
  };
  features: string[];
  stakingLimit?: number; // Max SOL that can be staked
}

// Request Types
export interface RegisterAgentRequest {
  name: string;
  description: string;
  callbackUrl?: string;
  tierPreference: AgentTier;
}

export interface UpdateAgentRequest {
  description?: string;
  callbackUrl?: string;
  tierUpgradeRequest?: AgentTier;
}

export interface AgreeTermsRequest {
  agentId: string;
  termsVersion: string;
  agreedAt: string;
}

// Response Types
export interface RegisterAgentResponse {
  agentId: string;
  apiKey: string;
  tier: AgentTier;
  rateLimitInfo: {
    requestsPerHour: number;
    burstLimit: number;
  };
  createdAt: string;
}

export interface AgentProfileResponse {
  agentId: string;
  name: string;
  description: string;
  callbackUrl?: string;
  tier: AgentTier;
  registrationDate: string;
  tosAccepted: boolean;
  tosAcceptedAt?: string;
  usageStats: {
    totalRequests: number;
    requestsThisMonth: number;
    lastRequestAt?: string;
  };
  activeStakePositions: {
    totalStaked: number;
    activePositions: number;
  };
}

export interface UpdateAgentResponse {
  agentId: string;
  updatedAt: string;
  changes: string[];
  tierUpgradeStatus?: 'pending' | 'approved' | 'denied';
}

export interface AgreeTermsResponse {
  agentId: string;
  termsAccepted: boolean;
  acceptedAt: string;
  termsVersion: string;
}

// Storage Types
export interface AgentRegistration {
  id: string;
  name: string;
  description: string;
  callbackUrl?: string;
  tier: AgentTier;
  apiKeyHash: string; // Hashed API key for security
  registrationDate: string;
  tosAccepted: boolean;
  tosAcceptedAt?: string;
  tosVersion?: string;
  tierUpgradeRequest?: {
    requestedTier: AgentTier;
    requestedAt: string;
    status: 'pending' | 'approved' | 'denied';
  };
  usageStats: {
    totalRequests: number;
    requestsThisMonth: number;
    lastRequestAt?: string;
    monthlyResets: Record<string, number>; // YYYY-MM -> request count
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentApiKey {
  agentId: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
}

// Validation Types
export interface AgentValidationError {
  field: string;
  message: string;
  code: string;
}

// Constants
export const AGENT_TIERS: Record<AgentTier, AgentTierInfo> = {
  basic: {
    name: 'basic',
    rateLimit: {
      requestsPerHour: 100,
      burstLimit: 10,
    },
    features: ['Basic staking', 'Stake monitoring', 'Email notifications'],
    stakingLimit: 10, // 10 SOL max
  },
  standard: {
    name: 'standard',
    rateLimit: {
      requestsPerHour: 500,
      burstLimit: 25,
    },
    features: [
      'All basic features',
      'Liquid staking',
      'Webhook notifications',
      'Priority support',
    ],
    stakingLimit: 100, // 100 SOL max
  },
  premium: {
    name: 'premium',
    rateLimit: {
      requestsPerHour: 2000,
      burstLimit: 100,
    },
    features: [
      'All standard features',
      'Unlimited staking',
      'Custom validators',
      'Dedicated support',
      'Beta features access',
    ],
    // No staking limit for premium
  },
};

export const CURRENT_TERMS_VERSION = '1.0';

export const AGENT_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\s\-_\.]{1,48}[a-zA-Z0-9]$/;
export const AGENT_DESCRIPTION_MAX_LENGTH = 500;