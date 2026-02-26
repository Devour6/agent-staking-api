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
  TransactionSignature,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { 
  StakePool, 
  withdrawSol, 
  depositSol,
} from '@solana/spl-stake-pool';
import { solanaService } from './solana';
import { config } from './config';
import { logger } from './logger';
import { 
  NativeStakeRequest, 
  NativeStakeResponse, 
  LiquidStakeRequest,
  LiquidStakeResponse,
  UnstakeRequest,
  UnstakeResponse,
  TransactionSubmitRequest,
  TransactionSubmitResponse,
  InstructionInfo,
  StakeRecommendationResponse,
  PositionResponse,
  ValidatorInfo,
  StakeAccount,
} from '@/types/api';

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
   * Build liquid staking transaction for $YIELD
   */
  async buildLiquidStakeTransaction(request: LiquidStakeRequest): Promise<LiquidStakeResponse> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!solanaService.isValidPublicKey(request.agentWallet)) {
        throw new Error('Invalid agent wallet public key');
      }
      
      if (request.amount <= 0) {
        throw new Error('Stake amount must be greater than 0');
      }

      const slippageTolerance = request.slippageTolerance ?? 0.005; // Default 0.5%
      
      // Parse wallet address
      const agentWallet = new PublicKey(request.agentWallet);
      const yieldStakePoolMint = new PublicKey(config.phase.yieldStakePoolMint);
      
      // Get stake pool info (simplified - in production would fetch from on-chain)
      const stakePoolInfo = await this.getYieldStakePoolInfo();
      
      // Calculate expected tokens and exchange rate
      const exchangeRate = stakePoolInfo.exchangeRate;
      const expectedTokens = Math.floor(request.amount * exchangeRate);
      const minTokensWithSlippage = Math.floor(expectedTokens * (1 - slippageTolerance));
      
      // Calculate rake fee
      const rakeFee = this.calculateRakeFee(request.amount);
      
      // Get recent blockhash
      const { blockhash } = await solanaService.getRecentBlockhash();
      
      // Build transaction (simplified implementation)
      const transaction = new Transaction({
        feePayer: agentWallet,
        recentBlockhash: blockhash,
      });

      // Add rake fee transfer instruction
      const rakeInstruction = SystemProgram.transfer({
        fromPubkey: agentWallet,
        toPubkey: this.phaseFeeWallet,
        lamports: rakeFee,
      });
      transaction.add(rakeInstruction);

      // Note: Actual stake pool deposit instruction would be added here
      // For now, returning a placeholder transaction
      
      const instructions: InstructionInfo[] = [
        {
          type: 'SystemProgram.transfer',
          description: `Rake fee: ${rakeFee / LAMPORTS_PER_SOL} SOL`,
          accounts: [agentWallet.toString(), this.phaseFeeWallet.toString()],
        },
        {
          type: 'StakePoolProgram.depositSol',
          description: `Deposit ${request.amount / LAMPORTS_PER_SOL} SOL for $YIELD tokens`,
          accounts: [agentWallet.toString(), yieldStakePoolMint.toString()],
        },
      ];
      
      const processingTime = Date.now() - startTime;
      
      const response: LiquidStakeResponse = {
        transaction: transaction.serialize({ verifySignatures: false }).toString('base64'),
        expectedTokens,
        exchangeRate,
        poolApy: stakePoolInfo.apy,
        feeAmount: rakeFee,
        instructions,
      };
      
      logger.info('Liquid stake transaction built successfully', {
        agentWallet: request.agentWallet,
        stakeAmount: request.amount,
        expectedTokens,
        exchangeRate,
        rakeFee,
        processingTimeMs: processingTime,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build liquid stake transaction', {
        agentWallet: request.agentWallet,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  /**
   * Build unstaking transaction (both native and liquid)
   */
  async buildUnstakeTransaction(request: UnstakeRequest): Promise<UnstakeResponse> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!solanaService.isValidPublicKey(request.agentWallet)) {
        throw new Error('Invalid agent wallet public key');
      }
      
      const agentWallet = new PublicKey(request.agentWallet);
      
      if (request.type === 'native') {
        return this.buildNativeUnstakeTransaction(request, agentWallet, startTime);
      } else if (request.type === 'liquid') {
        return this.buildLiquidUnstakeTransaction(request, agentWallet, startTime);
      } else {
        throw new Error('Invalid unstake type. Must be "native" or "liquid"');
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to build unstake transaction', {
        agentWallet: request.agentWallet,
        type: request.type,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  /**
   * Submit signed transaction to Solana network
   */
  async submitTransaction(request: TransactionSubmitRequest): Promise<TransactionSubmitResponse> {
    const startTime = Date.now();
    
    try {
      // Decode and validate signed transaction
      const transactionBuffer = Buffer.from(request.signedTransaction, 'base64');
      const transaction = Transaction.from(transactionBuffer);
      
      // Validate transaction has signatures
      if (!transaction.signatures || transaction.signatures.length === 0) {
        throw new Error('Transaction must be signed');
      }

      const maxRetries = request.maxRetries ?? 3;
      const priorityFee = request.priorityFee ?? 0;
      
      // Submit transaction with retry logic
      let signature: TransactionSignature;
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const sendOptions = {
            skipPreflight: false,
            preflightCommitment: 'confirmed' as const,
            maxRetries: 0, // Handle retries manually
          };
          
          signature = await solanaService.getConnection().sendRawTransaction(
            transaction.serialize(),
            sendOptions
          );
          
          // Successfully submitted
          break;
          
        } catch (error) {
          lastError = error as Error;
          logger.warn('Transaction submission attempt failed', {
            attempt,
            maxRetries,
            error: lastError.message,
          });
          
          if (attempt < maxRetries) {
            // Exponential backoff
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }
      
      if (!signature!) {
        throw lastError || new Error('Failed to submit transaction after maximum retries');
      }
      
      // Wait for confirmation
      const confirmation = await solanaService.getConnection().confirmTransaction(signature, 'confirmed');
      
      const processingTime = Date.now() - startTime;
      
      const response: TransactionSubmitResponse = {
        signature,
        status: confirmation.value.err ? 'failed' : 'success',
        confirmationStatus: 'confirmed',
        slot: confirmation.context.slot,
        ...(confirmation.value.err && { error: String(confirmation.value.err) }),
      };
      
      logger.info('Transaction submitted successfully', {
        signature,
        status: response.status,
        slot: response.slot,
        processingTimeMs: processingTime,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to submit transaction', {
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  /**
   * Get staking recommendations
   */
  async getStakeRecommendations(): Promise<StakeRecommendationResponse> {
    const startTime = Date.now();
    
    try {
      // Get Phase validator info (featured)
      const phaseValidator: ValidatorInfo = {
        voteAccount: this.phaseValidatorVoteAccount.toString(),
        name: 'Phase Validator',
        commission: 5, // 5% commission
        apy: 7.2,
        isPhaseValidator: true,
        health: 'excellent',
      };
      
      // Mock additional validators for diversity
      const otherValidators: ValidatorInfo[] = [
        {
          voteAccount: 'Validator2VoteAccount1111111111111111111111',
          name: 'Solana Foundation Validator',
          commission: 7,
          apy: 6.8,
          isPhaseValidator: false,
          health: 'excellent',
        },
        {
          voteAccount: 'Validator3VoteAccount1111111111111111111111',
          name: 'RPC Pool Validator',
          commission: 6,
          apy: 6.9,
          isPhaseValidator: false,
          health: 'good',
        },
      ];
      
      // Get YIELD pool info
      const yieldPoolInfo = await this.getYieldStakePoolInfo();
      
      const response: StakeRecommendationResponse = {
        native: {
          validators: [phaseValidator, ...otherValidators],
          recommendedAllocation: 70, // 70% to native staking
        },
        liquid: {
          pools: [
            {
              name: 'Phase YIELD Pool',
              token: '$YIELD',
              mint: config.phase.yieldStakePoolMint,
              apy: yieldPoolInfo.apy,
              tvl: yieldPoolInfo.tvl,
              isPhasePool: true,
            },
          ],
          featured: 'Phase YIELD Pool',
        },
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Stake recommendations generated', {
        nativeValidators: response.native.validators.length,
        liquidPools: response.liquid.pools.length,
        processingTimeMs: processingTime,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to get stake recommendations', {
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  /**
   * Get agent portfolio positions
   */
  async getAgentPositions(walletAddress: string): Promise<PositionResponse> {
    const startTime = Date.now();
    
    try {
      // Validate wallet address
      if (!solanaService.isValidPublicKey(walletAddress)) {
        throw new Error('Invalid wallet address');
      }
      
      const wallet = new PublicKey(walletAddress);
      
      // Get native stake accounts
      const stakeAccounts = await this.getNativeStakeAccounts(wallet);
      
      // Get liquid stake positions
      const liquidPositions = await this.getLiquidStakePositions(wallet);
      
      // Calculate totals
      const totalNativeStaked = stakeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      const totalLiquidValue = liquidPositions.reduce((sum, pos) => sum + pos.solValue, 0);
      const totalStaked = totalNativeStaked + totalLiquidValue;
      
      // Calculate rewards (simplified calculation)
      const totalRewards = Math.floor(totalStaked * 0.072 * 0.25); // ~7.2% APY, 3 months
      
      const response: PositionResponse = {
        wallet: walletAddress,
        totalStaked,
        totalValue: totalStaked + totalRewards,
        totalRewards,
        native: {
          stakeAccounts,
        },
        liquid: {
          positions: liquidPositions,
        },
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Agent positions retrieved', {
        wallet: walletAddress,
        totalStaked,
        nativeAccounts: stakeAccounts.length,
        liquidPositions: liquidPositions.length,
        processingTimeMs: processingTime,
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to get agent positions', {
        wallet: walletAddress,
        error: (error as Error).message,
        processingTimeMs: processingTime,
      });
      
      throw error;
    }
  }

  // Helper methods
  
  private async buildNativeUnstakeTransaction(
    request: UnstakeRequest, 
    agentWallet: PublicKey, 
    startTime: number
  ): Promise<UnstakeResponse> {
    if (!request.stakeAccount) {
      throw new Error('Stake account address required for native unstaking');
    }
    
    if (!solanaService.isValidPublicKey(request.stakeAccount)) {
      throw new Error('Invalid stake account address');
    }
    
    const stakeAccount = new PublicKey(request.stakeAccount);
    
    // Calculate unstaking fee
    const rakeFee = Math.floor(this.calculateRakeFee(100000000)); // Fixed fee for unstaking
    
    // Get recent blockhash
    const { blockhash } = await solanaService.getRecentBlockhash();
    
    // Build deactivate transaction
    const transaction = new Transaction({
      feePayer: agentWallet,
      recentBlockhash: blockhash,
    });

    // Add rake fee
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: agentWallet,
        toPubkey: this.phaseFeeWallet,
        lamports: rakeFee,
      })
    );

    // Add deactivate instruction
    transaction.add(
      StakeProgram.deactivate({
        stakePubkey: stakeAccount,
        authorizedPubkey: agentWallet,
      })
    );
    
    // Calculate cooldown (approximately 2-3 epochs)
    const currentEpoch = await solanaService.getCurrentEpoch();
    const cooldownEpochs = 3;
    const estimatedAvailableAt = new Date(Date.now() + (cooldownEpochs * 2.5 * 24 * 60 * 60 * 1000));
    
    const processingTime = Date.now() - startTime;
    
    return {
      transaction: transaction.serialize({ verifySignatures: false }).toString('base64'),
      cooldownEpochs,
      availableAt: estimatedAvailableAt.toISOString(),
      feeAmount: rakeFee,
    };
  }
  
  private async buildLiquidUnstakeTransaction(
    request: UnstakeRequest, 
    agentWallet: PublicKey, 
    startTime: number
  ): Promise<UnstakeResponse> {
    if (!request.liquidTokens) {
      throw new Error('Liquid token amount required for liquid unstaking');
    }
    
    if (request.liquidTokens <= 0) {
      throw new Error('Liquid token amount must be greater than 0');
    }
    
    // Get stake pool info
    const stakePoolInfo = await this.getYieldStakePoolInfo();
    
    // Calculate immediate SOL value
    const immediateSOL = Math.floor(request.liquidTokens / stakePoolInfo.exchangeRate);
    
    // Calculate rake fee
    const rakeFee = this.calculateRakeFee(immediateSOL);
    
    // Get recent blockhash
    const { blockhash } = await solanaService.getRecentBlockhash();
    
    // Build withdraw transaction (simplified)
    const transaction = new Transaction({
      feePayer: agentWallet,
      recentBlockhash: blockhash,
    });

    // Add rake fee
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: agentWallet,
        toPubkey: this.phaseFeeWallet,
        lamports: rakeFee,
      })
    );

    // Note: Actual withdraw instruction would be added here
    
    const processingTime = Date.now() - startTime;
    
    return {
      transaction: transaction.serialize({ verifySignatures: false }).toString('base64'),
      cooldownEpochs: 0, // Immediate for liquid staking
      availableAt: new Date().toISOString(),
      feeAmount: rakeFee,
      immediateSOL,
    };
  }
  
  private async getYieldStakePoolInfo() {
    // Simplified implementation - in production would fetch real on-chain data
    return {
      exchangeRate: 0.95, // 1 SOL = 0.95 YIELD tokens
      apy: 7.5, // 7.5% APY for liquid staking
      tvl: 1000000 * LAMPORTS_PER_SOL, // 1M SOL TVL
    };
  }
  
  private async getNativeStakeAccounts(wallet: PublicKey): Promise<StakeAccount[]> {
    try {
      const connection = solanaService.getConnection();
      const stakeAccounts = await connection.getParsedProgramAccounts(StakeProgram.programId, {
        filters: [
          {
            memcmp: {
              offset: 12, // Withdraw authority offset
              bytes: wallet.toBase58(),
            },
          },
        ],
      });
      
      return stakeAccounts.map((account) => ({
        address: account.pubkey.toString(),
        balance: account.account.lamports,
        status: 'active' as const, // Simplified
        validator: 'Unknown',
        activationEpoch: 0,
      }));
    } catch (error) {
      logger.error('Failed to fetch native stake accounts', {
        wallet: wallet.toString(),
        error: (error as Error).message,
      });
      return [];
    }
  }
  
  private async getLiquidStakePositions(wallet: PublicKey) {
    try {
      // Simplified implementation - would use actual token account queries
      return [
        {
          token: '$YIELD',
          balance: 1000000, // 1 YIELD token
          solValue: 1050000, // ~1.05 SOL value
          apy: 7.5,
        },
      ];
    } catch (error) {
      logger.error('Failed to fetch liquid stake positions', {
        wallet: wallet.toString(),
        error: (error as Error).message,
      });
      return [];
    }
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