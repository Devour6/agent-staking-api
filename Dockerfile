# Multi-stage Dockerfile for Agent Staking API
# Supports production deployment and test execution

# Base stage with common dependencies
FROM node:18-alpine AS base

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    bash \
    git \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Development stage with all dependencies
FROM base AS development

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Test stage for running tests and E2E testing
FROM development AS test

# Install additional test dependencies
RUN apk add --no-cache jq

# Create test results directory
RUN mkdir -p /app/test-results

# Copy test scripts and configurations
COPY scripts/ ./scripts/
COPY __tests__/ ./__tests__/
COPY jest.config.js ./

# Make test scripts executable
RUN chmod +x scripts/*.js

# Add test runner script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "🧪 Starting Agent Staking API Test Suite"\n\
echo "API_BASE_URL: $API_BASE_URL"\n\
echo "SOLANA_RPC_URL: $SOLANA_RPC_URL"\n\
\n\
# Wait for API to be ready\n\
echo "⏳ Waiting for API to be ready..."\n\
timeout 60 bash -c "until curl -sf $API_BASE_URL/health; do sleep 2; done"\n\
echo "✅ API is ready"\n\
\n\
# Check if we have a test keypair\n\
if [[ ! -f "$TEST_KEYPAIR_PATH" ]]; then\n\
    echo "🔑 Generating test keypair..."\n\
    node scripts/generate-devnet-keypair.js\n\
fi\n\
\n\
# Run unit tests\n\
echo "🧪 Running unit tests..."\n\
npm test 2>&1 | tee /app/test-results/unit-tests.log\n\
\n\
# Run E2E tests if enabled\n\
if [[ "$RUN_E2E_TESTS" == "true" ]]; then\n\
    echo "🚀 Running E2E devnet tests..."\n\
    node scripts/devnet-e2e-test.js 2>&1 | tee /app/test-results/e2e-tests.log\n\
else\n\
    echo "⏭️  Skipping E2E tests (RUN_E2E_TESTS != true)"\n\
fi\n\
\n\
echo "✅ Test suite completed successfully"\n\
' > /app/run-tests.sh && chmod +x /app/run-tests.sh

# Health check for test container
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command for test stage
CMD ["/app/run-tests.sh"]

# Production stage - minimal image for deployment
FROM base AS production

# Copy built application from development stage
COPY --from=development /app/dist ./dist
COPY --from=development /app/package*.json ./

# Copy necessary runtime files
COPY scripts/ ./scripts/
COPY .env.example ./

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Production startup command
CMD ["node", "dist/index.js"]

# Metadata
LABEL name="agent-staking-api" \
      version="1.0.0" \
      description="Phase Agent Staking API - Non-custodial staking for AI agents" \
      maintainer="Phase Labs" \
      network="devnet"