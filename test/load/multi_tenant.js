import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';

const tenants = [
  { id: 'acme', plan: 'enterprise' },
  { id: 'globex', plan: 'free' },
  { id: 'initech', plan: 'enterprise' },
  { id: 'umbrella', plan: 'free' },
  { id: 'wayne', plan: 'enterprise' },
  { id: 'stark', plan: 'enterprise' },
  { id: 'hooli', plan: 'free' },
  { id: 'wonka', plan: 'free' },
  { id: 'soylent', plan: 'enterprise' },
  { id: 'oscorp', plan: 'free' },
];

export const options = {
  scenarios: {
    per_tenant: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 3000,
      maxDuration: '120s',
    },
  },
};

export default function () {
  const t = tenants[(__VU - 1) % tenants.length];
  const payload = JSON.stringify({
    tenant_id: t.id,
    user_id: `${__VU}`,
    route: '/v1/search',
    method: 'GET',
    plan: t.plan,
  });

  const res = http.post(`${baseUrl}/v1/check`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { tenant: t.id },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(0.05);
}
