#!/usr/bin/env node
/**
 * Generate a test keypair for devnet testing
 * This script creates a new Solana keypair and saves it to a JSON file
 */

const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function generateDevnetKeypair() {
    try {
        // Generate new keypair
        const keypair = Keypair.generate();
        
        // Get the secret key as array (compatible with Solana CLI format)
        const secretKeyArray = Array.from(keypair.secretKey);
        
        // Create keypair file path
        const keypairPath = path.join(__dirname, '..', 'devnet-test-keypair.json');
        
        // Write keypair to file
        fs.writeFileSync(keypairPath, JSON.stringify(secretKeyArray, null, 2));
        
        console.log('✅ Devnet test keypair generated successfully');
        console.log(`📁 Keypair saved to: ${keypairPath}`);
        console.log(`🔑 Public key: ${keypair.publicKey.toBase58()}`);
        console.log('');
        console.log('🚰 To request devnet SOL airdrop:');
        console.log(`   solana airdrop 2 ${keypair.publicKey.toBase58()} --url devnet`);
        console.log('');
        console.log('🌐 Or visit: https://faucet.solana.com/');
        
        return {
            publicKey: keypair.publicKey.toBase58(),
            keypairPath: keypairPath
        };
        
    } catch (error) {
        console.error('❌ Error generating devnet keypair:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    generateDevnetKeypair();
}

module.exports = { generateDevnetKeypair };