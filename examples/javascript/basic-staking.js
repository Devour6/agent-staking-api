/**
 * Phase Agent Staking API - JavaScript Example
 * Basic native SOL staking
 */

const { Connection, Keypair, Transaction, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');

class PhaseStakingClient {
  constructor(apiKey, baseUrl = 'https://staking-api.phase.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async buildStakeTransaction(agentWallet, stakeAmount, validatorVoteAccount = null) {
    const endpoint = `${this.baseUrl}/stake/build`;
    
    const requestBody = {
      agentWallet: agentWallet.toString(),
      stakeAmount: stakeAmount,
    };

    if (validatorVoteAccount) {
      requestBody.validatorVoteAccount = validatorVoteAccount.toString();
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.error.message}`);
    }

    const result = await response.json();
    return result.data;
  }

  async executeStaking(connection, agentKeypair, stakeAmount, validatorVoteAccount = null) {
    console.log(`🚀 Building stake transaction for ${stakeAmount} SOL...`);
    
    try {
      // Step 1: Build the unsigned transaction
      const transactionData = await this.buildStakeTransaction(
        agentKeypair.publicKey,
        stakeAmount,
        validatorVoteAccount
      );

      console.log(`✅ Transaction built successfully`);
      console.log(`📝 Stake Account: ${transactionData.metadata.stakeAccount}`);
      console.log(`🎯 Validator: ${transactionData.metadata.validator}`);
      console.log(`📈 Estimated APY: ${transactionData.metadata.estimatedApy}%`);
      console.log(`💰 Total Fees: ${transactionData.metadata.fees.transactionFee + transactionData.metadata.fees.rakeFee} lamports`);

      // Step 2: Reconstruct and sign the transaction
      const transaction = Transaction.from(Buffer.from(transactionData.transaction.serialized, 'base64'));
      
      // Step 3: Sign with agent's private key
      transaction.sign(agentKeypair);

      console.log(`✍️ Transaction signed, sending to network...`);

      // Step 4: Send transaction
      const signature = await sendAndConfirmTransaction(connection, transaction, [agentKeypair]);

      console.log(`🎉 Staking successful!`);
      console.log(`🔗 Transaction: https://explorer.solana.com/tx/${signature}`);
      console.log(`📊 Stake Account: https://explorer.solana.com/address/${transactionData.metadata.stakeAccount}`);

      return {
        signature,
        stakeAccount: transactionData.metadata.stakeAccount,
        validator: transactionData.metadata.validator,
        estimatedApy: transactionData.metadata.estimatedApy,
      };
    } catch (error) {
      console.error(`❌ Staking failed:`, error.message);
      throw error;
    }
  }

  async checkHealth() {
    const response = await fetch(`${this.baseUrl}/health`);
    const result = await response.json();
    
    if (result.success && result.data.status === 'healthy') {
      console.log(`✅ Phase Staking API is healthy (latency: ${result.data.checks.solana.latency}ms)`);
      return true;
    } else {
      console.log(`❌ Phase Staking API is unhealthy`);
      return false;
    }
  }
}

// Example usage
async function main() {
  // Configuration
  const API_KEY = process.env.PHASE_API_KEY || 'your-api-key-here';
  const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY; // Base58 encoded private key
  
  if (!API_KEY || !AGENT_PRIVATE_KEY) {
    console.error('❌ Please set PHASE_API_KEY and AGENT_PRIVATE_KEY environment variables');
    process.exit(1);
  }

  try {
    // Initialize client and connection
    const client = new PhaseStakingClient(API_KEY);
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Load agent keypair (in production, use secure key management)
    const agentKeypair = Keypair.fromSecretKey(Buffer.from(AGENT_PRIVATE_KEY, 'base64'));
    
    // Check API health
    await client.checkHealth();
    
    // Check agent balance
    const balance = await connection.getBalance(agentKeypair.publicKey);
    const solBalance = balance / 1_000_000_000; // Convert lamports to SOL
    console.log(`💰 Agent Balance: ${solBalance} SOL`);
    
    if (solBalance < 1.1) { // Need at least 1 SOL to stake + transaction fees
      console.error(`❌ Insufficient balance. Need at least 1.1 SOL (have ${solBalance} SOL)`);
      process.exit(1);
    }
    
    // Execute staking
    const stakeAmount = 1.0; // Stake 1 SOL
    const result = await client.executeStaking(
      connection, 
      agentKeypair, 
      stakeAmount
      // Optional: specify validator
      // new PublicKey('8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm')
    );
    
    console.log(`🏁 Staking Complete:`, result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { PhaseStakingClient };

/*
Usage Instructions:

1. Install dependencies:
   npm install @solana/web3.js

2. Set environment variables:
   export PHASE_API_KEY="your-api-key-here"
   export AGENT_PRIVATE_KEY="base58-encoded-private-key"
   export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com" # Optional

3. Run:
   node basic-staking.js

Safety Notes:
- Never hardcode private keys in source code
- Use environment variables or secure key management systems
- Always verify transaction details before signing
- Test on devnet first with small amounts
- Monitor your stake accounts after activation
*/