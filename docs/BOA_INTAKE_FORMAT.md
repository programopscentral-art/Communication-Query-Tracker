# BOA & University Intake Format (Dynamic Sheet)

**Purpose:** One Google Sheet that stays the **master list** of BOAs and their
universities. The product reads this sheet and syncs it in — so when a **new BOA
joins**, a **BOA changes university/number**, or a **new university comes**, you
just edit the sheet and the product updates itself. **No conflicts, no duplicates.**

**Why no conflicts:** every BOA has a stable **Employee ID**. The sync matches on
Employee ID (and University on its code), so edits *update* the existing record
instead of creating a new one. Add a row → new BOA. Edit a row → updated BOA.
Mark a row `Inactive` → they stop getting reminders. That's the whole model.

---

## The main tab — `BOAs`

**One row per (BOA × University).** If a BOA covers 2 universities, they get
**2 rows with the same Employee ID** (that's expected and safe). Use the column
headers **exactly** as below. A ready-to-paste template is at
`docs/templates/BOAs.csv`.

| Column | Required | Format | Example | Notes |
|---|---|---|---|---|
| `Employee ID` | ✅ | Text, stable, unique per person | `NW10234` | **The key.** Same person = same ID on every row. Never reuse an old ID for a new person. |
| `Full Name` | ✅ | Text | `Ravi Kumar` | |
| `Designation` | ✅ | Text | `BOA – Student Engagement` | Role/title. |
| `WhatsApp Number` | ✅ | `+` country code, no spaces | `+919876543210` | **Must be WhatsApp-active.** `+91…`, no leading 0, no spaces/dashes. |
| `Login Email` | ⬜ | Email | `ravi.k@nxtwave.in` | Used to sign in to the dashboard. |
| `University` | ✅ | University name or short code | `yenepoya` | The university this row assigns them to. **New name here = new university auto-created.** |
| `Role` | ⬜ | `Primary` / `Backup` | `Primary` | Defaults to `Primary`. Backups are for escalation ordering. |
| `Team Scope` | ⬜ | `All` / `Student Engagement` / `Parent Communication` | `All` | Blank/`All` = gets every update for that uni. Set a team to split work. |
| `Receive Reminders` | ⬜ | `Yes` / `No` | `Yes` | Defaults to `Yes`. `No` = dashboard access but no WhatsApp pings. |
| `Status` | ⬜ | `Active` / `Inactive` | `Active` | Defaults to `Active`. |

> **Multiple universities example** — Arjun covers two, so two rows, same ID:
>
> | Employee ID | Full Name | Designation | WhatsApp Number | University | Role |
> |---|---|---|---|---|---|
> | NW10250 | Arjun P | BOA | +919800011122 | yenepoya | Backup |
> | NW10250 | Arjun P | BOA | +919800011122 | sgu | Primary |

---

## Optional tab — `Universities`

Only needed to add **extra metadata** or pre-register **upcoming** universities.
If you skip it, universities are auto-created from the `University` column above
(code = lowercased name). Template: `docs/templates/Universities.csv`.

| Column | Required | Format | Example | Notes |
|---|---|---|---|---|
| `University Name` | ✅ | Text | `Yenepoya University` | |
| `Short Code` | ✅ | lowercase, no spaces | `yenepoya` | Used in web link + to match the `University` column. |
| `Sheet Spellings` | ⬜ | Comma-separated | `Yenepoya, YEN` | How it's spelled in the tracker data sheet (for data import). |
| `Timezone` | ⬜ | IANA tz | `Asia/Kolkata` | Default `Asia/Kolkata`. |
| `Status` | ⬜ | `Active` / `Upcoming` / `Inactive` | `Active` | |
| `Go-Live Date` | ⬜ | `DD/MM/YYYY` | `01/10/2026` | For `Upcoming`. |

## Optional tab — `Escalations`

Who to ping if an update is **still unpublished at its publish time**. Blank
`University` = global fallback. Template: `docs/templates/Escalations.csv`.

| Column | Required | Example | Notes |
|---|---|---|---|
| `Name` | ✅ | `Comms Lead` | |
| `WhatsApp Number` | ✅ | `+919812340000` | |
| `University` | ⬜ | `yenepoya` | Blank = applies to all. |
| `Status` | ⬜ | `Active` | |

---

## How the dynamic sync works (so you know what to expect)

The Admin dashboard has a **"Sync from Sheet"** button, and the sync also runs
automatically on a schedule (e.g. every 15 min). On each sync:

| You do this in the sheet | The product does this |
|---|---|
| Add a new BOA row | Creates the BOA + their university assignment |
| Add a row with a brand-new `University` | **Auto-creates that university** (no setup needed) |
| Change a name / number / designation | Updates the existing BOA (matched by `Employee ID`) — no duplicate |
| Add a second row for an existing BOA | Adds another university assignment for them |
| Change `Team Scope` / `Role` | Re-routes their reminders accordingly |
| Set `Status = Inactive` | Stops their reminders (kept for history, not deleted) |
| Remove a row entirely | That assignment is marked inactive on next sync (safe, reversible) |

**Matching keys (why it never conflicts):**
- BOA identity → `Employee ID`
- University identity → `Short Code` (or normalized name)
- Assignment identity → `Employee ID` + `University` + `Team Scope`

Because these keys are stable, re-running the sync any number of times produces
the same result (idempotent). Nothing is hard-deleted, so a mistaken removal is
recoverable by re-adding the row.

---

## Validation checklist (verify before sharing back)

- [ ] Every person has a **unique, stable `Employee ID`**; the same person uses the same ID on all their rows.
- [ ] Every `WhatsApp Number` is `+91…`, no leading 0 / spaces / dashes, and is WhatsApp-active.
- [ ] A BOA covering multiple universities has **one row per university** (same Employee ID).
- [ ] Each active university has at least one `Primary` BOA.
- [ ] `University` values are spelled consistently (or listed in the `Universities` tab with `Sheet Spellings`).

## Common mistakes to avoid

- ❌ `9876543210` / `09876543210` → ✅ `+919876543210`
- ❌ Giving the same person two different Employee IDs (creates duplicates).
- ❌ Reusing a departed employee's ID for a new hire (mixes their history).
- ❌ One row with `University = "yenepoya, sgu"` → ✅ two separate rows.
