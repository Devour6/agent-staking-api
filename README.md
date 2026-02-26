# Phase Agent Staking API

**Version:** 1.0.0 (Phase 1)  
**Status:** Core Infrastructure Complete  

A non-custodial transaction builder service that enables AI agents to participate in Solana staking without requiring Phase to hold private keys. This infrastructure positions Phase as the bridge between autonomous AI agents and Solana's staking ecosystem.

## 🎯 Core Philosophy

> **We build transactions, agents sign them, we never touch keys.**

- **Non-Custodial**: Phase never stores or accesses private keys
- **Transparent Fees**: All rake fees visible as explicit transfer instructions
- **Agent Autonomy**: Agents maintain full custody and consent by signing
- **Performance First**: <200ms transaction building with 99.9% uptime target

## 🏗️ Phase 1 Features (Current)

✅ **Core Infrastructure**
- TypeScript + Express API framework
- API key authentication & rate limiting
- Comprehensive error handling & logging
- Health monitoring & system status

✅ **Native Staking Transaction Builder**
- POST `/stake/build` - Build unsigned staking transactions
- Ephemeral stake account generation
- Transparent rake fee integration (10 basis points default)
- Phase validator recommendations

✅ **Security & Performance**
- Rate limiting per wallet address (10 req/min)
- Request validation with Joi schemas
- Blockhash management with caching
- Error tracking and monitoring

🚧 **Phase 2 Roadmap** (Weeks 6-8)
- Liquid staking with $YIELD integration
- Unstaking transaction builder
- Portfolio tracking & recommendations
- Agent SDK & documentation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Solana RPC endpoint access

### Installation

```bash
# Clone the repository
git clone https://github.com/Devour6/agent-staking-api.git
cd agent-staking-api

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

Configure your `.env` file:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Solana Configuration  
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CLUSTER=mainnet-beta

# Phase Configuration
PHASE_FEE_WALLET=Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D
PHASE_VALIDATOR_VOTE_ACCOUNT=8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm
RAKE_FEE_BASIS_POINTS=10

# Authentication
API_KEY_SECRET=your-super-secret-key-change-this-in-production
```

### Running the API

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start

# Run tests
npm test

# Run tests with coverage
npm run test -- --coverage
```

The API will be available at `http://localhost:3000`

## 📖 API Usage

### Authentication

All endpoints (except health checks) require API key authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     http://localhost:3000/stake/build
```

### Core Endpoint: Build Native Staking Transaction

**POST** `/stake/build`

Build an unsigned native staking transaction with transparent rake fees.

```bash
curl -X POST http://localhost:3000/stake/build \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "amount": 1000000000,
    "validatorVoteAccount": "8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDBRcZuQ...",
    "stakeAccount": "GrDMwTLmQ2s1yAoBsKRHEhCEJvs1kBpJJyBB...", 
    "estimatedApy": 7.2,
    "activationEpoch": 675,
    "feeAmount": 1000000,
    "instructions": [
      {
        "type": "CreateStakeAccount",
        "description": "Create stake account with 1.0 SOL",
        "accounts": ["7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"]
      },
      {
        "type": "DelegateStake", 
        "description": "Delegate to validator 8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm",
        "accounts": ["GrDMwTLmQ2s1yAoBsKRHEhCEJvs1kBpJJyBB...", "8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm"]
      },
      {
        "type": "RakeFeeTransfer",
        "description": "Phase fee: 0.001 SOL (0.1%)",
        "accounts": ["7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D"]
      }
    ]
  },
  "timestamp": "2026-02-25T17:51:00Z",
  "requestId": "abc123def456"
}
```

### Agent Integration Example

```typescript
// Example agent integration
import { Connection, Transaction, Keypair } from '@solana/web3.js';

async function stakeWithPhase(agentKeypair: Keypair, stakeAmountSOL: number) {
  // 1. Build transaction via Phase API
  const response = await fetch('https://api.phase.com/stake/build', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentWallet: agentKeypair.publicKey.toString(),
      amount: stakeAmountSOL * 1e9, // Convert SOL to lamports
    }),
  });
  
  const { data } = await response.json();
  
  // 2. Agent inspects transaction and fees
  console.log('Transaction fee:', data.feeAmount / 1e9, 'SOL');
  console.log('Instructions:', data.instructions);
  
  // 3. Agent signs transaction locally (maintains full custody)
  const transaction = Transaction.from(Buffer.from(data.transaction, 'base64'));
  transaction.sign(agentKeypair);
  
  // 4. Submit signed transaction
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const signature = await connection.sendTransaction(transaction);
  
  return signature;
}
```

## 🔍 Health Monitoring

### Health Check Endpoints

**GET** `/health` - Comprehensive health status
**GET** `/health/live` - Simple liveness check  
**GET** `/health/ready` - Readiness verification

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-25T17:51:00Z", 
    "version": "1.0.0",
    "environment": "production",
    "checks": {
      "solana": {
        "healthy": true,
        "latency": 45,
        "cluster": "mainnet-beta"
      },
      "api": {
        "healthy": true,
        "uptime": 3600,
        "memory": {
          "used": 67108864,
          "total": 134217728,
          "percentage": 50
        }
      },
      "config": {
        "healthy": true,
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "validatorConfigured": true,
        "feeWalletConfigured": true
      }
    }
  }
}
```

## 📊 Performance Targets

- **Response Time**: <200ms for transaction building
- **Throughput**: 1,000+ transactions per minute  
- **Uptime**: 99.9% availability
- **Rate Limits**: 10 requests per minute per wallet

## 🔐 Security Features

### Non-Custodial Architecture
- Private keys never transmitted to Phase servers
- All transactions returned unsigned
- Agent retains full control over stake accounts
- Transparent fee structure in every transaction

### API Security
- API key authentication required
- Rate limiting per agent wallet
- Request validation and sanitization  
- Comprehensive error handling
- Security headers with Helmet.js

### DDoS Protection
- Rate limiting by wallet address
- Request size limits
- Input validation
- Monitoring and alerting

## 🏛️ Architecture

### Transaction Building Pattern

```
AI Agent → Phase API → Unsigned Transaction → Agent Signs → Solana Network
                  ↓
           (Embedded Rake Fee)
```

### Key Components

- **Transaction Service**: Builds Solana transactions with proper instructions
- **Solana Service**: Manages RPC connections and blockhash caching  
- **Auth Middleware**: API key validation and rate limiting
- **Validation Layer**: Request/response validation with Joi schemas
- **Error Handling**: Comprehensive error tracking and user-friendly responses

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file  
npm test -- stake.test.ts

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm run test:watch
```

Test coverage includes:
- ✅ API endpoint functionality
- ✅ Authentication & authorization
- ✅ Input validation  
- ✅ Rate limiting
- ✅ Error handling
- ✅ Health checks

## 📚 API Documentation

Visit `/api/docs` for interactive API documentation or `/api/docs/openapi` for OpenAPI specification.

## 🚧 Roadmap

### Phase 2 (Weeks 6-8)
- **Liquid Staking**: $YIELD token integration
- **Unstaking**: Native and liquid unstaking transactions  
- **Recommendations**: Intelligent validator and pool selection
- **Portfolio Tracking**: Agent position monitoring
- **SDK Development**: Client libraries for popular frameworks

### Phase 3 (Weeks 9-10)  
- **Security Hardening**: Penetration testing & audits
- **Performance Optimization**: Load testing & scaling
- **Advanced Monitoring**: APM integration & alerting
- **Compliance Features**: KYC/AML for enterprise clients

## 🔧 Development

### Project Structure
```
src/
├── controllers/     # Request handlers
├── middleware/      # Auth, validation, rate limiting
├── services/        # Business logic (Solana, config, etc)
├── types/          # TypeScript type definitions  
├── routes/         # Express route definitions
├── utils/          # Utility functions
└── app.ts          # Express app configuration

__tests__/          # Test suites
├── controllers/    # Controller tests
├── middleware/     # Middleware tests  
└── services/       # Service tests
```

### Key Scripts
- `npm run dev` - Development mode with hot reload
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Code linting
- `npm run lint:fix` - Auto-fix linting issues

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality  
5. Ensure all tests pass
6. Submit a pull request

## 🆘 Support

- **Documentation**: `/api/docs`
- **Health Status**: `/health`
- **Issues**: GitHub Issues
- **Security**: security@phase.com

---

**Phase Agent Staking API v1.0.0** - Built with ⚡ for AI agents by Phase Labs