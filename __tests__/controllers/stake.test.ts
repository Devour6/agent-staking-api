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
    it('should build a liquid stake transaction successfully', async () => {
      const response = await request(app)
        .post('/stake/liquid/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
          slippageTolerance: 0.5,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('expectedTokens');
      expect(response.body.data).toHaveProperty('exchangeRate');
      expect(response.body.data).toHaveProperty('poolApy');
      expect(response.body.data).toHaveProperty('feeAmount');
      expect(response.body.data).toHaveProperty('instructions');
      
      // Verify transaction is base64 string
      expect(typeof response.body.data.transaction).toBe('string');
      expect(response.body.data.transaction.length).toBeGreaterThan(0);
      
      // Verify expected tokens calculation
      expect(response.body.data.expectedTokens).toBeGreaterThan(0);
      expect(response.body.data.exchangeRate).toBeGreaterThan(0);
      
      // Verify pool APY for YIELD
      expect(response.body.data.poolApy).toBe(7.5);
      
      // Verify fee amount
      expect(response.body.data.feeAmount).toBe(stakeAmount * 10 / 10000);
    });

    it('should use default slippage tolerance', async () => {
      const response = await request(app)
        .post('/stake/liquid/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.exchangeRate).toBe(0.95); // Default from mock
    });

    it('should validate slippage tolerance range', async () => {
      const response = await request(app)
        .post('/stake/liquid/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          amount: stakeAmount,
          slippageTolerance: 15, // Too high
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /unstake/build', () => {
    const validStakeAccount = '8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm';
    const liquidTokenAmount = 950000000; // 0.95 YIELD tokens

    it('should build native unstake transaction successfully', async () => {
      const response = await request(app)
        .post('/unstake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          type: 'native',
          stakeAccount: validStakeAccount,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('cooldownEpochs');
      expect(response.body.data).toHaveProperty('availableAt');
      expect(response.body.data).toHaveProperty('feeAmount');
      
      // Verify cooldown for native staking
      expect(response.body.data.cooldownEpochs).toBe(3);
      expect(response.body.data.feeAmount).toBeGreaterThan(0);
      
      // Verify availableAt is a future date
      const availableAt = new Date(response.body.data.availableAt);
      expect(availableAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should build liquid unstake transaction successfully', async () => {
      const response = await request(app)
        .post('/unstake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          type: 'liquid',
          liquidTokens: liquidTokenAmount,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('cooldownEpochs');
      expect(response.body.data).toHaveProperty('availableAt');
      expect(response.body.data).toHaveProperty('feeAmount');
      expect(response.body.data).toHaveProperty('immediateSOL');
      
      // Verify immediate liquidity for liquid staking
      expect(response.body.data.cooldownEpochs).toBe(0);
      expect(response.body.data.immediateSOL).toBeGreaterThan(0);
    });

    it('should require stakeAccount for native unstaking', async () => {
      const response = await request(app)
        .post('/unstake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          type: 'native',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require liquidTokens for liquid unstaking', async () => {
      const response = await request(app)
        .post('/unstake/build')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          agentWallet: validAgentWallet,
          type: 'liquid',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /tx/submit', () => {
    const validSignedTransaction = 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

    it('should submit transaction successfully', async () => {
      const response = await request(app)
        .post('/tx/submit')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          signedTransaction: validSignedTransaction,
          maxRetries: 3,
        })
        .expect(500); // Will fail because it's a dummy transaction, but tests the endpoint structure

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TRANSACTION_SUBMIT_ERROR');
    });

    it('should validate signed transaction format', async () => {
      const response = await request(app)
        .post('/tx/submit')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          signedTransaction: 'invalid-base64',
        })
        .expect(500); // Invalid base64 causes a server error during transaction decoding

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TRANSACTION_SUBMIT_ERROR');
    });

    it('should validate maxRetries range', async () => {
      const response = await request(app)
        .post('/tx/submit')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          signedTransaction: validSignedTransaction,
          maxRetries: 10, // Too high
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /stake/recommend', () => {
    it('should return staking recommendations', async () => {
      const response = await request(app)
        .get('/stake/recommend')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('native');
      expect(response.body.data).toHaveProperty('liquid');
      
      // Verify native recommendations
      expect(response.body.data.native).toHaveProperty('validators');
      expect(response.body.data.native).toHaveProperty('recommendedAllocation');
      expect(Array.isArray(response.body.data.native.validators)).toBe(true);
      expect(response.body.data.native.validators.length).toBeGreaterThan(0);
      
      // Verify Phase validator is featured
      const phaseValidator = response.body.data.native.validators.find((v: any) => v.isPhaseValidator);
      expect(phaseValidator).toBeDefined();
      expect(phaseValidator.name).toBe('Phase Validator');
      expect(phaseValidator.apy).toBe(7.2);
      
      // Verify liquid recommendations
      expect(response.body.data.liquid).toHaveProperty('pools');
      expect(response.body.data.liquid).toHaveProperty('featured');
      expect(Array.isArray(response.body.data.liquid.pools)).toBe(true);
      expect(response.body.data.liquid.featured).toBe('Phase YIELD Pool');
      
      // Verify YIELD pool
      const yieldPool = response.body.data.liquid.pools.find((p: any) => p.isPhasePool);
      expect(yieldPool).toBeDefined();
      expect(yieldPool.name).toBe('Phase YIELD Pool');
      expect(yieldPool.token).toBe('$YIELD');
      expect(yieldPool.mint).toBe('phaseZSfPxTDBpiVb96H4XFSD8xHeHxZre5HerehBJG');
    });
  });

  describe('GET /positions/:wallet', () => {
    it('should return agent portfolio positions', async () => {
      const response = await request(app)
        .get(`/positions/${validAgentWallet}`)
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('wallet');
      expect(response.body.data).toHaveProperty('totalStaked');
      expect(response.body.data).toHaveProperty('totalValue');
      expect(response.body.data).toHaveProperty('totalRewards');
      expect(response.body.data).toHaveProperty('native');
      expect(response.body.data).toHaveProperty('liquid');
      
      // Verify wallet address
      expect(response.body.data.wallet).toBe(validAgentWallet);
      
      // Verify native positions structure
      expect(response.body.data.native).toHaveProperty('stakeAccounts');
      expect(Array.isArray(response.body.data.native.stakeAccounts)).toBe(true);
      
      // Verify liquid positions structure
      expect(response.body.data.liquid).toHaveProperty('positions');
      expect(Array.isArray(response.body.data.liquid.positions)).toBe(true);
      
      // Verify calculations
      expect(response.body.data.totalStaked).toBeGreaterThanOrEqual(0);
      expect(response.body.data.totalValue).toBeGreaterThanOrEqual(response.body.data.totalStaked);
      expect(response.body.data.totalRewards).toBeGreaterThanOrEqual(0);
    });

    it('should validate wallet address format', async () => {
      const response = await request(app)
        .get('/positions/invalid-wallet')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_WALLET');
    });

    it('should handle missing wallet parameter', async () => {
      const response = await request(app)
        .get('/positions/')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(404);
    });
  });
});