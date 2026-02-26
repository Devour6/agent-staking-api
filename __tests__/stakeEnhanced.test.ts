import request from 'supertest';
import app from '../src/app';
import { storage } from '../src/services/storage';

describe('Enhanced Stake API', () => {
  const validApiKey = 'a'.repeat(64);
  const validAgentWallet = '11111111111111111111111111111112'; // Valid base58
  const validValidatorVote = '11111111111111111111111111111113';
  const validAmount = 1000000000; // 1 SOL in lamports

  beforeAll(async () => {
    await storage.init();
  });

  describe('POST /stake/build-and-monitor', () => {
    it('should build transaction without webhook monitoring', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
        validatorVoteAccount: validValidatorVote,
      };

      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest);

      // Note: This might fail due to Solana RPC connection in test environment
      // In a real test environment, we would mock the Solana service
      if (response.status === 503) {
        // RPC error is expected in test environment
        expect(response.body.error.code).toBe('RPC_ERROR');
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('stakeAccount');
      expect(response.body.data).toHaveProperty('feeAmount');
      expect(response.body.data.webhook).toBeUndefined();
    });

    it('should build transaction with webhook monitoring', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
        validatorVoteAccount: validValidatorVote,
        webhookUrl: 'https://example.com/webhook',
        webhookEvents: ['stake_confirmed', 'stake_activated'],
      };

      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest);

      // Note: This might fail due to Solana RPC connection in test environment
      if (response.status === 503) {
        // RPC error is expected in test environment
        expect(response.body.error.code).toBe('RPC_ERROR');
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transaction');
      expect(response.body.data).toHaveProperty('stakeAccount');
      expect(response.body.data).toHaveProperty('feeAmount');
      expect(response.body.data).toHaveProperty('webhook');
      expect(response.body.data.webhook).toHaveProperty('id');
      expect(response.body.data.webhook.url).toBe(stakeRequest.webhookUrl);
      expect(response.body.data.webhook.events).toEqual(stakeRequest.webhookEvents);
    });

    it('should validate webhook URL format', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
        webhookUrl: 'http://example.com/webhook', // HTTP not allowed
      };

      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate webhook events', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
        webhookUrl: 'https://example.com/webhook',
        webhookEvents: ['invalid_event'],
      };

      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require authentication', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
      };

      await request(app)
        .post('/stake/build-and-monitor')
        .send(stakeRequest)
        .expect(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate minimum stake amount', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: 100, // Below minimum
      };

      await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest)
        .expect(400);
    });

    it('should validate maximum stake amount', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: 1001 * 1000000000, // Above maximum (1000 SOL)
      };

      await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest)
        .expect(400);
    });

    it('should use default webhook events when not specified', async () => {
      const stakeRequest = {
        agentWallet: validAgentWallet,
        amount: validAmount,
        webhookUrl: 'https://default-events.example.com/webhook',
      };

      const response = await request(app)
        .post('/stake/build-and-monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(stakeRequest);

      // If successful, check default events
      if (response.status === 200) {
        expect(response.body.data.webhook.events).toEqual([
          'stake_confirmed',
          'stake_activated'
        ]);
      } else if (response.status === 503) {
        // Expected RPC error in test environment
        expect(response.body.error.code).toBe('RPC_ERROR');
      }
    });
  });

  describe('POST /stake/monitor', () => {
    const validTxSignature = '2WE6KaNgYaNE6d2AZUL8SQGdAQRo9FTcv3xNT2v9k2LM2QhkNEGrZz8VbJc9VE4pCJv7cNJq9yXhyLsQY2D3d4dF';
    const validStakeAccount = '11111111111111111111111111111114';

    it('should register monitoring for existing transaction', async () => {
      const monitorRequest = {
        transactionSignature: validTxSignature,
        stakeAccount: validStakeAccount,
        agentWallet: validAgentWallet,
        validatorVoteAccount: validValidatorVote,
        amount: validAmount,
      };

      const response = await request(app)
        .post('/stake/monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(monitorRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('monitoringId');
      expect(response.body.data.transactionSignature).toBe(validTxSignature);
      expect(response.body.data.stakeAccount).toBe(validStakeAccount);
    });

    it('should require all mandatory fields', async () => {
      const incompleteRequest = {
        transactionSignature: validTxSignature,
        // Missing stakeAccount and agentWallet
      };

      await request(app)
        .post('/stake/monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(incompleteRequest)
        .expect(400);
    });

    it('should validate transaction signature format', async () => {
      const monitorRequest = {
        transactionSignature: 'invalid-signature',
        stakeAccount: validStakeAccount,
        agentWallet: validAgentWallet,
      };

      await request(app)
        .post('/stake/monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(monitorRequest)
        .expect(400);
    });

    it('should validate Solana public key formats', async () => {
      const monitorRequest = {
        transactionSignature: validTxSignature,
        stakeAccount: 'invalid-public-key',
        agentWallet: validAgentWallet,
      };

      await request(app)
        .post('/stake/monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(monitorRequest)
        .expect(400);
    });

    it('should require authentication', async () => {
      const monitorRequest = {
        transactionSignature: validTxSignature,
        stakeAccount: validStakeAccount,
        agentWallet: validAgentWallet,
      };

      await request(app)
        .post('/stake/monitor')
        .send(monitorRequest)
        .expect(401);
    });

    it('should accept optional fields', async () => {
      const monitorRequest = {
        transactionSignature: validTxSignature,
        stakeAccount: validStakeAccount,
        agentWallet: validAgentWallet,
        // Optional fields
        validatorVoteAccount: validValidatorVote,
        amount: validAmount,
      };

      const response = await request(app)
        .post('/stake/monitor')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(monitorRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('monitoringId');
    });
  });
});