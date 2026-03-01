# Phase Agent Staking API - Mainnet Deployment Checklist

**MISSION CRITICAL**: This deployment enables Phase to charge enterprise customers on mainnet and unlock the $10M revenue milestone.

## Pre-Deployment Requirements

### 🔐 Security Configuration
- [ ] Replace `PHASE_FEE_WALLET` with actual Phase Labs treasury wallet
- [ ] Replace `PHASE_VALIDATOR_VOTE_ACCOUNT` with actual Phase validator
- [ ] Generate production API secrets: `openssl rand -hex 32`
- [ ] Generate production JWT secret: `openssl rand -hex 32`
- [ ] Configure Helius API key for primary RPC
- [ ] Set up proper file permissions: `chmod 600 .env.production`

### 🌐 Infrastructure Setup
- [ ] Domain configuration: `api.phaselabs.io`
- [ ] SSL certificate installation and verification
- [ ] Load balancer configuration (AWS ALB/Cloudflare)
- [ ] CDN setup for API responses (optional)
- [ ] Firewall rules: Allow only HTTPS (443) and health checks

### 📊 Monitoring & Observability
- [ ] Sentry DSN configuration for error tracking
- [ ] New Relic license key for performance monitoring
- [ ] Log aggregation setup (CloudWatch/ELK stack)
- [ ] Uptime monitoring (Pingdom/UptimeRobot)
- [ ] Alert configuration for critical errors

### 💾 Data & Caching
- [ ] Redis cluster setup for session management
- [ ] PostgreSQL database for transaction logs
- [ ] Database backup and retention policies
- [ ] Connection pooling configuration

### 🔌 External Services
- [ ] Coingecko API key for price feeds
- [ ] Coinmarketcap API key for backup pricing
- [ ] Slack webhook for operational alerts
- [ ] Discord webhook for team notifications
- [ ] SendGrid API key for email alerts

## Deployment Steps

### 1. Final Configuration Review
```bash
# Review all TODO items in .env.production
grep "TODO:" .env.production

# Validate no placeholder values remain
grep -E "replace_me|YOUR_|TODO" .env.production
```

### 2. Build and Test
```bash
# Build production image
docker build -f Dockerfile.production -t phase-staking-api:mainnet .

# Run security scan (optional but recommended)
docker scan phase-staking-api:mainnet

# Test configuration locally
docker run -d --env-file .env.production -p 3000:3000 phase-staking-api:mainnet
curl http://localhost:3000/health
```

### 3. Deploy to Production
```bash
# Execute deployment script
./deploy-mainnet.sh

# Verify deployment
curl https://api.phaselabs.io/health
```

### 4. Post-Deployment Verification
- [ ] Health check returns `200 OK`
- [ ] All API endpoints respond correctly
- [ ] Rate limiting is working properly
- [ ] CORS configuration allows proper domains
- [ ] SSL certificate is valid and properly configured
- [ ] Logs are being collected properly
- [ ] Monitoring alerts are active

## Production Environment Values

### RPC Configuration
- **Primary**: Helius RPC (high performance, 1M requests/day free tier)
- **Backup**: Public Solana RPC (api.mainnet-beta.solana.com)
- **Tertiary**: ExtrNode RPC (solana-mainnet.rpc.extrnode.com)
- **Quaternary**: Ankr RPC (rpc.ankr.com/solana)

### Fee Structure
- **Rake Fee**: 10 basis points (0.1%)
- **Management Fee**: 50 basis points (0.5%)
- **Performance Fee**: 1000 basis points (10%)

### Rate Limits
- **General API**: 50 requests/minute per IP
- **Authenticated**: 200 requests/minute
- **Staking Operations**: 10 per hour per user
- **Unstaking Operations**: 5 per hour per user

## Revenue Impact

🎯 **Phase $10M Revenue Milestone**: This mainnet deployment is critical for charging enterprise customers real fees on mainnet instead of devnet.

### Before Deployment (Devnet)
- ❌ Cannot charge real fees
- ❌ Limited to demo/testing customers
- ❌ No real SOL transactions

### After Deployment (Mainnet)
- ✅ Real fee collection in SOL
- ✅ Enterprise customer onboarding
- ✅ Production-grade reliability
- ✅ $10M revenue milestone achievable

## Emergency Procedures

### Rollback Plan
```bash
# Stop current deployment
docker-compose -f docker-compose.production.yml down

# Deploy previous stable version
docker run -d --env-file .env.production -p 3000:3000 phase-staking-api:previous-stable

# Verify rollback
curl https://api.phaselabs.io/health
```

### Common Issues
1. **RPC Connection Failures**: Check Helius API key and rate limits
2. **Database Connection**: Verify PostgreSQL credentials and network access
3. **Redis Connection**: Check Redis cluster health and credentials
4. **SSL Issues**: Verify certificate validity and renewal

## Contact Information

- **DevOps Lead**: ross@phaselabs.io
- **Security Lead**: brandon@phaselabs.io
- **On-Call Rotation**: [Configure PagerDuty/Opsgenie]
- **Emergency Escalation**: [24/7 contact info]

---

**Deployment Date**: _To be filled on deployment_
**Deployed By**: _To be filled on deployment_
**Git Commit**: _To be filled by CI/CD_