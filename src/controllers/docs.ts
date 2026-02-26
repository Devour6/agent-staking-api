import { Request, Response } from 'express';
import { asyncHandler, createApiResponse } from '@/middleware/errorHandler';
import { config } from '@/services/config';

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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
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
 * API specification in OpenAPI format (placeholder)
 * GET /api/docs/openapi
 */
export const getOpenApiSpec = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Placeholder for OpenAPI 3.0 specification
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Phase Agent Staking API',
        version: '1.0.0',
        description: 'Non-custodial transaction builder service for AI agents',
      },
      servers: [
        {
          url: `${req.protocol}://${req.get('host')}`,
          description: 'Production server',
        },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
          },
        },
      },
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
        '/stake/build': {
          post: {
            summary: 'Build native staking transaction',
            security: [{ ApiKeyAuth: [] }],
            responses: {
              '200': {
                description: 'Transaction built successfully',
              },
            },
          },
        },
      },
    };

    res.json(openApiSpec);
  }
);