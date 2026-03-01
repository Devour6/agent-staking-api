# Agent Staking API - Mainnet Production Deployment Guide

This guide provides step-by-step instructions for deploying the Agent Staking API to a production mainnet environment.

## 🔒 Security Notice

**This deployment handles REAL MONEY on Solana mainnet. Security is paramount.**

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 22.04 LTS or CentOS 8+ (recommended)
- **CPU**: 2+ cores
- **Memory**: 4GB RAM minimum, 8GB recommended  
- **Storage**: 20GB available disk space
- **Network**: Static IP address, open ports 80, 443

### Required Software

- **Docker**: Version 20.10+ 
- **Docker Compose**: Version 2.0+
- **Git**: For repository access
- **Domain & SSL**: Valid domain name and SSL certificate

### Network & Infrastructure

- **Domain Name**: Configured to point to your server IP
- **SSL Certificate**: Valid SSL certificate (Let's Encrypt, commercial CA)
- **Firewall**: Properly configured (see Security section)
- **Backup Strategy**: Automated backup system in place

### Solana Prerequisites  

- **RPC Endpoint**: High-performance Solana RPC endpoint
  - Default: `https://api.mainnet-beta.solana.com` 
  - Recommended: Alchemy, QuickNode, or dedicated RPC node
- **Rate Limits**: Ensure RPC provider allows production traffic volume

## 📋 Environment Variables Reference

All production configuration is managed via `.env.mainnet`. Critical variables that **MUST** be changed:

### 🚨 SECURITY CRITICAL - Must Change Before Deployment

```bash
# Phase fee wallet (SET BY BRANDON ONLY)
PHASE_FEE_WALLET=CHANGE_ME_BRANDON_WILL_SET_THIS

# API authentication (GENERATE STRONG SECRET)  
API_KEY_SECRET=CHANGE_ME_GENERATE_STRONG_SECRET_KEY_FOR_PRODUCTION

# Redis password (GENERATE SECURE PASSWORD)
REDIS_PASSWORD=CHANGE_ME_SECURE_REDIS_PASSWORD

# Grafana admin password (SECURE PASSWORD)
GF_SECURITY_ADMIN_PASSWORD=CHANGE_ME_SECURE_GRAFANA_PASSWORD
```

### Production Configuration

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# Solana Mainnet
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CLUSTER=mainnet-beta

# Security & Rate Limiting  
CORS_ORIGIN=https://your-production-domain.com,https://app.phaselabs.io
RATE_LIMIT_MAX_REQUESTS=100
TRUST_PROXY=true

# SSL Paths
SSL_CERT_PATH=/etc/ssl/certs/fullchain.pem
SSL_KEY_PATH=/etc/ssl/private/privkey.pem
```

## 🚀 Step-by-Step Deployment

### Step 1: Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply Docker group changes
sudo reboot
```

### Step 2: Repository Setup

```bash
# Clone the repository
git clone https://github.com/Devour6/agent-staking-api.git
cd agent-staking-api

# Switch to mainnet deployment branch
git checkout feature/mainnet-deployment

# Create required directories
sudo mkdir -p /etc/ssl/certs /etc/ssl/private
sudo mkdir -p logs ssl
```

### Step 3: SSL Certificate Installation

**Option A: Let's Encrypt (Recommended)**
```bash
# Install certbot
sudo apt install certbot

# Get certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to project directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/
sudo chown $USER:$USER ./ssl/*.pem
```

**Option B: Commercial Certificate**
```bash
# Copy your commercial certificates
cp /path/to/your/fullchain.pem ./ssl/
cp /path/to/your/privkey.pem ./ssl/
chmod 600 ./ssl/*.pem
```

### Step 4: Environment Configuration

```bash
# Copy mainnet environment template
cp .env.mainnet .env.mainnet.local

# Edit configuration (CRITICAL - see Security Checklist below)
nano .env.mainnet.local
```

**Required Changes:**
1. Set `PHASE_FEE_WALLET` to Brandon's production wallet
2. Generate and set secure `API_KEY_SECRET` 
3. Generate and set secure `REDIS_PASSWORD`
4. Update `CORS_ORIGIN` to your production domain
5. Set proper `SSL_CERT_PATH` and `SSL_KEY_PATH`

### Step 5: Pre-deployment Validation

```bash
# Validate Docker Compose configuration
docker-compose -f docker-compose.mainnet.yml config

# Test environment variables
source .env.mainnet.local
echo "Fee wallet: $PHASE_FEE_WALLET"
echo "API secret length: ${#API_KEY_SECRET}"
```

### Step 6: Deployment Execution

```bash
# Run the deployment script
./scripts/deploy-mainnet.sh

# For dry run first (recommended)
./scripts/deploy-mainnet.sh --dry-run
```

The deployment script will:
- ✅ Run pre-flight checks
- ✅ Create backup of existing deployment  
- ✅ Build and deploy Docker containers
- ✅ Perform health checks
- ✅ Verify all services are operational

### Step 7: Post-Deployment Verification

```bash
# Check service status
docker-compose -f docker-compose.mainnet.yml ps

# View logs
docker-compose -f docker-compose.mainnet.yml logs -f api

# Test API health endpoint
curl -f https://your-domain.com/health

# Test API functionality  
curl -X POST https://your-domain.com/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"walletAddress":"test"}'
```

## 📊 Monitoring Setup

### Accessing Monitoring Dashboards

- **Grafana**: https://your-domain.com:3001 (admin/YOUR_GRAFANA_PASSWORD)
- **Prometheus**: http://your-server-ip:9090 (internal only)

### Key Metrics to Monitor

1. **API Performance**
   - Request rate and latency
   - Error rates (4xx, 5xx)
   - Active connections

2. **System Resources**  
   - CPU and memory usage
   - Disk space and I/O
   - Network throughput

3. **Solana Integration**
   - RPC call success rate
   - Transaction confirmation times
   - Staking operation success rate

4. **Security Metrics**
   - Rate limit triggers
   - Authentication failures
   - Suspicious request patterns

### Setting Up Alerts

```bash
# Configure alert rules (customize monitoring/alerts.yml)
# Set up notification channels (email, Slack, PagerDuty)
# Test alert delivery
```

## 🔒 Production Security Checklist

### ✅ Before Going Live - MANDATORY

- [ ] **API Keys Rotated**: All dev/default API keys changed to production-grade secrets
- [ ] **CORS Origins Locked**: `CORS_ORIGIN` set to production domains only  
- [ ] **Rate Limits Configured**: `RATE_LIMIT_MAX_REQUESTS` set to appropriate production level (100/min recommended)
- [ ] **Logging Level Set**: `LOG_LEVEL=warn` (no debug logs in production)
- [ ] **SSL/TLS Configured**: Valid SSL certificate installed and HTTPS enforced
- [ ] **Phase Fee Wallet Set**: Brandon has provided production fee wallet address
- [ ] **RPC Endpoint Verified**: High-performance RPC endpoint configured with sufficient rate limits
- [ ] **Firewall Configured**: Only required ports open (80, 443, SSH)
- [ ] **Monitoring Active**: Grafana dashboards accessible and alerts configured
- [ ] **Backup Strategy**: Automated backups of Redis data and configuration

### Network Security

```bash
# Configure UFW firewall (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Disable root SSH access
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### Application Security

1. **Environment Isolation**: Production environment completely isolated from dev/staging
2. **Secret Management**: All secrets stored securely, not in version control
3. **Access Control**: Principle of least privilege for all system access
4. **Audit Logging**: All administrative actions logged
5. **Regular Updates**: Automated security updates enabled

### Runtime Security

- **Container Security**: Containers run as non-root users
- **Network Segmentation**: Internal Docker network for service communication
- **Resource Limits**: CPU and memory limits set to prevent resource exhaustion
- **Health Monitoring**: Automated health checks and restart policies

## 🔧 Troubleshooting

### Common Issues

**1. SSL Certificate Issues**
```bash
# Check certificate validity
openssl x509 -in ssl/fullchain.pem -text -noout

# Test SSL configuration
curl -I https://your-domain.com/health
```

**2. API Not Responding**
```bash
# Check container status
docker-compose -f docker-compose.mainnet.yml ps

# View API logs
docker-compose -f docker-compose.mainnet.yml logs api

# Check internal connectivity
docker-compose -f docker-compose.mainnet.yml exec api curl localhost:3000/health
```

**3. Redis Connection Issues**
```bash
# Test Redis connectivity
docker-compose -f docker-compose.mainnet.yml exec redis redis-cli ping

# Check Redis logs
docker-compose -f docker-compose.mainnet.yml logs redis
```

**4. RPC Connection Issues**
```bash
# Test RPC endpoint
curl -X POST ${SOLANA_RPC_URL} \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

### Performance Optimization

**High Load Scenarios:**
```bash
# Scale API containers
docker-compose -f docker-compose.mainnet.yml up -d --scale api=3

# Optimize Redis memory
docker-compose -f docker-compose.mainnet.yml exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Database Tuning:**
- Monitor Redis memory usage
- Implement key expiration policies  
- Consider Redis clustering for high throughput

## 🔄 Maintenance Procedures

### Regular Maintenance Tasks

**Weekly:**
- Review monitoring dashboards
- Check system resource usage
- Verify SSL certificate expiry dates
- Review access logs for anomalies

**Monthly:**
- Update system packages
- Rotate log files
- Review and test backup procedures
- Performance optimization review

**Quarterly:**  
- Security audit and penetration testing
- Disaster recovery drill
- Dependencies update (with testing)
- Review and update monitoring thresholds

### Backup Procedures

```bash
# Manual backup
./scripts/deploy-mainnet.sh --backup-only

# Automated backup script (add to cron)
0 2 * * * /path/to/agent-staking-api/scripts/backup.sh
```

### Update Procedures

```bash
# 1. Create backup
./scripts/deploy-mainnet.sh --backup-only

# 2. Test in staging environment first

# 3. Deploy to production
git pull origin main
./scripts/deploy-mainnet.sh

# 4. Verify deployment
curl https://your-domain.com/health
```

### Rollback Procedures

```bash
# Emergency rollback
./scripts/deploy-mainnet.sh --rollback

# Manual rollback if script fails
docker-compose -f docker-compose.mainnet.yml down
docker-compose -f backups/latest/docker-compose.yml.backup up -d
```

## 📞 Support & Emergency Contacts

### Emergency Response

**Production Issues (P0/P1):**
1. Check monitoring dashboards
2. Review container logs
3. Execute rollback if necessary
4. Contact development team

**Security Incidents:**
1. Isolate affected systems
2. Preserve logs for analysis
3. Implement immediate mitigations
4. Escalate to security team

### Team Contacts

- **Development Team**: [GitHub Issues](https://github.com/Devour6/agent-staking-api/issues)
- **Operations**: Ross (Engineering)
- **Business Owner**: Brandon (Phase Labs)

---

## 📄 Deployment Checklist

Print this checklist and verify each item during deployment:

### Pre-Deployment
- [ ] Server meets minimum requirements
- [ ] Domain name configured with correct DNS
- [ ] SSL certificate obtained and installed
- [ ] `.env.mainnet` properly configured
- [ ] All placeholder values replaced with production values
- [ ] Firewall rules configured
- [ ] Monitoring infrastructure ready

### Deployment
- [ ] Pre-flight checks pass
- [ ] Backup created successfully  
- [ ] Docker images built without errors
- [ ] All containers start successfully
- [ ] Health checks pass
- [ ] SSL termination working
- [ ] API endpoints responding correctly

### Post-Deployment
- [ ] Monitoring dashboards accessible
- [ ] Alerts configured and tested  
- [ ] Performance baseline established
- [ ] Security scan completed
- [ ] Documentation updated
- [ ] Team notified of successful deployment

**Deployment completed by**: _________________  
**Date**: _________________  
**Version**: _________________

---

*This deployment guide is maintained by the Phase Labs engineering team. For updates or questions, please refer to the GitHub repository.*