import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 100,
  duration: '120s',
};

export default function () {
  const res = http.post(`${baseUrl}/v1/login`, null, {
    headers: { 'X-Tenant-ID': 'acme' },
  });

  check(res, {
    'status is 200 or 429 or 503': (r) => r.status === 200 || r.status === 429 || r.status === 503,
  });

  sleep(0.05);
}
