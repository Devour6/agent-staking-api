export interface ServerConfig {
  port: number;
  nodeEnv: string;
}

export interface SolanaConfig {
  rpcUrl: string;
  rpcUrlBackup?: string;
  cluster: 'mainnet-beta' | 'devnet' | 'testnet';
}

export interface PhaseConfig {
  feeWallet: string;
  validatorVoteAccount: string;
  rakeFeeBasisPoints: number;
}

export interface AuthConfig {
  apiKeySecret: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface LoggingConfig {
  level: string;
  file?: string;
}

export interface HealthCheckConfig {
  timeoutMs: number;
}

export interface AppConfig {
  server: ServerConfig;
  solana: SolanaConfig;
  phase: PhaseConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  healthCheck: HealthCheckConfig;
}