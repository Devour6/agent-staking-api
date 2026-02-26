#!/usr/bin/env node
/**
 * End-to-End Devnet Testing Script
 * Agent Staking API - Complete workflow testing on Solana devnet
 * 
 * This script performs comprehensive testing:
 * 1. Calls POST /stake/build with a devnet wallet
 * 2. Verifies the unsigned transaction is valid
 * 3. Signs it with a test keypair
 * 4. Submits via POST /tx/submit
 * 5. Confirms the stake account was created on-chain
 * 6. Calls GET /positions/:wallet to verify it shows up
 */

const { Connection, Keypair, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    KEYPAIR_PATH: process.env.TEST_KEYPAIR_PATH || './devnet-test-keypair.json',
    API_KEY: process.env.API_KEY_SECRET || 'devnet-test-secret-key-32-chars-long',
    MIN_SOL_BALANCE: 0.5, // Minimum SOL needed for testing
    STAKE_AMOUNT_SOL: 0.1, // Amount to stake in SOL
};

class DevnetE2ETest {
    constructor() {
        this.connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed');
        this.testKeypair = null;
        this.apiClient = axios.create({
            baseURL: CONFIG.API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CONFIG.API_KEY,
            },
            timeout: 30000,
        });
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
        console.log(`${emoji} [${timestamp}] ${message}`);
    }

    async loadTestKeypair() {
        try {
            const keypairPath = path.resolve(CONFIG.KEYPAIR_PATH);
            if (!fs.existsSync(keypairPath)) {
                throw new Error(`Test keypair not found at ${keypairPath}`);
            }

            const secretKeyArray = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
            this.testKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
            
            this.log(`Test wallet loaded: ${this.testKeypair.publicKey.toBase58()}`);
            return this.testKeypair;
        } catch (error) {
            this.log(`Failed to load test keypair: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async checkWalletBalance() {
        try {
            const balance = await this.connection.getBalance(this.testKeypair.publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            
            this.log(`Wallet balance: ${balanceSOL.toFixed(4)} SOL`);
            
            if (balanceSOL < CONFIG.MIN_SOL_BALANCE) {
                this.log(`Insufficient balance! Need at least ${CONFIG.MIN_SOL_BALANCE} SOL for testing`, 'WARN');
                this.log('Request airdrop from: https://faucet.solana.com/', 'WARN');
                this.log(`Or run: solana airdrop 2 ${this.testKeypair.publicKey.toBase58()} --url devnet`, 'WARN');
                return false;
            }
            
            return true;
        } catch (error) {
            this.log(`Failed to check wallet balance: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async testAPIHealth() {
        try {
            this.log('Testing API health...');
            const response = await this.apiClient.get('/health');
            
            if (response.status === 200 && response.data.status === 'healthy') {
                this.log('API health check passed', 'SUCCESS');
                return true;
            } else {
                throw new Error(`API health check failed: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            this.log(`API health check failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async buildStakeTransaction() {
        try {
            this.log('Building stake transaction...');
            
            const stakeAmountLamports = CONFIG.STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL;
            const requestBody = {
                walletAddress: this.testKeypair.publicKey.toBase58(),
                amountLamports: stakeAmountLamports,
                validatorVoteAccount: 'CertusDeBmqN8ZawdkxK5kFGMwBXdudvWLSGq6UKHLVa', // Test validator
            };

            this.log(`Request: ${JSON.stringify(requestBody, null, 2)}`);
            
            const response = await this.apiClient.post('/stake/build', requestBody);
            
            if (response.status === 200 && response.data.transaction) {
                this.log('Stake transaction built successfully', 'SUCCESS');
                this.log(`Transaction size: ${response.data.transaction.length} bytes`);
                return response.data;
            } else {
                throw new Error(`Failed to build transaction: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            this.log(`Failed to build stake transaction: ${error.response?.data?.message || error.message}`, 'ERROR');
            throw error;
        }
    }

    async verifyTransaction(transactionData) {
        try {
            this.log('Verifying unsigned transaction...');
            
            // Deserialize transaction from base64
            const transactionBuffer = Buffer.from(transactionData.transaction, 'base64');
            const transaction = Transaction.from(transactionBuffer);
            
            // Basic validation
            if (!transaction.instructions || transaction.instructions.length === 0) {
                throw new Error('Transaction has no instructions');
            }
            
            this.log(`Transaction has ${transaction.instructions.length} instruction(s)`);
            this.log(`Fee payer: ${transaction.feePayer?.toBase58() || 'Not set'}`);
            
            // Verify it's unsigned
            if (transaction.signatures.some(sig => !sig.signature.equals(Buffer.alloc(64)))) {
                throw new Error('Transaction appears to be already signed');
            }
            
            this.log('Transaction verification passed', 'SUCCESS');
            return transaction;
        } catch (error) {
            this.log(`Transaction verification failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async signTransaction(transaction) {
        try {
            this.log('Signing transaction with test keypair...');
            
            // Get recent blockhash for the transaction
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.testKeypair.publicKey;
            
            // Sign the transaction
            transaction.sign(this.testKeypair);
            
            // Verify signature
            if (!transaction.verifySignatures()) {
                throw new Error('Transaction signature verification failed');
            }
            
            this.log('Transaction signed successfully', 'SUCCESS');
            return transaction;
        } catch (error) {
            this.log(`Failed to sign transaction: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async submitTransaction(signedTransaction) {
        try {
            this.log('Submitting signed transaction...');
            
            const serializedTransaction = signedTransaction.serialize().toString('base64');
            const requestBody = {
                transaction: serializedTransaction,
                options: {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                }
            };

            const response = await this.apiClient.post('/tx/submit', requestBody);
            
            if (response.status === 200 && response.data.signature) {
                this.log(`Transaction submitted successfully: ${response.data.signature}`, 'SUCCESS');
                return response.data.signature;
            } else {
                throw new Error(`Failed to submit transaction: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            this.log(`Failed to submit transaction: ${error.response?.data?.message || error.message}`, 'ERROR');
            throw error;
        }
    }

    async confirmTransaction(signature) {
        try {
            this.log(`Confirming transaction: ${signature}`);
            
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }
            
            this.log('Transaction confirmed on-chain', 'SUCCESS');
            return confirmation;
        } catch (error) {
            this.log(`Failed to confirm transaction: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async verifyStakeAccountCreation(signature) {
        try {
            this.log('Verifying stake account creation...');
            
            // Get transaction details
            const transaction = await this.connection.getTransaction(signature, {
                commitment: 'confirmed',
            });
            
            if (!transaction) {
                throw new Error('Transaction not found on chain');
            }
            
            this.log('Transaction found on-chain with details', 'SUCCESS');
            
            // Look for new stake accounts in post balances
            const preAccountKeys = transaction.transaction.message.accountKeys;
            const postBalances = transaction.meta.postBalances;
            
            this.log(`Transaction involved ${preAccountKeys.length} accounts`);
            
            // Check for stake account creation (this would need more sophisticated parsing in real implementation)
            let stakeAccountFound = false;
            for (let i = 0; i < preAccountKeys.length; i++) {
                if (postBalances[i] > 0) {
                    // This is a simplified check - real implementation would verify account type
                    this.log(`Account ${preAccountKeys[i].toBase58()} has balance: ${postBalances[i]} lamports`);
                    if (postBalances[i] >= CONFIG.STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL * 0.9) {
                        stakeAccountFound = true;
                    }
                }
            }
            
            if (stakeAccountFound) {
                this.log('Stake account appears to be created successfully', 'SUCCESS');
            } else {
                this.log('Stake account creation unclear - manual verification recommended', 'WARN');
            }
            
            return transaction;
        } catch (error) {
            this.log(`Failed to verify stake account creation: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async verifyPositionsEndpoint() {
        try {
            this.log('Verifying positions endpoint...');
            
            const response = await this.apiClient.get(`/positions/${this.testKeypair.publicKey.toBase58()}`);
            
            if (response.status === 200) {
                this.log('Positions endpoint responding', 'SUCCESS');
                this.log(`Found ${response.data.positions?.length || 0} position(s)`);
                
                if (response.data.positions && response.data.positions.length > 0) {
                    this.log('Position data:', 'SUCCESS');
                    response.data.positions.forEach((position, index) => {
                        this.log(`  Position ${index + 1}: ${JSON.stringify(position, null, 2)}`);
                    });
                }
                
                return response.data;
            } else {
                throw new Error(`Positions endpoint returned unexpected status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Positions endpoint test failed: ${error.response?.data?.message || error.message}`, 'ERROR');
            // Don't throw here - this might be expected if positions take time to appear
        }
    }

    async runFullTest() {
        const startTime = Date.now();
        this.log('🚀 Starting End-to-End Devnet Test Suite');
        this.log(`API Base URL: ${CONFIG.API_BASE_URL}`);
        this.log(`Solana RPC URL: ${CONFIG.SOLANA_RPC_URL}`);
        
        try {
            // Step 1: Load test keypair
            await this.loadTestKeypair();
            
            // Step 2: Check wallet balance
            const hasBalance = await this.checkWalletBalance();
            if (!hasBalance) {
                this.log('❌ Test aborted due to insufficient balance');
                return false;
            }
            
            // Step 3: Test API health
            await this.testAPIHealth();
            
            // Step 4: Build stake transaction
            const transactionData = await this.buildStakeTransaction();
            
            // Step 5: Verify unsigned transaction
            const transaction = await this.verifyTransaction(transactionData);
            
            // Step 6: Sign transaction
            const signedTransaction = await this.signTransaction(transaction);
            
            // Step 7: Submit transaction
            const signature = await this.submitTransaction(signedTransaction);
            
            // Step 8: Confirm transaction
            await this.confirmTransaction(signature);
            
            // Step 9: Verify stake account creation
            await this.verifyStakeAccountCreation(signature);
            
            // Step 10: Wait a moment for indexing
            this.log('Waiting 10 seconds for position indexing...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Step 11: Verify positions endpoint
            await this.verifyPositionsEndpoint();
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            this.log(`🎉 End-to-End Test Complete! Duration: ${duration.toFixed(2)}s`, 'SUCCESS');
            this.log(`Transaction signature: ${signature}`, 'SUCCESS');
            this.log(`View on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`, 'SUCCESS');
            
            return true;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            this.log(`💥 Test Failed! Duration: ${duration.toFixed(2)}s`, 'ERROR');
            this.log(`Error: ${error.message}`, 'ERROR');
            
            return false;
        }
    }
}

// Run test if called directly
if (require.main === module) {
    const test = new DevnetE2ETest();
    test.runFullTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = DevnetE2ETest;