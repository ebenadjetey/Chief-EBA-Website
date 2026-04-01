// netlify/functions/subscribe.js
// Handles newsletter signups and contact form submissions.
// Stores each entry in content/subscribers.json in your GitHub repo.
//
// SETUP (one time):
//   1. Go to Netlify → Site settings → Environment variables
//   2. Add:  GH_TOKEN   = your GitHub Personal Access Token (needs repo scope)
//            GH_OWNER   = ebenadjetey
//            GH_REPO    = Chief-EBA-Website
//            GH_BRANCH  = main   (optional, defaults to main)

const GH_API = 'https://api.github.com';
const FILE_PATH = 'content/subscribers.json';

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS headers — adjust origin if you use a custom domain
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let record;
  try {
    record = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Validate minimum fields
  if (!record.email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email is required' }) };
  }

  // Sanitise
  record.email = String(record.email).trim().toLowerCase().slice(0, 320);
  record.name  = String(record.name  || '').trim().slice(0, 200);
  record.source = String(record.source || 'unknown').trim().slice(0, 50);
  record.date  = new Date().toISOString();

  const token  = process.env.GH_TOKEN;
  const owner  = process.env.GH_OWNER;
  const repo   = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';

  if (!token || !owner || !repo) {
    console.error('Missing env vars: GH_TOKEN, GH_OWNER, GH_REPO must be set in Netlify');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Chief-EBA-Website/1.0',
  };

  const fileUrl = `${GH_API}/repos/${owner}/${repo}/contents/${FILE_PATH}`;

  try {
    // 1. Fetch current subscribers file (may not exist yet)
    let existing = [];
    let sha = null;

    const getRes = await fetch(`${fileUrl}?ref=${branch}`, { headers: ghHeaders });

    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
      const decoded = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      existing = JSON.parse(decoded);
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub GET failed: ${getRes.status}`);
    }

    // 2. Prevent duplicate emails for newsletter source
    if (record.source === 'newsletter') {
      const dupe = existing.some(s => s.email === record.email && s.source === 'newsletter');
      if (dupe) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, note: 'already_subscribed' }) };
      }
    }

    // 3. Append new record
    existing.push(record);

    // 4. Write back to GitHub
    const putBody = {
      message: `Add ${record.source}: ${record.email}`,
      content: Buffer.from(JSON.stringify(existing, null, 2)).toString('base64'),
      branch,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub PUT failed: ${putRes.status}`);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch(err) {
    console.error('subscribe function error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
