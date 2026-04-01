# Setup Guide — Netlify Function for Subscriber Storage

## How it works

When a visitor submits the newsletter popup or contact form, the site
POSTs to `/.netlify/functions/subscribe`. That serverless function
(running on Netlify's servers) holds your GitHub token securely and
writes the submission to `content/subscribers.json` in your repo.

You can view, search, and download all submissions from the CMS →
Subscribers tab.

---

## One-time Setup (5 minutes)

### Step 1 — Get a GitHub Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `Chief EBA Netlify`
4. Check the **repo** scope
5. Click **Generate token** — copy it immediately

### Step 2 — Add Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Click **Site configuration** → **Environment variables**
3. Click **Add a variable** and add each of these:

   | Key         | Value                        |
   |-------------|------------------------------|
   | `GH_TOKEN`  | your GitHub token (ghp_xxx…) |
   | `GH_OWNER`  | `ebenadjetey`                |
   | `GH_REPO`   | `Chief-EBA-Website`          |
   | `GH_BRANCH` | `main`                       |

4. Click **Save**

### Step 3 — Trigger a redeploy

After saving the environment variables, go to **Deploys** and click
**Trigger deploy → Deploy site**. The function will be live after the
deploy finishes (usually under 60 seconds).

---

## Testing it works

1. Visit your live site
2. Fill out the newsletter popup and submit
3. Go to your GitHub repo → `content/subscribers.json`
4. You should see the new entry

Or check it in the CMS → Subscribers tab.

---

## Files in this repo

```
/
├── index.html                     ← Main website
├── cms.html                       ← Content Studio
├── netlify.toml                   ← Netlify config
├── netlify/
│   └── functions/
│       └── subscribe.js           ← Serverless function
└── content/
    ├── perspective/               ← Perspective .md files
    ├── keynotes/                  ← Keynote .md files
    ├── projects/                  ← Project .md files
    ├── media/                     ← Uploaded images/videos
    └── subscribers.json           ← Auto-created on first submission
```
