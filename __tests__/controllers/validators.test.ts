import { Request, Response } from 'express';
import { listValidators, getValidatorDetails, getValidatorRecommendations } from '@/controllers/validators';

// Mock logger
jest.mock('@/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('Validators Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      query: {},
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('listValidators', () => {
    describe('Successful listing', () => {
      it('should list validators with default parameters', async () => {
        req.query = {};

        await listValidators(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              validators: expect.any(Array),
              pagination: expect.objectContaining({
                total: expect.any(Number),
                limit: 50,
                offset: 0,
                hasMore: expect.any(Boolean)
              }),
              filters: expect.objectContaining({
                sortBy: 'apy',
                order: 'desc',
                activeOnly: true
              })
            })
          })
        );
      });

      it('should filter validators by minimum APY', async () => {
        req.query = { minApy: '7.0' };

        await listValidators(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              validators: expect.any(Array),
              filters: expect.objectContaining({
                minApy: 7.0
              })
            })
          })
        );

        // Check that the response was called (validators were filtered)
        const call = (res.json as jest.Mock).mock.calls[0][0];
        const validators = call.data.validators;
        validators.forEach((validator: any) => {
          expect(validator.apy).toBeGreaterThanOrEqual(7.0);
        });
      });

      it('should filter validators by maximum commission', async () => {
        req.query = { maxCommission: '5.0' };

        await listValidators(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              filters: expect.objectContaining({
                maxCommission: 5.0
              })
            })
          })
        );

        // Check that validators were filtered by commission
        const call = (res.json as jest.Mock).mock.calls[0][0];
        const validators = call.data.validators;
        validators.forEach((validator: any) => {
          expect(validator.commission).toBeLessThanOrEqual(5.0);
        });
      });

      it('should sort validators by commission in ascending order', async () => {
        req.query = { sortBy: 'commission', order: 'asc' };

        await listValidators(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const validators = call.data.validators;
        
        // Check that validators are sorted by commission ascending
        for (let i = 0; i < validators.length - 1; i++) {
          expect(validators[i].commission).toBeLessThanOrEqual(validators[i + 1].commission);
        }
      });

      it('should handle pagination correctly', async () => {
        req.query = { limit: '2', offset: '1' };

        await listValidators(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              pagination: expect.objectContaining({
                limit: 2,
                offset: 1
              })
            })
          })
        );

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const validators = call.data.validators;
        expect(validators.length).toBeLessThanOrEqual(2);
      });
    });

    describe('Failure cases', () => {
      it('should reject invalid sortBy field', async () => {
        req.query = { sortBy: 'invalid_field' };

        await expect(listValidators(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Invalid sortBy field'),
            statusCode: 400
          })
        );
      });
    });

    describe('Edge cases', () => {
      it('should handle empty result set with filters', async () => {
        req.query = { minApy: '20.0' }; // Unrealistic APY

        await listValidators(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const validators = call.data.validators;
        expect(validators).toHaveLength(0);
      });

      it('should include inactive validators when activeOnly is false', async () => {
        req.query = { activeOnly: 'false' };

        await listValidators(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              filters: expect.objectContaining({
                activeOnly: false
              })
            })
          })
        );
      });
    });
  });

  describe('getValidatorDetails', () => {
    const validVoteAccount = '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2';
    const invalidVoteAccount = 'invalid_address';

    describe('Successful retrieval', () => {
      it('should return validator details for valid vote account', async () => {
        req.params = { voteAccount: validVoteAccount };

        await getValidatorDetails(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              validator: expect.objectContaining({
                voteAccount: validVoteAccount,
                name: expect.any(String),
                apy: expect.any(Number),
                commission: expect.any(Number)
              }),
              recommendationScore: expect.any(Number),
              riskFactors: expect.any(Array)
            })
          })
        );
      });
    });

    describe('Failure cases', () => {
      it('should reject invalid vote account format', async () => {
        req.params = { voteAccount: invalidVoteAccount };

        await expect(getValidatorDetails(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Invalid vote account address format',
            statusCode: 400
          })
        );
      });

      it('should return 404 for non-existent validator', async () => {
        req.params = { voteAccount: 'J1to3PQfXidUUhprQWgdKkQAMWPJAEqSJ7amkBDE9999' }; // Non-existent but valid format

        await expect(getValidatorDetails(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Validator not found',
            statusCode: 404
          })
        );
      });

      it('should handle missing vote account parameter', async () => {
        req.params = {};

        await expect(getValidatorDetails(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: 'Valid vote account address is required',
            statusCode: 400
          })
        );
      });
    });
  });

  describe('getValidatorRecommendations', () => {
    describe('Successful recommendations', () => {
      it('should return recommendations with default parameters', async () => {
        req.query = {};

        await getValidatorRecommendations(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              recommendations: expect.any(Array),
              criteria: expect.objectContaining({
                riskTolerance: 'medium',
                maxCommission: 10.0,
                diversify: true
              }),
              totalValidators: expect.any(Number)
            })
          })
        );

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        expect(recommendations.length).toBeLessThanOrEqual(3); // Default count
        
        recommendations.forEach((rec: any) => {
          expect(rec).toHaveProperty('voteAccount');
          expect(rec).toHaveProperty('name');
          expect(rec).toHaveProperty('apy');
          expect(rec).toHaveProperty('commission');
          expect(rec).toHaveProperty('score');
          expect(rec).toHaveProperty('riskLevel');
          expect(rec).toHaveProperty('reason');
        });
      });

      it('should include allocation suggestions when amount is provided', async () => {
        req.query = { amount: '100.0', count: '3' };

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        
        recommendations.forEach((rec: any) => {
          expect(rec).toHaveProperty('suggestedAllocation');
          expect(rec.suggestedAllocation).toBeCloseTo(33.33, 1); // 100/3
        });
      });

      it('should adjust recommendations for different risk tolerances', async () => {
        // Test low risk tolerance
        req.query = { riskTolerance: 'low' };

        await getValidatorRecommendations(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              criteria: expect.objectContaining({
                riskTolerance: 'low'
              })
            })
          })
        );
      });

      it('should filter by maxCommission parameter', async () => {
        req.query = { maxCommission: '6.0' };

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        
        recommendations.forEach((rec: any) => {
          expect(rec.commission).toBeLessThanOrEqual(6.0);
        });
      });

      it('should return requested number of recommendations', async () => {
        req.query = { count: '5' };

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        expect(recommendations.length).toBeLessThanOrEqual(5);
      });
    });

    describe('Failure cases', () => {
      it('should reject invalid risk tolerance', async () => {
        req.query = { riskTolerance: 'invalid' };

        await expect(getValidatorRecommendations(req as Request, res as Response)).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Invalid riskTolerance'),
            statusCode: 400
          })
        );
      });

      it('should handle excessive recommendation count', async () => {
        req.query = { count: '20' }; // Max is 10

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        expect(recommendations.length).toBeLessThanOrEqual(10); // Should be capped at 10
      });
    });

    describe('Edge cases', () => {
      it('should handle very restrictive filters', async () => {
        req.query = { 
          maxCommission: '1.0', // Very low commission
          riskTolerance: 'low',
          count: '5'
        };

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        
        // Should return fewer recommendations due to restrictive filters
        expect(recommendations.length).toBeLessThan(5);
      });

      it('should handle high risk tolerance with appropriate recommendations', async () => {
        req.query = { riskTolerance: 'high' };

        await getValidatorRecommendations(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              criteria: expect.objectContaining({
                riskTolerance: 'high'
              })
            })
          })
        );
      });

      it('should handle diversification preference', async () => {
        req.query = { diversify: 'false' };

        await getValidatorRecommendations(req as Request, res as Response);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              criteria: expect.objectContaining({
                diversify: false
              })
            })
          })
        );
      });

      it('should handle zero amount edge case', async () => {
        req.query = { amount: '0' };

        await getValidatorRecommendations(req as Request, res as Response);

        const call = (res.json as jest.Mock).mock.calls[0][0];
        const recommendations = call.data.recommendations;
        
        recommendations.forEach((rec: any) => {
          if (rec.suggestedAllocation !== undefined) {
            expect(rec.suggestedAllocation).toBe(0);
          }
        });
      });
    });
  });
});