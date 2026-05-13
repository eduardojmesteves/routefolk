-- ============================================================
-- routefolk — 012_date_consistency_triggers.sql
-- DB-level date consistency hardening.
--
-- Run manually in Supabase SQL Editor before deploying app code
-- that expects schema version 012.
--
-- This migration deliberately enforces date-only fields that the DB can
-- validate unambiguously:
--   - stage planned dates inside the parent trip range
--   - expense dates inside the parent trip range
--   - expense stage assignment belongs to the same trip
--
-- Journal timestamps are not enforced here because they are stored as
-- timestamptz while the app captures local datetime values. Without storing
-- the user's intended timezone, a strict DB trigger can reject valid entries
-- around midnight. Keep that validation in the UI until timezone handling is
-- modelled explicitly.
-- ============================================================

-- Keep stages inside their parent trip date range.
create or replace function public.validate_stage_date_inside_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  if new.planned_date is null then
    return new;
  end if;

  select t.start_date, t.end_date
    into v_start, v_end
  from public.trips t
  where t.id = new.trip_id;

  if not found then
    raise exception 'Trip not found for stage %', new.id
      using errcode = '23503';
  end if;

  if v_start is not null and new.planned_date < v_start then
    raise exception 'Stage planned date % is before trip start date %', new.planned_date, v_start
      using errcode = '23514';
  end if;

  if v_end is not null and new.planned_date > v_end then
    raise exception 'Stage planned date % is after trip end date %', new.planned_date, v_end
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_stage_date_inside_trip on public.stages;
create trigger trg_validate_stage_date_inside_trip
before insert or update of trip_id, planned_date
on public.stages
for each row
execute function public.validate_stage_date_inside_trip();

-- Keep expenses inside their parent trip date range.
-- Also re-check optional stage assignment belongs to the same trip.
create or replace function public.validate_expense_date_inside_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_stage_trip uuid;
begin
  select t.start_date, t.end_date
    into v_start, v_end
  from public.trips t
  where t.id = new.trip_id;

  if not found then
    raise exception 'Trip not found for expense %', new.id
      using errcode = '23503';
  end if;

  if new.date is not null then
    if v_start is not null and new.date < v_start then
      raise exception 'Expense date % is before trip start date %', new.date, v_start
        using errcode = '23514';
    end if;

    if v_end is not null and new.date > v_end then
      raise exception 'Expense date % is after trip end date %', new.date, v_end
        using errcode = '23514';
    end if;
  end if;

  if new.stage_id is not null then
    select s.trip_id
      into v_stage_trip
    from public.stages s
    where s.id = new.stage_id;

    if not found then
      raise exception 'Stage not found for expense stage assignment'
        using errcode = '23503';
    end if;

    if v_stage_trip <> new.trip_id then
      raise exception 'Expense stage assignment must belong to the same trip'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_expense_date_inside_trip on public.expenses;
create trigger trg_validate_expense_date_inside_trip
before insert or update of trip_id, stage_id, date
on public.expenses
for each row
execute function public.validate_expense_date_inside_trip();

-- Prevent trip date edits that would make existing stages or expenses invalid.
create or replace function public.validate_trip_date_range_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.start_date is not null and exists (
    select 1
    from public.stages s
    where s.trip_id = new.id
      and s.planned_date is not null
      and s.planned_date < new.start_date
  ) then
    raise exception 'Trip start date cannot be after existing stage dates'
      using errcode = '23514';
  end if;

  if new.end_date is not null and exists (
    select 1
    from public.stages s
    where s.trip_id = new.id
      and s.planned_date is not null
      and s.planned_date > new.end_date
  ) then
    raise exception 'Trip end date cannot be before existing stage dates'
      using errcode = '23514';
  end if;

  if new.start_date is not null and exists (
    select 1
    from public.expenses e
    where e.trip_id = new.id
      and e.date is not null
      and e.date < new.start_date
  ) then
    raise exception 'Trip start date cannot be after existing expense dates'
      using errcode = '23514';
  end if;

  if new.end_date is not null and exists (
    select 1
    from public.expenses e
    where e.trip_id = new.id
      and e.date is not null
      and e.date > new.end_date
  ) then
    raise exception 'Trip end date cannot be before existing expense dates'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_trip_date_range_children on public.trips;
create trigger trg_validate_trip_date_range_children
before update of start_date, end_date
on public.trips
for each row
execute function public.validate_trip_date_range_children();

insert into public.app_meta (key, value, updated_at)
values ('schema_version', '012', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;
