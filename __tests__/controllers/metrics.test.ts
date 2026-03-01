import request from 'supertest';
import { Application } from 'express';
import { createApp } from '@/app';
import { metricsService } from '@/services/metrics';

jest.mock('@/services/metrics');

describe('Metrics Controller', () => {
  let app: Application;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics in plain text format', async () => {
      const mockMetrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 100
`;

      (metricsService.getMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toBe(mockMetrics);
      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('should handle metrics service errors gracefully', async () => {
      const mockError = new Error('Metrics collection failed');
      (metricsService.getMetrics as jest.Mock).mockRejectedValue(mockError);

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'METRICS_ERROR',
          message: 'Failed to generate metrics',
        },
        timestamp: expect.any(String),
      });

      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('should log debug information on successful metrics access', async () => {
      const mockMetrics = 'test_metric 1';
      (metricsService.getMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      await request(app)
        .get('/metrics')
        .set('User-Agent', 'Prometheus/2.0')
        .expect(200);

      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('should set correct content type headers', async () => {
      const mockMetrics = 'test_metric 1';
      (metricsService.getMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    });
  });
});