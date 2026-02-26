import {
  Connection,
  PublicKey,
  Transaction,
  StakeProgram,
  SystemProgram,
  Authorized,
  Lockup,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { solanaService } from './solana';
import { config } from './config';
import { logger } from './logger';
import { NativeStakeRequest, NativeStakeResponse, InstructionInfo } from '@/types/api';

class TransactionService {
  private phaseValidatorVoteAccount: PublicKey;
  private phaseFeeWallet: PublicKey;

  constructor() {
    this.phaseValidatorVoteAccount = new PublicKey(config.phase.validatorVoteAccount);
    this.phaseFeeWallet = new PublicKey(config.phase.feeWallet);
    
    logger.info('Transaction service initialized', {
      validatorVoteAccount: config.phase.validatorVoteAccount,
      feeWallet: config.phase.feeWallet,
      rakeFeeBasisPoints: config.phase.rakeFeeBasisPoints,
    });
  }

  /**
   * Calculate rake fee from staking amount
   */
  calculateRakeFee(stakeAmount: number): number {
    return Math.floor((stakeAmount * config.phase.rakeFeeBasisPoints) / 10000);
  }

  /**
   * Build native staking transaction
   */
  async buildNativeStakeTransaction(request: NativeStakeRequest): Promise<NativeStakeResponse> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!solanaService.isValidPublicKey(request.agentWallet)) {
        throw new Error('Invalid agent wallet public key');
      }

      if (request.amount <= 0) {
        throw new Error('Stake amount must be greater than 0');
      }

      // Validate validator if specified
      let validatorVoteAccount = this.phaseValidatorVoteAccount;
      if (request.validatorVoteAccount) {
        if (!solanaService.isValidPublicKey(request.validatorVoteAccount)) {
          throw new Error('Invalid validator vote account');
        }
        validatorVoteAccount = new PublicKey(request.validatorVoteAccount);
      }

      // Parse wallet addresses
      const agentWallet = new PublicKey(request.agentWallet);
      const stakeAuthority = request.stakeAuthority 
        ? new PublicKey(request.stakeAuthority)
        : agentWallet; // Default to agent wallet

      // Generate ephemeral stake account
      const stakeAccount = Keypair.generate();
      
      // Get minimum rent for stake account
      const minimumRent = await solanaService.getStakeAccountMinimumRent();
      
      // Calculate total required lamports (stake amount + rent)
      const totalStakeLamports = minimumRent + request.amount;
      
      // Calculate rake fee
      const rakeFee = this.calculateRakeFee(request.amount);
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await solanaService.getRecentBlockhash();
      
      // Build transaction
      const transaction = new Transaction({
        feePayer: agentWallet,
        recentBlockhash: blockhash,
      });

      // Create stake account instruction
      const createStakeAccountInstruction = StakeProgram.createAccount({
        fromPubkey: agentWallet,
        stakePubkey: stakeAccount.publicKey,
        authorized: new Authorized(stakeAuthority, agentWallet), // stake authority, withdraw authority
        lockup: new Lockup(0, 0, agentWallet), // No lockup
        lamports: totalStakeLamports,
      });

      // Delegate stake instruction
      const delegateInstruction = StakeProgram.delegate({
        stakePubkey: stakeAccount.publicKey,
        authorizedPubkey: stakeAuthority,
        votePubkey: validatorVoteAccount,
      });

      // Rake fee transfer instruction
      const rakeTransferInstruction = SystemProgram.transfer({
        fromPubkey: agentWallet,
        toPubkey: this.phaseFeeWallet,
        lamports: rakeFee,
      });

      // Add instructions to transaction
      transaction.add(createStakeAccountInstruction);
      transaction.add(delegateInstruction);
      transaction.add(rakeTransferInstruction);

      // Get epoch info for activation estimation
      const epochInfo = await solanaService.getEpochInfo();
      const estimatedActivationEpoch = epochInfo.epoch + 1; // Stakes typically activate next epoch

      // Prepare instruction info for transparency
      const instructions: InstructionInfo[] = [
        {
          type: 'CreateStakeAccount',
          description: `Create stake account with ${request.amount / LAMPORTS_PER_SOL} SOL`,
          accounts: [agentWallet.toString(), stakeAccount.publicKey.toString()],
        },
        {
          type: 'DelegateStake',
          description: `Delegate to validator ${validatorVoteAccount.toString()}`,
          accounts: [stakeAccount.publicKey.toString(), validatorVoteAccount.toString()],
        },
        {
          type: 'RakeFeeTransfer',
          description: `Phase fee: ${rakeFee / LAMPORTS_PER_SOL} SOL (${config.phase.rakeFeeBasisPoints / 100}%)`,
          accounts: [agentWallet.toString(), this.phaseFeeWallet.toString()],
        },
      ];

      // Serialize transaction (unsigned)
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }).toString('base64');

      const response: NativeStakeResponse = {
        transaction: serializedTransaction,
        stakeAccount: stakeAccount.publicKey.toString(),
        estimatedApy: this.getEstimatedApy(validatorVoteAccount), // Mock APY for now
        activationEpoch: estimatedActivationEpoch,
        feeAmount: rakeFee,
        instructions,
      };

      const processingTime = Date.now() - startTime;
      
      logger.info('Native stake transaction built successfully', {
        agentWallet: request.agentWallet,
        stakeAmount: request.amount,
        stakeAccount: stakeAccount.publicKey.toString(),
        validator: validatorVoteAccount.toString(),
        rakeFee,
        processingTimeMs: processingTime,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build native stake transaction', {
        agentWallet: request.agentWallet,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  /**
   * Get estimated APY for a validator (placeholder implementation)
   * In production, this would calculate based on historical performance
   */
  private getEstimatedApy(validatorVoteAccount: PublicKey): number {
    // Phase validators get premium APY in our recommendations
    if (validatorVoteAccount.equals(this.phaseValidatorVoteAccount)) {
      return 7.2; // Premium APY for Phase validator
    }
    
    // Default APY for other validators
    return 6.8;
  }

  /**
   * Validate fee payer has sufficient balance
   * This is a helper for transaction building
   */
  async validateFeePayer(feePayer: PublicKey, requiredLamports: number): Promise<boolean> {
    try {
      const balance = await solanaService.getConnection().getBalance(feePayer);
      
      // Add buffer for transaction fees
      const txFeeBuffer = 10000; // ~0.00001 SOL for transaction fees
      const totalRequired = requiredLamports + txFeeBuffer;
      
      if (balance < totalRequired) {
        logger.warn('Insufficient balance for fee payer', {
          feePayer: feePayer.toString(),
          balance,
          required: totalRequired,
          deficit: totalRequired - balance,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to validate fee payer balance', {
        feePayer: feePayer.toString(),
        error: (error as Error).message,
      });
      return false;
    }
  }
}

export const transactionService = new TransactionService();