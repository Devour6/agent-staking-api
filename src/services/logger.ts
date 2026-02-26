import winston from 'winston';
import { config } from './config';

// Enhanced log structure interface
interface LogMetadata {
  requestId?: string;
  userId?: string;
  apiKeyId?: string;
  transactionType?: string;
  duration?: number;
  statusCode?: number;
  endpoint?: string;
  method?: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  contentLength?: string | undefined;
  error?: string;
  stack?: string | undefined;
  rpcMethod?: string;
  solanaCluster?: string;
  agentWallet?: string | undefined;
  apiKey?: string;
  [key: string]: any;
}

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: config.logging.level,
    format: consoleFormat,
  }),
];

// Add file transport if configured
if (config.logging.file) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      level: config.logging.level,
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the base winston logger
const baseLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Log uncaught exceptions
baseLogger.exceptions.handle(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

// Enhanced logging class with structured logging methods
class StructuredLogger {
  private winston: winston.Logger;

  constructor(winstonLogger: winston.Logger) {
    this.winston = winstonLogger;
  }

  // Standard logging methods
  error(message: string, meta: LogMetadata = {}) {
    this.winston.error(message, this.enhanceMetadata(meta));
  }

  warn(message: string, meta: LogMetadata = {}) {
    this.winston.warn(message, this.enhanceMetadata(meta));
  }

  info(message: string, meta: LogMetadata = {}) {
    this.winston.info(message, this.enhanceMetadata(meta));
  }

  debug(message: string, meta: LogMetadata = {}) {
    this.winston.debug(message, this.enhanceMetadata(meta));
  }

  log(level: string, message: string, meta: LogMetadata = {}) {
    this.winston.log(level, message, this.enhanceMetadata(meta));
  }

  // Specific structured logging methods
  logHttpRequest(method: string, path: string, statusCode: number, duration: number, meta: LogMetadata = {}) {
    this.info('HTTP Request', {
      ...meta,
      method,
      endpoint: path,
      statusCode,
      duration,
      type: 'http_request',
    });
  }

  logTransactionBuild(transactionType: string, success: boolean, duration: number, meta: LogMetadata = {}) {
    const level = success ? 'info' : 'error';
    this.log(level, `Transaction build ${success ? 'succeeded' : 'failed'}`, {
      ...meta,
      transactionType,
      success,
      duration,
      type: 'transaction_build',
    });
  }

  logSolanaRpcCall(method: string, success: boolean, duration: number, meta: LogMetadata = {}) {
    const level = success ? 'debug' : 'warn';
    this.log(level, `Solana RPC call: ${method}`, {
      ...meta,
      rpcMethod: method,
      success,
      duration,
      type: 'solana_rpc',
      solanaCluster: config.solana.cluster,
    });
  }

  logApiKeyUsage(keyId: string, endpoint: string, meta: LogMetadata = {}) {
    this.info('API key used', {
      ...meta,
      apiKeyId: keyId,
      endpoint,
      type: 'api_key_usage',
    });
  }

  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high', meta: LogMetadata = {}) {
    const level = severity === 'high' ? 'error' : severity === 'medium' ? 'warn' : 'info';
    this.log(level, `Security event: ${event}`, {
      ...meta,
      securityEvent: event,
      severity,
      type: 'security_event',
    });
  }

  private enhanceMetadata(meta: LogMetadata): LogMetadata {
    return {
      ...meta,
      timestamp: new Date().toISOString(),
      service: 'phase-agent-staking-api',
      version: '1.0.0',
      environment: config.server.nodeEnv,
      pid: process.pid,
    };
  }

  // Generate correlation ID for request tracking
  generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export enhanced logger
export const logger = new StructuredLogger(baseLogger);

// Log unhandled promise rejections with enhanced logger
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    type: 'unhandled_rejection',
    reason: reason?.toString(),
    promise: promise.toString(),
  });
});

logger.info('Enhanced structured logger initialized', {
  level: config.logging.level,
  nodeEnv: config.server.nodeEnv,
  hasFileTransport: !!config.logging.file,
});