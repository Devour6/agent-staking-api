#!/usr/bin/env node
/**
 * Devnet Setup Script
 * Sets up the devnet environment for testing the Agent Staking API
 */

const { Connection, LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    KEYPAIR_PATH: process.env.TEST_KEYPAIR_PATH || './devnet-test-keypair.json',
    FAUCET_URL: 'https://faucet.solana.com',
    TARGET_SOL_BALANCE: 2.0,
};

class DevnetSetup {
    constructor() {
        this.connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed');
        this.testKeypair = null;
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
        console.log(`${emoji} [${timestamp}] ${message}`);
    }

    async loadOrCreateKeypair() {
        try {
            const keypairPath = path.resolve(CONFIG.KEYPAIR_PATH);
            
            if (!fs.existsSync(keypairPath)) {
                this.log('Test keypair not found, generating new one...');
                const { generateDevnetKeypair } = require('./generate-devnet-keypair');
                await generateDevnetKeypair();
            }

            const secretKeyArray = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
            this.testKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
            
            this.log(`Test keypair loaded: ${this.testKeypair.publicKey.toBase58()}`);
            return this.testKeypair;
        } catch (error) {
            this.log(`Failed to load test keypair: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async checkSolanaConnection() {
        try {
            this.log('Testing Solana devnet connection...');
            const version = await this.connection.getVersion();
            this.log(`Connected to Solana devnet - version: ${version['solana-core']}`, 'SUCCESS');
            
            // Try to get a recent blockhash as a health check
            const { blockhash } = await this.connection.getLatestBlockhash();
            if (blockhash) {
                this.log('Solana devnet health check passed (blockhash received)', 'SUCCESS');
            }
            
            return true;
        } catch (error) {
            this.log(`Failed to connect to Solana devnet: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async checkBalance() {
        try {
            const balance = await this.connection.getBalance(this.testKeypair.publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            
            this.log(`Current wallet balance: ${balanceSOL.toFixed(4)} SOL`);
            
            if (balanceSOL >= CONFIG.TARGET_SOL_BALANCE) {
                this.log('Wallet has sufficient balance for testing', 'SUCCESS');
                return true;
            } else {
                this.log(`Need ${(CONFIG.TARGET_SOL_BALANCE - balanceSOL).toFixed(4)} more SOL for testing`, 'WARN');
                return false;
            }
        } catch (error) {
            this.log(`Failed to check wallet balance: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async requestAirdrop() {
        try {
            this.log('Requesting SOL airdrop from devnet faucet...');
            
            // Use Solana's built-in airdrop first
            const airdropAmount = LAMPORTS_PER_SOL; // 1 SOL per request
            const signature = await this.connection.requestAirdrop(
                this.testKeypair.publicKey,
                airdropAmount
            );
            
            this.log(`Airdrop transaction submitted: ${signature}`);
            
            // Wait for confirmation
            await this.connection.confirmTransaction(signature, 'confirmed');
            this.log('Airdrop confirmed!', 'SUCCESS');
            
            // Check new balance
            const balance = await this.connection.getBalance(this.testKeypair.publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            this.log(`New wallet balance: ${balanceSOL.toFixed(4)} SOL`, 'SUCCESS');
            
            return true;
        } catch (error) {
            this.log(`Airdrop failed: ${error.message}`, 'ERROR');
            
            // Try alternative faucet methods
            await this.tryAlternativeFaucet();
            return false;
        }
    }

    async tryAlternativeFaucet() {
        try {
            this.log('Trying alternative faucet methods...');
            
            // Try HTTP faucet
            const response = await axios.post('https://faucet.solana.com/api/faucet/airdrop', {
                account: this.testKeypair.publicKey.toBase58(),
                amount: LAMPORTS_PER_SOL
            }, {
                timeout: 10000
            });
            
            if (response.data && response.data.signature) {
                this.log(`Alternative faucet successful: ${response.data.signature}`, 'SUCCESS');
            }
        } catch (error) {
            this.log('Alternative faucet also failed. Manual funding may be required.', 'WARN');
            this.log('Visit https://faucet.solana.com/ to manually request devnet SOL', 'WARN');
        }
    }

    async verifyValidatorConnection() {
        try {
            this.log('Verifying connection to recommended validators...');
            
            // Check if we can fetch validator info
            const validators = await this.connection.getValidatorInfo();
            this.log(`Found ${validators.length} validators on devnet`, 'SUCCESS');
            
            // Try to get vote accounts
            const voteAccounts = await this.connection.getVoteAccounts();
            this.log(`Found ${voteAccounts.current.length} active vote accounts`, 'SUCCESS');
            
            return true;
        } catch (error) {
            this.log(`Validator connection check failed: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testApiConnection() {
        try {
            const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
            this.log(`Testing API connection to ${apiUrl}...`);
            
            const response = await axios.get(`${apiUrl}/health`, {
                timeout: 5000
            });
            
            if (response.status === 200) {
                this.log('API health check passed', 'SUCCESS');
                this.log(`API Response: ${JSON.stringify(response.data)}`);
                return true;
            } else {
                this.log(`API health check failed with status: ${response.status}`, 'WARN');
                return false;
            }
        } catch (error) {
            this.log(`API connection failed: ${error.message}`, 'WARN');
            this.log('Make sure the API server is running with: npm run dev', 'WARN');
            return false;
        }
    }

    async setupDevnetEnvironment() {
        const startTime = Date.now();
        this.log('🚀 Starting devnet environment setup');
        
        try {
            // Step 1: Test Solana connection
            await this.checkSolanaConnection();
            
            // Step 2: Load or create test keypair
            await this.loadOrCreateKeypair();
            
            // Step 3: Check current balance
            const hasBalance = await this.checkBalance();
            
            // Step 4: Request airdrop if needed
            if (!hasBalance) {
                await this.requestAirdrop();
                
                // Recheck balance after airdrop
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for settlement
                await this.checkBalance();
            }
            
            // Step 5: Verify validator connectivity
            await this.verifyValidatorConnection();
            
            // Step 6: Test API connection (optional)
            await this.testApiConnection();
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            this.log(`🎉 Devnet setup completed successfully in ${duration.toFixed(2)}s`, 'SUCCESS');
            this.log('Environment is ready for testing!', 'SUCCESS');
            this.log('');
            this.log('Next steps:');
            this.log('1. Start the API: npm run dev');
            this.log('2. Run E2E tests: node scripts/devnet-e2e-test.js');
            this.log('3. Or use Docker: docker-compose -f docker-compose.devnet.yml up');
            
            return true;
            
        } catch (error) {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            this.log(`💥 Setup failed after ${duration.toFixed(2)}s`, 'ERROR');
            this.log(`Error: ${error.message}`, 'ERROR');
            
            return false;
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new DevnetSetup();
    setup.setupDevnetEnvironment()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = DevnetSetup;