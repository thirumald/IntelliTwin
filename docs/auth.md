# Sign-in, roles and audit

## Modes
| `INTELLITWIN_AUTH_MODE` | How people sign in |
| --- | --- |
| `local` (default) | Users created on the **Admin** page. PBKDF2 passwords, 5 wrong attempts lock the account for 5 minutes, server-side sessions (HttpOnly cookie, 12 h) |
| `oidc` | Single sign-on through Keycloak or any OpenID Connect provider. Local passwords still work for **local admins only** (break-glass) |

Roles: `viewer` (read-only) < `operator` < `admin` (users, audit, live-data window).

## Single sign-on (OIDC)
1. In the provider create a **confidential client** `intellitwin`, standard (authorization code) flow, and redirect URI
   `https://<site>/api/auth/oidc/callback` (HTTP is accepted by Keycloak for testing only).
2. Create realm roles `intellitwin-admin`, `intellitwin-operator`, `intellitwin-viewer` (plain `admin`/`operator`/`viewer` also match) and assign them.
   People with none of these are refused unless `OIDC_DEFAULT_ROLE` is set. Highest role wins.
3. Set in `.env`: `INTELLITWIN_AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (see `.env.example`), then restart.

Checks on every sign-in: PKCE, one-time `state`, `nonce`, RS256 signature against the provider's keys, issuer, audience and expiry.
Users are created on first sign-in and keep the provider's role and name (changed at the next sign-in; role edits in the Admin page do not stick for SSO users).
Not yet done: sign-out at the provider, group-based roles beyond the claim path, several app replicas (the pending-sign-in state is in memory).
Tested with a fake provider in `tests/test_auth_sso.py`; **not yet tried against a real Keycloak**.

## Audit log
Every sign-in, failure, user change, action and admin step is written with actor, address and time. Rows are **hash-chained**:
**Admin > Audit log > Verify integrity** (or `GET /api/admin/audit/verify`) reports the first edited or missing row.
Limit: deleting the newest rows cannot be detected without an outside copy of the head hash shown by the check.

## Production guard
`INTELLITWIN_ENV=production` (set by `docker-compose.yml`) makes the server refuse to start with login switched off,
a weak `INTELLITWIN_ADMIN_PASSWORD`, or an incomplete OIDC setting.
