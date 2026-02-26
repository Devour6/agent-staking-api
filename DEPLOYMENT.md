# Phase Agent Staking API - Deployment Guide

This guide covers deploying the Phase Agent Staking API in various environments from development to production.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   API Gateway   │    │   Monitoring    │
│    (nginx)      │────│  (rate limits)  │────│  (Prometheus)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Server    │    │   API Server    │    │   Grafana       │
│   (Node.js)     │    │   (Node.js)     │    │  (Dashboards)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
                    │
                    ▼
         ┌─────────────────┐    ┌─────────────────┐
         │  Solana Network │    │   Log Storage   │
         │  (RPC Cluster)  │    │  (ELK Stack)    │
         └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### 1. Clone and Setup
```bash
git clone https://github.com/Devour6/agent-staking-api.git
cd agent-staking-api
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_URL_BACKUP=https://solana-api.projectserum.com
SOLANA_CLUSTER=devnet

# Phase Configuration
PHASE_FEE_WALLET=Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D
PHASE_VALIDATOR_VOTE_ACCOUNT=8p1VGE8YZYfYAJaJ9UfZLFjR5jhJhzjzKvVv5HYjLXhm
RAKE_FEE_BASIS_POINTS=10

# Security
API_KEY_SECRET=your-secure-32-character-secret-key
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=debug
LOG_FILE=./logs/app.log

# Health Check
HEALTH_CHECK_TIMEOUT_MS=5000
```

### 3. Run Development Server
```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

### 4. Verify Installation
```bash
# Health check
curl http://localhost:3000/health

# API documentation
curl http://localhost:3000/api/docs

# Metrics
curl http://localhost:3000/metrics
```

## 🏭 Production Deployment

### Option 1: Docker Deployment

#### 1. Build Docker Image
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```bash
# Build image
docker build -t phase-staking-api:1.0.0 .

# Run container
docker run -d \
  --name phase-staking-api \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  phase-staking-api:1.0.0
```

#### 2. Docker Compose (Recommended)
```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    volumes:
      - ./logs:/app/logs
    networks:
      - phase-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - phase-network

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    restart: unless-stopped
    networks:
      - phase-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secure-admin-password
    volumes:
      - grafana-data:/var/lib/grafana
    restart: unless-stopped
    networks:
      - phase-network

networks:
  phase-network:
    driver: bridge

volumes:
  prometheus-data:
  grafana-data:
```

```bash
# Deploy with docker-compose
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
```

### Option 2: PM2 Deployment

#### 1. Install PM2
```bash
npm install -g pm2
```

#### 2. PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'phase-staking-api',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_file: '.env.production',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### 3. Deploy
```bash
# Build for production
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup

# Monitor
pm2 monit
```

### Option 3: Kubernetes Deployment

#### 1. Kubernetes Manifests
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phase-staking-api
  labels:
    app: phase-staking-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: phase-staking-api
  template:
    metadata:
      labels:
        app: phase-staking-api
    spec:
      containers:
      - name: api
        image: phase-staking-api:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - configMapRef:
            name: phase-config
        - secretRef:
            name: phase-secrets
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          limits:
            cpu: 500m
            memory: 512Mi
          requests:
            cpu: 250m
            memory: 256Mi
```

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: phase-staking-api-service
spec:
  selector:
    app: phase-staking-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: phase-config
data:
  PORT: "3000"
  SOLANA_CLUSTER: "mainnet-beta"
  RATE_LIMIT_WINDOW_MS: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"
  LOG_LEVEL: "info"
```

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: phase-secrets
type: Opaque
data:
  API_KEY_SECRET: <base64-encoded-secret>
  SOLANA_RPC_URL: <base64-encoded-url>
  PHASE_FEE_WALLET: <base64-encoded-wallet>
```

#### 2. Deploy to Kubernetes
```bash
# Apply configurations
kubectl apply -f k8s/

# Check deployment
kubectl get deployments
kubectl get pods
kubectl get services

# View logs
kubectl logs -l app=phase-staking-api -f
```

## 🔧 Load Balancer Configuration

### Nginx Configuration
```nginx
# nginx.conf
upstream phase_api {
    server api:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name staking-api.phase.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staking-api.phase.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://phase_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://phase_api;
        access_log off;
    }

    location /metrics {
        proxy_pass http://phase_api;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }
}
```

## 📊 Monitoring Setup

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'phase-staking-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

### Grafana Dashboard
Import dashboard JSON with key metrics:
- Request rate and latency
- Error rates by endpoint
- Transaction success rates
- Solana RPC health and latency
- System resources (CPU, memory)

### Log Management
```yaml
# filebeat.yml (ELK Stack)
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /app/logs/*.log
  json.keys_under_root: true
  json.add_error_key: true
  fields:
    service: phase-staking-api
    environment: production

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "phase-staking-api-%{+yyyy.MM.dd}"
```

## 🔒 Security Hardening

### 1. Environment Security
```bash
# Secure file permissions
chmod 600 .env.production
chown app:app .env.production

# Regular security updates
apt update && apt upgrade -y

# Fail2ban configuration
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
# Configure rate limiting rules
```

### 2. Network Security
- Use VPC with private subnets
- Configure security groups/firewall rules
- Enable WAF for API endpoints
- Use SSL/TLS certificates (Let's Encrypt)

### 3. Application Security
- API key rotation schedule
- Input validation and sanitization
- Rate limiting per endpoint
- CORS configuration for allowed origins
- Security headers (helmet.js)

## 🔄 CI/CD Pipeline

### GitHub Actions Example
```yaml
# .github/workflows/deploy.yml
name: Deploy Phase Staking API

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - run: npm ci
    - run: npm test
    - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: |
        docker build -t phase-staking-api:${{ github.sha }} .
        docker tag phase-staking-api:${{ github.sha }} phase-staking-api:latest
    
    - name: Push to registry
      run: |
        echo ${{ secrets.REGISTRY_PASSWORD }} | docker login -u ${{ secrets.REGISTRY_USERNAME }} --password-stdin
        docker push phase-staking-api:${{ github.sha }}
        docker push phase-staking-api:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - name: Deploy to production
      run: |
        # Deploy to your infrastructure
        kubectl set image deployment/phase-staking-api api=phase-staking-api:${{ github.sha }}
```

## 🚨 Troubleshooting

### Common Issues

#### 1. High Memory Usage
```bash
# Check memory usage
docker stats

# Increase Node.js heap size
NODE_OPTIONS="--max-old-space-size=2048"
```

#### 2. Solana RPC Issues
```bash
# Test RPC connectivity
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1, "method":"getHealth"}' YOUR_RPC_URL

# Switch to backup RPC
export SOLANA_RPC_URL_BACKUP=https://alternative-rpc.solana.com
```

#### 3. Rate Limiting Issues
```bash
# Check rate limit logs
grep "rate limit" logs/app.log

# Adjust rate limits
export RATE_LIMIT_MAX_REQUESTS=200
```

### Health Checks

```bash
# API health
curl -f http://localhost:3000/health || exit 1

# Container health
docker inspect --format='{{.State.Health.Status}}' phase-staking-api

# Kubernetes health
kubectl get pods -l app=phase-staking-api
```

## 📋 Production Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Rate limits configured appropriately
- [ ] Monitoring and alerting setup
- [ ] Log aggregation configured
- [ ] Backup and recovery plan
- [ ] Security scanning completed
- [ ] Load testing performed

### Post-Deployment
- [ ] Health checks passing
- [ ] Metrics being collected
- [ ] Logs flowing to aggregation system
- [ ] SSL certificate validity
- [ ] Performance monitoring active
- [ ] Error rate monitoring
- [ ] Database connections stable
- [ ] API documentation accessible

## 🔗 Additional Resources

- [API Documentation](http://localhost:3000/api/docs)
- [OpenAPI Specification](http://localhost:3000/api/docs/openapi)
- [Prometheus Metrics](http://localhost:3000/metrics)
- [Load Testing Guide](./load-tests/README.md)
- [Security Best Practices](./SECURITY.md)

## 📞 Support

For deployment support:
- Create an issue in the GitHub repository
- Contact Phase Labs support team
- Check community forums and documentation

---

**⚠️ Production Safety Notes:**
- Always test deployments on staging first
- Monitor metrics closely after deployment
- Have rollback plan ready
- Keep API keys and secrets secure
- Regular security audits and updates
- Monitor Solana network status for dependencies