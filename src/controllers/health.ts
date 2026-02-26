import { Request, Response } from 'express';
import { solanaService } from '@/services/solana';
import { logger } from '@/services/logger';
import { asyncHandler, createApiResponse } from '@/middleware/errorHandler';
import { config } from '@/services/config';

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  checks: {
    solana: {
      healthy: boolean;
      latency?: number;
      cluster: string;
      error?: string;
    };
    api: {
      healthy: boolean;
      uptime: number;
      memory: {
        used: number;
        total: number;
        percentage: number;
      };
    };
    config: {
      healthy: boolean;
      rpcUrl: string;
      validatorConfigured: boolean;
      feeWalletConfigured: boolean;
    };
  };
}

/**
 * Comprehensive health check endpoint
 * GET /health
 */
export const healthCheck = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    // Check Solana connectivity
    const solanaHealth = await solanaService.healthCheck();
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memTotal = memUsage.heapTotal + memUsage.external;
    const memUsed = memUsage.heapUsed;
    const memPercentage = Math.round((memUsed / memTotal) * 100);
    
    // Check configuration
    const configHealth: {
      healthy: boolean;
      rpcUrl: string;
      validatorConfigured: boolean;
      feeWalletConfigured: boolean;
    } = {
      healthy: true,
      rpcUrl: config.solana.rpcUrl ? (config.solana.rpcUrl.split('@')[0] || config.solana.rpcUrl) : 'not-configured', // Hide credentials if any
      validatorConfigured: !!config.phase.validatorVoteAccount,
      feeWalletConfigured: !!config.phase.feeWallet,
    };
    
    // Overall health status
    const isHealthy = solanaHealth.healthy && configHealth.healthy;
    const responseTime = Date.now() - startTime;
    
    const healthResponse: HealthCheckResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0', // TODO: Get from package.json
      environment: config.server.nodeEnv,
      checks: {
        solana: {
          healthy: solanaHealth.healthy,
          ...(solanaHealth.latency !== undefined && { latency: solanaHealth.latency }),
          cluster: config.solana.cluster,
          ...(solanaHealth.error !== undefined && { error: solanaHealth.error }),
        },
        api: {
          healthy: true,
          uptime: Math.round(process.uptime()),
          memory: {
            used: memUsed,
            total: memTotal,
            percentage: memPercentage,
          },
        },
        config: configHealth,
      },
    };

    logger.info('Health check completed', {
      status: healthResponse.status,
      responseTimeMs: responseTime,
      solanaLatency: solanaHealth.latency,
      memoryPercentage: memPercentage,
    });

    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json(createApiResponse(healthResponse));
  }
);

/**
 * Simple liveness check for load balancers
 * GET /health/live
 */
export const livenessCheck = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Readiness check for deployment verification
 * GET /health/ready
 */
export const readinessCheck = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Quick Solana connectivity check
      const solanaHealth = await solanaService.healthCheck();
      
      if (!solanaHealth.healthy) {
        res.status(503).json({
          status: 'not_ready',
          reason: 'Solana RPC not accessible',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Readiness check failed', {
        error: (error as Error).message,
      });
      
      res.status(503).json({
        status: 'not_ready',
        reason: 'Internal error during readiness check',
        timestamp: new Date().toISOString(),
      });
    }
  }
);