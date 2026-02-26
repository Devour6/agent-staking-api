# Load Testing

This directory contains load testing scripts for the Phase Agent Staking API using k6 and Artillery.

## Target Performance
- **Throughput**: 1,000+ transactions per minute
- **Response Time**: 95% of requests under 200ms
- **Error Rate**: Less than 5% failures

## k6 Tests

### Prerequisites
```bash
# Install k6
brew install k6
# or
curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz --strip-components 1
```

### Running k6 Tests
```bash
# Health check load test
k6 run load-tests/k6/health-check.js

# Stake endpoint load test  
k6 run load-tests/k6/stake-endpoint.js

# Full API load test
k6 run load-tests/k6/full-api-test.js

# Generate HTML report
k6 run --out json=results.json load-tests/k6/full-api-test.js
```

## Artillery Tests

### Prerequisites
```bash
# Install Artillery
npm install -g artillery
```

### Running Artillery Tests
```bash
# Health endpoints test
artillery run load-tests/artillery/health-test.yml

# Stake endpoint test
artillery run load-tests/artillery/stake-test.yml

# Generate report
artillery run load-tests/artillery/stake-test.yml --output report.json
artillery report report.json
```

## Test Scenarios

### k6 Tests
- **health-check.js**: Basic health endpoint validation
- **stake-endpoint.js**: Focused stake transaction building performance
- **full-api-test.js**: Comprehensive multi-endpoint load test

### Artillery Tests
- **health-test.yml**: Health endpoint availability and response times
- **stake-test.yml**: Stake transaction building with realistic payloads

## Performance Benchmarks

### Expected Results
- Health endpoints: < 50ms response time
- Stake building: < 200ms response time
- Throughput: 1,000+ req/min sustained
- Concurrent users: 300+ without degradation

### Monitoring During Tests
1. Start the application: `npm run dev`
2. Monitor logs for performance insights
3. Check system resources (CPU, memory, network)
4. Monitor Solana RPC connection health

## Optimization Notes
- RPC connection pooling implemented for better Solana performance
- Request caching for blockhash to reduce RPC calls
- Rate limiting to prevent abuse while allowing high throughput
- Connection timeouts configured for reliability