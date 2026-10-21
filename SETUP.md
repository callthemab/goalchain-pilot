# GoalChain MVP — deploy and pilot guide

This is a mobile-first, static web app scaffold for the GoalChain closed pilot. It uses GitHub Pages for hosting and Supabase for shared accounts/data. The `config.js` file is intentionally excluded from Git so you can configure it privately in your own working copy. A Supabase anon/publishable key is designed for browser use when Row Level Security (RLS) is configured correctly; never use a service-role key in this app.

## What's included
- Responsive GoalChain landing page and tabs.
- Email sign-up/sign-in.
- Player discovery and profiles.
- Club creation, membership and 11-player roster limit.
- Club invitations that require explicit acceptance.
- Join requests.
- Match reporting with evidence URL and approval state.
- Rankings based on approved matches.
- Demo preview if Supabase is not configured.

## 1. Create the shared database
1. Go to https://supabase.com and create a project.
2. Open SQL Editor and run the complete `supabase/schema.sql` file.
3. In Authentication settings, configure your site URL after GitHub Pages is live, and add the same URL under redirect URLs.
4. Email confirmation may be enabled. If it is, new players need to confirm their email before signing in.

## 2. Configure the app
1. Copy `config.js.example` to a new file named `config.js`.
2. In Supabase Project Settings → API, copy the Project URL and anon/publishable key into `config.js`.
3. Do not paste the service_role key. Do not commit `config.js` to GitHub.
4. Test locally by serving this folder with any simple static server. Opening `index.html` directly may block some browser features.

## 3. Publish with GitHub Pages
1. Create a new GitHub repository, e.g. `goalchain-pilot`. For a private pilot, keep the repo private if your GitHub plan supports Pages for private repositories; otherwise remember that Pages is public and do not put secrets or private player data in source files.
2. Upload `index.html`, `styles.css`, `app.js`, `config.js` (only in a local copy; do not commit it), and the `supabase/` folder. Commit the rest of the project.
3. For the simplest configuration, set `config.js` as a GitHub Actions secret and use a workflow to write it during deployment. Alternatively, because the Supabase anon key is a public client key by design, you may publish the URL/key in `config.js` after RLS has been reviewed; the file is excluded from the starter repo by default. The safest route is a GitHub Actions workflow secret.
4. In the repository, open Settings → Pages and choose GitHub Actions as the source. Add the workflow below as `.github/workflows/pages.yml`.
5. Add repository Actions variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or secrets, with workflow adjusted accordingly). Re-run the workflow after setting them.
6. Your published URL will typically be `https://YOUR-USERNAME.github.io/REPOSITORY/`. Confirm it loads on mobile before inviting testers.

## 4. Pilot safety checklist
- Test with 3–5 trusted users first, then expand to 10–20.
- No entry fees, cash prizes, or real-money transfers during the pilot.
- Use test accounts and avoid collecting phone numbers, addresses, or sensitive personal data.
- Use screenshot/evidence links only from sources testers agree to share. Avoid private account details in screenshots.
- Verify a result before it affects standings.
- Club invitations never automatically add the player. The player must accept.
- Review the RLS policies and test with two unrelated accounts before inviting a wider group.

## Important implementation note
This starter is a functional MVP scaffold, not a security audit or a guarantee of production readiness. The database policies are intended as a strong starting point, but should be tested with separate accounts. Do not handle money in this pilot. The current verification model uses a second participant's confirmation or a moderator approval; a screenshot URL alone does not prove a match result.


## 5. Add the GitHub Pages workflow
Create `.github/workflows/pages.yml` using the included file. In your GitHub repository, open Settings → Secrets and variables → Actions → New repository secret. Add:
- `SUPABASE_URL` = Supabase Project URL
- `SUPABASE_ANON_KEY` = Supabase anon/publishable key

Then open Actions and run **Deploy GoalChain to GitHub Pages**, or push a commit to `main`. The workflow fails intentionally if either secret is missing.

## 6. Test with two accounts before recruiting
Use two separate test accounts:
1. Account A creates a club and invites Account B.
2. Account B sees the invitation and explicitly accepts.
3. Confirm Account B is added only after acceptance.
4. Try to add a twelfth member; it must fail.
5. Create a second club and report a match between the two clubs.
6. The opposing club manager confirms or disputes it.
7. Confirm only approved matches affect standings.
8. Try to edit another user's profile or perform manager actions from a non-manager account; these should be denied by RLS.

If any of these fail, pause the wider pilot and fix the issue first.
