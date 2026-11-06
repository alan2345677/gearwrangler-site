-- =====================================================================
-- Handbook: the database behind "Log into your expedition".
--
-- Paste ALL of this into Supabase > SQL Editor > New query, then click Run.
-- Safe to run again later: it updates the rules and leaves your data alone.
--
-- What it sets up:
--   trips      one row per expedition, with its participant code, staff code, and the
--              trip info its staff fill in (meeting point, airport, notes)
--   members    one row per person per trip (name, role, gear, staff check, 1-1, flights)
--   messages   the trip board, plus each participant's private thread with staff
--
-- The rules (enforced here, on the server, not in the website):
--   - You only see a trip after entering its code.
--   - Staff codes are checked here and never sent to participants.
--   - Participants see their crew's names, not each other's gear or 1-1s.
--   - Flights: you always see your own, and the trip's staff see everyone's. The rest of
--     the crew sees yours only if you choose to share them.
--   - Only a trip's own staff can change its trip info, and the edit is signed with their name.
--   - You can edit or delete your own messages, and nobody else's. Edits are marked as edited.
--   - Super admins can join any trip as "WLV admin" (with staff powers) and leave it again.
--     They show up in that trip's crew list. Removing someone as an admin takes them off
--     every trip they joined this way.
--   - A private thread is visible only to that participant and the trip's staff.
--   - Only staff can verify gear, and only on their own trip.
--   - 10 wrong codes in an hour locks that account out of code guessing for the hour.
--   - Super admins (listed in the admins table) can add trips, including ones that aren't
--     on the public expedition list, change codes, and add or remove other admins on the
--     site. They see each trip's codes and head counts, not its people, gear, or messages.
--     Nobody can make themselves an admin: the first one is added here, by hand.
-- =====================================================================


-- ---------- Tables ----------

create table if not exists public.trips (
  id            text primary key,          -- a short name you pick, e.g. 'patagonia-2026'
  expedition_id text not null,             -- the expedition's id in expeditions.json
  code          text not null unique,      -- participant code, e.g. 'PATAGONIA-7KQ3'
  staff_code    text not null unique,      -- staff code, e.g. 'PATAGONIA-STAFF-X9M2'
  starts        date,                      -- first day, for the countdown
  name          text,                      -- shown only if the expedition list doesn't have it
  location      text,
  dates         text,                      -- e.g. 'Dec. 28, 2026 - Jan. 5, 2027'
  ends          date,
  created_at    timestamptz not null default now(),
  constraint codes_differ check (code <> staff_code)
);

create table if not exists public.members (
  id              uuid primary key default gen_random_uuid(),
  trip_id         text not null references public.trips(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 40),
  about           text not null default '' check (char_length(about) <= 80),
  role            text not null check (role in ('participant', 'vf', 'guide')),
  booking_url     text check (booking_url is null or (booking_url like 'https://%' and char_length(booking_url) <= 300)),
  gear            jsonb not null default '{}'::jsonb check (pg_column_size(gear) < 20000),
  gear_updated_at timestamptz,
  review          jsonb,
  one_on_one      jsonb check (one_on_one is null or pg_column_size(one_on_one) < 1000),
  joined_at       timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index if not exists members_user_idx on public.members (user_id);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  trip_id     text not null references public.trips(id) on delete cascade,
  author_id   uuid references public.members(id) on delete set null,
  author_name text not null,
  author_role text not null,
  thread      uuid references public.members(id) on delete cascade,  -- empty = trip board; else that participant's private thread
  text        text not null check (char_length(text) between 1 and 2000),
  at          timestamptz not null default now()
);
create index if not exists messages_trip_idx on public.messages (trip_id, at);

create table if not exists public.code_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists code_attempts_idx on public.code_attempts (user_id, at);

-- Super admins. Add one in the SQL Editor (see SUPABASE-SETUP.md):
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
-- After that, admins can add other admins on the site (Manage trips > Admins).
create table if not exists public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now()
);

-- Added Nov 2026: trip info and flights. Leaves existing rows alone.
alter table public.trips   add column if not exists info jsonb
  check (info is null or pg_column_size(info) < 6000);
alter table public.members add column if not exists travel jsonb
  check (travel is null or pg_column_size(travel) < 3000);
alter table public.members add column if not exists travel_shared boolean not null default false;
alter table public.messages add column if not exists edited_at timestamptz;
-- Added Nov 2026: 'admin' is a super admin who joined from Manage trips.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check
  check (role in ('participant', 'vf', 'guide', 'admin'));

alter table public.trips         enable row level security;
alter table public.members       enable row level security;
alter table public.messages      enable row level security;
alter table public.code_attempts enable row level security;
alter table public.admins        enable row level security;


-- ---------- Codes: tidy them so 'patagonia 7kq3' and 'PATAGONIA-7KQ3' match ----------

create or replace function public.normal_code(c text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(upper(coalesce(c, '')), '[^A-Z0-9]+', '-', 'g'))
$$;

create or replace function public.trips_tidy() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.code := public.normal_code(new.code);
  new.staff_code := public.normal_code(new.staff_code);
  if exists (select 1 from public.trips t where t.id <> new.id
             and (t.code = new.staff_code or t.staff_code = new.code)) then
    raise exception 'That code is already used by another trip. Pick a different one.';
  end if;
  return new;
end $$;
drop trigger if exists trips_tidy on public.trips;
create trigger trips_tidy before insert or update on public.trips
  for each row execute function public.trips_tidy();


-- ---------- Helpers used by the rules ----------

create or replace function public.my_member_id(p_trip text) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.trip_id = p_trip and m.user_id = auth.uid()
$$;

create or replace function public.is_staff(p_trip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
                 where m.trip_id = p_trip and m.user_id = auth.uid() and m.role in ('vf', 'guide', 'admin'))
$$;

-- A trip as the website expects it. Codes are included only for the right people.
create or replace function public.trip_json(t public.trips, p_role text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', t.id,
    'expeditionId', t.expedition_id,
    'starts', t.starts,
    'code', case when p_role in ('participant', 'staff') then t.code end,
    'staffCode', case when p_role = 'staff' then t.staff_code end,
    'info', case when p_role in ('participant', 'staff') then t.info end,
    'fallback', jsonb_strip_nulls(jsonb_build_object('name', t.name, 'location', t.location, 'when', t.dates, 'endsBy', t.ends))
  ))
$$;

-- True while this account is under 10 wrong codes in the last hour.
create or replace function public.code_tries_left() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.code_attempts a
          where a.user_id = auth.uid() and a.at > now() - interval '1 hour') < 10
$$;


-- ---------- What the website calls ----------

-- Look up a code. Returns the trip and whether it's a participant or staff code.
create or replace function public.find_trip_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c text := public.normal_code(p_code);
  t public.trips;
  r text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if c = '' then return null; end if;
  if not public.code_tries_left() then return jsonb_build_object('error', 'too_many'); end if;
  select * into t from public.trips where code = c;
  if found then r := 'participant';
  else
    select * into t from public.trips where staff_code = c;
    if found then r := 'staff'; end if;
  end if;
  if r is null then
    insert into public.code_attempts (user_id) values (auth.uid());
    return null;
  end if;
  return jsonb_build_object('role', r, 'trip', public.trip_json(t, null));
end $$;

-- Join a trip with its code. Returns your member id (the existing one if you'd already joined),
-- or nothing if the code is wrong. Wrong codes count toward the hourly limit.
create or replace function public.join_trip(
  p_code text, p_name text, p_about text default '', p_role text default null,
  p_booking_url text default null, p_gear jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c text := public.normal_code(p_code);
  t public.trips;
  r text;
  mid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not public.code_tries_left() then raise exception 'too_many'; end if;
  select * into t from public.trips where code = c;
  if found then r := 'participant';
  else
    select * into t from public.trips where staff_code = c;
    if found then r := case when p_role = 'guide' then 'guide' else 'vf' end; end if;
  end if;
  if r is null then
    insert into public.code_attempts (user_id) values (auth.uid());
    return null;
  end if;

  select m.id into mid from public.members m where m.trip_id = t.id and m.user_id = auth.uid();
  if mid is not null then return mid; end if;

  insert into public.members (trip_id, user_id, name, about, role, booking_url, gear, gear_updated_at)
  values (
    t.id, auth.uid(), left(trim(p_name), 40), left(trim(coalesce(p_about, '')), 80), r,
    case when r = 'participant' then null else nullif(trim(coalesce(p_booking_url, '')), '') end,
    case when r = 'participant' then coalesce(p_gear, '{}'::jsonb) else '{}'::jsonb end,
    case when r = 'participant' then now() end
  )
  returning id into mid;
  return mid;
end $$;

-- One of your trips: p_trip if you're on it, otherwise the one you most recently joined.
-- (Dropped first because it gained the p_trip input in Nov 2026.)
drop function if exists public.my_trip();
create or replace function public.my_trip(p_trip text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'memberId', m.id,
    'role', case when m.role = 'participant' then 'participant' else 'staff' end,
    'trip', public.trip_json(t, case when m.role = 'participant' then 'participant' else 'staff' end))
  from public.members m join public.trips t on t.id = m.trip_id
  where m.user_id = auth.uid()
  order by (m.trip_id is not distinct from p_trip) desc, m.joined_at desc
  limit 1
$$;

-- Every trip you're on, for switching between them.
create or replace function public.my_trips() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'memberId', m.id, 'memberRole', m.role,
      'trip', public.trip_json(t, null) || jsonb_build_object('ends', t.ends))
    order by t.starts nulls last, t.created_at), '[]'::jsonb)
  from public.members m join public.trips t on t.id = m.trip_id
  where m.user_id = auth.uid()
$$;

-- Everyone on your trip. Staff see everything; participants see names and roles,
-- plus their own gear, staff check, and 1-1, and the flights of anyone who shares them.
-- (Dropped first because the columns it returns changed in Nov 2026.)
drop function if exists public.trip_members(text);
create function public.trip_members(p_trip text)
returns table (id uuid, name text, about text, role text, booking_url text, gear jsonb,
               gear_updated_at timestamptz, review jsonb, one_on_one jsonb, joined_at timestamptz,
               travel jsonb, travel_shared boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.about, m.role,
    case when m.role <> 'participant' then m.booking_url end,
    case when x.full then m.gear end,
    case when x.full then m.gear_updated_at end,
    case when x.full then m.review end,
    case when x.full then m.one_on_one end,
    m.joined_at,
    case when x.full or m.travel_shared then m.travel end,
    m.travel_shared
  from public.members m
  cross join lateral (select (m.user_id = auth.uid() or public.is_staff(p_trip)) as full) x
  where m.trip_id = p_trip and public.my_member_id(p_trip) is not null
  order by m.joined_at
$$;

-- Flights, tidied: only the expected fields, short, and dates/times in a fixed format.
-- A flight is { flight, airport, date 'YYYY-MM-DD', time 'HH:MM' } for arriving and for leaving.
create or replace function public.clean_leg(l jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'flight',  nullif(left(trim(coalesce(l->>'flight', '')), 40), ''),
    'airport', nullif(left(trim(coalesce(l->>'airport', '')), 60), ''),
    'date',    case when coalesce(l->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then l->>'date' end,
    'time',    case when coalesce(l->>'time', '') ~ '^\d{2}:\d{2}$' then l->>'time' end
  )), '{}'::jsonb)
$$;
create or replace function public.clean_travel(t jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'arrive', public.clean_leg(case when jsonb_typeof(t->'arrive') = 'object' then t->'arrive' end),
    'depart', public.clean_leg(case when jsonb_typeof(t->'depart') = 'object' then t->'depart' end)
  )), '{}'::jsonb)
$$;

-- Trip info, filled in by the trip's staff: where and when to meet, which airport to fly
-- into, when to book flights home after, and notes. Saving empty fields clears them.
-- Returns what was saved, signed with the staff member's name.
create or replace function public.set_trip_info(p_trip text, p_info jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.members;
  clean jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into me from public.members m
    where m.trip_id = p_trip and m.user_id = auth.uid() and m.role in ('vf', 'guide', 'admin');
  if me.id is null then raise exception 'Only this trip''s staff can do that.'; end if;
  clean := jsonb_strip_nulls(jsonb_build_object(
    'meetPlace',   nullif(left(trim(coalesce(p_info->>'meetPlace', '')), 200), ''),
    'meetTime',    nullif(left(trim(coalesce(p_info->>'meetTime', '')), 100), ''),
    'airport',     nullif(left(trim(coalesce(p_info->>'airport', '')), 120), ''),
    'departAfter', nullif(left(trim(coalesce(p_info->>'departAfter', '')), 100), ''),
    'notes',       nullif(left(trim(coalesce(p_info->>'notes', '')), 2000), '')));
  if clean = '{}'::jsonb then
    update public.trips set info = null where id = p_trip;
    return null;
  end if;
  clean := clean || jsonb_build_object('byName', me.name, 'at', now());
  update public.trips set info = clean where id = p_trip;
  return clean;
end $$;


-- ---------- Super admins ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

create or replace function public.admin_only() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not public.is_admin() then raise exception 'Only super admins can do that.'; end if;
end $$;

-- Codes an admin sets must be hard to guess, and not used by any other trip.
create or replace function public.check_new_codes(p_trip text, p_code text, p_staff text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  c text := public.normal_code(p_code);
  s text := public.normal_code(p_staff);
begin
  if char_length(c) < 8 or c !~ '[0-9]' or char_length(s) < 8 or s !~ '[0-9]' then
    raise exception 'Codes need at least 8 characters, including a number, so they''re hard to guess.';
  end if;
  if char_length(c) > 40 or char_length(s) > 40 then raise exception 'Keep codes under 40 characters.'; end if;
  if c = s then raise exception 'The participant and staff codes must be different.'; end if;
  if exists (select 1 from public.trips t where t.id is distinct from p_trip
             and (t.code in (c, s) or t.staff_code in (c, s))) then
    raise exception 'That code is already used by another trip. Pick a different one.';
  end if;
end $$;

-- Every trip, with its codes and head counts. Admins only.
create or replace function public.admin_trips() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_only();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'expeditionId', t.expedition_id, 'code', t.code, 'staffCode', t.staff_code,
      'starts', t.starts, 'ends', t.ends, 'createdAt', t.created_at,
      'fallback', jsonb_strip_nulls(jsonb_build_object('name', t.name, 'location', t.location, 'when', t.dates, 'endsBy', t.ends)),
      'participants', (select count(*) from public.members m where m.trip_id = t.id and m.role = 'participant'),
      'staff', (select count(*) from public.members m where m.trip_id = t.id and m.role in ('vf', 'guide')),
      'joined', exists (select 1 from public.members m where m.trip_id = t.id and m.user_id = auth.uid()),
      'joinedAs', (select m.role from public.members m where m.trip_id = t.id and m.user_id = auth.uid())
    ) order by t.starts nulls last, t.created_at)
    from public.trips t), '[]'::jsonb);
end $$;

-- Add a trip. Either pick an expedition from the public list (p_expedition_id), or leave
-- that empty and type in a name, location, and dates for a trip that isn't on the list.
-- For listed expeditions the name, location, and dates are kept as a backup in case it
-- later drops off the list. Returns the new trip's id.
create or replace function public.admin_add_trip(
  p_expedition_id text, p_code text, p_staff_code text, p_starts date, p_ends date,
  p_name text default null, p_location text default null, p_dates text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  exp_id text := trim(coalesce(p_expedition_id, ''));
  nm text := nullif(left(trim(coalesce(p_name, '')), 120), '');
  base text;
  new_id text;
  n int := 1;
begin
  perform public.admin_only();
  if exp_id = '' then
    if nm is null then raise exception 'Add the trip''s name.'; end if;
    exp_id := 'custom-' || trim(both '-' from left(regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'), 50));
    if exp_id = 'custom-' then exp_id := 'custom-trip'; end if;
  end if;
  if p_starts is null then raise exception 'Add the first day.'; end if;
  if p_ends is not null and p_ends < p_starts then raise exception 'The last day is before the first day.'; end if;
  perform public.check_new_codes(null, p_code, p_staff_code);
  base := left(regexp_replace(lower(exp_id), '[^a-z0-9]+', '-', 'g'), 60) || '-' || to_char(p_starts, 'YYYY');
  new_id := base;
  while exists (select 1 from public.trips where id = new_id) loop
    n := n + 1;
    new_id := base || '-' || n;
  end loop;
  insert into public.trips (id, expedition_id, code, staff_code, starts, ends, name, location, dates)
  values (new_id, exp_id, p_code, p_staff_code, p_starts, p_ends,
          nm, nullif(left(trim(coalesce(p_location, '')), 120), ''), nullif(left(trim(coalesce(p_dates, '')), 80), ''));
  return new_id;
end $$;

-- Change a trip's codes and dates, plus its name, location, and dates text if those are
-- given (left empty = unchanged). People already on the trip stay on it.
create or replace function public.admin_update_trip(
  p_trip text, p_code text, p_staff_code text, p_starts date, p_ends date,
  p_name text default null, p_location text default null, p_dates text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_only();
  if not exists (select 1 from public.trips where id = p_trip) then raise exception 'That trip no longer exists.'; end if;
  if p_starts is null then raise exception 'Add the first day.'; end if;
  if p_ends is not null and p_ends < p_starts then raise exception 'The last day is before the first day.'; end if;
  if p_name is not null and trim(p_name) = '' then raise exception 'Add the trip''s name.'; end if;
  perform public.check_new_codes(p_trip, p_code, p_staff_code);
  update public.trips set code = p_code, staff_code = p_staff_code, starts = p_starts, ends = p_ends,
    name     = case when p_name is null then name else left(trim(p_name), 120) end,
    location = case when p_location is null then location else nullif(left(trim(p_location), 120), '') end,
    dates    = case when p_dates is null then dates else nullif(left(trim(p_dates), 80), '') end
  where id = p_trip;
end $$;

-- Everyone who is a super admin. Admins only.
create or replace function public.admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_only();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', a.user_id, 'email', u.email, 'addedAt', a.added_at, 'addedBy', b.email,
      'you', a.user_id = auth.uid()) order by a.added_at)
    from public.admins a
    join auth.users u on u.id = a.user_id
    left join auth.users b on b.id = a.added_by), '[]'::jsonb);
end $$;

-- Make someone an admin by their account email. They need an account on the site first.
create or replace function public.admin_add_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  perform public.admin_only();
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if uid is null then
    raise exception 'No account uses that email yet. Ask them to create one on My trip, then add them.';
  end if;
  insert into public.admins (user_id, added_by) values (uid, auth.uid()) on conflict (user_id) do nothing;
  return public.admin_list_admins();
end $$;

-- Remove an admin. You can't remove yourself, so there's always at least one admin.
create or replace function public.admin_remove_admin(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_only();
  if p_user = auth.uid() then raise exception 'You can''t remove yourself. Ask another admin.'; end if;
  delete from public.admins where user_id = p_user;
  delete from public.members where user_id = p_user and role = 'admin';  -- off the trips they joined as admin
  return public.admin_list_admins();
end $$;


-- Join a trip as "WLV admin", with staff powers. If you're already on it, nothing changes.
create or replace function public.admin_join_trip(p_trip text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nm text := left(trim(coalesce(p_name, '')), 40);
  mid uuid;
begin
  perform public.admin_only();
  if nm = '' then raise exception 'Add your name, as crews will see it.'; end if;
  if not exists (select 1 from public.trips where id = p_trip) then raise exception 'That trip no longer exists.'; end if;
  select m.id into mid from public.members m where m.trip_id = p_trip and m.user_id = auth.uid();
  if mid is not null then return mid; end if;
  insert into public.members (trip_id, user_id, name, role) values (p_trip, auth.uid(), nm, 'admin')
  returning id into mid;
  return mid;
end $$;

-- Join every trip that hasn't ended. Returns how many you joined.
create or replace function public.admin_join_all(p_name text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  n int := 0;
begin
  perform public.admin_only();
  if trim(coalesce(p_name, '')) = '' then raise exception 'Add your name, as crews will see it.'; end if;
  for t in select tr.id from public.trips tr
           where (tr.ends is null or tr.ends >= current_date)
             and not exists (select 1 from public.members m where m.trip_id = tr.id and m.user_id = auth.uid())
  loop
    perform public.admin_join_trip(t.id, p_name);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Leave a trip you joined as "WLV admin". Your messages stay, under your name.
create or replace function public.admin_leave_trip(p_trip text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  delete from public.members where trip_id = p_trip and user_id = auth.uid() and role = 'admin';
  if not found then raise exception 'You''re not on that trip as an admin.'; end if;
end $$;


-- ---------- Guards on saving ----------

-- Saving a member: you can change your own profile, gear, and 1-1, but not your own
-- staff check or your participant/staff status. Staff can change only the staff check
-- on a participant in their own trip. Changes made in the Supabase dashboard are not limited.
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me public.members;
  incoming jsonb := new.review;
begin
  if auth.uid() is null then return new; end if;

  new.id := old.id; new.trip_id := old.trip_id; new.user_id := old.user_id; new.joined_at := old.joined_at;

  if old.user_id = auth.uid() then
    new.review := old.review;
    if old.role = 'participant' then new.role := 'participant';
    elsif old.role = 'admin' then new.role := 'admin';
    elsif new.role not in ('vf', 'guide') then new.role := old.role;
    end if;
    if new.role = 'participant' then new.booking_url := null; end if;
    new.booking_url := nullif(trim(coalesce(new.booking_url, '')), '');
    new.travel := public.clean_travel(new.travel);
    new.travel_shared := coalesce(new.travel_shared, false);
    return new;
  end if;

  select * into me from public.members m
    where m.trip_id = old.trip_id and m.user_id = auth.uid() and m.role in ('vf', 'guide', 'admin');
  if me.id is null or old.role <> 'participant' then
    raise exception 'Only this trip''s staff can do that.';
  end if;

  new := old;
  if incoming is not null and incoming is distinct from old.review then
    if coalesce(incoming->>'status', '') not in ('verified', 'changes') then
      raise exception 'Unknown gear check.';
    end if;
    new.review := jsonb_build_object(
      'status',  incoming->>'status',
      'note',    left(coalesce(incoming->>'note', ''), 500),
      'gearSig', coalesce(incoming->>'gearSig', ''),
      'byId',    me.id,
      'byName',  me.name,
      'at',      now());
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members
  for each row execute function public.members_guard();

-- Posting a message: the name, role, and time come from the server, not the browser.
create or replace function public.messages_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.members;
begin
  select * into a from public.members m where m.id = new.author_id;
  if a.id is null then raise exception 'Unknown author.'; end if;
  new.author_name := a.name;
  new.author_role := a.role;
  new.at := now();
  return new;
end $$;
drop trigger if exists messages_fill on public.messages;
create trigger messages_fill before insert on public.messages
  for each row execute function public.messages_fill();

-- Editing a message: only the text changes, and it's marked as edited.
create or replace function public.messages_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  new.id := old.id; new.trip_id := old.trip_id; new.author_id := old.author_id;
  new.author_name := old.author_name; new.author_role := old.author_role;
  new.thread := old.thread; new.at := old.at;
  new.edited_at := case when new.text is distinct from old.text then now() else old.edited_at end;
  return new;
end $$;
drop trigger if exists messages_edit on public.messages;
create trigger messages_edit before update on public.messages
  for each row execute function public.messages_edit();


-- ---------- Who can read and write what ----------

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_staff(trip_id));

drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using      (user_id = auth.uid() or (public.is_staff(trip_id) and role = 'participant'))
  with check (user_id = auth.uid() or (public.is_staff(trip_id) and role = 'participant'));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.my_member_id(trip_id) is not null
         and (thread is null or thread = public.my_member_id(trip_id) or public.is_staff(trip_id)));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    author_id = public.my_member_id(trip_id)
    and (
      thread is null
      or (thread = author_id and not public.is_staff(trip_id))
      or (public.is_staff(trip_id) and exists (
            select 1 from public.members p
            where p.id = thread and p.trip_id = messages.trip_id and p.role = 'participant'))
    ));

-- Your own messages only.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using      (author_id is not null and author_id = public.my_member_id(trip_id))
  with check (author_id is not null and author_id = public.my_member_id(trip_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (author_id is not null and author_id = public.my_member_id(trip_id));

-- Table access: nothing for signed-out visitors. Signed-in people go through the rules above.
revoke all on public.trips, public.members, public.messages, public.code_attempts, public.admins from anon, authenticated;
grant select, update on public.members to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant update (text) on public.messages to authenticated;  -- the text only

-- Function access.
revoke execute on function
  public.normal_code(text), public.trips_tidy(), public.my_member_id(text), public.is_staff(text),
  public.trip_json(public.trips, text), public.code_tries_left(), public.find_trip_code(text),
  public.join_trip(text, text, text, text, text, jsonb), public.my_trip(text), public.my_trips(), public.trip_members(text),
  public.admin_join_trip(text, text), public.admin_join_all(text), public.admin_leave_trip(text),
  public.members_guard(), public.messages_fill(), public.messages_edit(),
  public.clean_leg(jsonb), public.clean_travel(jsonb), public.set_trip_info(text, jsonb),
  public.is_admin(), public.admin_only(), public.check_new_codes(text, text, text), public.admin_trips(),
  public.admin_add_trip(text, text, text, date, date, text, text, text),
  public.admin_update_trip(text, text, text, date, date, text, text, text),
  public.admin_list_admins(), public.admin_add_admin(text), public.admin_remove_admin(uuid)
  from public, anon, authenticated;
grant execute on function
  public.my_member_id(text), public.is_staff(text), public.find_trip_code(text),
  public.join_trip(text, text, text, text, text, jsonb), public.my_trip(text), public.my_trips(), public.trip_members(text),
  public.set_trip_info(text, jsonb),
  public.admin_join_trip(text, text), public.admin_join_all(text), public.admin_leave_trip(text),
  public.is_admin(), public.admin_trips(),
  public.admin_add_trip(text, text, text, date, date, text, text, text),
  public.admin_update_trip(text, text, text, date, date, text, text, text),
  public.admin_list_admins(), public.admin_add_admin(text), public.admin_remove_admin(uuid)
  to authenticated;

select 'Setup done. Next: run check.sql.' as result;
