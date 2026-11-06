-- =====================================================================
-- Handbook: check the "Log into your expedition" rules.
--
-- Run this after setup.sql: paste it into a NEW query in the SQL Editor and click Run.
-- It makes up a few people and two trips, tries everything they should and
-- shouldn't be able to do, then removes them. Nothing is left behind.
--
--   "All checks passed"  -> the rules work.
--   An error             -> copy the message and send it to Claude.
-- =====================================================================

do $$
declare
  u_vf  uuid := gen_random_uuid();
  u_p1  uuid := gen_random_uuid();
  u_p2  uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  u_b   uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid();
  m_vf uuid; m_p1 uuid; m_p2 uuid; m_b uuid; m_adm uuid;
  j jsonb; n int; ok boolean; i int; msg_id uuid;
begin
  -- Setup, as the dashboard would.
  insert into auth.users (id, email) values
    (u_vf,  'zz-vf@check.invalid'),  (u_p1, 'zz-p1@check.invalid'), (u_p2, 'zz-p2@check.invalid'),
    (u_out, 'zz-out@check.invalid'), (u_b,  'zz-b@check.invalid'), (u_adm, 'zz-adm@check.invalid');
  insert into public.trips (id, expedition_id, code, staff_code, starts, name) values
    ('zz-check-a', 'zz-a', 'zz check a', 'zz check a staff', '2030-01-01', 'Check A'),
    ('zz-check-b', 'zz-b', 'ZZ-CHECK-B', 'ZZ-CHECK-B-STAFF', '2030-02-01', 'Check B');
  if ((select code from public.trips where id = 'zz-check-a') = 'ZZ-CHECK-A') is not true then raise exception 'Check failed: %', 'codes get tidied'; end if;

  -- Signed-in stranger: no trips, no people, no messages.
  perform set_config('request.jwt.claims', json_build_object('sub', u_out)::text, true), set_config('role', 'authenticated', true);
  begin
    perform 1 from public.trips; ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'a stranger cannot read the trips table'; end if;
  if (public.my_trip() is null) is not true then raise exception 'Check failed: %', 'a stranger has no trip'; end if;
  if (public.find_trip_code('nope-nope') is null) is not true then raise exception 'Check failed: %', 'a wrong code finds nothing'; end if;

  -- Codes.
  j := public.find_trip_code('zz-check-a');
  if (j->>'role' = 'participant') is not true then raise exception 'Check failed: %', 'participant code is recognized'; end if;
  if (j::text not like '%STAFF%') is not true then raise exception 'Check failed: %', 'looking up a participant code never shows the staff code'; end if;
  j := public.find_trip_code(' zz check a staff ');
  if (j->>'role' = 'staff') is not true then raise exception 'Check failed: %', 'staff code is recognized (spacing and case ignored)'; end if;

  -- Joining.
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  m_vf := public.join_trip('ZZ-CHECK-A-STAFF', 'Sam Okafor', 'WG''27', 'vf', 'https://calendly.com/sam');
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  m_p1 := public.join_trip('ZZ-CHECK-A', 'Maya R.', 'C''28', 'vf', null, '{"bag":{"id":"x"}}');
  if ((select role from public.trip_members('zz-check-a') where id = m_p1) = 'participant') is not true then raise exception 'Check failed: %', 'a participant code can''t make you staff'; end if;
  if (public.join_trip('ZZ-CHECK-A', 'Maya again') = m_p1) is not true then raise exception 'Check failed: %', 'joining twice keeps one profile'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p2)::text, true), set_config('role', 'authenticated', true);
  m_p2 := public.join_trip('ZZ-CHECK-A', 'Ben Carter', '', null, null, '{"bag":{"id":"y"}}');
  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true), set_config('role', 'authenticated', true);
  m_b := public.join_trip('ZZ-CHECK-B', 'Other Trip');
  if (public.join_trip('WRONG-CODE', 'X') is null) is not true then raise exception 'Check failed: %', 'joining with a wrong code does nothing'; end if;
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  if ((select count(*) from public.code_attempts where user_id = u_b) = 1) is not true then raise exception 'Check failed: %', 'a wrong code when joining counts toward the limit'; end if;

  -- What a participant sees.
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  j := public.my_trip();
  if (j->'trip'->>'code' = 'ZZ-CHECK-A' and j->'trip'->>'staffCode' is null) is not true then raise exception 'Check failed: %', 'participants see their trip code but not the staff code'; end if;
  select count(*) into n from public.trip_members('zz-check-a');
  if (n = 3) is not true then raise exception 'Check failed: %', 'participants see the whole crew'; end if;
  if ((select gear from public.trip_members('zz-check-a') where id = m_p2) is null) is not true then raise exception 'Check failed: %', 'participants can''t see each other''s gear'; end if;
  if ((select gear from public.trip_members('zz-check-a') where id = m_p1) ? 'bag') is not true then raise exception 'Check failed: %', 'participants see their own gear'; end if;
  if ((select booking_url from public.trip_members('zz-check-a') where id = m_vf) = 'https://calendly.com/sam') is not true then raise exception 'Check failed: %', 'participants see staff booking links'; end if;
  select count(*) into n from public.trip_members('zz-check-b');
  if (n = 0) is not true then raise exception 'Check failed: %', 'participants can''t see another trip''s crew'; end if;
  select count(*) into n from public.members;
  if (n = 1) is not true then raise exception 'Check failed: %', 'reading the members table directly shows only yourself'; end if;

  -- What a participant can change.
  update public.members set name = 'Maya Rao', role = 'vf',
    review = '{"status":"verified","note":"self-approved"}' where id = m_p1;
  if ((select name from public.members where id = m_p1) = 'Maya Rao') is not true then raise exception 'Check failed: %', 'you can rename yourself'; end if;
  if ((select role from public.members where id = m_p1) = 'participant') is not true then raise exception 'Check failed: %', 'you can''t make yourself staff'; end if;
  if ((select review from public.members where id = m_p1) is null) is not true then raise exception 'Check failed: %', 'you can''t verify your own gear'; end if;
  update public.members set name = 'Hacked' where id = m_p2;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'you can''t change someone else'; end if;

  -- Staff.
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  j := public.my_trip();
  if (j->'trip'->>'staffCode' = 'ZZ-CHECK-A-STAFF') is not true then raise exception 'Check failed: %', 'staff see the staff code'; end if;
  if ((select gear from public.trip_members('zz-check-a') where id = m_p2) ? 'bag') is not true then raise exception 'Check failed: %', 'staff see participants'' gear'; end if;
  update public.members set name = 'Renamed by staff',
    review = '{"status":"verified","note":"Looks good","byName":"Someone Else","gearSig":"abc"}' where id = m_p1;
  if ((select name from public.members where id = m_p1) = 'Maya Rao') is not true then raise exception 'Check failed: %', 'staff can''t rename participants'; end if;
  if ((select review->>'status' from public.members where id = m_p1) = 'verified') is not true then raise exception 'Check failed: %', 'staff can verify gear'; end if;
  if ((select review->>'byName' from public.members where id = m_p1) = 'Sam Okafor') is not true then raise exception 'Check failed: %', 'the check is signed with the real staff name'; end if;
  update public.members set review = '{"status":"verified"}' where id = m_b;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'staff can''t check gear on another trip'; end if;

  -- Messages.
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  insert into public.messages (trip_id, author_id, author_name, author_role, text)
    values ('zz-check-a', m_p1, 'Fake Name', 'vf', 'Hi crew');
  if ((select author_name from public.messages where trip_id = 'zz-check-a' and thread is null) = 'Maya Rao') is not true then raise exception 'Check failed: %', 'message names come from the server'; end if;
  insert into public.messages (trip_id, author_id, author_name, author_role, thread, text)
    values ('zz-check-a', m_p1, '', '', m_p1, 'Is my bag warm enough?');
  begin
    insert into public.messages (trip_id, author_id, author_name, author_role, thread, text)
      values ('zz-check-a', m_p1, '', '', m_p2, 'Snooping'); ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'you can''t post in someone else''s private thread'; end if;
  begin
    insert into public.messages (trip_id, author_id, author_name, author_role, text)
      values ('zz-check-a', m_vf, '', '', 'Pretending to be staff'); ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'you can''t post as someone else'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_p2)::text, true), set_config('role', 'authenticated', true);
  select count(*) into n from public.messages;
  if (n = 1) is not true then raise exception 'Check failed: %', 'other participants see the board post but not the private thread'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  select count(*) into n from public.messages where thread = m_p1;
  if (n = 1) is not true then raise exception 'Check failed: %', 'staff see private threads'; end if;
  insert into public.messages (trip_id, author_id, author_name, author_role, thread, text)
    values ('zz-check-a', m_vf, '', '', m_p1, 'Borderline. Let''s talk at your 1-1.');

  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true), set_config('role', 'authenticated', true);
  select count(*) into n from public.messages;
  if (n = 0) is not true then raise exception 'Check failed: %', 'another trip sees none of these messages'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_out)::text, true), set_config('role', 'authenticated', true);
  select count(*) into n from public.messages;
  if (n = 0) is not true then raise exception 'Check failed: %', 'a stranger sees no messages'; end if;

  -- Editing and deleting messages: your own only.
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  select id into msg_id from public.messages where trip_id = 'zz-check-a' and thread is null and author_id = m_p1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p2)::text, true), set_config('role', 'authenticated', true);
  update public.messages set text = 'Edited by someone else' where id = msg_id;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'you can''t edit someone else''s message'; end if;
  delete from public.messages where id = msg_id;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'you can''t delete someone else''s message'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  update public.messages set text = 'Edited by staff' where id = msg_id;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'staff can''t edit a participant''s message'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  begin
    update public.messages set author_name = 'Someone else' where id = msg_id; ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'editing can change only the text'; end if;
  update public.messages set text = 'Hi crew!' where id = msg_id;
  if ((select text = 'Hi crew!' and edited_at is not null and author_name = 'Maya Rao' and thread is null
       from public.messages where id = msg_id)) is not true then raise exception 'Check failed: %', 'you can edit your own message, and it''s marked edited'; end if;
  delete from public.messages where trip_id = 'zz-check-a' and thread = m_p1 and author_id = m_p1;
  get diagnostics n = row_count;
  if (n = 1) is not true then raise exception 'Check failed: %', 'you can delete your own message'; end if;
  select count(*) into n from public.messages where thread = m_p1;
  if (n = 1) is not true then raise exception 'Check failed: %', 'deleting yours leaves staff replies in place'; end if;

  -- Super admins.
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  insert into public.admins (user_id) values (u_adm);

  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  if (public.is_admin()) is not false then raise exception 'Check failed: %', 'a participant is not an admin'; end if;
  begin
    perform public.admin_trips(); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can list every trip'; end if;
  begin
    perform public.admin_add_trip('zz-new', 'ZZ-SNEAKY-1234', 'ZZ-SNEAKY-STAFF-1234', '2030-03-01', null); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can add trips'; end if;
  begin
    perform public.admin_update_trip('zz-check-a', 'ZZ-MINE-1234', 'ZZ-MINE-STAFF-1234', '2030-01-01', null); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can change codes'; end if;
  begin
    insert into public.admins (user_id) values (u_p1); ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'nobody can make themselves an admin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm)::text, true), set_config('role', 'authenticated', true);
  if (public.is_admin()) is not true then raise exception 'Check failed: %', 'an admin is an admin'; end if;
  select x into j from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'zz-check-a';
  if (j->>'code' = 'ZZ-CHECK-A' and j->>'staffCode' = 'ZZ-CHECK-A-STAFF') is not true then raise exception 'Check failed: %', 'admins see every trip''s codes'; end if;
  if ((j->>'participants')::int = 2 and (j->>'staff')::int = 1) is not true then raise exception 'Check failed: %', 'admins see head counts'; end if;
  select count(*) into n from public.trip_members('zz-check-a');
  if (n = 0) is not true then raise exception 'Check failed: %', 'admins don''t see a trip''s people without joining it'; end if;
  select count(*) into n from public.messages;
  if (n = 0) is not true then raise exception 'Check failed: %', 'admins don''t see messages without joining'; end if;
  begin
    perform public.admin_add_trip('zz-new', 'PATAGONIA', 'ZZ-NEW-STAFF-1234', '2030-03-01', null); ok := false;
  exception when others then ok := sqlerrm like '%hard to guess%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'easy-to-guess codes are refused'; end if;
  begin
    perform public.admin_add_trip('zz-new', 'ZZ-CHECK-B-STAFF-9', 'zz check b staff 9', '2030-03-01', null); ok := false;
  exception when others then ok := sqlerrm like '%different%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'participant and staff codes must differ'; end if;
  begin
    update public.trips set staff_code = 'ZZ-CHECK-B-STAFF-9' where id = 'zz-check-b'; ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'admins change trips only through the checked functions'; end if;
  perform set_config('role', 'postgres', true);
  update public.trips set staff_code = 'ZZ-CHECK-B-STAFF-9' where id = 'zz-check-b';
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_add_trip('zz-new', 'ZZ-CHECK-B-STAFF-9', 'ZZ-NEW-STAFF-1234', '2030-03-01', null); ok := false;
  exception when others then ok := sqlerrm like '%already used%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'a new code can''t match another trip''s code'; end if;
  if (public.admin_add_trip('zz-new', 'zz new 1234', 'ZZ-NEW-STAFF-1234', '2030-03-01', '2030-03-08', 'New Trip', 'Somewhere', 'March 2030') = 'zz-new-2030') is not true then raise exception 'Check failed: %', 'admins can add a trip'; end if;
  if (public.admin_add_trip('zz-new', 'ZZ-NEW-5678', 'ZZ-NEW-STAFF-5678', '2030-09-01', null) = 'zz-new-2030-2') is not true then raise exception 'Check failed: %', 'a second trip of the same expedition gets its own id'; end if;
  perform public.admin_update_trip('zz-check-a', 'ZZ-CHECK-A-NEW1', 'ZZ-CHECK-A-STAFF-NEW1', '2030-01-02', '2030-01-09');
  if ((select x->'fallback'->>'name' from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'zz-check-a') = 'Check A') is not true then raise exception 'Check failed: %', 'changing codes leaves the name alone'; end if;

  -- Trips that aren't on the public list.
  begin
    perform public.admin_add_trip(null, 'ZZ-CUSTOM-1234', 'ZZ-CUSTOM-STAFF-1234', '2030-06-01', null, '  '); ok := false;
  exception when others then ok := sqlerrm like '%name%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'a typed-in trip needs a name'; end if;
  if (public.admin_add_trip('', 'ZZ-CUSTOM-1234', 'ZZ-CUSTOM-STAFF-1234', '2030-06-01', '2030-06-07',
      'ZZ Custom Trek!', 'Somewhere, Utah', 'June 1-7, 2030') = 'custom-zz-custom-trek-2030') is not true then raise exception 'Check failed: %', 'admins can type in a trip that isn''t on the list'; end if;
  perform public.admin_update_trip('custom-zz-custom-trek-2030', 'ZZ-CUSTOM-1234', 'ZZ-CUSTOM-STAFF-1234', '2030-06-02', '2030-06-07',
    'ZZ Custom Trek', 'Moab, Utah', 'June 2-7, 2030');
  select x into j from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'custom-zz-custom-trek-2030';
  if (j->'fallback'->>'name' = 'ZZ Custom Trek' and j->'fallback'->>'location' = 'Moab, Utah' and j->>'starts' = '2030-06-02') is not true then raise exception 'Check failed: %', 'admins can change a typed-in trip''s name, place, and dates'; end if;

  -- Adding and removing admins.
  begin
    perform public.admin_add_admin('nobody-here@check.invalid'); ok := false;
  exception when others then ok := sqlerrm like '%No account%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'adding an admin needs an existing account'; end if;
  j := public.admin_add_admin(' ZZ-VF@Check.Invalid ');
  -- (Looks for the made-up person rather than counting, since real admins may exist too.)
  if (exists (select 1 from jsonb_array_elements(j) x where (x->>'userId')::uuid = u_vf)) is not true then raise exception 'Check failed: %', 'admins can add an admin by email (any case)'; end if;
  begin
    perform public.admin_remove_admin(u_adm); ok := false;
  exception when others then ok := sqlerrm like '%yourself%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'admins can''t remove themselves'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  if (public.is_admin()) is not true then raise exception 'Check failed: %', 'a newly added admin is an admin'; end if;
  if ((select count(*) from jsonb_array_elements(public.admin_list_admins()) x where (x->>'you')::boolean) = 1) is not true then raise exception 'Check failed: %', 'the admin list marks you'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  begin
    perform public.admin_add_admin('zz-p1@check.invalid'); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can add admins'; end if;
  begin
    perform public.admin_list_admins(); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can see who the admins are'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm)::text, true), set_config('role', 'authenticated', true);
  j := public.admin_remove_admin(u_vf);
  if (not exists (select 1 from jsonb_array_elements(j) x where (x->>'userId')::uuid = u_vf)) is not true then raise exception 'Check failed: %', 'admins can remove another admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  if (public.is_admin()) is not false then raise exception 'Check failed: %', 'a removed admin is no longer an admin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true), set_config('role', 'authenticated', true);
  if (public.find_trip_code('ZZ-NEW-1234')->'trip'->>'id' = 'zz-new-2030') is not true then raise exception 'Check failed: %', 'a new trip''s code works right away'; end if;
  if (public.find_trip_code('ZZ-CHECK-A') is null) is not true then raise exception 'Check failed: %', 'an old code stops working once changed'; end if;
  if (public.find_trip_code('zz check a new1')->>'role' = 'participant') is not true then raise exception 'Check failed: %', 'the changed code works'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  j := public.my_trip();
  if (j->'trip'->>'id' = 'zz-check-a' and j->'trip'->>'code' = 'ZZ-CHECK-A-NEW1') is not true then raise exception 'Check failed: %', 'people stay on a trip when its code changes, and see the new code'; end if;

  -- Flights: your own, staff see all, crew only if you share.
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  update public.members set travel_shared = false, travel =
    '{"arrive":{"flight":" LA 533 ","airport":"PMC","date":"2030-01-01","time":"09:40","seat":"12A"},"depart":{"date":"soon"},"junk":1}'
    where id = m_p1;
  j := (select travel from public.trip_members('zz-check-a') where id = m_p1);
  if (j->'arrive'->>'flight' = 'LA 533' and j->'arrive'->>'time' = '09:40') is not true then raise exception 'Check failed: %', 'you see your own flights'; end if;
  if (j->'arrive' ? 'seat' or j ? 'junk' or j ? 'depart') is not false then raise exception 'Check failed: %', 'flights keep only the expected fields'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p2)::text, true), set_config('role', 'authenticated', true);
  if ((select travel from public.trip_members('zz-check-a') where id = m_p1) is null) is not true then raise exception 'Check failed: %', 'the crew can''t see flights you haven''t shared'; end if;
  update public.members set travel = '{"arrive":{"flight":"X"}}' where id = m_p1;
  get diagnostics n = row_count;
  if (n = 0) is not true then raise exception 'Check failed: %', 'you can''t change someone else''s flights'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  if ((select travel->'arrive'->>'flight' from public.trip_members('zz-check-a') where id = m_p1) = 'LA 533') is not true then raise exception 'Check failed: %', 'staff see everyone''s flights'; end if;
  update public.members set travel = '{"arrive":{"flight":"STAFF EDIT"}}', travel_shared = true where id = m_p1;
  if ((select travel->'arrive'->>'flight' from public.trip_members('zz-check-a') where id = m_p1) = 'LA 533'
      and (select travel_shared from public.trip_members('zz-check-a') where id = m_p1) = false) is not true then raise exception 'Check failed: %', 'staff can''t change someone''s flights or sharing'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  update public.members set travel_shared = true where id = m_p1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p2)::text, true), set_config('role', 'authenticated', true);
  if ((select travel->'arrive'->>'flight' from public.trip_members('zz-check-a') where id = m_p1) = 'LA 533') is not true then raise exception 'Check failed: %', 'the crew sees flights you share'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true), set_config('role', 'authenticated', true);
  select count(*) into n from public.trip_members('zz-check-a');
  if (n = 0) is not true then raise exception 'Check failed: %', 'another trip sees none of these flights'; end if;

  -- Trip info: staff of that trip only, signed with their real name.
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  begin
    perform public.set_trip_info('zz-check-a', '{"notes":"hi"}'); ok := false;
  exception when others then ok := sqlerrm like '%staff%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'participants can''t change trip info'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  j := public.set_trip_info('zz-check-a', '{"meetPlace":"  PMC arrivals  ","notes":"Bring snacks","byName":"Fake","extra":"x"}');
  if (j->>'meetPlace' = 'PMC arrivals' and j->>'byName' = 'Sam Okafor' and not j ? 'extra') is not true then raise exception 'Check failed: %', 'trip info is tidied and signed with the real staff name'; end if;
  begin
    perform public.set_trip_info('zz-check-b', '{"notes":"x"}'); ok := false;
  exception when others then ok := sqlerrm like '%staff%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'staff can''t change another trip''s info'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  if (public.my_trip()->'trip'->'info'->>'notes' = 'Bring snacks') is not true then raise exception 'Check failed: %', 'participants see their trip info'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out)::text, true), set_config('role', 'authenticated', true);
  if (public.find_trip_code('ZZ-CHECK-A-NEW1')->'trip' ? 'info') is not false then raise exception 'Check failed: %', 'looking up a code doesn''t show trip info'; end if;

  -- Admins joining trips as "WLV admin".
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  begin
    perform public.admin_join_trip('zz-check-b', 'Not An Admin'); ok := false;
  exception when others then ok := sqlerrm like '%super admins%';
  end;
  if (ok) is not true then raise exception 'Check failed: %', 'only admins can join trips from Manage trips'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm)::text, true), set_config('role', 'authenticated', true);
  m_adm := public.admin_join_trip('zz-check-b', 'Wes Admin');
  if ((select role from public.trip_members('zz-check-b') where id = m_adm) = 'admin') is not true then raise exception 'Check failed: %', 'an admin joins as WLV admin'; end if;
  if (public.admin_join_trip('zz-check-b', 'Again') = m_adm) is not true then raise exception 'Check failed: %', 'joining twice keeps one profile'; end if;
  if ((select gear from public.trip_members('zz-check-b') where id = m_b) is not null) is not true then raise exception 'Check failed: %', 'an admin on a trip sees what staff see'; end if;
  if (public.set_trip_info('zz-check-b', '{"notes":"From WLV"}')->>'byName' = 'Wes Admin') is not true then raise exception 'Check failed: %', 'an admin on a trip can edit its trip info'; end if;
  update public.members set role = 'vf' where id = m_adm;
  if ((select role from public.trip_members('zz-check-b') where id = m_adm) = 'admin') is not true then raise exception 'Check failed: %', 'an admin can''t change their own role'; end if;
  if (((select x from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'zz-check-b')->>'staff')::int = 0) is not true then raise exception 'Check failed: %', 'admins aren''t counted as trip staff'; end if;
  if (((select x from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'zz-check-b')->>'joined')::boolean) is not true then raise exception 'Check failed: %', 'Manage trips shows which trips you''ve joined'; end if;
  if ((select x from jsonb_array_elements(public.admin_trips()) x where x->>'id' = 'zz-check-b')->>'joinedAs' = 'admin') is not true then raise exception 'Check failed: %', 'Manage trips shows how you joined'; end if;
  n := public.admin_join_all('Wes Admin');
  if (exists (select 1 from jsonb_array_elements(public.my_trips()) x where x->'trip'->>'id' = 'zz-check-a')) is not true then raise exception 'Check failed: %', 'join all adds current trips'; end if;
  if (public.my_trip('zz-check-b')->'trip'->>'id' = 'zz-check-b' and public.my_trip('zz-check-a')->'trip'->>'id' = 'zz-check-a') is not true then raise exception 'Check failed: %', 'you can open any trip you''re on'; end if;
  if (public.my_trip('not-a-trip-of-mine') is not null) is not true then raise exception 'Check failed: %', 'opening a trip you''re not on falls back to one you are on'; end if;
  perform public.admin_leave_trip('zz-check-b');
  if (not exists (select 1 from jsonb_array_elements(public.my_trips()) x where x->'trip'->>'id' = 'zz-check-b')) is not true then raise exception 'Check failed: %', 'an admin can leave a trip'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p1)::text, true), set_config('role', 'authenticated', true);
  begin
    perform public.admin_leave_trip('zz-check-a'); ok := false;
  exception when others then ok := sqlerrm like '%admin%';
  end;
  if (ok and (select count(*) from public.trip_members('zz-check-a') where id = m_p1) = 1) is not true then raise exception 'Check failed: %', 'only admin memberships can be left this way'; end if;
  if ((select count(*) from jsonb_array_elements(public.my_trips())) = 1) is not true then raise exception 'Check failed: %', 'my trips lists only your own'; end if;
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  insert into public.admins (user_id, added_by) values (u_vf, u_adm) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', u_vf)::text, true), set_config('role', 'authenticated', true);
  perform public.admin_join_trip('zz-check-b', 'Sam as admin');
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm)::text, true), set_config('role', 'authenticated', true);
  perform public.admin_remove_admin(u_vf);
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  if ((select count(*) from public.members where user_id = u_vf and role = 'admin') = 0 and (select count(*) from public.members where user_id = u_vf) = 1) is not true then raise exception 'Check failed: %', 'removing an admin takes them off trips they joined as admin, and nothing else'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out)::text, true), set_config('role', 'authenticated', true);

  -- Code guessing is limited.
  for i in 1..10 loop perform public.find_trip_code('guess-' || i); end loop;
  if (public.find_trip_code('ZZ-CHECK-A')->>'error' = 'too_many') is not true then raise exception 'Check failed: %', 'too many wrong codes locks guessing'; end if;

  -- Clean up.
  perform set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
  delete from public.trips where id in ('zz-check-a', 'zz-check-b', 'zz-new-2030', 'zz-new-2030-2', 'custom-zz-custom-trek-2030');
  delete from auth.users where id in (u_vf, u_p1, u_p2, u_out, u_b, u_adm);
end $$;

select 'All checks passed' as result;
