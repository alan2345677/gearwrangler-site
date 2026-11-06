# The Handbook (log into your expedition): setting up the real version

The logged-in side of the Handbook ("Log into your expedition") runs on **Supabase**, a free hosted database with sign-in built in. Until `trip.js` has your Supabase details, the site keeps showing the demo.

About 15 minutes, once.

## 1. Create the project

1. Go to https://supabase.com and sign up (free plan).
2. Click **New project**.
   - **Name:** `gear-wrangler`
   - **Database password:** click Generate and save it in your password manager. You won't need it day to day.
   - **Region:** East US.
3. Wait a minute or two while it's built.

## 2. Set up the database

1. In the left sidebar, open **SQL Editor**.
2. Click **New query**. Paste in all of [`supabase/setup.sql`](supabase/setup.sql), then click **Run**.
   - You should see **Setup done**.
3. Click **New query** again. Paste in all of [`supabase/check.sql`](supabase/check.sql), then click **Run**.
   - You should see **All checks passed**. It tries 82 things people should and shouldn't be able to do, using made-up people, then deletes them.
   - If you see an error instead, copy it and send it to Claude.

## 3. Sign-in settings

Open **Authentication** in the sidebar.

1. **Sign In / Providers → Email:**
   - Turn **off** "Confirm email". Invites go out from your school email, so people can make an account and start right away.
   - Set the minimum password length to **8**.
   - Click Save.
2. **URL Configuration:**
   - **Site URL:** `https://gearwrangler-site.vercel.app`
   - **Redirect URLs:** add `https://gearwrangler-site.vercel.app/**`, plus the preview link Claude gives you (it ends in `.vercel.app`), followed by `/**`.
   - These are the pages a password-reset email is allowed to send people back to.

The only email the site sends is "Forgot password?". Supabase's free sender handles a few per hour, which is plenty for that.

## 4. Make yourself a super admin

Super admins manage trips on the site itself: **Log into your expedition → Manage trips** (or the **Admin** button once you're on a trip). They can add trips, including ones that aren't on the public expedition list, change any trip's codes and dates, and add or remove other admins. They see each trip's codes and head counts, but not its people, gear, or messages unless they join with a code like anyone else.

The first admin has to be added here, by hand:

1. Create your account on the site (Log into your expedition → Create an account).
2. In **SQL Editor → New query**, paste this with your email, then click **Run**:

   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```

   It should say **INSERT 0 1**. If it says **INSERT 0 0**, the email doesn't match an account.
3. Sign out and back in on the site. You'll see **Manage trips**.

After that, add WLV staff from **Manage trips → Add an admin**. They need to create an account first.

## 5. Add your first trip

In **Manage trips**, click **Add a trip**. Pick the expedition (or "Not on the list" to type one in), set the dates, and keep the codes it suggests or type your own.

You can still do it here instead: run [`supabase/add-trip.sql`](supabase/add-trip.sql), or use **Table Editor → trips → Insert row**.

## 6. Send Claude two things

Open **Project Settings → API Keys** (or **Data API**) and copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **public key**, labeled `anon` or `publishable`

That key is meant to be public, since the database rules decide who sees what. **Never share** the `service_role` or `secret` key.

## Day to day

- **New trip:** Manage trips → Add a trip.
- **Code leaked:** Manage trips → Change codes or dates → New. People already on the trip stay on it; the old code stops working.
- **New admin:** Manage trips → Add an admin. **Remove one:** the Remove button next to them. Nobody can remove themselves, so there's always at least one admin.
- **Who's on a trip:** Table Editor → `members`.
- **Remove someone from a trip:** delete their row in `members`. They can rejoin only with the code.
- **Delete a trip:** delete its row in `trips` (Table Editor). This also removes its members and messages, so it can't be undone.
- **Someone forgot their password:** they click "Forgot password?" on the sign-in screen.

## What the rules guarantee

These rules are enforced by the database, so nobody can get around them from their browser:

- You see a trip only after entering its code.
- Staff codes are checked on the server and never sent to participants.
- Participants see their crew's names, not each other's gear, staff checks, or 1-1s.
- Private messages are visible only to that participant and the trip's staff.
- Only a trip's own staff can verify gear, and the check is signed with their real name.
- Flights: you always see your own, and your trip's staff see everyone's. The rest of the crew sees yours only if you tick "Show my flights to my crew".
- Only a trip's own staff can change its Trip info (meeting point, airport, notes), and the edit is signed with their name.
- After 10 wrong codes in an hour, that account can't try more codes until the hour is up.
- Only super admins can add trips, change codes, or add admins, and nobody can make themselves one. Admins don't see a trip's people, gear, or messages unless they join it.
- New codes need at least 8 characters, including a number, and can't match any other trip's code.
