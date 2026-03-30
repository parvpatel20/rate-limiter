package httplayer

import "net/http"

func UIHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(uiHTML))
	}
}

const uiHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rate Limiter Dashboard</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 20px; color: #111; background: #f6f7f9; }
    h1 { margin: 0 0 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
    label { display:block; font-size: 13px; margin: 8px 0 4px; color: #333; }
    input, select, button, textarea { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #bbb; box-sizing: border-box; }
    button { cursor: pointer; background: #111; color: #fff; border: 0; margin-top: 10px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1020; color: #dbe4ff; padding: 10px; border-radius: 6px; min-height: 90px; }
    .kvs { font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 1.5; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .small { color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Rate Limiter Dashboard</h1>
  <div class="small">Lightweight built-in UI. No external frontend dependency.</div>

  <div class="grid" style="margin-top:14px;">
    <div class="card">
      <h3>Live Metrics</h3>
      <div class="kvs" id="metricsBox">Loading metrics...</div>
      <button id="refreshMetrics">Refresh Metrics</button>
    </div>

    <div class="card">
      <h3>Quick Request Check</h3>
      <label>Tenant ID</label><input id="tenant" value="acme" />
      <label>User ID</label><input id="user" value="42" />
      <label>Route</label><input id="route" value="/v1/search" />
      <label>Method</label><input id="method" value="GET" />
      <label>Plan</label><input id="plan" value="enterprise" />
      <button id="runCheck">POST /v1/check</button>
      <pre id="checkOut"></pre>
    </div>

    <div class="card">
      <h3>Policy Lookup</h3>
      <label>Tenant ID</label><input id="policyTenant" value="acme" />
      <button id="loadPolicies">GET /v1/policies/:tenant</button>
      <pre id="policiesOut"></pre>
    </div>

    <div class="card">
      <h3>Simulation</h3>
      <div class="row">
        <div><label>Requests / second</label><input id="simRps" type="number" value="20" /></div>
        <div><label>Duration (sec)</label><input id="simDuration" type="number" value="10" /></div>
      </div>
      <button id="simulate">POST /v1/simulate</button>
      <pre id="simulateOut"></pre>
    </div>

    <div class="card">
      <h3>Admin Reload</h3>
      <label>Admin Secret</label><input id="adminSecret" type="password" placeholder="from .env ADMIN_SECRET" />
      <button id="reloadPolicies">POST /v1/admin/reload</button>
      <pre id="reloadOut"></pre>
    </div>

    <div class="card">
      <h3>Health Probe</h3>
      <button id="health">GET / (with tenant header)</button>
      <pre id="healthOut"></pre>
    </div>

    <div class="card">
      <h3>Traffic Burst Test</h3>
      <div class="row">
        <div><label>Requests</label><input id="burstCount" type="number" value="25" /></div>
        <div><label>Route</label><input id="burstRoute" value="/v1/login" /></div>
      </div>
      <label>Method</label>
      <select id="burstMethod">
        <option value="POST" selected>POST</option>
        <option value="GET">GET</option>
      </select>
      <button id="runBurst">Run Burst</button>
      <pre id="burstOut"></pre>
    </div>
  </div>

<script>
async function api(url, opts) {
  const r = await fetch(url, opts || {});
  const text = await r.text();
  return { status: r.status, text: text };
}

function requestPayload() {
  return {
    tenant_id: document.getElementById('tenant').value,
    user_id: document.getElementById('user').value,
    route: document.getElementById('route').value,
    method: document.getElementById('method').value,
    plan: document.getElementById('plan').value
  };
}

function parseMetric(text, name, labels) {
  const lines = text.split('\n').filter(function(l){ return l.startsWith(name); });
  if (!labels) {
    const plain = lines.find(function(l){ return l === name || l.startsWith(name + ' '); });
    if (plain) return plain.split(' ').pop();
  }
  if (labels) {
    const key = Object.keys(labels).map(function(k){ return k + '=\"' + labels[k] + '\"'; }).join(',');
    const pref = name + '{' + key + '}';
    const exact = lines.find(function(l){ return l.startsWith(pref); });
    if (exact) return exact.split(' ').pop();
  }
  return '0';
}

async function loadMetrics() {
  const r = await api('/metrics');
  if (r.status !== 200) {
    document.getElementById('metricsBox').textContent = 'metrics unavailable: HTTP ' + r.status;
    return;
  }
  const txt = r.text;
  const data = {
    active_keys: parseMetric(txt, 'ratelimit_active_keys'),
    circuit_state: parseMetric(txt, 'ratelimit_circuit_breaker_state'),
    redis_needed: parseMetric(txt, 'ratelimit_local_decisions_total', {decision:'redis_needed'}),
    fast_allow: parseMetric(txt, 'ratelimit_local_decisions_total', {decision:'fast_allow'}),
    fast_deny: parseMetric(txt, 'ratelimit_local_decisions_total', {decision:'fast_deny'}),
    denied_acme_login: parseMetric(txt, 'ratelimit_requests_total', {result:'denied', route:'/v1/login', tenant:'acme'})
  };
  document.getElementById('metricsBox').textContent =
    'active_keys: ' + data.active_keys + '\n' +
    'circuit_breaker_state: ' + data.circuit_state + ' (0=closed,1=open,2=half-open)\n' +
    'local_decision.redis_needed: ' + data.redis_needed + '\n' +
    'local_decision.fast_allow: ' + data.fast_allow + '\n' +
    'local_decision.fast_deny: ' + data.fast_deny + '\n' +
    'denied(acme,/v1/login): ' + data.denied_acme_login;
}

document.getElementById('refreshMetrics').onclick = loadMetrics;

document.getElementById('runCheck').onclick = async function() {
  const payload = requestPayload();
  const r = await api('/v1/check', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  document.getElementById('checkOut').textContent = 'HTTP ' + r.status + '\n' + r.text;
};

document.getElementById('loadPolicies').onclick = async function() {
  const tenant = document.getElementById('policyTenant').value || 'acme';
  const r = await api('/v1/policies/' + encodeURIComponent(tenant));
  document.getElementById('policiesOut').textContent = 'HTTP ' + r.status + '\n' + r.text;
};

document.getElementById('simulate').onclick = async function() {
  const payload = requestPayload();
  payload.requests_per_second = Number(document.getElementById('simRps').value || '10');
  payload.duration_seconds = Number(document.getElementById('simDuration').value || '10');
  const r = await api('/v1/simulate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  document.getElementById('simulateOut').textContent = 'HTTP ' + r.status + '\n' + r.text;
};

document.getElementById('reloadPolicies').onclick = async function() {
  const secret = document.getElementById('adminSecret').value;
  const r = await api('/v1/admin/reload', {
    method: 'POST',
    headers: {'X-Admin-Secret': secret}
  });
  document.getElementById('reloadOut').textContent = 'HTTP ' + r.status + '\n' + r.text;
};

document.getElementById('health').onclick = async function() {
  const tenant = document.getElementById('tenant').value || 'acme';
  const r = await api('/', { headers: {'X-Tenant-ID': tenant} });
  document.getElementById('healthOut').textContent = 'HTTP ' + r.status + '\n' + r.text;
};

document.getElementById('runBurst').onclick = async function() {
  const tenant = document.getElementById('tenant').value || 'acme';
  const count = Number(document.getElementById('burstCount').value || '10');
  const route = document.getElementById('burstRoute').value || '/v1/login';
  const method = document.getElementById('burstMethod').value || 'POST';
  let ok = 0;
  let denied = 0;
  let other = 0;

  for (let i = 0; i < count; i++) {
    const r = await fetch(route, { method: method, headers: { 'X-Tenant-ID': tenant } });
    if (r.status === 200) {
      ok++;
    } else if (r.status === 429) {
      denied++;
    } else {
      other++;
    }
  }

  document.getElementById('burstOut').textContent =
    'total: ' + count + '\n' +
    '200 allowed: ' + ok + '\n' +
    '429 denied: ' + denied + '\n' +
    'other: ' + other;
  loadMetrics();
};

loadMetrics();
setInterval(loadMetrics, 5000);
</script>
</body>
</html>
`
