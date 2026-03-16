import { Redis } from "@upstash/redis";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Redis (Upstash) – replaces file-based data/ storage for serverless
// ---------------------------------------------------------------------------
let redis;
function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    redis = new Redis({ url, token });
  }
  return redis;
}

async function getWorkspace(key) {
  const data = await getRedis().get(`ws:${key}`);
  return data || null;
}
async function setWorkspace(key, ws) {
  await getRedis().set(`ws:${key}`, JSON.stringify(ws));
}
async function getOrCreateWorkspace(key) {
  let ws = await getWorkspace(key);
  if (!ws) {
    ws = { key, email: null, created_at: new Date().toISOString() };
    await setWorkspace(key, ws);
  }
  if (typeof ws === "string") ws = JSON.parse(ws);
  return ws;
}
async function findWorkspaceByEmail(email) {
  const wsKey = await getRedis().get(`ws-email:${email}`);
  if (!wsKey) return null;
  return getWorkspace(wsKey);
}

async function readWorkspaceData(key) {
  const data = await getRedis().get(`ws-data:${key}`);
  if (!data) return { jobs: [], companies: [] };
  return typeof data === "string" ? JSON.parse(data) : data;
}
async function writeWorkspaceData(key, data) {
  await getRedis().set(`ws-data:${key}`, JSON.stringify(data));
}

async function getBrandColor(cacheKey) {
  return getRedis().hget("brand-colors", cacheKey);
}
async function setBrandColor(cacheKey, hex) {
  await getRedis().hset("brand-colors", { [cacheKey]: hex });
}

async function getCompanyResearch(cacheKey) {
  const data = await getRedis().hget("company-research", cacheKey);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}
async function setCompanyResearch(cacheKey, data) {
  await getRedis().hset("company-research", { [cacheKey]: JSON.stringify(data) });
}

// ---------------------------------------------------------------------------
// Constants & helpers (ported from server/index.js)
// ---------------------------------------------------------------------------
const SCOUT_KEY_REGEX = /^scout_[a-z0-9]{8}$/i;
function isValidScoutKey(key) {
  return typeof key === "string" && SCOUT_KEY_REGEX.test(key.trim());
}
function normalizeKey(key) {
  if (typeof key !== "string") return null;
  const k = key.trim();
  return isValidScoutKey(k) ? k.toLowerCase() : null;
}
function getScoutKey(req) {
  const keyHeader = req.headers["x-scout-key"];
  if (keyHeader) { const k = normalizeKey(keyHeader); if (k) return k; }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) { const k = normalizeKey(auth.slice(7)); if (k) return k; }
  return null;
}

const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

const KNOWN_BRAND_COLORS_SERVER = {
  "zynga.com": "#E91D26", zynga: "#E91D26",
  "kraken.com": "#5741D9", kraken: "#5741D9",
  "thumbtack.com": "#009FD9", thumbtack: "#009FD9",
  "stripe.com": "#635BFF", "figma.com": "#F24E1E",
  "linear.app": "#5E6AD2", "notion.so": "#000000",
  "instacart.com": "#43B02A", "via.transport": "#00C2FF",
};

function normalizeDomain(website) {
  if (!website || typeof website !== "string") return "";
  return website.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split("?")[0] || "";
}
function normalizeCompanyKey(name) {
  if (!name || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|dt|dd)>/gi, "\n")
    .replace(/<(?:ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
function decodeHtmlEntities(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D").replace(/&ldquo;/g, "\u201C")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ");
}
function formatNum(n) {
  return String(Math.floor(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---------------------------------------------------------------------------
// Salary / location extraction
// ---------------------------------------------------------------------------
function extractSalaryFromText(text) {
  if (!text || typeof text !== "string") return null;
  const zoneRangeRe = /(?:USD|CAD|GBP|EUR)\s*([\d,]+)\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?([\d,]+)/gi;
  const zoneMatches = [...text.matchAll(zoneRangeRe)];
  if (zoneMatches.length > 0) {
    let minVal = Infinity, maxVal = -Infinity, currency = "USD";
    for (const m of zoneMatches) {
      const low = Number(m[1].replace(/,/g, "")), high = Number(m[2].replace(/,/g, ""));
      if (!Number.isNaN(low) && !Number.isNaN(high)) {
        if (low < minVal) minVal = low; if (high > maxVal) maxVal = high;
        if (/CAD/i.test(m[0])) currency = "CAD"; else if (/GBP/i.test(m[0])) currency = "GBP"; else if (/EUR/i.test(m[0])) currency = "EUR";
      }
    }
    if (minVal !== Infinity && maxVal !== Infinity && minVal <= maxVal) {
      const s = `${currency} ${formatNum(minVal)} – ${currency} ${formatNum(maxVal)}`;
      if (s.length < 120) return s;
    }
  }
  const patterns = [
    /\b(?:salary|compensation|pay)\s*:?\s*\$[\d,]+\s*(?:[-–—]+|to)\s*\$[\d,]+/i,
    /(?:USD|CAD|GBP|EUR)\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?[\d,]+/i,
    /CA\$\s*[\d,]+\s*(?:[-–—]+|to)\s*CA\$\s*[\d,]+/gi,
    /(?:US|AU)\$\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:US|AU)\$\s*[\d,]+/gi,
    /\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/gi,
    /\$[\d,]+(?:\.\d+)?\s*(?:[-–—]+|to)\s*\$[\d,]+(?:\.\d+)?\s*(?:USD|CAD|GBP|EUR)?/gi,
    /(?:USD|CAD|GBP|EUR)\s*[\d,]+(?:\s*[-–—]+|to)\s*[\d,]+/gi,
    /€[\d,]+\s*(?:[-–—]+|to)\s*€[\d,]+/g,
    /£[\d,]+\s*(?:[-–—]+|to)\s*£[\d,]+/g,
    /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\s*(?:[-–—]+|to)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\b/i,
    /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:[-–—]+|to)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:USD|CAD|GBP|EUR|per\s+year|per\s+yr|\.)?/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[0]) {
      let s = m[0].replace(/\s+/g, " ").replace(/\s*[-–—]{2,}\s*/g, " – ").trim();
      const kMatch = s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\s*(?:[-–—]+|to)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*k$/i);
      if (kMatch) s = `$${kMatch[1]}k – $${kMatch[2]}k`;
      const usdMatch = s.match(/^(USD|CAD|GBP|EUR)\s*([\d,]+)\s*[-–—]\s*(?:\1\s*)?([\d,]+)$/i);
      if (usdMatch) s = `${usdMatch[1]} ${formatNum(usdMatch[2])} – ${usdMatch[1]} ${formatNum(usdMatch[3])}`;
      if (s.length > 6 && s.length < 120) return s;
    }
  }
  return null;
}

function normalizeMultiLocation(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(/\s*\|\s*|\s*;\s*|\s+and\s+/i).map(p => p.trim().replace(/\s+/g, " ")).filter(p => p.length > 2 && p.length < 120);
  return parts.length > 0 ? parts.join(" / ") : null;
}
function extractLocationFromText(text) {
  if (!text || typeof text !== "string") return null;
  const headerMatch = text.match(/(?:^|\n)\s*(?:location|locations|office)\s*:?\s*([^\n]+)/im);
  if (headerMatch) {
    const normalized = normalizeMultiLocation(headerMatch[1].trim());
    if (normalized) return normalized;
    if (headerMatch[1].trim().length > 3 && headerMatch[1].trim().length < 150) return headerMatch[1].trim();
  }
  const pipeLine = text.match(/[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)(?:\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+))*/);
  if (pipeLine) { const n = normalizeMultiLocation(pipeLine[0]); if (n) return n; }
  return null;
}

// ---------------------------------------------------------------------------
// Claude proxy
// ---------------------------------------------------------------------------
async function handleClaudeProxy(body) {
  if (!ANTHROPIC_KEY) throw new Error("Missing ANTHROPIC_API_KEY on server");
  const { userMsg, systemMsg, useWebSearch = false } = body;
  const model = useWebSearch ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001";
  const apiBody = { model, max_tokens: 2000, system: systemMsg, messages: [{ role: "user", content: userMsg }] };
  if (useWebSearch) apiBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(apiBody),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || data.message || `HTTP ${res.status}`);
  if (!data.content || !Array.isArray(data.content)) throw new Error("Invalid API response: no content");
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------
const COMPANY_RESEARCH_SYSTEM = `You are a career researcher. Return ONLY raw JSON (no markdown, no backticks) with these exact fields:
{"name":"official name","description":"2-3 sentences on what they do and their design culture","size":"employee count range e.g. 200-500 (number or range only, no word 'employees')","stage":"e.g. Series B, Public","designTeamSize":"estimated design headcount","designLeaders":"CEO and/or founders/co-founders only (names and titles). NEVER include: Chief Design Officer, Chief Brand Officer, Head of Design, VP Design, or any design/UX/brand executive—only the top executive (CEO) and company founders/co-founders. If none are easily found, use empty string.","culture":"2-3 words on culture and craft expectations","website":"domain only e.g. company.com"}`;

async function fetchCompanyResearchViaClaude(companyName) {
  if (!ANTHROPIC_KEY || !companyName) return null;
  try {
    const text = await handleClaudeProxy({
      userMsg: `Research this company: "${companyName}". In the designLeaders field put ONLY the CEO and/or founders/co-founders (name and title). Do not put Chief Design Officer, Chief Brand Officer, Head of Design, or any design/UX leader—only CEO or founders.`,
      systemMsg: COMPANY_RESEARCH_SYSTEM, useWebSearch: false,
    });
    const parsed = JSON.parse((text || "").replace(/```json|```/g, "").trim());
    return {
      name: parsed.name ?? companyName, description: parsed.description ?? "",
      size: parsed.size ?? "", stage: parsed.stage ?? "", designTeamSize: parsed.designTeamSize ?? "",
      designLeaders: parsed.designLeaders ?? "", culture: parsed.culture ?? "", website: parsed.website ?? "",
    };
  } catch (e) { console.warn("Company research failed:", e.message); return null; }
}

async function fetchBrandColorViaClaude(domain, companyName) {
  if (!ANTHROPIC_KEY) return null;
  const domainPart = domain ? `website domain "${domain}"` : "";
  const namePart = companyName ? (domainPart ? ` or company name "${companyName}"` : `company name "${companyName}"`) : "";
  try {
    const text = await handleClaudeProxy({
      userMsg: `What is the primary brand color of the company with ${domainPart}${namePart}? Reply with only a single hex code in the format #RRGGBB (e.g. #635BFF), nothing else.`,
      systemMsg: "You are a brand color expert. Reply only with one hex code.", useWebSearch: false,
    });
    const match = (text || "").match(/#[0-9A-Fa-f]{6}/);
    return match ? match[0] : null;
  } catch (e) { console.warn("Brand color failed:", e.message); return null; }
}

async function extractSalaryViaAI(jobText) {
  if (!ANTHROPIC_KEY || !jobText || jobText.length < 200) return null;
  try {
    const text = await handleClaudeProxy({
      userMsg: `Extract the salary or base pay range from this job posting. Reply with only the range (one line) or NULL.\n\n${jobText.slice(0, 8000)}`,
      systemMsg: "You extract salary/compensation from job postings. Reply with ONLY a single line: the salary or base pay range in a concise form (e.g. USD 152,100 – USD 238,525 or $120k – $150k). If there are multiple zones or ranges, give the overall range (lowest to highest). If no salary/compensation is mentioned, reply with exactly: NULL",
      useWebSearch: false,
    });
    const trimmed = (text || "").trim().toUpperCase();
    if (!trimmed || trimmed === "NULL" || trimmed.startsWith("NO ") || trimmed.length > 100) return null;
    return (text || "").trim();
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// ATS proxies
// ---------------------------------------------------------------------------
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function handleJobProxy(ats, company, jobId) {
  if (ats === "greenhouse") {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}?content=true`);
    if (!res.ok) throw new Error(`Greenhouse returned ${res.status}`);
    const data = await res.json();
    let raw = data.content || "";
    raw = decodeHtmlEntities(raw);
    let salary = null;
    const payMatch = raw.match(/<div[^>]*class="pay-range"[^>]*>([\s\S]*?)<\/div>/i);
    if (payMatch) salary = stripHtml(payMatch[1]).trim() || null;
    if (!salary) { const text = htmlToText(raw); const ranges = text.match(/\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/gi); if (ranges) salary = [...new Set(ranges.map(r => r.replace(/\s+/g, " ").trim()))].slice(0, 2).join("; "); }
    return { title: data.title, companyName: data.company_name || company, location: data.location?.name || "Remote", salary, content: htmlToText(raw) };
  }
  if (ats === "lever") {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}/${jobId}`);
    if (!res.ok) throw new Error(`Lever returned ${res.status}`);
    const data = await res.json();
    const raw = [data.description, data.descriptionBody, ...(data.lists || []).map(l => `<h3>${l.text}</h3>${l.content}`)].join("\n");
    const content = htmlToText(raw);
    return { title: data.text, companyName: company, location: data.categories?.location || data.categories?.allLocations?.[0] || "Remote", salary: extractSalaryFromText(content), content };
  }
  if (ats === "ashby") {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}`, { headers: { Accept: "application/json", "User-Agent": BROWSER_UA, Referer: "https://jobs.ashbyhq.com/" } });
    if (!res.ok) throw new Error(`Ashby returned ${res.status}`);
    const data = await res.json();
    const job = (data.jobs || []).find(j => j.id === jobId || (j.jobUrl && j.jobUrl.includes(jobId)));
    if (!job) throw new Error("Job not found in Ashby board");
    const raw = job.descriptionHtml || job.descriptionPlain || "";
    let salary = null;
    try { const scraped = await handleScrape(`https://jobs.ashbyhq.com/${company}/${jobId}`); salary = scraped.salary || null; } catch (_) {}
    return { title: job.title, companyName: company, location: job.location || job.workplaceType || "Remote", salary, content: htmlToText(raw) };
  }
  if (ats === "workday") {
    const parsed = new URL(jobId);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const filtered = pathParts.filter(p => !/^[a-z]{2}(-[A-Z]{2})?$/.test(p));
    const board = filtered[0] || "external";
    const jobSlug = filtered.slice(filtered.indexOf("job")).join("/");
    const apiUrl = `${parsed.origin}/wday/cxs/${company}/${board}/${jobSlug}`;
    const res = await fetch(apiUrl, { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } });
    if (!res.ok) throw new Error(`Workday returned ${res.status}`);
    const data = await res.json();
    const info = data.jobPostingInfo || {};
    const content = htmlToText(info.jobDescription || "");
    return { title: info.title, companyName: company.charAt(0).toUpperCase() + company.slice(1), location: info.location || "Remote", salary: extractSalaryFromText(content), content };
  }
  if (ats === "smartrecruiters") {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(jobId)}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`SmartRecruiters returned ${res.status}`);
    const data = await res.json();
    const loc = data.location;
    const locationStr = loc ? [loc.city, loc.region, loc.country].filter(Boolean).join(", ") : (data.jobAd?.location?.label || "Remote");
    const sections = data.jobAd?.sections || {};
    const raw = [sections.jobDescription?.text, sections.qualifications?.text, sections.additionalInformation?.text, sections.companyDescription?.text].filter(Boolean).join("\n");
    const comp = data.compensation;
    let salary = null;
    if (comp?.min?.value && comp?.max?.value) { const cur = comp.currency || "USD"; salary = `${cur} ${Number(comp.min.value).toLocaleString()}–${Number(comp.max.value).toLocaleString()}`; }
    return { title: data.name, companyName: data.company?.name || company, location: locationStr, salary, content: htmlToText(raw) };
  }
  throw new Error(`Unknown ATS: ${ats}`);
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------
const MAX_BODY = 2 * 1024 * 1024;

async function handleScrape(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http/https URLs are supported");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(targetUrl, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow", signal: controller.signal,
    });
  } finally { clearTimeout(timeout); }
  if (!res.ok) throw new Error(`Page returned ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) throw new Error("Not an HTML page");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BODY) throw new Error("Page too large");
  const html = new TextDecoder("utf-8").decode(buf);
  const result = extractFromHtml(html, targetUrl);
  if (!result.salary && result.content && result.content.length > 400) {
    try { const aiSalary = await extractSalaryViaAI(result.content); if (aiSalary) result.salary = aiSalary; } catch (_) {}
  }
  return result;
}

function extractFromHtml(html, sourceUrl) {
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  function getMeta(name) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
    const altRe = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i");
    return re.exec(html)?.[1]?.trim() || altRe.exec(html)?.[1]?.trim() || null;
  }
  const ogTitle = getMeta("og:title"), ogDesc = getMeta("og:description"), ogSiteName = getMeta("og:site_name"), metaSubdomain = getMeta("subdomain");
  let jsonLd = null;
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      let data = JSON.parse(inner);
      if (Array.isArray(data)) data = data.find(d => d["@type"] === "JobPosting") || data[0];
      if (data["@graph"]) data = (data["@graph"] || []).find(d => d["@type"] === "JobPosting") || data;
      if (data["@type"] === "JobPosting") {
        jsonLd = { title: data.title || null, companyName: data.hiringOrganization?.name || null, location: extractJsonLdLocation(data), salary: extractJsonLdSalary(data), description: stripHtml(data.description || ""), qualifications: data.qualifications || data.experienceRequirements || null, employmentType: data.employmentType || null };
        break;
      }
    } catch {}
  }
  let bodyHtml = html.replace(/<head[\s\S]*?<\/head>/gi, "").replace(/<(script|style|nav|footer|header|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "");
  let mainBlock = null;
  const mainMatch = bodyHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && stripHtml(mainMatch[1]).trim().length >= 200) mainBlock = mainMatch[1];
  if (!mainBlock) { const jm = bodyHtml.match(/<div[^>]*class="[^"]*job[-_\s]?description[^"]*"[^>]*>([\s\S]*?)<\/div>/i); if (jm && stripHtml(jm[1]).trim().length >= 200) mainBlock = jm[1]; }
  if (!mainBlock) { const am = bodyHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i); if (am && stripHtml(am[1]).trim().length >= 200) mainBlock = am[1]; }
  if (mainBlock) bodyHtml = mainBlock;
  const content = stripHtml(bodyHtml);
  const title = jsonLd?.title || ogTitle || titleTag;
  let companyName = jsonLd?.companyName || ogSiteName || extractCompanyFromUrl(sourceUrl);
  try { const host = new URL(sourceUrl).hostname; if (host === "apply.workable.com" && metaSubdomain) companyName = metaSubdomain.charAt(0).toUpperCase() + metaSubdomain.slice(1).toLowerCase(); } catch (_) {}
  let location = jsonLd?.location || extractLocationFromText(content) || null;
  let salary = jsonLd?.salary || extractSalaryFromText(content) || null;
  let finalContent = content.trim().length > 50 ? content : (jsonLd?.description || content);
  if (finalContent.trim().length < 50 && ogDesc) finalContent = ogDesc;
  finalContent = decodeHtmlEntities(finalContent);
  if (/<[a-z][\s\S]*>/i.test(finalContent)) finalContent = stripHtml(finalContent);
  finalContent = finalContent.slice(0, 15000).trim();
  if (!location) location = extractLocationFromText(finalContent) || null;
  if (!salary) salary = extractSalaryFromText(finalContent) || null;
  return { title: title ? decodeHtmlEntities(title) : null, companyName: companyName ? decodeHtmlEntities(companyName) : null, location, salary, content: finalContent, jsonLd };
}

function extractJsonLdLocation(data) {
  const loc = data.jobLocation;
  if (!loc) return data.jobLocationType === "TELECOMMUTE" ? "Remote" : null;
  if (typeof loc === "string") return loc;
  if (Array.isArray(loc)) return loc.map(l => { const a = l.address; if (!a) return l.name || null; return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", "); }).filter(Boolean).join(" / ");
  const addr = loc.address;
  if (addr) return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ");
  return loc.name || null;
}
function extractJsonLdSalary(data) {
  const base = data.baseSalary || data.estimatedSalary;
  if (!base) return null;
  const val = base.value || base;
  if (typeof val === "string") return val;
  const currency = base.currency || val.currency || "USD";
  const min = val.minValue ?? val.value, max = val.maxValue ?? val.value;
  if (min != null && max != null && min !== max) return `${currency} ${min.toLocaleString()}–${max.toLocaleString()}`;
  if (min != null) return `${currency} ${Number(min).toLocaleString()}`;
  return null;
}
function extractCompanyFromUrl(url) {
  try { const host = new URL(url).hostname.replace("www.", "").replace("jobs.", "").replace("careers.", ""); return host.split(".")[0].charAt(0).toUpperCase() + host.split(".")[0].slice(1); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function send(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(data);
}

function parseBody(req) {
  return new Promise((resolve) => {
    const b = req.body;
    if (b !== undefined && b !== null) {
      if (typeof b === "object" && !Buffer.isBuffer(b)) { resolve(b); return; }
      if (typeof b === "string") { try { resolve(JSON.parse(b)); } catch { resolve({}); } return; }
      resolve({}); return;
    }
    let buf = "";
    req.on("data", (ch) => { buf += typeof ch === "string" ? ch : (ch?.toString?.() ?? ""); });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  const pathStr = (url.pathname || "/").replace(/\/$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Scout-Key");
    return res.status(204).end();
  }

  try {
    // ---- Health ----
    if (pathStr === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // ---- Data (GET/POST) ----
    if (pathStr === "/api/data") {
      let key = getScoutKey(req);
      let body = null;
      if (req.method === "POST") {
        body = await parseBody(req);
        if (!key && body?.key) key = normalizeKey(body.key);
      }
      if (!key) return send(res, 401, { error: "Scout key required" });
      await getOrCreateWorkspace(key);
      if (req.method === "GET") {
        const data = await readWorkspaceData(key);
        return send(res, 200, { jobs: data.jobs ?? [], companies: data.companies ?? [] });
      }
      const jobs = Array.isArray(body.jobs) ? body.jobs : [];
      const companies = Array.isArray(body.companies) ? body.companies : [];
      await writeWorkspaceData(key, { jobs, companies });
      return send(res, 200, { ok: true });
    }

    // ---- Workspace ----
    if (pathStr === "/api/workspace" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      const ws = await getOrCreateWorkspace(key);
      return send(res, 200, { key: ws.key, email: ws.email ?? null });
    }

    // ---- Workspace email ----
    if (pathStr === "/api/workspace/email") {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      if (req.method === "POST") {
        const body = await parseBody(req);
        const email = body?.email && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
        if (!email) return send(res, 400, { error: "Email required" });
        let ws = await getOrCreateWorkspace(key);
        if (ws.email && ws.email !== email) await getRedis().del(`ws-email:${ws.email}`);
        ws.email = email;
        await setWorkspace(key, ws);
        await getRedis().set(`ws-email:${email}`, key);
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        let ws = await getWorkspace(key);
        if (ws) {
          if (typeof ws === "string") ws = JSON.parse(ws);
          if (ws.email) await getRedis().del(`ws-email:${ws.email}`);
          ws.email = null;
          await setWorkspace(key, ws);
        }
        return send(res, 200, { ok: true });
      }
    }

    // ---- Recovery ----
    if (pathStr === "/api/recover" && req.method === "POST") {
      const body = await parseBody(req);
      const email = body?.email && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
      if (!email) return send(res, 400, { error: "Email required" });
      const wsKey = await getRedis().get(`ws-email:${email}`);
      if (!wsKey) return send(res, 404, { error: "No account found for this email" });
      const token = crypto.randomBytes(32).toString("hex");
      await getRedis().set(`magic-link:${token}`, JSON.stringify({ email, used: false }), { ex: 900 });
      const origin = process.env.APP_ORIGIN || (req.headers.origin || `https://${req.headers.host}`);
      const recoverUrl = `${origin}/recover?token=${token}`;
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: process.env.RESEND_FROM || "Scout <onboarding@resend.dev>", to: [email], subject: "Your Scout access key", html: `Use this link to access Scout from this device (expires in 15 minutes): <a href="${recoverUrl}">${recoverUrl}</a>` }),
        });
        if (!resendRes.ok) { console.error("Resend error:", resendRes.status); return send(res, 502, { error: "Failed to send recovery email" }); }
      } else {
        console.warn("RESEND_API_KEY not set; recovery link:", recoverUrl);
      }
      return send(res, 200, { ok: true });
    }
    if (pathStr === "/api/recover" && req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return send(res, 400, { error: "Token required" });
      const raw = await getRedis().get(`magic-link:${token}`);
      if (!raw) return send(res, 404, { error: "Invalid or expired link" });
      const link = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (link.used) return send(res, 400, { error: "This link has already been used" });
      const wsKey = await getRedis().get(`ws-email:${link.email}`);
      if (!wsKey) return send(res, 404, { error: "Workspace not found" });
      link.used = true;
      await getRedis().set(`magic-link:${token}`, JSON.stringify(link), { ex: 60 });
      return send(res, 200, { key: wsKey });
    }

    // ---- Check ----
    if (pathStr === "/api/check") {
      const keySet = !!ANTHROPIC_KEY;
      return send(res, 200, { key_configured: keySet, key_prefix: keySet ? ANTHROPIC_KEY.slice(0, 12) + "…" : null });
    }

    // ---- Job proxy ----
    if (pathStr === "/api/job" && req.method === "GET") {
      const ats = url.searchParams.get("ats"), company = url.searchParams.get("company"), jobId = url.searchParams.get("jobId");
      if (!ats || !company || !jobId) return send(res, 400, { error: "Missing ats, company, or jobId" });
      const result = await handleJobProxy(ats, company, jobId);
      return send(res, 200, result);
    }

    // ---- Scrape ----
    if (pathStr === "/api/scrape" && req.method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return send(res, 400, { error: "Missing url parameter" });
      const result = await handleScrape(targetUrl);
      return send(res, 200, result);
    }

    // ---- Brand color ----
    if (pathStr === "/api/brand-color" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      const domain = normalizeDomain(url.searchParams.get("domain") || "");
      const companyName = (url.searchParams.get("companyName") || "").trim() || null;
      if (!domain && !companyName) return send(res, 400, { error: "domain or companyName required" });
      const cacheKey = (domain && domain.length > 0) ? domain : companyName.toLowerCase().replace(/\s+/g, "");
      if (KNOWN_BRAND_COLORS_SERVER[cacheKey]) return send(res, 200, { hex: KNOWN_BRAND_COLORS_SERVER[cacheKey] });
      const cached = await getBrandColor(cacheKey);
      if (cached) return send(res, 200, { hex: cached });
      const hex = await fetchBrandColorViaClaude(domain || companyName, companyName);
      if (hex) await setBrandColor(cacheKey, hex);
      return send(res, 200, { hex: hex || null });
    }

    // ---- Clear caches ----
    if (pathStr === "/api/clear-caches" && (req.method === "DELETE" || req.method === "POST")) {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      await getRedis().del("brand-colors", "company-research");
      return send(res, 200, { cleared: ["brand_colors", "company_research"] });
    }

    // ---- Company research cache ----
    if (pathStr === "/api/company-research-cache" && (req.method === "DELETE" || req.method === "POST")) {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      await getRedis().del("company-research");
      return send(res, 200, { cleared: true });
    }

    // ---- Company research ----
    if (pathStr === "/api/company-research" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) return send(res, 401, { error: "Scout key required" });
      const companyName = (url.searchParams.get("companyName") || "").trim();
      if (!companyName) return send(res, 400, { error: "companyName required" });
      const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
      const cacheKey = normalizeCompanyKey(companyName);
      if (!refresh) { const cached = await getCompanyResearch(cacheKey); if (cached) return send(res, 200, cached); }
      const data = await fetchCompanyResearchViaClaude(companyName);
      if (data) await setCompanyResearch(cacheKey, data);
      return send(res, 200, data || { name: companyName, description: "", size: "", stage: "", designTeamSize: "", designLeaders: "", culture: "", website: "" });
    }

    // ---- Claude proxy ----
    if (pathStr === "/api/claude" && req.method === "POST") {
      const body = await parseBody(req);
      const text = await handleClaudeProxy(body);
      return send(res, 200, { text });
    }

    return send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || "Server error" });
  }
}
