import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';

const goodTenants = ['acme', 'initech', 'wayne', 'stark', 'soylent'];

export const options = {
  scenarios: {
    bad_tenant: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '60s',
      exec: 'badTenant',
    },
    good_tenants: {
      executor: 'constant-vus',
      vus: 50,
      duration: '60s',
      exec: 'goodTenant',
    },
  },
};

export function badTenant() {
  const res = http.post(`${baseUrl}/v1/login`, null, {
    headers: { 'X-Tenant-ID': 'globex' },
    tags: { tenant: 'globex' },
  });

  check(res, {
    'bad tenant returns 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
}

export function goodTenant() {
  const tenant = goodTenants[(__VU - 1) % goodTenants.length];
  const payload = JSON.stringify({
    tenant_id: tenant,
    user_id: `${__VU}`,
    route: '/v1/search',
    method: 'GET',
    plan: 'enterprise',
  });

  const res = http.post(`${baseUrl}/v1/check`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { tenant },
  });

  check(res, {
    'good tenant status is 200': (r) => r.status === 200,
  });
  sleep(0.1);
}
