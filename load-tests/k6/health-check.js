import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Stay at 100 users for 2 minutes
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests under 200ms
    http_req_failed: ['rate<0.01'],    // Less than 1% failures
  },
};

export default function() {
  // Test health endpoint
  let response = http.get('http://localhost:3000/health');
  
  check(response, {
    'health status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has success field': (r) => JSON.parse(r.body).success === true,
    'has status field': (r) => JSON.parse(r.body).data.status === 'healthy',
  });

  sleep(1);
}