// netlify/functions/subscribe.js
// ─────────────────────────────────────────────────────────────────
// Handles two sources:
//   source: "newsletter" — newsletter popup signup
//   source: "contact"    — contact form submission
//
// For each:
//   1. Appends the record to content/subscribers.json in GitHub
//   2. Sends a branded acknowledgement email to the submitter
//   3. (contact only) Sends a new-enquiry notification to Chief Eben
//
// Required environment variables (set in Netlify dashboard):
//   GH_TOKEN   — GitHub Personal Access Token (repo scope)
//   GH_OWNER   — GitHub username (ebenadjetey)
//   GH_REPO    — Repository name (Chief-EBA-Website)
//   GH_BRANCH  — Branch (main)
//   RESEND_KEY — Resend API key (get free at https://resend.com)
//   NOTIFY_EMAIL — Your email to receive new enquiry alerts
// ─────────────────────────────────────────────────────────────────

const SUBS_PATH = 'content/subscribers.json';

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── CORS headers ──────────────────────────────────────────────
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  let record;
  try {
    record = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { GH_TOKEN, GH_OWNER, GH_REPO, GH_BRANCH = 'main', RESEND_KEY, NOTIFY_EMAIL } = process.env;

  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GitHub env vars not configured' }) };
  }

  // ── 1. Write to GitHub ─────────────────────────────────────────
  try {
    const ghBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${SUBS_PATH}`;
    const ghHeaders = {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    // Fetch existing subscribers.json
    let existing = [];
    let sha = null;
    const getRes = await fetch(`${ghBase}?ref=${GH_BRANCH}`, { headers: ghHeaders });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
      const raw = Buffer.from(fileData.content, 'base64').toString('utf8');
      existing = JSON.parse(raw);
    }

    // Append new record
    existing.push(record);
    const json = JSON.stringify(existing, null, 2);

    const putBody = {
      message: `Add ${record.source || 'subscriber'}: ${record.email}`,
      content: Buffer.from(json).toString('base64'),
      branch: GH_BRANCH,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(ghBase, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      console.error('GitHub write failed:', err.message);
      // Don't block the response — still send emails
    }
  } catch (e) {
    console.error('GitHub error:', e.message);
  }

  // ── 2. Send emails via Resend ──────────────────────────────────
  // Resend is free up to 3,000 emails/month.
  // Sign up at https://resend.com, get an API key, add as RESEND_KEY.
  // Also verify your domain or use your Resend onboarding address.
  if (RESEND_KEY && record.email) {
    const fromName = 'Chief Eben Adjetey';
    const fromAddr = `${fromName} <onboarding@resend.dev>`; // change to your verified domain

    // ─ Email to the submitter ─────────────────────────────────
    const isContact = record.source === 'contact';
    const firstName = (record.name || '').split(' ')[0] || 'there';

    const submitterSubject = isContact
      ? `We've received your message, ${firstName}.`
      : `You're in. Welcome to the inner circle.`;

    const submitterHtml = isContact
      ? buildContactAckEmail(record, firstName, fromName)
      : buildNewsletterWelcomeEmail(record, firstName, fromName);

    await sendEmail(RESEND_KEY, {
      from: fromAddr,
      to: record.email,
      subject: submitterSubject,
      html: submitterHtml,
    });

    // ─ Notification email to Chief Eben (contact only) ────────
    if (isContact && NOTIFY_EMAIL) {
      await sendEmail(RESEND_KEY, {
        from: fromAddr,
        to: NOTIFY_EMAIL,
        subject: `New enquiry from ${record.name || record.email}`,
        html: buildEnquiryNotificationEmail(record),
      });
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true }),
  };
};

// ── Email sender ───────────────────────────────────────────────
async function sendEmail(apiKey, { from, to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('Resend error:', err);
    }
  } catch (e) {
    console.error('Email send error:', e.message);
  }
}

// ── Email templates ────────────────────────────────────────────
// Colours from the site design system
const C = {
  ink: '#0A0A0A',
  inkMuted: '#666',
  inkGhost: '#bbb',
  rule: '#E5E5E5',
  bg: '#FFFFFF',
  bgOff: '#FAFAFA',
  gold: '#C9A84C',
  goldDim: '#8B6F2E',
};

function emailShell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chief Eben Adjetey</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${C.rule};">

      <!-- HEADER -->
      <tr>
        <td style="background:${C.ink};padding:28px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Chief Eben Adjetey.</span>
              </td>
              <td align="right">
                <span style="font-size:10px;font-weight:600;letter-spacing:0.3em;text-transform:uppercase;color:${C.gold};">Chief &amp; Company</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- GOLD BAR -->
      <tr><td style="background:${C.gold};padding:10px 40px;">
        <span style="font-size:10px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${C.ink};"><!-- LABEL --></span>
      </td></tr>

      <!-- BODY -->
      ${bodyHtml}

      <!-- FOOTER -->
      <tr>
        <td style="background:${C.ink};padding:28px 40px;">
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:14px;color:#ffffff;">Chief Eben Adjetey</p>
          <p style="margin:0 0 4px;font-size:11px;color:${C.inkGhost};">Business Consultant · Brand Strategist · Creative Thinker</p>
          <p style="margin:0;font-size:11px;color:${C.inkGhost};">Chief &amp; Company · Accra, Ghana</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildNewsletterWelcomeEmail(record, firstName, fromName) {
  const body = `
    <!-- LABEL row override -->
    <tr><td style="background:${C.gold};padding:10px 40px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${C.ink};">You're Subscribed</span>
    </td></tr>

    <tr><td style="padding:40px 40px 0;">
      <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;font-weight:700;color:${C.ink};line-height:1.15;">
        Welcome to the thinking, ${firstName}.
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${C.inkMuted};">
        You just signed up for something most people never get — the unfiltered version. The strategy, the brand thinking, and the observations that don't make it to the public feed.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${C.inkMuted};">
        Expect sharp perspectives. No noise. No recycled frameworks. Just ideas worth your time.
      </p>
      <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:${C.inkMuted};">
        <strong style="color:${C.ink};">Be Formidable.</strong>
      </p>
    </td></tr>

    <!-- DIVIDER -->
    <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid ${C.rule};margin:0 0 28px;"></td></tr>

    <!-- IN THE MEANTIME -->
    <tr><td style="padding:0 40px 16px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;color:${C.inkGhost};">In the meantime</p>
      <p style="margin:0;font-size:14px;color:${C.inkMuted};line-height:1.6;">Explore more of Chief's thinking or see how you can work together:</p>
    </td></tr>
    <tr><td style="padding:0 40px 40px;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:12px;">
            <a href="https://ebenadjetey.netlify.app/#/perspective" style="display:inline-block;background:${C.ink};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:12px 24px;text-decoration:none;">
              Read the Thinking →
            </a>
          </td>
          <td>
            <a href="https://ebenadjetey.netlify.app/#/contact" style="display:inline-block;background:transparent;color:${C.ink};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:11px 24px;text-decoration:none;border:1.5px solid ${C.ink};">
              Work With Chief
            </a>
          </td>
        </tr>
      </table>
    </td></tr>`;

  // Inject body into shell (replace the generic gold bar row)
  return emailShell('').replace(
    /<!-- GOLD BAR -->[\s\S]*?<\/tr>/,
    body
  );
}

function buildContactAckEmail(record, firstName, fromName) {
  const interest = record.interest ? `regarding <strong style="color:${C.ink};">"${record.interest}"</strong>` : '';
  const body = `
    <!-- LABEL row override -->
    <tr><td style="background:${C.gold};padding:10px 40px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${C.ink};">Message Received</span>
    </td></tr>

    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;font-weight:700;color:${C.ink};line-height:1.15;">
        Thank you, ${firstName}.
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${C.inkMuted};">
        Your message ${interest} has been received and Chief Eben is reviewing it. You can expect a response within <strong style="color:${C.ink};">48 hours</strong>.
      </p>
      <p style="margin:0 0 0;font-size:15px;line-height:1.75;color:${C.inkMuted};">
        The businesses that move forward are the ones that take the first step. You've taken it.
      </p>
    </td></tr>

    <!-- Message preview box -->
    ${record.message ? `
    <tr><td style="padding:0 40px 32px;">
      <div style="background:${C.bgOff};border-left:3px solid ${C.gold};padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:${C.inkGhost};">Your message</p>
        <p style="margin:0;font-size:13px;line-height:1.65;color:${C.inkMuted};">${record.message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
      </div>
    </td></tr>` : ''}

    <!-- DIVIDER -->
    <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid ${C.rule};margin:0 0 28px;"></td></tr>

    <!-- WHILE YOU WAIT -->
    <tr><td style="padding:0 40px 16px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;color:${C.inkGhost};">While you wait</p>
      <p style="margin:0;font-size:14px;color:${C.inkMuted};line-height:1.6;">Explore how Chief Eben thinks and what he builds:</p>
    </td></tr>
    <tr><td style="padding:0 40px 40px;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:12px;">
            <a href="https://ebenadjetey.netlify.app/#/perspective" style="display:inline-block;background:${C.ink};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:12px 24px;text-decoration:none;">
              Read the Thinking →
            </a>
          </td>
          <td>
            <a href="https://ebenadjetey.netlify.app/#/keynotes" style="display:inline-block;background:transparent;color:${C.ink};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:11px 24px;text-decoration:none;border:1.5px solid ${C.ink};">
              See the Signature Keynotes
            </a>
          </td>
        </tr>
      </table>
    </td></tr>`;

  return emailShell('').replace(
    /<!-- GOLD BAR -->[\s\S]*?<\/tr>/,
    body
  );
}

function buildEnquiryNotificationEmail(record) {
  const fields = [
    ['Name', record.name || '—'],
    ['Email', record.email || '—'],
    ['Organisation', record.organisation || '—'],
    ['Interest', record.interest || '—'],
    ['Date', new Date(record.date).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })],
  ];

  const rows = fields.map(([label, val]) => `
    <tr>
      <td style="padding:10px 16px;background:${C.bgOff};font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${C.inkGhost};white-space:nowrap;border-bottom:1px solid ${C.rule};">${label}</td>
      <td style="padding:10px 16px;background:#fff;font-size:14px;color:${C.ink};border-bottom:1px solid ${C.rule};">${String(val).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
    </tr>`).join('');

  const body = `
    <!-- LABEL row override -->
    <tr><td style="background:${C.gold};padding:10px 40px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${C.ink};">New Website Enquiry</span>
    </td></tr>

    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:700;color:${C.ink};">
        New enquiry received.
      </h1>
      <p style="margin:0;font-size:14px;color:${C.inkMuted};">Submitted via your website contact form</p>
    </td></tr>

    <tr><td style="padding:0 40px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.rule};border-collapse:collapse;">
        ${rows}
      </table>
    </td></tr>

    ${record.message ? `
    <tr><td style="padding:0 40px 32px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:${C.inkGhost};">Message</p>
      <div style="background:${C.bgOff};border-left:3px solid ${C.gold};padding:16px 20px;">
        <p style="margin:0;font-size:14px;line-height:1.7;color:${C.inkMuted};">${record.message.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>
      </div>
    </td></tr>` : ''}

    <tr><td style="padding:0 40px 40px;">
      <a href="mailto:${record.email}?subject=Re: Your enquiry to Chief Eben Adjetey"
         style="display:inline-block;background:${C.gold};color:${C.ink};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:12px 24px;text-decoration:none;">
        Reply to ${(record.name || record.email).split(' ')[0]} →
      </a>
    </td></tr>`;

  return emailShell('').replace(
    /<!-- GOLD BAR -->[\s\S]*?<\/tr>/,
    body
  );
}
