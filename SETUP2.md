# Setup Guide — Netlify Function for Subscriber Storage & Emails

## How it works

When a visitor submits the newsletter popup or contact form, the site
POSTs to `/.netlify/functions/subscribe`. That serverless function
(running on Netlify's servers) does three things:

1. **Saves the record** to `content/subscribers.json` in your GitHub repo
2. **Sends a branded acknowledgement email** to the submitter
3. **Sends a new-enquiry notification** to your inbox (contact form only)

You can view, search, and download all submissions from the CMS →
Subscribers tab.

---

## One-time Setup (~10 minutes)

### Step 1 — Get a GitHub Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `Chief EBA Netlify`
4. Check the **repo** scope
5. Click **Generate token** — copy it immediately

### Step 2 — Get a Resend API Key (free email sending)

1. Go to https://resend.com and create a free account
2. From the dashboard, click **API Keys → Create API Key**
3. Name it `Chief EBA Site`, give it **Full Access**
4. Copy the key (starts with `re_`)

> **Note on the sender address:** By default emails send from
> `onboarding@resend.dev`. To send from your own domain (e.g.
> `hello@chiefeba.com`), go to Resend → Domains → Add Domain and
> follow the DNS instructions. Then update the `fromAddr` line in
> `netlify/functions/subscribe.js`.

### Step 3 — Add Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Click **Site configuration** → **Environment variables**
3. Click **Add a variable** and add each of these:

   | Key            | Value                                    |
   |----------------|------------------------------------------|
   | `GH_TOKEN`     | your GitHub token (ghp_xxx…)            |
   | `GH_OWNER`     | `ebenadjetey`                            |
   | `GH_REPO`      | `Chief-EBA-Website`                      |
   | `GH_BRANCH`    | `main`                                   |
   | `RESEND_KEY`   | your Resend API key (re_xxx…)           |
   | `NOTIFY_EMAIL` | your personal email for new enquiries    |

4. Click **Save**

### Step 4 — Update your domain in the email templates

Open `netlify/functions/subscribe.js` and replace every
`YOUR_DOMAIN.com` with your actual Netlify/custom domain (e.g.
`chiefeba.netlify.app` or `chiefeba.com`).

### Step 5 — Trigger a redeploy

After saving the environment variables, go to **Deploys** and click
**Trigger deploy → Deploy site**. The function will be live after the
deploy finishes (usually under 60 seconds).

---

## Testing it works

1. Visit your live site
2. Fill out the newsletter popup and submit
3. Check your subscriber email inbox — you should get the welcome email
4. Go to your GitHub repo → `content/subscribers.json`
   — you should see the new entry
5. Open the CMS → Subscribers tab to see it there too

For the contact form:
1. Fill out the contact form and submit
2. Check the submitter's inbox — they should get the acknowledgement
3. Check your `NOTIFY_EMAIL` inbox — you should get the new enquiry email

---

## Files in this repo

```
/
├── index.html                     ← Main website
├── cms.html                       ← Content Studio
├── netlify.toml                   ← Netlify config
├── netlify/
│   └── functions/
│       └── subscribe.js           ← Serverless function (GitHub + email)
└── content/
    ├── perspective/               ← Perspective .md files
    ├── keynotes/                  ← Keynote .md files
    ├── projects/                  ← Project .md files
    ├── media/                     ← Uploaded images/videos
    └── subscribers.json           ← Auto-created on first submission
```
