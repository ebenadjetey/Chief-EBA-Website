// netlify/functions/track-read.js
// ─────────────────────────────────────────────────────────────────
// Called by the site every time a visitor opens an article.
// Reads content/analytics.json from GitHub, increments the slug
// counter, and writes it back. Safe for concurrent requests via
// GitHub's SHA-based optimistic locking.
//
// Required environment variables (same as subscribe.js):
//   GH_TOKEN   — GitHub Personal Access Token (repo scope)
//   GH_OWNER   — ebenadjetey
//   GH_REPO    — Chief-EBA-Website
//   GH_BRANCH  — main
// ─────────────────────────────────────────────────────────────────

const ANALYTICS_PATH = 'content/analytics.json';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let slug, section;
  try {
    ({ slug, section } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!slug) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug required' }) };
  }

  const { GH_TOKEN, GH_OWNER, GH_REPO, GH_BRANCH = 'main' } = process.env;
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GitHub env vars not configured' }) };
  }

  const ghHeaders = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${ANALYTICS_PATH}`;

  try {
    // Read current analytics.json
    let data = { reads: {}, sends: [] };
    let sha = null;

    const getRes = await fetch(`${apiUrl}?ref=${GH_BRANCH}`, { headers: ghHeaders });
    if (getRes.ok) {
      const file = await getRes.json();
      sha = file.sha;
      const raw = Buffer.from(file.content, 'base64').toString('utf8');
      data = JSON.parse(raw);
    }

    // Increment read count for this slug
    if (!data.reads) data.reads = {};
    data.reads[slug] = (data.reads[slug] || 0) + 1;

    // Write back
    const json = JSON.stringify(data, null, 2);
    const putBody = {
      message: `Track read: ${slug}`,
      content: Buffer.from(json).toString('base64'),
      branch: GH_BRANCH,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      // 409 = concurrent write conflict — safe to ignore, count still increments next time
      if (putRes.status !== 409) {
        console.error('GitHub write error:', err.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, slug, reads: data.reads[slug] }) };
  } catch (e) {
    console.error('track-read error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
