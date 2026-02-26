import request from 'supertest';
import app from '../../src/app';
import { generateApiKey } from '../../src/middleware/auth';

describe('Stake Controller', () => {
  const validApiKey = generateApiKey();
  const validAgentWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const validValidatorVoteAccount = '8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm';
  const stakeAmount = 1000000000; // 1 SOL in lamports

  describe('POST /stake/build', () => {
    it('should build a native stake transaction successfully', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
          validatorVoteAccount: validValidatorVoteAccount,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('stakeAccount');
      expect(response.body.data).toHaveProperty('estimatedApy');
      expect(response.body.data).toHaveProperty('activationEpoch');
      expect(response.body.data).toHaveProperty('feeAmount');
      expect(response.body.data).toHaveProperty('instructions');
      
      // Verify transaction is base64 string
      expect(typeof response.body.data.transaction).toBe('string');
      expect(response.body.data.transaction.length).toBeGreaterThan(0);
      
      // Verify stake account is valid pubkey format
      expect(response.body.data.stakeAccount).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      
      // Verify fee amount is calculated correctly (10 basis points)
      expect(response.body.data.feeAmount).toBe(stakeAmount * 10 / 10000);
      
      // Verify instructions array
      expect(Array.isArray(response.body.data.instructions)).toBe(true);
      expect(response.body.data.instructions.length).toBeGreaterThan(0);
    });

    it('should build transaction with default Phase validator when none specified', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.estimatedApy).toBe(7.2); // Phase validator premium APY
    });

    it('should return 401 without API key', async () => {
      const response = await request(app)
        .post('/stake/build')
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_AUTH_HEADER');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', 'Bearer invalid-key')
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    it('should validate agent wallet address', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: 'invalid-wallet-address',
          amount: stakeAmount,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate stake amount minimum', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: 100, // Too small
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate stake amount maximum', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: 2000000000000, // 2000 SOL - too large
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate validator vote account if provided', async () => {
      const response = await request(app)
        .post('/stake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
          validatorVoteAccount: 'invalid-validator-address',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /stake/liquid/build', () => {
    it('should return not implemented for liquid staking', async () => {
      const response = await request(app)
        .post('/stake/liquid/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
        })
        .expect(501);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
      expect(response.body.error.message).toContain('Phase 2');
    });
  });

  describe('POST /unstake/build', () => {
    it('should return not implemented for unstaking', async () => {
      const response = await request(app)
        .post('/unstake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          type: 'native',
          stakeAccount: validAgentWallet,
        })
        .expect(501);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
      expect(response.body.error.message).toContain('Phase 2');
    });
  });
});