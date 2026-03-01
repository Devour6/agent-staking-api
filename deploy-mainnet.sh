#!/bin/bash

# ========================================
# Phase Agent Staking API - Mainnet Deployment Script
# ========================================
# 
# This script deploys the Agent Staking API to mainnet production environment.
# 
# Pre-deployment checklist:
# [ ] Update .env.production with actual API keys
# [ ] Update PHASE_FEE_WALLET with real treasury wallet
# [ ] Update PHASE_VALIDATOR_VOTE_ACCOUNT with real validator
# [ ] Generate production JWT secrets
# [ ] Configure monitoring (Sentry, New Relic)
# [ ] Set up Redis and database connections
# [ ] Verify domain SSL certificates
# 

set -e  # Exit on any error

echo "🚀 Phase Agent Staking API - Mainnet Deployment"
echo "================================================"

# Validate environment
if [ ! -f ".env.production" ]; then
    echo "❌ Error: .env.production file not found"
    exit 1
fi

# Check for placeholder values that need replacement
echo "🔍 Validating production configuration..."

if grep -q "TODO:" .env.production; then
    echo "⚠️  Warning: Found TODO items in .env.production:"
    grep "TODO:" .env.production
    echo ""
    read -p "Continue deployment anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment aborted"
        exit 1
    fi
fi

# Build production image
echo "🏗️  Building production Docker image..."
docker build -f Dockerfile.production -t phase-staking-api:mainnet .

# Tag for registry
REGISTRY="phaselabs"
IMAGE_TAG="mainnet-$(date +%Y%m%d-%H%M%S)"
docker tag phase-staking-api:mainnet $REGISTRY/phase-staking-api:$IMAGE_TAG
docker tag phase-staking-api:mainnet $REGISTRY/phase-staking-api:latest-mainnet

echo "🚢 Tagged images:"
echo "  - phase-staking-api:mainnet"
echo "  - $REGISTRY/phase-staking-api:$IMAGE_TAG"
echo "  - $REGISTRY/phase-staking-api:latest-mainnet"

# Push to registry (commented out - uncomment when registry is ready)
# echo "📤 Pushing to registry..."
# docker push $REGISTRY/phase-staking-api:$IMAGE_TAG
# docker push $REGISTRY/phase-staking-api:latest-mainnet

# Deploy with docker-compose
echo "🚀 Deploying to mainnet..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Health check
echo "🏥 Running health check..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Health check passed - API is responding"
else
    echo "❌ Health check failed - API is not responding"
    echo "📋 Checking container logs..."
    docker-compose -f docker-compose.production.yml logs --tail=50 api
    exit 1
fi

# Show deployment info
echo ""
echo "🎉 Mainnet deployment completed successfully!"
echo "================================================"
echo "🔗 API URL: http://localhost:3000"
echo "🏥 Health Check: http://localhost:3000/health"
echo "📊 Metrics: http://localhost:3000/metrics"
echo "📋 Logs: docker-compose -f docker-compose.production.yml logs -f api"
echo ""
echo "🚨 IMPORTANT: Configure load balancer to point to this instance"
echo "🔒 IMPORTANT: Set up SSL termination at load balancer level"
echo "📱 IMPORTANT: Configure monitoring and alerting"
echo ""
echo "Image deployed: $REGISTRY/phase-staking-api:$IMAGE_TAG"