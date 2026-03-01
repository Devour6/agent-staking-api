import { Request, Response } from 'express';
import { asyncHandler, createApiResponse, createApiError } from '@/middleware/errorHandler';
import { apiKeyManager } from '@/services/apiKeyManager';
import * as metricsService from '@/services/metrics';
import { logger } from '@/services/logger';
import { escapeHtml } from '@/utils/htmlUtils';
import { metricsRegistry } from '@/services/metrics';

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
    const metrics = await metricsRegistry.metrics();
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
            <div style="margin-top: 15px;">
                <a href="/admin/rate-limits" style="color: #bfdbfe; text-decoration: none; margin-right: 20px; padding: 8px 16px; border-radius: 4px; transition: background-color 0.2s;" 
                   onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'; this.style.color='white';"
                   onmouseout="this.style.backgroundColor='transparent'; this.style.color='#bfdbfe';">
                    📊 Rate Limits Dashboard
                </a>
                <a href="/admin/api-keys" style="color: #bfdbfe; text-decoration: none; margin-right: 20px; padding: 8px 16px; border-radius: 4px; transition: background-color 0.2s;"
                   onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'; this.style.color='white';"
                   onmouseout="this.style.backgroundColor='transparent'; this.style.color='#bfdbfe';">
                    🔑 API Keys
                </a>
            </div>
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
                            <td><code>${escapeHtml(agent.agentId)}</code></td>
                            <td>${escapeHtml(agent.requestCount.toLocaleString())}</td>
                            <td>${escapeHtml(agent.lastSeen.toLocaleString())}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'");
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

/**
 * Rate Limit Dashboard - Server-rendered HTML page
 * GET /admin/rate-limits
 */
export const getRateLimitDashboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const rateLimitStats = await getRateLimitStats();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rate Limit Dashboard - Agent Staking API</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .nav-links {
            margin-top: 15px;
        }
        .nav-links a {
            color: #bfdbfe;
            text-decoration: none;
            margin-right: 20px;
            padding: 8px 16px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        .nav-links a:hover {
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .tier-free { color: #6b7280; }
        .tier-pro { color: #2563eb; }
        .tier-enterprise { color: #7c3aed; }
        .rate-limit-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .key-card {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .key-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .key-id {
            font-family: monospace;
            background: #f3f4f6;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.875rem;
        }
        .tier-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .tier-free { background: #f3f4f6; color: #6b7280; }
        .tier-pro { background: #dbeafe; color: #2563eb; }
        .tier-enterprise { background: #ede9fe; color: #7c3aed; }
        .progress-container {
            margin-bottom: 8px;
        }
        .progress-label {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 0.875rem;
        }
        .progress-bar {
            width: 100%;
            height: 8px;
            background-color: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .progress-safe { background-color: #10b981; }
        .progress-warning { background-color: #f59e0b; }
        .progress-danger { background-color: #ef4444; }
        .alert-icon {
            color: #f59e0b;
            font-weight: bold;
        }
        .danger-icon {
            color: #ef4444;
            font-weight: bold;
        }
        .refresh-btn {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            float: right;
            margin-left: 10px;
        }
        .refresh-btn:hover {
            background: #1d4ed8;
        }
        .auto-refresh {
            color: #6b7280;
            font-size: 0.875rem;
            float: right;
            margin-top: 10px;
        }
        .timestamp {
            color: #666;
            font-size: 0.9em;
        }
        .tier-limits {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .tier-limit {
            text-align: center;
            padding: 10px;
            border-radius: 6px;
        }
    </style>
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => {
            window.location.reload();
        }, 30000);
        
        // Update timestamp
        function updateTimestamp() {
            const now = new Date();
            document.querySelector('.auto-refresh').textContent = 
                'Auto-refresh in ' + (30 - Math.floor((now.getTime() % 30000) / 1000)) + 's';
        }
        setInterval(updateTimestamp, 1000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Rate Limit Dashboard</h1>
            <div class="nav-links">
                <a href="/admin/dashboard">← Back to Dashboard</a>
                <a href="/admin/api-keys">API Keys</a>
            </div>
            <div class="timestamp">Last updated: ${new Date().toLocaleString()}</div>
            <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
            <div class="auto-refresh"></div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number tier-free">${rateLimitStats.summary.totalKeys}</div>
                <div class="stat-label">Total API Keys</div>
            </div>
            <div class="stat-card">
                <div class="stat-number tier-pro">${rateLimitStats.summary.activeKeys}</div>
                <div class="stat-label">Active Keys</div>
            </div>
            <div class="stat-card">
                <div class="stat-number tier-enterprise">${rateLimitStats.summary.keysNearLimit}</div>
                <div class="stat-label">Keys Near Limit (>80%)</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #ef4444;">${rateLimitStats.summary.keysOverLimit}</div>
                <div class="stat-label">Keys Over Limit</div>
            </div>
        </div>

        <div class="rate-limit-section">
            <h2>Tier Rate Limits</h2>
            <div class="tier-limits">
                <div class="tier-limit tier-free">
                    <h3>Free Tier</h3>
                    <div class="stat-number tier-free">10</div>
                    <div class="stat-label">requests/minute</div>
                </div>
                <div class="tier-limit tier-pro">
                    <h3>Pro Tier</h3>
                    <div class="stat-number tier-pro">100</div>
                    <div class="stat-label">requests/minute</div>
                </div>
                <div class="tier-limit tier-enterprise">
                    <h3>Enterprise Tier</h3>
                    <div class="stat-number tier-enterprise">1000</div>
                    <div class="stat-label">requests/minute</div>
                </div>
            </div>
        </div>

        <div class="rate-limit-section">
            <h2>API Key Rate Limit Status</h2>
            ${rateLimitStats.keys.map(key => {
              const usagePercent = (key.usage.currentMinute / key.limits.requestsPerMinute) * 100;
              const isWarning = usagePercent >= 80;
              const isDanger = usagePercent >= 100;
              const progressClass = isDanger ? 'progress-danger' : isWarning ? 'progress-warning' : 'progress-safe';
              const alertIcon = isDanger ? '🔴' : isWarning ? '⚠️' : '✅';
              
              return `
                <div class="key-card">
                    <div class="key-header">
                        <div>
                            <span class="key-id">${escapeHtml(key.keyId)}</span>
                            <span class="tier-badge tier-${key.tier}">${key.tier}</span>
                            ${isWarning ? `<span class="${isDanger ? 'danger-icon' : 'alert-icon'}">${alertIcon}</span>` : ''}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280;">
                            Last used: ${key.lastUsed ? new Date(key.lastUsed).toLocaleTimeString() : 'Never'}
                        </div>
                    </div>
                    
                    <div class="progress-container">
                        <div class="progress-label">
                            <span>Current minute usage</span>
                            <span>${key.usage.currentMinute}/${key.limits.requestsPerMinute} (${Math.round(usagePercent)}%)</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${progressClass}" style="width: ${Math.min(usagePercent, 100)}%"></div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 0.875rem; color: #6b7280;">
                        <div>Today: ${key.usage.today}</div>
                        <div>This hour: ${key.usage.currentHour}</div>
                        <div>Total: ${key.usage.total}</div>
                    </div>
                </div>
              `;
            }).join('')}
        </div>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'");
    res.send(html);
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

interface RateLimitKeyStats {
  keyId: string;
  tier: 'free' | 'pro' | 'enterprise' | 'admin';
  isActive: boolean;
  lastUsed: Date | undefined;
  limits: {
    requestsPerMinute: number;
  };
  usage: {
    currentMinute: number;
    currentHour: number;
    today: number;
    total: number;
  };
}

interface RateLimitStats {
  summary: {
    totalKeys: number;
    activeKeys: number;
    keysNearLimit: number;
    keysOverLimit: number;
  };
  keys: RateLimitKeyStats[];
}

async function getRateLimitStats(): Promise<RateLimitStats> {
  const keys = await apiKeyManager.listKeys();
  const keyStats: RateLimitKeyStats[] = [];
  
  for (const key of keys) {
    const tier = key.tier;
    const limits = apiKeyManager.getTierLimits(tier);
    
    // Generate mock usage data - in production this would come from Redis
    // or the rate limiting middleware's storage
    const currentMinute = Math.floor(Math.random() * limits.requestsPerMinute);
    const currentHour = Math.floor(Math.random() * (limits.requestsPerMinute * 60));
    const today = Math.floor(Math.random() * (limits.requestsPerMinute * 60 * 24));
    const total = Math.floor(Math.random() * 50000);
    
    keyStats.push({
      keyId: key.keyId,
      tier,
      isActive: key.isActive,
      lastUsed: key.lastUsed,
      limits: {
        requestsPerMinute: limits.requestsPerMinute
      },
      usage: {
        currentMinute,
        currentHour,
        today,
        total
      }
    });
  }
  
  const activeKeys = keyStats.filter(k => k.isActive);
  const keysNearLimit = activeKeys.filter(k => (k.usage.currentMinute / k.limits.requestsPerMinute) >= 0.8).length;
  const keysOverLimit = activeKeys.filter(k => (k.usage.currentMinute / k.limits.requestsPerMinute) >= 1.0).length;
  
  return {
    summary: {
      totalKeys: keyStats.length,
      activeKeys: activeKeys.length,
      keysNearLimit,
      keysOverLimit
    },
    keys: keyStats.sort((a, b) => {
      // Sort by usage percentage, highest first
      const aPercent = a.usage.currentMinute / a.limits.requestsPerMinute;
      const bPercent = b.usage.currentMinute / b.limits.requestsPerMinute;
      return bPercent - aPercent;
    })
  };
}