import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 200 },   // Ramp up to 200 users  
    { duration: '5m', target: 500 },   // Test target: 500 concurrent users
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% under 200ms
    http_req_failed: ['rate<0.05'],    // Less than 5% failures
    http_reqs: ['rate>1000'],          // Target: 1,000 req/min
  },
};

// Sample agent wallets for testing
const agentWallets = [
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  'Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D',
];

// Generate a test API key (64 character hex string)
const apiKey = 'a'.repeat(64);

export default function() {
  const agentWallet = agentWallets[Math.floor(Math.random() * agentWallets.length)];
  const stakeAmount = Math.floor(Math.random() * 10) + 1; // 1-10 SOL
  
  const payload = JSON.stringify({
    agentWallet,
    stakeAmount,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  };

  let response = http.post('http://localhost:3000/stake/build', payload, params);
  
  check(response, {
    'stake endpoint status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has transaction data': (r) => {
      const body = JSON.parse(r.body);
      return body.success && body.data && body.data.transaction;
    },
    'has instructions': (r) => {
      const body = JSON.parse(r.body);
      return body.data && Array.isArray(body.data.transaction.instructions);
    },
  });

  // Realistic pause between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}