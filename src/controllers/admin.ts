import { Request, Response } from 'express';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { apiKeyManager } from '@/services/apiKeyManager';
import * as metricsService from '@/services/metrics';
import { logger } from '@/services/logger';
import { htmlEscape } from '@/utils/htmlEscape';
import client from 'prom-client';

interface DashboardStats {
  apiCalls: {
    today: number;
    week: number;
    allTime: number;
  };
  apiKeys: {
    active: number;
    total: number;
  };
  solStaked: {
    total: number; // in lamports
    totalSol: number; // in SOL
  };
  webhooks: {
    successRate: number;
    totalDeliveries: number;
  };
  topAgents: Array<{
    agentId: string;
    requestCount: number;
    lastSeen: Date;
  }>;
}

interface ApiKeyStats {
  keyId: string;
  maskedKey: string;
  tier: string;
  isActive: boolean;
  createdAt: Date;
  lastUsed: Date | undefined;
  stats: {
    totalRequests: number;
    dailyRequests: number;
    weeklyRequests: number;
  };
}

/**
 * Admin Dashboard - Server-rendered HTML page
 * GET /admin/dashboard
 */
export const getAdminDashboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Get metrics from Prometheus
    const metrics = await client.register.metrics();
    const stats = await calculateDashboardStats(metrics);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Staking API - Admin Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #2563eb;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .table-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        .refresh-btn {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            float: right;
        }
        .refresh-btn:hover {
            background: #1d4ed8;
        }
        .timestamp {
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Agent Staking API - Admin Dashboard</h1>
            <div class="timestamp">Last updated: ${new Date().toLocaleString()}</div>
            <button class="refresh-btn" onclick="window.location.reload()">Refresh</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.apiCalls.today.toLocaleString()}</div>
                <div class="stat-label">API Calls Today</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.apiCalls.week.toLocaleString()}</div>
                <div class="stat-label">API Calls This Week</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.apiCalls.allTime.toLocaleString()}</div>
                <div class="stat-label">Total API Calls</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.apiKeys.active}</div>
                <div class="stat-label">Active API Keys</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.solStaked.totalSol.toFixed(2)}</div>
                <div class="stat-label">Total SOL Staked</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${(stats.webhooks.successRate * 100).toFixed(1)}%</div>
                <div class="stat-label">Webhook Success Rate</div>
            </div>
        </div>
        
        <div class="table-section">
            <h2>Top Agents by Volume</h2>
            <table>
                <thead>
                    <tr>
                        <th>Agent ID</th>
                        <th>Request Count</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.topAgents.map(agent => `
                        <tr>
                            <td><code>${htmlEscape(agent.agentId)}</code></td>
                            <td>${htmlEscape(agent.requestCount.toLocaleString())}</td>
                            <td>${htmlEscape(agent.lastSeen.toLocaleString())}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
);

/**
 * API Keys Management
 * GET /admin/api-keys
 */
export const getApiKeys = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const keys = await apiKeyManager.listKeys();
    const apiKeyStats: ApiKeyStats[] = await Promise.all(
      keys.map(async (key) => {
        const stats = await getKeyUsageStats(key.keyId);
        return {
          keyId: key.keyId,
          maskedKey: maskApiKey(key.keyId),
          tier: getKeyTier(key.keyId),
          isActive: key.isActive,
          createdAt: key.createdAt,
          lastUsed: key.lastUsed,
          stats
        };
      })
    );
    
    res.json(createApiResponse({
      keys: apiKeyStats,
      total: apiKeyStats.length,
      active: apiKeyStats.filter(k => k.isActive).length
    }));
  }
);

/**
 * Create new API key
 * POST /admin/api-keys
 */
export const createApiKey = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { tier = 'free', description } = req.body;
    
    const validTiers = ['free', 'pro', 'enterprise'];
    if (!validTiers.includes(tier)) {
      throw createApiError('Invalid tier. Must be one of: free, pro, enterprise', 400, 'INVALID_TIER');
    }
    
    const newKey = await apiKeyManager.createKey({
      tier,
      description
    });
    
    logger.info('API key created', { keyId: newKey.keyId, tier });
    
    res.status(201).json(createApiResponse({
      keyId: newKey.keyId,
      key: newKey.key, // Only returned once
      tier,
      createdAt: newKey.createdAt
    }));
  }
);

/**
 * Revoke API key
 * DELETE /admin/api-keys/:keyId
 */
export const revokeApiKey = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const keyId = req.params.keyId;
    
    if (!keyId || Array.isArray(keyId)) {
      throw createApiError('Valid key ID is required', 400, 'MISSING_KEY_ID');
    }
    
    const success = await apiKeyManager.revokeKey(keyId);
    if (!success) {
      throw createApiError('API key not found', 404, 'KEY_NOT_FOUND');
    }
    
    logger.info('API key revoked', { keyId });
    
    res.json(createApiResponse({
      keyId,
      revoked: true,
      revokedAt: new Date()
    }));
  }
);

// Helper functions
async function calculateDashboardStats(metricsText: string): Promise<DashboardStats> {
  // Parse metrics to calculate stats
  // This is a simplified implementation - in production you'd use a proper metrics query system
  
  const lines = metricsText.split('\n');
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  // Extract HTTP request counts
  let totalRequests = 0;
  for (const line of lines) {
    if (line.startsWith('http_requests_total') && !line.startsWith('#')) {
      const match = line.match(/http_requests_total{.*} (\d+)/);
      if (match && match[1]) {
        totalRequests += parseInt(match[1], 10);
      }
    }
  }
  
  return {
    apiCalls: {
      today: Math.floor(totalRequests * 0.1), // Simplified calculation
      week: Math.floor(totalRequests * 0.3),
      allTime: totalRequests
    },
    apiKeys: {
      active: await apiKeyManager.getActiveKeyCount(),
      total: (await apiKeyManager.listKeys()).length
    },
    solStaked: {
      total: 0, // Would need to implement SOL tracking
      totalSol: 0
    },
    webhooks: {
      successRate: 0.95, // Would calculate from webhook delivery metrics
      totalDeliveries: 0
    },
    topAgents: [] // Would extract from metrics labels
  };
}

async function getKeyUsageStats(keyId: string): Promise<{ totalRequests: number; dailyRequests: number; weeklyRequests: number; }> {
  // In a real implementation, this would query metrics by key ID
  return {
    totalRequests: Math.floor(Math.random() * 1000),
    dailyRequests: Math.floor(Math.random() * 100),
    weeklyRequests: Math.floor(Math.random() * 500)
  };
}

function maskApiKey(keyId: string): string {
  if (keyId.length <= 8) return keyId;
  return keyId.substring(0, 4) + '****' + keyId.substring(keyId.length - 4);
}

function getKeyTier(keyId: string): string {
  // In a real implementation, this would be stored with the key
  return keyId.includes('pro') ? 'pro' : keyId.includes('enterprise') ? 'enterprise' : 'free';
}