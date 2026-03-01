import { StakeMonitoringService } from '@/services/monitoring';
import { Connection, PublicKey } from '@solana/web3.js';
import { webhookDeliveryService } from '@/services/webhookDelivery';
import { config } from '@/services/config';

jest.mock('@/services/webhookDelivery');
jest.mock('@/services/config');
jest.mock('@/services/logger');

// Mock Solana Web3.js
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  PublicKey: jest.fn(),
  StakeProgram: {
    decode: jest.fn(),
  },
}));

describe('StakeMonitoringService', () => {
  let service: StakeMonitoringService;
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConnection = {
      getSignatureStatus: jest.fn(),
      getAccountInfo: jest.fn(),
      getVoteAccounts: jest.fn(),
      getEpochInfo: jest.fn(),
    } as any;

    (Connection as jest.Mock).mockImplementation(() => mockConnection);
    (config as any).solana = { rpcUrl: 'http://localhost:8899' };
    
    service = new StakeMonitoringService();
  });

  afterEach(() => {
    service.stopMonitoring();
  });

  describe('addStakeMonitoring', () => {
    it('should add a new stake monitoring request', async () => {
      const request = {
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const monitoringId = await service.addStakeMonitoring(request);

      expect(monitoringId).toMatch(/^stake_\d+_[a-z0-9]+$/);
      
      const monitoredStakes = service.getMonitoredStakes();
      expect(monitoredStakes).toHaveLength(1);
      expect(monitoredStakes[0]).toMatchObject({
        id: monitoringId,
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('checkStakeStatus', () => {
    it('should confirm stake transaction when signature is confirmed', async () => {
      const monitoredStake = {
        id: 'test-id',
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'pending' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockConnection.getSignatureStatus.mockResolvedValue({
        context: { slot: 123 },
        value: {
          confirmationStatus: 'confirmed',
          confirmations: null,
          err: null,
          slot: 123,
        },
      });

      await service.checkStakeStatus(monitoredStake);

      expect(monitoredStake.status).toBe('confirmed');
      expect(monitoredStake.confirmedAt).toBeDefined();
      expect(webhookDeliveryService.deliverWebhook).toHaveBeenCalledWith('stake_confirmed', {
        transactionSignature: 'signature123',
        amount: 1000000,
        validatorVoteAccount: 'validator123',
        agentWallet: 'agent123',
        stakeAccount: 'stake123',
        timestamp: monitoredStake.confirmedAt,
      });
    });

    it('should mark stake as activated when account data indicates activation', async () => {
      const monitoredStake = {
        id: 'test-id',
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'confirmed' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        confirmedAt: '2024-01-01T01:00:00.000Z',
      };

      mockConnection.getAccountInfo.mockResolvedValue({
        data: Buffer.alloc(300), // > 200 bytes indicates activated stake
        executable: false,
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
        rentEpoch: 123,
      });

      const monitoredStakes = new Map([['test-id', monitoredStake]]);
      (service as any).monitoredStakes = monitoredStakes;

      await service.checkStakeStatus(monitoredStake);

      expect(monitoredStake.status).toBe('activated');
      expect(monitoredStake.activatedAt).toBeDefined();
      expect(webhookDeliveryService.deliverWebhook).toHaveBeenCalledWith('stake_activated', {
        transactionSignature: 'signature123',
        amount: 1000000,
        validatorVoteAccount: 'validator123',
        agentWallet: 'agent123',
        stakeAccount: 'stake123',
        timestamp: monitoredStake.activatedAt,
      });
      expect(monitoredStakes.has('test-id')).toBe(false); // Should be removed after activation
    });

    it('should mark stake as failed after 24 hours timeout', async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const monitoredStake = {
        id: 'test-id',
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'pending' as const,
        createdAt: twentyFiveHoursAgo,
      };

      mockConnection.getSignatureStatus.mockRejectedValue(new Error('RPC error'));

      const monitoredStakes = new Map([['test-id', monitoredStake]]);
      (service as any).monitoredStakes = monitoredStakes;

      await service.checkStakeStatus(monitoredStake);

      expect(monitoredStake.status).toBe('failed');
      expect(monitoredStakes.has('test-id')).toBe(false); // Should be removed
    });

    it('should handle RPC errors gracefully', async () => {
      const monitoredStake = {
        id: 'test-id',
        transactionSignature: 'signature123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'pending' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockConnection.getSignatureStatus.mockRejectedValue(new Error('Network error'));

      await service.checkStakeStatus(monitoredStake);

      expect(monitoredStake.lastCheckedAt).toBeDefined();
      expect(monitoredStake.status).toBe('pending'); // Status should remain unchanged
    });
  });

  describe('processMonitoringQueue', () => {
    it('should process all monitored stakes', async () => {
      const stakes = [
        {
          id: 'stake-1',
          transactionSignature: 'sig1',
          stakeAccount: 'stake1',
          agentWallet: 'agent1',
          validatorVoteAccount: 'validator1',
          amount: 1000000,
          status: 'pending' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'stake-2',
          transactionSignature: 'sig2',
          stakeAccount: 'stake2',
          agentWallet: 'agent2',
          validatorVoteAccount: 'validator2',
          amount: 2000000,
          status: 'pending' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      (service as any).monitoredStakes = new Map(stakes.map(s => [s.id, s]));

      mockConnection.getSignatureStatus.mockResolvedValue({
        context: { slot: 123 },
        value: null, // Not yet confirmed
      });

      await service.processMonitoringQueue();

      // Both stakes should have been checked
      expect(mockConnection.getSignatureStatus).toHaveBeenCalledTimes(2);
      expect(stakes[0].lastCheckedAt).toBeDefined();
      expect(stakes[1].lastCheckedAt).toBeDefined();
    });

    it('should handle empty queue gracefully', async () => {
      (service as any).monitoredStakes = new Map();

      await service.processMonitoringQueue();

      expect(mockConnection.getSignatureStatus).not.toHaveBeenCalled();
    });
  });

  describe('checkValidatorPerformance', () => {
    it('should detect delinquent validators with monitored stakes', async () => {
      const monitoredStakes = new Map([
        ['stake-1', {
          id: 'stake-1',
          transactionSignature: 'sig1',
          stakeAccount: 'stake1',
          agentWallet: 'agent1',
          validatorVoteAccount: 'delinquent-validator',
          amount: 1000000,
          status: 'confirmed' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
        }],
      ]);

      (service as any).monitoredStakes = monitoredStakes;

      mockConnection.getVoteAccounts.mockResolvedValue({
        current: [],
        delinquent: [
          {
            votePubkey: 'delinquent-validator',
            nodePubkey: 'node-key',
            activatedStake: 1000000,
            epochVoteAccount: true,
            epochCredits: [],
            commission: 5,
            lastVote: 100,
            rootSlot: 99,
          },
        ],
      });

      mockConnection.getEpochInfo.mockResolvedValue({
        epoch: 200,
        slotIndex: 100,
        slotsInEpoch: 432000,
        absoluteSlot: 86400100,
        blockHeight: 86400000,
        transactionCount: 123456789,
      });

      await service.checkValidatorPerformance();

      expect(webhookDeliveryService.deliverWebhook).toHaveBeenCalledWith('validator_delinquent', {
        validatorVoteAccount: 'delinquent-validator',
        agentWallet: 'agent1',
        stakeAccount: 'stake1',
        epochsDelinquent: 100, // 200 - 100
        timestamp: expect.any(String),
      });
    });

    it('should handle RPC errors gracefully', async () => {
      mockConnection.getVoteAccounts.mockRejectedValue(new Error('RPC error'));

      await expect(service.checkValidatorPerformance()).resolves.not.toThrow();
    });
  });

  describe('getMonitoringStatus', () => {
    it('should return monitoring status for existing stake', () => {
      const stake = {
        id: 'test-id',
        transactionSignature: 'sig123',
        stakeAccount: 'stake123',
        agentWallet: 'agent123',
        validatorVoteAccount: 'validator123',
        amount: 1000000,
        status: 'pending' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (service as any).monitoredStakes.set('test-id', stake);

      const result = service.getMonitoringStatus('test-id');

      expect(result).toEqual(stake);
    });

    it('should return null for non-existing stake', () => {
      const result = service.getMonitoringStatus('non-existing');

      expect(result).toBeNull();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring interval', () => {
      jest.useFakeTimers();
      
      service.startMonitoring();

      // Fast-forward time to trigger interval
      jest.advanceTimersByTime(30000);

      expect(mockConnection.getSignatureStatus).not.toHaveBeenCalled(); // No stakes to monitor

      jest.useRealTimers();
    });

    it('should not start multiple intervals', () => {
      service.startMonitoring();
      service.startMonitoring(); // Should not create another interval

      expect((service as any).monitoringInterval).toBeDefined();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring interval', () => {
      service.startMonitoring();
      expect((service as any).monitoringInterval).toBeDefined();

      service.stopMonitoring();
      expect((service as any).monitoringInterval).toBeUndefined();
    });

    it('should handle stopping when not started', () => {
      expect(() => service.stopMonitoring()).not.toThrow();
    });
  });
});