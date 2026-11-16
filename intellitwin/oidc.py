"""Single sign-on with OpenID Connect (authorization code flow with PKCE). Works with Keycloak and any standard provider.

Environment:
  INTELLITWIN_AUTH_MODE=oidc
  OIDC_ISSUER          e.g. https://sso.example.com/realms/presight   (discovery at <issuer>/.well-known/openid-configuration)
  OIDC_CLIENT_ID, OIDC_CLIENT_SECRET
  OIDC_REDIRECT_URI    optional; default <site address>/api/auth/oidc/callback
  OIDC_ROLE_CLAIM      where the roles are in the token, default "realm_access.roles" (Keycloak). "groups" also works.
  OIDC_DEFAULT_ROLE    role for users who have none of ours; empty (default) means they are refused
  OIDC_NAME            text on the sign-in button, default "single sign-on"
Roles are matched by name: admin / operator / viewer, or intellitwin-admin / intellitwin-operator / intellitwin-viewer. The highest wins.
The ID token is checked for signature (provider's keys), issuer, audience, expiry and the nonce.
"""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
import threading
import time
from urllib.parse import urlencode

import httpx
import jwt

ROLE_ORDER = ("viewer", "operator", "admin")
STATE_TTL = 600
_lock = threading.Lock()
_pending: dict[str, dict] = {}
_disc: dict = {"at": 0, "doc": None}
_jwks: dict = {"at": 0, "keys": None}


class OidcError(Exception):
    pass


def cfg(k: str, default: str = "") -> str:
    return os.environ.get(k, default).strip()


def issuer() -> str:
    return cfg("OIDC_ISSUER").rstrip("/")


# --- network (kept in small functions so tests can replace them) ---------------------------------------------------
def _get_json(url: str) -> dict:
    r = httpx.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def _post_form(url: str, data: dict) -> dict:
    r = httpx.post(url, data=data, timeout=15, headers={"Accept": "application/json"})
    if r.status_code >= 400:
        raise OidcError(f"The identity provider refused the sign-in ({r.status_code})")
    return r.json()


def discovery() -> dict:
    with _lock:
        if _disc["doc"] and time.time() - _disc["at"] < 3600:
            return _disc["doc"]
    doc = _get_json(issuer() + "/.well-known/openid-configuration")
    if doc.get("issuer", "").rstrip("/") != issuer():
        raise OidcError("The provider's issuer does not match OIDC_ISSUER")
    with _lock:
        _disc.update(at=time.time(), doc=doc)
    return doc


def _signing_key(kid: str | None):
    for attempt in (0, 1):  # on an unknown key id, refetch once (key rotation)
        with _lock:
            fresh = _jwks["keys"] and time.time() - _jwks["at"] < 3600 and attempt == 0
            keys = _jwks["keys"] if fresh else None
        if keys is None:
            keys = _get_json(discovery()["jwks_uri"]).get("keys", [])
            with _lock:
                _jwks.update(at=time.time(), keys=keys)
        for k in keys:
            if kid is None or k.get("kid") == kid:
                return jwt.algorithms.RSAAlgorithm.from_jwk(k)
    raise OidcError("The token was signed with an unknown key")


# --- flow ------------------------------------------------------------------------------------------------------------
def redirect_uri(base_url: str) -> str:
    return cfg("OIDC_REDIRECT_URI") or base_url.rstrip("/") + "/api/auth/oidc/callback"


def start(base_url: str, nxt: str) -> str:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    with _lock:
        now = time.time()
        for k in [k for k, v in _pending.items() if v["exp"] < now]:
            del _pending[k]
        _pending[state] = {"nonce": nonce, "verifier": verifier, "next": nxt, "redirect": redirect_uri(base_url), "exp": now + STATE_TTL}
    q = {"response_type": "code", "client_id": cfg("OIDC_CLIENT_ID"), "redirect_uri": redirect_uri(base_url), "scope": "openid profile email",
         "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256"}
    return discovery()["authorization_endpoint"] + "?" + urlencode(q)


def finish(state: str, code: str) -> tuple[dict, str]:
    """Exchange the code, verify the ID token. Returns (claims, next path)."""
    with _lock:
        p = _pending.pop(state, None)
    if not p or p["exp"] < time.time():
        raise OidcError("The sign-in expired or was not started here. Try again.")
    tok = _post_form(discovery()["token_endpoint"], {"grant_type": "authorization_code", "code": code, "redirect_uri": p["redirect"],
                                                      "client_id": cfg("OIDC_CLIENT_ID"), "client_secret": cfg("OIDC_CLIENT_SECRET"),
                                                      "code_verifier": p["verifier"]})
    idt = tok.get("id_token")
    if not idt:
        raise OidcError("The provider returned no ID token")
    try:
        header = jwt.get_unverified_header(idt)
        if header.get("alg") != "RS256":
            raise OidcError("Unsupported token signature algorithm")
        claims = jwt.decode(idt, _signing_key(header.get("kid")), algorithms=["RS256"], audience=cfg("OIDC_CLIENT_ID"),
                            issuer=issuer(), options={"require": ["exp", "iat", "sub"]}, leeway=30)
    except jwt.PyJWTError as ex:
        raise OidcError(f"The ID token is not valid ({type(ex).__name__})")
    if claims.get("nonce") != p["nonce"]:
        raise OidcError("The ID token does not match this sign-in")
    # Some providers keep roles only in the access token or userinfo; merge the access token's claims if it is a signed JWT of ours.
    at = tok.get("access_token")
    if at and cfg("OIDC_ROLE_CLAIM", "realm_access.roles").split(".")[0] not in claims:
        try:
            ac = jwt.decode(at, _signing_key(jwt.get_unverified_header(at).get("kid")), algorithms=["RS256"], issuer=issuer(), options={"verify_aud": False}, leeway=30)
            for k, v in ac.items():
                claims.setdefault(k, v)
        except Exception:
            pass
    return claims, p["next"]


def role_from(claims: dict) -> str | None:
    path = cfg("OIDC_ROLE_CLAIM", "realm_access.roles").split(".")
    v = claims
    for part in path:
        v = v.get(part) if isinstance(v, dict) else None
    names = [str(x).lower().lstrip("/") for x in (v if isinstance(v, list) else [v] if v else [])]
    found = [r for r in ROLE_ORDER if r in names or "intellitwin-" + r in names]
    if found:
        return max(found, key=ROLE_ORDER.index)
    d = cfg("OIDC_DEFAULT_ROLE").lower()
    return d if d in ROLE_ORDER else None
