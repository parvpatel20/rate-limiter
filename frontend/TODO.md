# Rate-Limiter Frontend TODO

## Core Delivery
- [x] App shell and navigation
- [x] Dashboard KPI cards and charts
- [x] Live rate tester flow (`/v1/check`)
- [x] Policy explorer flow (`/v1/policies/:tenantID`)
- [x] Burst simulation flow (`/v1/simulate`)
- [x] Theme support (light + dark)

## Quality Gates
- [x] TypeScript build passes (`npm run build`)
- [x] ESLint configured and passing (`npm run lint`)
- [x] API proxy rewrite works (`/api/* -> backend`)

## UX Polish
- [x] Modern typography and visual tokens
- [x] Gradient atmosphere + subtle motion
- [x] Responsive layout for mobile and desktop
- [x] Clear error states and loading feedback

## Stretch / Future
- [ ] Add historical metrics storage for true time-series charts
- [ ] Add authentication for admin operations
- [ ] Add Playwright smoke tests for key flows
