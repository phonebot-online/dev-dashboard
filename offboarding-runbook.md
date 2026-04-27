# Dev offboarding runbook

**Audience:** Fahad / Imran running the offboarding of a departing team member.
**Complement to:** `removeUser()` in devdash + TOTP lockout docs in faizan-handoff.md Part 10.
**Last updated:** 2026-04-24

---

## When to use this

Any time a team member leaves Phonebot — voluntary resignation, non-renewal, or termination. This runbook ensures:
- Nothing they had access to continues to let them in
- Their open work doesn't orphan or get lost
- Their pending rewards are handled per policy (default: forfeit)
- The audit trail records everything for future reference

---

## T-minus 7 days (or as soon as the leave date is confirmed)

### 1. Announce internally (Fahad / Imran)
- WhatsApp the team. 1 line, specific date, no drama.
- Tell devdash group that handover starts now.

### 2. Log the intent in devdash
- Settings → Users → find the leaver's row
- Set their `probation_end` to a future date (so rewards stop accruing if policy is "probation-gated")
- Set absence.type = "personal" with until = leave_date + note "Leaving Phonebot YYYY-MM-DD"
- Commit a note to audit log via any settings save

### 3. Knowledge transfer checklist (their call, you verify)
- All in-progress tickets: reassigned in devdash (use PM view → QA bug queue dropdown with reason "pre-departure handover to X")
- Their active branches: rebased / merged / abandoned with team acknowledgement
- Their runbooks / infra access: documented in team wiki
- Their 1:1 notes (if any): archived to Fahad's private

---

## On the leaving day

### 4. Flip `status` to `archived` in Settings → Users
Not yet — leave as `active` until step 5 is run. Archived users don't show in dropdowns.

### 5. Run `removeUser(idx)` via Settings UI
Click the `×` button on their row. The confirm dialog enumerates the cascade:
- Project `owner_email` cleared where they owned
- `contributor_emails` filtered everywhere
- Their open bugs → auto-reassigned to each project's owner (with `reassigned_reason` stamped)
- Their open feature requests → auto-reassigned to project owner
- Open disputes `dev === their name` → status `void`, resolved_by `auto (user removed)`
- Audit findings `assigned_to === email` → `assigned_to: ''`, cc lists filtered
- Blockers `waiting_on === their displayName` → `waiting_on: "(unassigned — user removed)"`
- **Pending reward events** → marked `void` per `config.rewards.termination_rule` (default: forfeit)
- `localStorage.devdash_provisioned_<email>` cleared (no more TOTP lockout bypass)
- Audit log entry written: "Removed X (email) — bugs/features/disputes/audits/blockers reconciled, pending rewards voided"

### 6. Revoke TOTP + session (Cloudflare Worker side — Faizan / ops)
```bash
# Delete user:<email> from KV → they cannot log in
wrangler kv:key delete --namespace-id=<id> "user:<email>"

# Delete all sessions for that email
# (requires listing sessions + filtering by email; Python helper in kv_cleanup.py — TODO: write)
```

### 7. Git commits
Their existing commits stay attributed to them (git is authoritative; don't rewrite history). Their `dev-uploads/<email>/` folder in the shared repo is archived to `dev-uploads/_archived/<email>_YYYY-MM-DD/` and stops feeding the weekly audit.

### 8. Final payout (if applicable)
Default policy is `termination_rule: 'forfeit'` → pending events voided in step 5.

Override: if Fahad decides to pay out pending (e.g. amicable departure mid-month), BEFORE running step 5:
- Settings → Rewards → Confirm `termination_rule: 'pay'` temporarily
- Run the monthly payout modal; tick only this user's events
- Set `termination_rule` back to default
- Then run step 5

### 9. Archive their handoff notes
Their `daily-handoff.md` entries are part of git history — stay forever. No action needed.

### 10. Close the loop
- WhatsApp the team "X has left Phonebot. Their bugs have been reassigned. Questions → Fahad."
- Update `users.yaml` in the repo (remove the user entry for next deploy)

---

## Post-departure verification

Within 24 hours of step 5, confirm:

- [ ] Login attempt from their known credentials → 403 / no KV entry
- [ ] Any bug that was `assigned_to: <them>` now has a real dev assigned (not empty, not their name)
- [ ] Audit log shows the removal entry with exact cascade counts
- [ ] `rewardEvents` filter by their email + `status: 'pending'` returns 0 (all voided or paid)
- [ ] Settings → Users no longer has their row
- [ ] They are not in any assignee dropdown (bug form, feature request, etc.)

If any check fails, see "Recovery" below.

---

## Recovery (things went wrong during removal)

### Their bug somehow still shows their name
`removeUser()` only reassigns bugs they were `assigned_to`. If a bug carries their name in another field (rare), edit it via PM view's inline assignee dropdown.

### Their pending rewards were paid out in the same session instead of voided
Check `payoutBatches[0]` — if it includes their event IDs, you already paid. No clawback (per Q7 policy). Document + move on.

### They can still log in (rare)
KV eventual consistency up to 60 s. If after 2 min login still works, check:
- `user:<email>` key still exists in KV? → `wrangler kv:key get ...` → if yes, delete again
- Their browser has a stale session cookie? → cookies can live until the `session:*` TTL (24h default). Force-invalidate by deleting any matching `session:*` KV entries with `wrangler kv:key list | grep session:` (needs listing scope in API token).

---

## Sandbox-test the flow before real use

1. Log in as Fahad
2. Settings → Users → Add a fake user ("Test Leaver", role=dev)
3. File a bug assigned to them (QA view)
4. File a feature request targeted at them (dev view)
5. Seed a compass score + reward event for them (Settings → Rewards → Compose)
6. Remove them via the × button
7. Check the audit log — single entry enumerating all reconciliations
8. Check the bug — reassigned with `reassigned_reason`
9. Check the feature request — reassigned with `reassigned_reason`
10. Check `rewardEvents` — their pending events now `status: 'void'`

Expected outcome: every downstream reference is cleanly handled. No ghost data.

---

## Audit trail example (what gets written)

```
{
  "id": 1234567890,
  "when": "2026-04-24 18:00",
  "who": "Fahad",
  "section": "Users",
  "change": "Removed Faizan (faizan@phonebot.com.au) — bugs/features/disputes/audits/blockers reconciled, pending rewards voided"
}
```

Plus:
- Each reassigned bug gets `reassigned_reason: "Previous assignee Faizan removed from team on 2026-04-24"`
- Each voided reward event gets `note: "(voided: user removed)"`
- Each auto-resolved dispute gets `resolved_by: "auto (user removed)"`

---

## Open gaps (phase 2)

- **TOTP reset via email** (approved 2026-04-24) — not yet built. Current recovery is Fahad-only via `totp_provision.py --only <email> --force`.
- **KV cleanup helper** (`kv_cleanup.py`) to automate step 6 — not yet written.
- **Offboarding checklist persistence** — this doc is markdown; should become a clickable checklist in the devdash Settings UI so Fahad can tick items off and record date-completed per step.

These go in Phase 2. For now, run step 5 via the UI and step 6 via `wrangler` CLI.
