import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 500,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<10'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const payload = JSON.stringify({
    tenant_id: 'acme',
    user_id: '42',
    route: '/v1/search',
    method: 'GET',
    plan: 'enterprise',
  });

  const res = http.post(`${baseUrl}/v1/check`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.1);
}
