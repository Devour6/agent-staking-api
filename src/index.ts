import app from './app';
import { config } from '@/services/config';
import { logger } from '@/services/logger';
import { solanaService } from '@/services/solana';

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Verify Solana connectivity before starting
    logger.info('Verifying Solana connectivity...');
    const healthCheck = await solanaService.healthCheck();
    
    if (!healthCheck.healthy) {
      logger.error('Failed to connect to Solana RPC', {
        error: healthCheck.error,
        rpcUrl: config.solana.rpcUrl,
      });
      process.exit(1);
    }

    logger.info('Solana connectivity verified', {
      latency: healthCheck.latency,
      cluster: config.solana.cluster,
    });

    // Start HTTP server
    const server = app.listen(config.server.port, '0.0.0.0', () => {
      logger.info('Phase Agent Staking API started successfully', {
        port: config.server.port,
        nodeEnv: config.server.nodeEnv,
        pid: process.pid,
        cluster: config.solana.cluster,
        validatorVoteAccount: config.phase.validatorVoteAccount,
        feeWallet: config.phase.feeWallet,
        rakeFeeBasisPoints: config.phase.rakeFeeBasisPoints,
      });

      // Log some helpful information for developers
      if (config.server.nodeEnv === 'development') {
        logger.info('Development mode - helpful endpoints:', {
          healthCheck: `http://localhost:${config.server.port}/health`,
          apiDocs: `http://localhost:${config.server.port}/api/docs`,
          rootEndpoint: `http://localhost:${config.server.port}/`,
        });
      }
    });

    // Configure server timeouts
    server.timeout = 30000; // 30 seconds
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.server.port} is already in use`, {
          port: config.server.port,
          pid: process.pid,
        });
      } else {
        logger.error('Server error', {
          error: error.message,
          code: error.code,
        });
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close((error) => {
        if (error) {
          logger.error('Error during graceful shutdown', {
            error: error.message,
          });
          process.exit(1);
        }
        
        logger.info('Server shut down gracefully');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason,
    promise,
  });
  process.exit(1);
});

// Start the server
startServer();