import { PublicKey } from '@solana/web3.js';

// Request Types
export interface NativeStakeRequest {
  agentWallet: string;           // Agent's wallet public key
  amount: number;                // SOL amount in lamports
  validatorVoteAccount?: string; // Optional: specific validator
  stakeAuthority?: string;       // Optional: custom stake authority
}

export interface LiquidStakeRequest {
  agentWallet: string;          // Agent's wallet public key
  amount: number;               // SOL amount in lamports
  slippageTolerance?: number;   // Max slippage (default: 0.5%)
}

export interface UnstakeRequest {
  agentWallet: string;          // Agent's wallet public key
  stakeAccount?: string;        // For native: specific stake account
  liquidTokens?: number;        // For liquid: token amount to unstake
  type: 'native' | 'liquid';
}

export interface TransactionSubmitRequest {
  signedTransaction: string;    // Base64 encoded signed transaction
  maxRetries?: number;          // Max submission attempts
  priorityFee?: number;         // Additional priority fee
}

// Response Types
export interface NativeStakeResponse {
  transaction: string;          // Base64 encoded unsigned transaction
  stakeAccount: string;         // Generated stake account public key
  estimatedApy: number;         // Expected staking APY
  activationEpoch: number;      // When stake becomes active
  feeAmount: number;            // Rake fee in lamports
  instructions: InstructionInfo[];
}

export interface LiquidStakeResponse {
  transaction: string;          // Base64 encoded unsigned transaction
  expectedTokens: number;       // Expected tokens to receive
  exchangeRate: number;         // Current SOL:token rate
  poolApy: number;              // Expected liquid staking APY
  feeAmount: number;            // Rake fee in lamports
  instructions: InstructionInfo[];
}

export interface UnstakeResponse {
  transaction: string;          // Base64 encoded unsigned transaction
  cooldownEpochs: number;       // Epochs until withdrawal available
  availableAt: string;          // Estimated availability timestamp
  feeAmount: number;            // Withdrawal fee in lamports
  immediateSOL?: number;        // For liquid: immediate SOL if available
}

export interface TransactionSubmitResponse {
  signature: string;            // Transaction signature
  status: 'success' | 'failed' | 'pending';
  confirmationStatus: string;   // Solana confirmation level
  slot: number;                 // Slot number
  error?: string;               // Error message if failed
}

export interface InstructionInfo {
  type: string;
  description: string;
  accounts: string[];
}

export interface ValidatorInfo {
  voteAccount: string;
  name: string;
  commission: number;
  apy: number;
  isPhaseValidator: boolean;
  health: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface StakeRecommendationResponse {
  native: {
    validators: ValidatorInfo[];
    recommendedAllocation: number; // Percentage
  };
  liquid: {
    pools: {
      name: string;
      token: string;
      mint: string;
      apy: number;
      tvl: number;
      isPhasePool: boolean;
    }[];
    featured: string;             // Phase pool identifier
  };
  analytics?: {
    dataSource: string;           // 'validator-analytics-api' | 'static-fallback'
    lastUpdated: string;          // ISO timestamp
    averageAPY: number;           // Average APY across recommended validators
    totalValidatorsAnalyzed: number;
    cacheStatus: {
      isCached: boolean;
      age: number;
      remainingMs: number;
    };
  };
}

export interface StakeAccount {
  address: string;
  balance: number;
  status: 'active' | 'activating' | 'deactivating';
  validator: string;
  activationEpoch: number;
}

export interface PositionResponse {
  wallet: string;
  totalStaked: number;          // Total SOL staked across all positions
  totalValue: number;           // Current value including rewards
  totalRewards: number;         // Lifetime staking rewards earned
  native: {
    stakeAccounts: StakeAccount[];
  };
  liquid: {
    positions: {
      token: string;
      balance: number;
      solValue: number;
      apy: number;
    }[];
  };
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
  requestId?: string;
}