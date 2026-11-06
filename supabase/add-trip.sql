-- =====================================================================
-- Add a trip by hand. Easier: on the site, My trip > Manage trips > Add a trip (super admins).
-- Or edit the values below, then paste into a new SQL Editor query and click Run.
-- (Or use Table Editor > trips > Insert row. Same fields.)
--
-- Codes: make them hard to guess. Add 4 random letters and numbers, e.g.
-- PATAGONIA-7KQ3, not just PATAGONIA. Spaces and lowercase are tidied automatically.
--
-- expedition_id must match the trip's id in expeditions.json, for example:
--   undergrad-vodudahue-cloud-forest-patagonia    undergrad-atacama-desert
--   mba-corsica    mba-valley-of-marvels-french-alps    mba-atacama-desert
--   mba-andes-mountaineering    mba-antarctica    mba-aotearoa-southern-traverse-nz
--   mba-avellano-valley-patagonia    mba-vodudahue-cloud-forest-patagonia    mba-small-crew-sailing
--
-- To change a code later (e.g. if it leaked): Manage trips on the site, or Table Editor > trips.
-- People already on the trip stay on it.
-- =====================================================================

insert into public.trips (id, expedition_id, code, staff_code, starts, name, location, dates, ends)
values (
  'patagonia-2026',                                -- any short name, never shown
  'undergrad-vodudahue-cloud-forest-patagonia',    -- from the list above
  'PATAGONIA-7KQ3',                                -- participant code (change this!)
  'PATAGONIA-STAFF-X9M2',                          -- staff code (change this!)
  '2026-12-28',                                    -- first day, for the countdown
  'Vodudahue Cloud Forest - Patagonia',            -- backup name, location, and dates,
  'Pumalin Park, Chile',                           --   shown only if the expedition list
  'Dec. 28, 2026 - Jan. 5, 2027',                  --   doesn't have them
  '2027-01-05'                                     -- last day
);

select 'Trip added: share the participant code with your crew.' as result;
