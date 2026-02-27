import dotenv from 'dotenv';
import Joi from 'joi';
import { AppConfig } from '@/types/config';

dotenv.config();

const configSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  
  SOLANA_RPC_URL: Joi.string().uri().required(),
  SOLANA_RPC_URL_BACKUP: Joi.string().uri().optional(),
  SOLANA_CLUSTER: Joi.string().valid('mainnet-beta', 'devnet', 'testnet').default('mainnet-beta'),
  
  PHASE_FEE_WALLET: Joi.string().required(),
  PHASE_VALIDATOR_VOTE_ACCOUNT: Joi.string().required(),
  RAKE_FEE_BASIS_POINTS: Joi.number().min(0).max(10000).default(10),
  PHASE_YIELD_STAKE_POOL_MINT: Joi.string().default('phaseZSfPxTDBpiVb96H4XFSD8xHeHxZre5HerehBJG'),
  PHASE_YIELD_STAKE_POOL_ADDRESS: Joi.string().optional(),
  
  API_KEY_SECRET: Joi.string().min(32).required(),
  
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(10),
  
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().optional(),
  
  HEALTH_CHECK_TIMEOUT_MS: Joi.number().default(5000),
});

const { error, value: envVars } = configSchema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config: AppConfig = {
  server: {
    port: envVars.PORT,
    nodeEnv: envVars.NODE_ENV,
  },
  solana: {
    rpcUrl: envVars.SOLANA_RPC_URL,
    rpcUrlBackup: envVars.SOLANA_RPC_URL_BACKUP,
    cluster: envVars.SOLANA_CLUSTER,
  },
  phase: {
    feeWallet: envVars.PHASE_FEE_WALLET,
    validatorVoteAccount: envVars.PHASE_VALIDATOR_VOTE_ACCOUNT,
    rakeFeeBasisPoints: envVars.RAKE_FEE_BASIS_POINTS,
    yieldStakePoolMint: envVars.PHASE_YIELD_STAKE_POOL_MINT,
    yieldStakePoolAddress: envVars.PHASE_YIELD_STAKE_POOL_ADDRESS,
  },
  auth: {
    apiKeySecret: envVars.API_KEY_SECRET,
  },
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  logging: {
    level: envVars.LOG_LEVEL,
    file: envVars.LOG_FILE,
  },
  healthCheck: {
    timeoutMs: envVars.HEALTH_CHECK_TIMEOUT_MS,
  },
};