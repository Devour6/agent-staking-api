# Phase Agent Staking API — Architecture

**Version:** 1.0  
**Author:** Ross (Engineering Division)  
**Date:** February 25, 2026  
**Status:** DRAFT - Awaiting Review  

## Executive Summary

The Phase Agent Staking API is a **non-custodial transaction builder service** that enables AI agents to participate in Solana staking without requiring Phase to hold private keys. This infrastructure positions Phase as the bridge between autonomous AI agents and Solana's staking ecosystem, generating revenue through transparent rake fees and product routing.

**Core Philosophy:** We build transactions, agents sign them, we never touch keys.

## System Design

### Architecture Pattern: Transaction Builder Service

```
AI Agent → Phase API → Unsigned Transaction → Agent Signs → Solana Network
                  ↓
           (Embedded Rake Fee)
```

The system follows a **stateless transaction construction pattern** where:

1. **Agents call our API** with staking parameters (wallet, amount, validator preferences)
2. **We construct unsigned transactions** containing all necessary instructions including embedded fees
3. **We return the transaction** for the agent to inspect and sign
4. **Agents sign locally** with their own private keys
5. **Transaction submitted** either by agent directly or via our relay endpoint

### Security Model: True Non-Custodial

- **Phase never stores or accesses private keys**
- **All transactions are unsigned when returned to agents**
- **Agents maintain full custody** of their wallets and stake accounts
- **Rake fees are transparent** — visible as explicit transfer instructions in the transaction
- **Agents consent by signing** — they see exactly what they're authorizing

### Reference Implementation Inspiration

MoonPay recently launched "MoonPay Agents" with similar non-custodial principles:
- One-time user verification, then autonomous agent operation
- Infrastructure layer for AI agent financial operations  
- Non-custodial wallet management with programmatic transaction execution
- Integration via CLI/API for developers

Phase Agent Staking API adapts this pattern specifically for Solana staking with Phase's validator ecosystem integration.

## Technical Implementation

### Core Solana Programs Involved

1. **Stake Program** (`Stake11111111111111111111111111111111111111`)
   - `StakeProgram.createAccount()` - Create new stake accounts
   - `StakeProgram.delegate()` - Delegate to validators  
   - `StakeProgram.deactivate()` - Begin unstaking process
   - `StakeProgram.withdraw()` - Withdraw deactivated stake

2. **SPL Stake Pool Program** (`SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy`)
   - `StakePoolProgram.depositSol()` - Mint liquid staking tokens
   - `StakePoolProgram.withdrawSol()` - Burn tokens for SOL

3. **System Program** (`11111111111111111111111111111111`)
   - `SystemProgram.transfer()` - SOL transfers for rake fees

### Transaction Construction Pattern

Each staking transaction includes **multiple instructions in a single atomic transaction**:

```typescript
const transaction = new Transaction()
  .add(createStakeAccountInstruction)     // Main staking operation
  .add(delegateInstruction)               // Delegation to validator
  .add(rakeTransferInstruction);          // Fee to Phase wallet

// Agent receives this unsigned transaction
// Agent inspects all instructions before signing
// Agent has full transparency into fees
```

This ensures **atomicity** — either all instructions succeed or all fail, preventing partial execution.

## API Endpoints

### 1. POST `/stake/build`
**Build Native Staking Transaction**

```typescript
interface NativeStakeRequest {
  agentWallet: string;           // Agent's wallet public key
  amount: number;                // SOL amount in lamports
  validatorVoteAccount?: string; // Optional: specific validator
  stakeAuthority?: string;       // Optional: custom stake authority
}

interface NativeStakeResponse {
  transaction: string;           // Base64 encoded unsigned transaction
  stakeAccount: string;          // Generated stake account public key
  estimatedApy: number;          // Expected staking APY
  activationEpoch: number;       // When stake becomes active
  feeAmount: number;             // Rake fee in lamports
  instructions: {
    type: string;
    description: string;
    accounts: string[];
  }[];
}
```

**Implementation Details:**
- Generate ephemeral stake account keypair
- Use `StakeProgram.createAccount()` with minimum rent + staking amount
- Add `StakeProgram.delegate()` to recommended Phase validator (if none specified)
- Include `SystemProgram.transfer()` for rake fee (basis points of staking amount)
- Set agent wallet as both stake and withdraw authority
- Include recent blockhash and proper fee payer designation

### 2. POST `/stake/liquid/build`
**Build Liquid Staking Transaction ($YIELD)**

```typescript
interface LiquidStakeRequest {
  agentWallet: string;          // Agent's wallet public key  
  amount: number;               // SOL amount in lamports
  slippageTolerance?: number;   // Max slippage (default: 0.5%)
}

interface LiquidStakeResponse {
  transaction: string;          // Base64 encoded unsigned transaction
  expectedTokens: number;       // Expected $YIELD tokens to receive
  exchangeRate: number;         // Current SOL:$YIELD rate
  poolApy: number;              // Expected liquid staking APY
  feeAmount: number;            // Rake fee in lamports
  instructions: {
    type: string;
    description: string;
    accounts: string[];
  }[];
}
```

**Implementation Details:**
- Use Phase's $YIELD stake pool (mint: `phaseZSfPxTDBpiVb96H4XFSD8xHeHxZre5HerehBJG`)
- Call `StakePoolProgram.depositSol()` to mint liquid staking tokens
- Include rake fee transfer instruction
- Calculate expected tokens based on current pool exchange rate
- Handle slippage protection through minimum token output validation

### 3. POST `/unstake/build`  
**Build Unstaking Transaction**

```typescript
interface UnstakeRequest {
  agentWallet: string;          // Agent's wallet public key
  stakeAccount?: string;        // For native: specific stake account
  liquidTokens?: number;        // For liquid: $YIELD amount to unstake
  type: 'native' | 'liquid';
}

interface UnstakeResponse {
  transaction: string;          // Base64 encoded unsigned transaction
  cooldownEpochs: number;       // Epochs until withdrawal available
  availableAt: string;          // Estimated availability timestamp
  feeAmount: number;            // Withdrawal fee in lamports
  immediateSOL?: number;        // For liquid: immediate SOL if available
}
```

**Implementation Details:**

**Native Unstaking:**
- Use `StakeProgram.deactivate()` to begin cooldown process
- Include fee transfer instruction  
- Calculate cooldown period (typically 2-3 epochs)

**Liquid Unstaking:**
- Use `StakePoolProgram.withdrawSol()` for immediate liquidity (if available)
- Or `StakePoolProgram.withdrawStake()` for native stake account
- Handle both instant and delayed withdrawal paths

### 4. POST `/tx/submit`
**Transaction Relay Service**

```typescript
interface TransactionSubmitRequest {
  signedTransaction: string;    // Base64 encoded signed transaction
  maxRetries?: number;          // Max submission attempts
  priorityFee?: number;         // Additional priority fee
}

interface TransactionSubmitResponse {
  signature: string;            // Transaction signature
  status: 'success' | 'failed' | 'pending';
  confirmationStatus: string;   // Solana confirmation level
  slot: number;                 // Slot number
  error?: string;               // Error message if failed
}
```

**Implementation Details:**
- Validate transaction signatures before submission
- Include priority fees for faster processing
- Implement retry logic with exponential backoff
- Monitor confirmation status and return updates
- Log all transactions for monitoring and support

### 5. GET `/stake/recommend`
**Staking Recommendations**

```typescript
interface StakeRecommendationResponse {
  native: {
    validators: {
      voteAccount: string;
      name: string;
      commission: number;
      apy: number;
      isPhaseValidator: boolean;
      health: 'excellent' | 'good' | 'fair';
    }[];
    recommendedAllocation: number; // Percentage
  };
  liquid: {
    pools: {
      name: string;
      token: string;
      mint: string;
      apy: number;
      tvl: number;
      isPhasePool: boolean;
    }[];
    featured: string;             // Phase $YIELD pool
  };
}
```

**Implementation Details:**
- **Feature Phase validators prominently** in native recommendations
- **Feature $YIELD as the default liquid option** 
- Include real-time APY calculations based on recent performance
- Pull validator health data from on-chain metrics
- Apply Phase's validator selection criteria (commission, uptime, decentralization)

### 6. GET `/positions/:wallet`
**Agent Portfolio Overview**

```typescript
interface PositionResponse {
  wallet: string;
  totalStaked: number;          // Total SOL staked across all positions
  totalValue: number;           // Current value including rewards
  totalRewards: number;         // Lifetime staking rewards earned
  native: {
    stakeAccounts: {
      address: string;
      balance: number;
      status: 'active' | 'activating' | 'deactivating';
      validator: string;
      activationEpoch: number;
    }[];
  };
  liquid: {
    positions: {
      token: string;
      balance: number;
      solValue: number;
      apy: number;
    }[];
  };
}
```

## Revenue Model

### 1. Rake Fees (Primary Revenue)

**Implementation:** Transparent fee collection via additional transfer instructions

```typescript
// Example: 10 basis points (0.1%) on 100 SOL stake
const stakeAmount = 100 * LAMPORTS_PER_SOL;        // 100 SOL
const rakeBasisPoints = 10;                        // 0.1%
const rakeAmount = (stakeAmount * rakeBasisPoints) / 10000; // 0.1 SOL

const rakeInstruction = SystemProgram.transfer({
  fromPubkey: agentWallet,
  toPubkey: PHASE_FEE_WALLET,
  lamports: rakeAmount
});

transaction.add(stakingInstruction).add(rakeInstruction);
```

**Rate Structure:**
- **Native Staking:** 5-15 basis points (0.05% - 0.15%) on stake amount
- **Liquid Staking:** 10-20 basis points (0.10% - 0.20%) on deposit amount  
- **Unstaking:** 5 basis points (0.05%) on withdrawal amount
- **Transaction Relay:** Flat fee of 0.001 SOL per submission

**Fee Transparency:**
- All fees visible as separate instructions in the transaction
- Agents see exact fee amounts before signing
- Fee amounts included in all API responses
- No hidden or surprise fees

### 2. Product Routing (Secondary Revenue)

**Strategy:** Feature Phase products as intelligent defaults while maintaining choice

- **$YIELD LST featured prominently** in liquid staking recommendations
- **Phase validators featured** in native staking validator selection
- **Superior user experience** for Phase products (faster processing, better support)
- **Volume-based incentives** for agents that route through Phase products

**Implementation:**
- Default liquid staking endpoint returns $YIELD pool first
- Native staking recommends Phase validators with "verified" badges
- Lower fees for agents using Phase products exclusively
- Priority processing for transactions using Phase infrastructure

## Security Considerations

### 1. Non-Custodial Guarantees

- **Private keys never transmitted** to Phase servers
- **Unsigned transactions only** returned to agents
- **Agent retains full control** over stake accounts and withdrawal authorities
- **Transparent fee structure** visible in all transactions

### 2. Transaction Integrity

```typescript
// Every transaction includes integrity checks
const validateTransaction = (tx: Transaction) => {
  // Verify all required instructions present
  // Validate fee amounts within acceptable limits  
  // Ensure agent wallet is fee payer and authority
  // Confirm no unexpected instruction types
  // Check recent blockhash validity
};
```

### 3. Rate Limiting and DDoS Protection

- **API key required** for production usage
- **Rate limiting** per agent wallet address
- **Transaction validation** before processing  
- **Monitoring** for unusual patterns

### 4. Agent Verification (Optional)

- **KYC/AML compliance** for high-volume agents
- **Whitelist mode** for enterprise clients
- **Audit trail** for all transactions
- **Compliance reporting** capabilities

## Performance & Scaling

### Infrastructure Requirements

**API Layer:**
- **Load balancers** for high availability
- **Auto-scaling** based on request volume  
- **Global edge deployment** for low latency
- **99.9% uptime SLA**

**Solana Integration:**
- **Multiple RPC endpoints** for redundancy
- **Priority fee management** for transaction success
- **Transaction confirmation tracking**
- **Retry logic** for failed submissions

**Database Layer:**
- **Read replicas** for agent portfolio queries
- **Real-time indexing** of stake account status
- **Historical performance data** for APY calculations
- **Analytics tracking** for fee optimization

### Expected Performance

- **API Response Time:** <200ms for transaction building
- **Transaction Throughput:** 1,000+ transactions per minute
- **Confirmation Tracking:** Real-time updates via WebSocket
- **Data Freshness:** <30 seconds for on-chain data

## Build Estimate

### Phase 1: Core Infrastructure (6-8 weeks)
- **Week 1-2:** API framework, authentication, basic transaction building
- **Week 3-4:** Native staking implementation, rake fee integration  
- **Week 5-6:** Liquid staking integration, $YIELD pool connection
- **Week 7-8:** Transaction relay service, error handling, testing

### Phase 2: Agent Experience (4-6 weeks)
- **Week 9-10:** Recommendation engine, validator scoring
- **Week 11-12:** Portfolio tracking, position management
- **Week 13-14:** Documentation, SDK development, agent examples

### Phase 3: Production Readiness (4-6 weeks)
- **Week 15-16:** Security audits, penetration testing
- **Week 17-18:** Performance optimization, load testing  
- **Week 19-20:** Monitoring, alerting, compliance features

### Total Timeline: 14-20 weeks (3.5-5 months)

### Resource Requirements

**Engineering:**
- 1 Senior Backend Engineer (API development)
- 1 Solana Engineer (transaction building, on-chain integration)
- 1 Frontend Engineer (agent SDK, documentation)
- 1 DevOps Engineer (infrastructure, monitoring)

**Infrastructure:**
- Cloud hosting (AWS/GCP): $2,000-5,000/month
- Solana RPC services: $1,000-3,000/month  
- Monitoring and analytics: $500-1,000/month

### Revenue Projections

**Conservative Estimates (6 months post-launch):**

- **100 active AI agents** using the service
- **Average 50 SOL staked per agent per month** = 5,000 SOL monthly volume
- **Average rake fee: 10 basis points** = 5 SOL monthly fee revenue
- **Monthly recurring revenue: $750** (at $150/SOL)

**Growth Scenario (12 months post-launch):**

- **1,000 active AI agents**
- **Average 100 SOL per agent per month** = 100,000 SOL monthly volume  
- **10 basis points average fee** = 100 SOL monthly fee revenue
- **Monthly recurring revenue: $15,000** (at $150/SOL)
- **Annual revenue run rate: $180,000+**

## Competitive Analysis

### Direct Competitors
- **Marinade Finance:** Liquid staking leader, but no AI agent focus
- **Jito:** MEV-enhanced staking, limited API offerings
- **Lido:** Ethereum-focused, minimal Solana presence

### Competitive Advantages
- **AI-first design:** Purpose-built for autonomous agent operations
- **Non-custodial guarantee:** Agents never surrender key control
- **Phase validator integration:** Direct connection to Phase's infrastructure
- **Transparent fee model:** No hidden costs or complex pricing
- **Developer experience:** APIs designed for programmatic usage

### Market Opportunity
- **Agent economy growth:** Explosive growth in autonomous AI agents
- **DeFi staking market:** $50B+ total value locked in staking
- **Solana ecosystem:** Fastest growing blockchain for agent deployment
- **Infrastructure gap:** No existing AI-focused staking infrastructure

## Next Steps

### Immediate Actions (Post-Review)
1. **Technical specification review** with George and Brandon
2. **Revenue model validation** with Phase business development
3. **Competitive pricing research** in the staking API market
4. **Partnership discussions** with AI agent frameworks (LangChain, AutoGPT)

### Pre-Development
1. **Security architecture review** with external auditors
2. **Legal compliance review** for multi-jurisdictional deployment
3. **Integration planning** with Phase's existing validator infrastructure
4. **Agent SDK design** for popular development frameworks

### Success Metrics
- **API adoption rate:** Number of AI agents onboarded monthly
- **Transaction volume:** Total SOL processed through the API
- **Fee revenue:** Monthly recurring revenue from rake fees
- **Agent retention:** Percentage of agents using service after 6 months
- **Phase product adoption:** Percentage routing through $YIELD and Phase validators

---

**This architecture represents Ross's methodical approach to understanding the full system before implementation. Every technical decision is backed by research, every revenue mechanism is transparent, and every security consideration prioritizes agent autonomy while enabling Phase's growth.**

**Next step: Review and approval before any code is written.**