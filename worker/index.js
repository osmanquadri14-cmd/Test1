// Cloudflare Worker: OAuth code exchange + refresh proxy for the
// Lease Mileage Tracker's Google Drive sync.
//
// The browser app never sees the Google client secret. This worker is the
// only piece that holds it, and only uses it to talk to Google's token
// endpoint. See the deployment README for setup steps.
//
// Required environment variables / secrets (set in the Cloudflare dashboard
// under Settings > Variables and Secrets):
//   GOOGLE_CLIENT_ID     - same OAuth client ID used by the app
//   GOOGLE_CLIENT_SECRET - the client secret for that same OAuth client
//   REDIRECT_URI         - this worker's own URL + "/oauth/callback"
//   APP_URL              - the app's URL, e.g. https://you.github.io/repo/
//   ALLOWED_ORIGIN        - the app's origin, e.g. https://you.github.io

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        return new Response(`Google sign-in was cancelled or failed: ${error}`, { status: 400 });
      }
      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();

      if (!tokens.refresh_token) {
        return new Response(
          "Google didn't return a refresh token. In your Google Account " +
            "(myaccount.google.com/permissions), remove access for this app " +
            "and try signing in again.",
          { status: 400 }
        );
      }

      const redirectUrl = `${env.APP_URL}#drive_refresh_token=${encodeURIComponent(tokens.refresh_token)}`;
      return Response.redirect(redirectUrl, 302);
    }

    if (url.pathname === "/oauth/refresh" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400, headers: corsHeaders });
      }
      if (!body.refresh_token) {
        return new Response("Missing refresh_token", { status: 400, headers: corsHeaders });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: body.refresh_token,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });
      const tokens = await tokenRes.json();
      return new Response(JSON.stringify(tokens), {
        status: tokenRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
