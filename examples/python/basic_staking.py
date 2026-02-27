#!/usr/bin/env python3
"""
Phase Agent Staking API - Python Example
Basic native SOL staking using the Phase API
"""

import os
import json
import base64
import asyncio
from typing import Optional, Dict, Any

import aiohttp
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solana.keypair import Keypair
from solana.transaction import Transaction
from solana.publickey import PublicKey


class PhaseStakingClient:
    """Python client for Phase Agent Staking API"""
    
    def __init__(self, api_key: str, base_url: str = "https://staking-api.phase.com"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def build_stake_transaction(
        self, 
        agent_wallet: PublicKey, 
        stake_amount: float, 
        validator_vote_account: Optional[PublicKey] = None
    ) -> Dict[str, Any]:
        """
        Build an unsigned staking transaction
        
        Args:
            agent_wallet: Agent's Solana wallet public key
            stake_amount: Amount of SOL to stake (minimum 0.01)
            validator_vote_account: Optional validator to stake to
            
        Returns:
            Transaction data from the API
        """
        if not self.session:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        endpoint = f"{self.base_url}/stake/build"
        
        payload = {
            "agentWallet": str(agent_wallet),
            "stakeAmount": stake_amount,
        }
        
        if validator_vote_account:
            payload["validatorVoteAccount"] = str(validator_vote_account)
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        
        async with self.session.post(endpoint, json=payload, headers=headers) as response:
            result = await response.json()
            
            if not response.ok:
                error_msg = result.get("error", {}).get("message", "Unknown API error")
                raise Exception(f"API Error: {error_msg}")
            
            return result["data"]
    
    async def execute_staking(
        self,
        solana_client: AsyncClient,
        agent_keypair: Keypair,
        stake_amount: float,
        validator_vote_account: Optional[PublicKey] = None
    ) -> Dict[str, Any]:
        """
        Execute complete staking workflow
        
        Args:
            solana_client: Async Solana RPC client
            agent_keypair: Agent's keypair for signing
            stake_amount: Amount of SOL to stake
            validator_vote_account: Optional validator selection
            
        Returns:
            Staking result with transaction signature and metadata
        """
        print(f"🚀 Building stake transaction for {stake_amount} SOL...")
        
        try:
            # Step 1: Build the unsigned transaction
            transaction_data = await self.build_stake_transaction(
                agent_keypair.public_key,
                stake_amount,
                validator_vote_account
            )
            
            print("✅ Transaction built successfully")
            print(f"📝 Stake Account: {transaction_data['metadata']['stakeAccount']}")
            print(f"🎯 Validator: {transaction_data['metadata']['validator']}")
            print(f"📈 Estimated APY: {transaction_data['metadata']['estimatedApy']}%")
            
            fees = transaction_data['metadata']['fees']
            total_fees = fees['transactionFee'] + fees['rakeFee']
            print(f"💰 Total Fees: {total_fees} lamports")
            
            # Step 2: Reconstruct the transaction
            serialized_tx = transaction_data['transaction']['serialized']
            transaction_bytes = base64.b64decode(serialized_tx)
            transaction = Transaction.deserialize(transaction_bytes)
            
            # Step 3: Sign the transaction
            transaction.sign(agent_keypair)
            
            print("✍️ Transaction signed, sending to network...")
            
            # Step 4: Send the transaction
            response = await solana_client.send_transaction(transaction)
            signature = response['result']
            
            # Step 5: Confirm the transaction
            await solana_client.confirm_transaction(signature)
            
            print("🎉 Staking successful!")
            print(f"🔗 Transaction: https://explorer.solana.com/tx/{signature}")
            print(f"📊 Stake Account: https://explorer.solana.com/address/{transaction_data['metadata']['stakeAccount']}")
            
            return {
                "signature": signature,
                "stake_account": transaction_data['metadata']['stakeAccount'],
                "validator": transaction_data['metadata']['validator'],
                "estimated_apy": transaction_data['metadata']['estimatedApy'],
            }
            
        except Exception as error:
            print(f"❌ Staking failed: {error}")
            raise
    
    async def check_health(self) -> bool:
        """Check API health status"""
        if not self.session:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        async with self.session.get(f"{self.base_url}/health") as response:
            result = await response.json()
            
            if response.ok and result.get("success") and result.get("data", {}).get("status") == "healthy":
                latency = result["data"]["checks"]["solana"]["latency"]
                print(f"✅ Phase Staking API is healthy (latency: {latency}ms)")
                return True
            else:
                print("❌ Phase Staking API is unhealthy")
                return False


async def main():
    """Example usage of the Phase Staking Client"""
    
    # Configuration from environment
    api_key = os.getenv("PHASE_API_KEY")
    rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
    agent_private_key = os.getenv("AGENT_PRIVATE_KEY")  # Base58 encoded
    
    if not api_key or not agent_private_key:
        print("❌ Please set PHASE_API_KEY and AGENT_PRIVATE_KEY environment variables")
        return
    
    try:
        # Initialize clients
        async with PhaseStakingClient(api_key) as phase_client:
            solana_client = AsyncClient(rpc_url, commitment=Confirmed)
            
            # Load agent keypair
            # Note: In production, use secure key management
            agent_keypair = Keypair.from_secret_key(base64.b64decode(agent_private_key))
            
            # Check API health
            await phase_client.check_health()
            
            # Check agent balance
            balance_response = await solana_client.get_balance(agent_keypair.public_key)
            balance_lamports = balance_response['result']['value']
            balance_sol = balance_lamports / 1_000_000_000
            
            print(f"💰 Agent Balance: {balance_sol} SOL")
            
            if balance_sol < 1.1:  # Need at least 1 SOL + fees
                print(f"❌ Insufficient balance. Need at least 1.1 SOL (have {balance_sol} SOL)")
                return
            
            # Execute staking
            stake_amount = 1.0  # Stake 1 SOL
            result = await phase_client.execute_staking(
                solana_client,
                agent_keypair,
                stake_amount
                # Optional: specify validator
                # PublicKey("8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm")
            )
            
            print("🏁 Staking Complete:")
            print(json.dumps(result, indent=2))
            
    except Exception as error:
        print(f"❌ Error: {error}")
        raise
    finally:
        await solana_client.close()


if __name__ == "__main__":
    asyncio.run(main())

"""
Usage Instructions:

1. Install dependencies:
   pip install aiohttp solana

2. Set environment variables:
   export PHASE_API_KEY="your-api-key-here"
   export AGENT_PRIVATE_KEY="base64-encoded-private-key"
   export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"  # Optional

3. Run:
   python basic_staking.py

Safety Notes:
- Never hardcode private keys in source code
- Use environment variables or secure key management systems
- Always verify transaction details before signing
- Test on devnet first with small amounts
- Monitor your stake accounts after activation
- Consider using hardware wallets for production

Example environment setup:
# Create .env file (don't commit to git!)
PHASE_API_KEY=your_api_key_here
AGENT_PRIVATE_KEY=your_base64_private_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
"""