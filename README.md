# Scout — Job Search Partner

A kanban-based job search tracker for designers, with AI-powered company research and job description extraction.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your Anthropic API key (required for URL import, company research, paste extraction)
npm run dev
```

`npm run dev` starts both the Vite app and a local API server (port 3001). The app proxies `/api/job` and `/api/claude` to that server so Greenhouse/Lever/Ashby and Claude work without Vercel.

## Deploy the API proxy (for job URL importing)

The URL importer uses a server-side proxy for Greenhouse/Lever/Ashby so those APIs work from the browser. Either use the default `scout-api.vercel.app` or deploy your own:

```bash
cd api
npx vercel deploy --prod
```

Then set in `.env`:
```
VITE_JOB_PROXY_BASE=https://your-project.vercel.app/api/job
```

## Stack
- React + Vite
- Anthropic Claude API (via claude.ai artifact)
- Vercel Edge Functions (job proxy)

## ATS Support
| Platform   | Method       |
|------------|-------------|
| Greenhouse | Proxy API   |
| Lever      | Proxy API   |
| Ashby      | Proxy API   |
| Other      | Claude search |
| LinkedIn   | Paste only  |
