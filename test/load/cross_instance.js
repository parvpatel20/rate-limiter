import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
const allowed = new Counter('allowed_200');
const denied = new Counter('denied_429');

export const options = {
  vus: 200,
  duration: '120s',
};

export default function () {
  const res = http.post(`${baseUrl}/v1/login`, null, {
    headers: { 'X-Tenant-ID': 'acme' },
  });

  if (res.status === 200) {
    allowed.add(1);
  } else if (res.status === 429) {
    denied.add(1);
  }

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
}
