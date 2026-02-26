import http from 'k6/http';
import { check, sleep, group } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp up
    { duration: '5m', target: 100 },   // Stay at 100
    { duration: '5m', target: 200 },   // Increase to 200
    { duration: '10m', target: 300 },  // Stress test at 300
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>1000'], // Target: 1,000+ requests per minute
    'group_duration{group:::health}': ['p(95)<100'],
    'group_duration{group:::stake}': ['p(95)<200'],
  },
};

const API_KEY = 'a'.repeat(64);
const BASE_URL = 'http://localhost:3000';

const agentWallets = [
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  'Cq9Ms1KrMBYfrR2EhGBNgQYmxUG7CxEEkmRyXEjwqK8D',
];

export default function() {
  const scenario = Math.random();
  
  if (scenario < 0.6) {
    // 60% - Test stake endpoint (most critical)
    testStakeEndpoint();
  } else if (scenario < 0.8) {
    // 20% - Test health endpoints
    testHealthEndpoints();
  } else {
    // 20% - Test docs and root endpoint
    testStaticEndpoints();
  }
}

function testStakeEndpoint() {
  group('stake', () => {
    const agentWallet = agentWallets[Math.floor(Math.random() * agentWallets.length)];
    const stakeAmount = Math.floor(Math.random() * 50) + 1; // 1-50 SOL
    
    const payload = JSON.stringify({
      agentWallet,
      stakeAmount,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    };

    let response = http.post(`${BASE_URL}/stake/build`, payload, params);
    
    check(response, {
      'stake: status is 200': (r) => r.status === 200,
      'stake: response < 200ms': (r) => r.timings.duration < 200,
      'stake: has transaction': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && body.data && body.data.transaction;
        } catch (e) {
          return false;
        }
      },
    });
  });
}

function testHealthEndpoints() {
  group('health', () => {
    // Test main health endpoint
    let response = http.get(`${BASE_URL}/health`);
    check(response, {
      'health: status is 200': (r) => r.status === 200,
      'health: response < 100ms': (r) => r.timings.duration < 100,
      'health: has status': (r) => {
        try {
          return JSON.parse(r.body).data.status === 'healthy';
        } catch (e) {
          return false;
        }
      },
    });

    // Test liveness endpoint
    response = http.get(`${BASE_URL}/health/live`);
    check(response, {
      'liveness: status is 200': (r) => r.status === 200,
      'liveness: response < 50ms': (r) => r.timings.duration < 50,
    });

    // Test readiness endpoint
    response = http.get(`${BASE_URL}/health/ready`);
    check(response, {
      'readiness: status is 200': (r) => r.status === 200,
      'readiness: response < 50ms': (r) => r.timings.duration < 50,
    });
  });
}

function testStaticEndpoints() {
  group('static', () => {
    // Test root endpoint
    let response = http.get(`${BASE_URL}/`);
    check(response, {
      'root: status is 200': (r) => r.status === 200,
      'root: response < 50ms': (r) => r.timings.duration < 50,
    });

    // Test docs endpoint
    response = http.get(`${BASE_URL}/api/docs`);
    check(response, {
      'docs: status is 200': (r) => r.status === 200,
    });
  });
}

export function teardown(data) {
  console.log('Load test completed');
}