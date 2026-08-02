# Drive sync worker

This is a small Cloudflare Worker that lets the Lease Mileage Tracker stay
signed in to Google Drive across page reloads and devices, without needing
its own backend/database. It only does one thing: it holds the Google OAuth
client secret and uses it to exchange/refresh tokens, so the browser app
never has to.

## 1. Deploy the worker

1. Sign up / log in at [dash.cloudflare.com](https://dash.cloudflare.com) (free plan is enough).
2. Go to **Workers & Pages** → **Create** → **Create Worker**.
3. Give it any name (e.g. `mileage-tracker-oauth`) and deploy the default template.
4. Open the worker, go to **Edit code**, delete everything, and paste in the
   contents of `worker/index.js` from this repo. Click **Deploy**.
5. Note the worker's URL shown at the top — it looks like
   `https://mileage-tracker-oauth.<your-subdomain>.workers.dev`.

## 2. Set the worker's environment variables

In the worker's **Settings → Variables and Secrets**, add these four:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Same client ID already used by the app |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console → Credentials → your OAuth client (see below) |
| `REDIRECT_URI` | Your worker URL + `/oauth/callback`, e.g. `https://mileage-tracker-oauth.you.workers.dev/oauth/callback` |
| `APP_URL` | The app's URL, e.g. `https://osmanquadri14-cmd.github.io/Test1/` |
| `ALLOWED_ORIGIN` | The app's origin only, e.g. `https://osmanquadri14-cmd.github.io` |

Mark `GOOGLE_CLIENT_SECRET` as a **secret** (encrypted), the rest can be
plain variables. Save and redeploy if prompted.

## 3. Update the Google OAuth client

Go back to [Google Cloud Console](https://console.cloud.google.com) →
**APIs & Services → Credentials** → open the same OAuth client used before.

- Copy the **Client Secret** shown there — that's the value for
  `GOOGLE_CLIENT_SECRET` above.
- Under **Authorized redirect URIs**, add the exact `REDIRECT_URI` value
  from step 2 (must match exactly, including `https://` and the path).
- Save.

## 4. Tell the app about the worker

Send the worker's base URL (e.g. `https://mileage-tracker-oauth.you.workers.dev`,
**no trailing slash, no path**) back and it'll be wired into `app.js` as
`DRIVE_WORKER_URL`.

## How it works

- Clicking "Sign in with Google" redirects the browser to Google's consent
  screen, then to `/oauth/callback` on this worker.
- The worker exchanges the authorization code for an access token *and a
  refresh token* (only possible because it can send the client secret) and
  redirects back to the app with the refresh token in the URL fragment
  (never sent to any server, since fragments aren't transmitted over HTTP).
- The app stores the refresh token in `localStorage` and calls
  `/oauth/refresh` on this worker whenever it needs a fresh access token
  (on load, and whenever a Drive API call gets a 401) — no re-consent needed
  until you explicitly sign out or revoke access in your Google Account.
