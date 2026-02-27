import { Request, Response } from 'express';
import { asyncHandler, createApiResponse } from '@/middleware/errorHandler';
import { config } from '@/services/config';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

/**
 * URL-safe escaping for server URLs
 * Validates and normalizes URLs to prevent injection
 */
function escapeServerUrl(url: string, allowedHosts: string[] = []): string {
  try {
    const parsedUrl = new URL(url);
    
    // Validate protocol
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    // If allowedHosts is specified, validate hostname
    if (allowedHosts.length > 0) {
      const isAllowed = allowedHosts.some(host => {
        // Support wildcards like *.example.com
        if (host.startsWith('*.')) {
          const domain = host.substring(2);
          return parsedUrl.hostname.endsWith('.' + domain) || parsedUrl.hostname === domain;
        }
        return parsedUrl.hostname === host;
      });
      
      if (!isAllowed) {
        throw new Error('Hostname not in allowlist');
      }
    }
    
    // Return normalized URL (this removes any malicious components)
    return parsedUrl.toString();
  } catch (error) {
    // Return safe fallback for invalid URLs
    return 'http://localhost:3000';
  }
}

/**
 * Validate and sanitize host header values
 * Prevents Host header injection attacks
 */
function validateHostHeader(host: string | undefined, allowedHosts: string[] = []): string | null {
  if (!host || typeof host !== 'string') {
    return null;
  }
  
  // Remove port if present for validation
  const hostname = host.split(':')[0];
  
  // Additional check to ensure hostname exists after split
  if (!hostname) {
    return null;
  }
  
  // Basic validation - no special characters that could indicate injection
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) {
    return null;
  }
  
  // If allowedHosts is specified, validate against it
  if (allowedHosts.length > 0) {
    const isAllowed = allowedHosts.some(allowedHost => {
      if (allowedHost.startsWith('*.')) {
        const domain = allowedHost.substring(2);
        return hostname.endsWith('.' + domain) || hostname === domain;
      }
      return hostname === allowedHost;
    });
    
    if (!isAllowed) {
      return null;
    }
  }
  
  return host;
}

interface ApiDocumentation {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  authentication: {
    type: string;
    description: string;
    header: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    description: string;
  };
  endpoints: {
    path: string;
    method: string;
    description: string;
    authentication: boolean;
    rateLimit: string;
    requestBody?: any;
    responseBody?: any;
  }[];
}

/**
 * API Documentation endpoint
 * GET /api/docs
 */
export const getApiDocumentation = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Securely construct base URL with validation
    const allowedHosts = ['localhost', '127.0.0.1', '*.phaselabs.io', '*.vercel.app'];
    const validatedHost = validateHostHeader(req.get('host'), allowedHosts);
    const baseUrl = validatedHost 
      ? escapeServerUrl(`${req.protocol}://${validatedHost}`, allowedHosts)
      : 'http://localhost:3000'; // Safe fallback
    
    const documentation: ApiDocumentation = {
      title: 'Phase Agent Staking API',
      version: '1.0.0',
      description: 'Non-custodial transaction builder service for AI agents to participate in Solana staking',
      baseUrl,
      authentication: {
        type: 'API Key',
        description: 'Include your API key in the Authorization header',
        header: 'Authorization: Bearer <your-api-key>',
      },
      rateLimit: {
        windowMs: config.rateLimit.windowMs,
        maxRequests: config.rateLimit.maxRequests,
        description: `Rate limited to ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000} seconds per agent wallet`,
      },
      endpoints: [
        {
          path: '/health',
          method: 'GET',
          description: 'Health check endpoint with detailed system status',
          authentication: false,
          rateLimit: 'none',
          responseBody: {
            success: true,
            data: {
              status: 'healthy',
              timestamp: '2026-02-25T17:51:00Z',
              checks: {
                solana: { healthy: true, latency: 45 },
                api: { healthy: true, uptime: 3600 },
                config: { healthy: true }
              }
            }
          }
        },
        {
          path: '/stake/build',
          method: 'POST',
          description: 'Build native staking transaction with transparent rake fees',
          authentication: true,
          rateLimit: 'standard',
          requestBody: {
            agentWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            amount: 1000000000,
            validatorVoteAccount: '8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm',
            stakeAuthority: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
          },
          responseBody: {
            success: true,
            data: {
              transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDBRcZuQ...',
              stakeAccount: 'GrDMwTLmQ2s1yAoBsKRHEhCEJvs1kBpJJyBB...',
              estimatedApy: 7.2,
              activationEpoch: 675,
              feeAmount: 1000000,
              instructions: [
                {
                  type: 'CreateStakeAccount',
                  description: 'Create stake account with 1.0 SOL',
                  accounts: ['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU']
                }
              ]
            }
          }
        },
        {
          path: '/stake/liquid/build',
          method: 'POST',
          description: 'Build liquid staking transaction (Phase 2 - Not implemented)',
          authentication: true,
          rateLimit: 'standard',
          requestBody: {
            agentWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            amount: 1000000000,
            slippageTolerance: 0.5
          },
          responseBody: {
            success: false,
            error: {
              code: 'NOT_IMPLEMENTED',
              message: 'Liquid staking will be available in Phase 2'
            }
          }
        },
        {
          path: '/api/docs',
          method: 'GET',
          description: 'This API documentation endpoint',
          authentication: false,
          rateLimit: 'permissive',
        }
      ]
    };

    res.json(createApiResponse(documentation));
  }
);

/**
 * API specification in OpenAPI format
 * GET /api/docs/openapi
 */
export const getOpenApiSpec = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const openApiPath = path.join(__dirname, '../../docs/openapi.yaml');
      const yamlContent = fs.readFileSync(openApiPath, 'utf8');
      const openApiSpec = yaml.load(yamlContent) as any;
      
      // Update server URL to match current request (with security validation)
      if (openApiSpec.servers) {
        const allowedHosts = ['localhost', '127.0.0.1', '*.phaselabs.io', '*.vercel.app'];
        const validatedHost = validateHostHeader(req.get('host'), allowedHosts);
        
        if (validatedHost) {
          const currentServerUrl = escapeServerUrl(`${req.protocol}://${validatedHost}`, allowedHosts);
          const currentServer = {
            url: currentServerUrl,
            description: validatedHost.includes('localhost') ? 'Development server' : 'Current server'
          };
          
          // Add current server to the beginning of servers array
          openApiSpec.servers = [currentServer, ...openApiSpec.servers.filter((s: any) => s.url !== currentServerUrl)];
        }
      }
      
      res.json(openApiSpec);
    } catch (error) {
      // Fallback OpenAPI spec if file reading fails
      const fallbackSpec = {
        openapi: '3.0.3',
        info: {
          title: 'Phase Agent Staking API',
          version: '1.0.0',
          description: 'Non-custodial transaction builder service for AI agents',
        },
        servers: [
          {
            url: 'http://localhost:3000', // Safe fallback URL
            description: 'Development server',
          },
        ],
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: {
                '200': {
                  description: 'System is healthy',
                },
              },
            },
          },
        },
      };
      
      res.json(fallbackSpec);
    }
  }
);

/**
 * Swagger UI Documentation
 * Returns setup for swagger-ui-express middleware
 */
export function getSwaggerUiSetup() {
  try {
    const openApiPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = fs.readFileSync(openApiPath, 'utf8');
    const swaggerDocument = yaml.load(yamlContent) as any;
    
    const options = {
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin-bottom: 30px; }
        .swagger-ui .scheme-container { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      `,
      customSiteTitle: 'Phase Agent Staking API - Documentation',
      swaggerOptions: {
        docExpansion: 'list',
        operationsSorter: 'alpha',
        tagsSorter: 'alpha',
        tryItOutEnabled: true,
        requestInterceptor: (req: any) => {
          // Add any custom headers or processing here
          return req;
        }
      }
    };
    
    return {
      swaggerDocument,
      options
    };
  } catch (error) {
    // Fallback document if file reading fails
    const fallbackDocument = {
      openapi: '3.0.3',
      info: {
        title: 'Phase Agent Staking API',
        version: '1.0.0',
        description: 'Non-custodial transaction builder service for AI agents',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      paths: {
        '/health': {
          get: {
            summary: 'Health check',
            tags: ['General'],
            responses: {
              '200': {
                description: 'System is healthy',
              },
            },
          },
        },
      },
    };
    
    return {
      swaggerDocument: fallbackDocument,
      options: {
        customSiteTitle: 'Phase Agent Staking API - Documentation'
      }
    };
  }
}