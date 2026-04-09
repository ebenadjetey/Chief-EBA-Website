// netlify/functions/send-newsletter.js
// ─────────────────────────────────────────────────────────────────
// Server-side proxy for Resend email API.
//
// WHY THIS EXISTS:
//   Resend (and most email APIs) block direct browser requests due
//   to CORS. The CMS runs in the browser, so it can't call
//   api.resend.com directly — you'll get "Failed to fetch".
//   This function runs on Netlify's servers and has no such
//   restriction, so the CMS calls this endpoint instead.
//
// The CMS sends:
//   { apiKey, to, subject, html }
//
// This function forwards to Resend and returns the result.
// The API key is supplied per-send from the CMS — it is never
// stored on the server or in any environment variable.
// ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { apiKey, to, subject, html } = payload;

  if (!apiKey || !to || !subject || !html) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required fields: apiKey, to, subject, html' }),
    };
  }

  // Basic API key format check
  if (!apiKey.startsWith('re_')) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid Resend API key format. Keys start with re_' }),
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Chief Eben Adjetey <onboarding@resend.dev>',
        // ↑ Once you verify your domain in Resend, change this to:
        // from: 'Chief Eben Adjetey <hello@YOUR_DOMAIN.com>',
        to,
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, id: data.id }),
      };
    } else {
      console.error('Resend error:', data);
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ ok: false, error: data.message || data.name || 'Resend error' }),
      };
    }
  } catch (e) {
    console.error('send-newsletter function error:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
