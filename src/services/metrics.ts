import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'phase-agent-staking-api',
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['route', 'method', 'status_code'],
  buckets: [1, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'method', 'status_code'],
});

const transactionBuildTotal = new client.Counter({
  name: 'transaction_build_total',
  help: 'Total number of transaction build requests',
  labelNames: ['transaction_type', 'success'],
});

const transactionBuildDuration = new client.Histogram({
  name: 'transaction_build_duration_ms',
  help: 'Duration of transaction building in ms',
  labelNames: ['transaction_type'],
  buckets: [1, 5, 10, 25, 50, 100, 200, 500, 1000],
});

const solanaRpcCalls = new client.Counter({
  name: 'solana_rpc_calls_total',
  help: 'Total number of Solana RPC calls',
  labelNames: ['method', 'success'],
});

const solanaRpcDuration = new client.Histogram({
  name: 'solana_rpc_duration_ms',
  help: 'Duration of Solana RPC calls in ms',
  labelNames: ['method'],
  buckets: [1, 10, 50, 100, 200, 500, 1000, 2000, 5000],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

const apiKeyUsage = new client.Counter({
  name: 'api_key_usage_total',
  help: 'Total API key usage',
  labelNames: ['key_id', 'endpoint'],
});

const errorRate = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'endpoint'],
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(transactionBuildTotal);
register.registerMetric(transactionBuildDuration);
register.registerMetric(solanaRpcCalls);
register.registerMetric(solanaRpcDuration);
register.registerMetric(activeConnections);
register.registerMetric(apiKeyUsage);
register.registerMetric(errorRate);

class MetricsService {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    logger.info('Metrics service initialized');
  }

  /**
   * Middleware to track HTTP requests
   */
  trackHttpRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const route = this.normalizeRoute(req.route?.path || req.path);
        const method = req.method;
        const statusCode = res.statusCode.toString();

        // Track request duration
        httpRequestDuration
          .labels(route, method, statusCode)
          .observe(duration);

        // Track request count
        httpRequestTotal
          .labels(route, method, statusCode)
          .inc();

        // Track API key usage
        if (req.apiKeyId) {
          apiKeyUsage
            .labels(req.apiKeyId, route)
            .inc();
        }

        // Track errors
        if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
          errorRate
            .labels(this.getErrorType(statusCode), route)
            .inc();
        }
      });

      next();
    };
  }

  /**
   * Track transaction building metrics
   */
  trackTransactionBuild(type: string, success: boolean, duration: number) {
    transactionBuildTotal
      .labels(type, success.toString())
      .inc();

    if (success) {
      transactionBuildDuration
        .labels(type)
        .observe(duration);
    }
  }

  /**
   * Track Solana RPC call metrics
   */
  trackSolanaRpcCall(method: string, success: boolean, duration: number) {
    solanaRpcCalls
      .labels(method, success.toString())
      .inc();

    solanaRpcDuration
      .labels(method)
      .observe(duration);
  }

  /**
   * Update active connections count
   */
  setActiveConnections(count: number) {
    activeConnections.set(count);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return await register.metrics();
  }

  /**
   * Get metrics registry for custom metrics
   */
  getRegistry() {
    return register;
  }

  /**
   * Get application uptime in seconds
   */
  getUptime(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Normalize route paths for consistent labeling
   */
  private normalizeRoute(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\/[0-9a-zA-Z]{32,}/g, '/:hash')
      .replace(/\/\d+/g, '/:id') || 'unknown';
  }

  /**
   * Categorize error types
   */
  private getErrorType(statusCode: string): string {
    if (statusCode.startsWith('4')) {
      switch (statusCode) {
        case '400': return 'bad_request';
        case '401': return 'unauthorized';
        case '403': return 'forbidden';
        case '404': return 'not_found';
        case '429': return 'rate_limit';
        default: return 'client_error';
      }
    } else if (statusCode.startsWith('5')) {
      switch (statusCode) {
        case '500': return 'internal_error';
        case '502': return 'bad_gateway';
        case '503': return 'service_unavailable';
        case '504': return 'gateway_timeout';
        default: return 'server_error';
      }
    }
    return 'unknown';
  }
}

export const metricsService = new MetricsService();
export { register as metricsRegistry };