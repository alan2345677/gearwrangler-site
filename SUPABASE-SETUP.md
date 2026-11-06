# My trip: setting up the real version

My trip runs on **Supabase**, a free hosted database with sign-in built in. Until `trip.js` has your Supabase details, the site keeps showing the demo.

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
   - You should see **All checks passed**. It tries 36 things people should and shouldn't be able to do, using made-up people, then deletes them.
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

## 4. Add your first trip

Open [`supabase/add-trip.sql`](supabase/add-trip.sql). Change the codes to something hard to guess, paste it into a new SQL Editor query, and click **Run**.

Alternatively, use **Table Editor → trips → Insert row** and fill in the same fields.

## 5. Send Claude two things

Open **Project Settings → API Keys** (or **Data API**) and copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **public key**, labeled `anon` or `publishable`

That key is meant to be public, since the database rules decide who sees what. **Never share** the `service_role` or `secret` key.

## Day to day

- **New trip:** step 4 again.
- **Who's on a trip:** Table Editor → `members`.
- **Remove someone:** delete their row in `members`. They can rejoin only with the code.
- **Code leaked:** change it in `trips`. People already on the trip stay on it.
- **Someone forgot their password:** they click "Forgot password?" on the sign-in screen.

## What the rules guarantee

These rules are enforced by the database, so nobody can get around them from their browser:

- You see a trip only after entering its code.
- Staff codes are checked on the server and never sent to participants.
- Participants see their crew's names, not each other's gear, staff checks, or 1-1s.
- Private messages are visible only to that participant and the trip's staff.
- Only a trip's own staff can verify gear, and the check is signed with their real name.
- After 10 wrong codes in an hour, that account can't try more codes until the hour is up.
