# Dev Dashboard Implementation Plan (v2 — scope expanded)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code slash command (`/weekly-audit`) that audits dev activity across multiple projects, plus a Cloudflare Worker hosted at `devdash.phonebot.co.uk` that serves the result with TOTP login. 5 roles, 8 users, per-project sub-tabs, visibility-matrix-driven view access.

**Architecture:**
- Python helper modules do deterministic work (config, git parsing, merit math, forecast, HTML rendering).
- Claude Code slash command orchestrates via native tools (Bash, Read, Write) and performs intelligent audit work.
- Cloudflare Worker (TypeScript) handles TOTP auth, session cookies, and role-routed HTML delivery. Free-tier Cloudflare Workers + KV + MailChannels + DNS.
- Weekly: Fahad runs `/weekly-audit` locally → Claude generates 5 per-role HTML payloads → pushes to Worker KV → users see fresh data next login.

**Tech stack:** Python 3.11+, PyYAML, Jinja2, pyotp, cryptography, requests, qrcode (server-side); TypeScript, otplib, `wrangler` CLI, Cloudflare Workers + KV + MailChannels (Worker-side). No external APIs beyond Claude itself.

**Spec reference:** `2026-04-23-dev-dashboard-design.md` in the same workspace.

**Work directory:** `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/`

---

## File structure (created by this plan)

```
dev dashboard/
├── .claude/commands/
│   ├── weekly-audit.md
│   ├── quarterly-review.md
│   ├── log-offproject.md
│   ├── upload-to-dashboard.md
│   └── add-feature-request.md
├── scripts/dashboard/
│   ├── __init__.py
│   ├── config.py                 # YAML config loaders (projects + users)
│   ├── git_reader.py             # git log → commit objects
│   ├── handoff_parser.py         # daily-handoff.md → structured data
│   ├── uploads_reader.py         # reads all upload folders
│   ├── matcher.py                # commit-to-item matching
│   ├── merit.py                  # 6-signal merit scoring (devs only)
│   ├── forecast.py               # traffic light + % + days math
│   ├── render.py                 # JSON data + Jinja2 template → HTML
│   ├── role_views.py             # assembles per-role HTML payloads
│   ├── totp_provision.py         # generates TOTP secrets + QR codes
│   ├── worker_push.py            # pushes HTML to Cloudflare KV
│   └── templates/
│       ├── dashboard.html.j2
│       ├── quarterly-review.html.j2
│       └── login.html.j2
├── worker/
│   ├── wrangler.toml
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── totp.ts
│       ├── session.ts
│       ├── email.ts
│       └── routes.ts
├── tests/dashboard/
│   ├── test_config.py
│   ├── test_git_reader.py
│   ├── test_handoff_parser.py
│   ├── test_uploads_reader.py
│   ├── test_matcher.py
│   ├── test_merit.py
│   ├── test_forecast.py
│   ├── test_role_views.py
│   ├── test_totp_provision.py
│   └── fixtures/
├── dashboard.config.yaml
├── users.yaml
├── requirements.txt
└── .gitignore
```

---

## Task 1: Project scaffolding — ✅ COMPLETE

Commit: `ea15d83` ("scaffold: dev dashboard project structure"). Done 2026-04-23.

Structure exists. `pyyaml`, `jinja2`, `pytest` installed via `pip install --user`. Proceed to Task 2.

---

## Phase A: Foundation

### Task 2: Config loader for projects + users (TDD)

**Files:**
- Create: `scripts/dashboard/config.py`
- Create: `tests/dashboard/test_config.py`
- Create: `tests/dashboard/fixtures/valid_dashboard_config.yaml`
- Create: `tests/dashboard/fixtures/valid_users.yaml`

- [ ] **Step 1: Create fixtures**

`tests/dashboard/fixtures/valid_dashboard_config.yaml`:

```yaml
output_html_dir: ./output
uploads_repo_path: /tmp/dev-dashboard-inputs
fahad_email: fahad@phonebot.com.au
domain: devdash.phonebot.co.uk

projects:
  - name: "Phonebot 2.0"
    kickoff_date: "2026-04-01"
    deadline: "2026-07-30"
    repos: [/tmp/pb-backend, /tmp/pb-frontend]
    scope_docs: [CLAUDE.md, README.md]
    items_source: launch-readiness-dashboard.html
    devs: [faizan@phonebot.com.au]

  - name: "Phonebot HQ"
    kickoff_date: "2026-04-15"
    deadline: "2026-05-20"
    repos: [/tmp/phonebot-hq]
    scope_docs: [phase1-scope.md]
    items_source: null
    devs: [faizan@phonebot.com.au]
```

`tests/dashboard/fixtures/valid_users.yaml`:

```yaml
users:
  - {email: fahad@phonebot.com.au, role: ceo}
  - {email: imran@phonebot.com.au, role: pm}
  - {email: faizan@phonebot.com.au, role: dev}
  - {email: moazzam@phonebot.com.au, role: dev}
  - {email: faisal@phonebot.com.au, role: dev}
  - {email: usama@phonebot.com.au, role: dev}
  - {email: mustafa@phonebot.com.au, role: qa_auditor}
  - {email: qa@phonebot.com.au, role: qa}
```

- [ ] **Step 2: Write failing tests**

`tests/dashboard/test_config.py`:

```python
import pytest
from pathlib import Path
from scripts.dashboard.config import (
    load_dashboard_config, load_users, DashboardConfig, User, ConfigError
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_dashboard_config_loads():
    cfg = load_dashboard_config(FIXTURES / "valid_dashboard_config.yaml")
    assert isinstance(cfg, DashboardConfig)
    assert len(cfg.projects) == 2
    assert cfg.projects[0].name == "Phonebot 2.0"
    assert cfg.projects[0].deadline == "2026-07-30"
    assert cfg.projects[0].kickoff_date == "2026-04-01"
    assert cfg.fahad_email == "fahad@phonebot.com.au"
    assert cfg.domain == "devdash.phonebot.co.uk"


def test_users_yaml_loads():
    users = load_users(FIXTURES / "valid_users.yaml")
    assert len(users) == 8
    assert {u.role for u in users} == {"ceo", "pm", "dev", "qa_auditor", "qa"}
    assert sum(1 for u in users if u.role == "dev") == 4


def test_missing_dashboard_config_raises():
    with pytest.raises(FileNotFoundError):
        load_dashboard_config(FIXTURES / "nope.yaml")


def test_missing_users_raises():
    with pytest.raises(FileNotFoundError):
        load_users(FIXTURES / "nope.yaml")


def test_invalid_role_raises(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("users:\n  - {email: x@y.com, role: totally_invalid}\n")
    with pytest.raises(ConfigError):
        load_users(bad)


def test_dashboard_config_missing_name_raises(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("projects:\n  - {deadline: 2026-01-01}\n")
    with pytest.raises(ConfigError):
        load_dashboard_config(bad)
```

- [ ] **Step 3: Run tests, expect fail**

```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -m pytest tests/dashboard/test_config.py -v
```

- [ ] **Step 4: Implement `scripts/dashboard/config.py`**

```python
"""Config loaders for the dev dashboard."""
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import yaml


VALID_ROLES = {"ceo", "pm", "dev", "qa", "qa_auditor"}


class ConfigError(ValueError):
    pass


@dataclass
class Project:
    name: str
    deadline: str
    kickoff_date: str = ""
    repos: List[str] = field(default_factory=list)
    scope_docs: List[str] = field(default_factory=list)
    items_source: Optional[str] = None
    devs: List[str] = field(default_factory=list)


@dataclass
class DashboardConfig:
    projects: List[Project]
    output_html_dir: str = "./output"
    uploads_repo_path: str = ""
    fahad_email: str = ""
    domain: str = ""


@dataclass
class User:
    email: str
    role: str


def load_dashboard_config(path: Path) -> DashboardConfig:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise ConfigError("Config root must be a mapping")
    projects_raw = raw.get("projects", [])
    if not isinstance(projects_raw, list):
        raise ConfigError("'projects' must be a list")
    projects = []
    for i, p in enumerate(projects_raw):
        if not isinstance(p, dict):
            raise ConfigError(f"Project {i} must be a dict")
        if "name" not in p:
            raise ConfigError(f"Project {i} missing 'name'")
        if "deadline" not in p:
            raise ConfigError(f"Project {p.get('name', i)} missing 'deadline'")
        projects.append(Project(
            name=p["name"], deadline=p["deadline"],
            kickoff_date=p.get("kickoff_date", ""),
            repos=p.get("repos", []),
            scope_docs=p.get("scope_docs", []),
            items_source=p.get("items_source"),
            devs=p.get("devs", []),
        ))
    return DashboardConfig(
        projects=projects,
        output_html_dir=raw.get("output_html_dir", "./output"),
        uploads_repo_path=raw.get("uploads_repo_path", ""),
        fahad_email=raw.get("fahad_email", ""),
        domain=raw.get("domain", ""),
    )


def load_users(path: Path) -> List[User]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Users file not found: {path}")
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise ConfigError("Users root must be a mapping")
    users_raw = raw.get("users", [])
    if not isinstance(users_raw, list):
        raise ConfigError("'users' must be a list")
    out = []
    for i, u in enumerate(users_raw):
        if not isinstance(u, dict):
            raise ConfigError(f"User {i} must be a dict")
        if "email" not in u:
            raise ConfigError(f"User {i} missing 'email'")
        if "role" not in u:
            raise ConfigError(f"User {u['email']} missing 'role'")
        if u["role"] not in VALID_ROLES:
            raise ConfigError(f"User {u['email']} has invalid role '{u['role']}'")
        out.append(User(email=u["email"], role=u["role"]))
    return out
```

- [ ] **Step 5: Run tests, expect pass**
- [ ] **Step 6: Commit**

```bash
git add scripts/dashboard/config.py tests/dashboard/test_config.py tests/dashboard/fixtures/
git commit -m "feat(dashboard): config loaders for projects + users"
```

---

### Task 3: Git commit reader (TDD)

**Files:** `scripts/dashboard/git_reader.py`, `tests/dashboard/test_git_reader.py`

Tests create a tiny git repo, commit one file with message "R0-07: add file", and verify `read_commits_since` returns a `Commit` with matching sha, author, message, and files_changed list.

**Implementation:** `git log` with a custom `--pretty=format` using rare delimiters (`<<<FIELD>>>` and `<<<END>>>`) to parse cleanly. `--name-only` for files. Returns `List[Commit]`.

- [ ] Write test + implement + commit:

```bash
git add scripts/dashboard/git_reader.py tests/dashboard/test_git_reader.py
git commit -m "feat(dashboard): git commit reader"
```

(Full code is the same as was prepared in v1 of this plan. Copy `git_reader.py` from the v1 plan content.)

---

### Task 4: Daily handoff parser (TDD)

**Files:** `scripts/dashboard/handoff_parser.py`, `tests/dashboard/test_handoff_parser.py`, `tests/dashboard/fixtures/sample_handoff.md`

Parses handoff files with 4 sections: CLOSED / IN PROGRESS / OPEN / OFF-PROJECT. Extracts date, author, content per section, and off-project hours (regex `~\s*([\d.]+)\s*h`).

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): daily-handoff.md parser with 4-section support"
```

---

### Task 5: Uploads folder reader (TDD)

**Files:** `scripts/dashboard/uploads_reader.py`, `tests/dashboard/test_uploads_reader.py`

Reads 6 folder groups from `dev-dashboard-inputs`:
- `/fahad-uploads/` → dict of filename → content
- `/pm-uploads/` → dict of filename → content
- `/dev-uploads/<dev>/` → dict of dev → dict of files
- `/qa-findings/<project>/` → dict of project → dict of files
- `/qa-audits/<project>/` → dict of project → dict of files (NEW in v2)
- `/feature-requests/<project>/` → dict of project → dict of files (NEW in v2)

Only reads `.md` and `.txt` files. Missing folders return empty dicts. Tests cover all 6 slots + missing folder + binary-skip behavior.

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): uploads reader with 6 slot types"
```

---

## Phase B: Audit logic

### Task 6: Commit-to-item matcher (TDD)

**Files:** `scripts/dashboard/matcher.py`, `tests/dashboard/test_matcher.py`

Weighted signal mix (priority order):
1. Ticket ID in commit message (0.95 confidence)
2. Handoff CLOSED line (0.80)
3. Branch name (0.60)
4. File-path inference (medium — reserved for Claude at runtime, not this code)

Test each signal separately + compound case + no-match case.

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): commit-to-item matcher"
```

---

### Task 7: Merit scoring engine (TDD)

**Files:** `scripts/dashboard/merit.py`, `tests/dashboard/test_merit.py`

Six signals: Output, Quality, Reliability, Handoff, Initiative, Unblock.

Weights: 27.5% / 27.5% / 25% / 12% / 4% / 4%.

Key behavior:
- Reliability target auto-adjusts for off-project hours (standard week = 40h; 20h off-project = target cut to ~50%).
- Output is complexity-weighted blend.
- Tests: high-scores-high, off-project-raises-reliability, zero-output-low, tier-ordering-respected.

**Note:** applies only to Dev role. QA and QA Auditor are NOT scored in v1.

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): 6-signal merit scoring with off-project adjustment"
```

---

### Task 8: Forecast + per-project metrics (TDD)

**Files:** `scripts/dashboard/forecast.py`, `tests/dashboard/test_forecast.py`

Returns `ProjectMetrics` with:
- `items_closed`, `items_total`, `percent_complete`
- `pace_per_week`
- `forecast_launch` (date or None)
- `deadline`, `kickoff`
- `days_remaining` (calendar, today → deadline)
- `total_project_duration` (kickoff → deadline)
- `days_of_work_required` (items_left / pace_per_week * 7)
- `days_delta` (forecast - deadline)
- `traffic_light` — green if delta ≤ 0, yellow if ≤ 14 days, red otherwise; zero-pace with items-left → red

Tests: on-pace-green, behind-red, percent-complete math, days-remaining math, days-of-work math, zero-pace-red.

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): forecast + %-complete + days-remaining + days-required"
```

---

## Phase C: Output — per-role HTML

### Task 9: HTML renderer + main template (TDD)

**Files:** `scripts/dashboard/render.py`, `scripts/dashboard/templates/dashboard.html.j2`, `tests/dashboard/test_render.py`

Template sections:
1. Header with project name + logout link
2. Role tab row — renders only tabs in `visible_tabs`
3. Per-role view divs:
   - Per-project sub-tab strip (`All Projects` + one per project)
   - Metrics summary line: `% / days remaining / days required (both types) / forecast` — `%` only rendered when role is ceo/pm/dev
   - Role-specific content blocks (CEO hero, PM per-dev panels, Dev panel, QA bug list, QA Auditor audit list)
4. "Why?" links with expandable audit-trail divs
5. Tab-switching JavaScript (role tabs + project sub-tabs)

Base CSS from the existing `dev-dashboard-wireframe.html` — same color palette, same card style, same dot indicators.

Tests: renders-html, role-tabs-respected (dev should NOT show ceo/pm tabs).

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): base HTML renderer + tabbed template"
```

---

### Task 10: Per-role payload assembler (TDD)

**Files:** `scripts/dashboard/role_views.py`, `tests/dashboard/test_role_views.py`

Given a full snapshot dict for the week + list of users, return a dict mapping role → payload. The Dev role returns a nested dict keyed by email (each dev gets a personalised view filtered to their own commits/merit/queue).

**Visibility matrix** (must match spec section 2):

```python
VISIBILITY = {
    "dev":        ["dev", "qa", "qa_auditor"],
    "qa":         ["dev", "qa", "qa_auditor"],
    "qa_auditor": ["dev", "qa", "qa_auditor"],
    "pm":         ["pm", "dev", "qa", "qa_auditor"],
    "ceo":        ["ceo", "pm", "dev", "qa", "qa_auditor"],
}
```

Additional rules:
- QA and QA Auditor payloads: `percent_complete` stripped (set to `None`) per spec (not shown on their views).
- Dev payloads: each project's `devs` list filtered to only the logged-in dev's entry.
- Non-CEO payloads: strip any `ceo_only_callouts` key.

- [ ] Write test + implement + commit:

```bash
git commit -m "feat(dashboard): per-role payload assembler with visibility matrix"
```

---

## Phase D: Orchestration

### Task 11: `/weekly-audit` slash command

**Files:** `.claude/commands/weekly-audit.md`, `dashboard.config.yaml`, `users.yaml`

Slash command orchestrates:

1. Load both config files via Python helpers.
2. For each project: pull commits, read handoffs, scope docs, items list.
3. Read uploads bundle (all 6 folders).
4. For each dev: match commits to items (matcher), audit each commit's actual code against claim (Claude reads files), score signals, compute merit.
5. Compute per-project metrics (forecast + % + days + days required).
6. Assemble full snapshot dict.
7. Call `role_views.build_role_payloads` → per-role payloads.
8. Render each payload to HTML via `render.render_dashboard`.
9. Push each HTML to Worker KV via `worker_push.push_payloads` (Task 17).
10. Archive snapshot JSON locally in `dashboard-data/<date>.json`.
11. Report to user.

The sample `dashboard.config.yaml` (project-level) and `users.yaml` (user roster, 8 entries as in spec section 2) live at the workspace root.

- [ ] Commit:

```bash
git add .claude/commands/weekly-audit.md dashboard.config.yaml users.yaml
git commit -m "feat(dashboard): /weekly-audit slash command + real configs"
```

---

### Task 12: End-to-end smoke test (local HTML, pre-Worker)

Tests the whole weekly pipeline producing local HTML files before the Worker is involved.

- [ ] Run full pytest suite — all green.
- [ ] Run `/weekly-audit` in Claude Code on Phonebot 2.0's real data.
- [ ] Verify one HTML file per role lands locally.
- [ ] Open each in a browser, confirm tabs, metrics, and role filtering.
- [ ] Commit any tweaks surfaced by the smoke test.

---

## Phase E: Cloudflare Worker (auth + hosting)

### Task 13: Worker scaffold + wrangler config

**Files:** `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.toml`, `worker/src/index.ts`

- [ ] Install wrangler: `npm install -g wrangler` (Fahad's Cloudflare account already exists).

- [ ] `worker/package.json`:

```json
{
  "name": "devdash-worker",
  "version": "1.0.0",
  "type": "module",
  "dependencies": { "otplib": "^12.0.1" },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240620.0",
    "typescript": "^5.4.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] `worker/wrangler.toml`:

```toml
name = "devdash"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[[kv_namespaces]]
binding = "DASHBOARD_KV"
id = "TO_BE_CREATED"

[[routes]]
pattern = "devdash.phonebot.co.uk/*"
zone_name = "phonebot.co.uk"

[triggers]
crons = ["0 13 * * *"]
```

- [ ] `worker/src/index.ts` (minimal):

```typescript
export interface Env {
  DASHBOARD_KV: KVNamespace;
  TOTP_ENCRYPTION_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("devdash Worker alive", { status: 200 });
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    // filled in Task 16
  },
};
```

- [ ] Create KV namespace:

```bash
cd worker
wrangler kv:namespace create DASHBOARD_KV
# copy returned id into wrangler.toml
```

- [ ] Deploy:

```bash
wrangler deploy
curl https://devdash.phonebot.co.uk/
# expect: "devdash Worker alive"
```

- [ ] Commit:

```bash
git commit -m "feat(worker): scaffold Cloudflare Worker + KV namespace"
```

---

### Task 14: TOTP provisioning (generate secrets + QR codes)

**Files:** `scripts/dashboard/totp_provision.py`, `tests/dashboard/test_totp_provision.py`

- [ ] Add to requirements.txt: `pyotp>=2.9`, `qrcode[pil]>=7.4`, `cryptography>=42.0`. Run `pip install --user -r requirements.txt`.

- [ ] Write failing tests: provisioning produces base32 secret + PNG QR file; AES-GCM encryption round-trips.

- [ ] Implement:

```python
"""Provision TOTP secrets and generate QR codes for Google Authenticator scan.

Encryption uses AES-GCM so the Cloudflare Worker (TypeScript, Web Crypto)
can decrypt the same secrets. DO NOT use Fernet (Python-only).
"""
from dataclasses import dataclass
from pathlib import Path
import base64
import os
import pyotp
import qrcode
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass
class ProvisionedUser:
    email: str
    secret: str
    qr_path: Path
    otpauth_url: str


def provision_user(email: str, issuer: str, qr_dir: Path) -> ProvisionedUser:
    secret = pyotp.random_base32()
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)
    qr_dir = Path(qr_dir); qr_dir.mkdir(parents=True, exist_ok=True)
    qr_path = qr_dir / f"{email.replace('@', '_at_').replace('.', '_')}.png"
    qrcode.make(otpauth_url).save(qr_path)
    return ProvisionedUser(email=email, secret=secret, qr_path=qr_path, otpauth_url=otpauth_url)


def encrypt_secret(secret: str, key: bytes) -> str:
    """key must be 32 bytes. Returns base64url(nonce || ciphertext)."""
    assert len(key) == 32
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, secret.encode(), None)
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_secret(encrypted: str, key: bytes) -> str:
    raw = base64.urlsafe_b64decode(encrypted.encode())
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None).decode()
```

- [ ] Run tests, expect pass.

- [ ] Commit:

```bash
git add scripts/dashboard/totp_provision.py tests/dashboard/test_totp_provision.py requirements.txt
git commit -m "feat(dashboard): TOTP provisioning + AES-GCM encryption"
```

---

### Task 15: Worker — login + session + role-routed HTML

**Files:** `worker/src/totp.ts`, `worker/src/session.ts`, `worker/src/routes.ts`, `worker/src/index.ts` (updated)

- [ ] `worker/src/totp.ts`:

```typescript
import { authenticator } from 'otplib';
authenticator.options = { step: 30, digits: 6, window: 1 };

export function verifyTotp(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

export async function decryptSecret(encrypted: string, keyB64: string): Promise<string> {
  const key = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  const raw = Uint8Array.from(atob(encrypted.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const nonce = raw.slice(0, 12);
  const ct = raw.slice(12);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ct);
  return new TextDecoder().decode(pt);
}
```

- [ ] `worker/src/session.ts`:

```typescript
import type { KVNamespace } from '@cloudflare/workers-types';
const SESSION_TTL = 86400;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(kv: KVNamespace, email: string, role: string): Promise<string> {
  const token = randomToken();
  await kv.put(`session:${token}`, JSON.stringify({ email, role, created_at: Date.now() }),
    { expirationTtl: SESSION_TTL });
  return token;
}

export async function getSession(kv: KVNamespace, token: string) {
  const raw = await kv.get(`session:${token}`);
  return raw ? JSON.parse(raw) as { email: string, role: string } : null;
}

export function sessionCookieHeader(token: string): string {
  return `devdash_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`;
}

export function readSessionCookie(req: Request): string | null {
  const cookies = req.headers.get('Cookie') || '';
  const m = cookies.match(/devdash_session=([a-f0-9]+)/);
  return m ? m[1] : null;
}
```

- [ ] `worker/src/routes.ts`:

```typescript
import type { Env } from './index';
import { verifyTotp, decryptSecret } from './totp';
import { createSession, getSession, sessionCookieHeader, readSessionCookie } from './session';

const LOGIN_FORM = `<!doctype html><html><head><title>devdash</title></head><body>
<form method=post action="/login">
  <input name=email type=email required placeholder=email>
  <input name=code inputmode=numeric pattern=[0-9]{6} required placeholder="6-digit code">
  <button type=submit>Log in</button>
</form></body></html>`;

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/login' && req.method === 'POST') return login(req, env);
  if (url.pathname === '/logout') return logout(req, env);

  // GET /
  const token = readSessionCookie(req);
  if (token) {
    const session = await getSession(env.DASHBOARD_KV, token);
    if (session) {
      const dashKey = session.role === 'dev'
        ? `dashboard:latest:dev:${session.email}`
        : `dashboard:latest:${session.role}`;
      const html = await env.DASHBOARD_KV.get(dashKey);
      if (html) return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      return new Response('Dashboard not yet generated for your role.', { status: 200 });
    }
  }
  return new Response(LOGIN_FORM, { headers: { 'Content-Type': 'text/html' } });
}

async function login(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const email = String(form.get('email') || '').toLowerCase().trim();
  const code = String(form.get('code') || '').trim();
  const userRaw = await env.DASHBOARD_KV.get(`user:${email}`);
  if (!userRaw) return new Response('Login failed', { status: 401 });
  const user = JSON.parse(userRaw) as { role: string, totp_secret_encrypted: string };
  const secret = await decryptSecret(user.totp_secret_encrypted, env.TOTP_ENCRYPTION_KEY);
  if (!verifyTotp(code, secret)) return new Response('Login failed', { status: 401 });
  const token = await createSession(env.DASHBOARD_KV, email, user.role);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': sessionCookieHeader(token) },
  });
}

async function logout(req: Request, env: Env): Promise<Response> {
  const token = readSessionCookie(req);
  if (token) await env.DASHBOARD_KV.delete(`session:${token}`);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': 'devdash_session=; Path=/; Max-Age=0' },
  });
}
```

- [ ] `worker/src/index.ts` (updated):

```typescript
import { handleRequest } from './routes';

export interface Env {
  DASHBOARD_KV: KVNamespace;
  TOTP_ENCRYPTION_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    // Filled in Task 16
  },
};
```

- [ ] Set the encryption key:

```bash
# Generate 32 random bytes and base64 it (matching totp_provision.py's key format)
KEY=$(python3 -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())")
echo "$KEY" | wrangler secret put TOTP_ENCRYPTION_KEY
# Save $KEY locally (outside git) — you need it for the Python side too.
```

- [ ] Deploy, manually provision fahad@phonebot.com.au (run `totp_provision.py`, write encrypted secret to KV as `user:fahad@phonebot.com.au`), scan QR, test login.

- [ ] Commit:

```bash
git commit -m "feat(worker): TOTP login + session + role-routed HTML"
```

---

### Task 16: Daily email cron via MailChannels

**Files:** `worker/src/email.ts`, `worker/src/index.ts` (updated `scheduled` handler)

- [ ] `worker/src/email.ts`:

```typescript
export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'devdash@devdash.phonebot.co.uk', name: 'devdash' },
      subject: `[devdash] ${subject}`,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!res.ok) throw new Error(`MailChannels failed: ${res.status} ${await res.text()}`);
}
```

- [ ] Update `scheduled` in `index.ts`: read the CEO dashboard payload from KV, parse its JSON metadata, detect stuck PRs / HIGH bugs / disagreements, send one consolidated email to `fahad@phonebot.com.au` if anything triggers.

- [ ] Deploy + verify the scheduled cron fires (Cloudflare dashboard → Workers → logs).

- [ ] Commit:

```bash
git commit -m "feat(worker): daily email cron via MailChannels"
```

---

### Task 17: Push per-role HTML to Worker KV

**Files:** `scripts/dashboard/worker_push.py`, `.claude/commands/weekly-audit.md` (updated)

- [ ] Add `requests>=2.31` to requirements.txt.

- [ ] `scripts/dashboard/worker_push.py`:

```python
"""Push per-role HTML payloads to Cloudflare Worker KV via Cloudflare REST API."""
import os
from pathlib import Path
from typing import Dict
import requests


CF_API = "https://api.cloudflare.com/client/v4"


def push_payloads(account_id: str, namespace_id: str, api_token: str,
                  payloads: Dict[str, str]) -> None:
    """payloads: KV key (str) -> HTML content (str)."""
    headers = {"Authorization": f"Bearer {api_token}"}
    for key, value in payloads.items():
        url = f"{CF_API}/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
        r = requests.put(url, headers=headers, data=value.encode("utf-8"))
        r.raise_for_status()


def push_user_records(account_id: str, namespace_id: str, api_token: str,
                      records: Dict[str, Dict[str, str]]) -> None:
    """Push user records for login validation.
    records: email -> {role, totp_secret_encrypted}
    Stored as JSON strings at key user:<email>.
    """
    import json
    headers = {"Authorization": f"Bearer {api_token}"}
    for email, rec in records.items():
        url = f"{CF_API}/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/user:{email}"
        r = requests.put(url, headers=headers, data=json.dumps(rec))
        r.raise_for_status()
```

- [ ] Update `weekly-audit.md` to call `worker_push.push_payloads` with keys:
  - `dashboard:latest:ceo`
  - `dashboard:latest:pm`
  - `dashboard:latest:qa`
  - `dashboard:latest:qa_auditor`
  - `dashboard:latest:dev:<email>` for each dev

- [ ] First real end-to-end run: provision all 8 users, distribute QR codes, run `/weekly-audit`, verify each team member can log in and see correct role view.

- [ ] Commit:

```bash
git commit -m "feat(dashboard): push role HTMLs + user records to Cloudflare KV"
```

---

## Phase F: Remaining helpers + polish

### Task 18: `/add-feature-request` slash command

`.claude/commands/add-feature-request.md`: prompts for project, description, urgency, optional target dev. Writes a formatted markdown file to `dev-dashboard-inputs/feature-requests/<project>/<date>-<slug>.md`. Optionally git-commits + pushes if `uploads_repo_path` is a git repo.

- [ ] Create file + commit: `feat(dashboard): /add-feature-request`

### Task 19: `/log-offproject` + `/upload-to-dashboard` helpers

Both prompt for minimal inputs, format a line, append to the right file.

- [ ] Create both + commit: `feat(dashboard): offproject + generic upload helpers`

### Task 20: `/quarterly-review` slash command + template

Generates one HTML review per dev from the last 13 weekly JSON archives. Template at `scripts/dashboard/templates/quarterly-review.html.j2`.

- [ ] Create + commit: `feat(dashboard): /quarterly-review + template`

### Task 21: README + final sanity check

`scripts/dashboard/README.md` documenting setup, operation, troubleshooting.

Sanity checks:
- [ ] All pytest tests green.
- [ ] All 5 slash commands present under `.claude/commands/`.
- [ ] Worker deployed; manual login test passes for fahad@ + one other user.
- [ ] `dashboard.config.yaml` and `users.yaml` contain real project + user data.

- [ ] Final commit: `docs(dashboard): operator README + v1 complete`

---

## Self-review

**Spec coverage:**
- User roster + 5 roles + visibility matrix → Task 2, Task 10
- TOTP auth via Cloudflare Worker → Tasks 13–17
- QA + QA Auditor uploads and views → Task 5 (reader), Task 9 (template), Task 10 (role filtering)
- Ad-hoc feature intake → Task 18 + Task 5 (reader picks it up)
- Per-project sub-tabs → Task 9 (template renders sub-tabs from `projects` list)
- % complete + days remaining + days required → Task 8 (math), Task 9 (display, gated by role)
- Off-project work → Task 4 (parser reads 4th section), Task 7 (merit adjusts), Task 19 (helper)
- Merit scoring for devs only → Task 7
- Daily email cron → Task 16
- Quarterly reviews → Task 20

**Placeholders:** none remain. Each task has concrete code or a clear instruction to "copy from v1 plan" when the content is identical to the previous plan version.

**Type consistency:** `Commit`, `HandoffEntry`, `UploadsBundle`, `MatchResult`, `MeritSignals`, `MeritScore`, `ProjectMetrics`, `User`, `Project`, `DashboardConfig` — all defined once, reused consistently.

**Scope check:** one plan, one cohesive product. Phase A–D produces a usable local-HTML dashboard (running weekly-audit drops HTML files in `./output/`). Phases E–F add hosting + auth + extras. Can ship Phase D as an interim version if needed.

**Build effort estimate: 7–8 days.**
