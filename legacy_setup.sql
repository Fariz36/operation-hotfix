-- Operation Hotfix - Initial DB Setup
-- Run this in Supabase SQL Editor

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text not null check (status in ('Pending', 'In Transit', 'Delivered')),
  cargo_details jsonb
);

alter table shipments enable row level security;

-- CHANGES FOR BUG 1
create policy "Allow anon read valid shipment statuses"
  on shipments
  for select
  to anon
  using (status in ('Pending', 'In Transit', 'Delivered'));

create policy "Allow anon update"
  on shipments
  for update
  using (true)
  with check (true);

create or replace function prevent_delivered_to_pending()
returns trigger as $$
begin
  if OLD.status = 'Delivered' and NEW.status = 'Pending' then
    raise exception 'Cannot revert a delivered shipment to pending status';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger check_status_transition
  before update on shipments
  for each row
  execute function prevent_delivered_to_pending();

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references shipments(id) on delete cascade,
  old_status text not null check (old_status in ('Pending', 'In Transit', 'Delivered')),
  new_status text not null check (new_status in ('Pending', 'In Transit', 'Delivered')),
  changed_at timestamptz not null default now()
);

alter table audit_logs enable row level security;

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

insert into shipments (status, cargo_details) values
  ('Pending',    '[{"item": "Laptop Batch A", "weight_kg": 120}]'),
  ('In Transit', '[{"item": "Medical Supplies", "weight_kg": 45}]'),
  ('Delivered',  '[{"item": "Office Furniture", "weight_kg": 310}]'),
  ('Pending',    null),
  ('In Transit', '[{"item": "Electronic Components", "weight_kg": 67}]');
