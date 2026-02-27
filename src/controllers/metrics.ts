import { Request, Response } from 'express';
import { metricsService } from '@/services/metrics';
import { logger } from '@/services/logger';

/**
 * Metrics Controller
 * Handles Prometheus metrics endpoint
 */

/**
 * GET /metrics
 * Return Prometheus metrics
 */
export const getMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await metricsService.getMetrics();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
    
    logger.debug('Metrics endpoint accessed', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } catch (error) {
    logger.error('Error generating metrics', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: 'Failed to generate metrics',
      },
      timestamp: new Date().toISOString(),
    });
  }
};