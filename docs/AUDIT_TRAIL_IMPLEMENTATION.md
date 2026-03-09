# Audit Trail Implementation

## 0. Thought Process

The core requirement is: **every status change must be recorded automatically**.
So the first decision was where to enforce this guarantee.

Decision criteria :
- Coverage: can any valid status update bypass logging?
- Data integrity: can users tamper with log rows?
- Coupling: how tightly does logging depend on one app code path?
- Operational simplicity: how easy is this to keep correct as the system grows?

Options considered:
- Server Action logging (`update-status.ts` writes audit row after update)
  - Pros: simple to read in app code; easy to attach request-level metadata later.
  - Cons: any future update path outside this action can skip audit writes, so coverage is not guaranteed.
- Database Trigger logging (log in `AFTER UPDATE OF status` on `shipments`)
  - Pros: strongest coverage; all DB-level status updates go through one rule; least chance of accidental omission.
  - Cons: business behavior is partly in SQL, so debugging requires checking DB functions/triggers.
- Hybrid (Server Action + Trigger)
  - Pros: can combine strong coverage with rich app metadata.
  - Cons: extra complexity and potential duplicate/competing audit logic for this assessment scope.

Why I chose trigger:
- This task prioritizes reliability of audit capture over app-layer convenience.
- A trigger is the most robust way to ensure "every status update gets logged" even if more update entry points are added later.
- With RLS enabled on `audit_logs` and no write policy for end users, logs remain append-only from the application perspective.

**DB as source of truth** 
- Status-transition rules already live in the database (e.g., Delivered -> Pending block), so audit recording is kept in the same authority layer.
- The database is where state changes are finally committed. Writing logs at this point ensures the audit trail matches exactly what was saved, avoiding race conditions or ordering issues in the application layer.
- If application code changes or new services are added, DB-level auditing still applies without requiring every caller to remember audit logic.
- This keeps correctness centralized: one trusted rule in SQL, while many different parts of the application can safely call it.

**Reasoning**

As i mentioned earlier, the main pros of `trigger model` is that it has the strongest coverage and safest. My reasoning always try to relate, the use-case and the trade-off. So, what is the use-case of this feature? I believe every logging is always exist for monitoring / debug purpose. So no mistake is allowed. And compared to other approach, mistakes are more likely to happen over time. keeping the audit logic in the database is safer as it reduces the chance of mistakes as the codebase grows. Audit logs are usually not a user-facing feature; they are mainly used by developers when debugging issues, investigating unexpected behavior, or reviewing system history. The most important property of an audit trail is reliability—developers need to trust that every change was recorded correctly.

If the logging logic lives only in application code, it is easy for future updates to accidentally skip it. For example, a developer might add a new server action, a background job, or a migration script that updates shipment statuses but forgets to include the audit logging logic. Over time, this can lead to incomplete logs, which makes debugging harder because the audit trail no longer reflects the true history of the system.

## 1. Schema

```sql
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references shipments(id) on delete cascade,
  old_status text not null check (old_status in ('Pending', 'In Transit', 'Delivered')),
  new_status text not null check (new_status in ('Pending', 'In Transit', 'Delivered')),
  changed_at timestamptz not null default now()
);
```

Column rationale:
- `id`: stable unique key for each log row.
- `shipment_id`: links each event to the related shipment.
- `old_status`: captures the status before update.
- `new_status`: captures the status after update.
- `changed_at`: timestamp of when the status change was recorded.

## 2. RLS

`audit_logs` has RLS enabled:

```sql
alter table audit_logs enable row level security;
```

No `anon`/`authenticated` insert, update, or delete policies are created on `audit_logs`.  
Reason: this is a tamper-resistant system log table. Application users should not be able to write, edit, or remove log rows directly.

## 3. Mechanism

Chosen approach: **Database Trigger**.

```sql
create or replace function log_shipment_status_change()
returns trigger as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into audit_logs (shipment_id, old_status, new_status, changed_at)
    values (NEW.id, OLD.status, NEW.status, now());
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists shipment_status_audit on shipments;
create trigger shipment_status_audit
  after update of status on shipments
  for each row
  execute function log_shipment_status_change();
```

Why this mechanism:
- Logging is guaranteed for every shipment status update, regardless of which application path performs the update.
- Logging stays close to the data rule, so future endpoints/jobs/scripts cannot accidentally skip audit writes.
- `security definer` keeps insert reliability even when table RLS blocks direct user writes.

## 4. Trade-offs (Compared to Server Action Logging)

Advantage of server action approach:
- Easier to include richer app-level metadata (e.g., user agent, request id) directly from request context.

Disadvantage of server action approach:
- Audit coverage is incomplete if any future code path updates `shipments` without going through that specific server action.
