import "dotenv/config";
import http from "http";
import { URL } from "url";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const PORT = process.env.API_PORT || 3001;
const DATA_DIR = path.join(process.cwd(), "data");
const WORKSPACES_FILE = path.join(DATA_DIR, "workspaces.json");
const MAGIC_LINKS_FILE = path.join(DATA_DIR, "magic_links.json");
const BRAND_COLORS_FILE = path.join(DATA_DIR, "brand_colors.json");
const COMPANY_RESEARCH_FILE = path.join(DATA_DIR, "company_research.json");

const SCOUT_KEY_REGEX = /^scout_[a-z0-9]{8}$/i;
function isValidScoutKey(key) {
  return typeof key === "string" && SCOUT_KEY_REGEX.test(key.trim());
}
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
async function readWorkspaces() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(WORKSPACES_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function writeWorkspaces(workspaces) {
  await ensureDataDir();
  await fs.writeFile(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2), "utf8");
}
async function getOrCreateWorkspace(key) {
  const workspaces = await readWorkspaces();
  let ws = workspaces.find((w) => w.key === key);
  if (!ws) {
    ws = { key, email: null, created_at: new Date().toISOString() };
    workspaces.push(ws);
    await writeWorkspaces(workspaces);
  }
  return ws;
}
function workspaceDataPath(key) {
  const safe = key.replace(/[^a-z0-9_]/gi, "_");
  return path.join(DATA_DIR, `workspace-${safe}.json`);
}
async function readWorkspaceData(key) {
  try {
    const raw = await fs.readFile(workspaceDataPath(key), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return { jobs: [], companies: [] };
    throw e;
  }
}
async function writeWorkspaceData(key, data) {
  await ensureDataDir();
  await fs.writeFile(workspaceDataPath(key), JSON.stringify(data, null, 2), "utf8");
}

async function readMagicLinks() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(MAGIC_LINKS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function writeMagicLinks(links) {
  await ensureDataDir();
  await fs.writeFile(MAGIC_LINKS_FILE, JSON.stringify(links, null, 2), "utf8");
}

/** Known brand colors (domain or name key). Checked before cache/Claude so we always return correct colors. */
const KNOWN_BRAND_COLORS_SERVER = {
  "zynga.com": "#E91D26",
  zynga: "#E91D26",
  "kraken.com": "#5741D9",
  kraken: "#5741D9",
  "thumbtack.com": "#009FD9",
  thumbtack: "#009FD9",
};

async function readBrandColors() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(BRAND_COLORS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
async function writeBrandColors(cache) {
  await ensureDataDir();
  await fs.writeFile(BRAND_COLORS_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function readCompanyResearch() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(COMPANY_RESEARCH_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
async function writeCompanyResearch(cache) {
  await ensureDataDir();
  await fs.writeFile(COMPANY_RESEARCH_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function normalizeCompanyKey(name) {
  if (!name || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

const COMPANY_RESEARCH_SYSTEM = `You are a career researcher. Return ONLY raw JSON (no markdown, no backticks) with these exact fields:
{"name":"official name","description":"2-3 sentences on what they do and their design culture","size":"employee count range e.g. 200-500 (number or range only, no word 'employees')","stage":"e.g. Series B, Public","designTeamSize":"estimated design headcount","designLeaders":"CEO and/or founders/co-founders only (names and titles). NEVER include: Chief Design Officer, Chief Brand Officer, Head of Design, VP Design, or any design/UX/brand executive—only the top executive (CEO) and company founders/co-founders. If none are easily found, use empty string.","culture":"2-3 words on culture and craft expectations","website":"domain only e.g. company.com"}`;

async function fetchCompanyResearchViaClaude(companyName) {
  if (!ANTHROPIC_KEY || !companyName) return null;
  try {
    const text = await handleClaudeProxy({
      userMsg: `Research this company: "${companyName}". In the designLeaders field put ONLY the CEO and/or founders/co-founders (name and title). Do not put Chief Design Officer, Chief Brand Officer, Head of Design, or any design/UX leader—only CEO or founders.`,
      systemMsg: COMPANY_RESEARCH_SYSTEM,
      useWebSearch: false,
    });
    const parsed = JSON.parse((text || "").replace(/```json|```/g, "").trim());
    return {
      name: parsed.name ?? companyName,
      description: parsed.description ?? "",
      size: parsed.size ?? "",
      stage: parsed.stage ?? "",
      designTeamSize: parsed.designTeamSize ?? "",
      designLeaders: parsed.designLeaders ?? "",
      culture: parsed.culture ?? "",
      website: parsed.website ?? "",
    };
  } catch (e) {
    console.warn("Company research Claude call failed:", e.message);
    return null;
  }
}

function normalizeDomain(website) {
  if (!website || typeof website !== "string") return "";
  const s = website.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  return s || "";
}

/** Ask Claude for primary brand color; returns hex or null. */
async function fetchBrandColorViaClaude(domain, companyName) {
  if (!ANTHROPIC_KEY) return null;
  const domainPart = domain ? `website domain "${domain}"` : "";
  const namePart = companyName ? (domainPart ? ` or company name "${companyName}"` : `company name "${companyName}"`) : "";
  const prompt = `What is the primary brand color of the company with ${domainPart}${namePart}? Reply with only a single hex code in the format #RRGGBB (e.g. #635BFF), nothing else.`;
  try {
    const text = await handleClaudeProxy({
      userMsg: prompt,
      systemMsg: "You are a brand color expert. Reply only with one hex code.",
      useWebSearch: false,
    });
    const match = (text || "").match(/#[0-9A-Fa-f]{6}/);
    return match ? match[0] : null;
  } catch (e) {
    console.warn("Brand color Claude call failed:", e.message);
    return null;
  }
}

function normalizeKey(key) {
  if (typeof key !== "string") return null;
  const k = key.trim();
  return isValidScoutKey(k) ? k.toLowerCase() : null;
}
function getScoutKey(req) {
  const keyHeader = req.headers["x-scout-key"];
  if (keyHeader) {
    const k = normalizeKey(keyHeader);
    if (k) return k;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const k = normalizeKey(auth.slice(7));
    if (k) return k;
  }
  return null;
}
const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|dt|dd)>/gi, "\n")
    .replace(/<(?:ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function handleJobProxy(ats, company, jobId) {
  if (ats === "greenhouse") {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}?content=true`
    );
    if (!res.ok) throw new Error(`Greenhouse returned ${res.status}`);
    const data = await res.json();
    // Greenhouse double-encodes HTML entities; decode first, then strip tags
    let raw = data.content || "";
    raw = decodeHtmlEntities(raw);
    // Extract salary: first try pay-range div, then scan body text (e.g. "compensation range ... $X/yr to $Y/yr")
    let salary = null;
    const payMatch = raw.match(/<div[^>]*class="pay-range"[^>]*>([\s\S]*?)<\/div>/i);
    if (payMatch) {
      salary = stripHtml(payMatch[1]).trim() || null;
    }
    if (!salary) {
      const text = htmlToText(raw);
      const rangePat = /\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/gi;
      const ranges = text.match(rangePat);
      if (ranges && ranges.length > 0) {
        salary = ranges
          .map((r) => r.replace(/\s+/g, " ").trim())
          .filter((r, i, a) => a.indexOf(r) === i)
          .slice(0, 2)
          .join("; ");
      }
    }
    return {
      title: data.title,
      companyName: data.company_name || company,
      location: data.location?.name || "Remote",
      salary,
      content: htmlToText(raw),
    };
  }
  if (ats === "lever") {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${company}/${jobId}`
    );
    if (!res.ok) throw new Error(`Lever returned ${res.status}`);
    const data = await res.json();
    const raw = [data.description, data.descriptionBody, ...(data.lists || []).map((l) => `<h3>${l.text}</h3>${l.content}`)].join("\n");
    const content = htmlToText(raw);
    const salary = extractSalaryFromText(content) || null;
    return {
      title: data.text,
      companyName: company,
      location: data.categories?.location || data.categories?.allLocations?.[0] || "Remote",
      salary,
      content,
    };
  }
  if (ats === "ashby") {
    const boardUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}`;
    const res = await fetch(boardUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Scout/1.0; Job Tracker)",
        Referer: "https://jobs.ashbyhq.com/",
      },
    });
    if (!res.ok) {
      const msg = res.status === 401
        ? "Ashby returned 401. Some boards may be restricted."
        : `Ashby returned ${res.status}`;
      throw new Error(msg);
    }
    const data = await res.json();
    const job = (data.jobs || []).find(
      (j) => j.id === jobId || (j.jobUrl && j.jobUrl.includes(jobId))
    );
    if (!job) throw new Error("Job not found in Ashby board");
    const raw = job.descriptionHtml || job.descriptionPlain || "";
    let salary = null;
    try {
      const jobPageUrl = `https://jobs.ashbyhq.com/${company}/${jobId}`;
      const scraped = await handleScrape(jobPageUrl);
      salary = scraped.salary || null;
    } catch (_) {}
    return {
      title: job.title,
      companyName: company,
      location: job.location || job.workplaceType || "Remote",
      salary,
      content: htmlToText(raw),
    };
  }
  if (ats === "workday") {
    // Workday uses an internal REST API: /wday/cxs/{company}/{board}/job/{jobSlug}
    // The URL looks like: company.wd5.myworkdayjobs.com/en-US/Board/job/Title_ID
    // We receive: company = subdomain (e.g. "workday"), jobId = full URL for parsing
    const workdayUrl = jobId;
    const parsed = new URL(workdayUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    // Strip optional locale like "en-US"
    const filtered = pathParts.filter(p => !/^[a-z]{2}(-[A-Z]{2})?$/.test(p));
    // e.g. ["Workday", "job", "USA-CO-Boulder", "Sr-Software-Development-Engineer_JR-0104916"]
    const boardIdx = 0;
    const board = filtered[boardIdx] || "external";
    const jobSlug = filtered.slice(filtered.indexOf("job")).join("/");
    const apiUrl = `${parsed.origin}/wday/cxs/${company}/${board}/${jobSlug}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    });
    if (!res.ok) throw new Error(`Workday returned ${res.status}`);
    const data = await res.json();
    const info = data.jobPostingInfo || {};
    const content = htmlToText(info.jobDescription || "");
    const salary = extractSalaryFromText(content) || null;
    return {
      title: info.title,
      companyName: company.charAt(0).toUpperCase() + company.slice(1),
      location: info.location || "Remote",
      salary,
      content,
    };
  }
  if (ats === "smartrecruiters") {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(jobId)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`SmartRecruiters returned ${res.status}`);
    const data = await res.json();
    const loc = data.location;
    const locationStr = loc
      ? [loc.city, loc.region, loc.country].filter(Boolean).join(", ")
      : (data.jobAd?.location?.label || "Remote");
    const sections = data.jobAd?.sections || {};
    const raw = [
      sections.jobDescription?.text,
      sections.qualifications?.text,
      sections.additionalInformation?.text,
      sections.companyDescription?.text,
    ].filter(Boolean).join("\n");
    const comp = data.compensation;
    let salary = null;
    if (comp?.min?.value && comp?.max?.value) {
      const cur = comp.currency || "USD";
      salary = `${cur} ${Number(comp.min.value).toLocaleString()}–${Number(comp.max.value).toLocaleString()}`;
    }
    return {
      title: data.name,
      companyName: data.company?.name || company,
      location: locationStr,
      salary,
      content: htmlToText(raw),
    };
  }
  throw new Error(`Unknown ATS: ${ats}`);
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

async function handleScrape(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(targetUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Page returned ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("Not an HTML page");
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BODY) throw new Error("Page too large");
  const html = new TextDecoder("utf-8").decode(buf);

  const result = extractFromHtml(html, targetUrl);
  // AI fallback for salary when pattern matching found nothing
  if (!result.salary && result.content && result.content.length > 400) {
    try {
      const aiSalary = await extractSalaryViaAI(result.content);
      if (aiSalary) result.salary = aiSalary;
    } catch (_) {}
  }
  return result;
}

function extractFromHtml(html, sourceUrl) {
  // Extract <title>
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;

  // Extract meta tags
  function getMeta(name) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
    const altRe = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i");
    return re.exec(html)?.[1]?.trim() || altRe.exec(html)?.[1]?.trim() || null;
  }

  const ogTitle = getMeta("og:title");
  const ogDesc = getMeta("og:description");
  const ogSiteName = getMeta("og:site_name");
  const metaSubdomain = getMeta("subdomain");

  // Extract JSON-LD JobPosting
  let jsonLd = null;
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      let data = JSON.parse(inner);
      if (Array.isArray(data)) data = data.find((d) => d["@type"] === "JobPosting") || data[0];
      if (data["@graph"]) data = (data["@graph"] || []).find((d) => d["@type"] === "JobPosting") || data;
      if (data["@type"] === "JobPosting") {
        jsonLd = {
          title: data.title || null,
          companyName: data.hiringOrganization?.name || null,
          location: extractJsonLdLocation(data),
          salary: extractJsonLdSalary(data),
          description: stripHtml(data.description || ""),
          qualifications: data.qualifications || data.experienceRequirements || null,
          employmentType: data.employmentType || null,
        };
        break;
      }
    } catch {}
  }

  // Strip HTML to text (remove script, style, nav, footer, header tags and their content)
  let bodyHtml = html.replace(/<head[\s\S]*?<\/head>/gi, "");
  bodyHtml = bodyHtml.replace(/<(script|style|nav|footer|header|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Prefer main content or job-description block when present (cleaner role text for extraction)
  let mainBlock = null;
  const mainMatch = bodyHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && stripHtml(mainMatch[1]).trim().length >= 200) mainBlock = mainMatch[1];
  if (!mainBlock) {
    const jobDescRe = /<div[^>]*class="[^"]*job[-_\s]?description[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const jobMatch = bodyHtml.match(jobDescRe);
    if (jobMatch && stripHtml(jobMatch[1]).trim().length >= 200) mainBlock = jobMatch[1];
  }
  if (!mainBlock) {
    const articleMatch = bodyHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch && stripHtml(articleMatch[1]).trim().length >= 200) mainBlock = articleMatch[1];
  }
  if (mainBlock) bodyHtml = mainBlock;
  const content = stripHtml(bodyHtml);

  // Build result: prefer JSON-LD > OG > title tag
  const title = jsonLd?.title || ogTitle || titleTag;
  let companyName = jsonLd?.companyName || ogSiteName || extractCompanyFromUrl(sourceUrl);
  try {
    const host = new URL(sourceUrl).hostname;
    if (host === "apply.workable.com" && metaSubdomain) {
      companyName = metaSubdomain.charAt(0).toUpperCase() + metaSubdomain.slice(1).toLowerCase();
    }
  } catch (_) {}
  let location = jsonLd?.location || null;
  if (!location) location = extractLocationFromText(content) || null;
  let salary = jsonLd?.salary || null;
  if (!salary) salary = extractSalaryFromText(content) || null;

  // For JS-rendered SPAs (body empty): use JSON-LD description, then og:description
  let finalContent = content.trim().length > 50 ? content : (jsonLd?.description || content);
  if (finalContent.trim().length < 50 && ogDesc) finalContent = ogDesc;
  finalContent = decodeHtmlEntities(finalContent);
  if (/<[a-z][\s\S]*>/i.test(finalContent)) finalContent = stripHtml(finalContent);
  finalContent = finalContent.slice(0, 15000).trim();

  // Location & salary: also try final content (e.g. when body was empty)
  if (!location) location = extractLocationFromText(finalContent) || null;
  if (!salary) salary = extractSalaryFromText(finalContent) || null;

  return {
    title: title ? decodeHtmlEntities(title) : null,
    companyName: companyName ? decodeHtmlEntities(companyName) : null,
    location,
    salary,
    content: finalContent,
    jsonLd,
  };
}

function extractJsonLdLocation(data) {
  const loc = data.jobLocation;
  if (!loc) return data.jobLocationType === "TELECOMMUTE" ? "Remote" : null;
  if (typeof loc === "string") return loc;
  if (Array.isArray(loc)) {
    return loc.map((l) => {
      const addr = l.address;
      if (!addr) return l.name || null;
      return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ");
    }).filter(Boolean).join(" / ");
  }
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
  const min = val.minValue ?? val.value;
  const max = val.maxValue ?? val.value;
  if (min != null && max != null && min !== max) return `${currency} ${min.toLocaleString()}–${max.toLocaleString()}`;
  if (min != null) return `${currency} ${Number(min).toLocaleString()}`;
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function decodeHtmlEntities(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ");
}

/** Format a number with commas (e.g. 182700 -> "182,700"). */
function formatNum(n) {
  const s = String(Math.floor(Number(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Extract first salary range from plain text (used when API/JSON-LD has none). */
function extractSalaryFromText(text) {
  if (!text || typeof text !== "string") return null;
  // Multi-zone / "base pay ranges" (e.g. Atlassian: Zone A: USD 182700 - USD 238525, Zone B: ...)
  const zoneRangeRe = /(?:USD|CAD|GBP|EUR)\s*([\d,]+)\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?([\d,]+)/gi;
  const zoneMatches = [...text.matchAll(zoneRangeRe)];
  if (zoneMatches.length > 0) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    let currency = "USD";
    for (const m of zoneMatches) {
      const low = Number(m[1].replace(/,/g, ""));
      const high = Number(m[2].replace(/,/g, ""));
      if (!Number.isNaN(low) && !Number.isNaN(high)) {
        if (low < minVal) minVal = low;
        if (high > maxVal) maxVal = high;
        if (/USD/i.test(m[0])) currency = "USD";
        else if (/CAD/i.test(m[0])) currency = "CAD";
        else if (/GBP/i.test(m[0])) currency = "GBP";
        else if (/EUR/i.test(m[0])) currency = "EUR";
      }
    }
    if (minVal !== Infinity && maxVal !== Infinity && minVal <= maxVal) {
      const s = `${currency} ${formatNum(minVal)} – ${currency} ${formatNum(maxVal)}`;
      if (s.length < 120) return s;
    }
  }
  const patterns = [
    // "Salary: $X - $Y" / "Compensation: $X to $Y"
    /\b(?:salary|compensation|pay)\s*:?\s*\$[\d,]+\s*(?:[-–—]+|to)\s*\$[\d,]+/i,
    // "USD 182700 - USD 238525" (currency repeated; Atlassian-style)
    /(?:USD|CAD|GBP|EUR)\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?[\d,]+/i,
    // "CA$163,900 - CA$245,900" (Stripe and other Canadian format)
    /CA\$\s*[\d,]+\s*(?:[-–—]+|to)\s*CA\$\s*[\d,]+/gi,
    /(?:US|AU)\$\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:US|AU)\$\s*[\d,]+/gi,
    /\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/gi,
    /\$[\d,]+(?:\.\d+)?\s*(?:[-–—]+|to)\s*\$[\d,]+(?:\.\d+)?\s*(?:USD|CAD|GBP|EUR)?/gi,
    /(?:USD|CAD|GBP|EUR)\s*[\d,]+(?:\s*[-–—]+|to)\s*[\d,]+/gi,
    // Euro / Pound ranges
    /€[\d,]+\s*(?:[-–—]+|to)\s*€[\d,]+/g,
    /£[\d,]+\s*(?:[-–—]+|to)\s*£[\d,]+/g,
    // "100k - 150k" / "100k–150k" (no currency symbol)
    /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\s*(?:[-–—]+|to)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\b/i,
    // "120,000 - 150,000" with optional "per year" / "USD" nearby (single range)
    /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:[-–—]+|to)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:USD|CAD|GBP|EUR|per\s+year|per\s+yr|\.)?/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m && m[0]) {
      let s = m[0].replace(/\s+/g, " ").replace(/\s*[-–—]{2,}\s*/g, " – ").trim();
      // Normalize "100k - 150k" -> "$100k – $150k" for display
      const kMatch = s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\s*(?:[-–—]+|to)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*k$/i);
      if (kMatch) s = `$${kMatch[1]}k – $${kMatch[2]}k`;
      // Add commas to plain numbers in "USD 182700 – USD 238525" style
      const usdMatch = s.match(/^(USD|CAD|GBP|EUR)\s*([\d,]+)\s*[-–—]\s*(?:\1\s*)?([\d,]+)$/i);
      if (usdMatch) s = `${usdMatch[1]} ${formatNum(usdMatch[2])} – ${usdMatch[1]} ${formatNum(usdMatch[3])}`;
      if (s.length > 6 && s.length < 120) return s;
    }
  }
  return null;
}

function extractCompanyFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace("www.", "").replace("jobs.", "").replace("careers.", "");
    const name = host.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

/** Normalize and join multiple location parts (e.g. "City, State | City, State" -> "City, State / City, State"). */
function normalizeMultiLocation(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw
    .split(/\s*\|\s*|\s*;\s*|\s+and\s+/i)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter((p) => p.length > 2 && p.length < 120);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

/** Extract location(s) from job text, including pipe/semicolon-separated lists. */
function extractLocationFromText(text) {
  if (!text || typeof text !== "string") return null;
  // "Location:" or "Locations:" line that may contain "City, State | City, State | ..."
  const headerMatch = text.match(/(?:^|\n)\s*(?:location|locations|office)\s*:?\s*([^\n]+)/im);
  if (headerMatch) {
    const value = headerMatch[1].trim();
    const normalized = normalizeMultiLocation(value);
    if (normalized) return normalized;
    if (value.length > 3 && value.length < 150) return value.trim();
  }
  // Standalone line or phrase like "San Francisco, California   |   Seattle, Washington   |   New York, New York"
  const pipeLine = text.match(/[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)(?:\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+))*/);
  if (pipeLine) {
    const normalized = normalizeMultiLocation(pipeLine[0]);
    if (normalized) return normalized;
  }
  return null;
}

/** AI fallback when pattern matching finds no salary. Returns one concise range string or null. */
async function extractSalaryViaAI(jobText) {
  if (!ANTHROPIC_KEY || !jobText || jobText.length < 200) return null;
  const systemMsg = "You extract salary/compensation from job postings. Reply with ONLY a single line: the salary or base pay range in a concise form (e.g. USD 152,100 – USD 238,525 or $120k – $150k). If there are multiple zones or ranges, give the overall range (lowest to highest). If no salary/compensation is mentioned, reply with exactly: NULL";
  const userMsg = `Extract the salary or base pay range from this job posting. Reply with only the range (one line) or NULL.\n\n${jobText.slice(0, 8000)}`;
  try {
    const text = await handleClaudeProxy({ userMsg, systemMsg, useWebSearch: false });
    const trimmed = (text || "").trim().toUpperCase();
    if (!trimmed || trimmed === "NULL" || trimmed.startsWith("NO ") || trimmed.length > 100) return null;
    return (text || "").trim();
  } catch (_) {
    return null;
  }
}

async function handleClaudeProxy(body) {
  if (!ANTHROPIC_KEY) {
    throw new Error("Missing VITE_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY on server");
  }
  const { userMsg, systemMsg, useWebSearch = false } = body;
  // Use cheaper Haiku when we already have content (extraction only); Sonnet for web search
  const model = useWebSearch ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001";
  const apiBody = {
    model,
    max_tokens: 2000,
    system: systemMsg,
    messages: [{ role: "user", content: userMsg }],
  };
  if (useWebSearch) {
    apiBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(apiBody),
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.error?.message || data.message || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  if (!data.content || !Array.isArray(data.content)) {
    throw new Error("Invalid API response: no content");
  }
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function send(res, status, data) {
  const body = typeof data === "object" ? JSON.stringify(data) : data;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (ch) => (buf += ch));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = (url.pathname || "/").replace(/\/$/, "") || "/";
  console.log(`${req.method} ${path}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Scout-Key",
    });
    res.end();
    return;
  }

  try {
    if (path === "/api/health" && req.method === "GET") {
      send(res, 200, { ok: true, port: PORT });
      return;
    }
    if (path === "/api/data" && (req.method === "GET" || req.method === "POST")) {
      let key = getScoutKey(req);
      let body = null;
      if (req.method === "POST") {
        body = await parseBody(req);
        if (!key && body && body.key) key = normalizeKey(body.key);
      }
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      await getOrCreateWorkspace(key);
      if (req.method === "GET") {
        const data = await readWorkspaceData(key);
        send(res, 200, { jobs: data.jobs ?? [], companies: data.companies ?? [] });
        return;
      }
      const jobs = Array.isArray(body.jobs) ? body.jobs : [];
      const companies = Array.isArray(body.companies) ? body.companies : [];
      await writeWorkspaceData(key, { jobs, companies });
      send(res, 200, { ok: true });
      return;
    }

    if (path === "/api/workspace" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      const ws = await getOrCreateWorkspace(key);
      send(res, 200, { key: ws.key, email: ws.email ?? null });
      return;
    }

    if (path === "/api/workspace/email" && req.method === "POST") {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      const body = await parseBody(req);
      const email = body?.email && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
      if (!email) {
        send(res, 400, { error: "Email required" });
        return;
      }
      const workspaces = await readWorkspaces();
      let ws = workspaces.find((w) => w.key === key);
      if (!ws) {
        ws = { key, email, created_at: new Date().toISOString() };
        workspaces.push(ws);
      } else {
        ws.email = email;
      }
      await writeWorkspaces(workspaces);
      send(res, 200, { ok: true });
      return;
    }

    if (path === "/api/workspace/email" && req.method === "DELETE") {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      const workspaces = await readWorkspaces();
      const ws = workspaces.find((w) => w.key === key);
      if (ws) {
        ws.email = null;
        await writeWorkspaces(workspaces);
      }
      send(res, 200, { ok: true });
      return;
    }

    if (path === "/api/recover" && req.method === "POST") {
      const body = await parseBody(req);
      const email = body?.email && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
      if (!email) {
        send(res, 400, { error: "Email required" });
        return;
      }
      const workspaces = await readWorkspaces();
      const ws = workspaces.find((w) => w.email === email);
      if (!ws) {
        send(res, 404, { error: "No account found for this email" });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const links = await readMagicLinks();
      links.push({ token, email, expires_at: expiresAt, used: false });
      await writeMagicLinks(links);
      const origin = process.env.APP_ORIGIN || "http://localhost:5173";
      const recoverUrl = `${origin}/recover?token=${token}`;
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "Scout <onboarding@resend.dev>",
            to: [email],
            subject: "Your Scout access key",
            html: `Use this link to access Scout from this device (expires in 15 minutes): <a href="${recoverUrl}">${recoverUrl}</a>`,
          }),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend error:", resendRes.status, errText);
          send(res, 502, { error: "Failed to send recovery email" });
          return;
        }
      } else {
        console.warn("RESEND_API_KEY not set; recovery link (dev only):", recoverUrl);
      }
      send(res, 200, { ok: true });
      return;
    }

    if (path === "/api/recover" && req.method === "GET") {
      const token = url.searchParams.get("token") || null;
      if (!token) {
        send(res, 400, { error: "Token required" });
        return;
      }
      const links = await readMagicLinks();
      const link = links.find((l) => l.token === token);
      if (!link) {
        send(res, 404, { error: "Invalid or expired link" });
        return;
      }
      if (link.used) {
        send(res, 400, { error: "This link has already been used" });
        return;
      }
      if (new Date(link.expires_at) < new Date()) {
        send(res, 400, { error: "This link has expired" });
        return;
      }
      const workspaces = await readWorkspaces();
      const ws = workspaces.find((w) => w.email === link.email);
      if (!ws) {
        send(res, 404, { error: "Workspace not found" });
        return;
      }
      link.used = true;
      await writeMagicLinks(links);
      send(res, 200, { key: ws.key });
      return;
    }

    if (path === "/api/check" && req.method === "GET") {
      const keySet = !!ANTHROPIC_KEY;
      const prefix = keySet ? ANTHROPIC_KEY.slice(0, 12) + "…" : null;
      send(res, 200, { key_configured: keySet, key_prefix: prefix });
      return;
    }

    if (path === "/api/job" && req.method === "GET") {
      const ats = url.searchParams.get("ats");
      const company = url.searchParams.get("company");
      const jobId = url.searchParams.get("jobId");
      if (!ats || !company || !jobId) {
        send(res, 400, { error: "Missing ats, company, or jobId" });
        return;
      }
      const result = await handleJobProxy(ats, company, jobId);
      send(res, 200, result);
      return;
    }

    if (path === "/api/scrape" && req.method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        send(res, 400, { error: "Missing url parameter" });
        return;
      }
      const result = await handleScrape(targetUrl);
      send(res, 200, result);
      return;
    }

    if (path === "/api/brand-color" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      const domain = normalizeDomain(url.searchParams.get("domain") || "");
      const companyName = (url.searchParams.get("companyName") || "").trim() || null;
      if (!domain && !companyName) {
        send(res, 400, { error: "domain or companyName required" });
        return;
      }
      const cacheKey = (domain && domain.length > 0) ? domain : companyName.toLowerCase().replace(/\s+/g, "");
      if (KNOWN_BRAND_COLORS_SERVER[cacheKey]) {
        send(res, 200, { hex: KNOWN_BRAND_COLORS_SERVER[cacheKey] });
        return;
      }
      const cache = await readBrandColors();
      if (cache[cacheKey]) {
        send(res, 200, { hex: cache[cacheKey] });
        return;
      }
      const lookupDomain = domain || null;
      const hex = await fetchBrandColorViaClaude(lookupDomain || companyName, companyName);
      if (hex) {
        cache[cacheKey] = hex;
        await writeBrandColors(cache);
      }
      send(res, 200, { hex: hex || null });
      return;
    }

    if (path === "/api/clear-caches" && (req.method === "DELETE" || req.method === "POST")) {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      await ensureDataDir();
      await fs.writeFile(BRAND_COLORS_FILE, "{}", "utf8");
      await fs.writeFile(COMPANY_RESEARCH_FILE, "{}", "utf8");
      send(res, 200, { cleared: ["brand_colors", "company_research"] });
      return;
    }

    if (path === "/api/company-research-cache" && (req.method === "DELETE" || req.method === "POST")) {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      await ensureDataDir();
      await fs.writeFile(COMPANY_RESEARCH_FILE, "{}", "utf8");
      send(res, 200, { cleared: true });
      return;
    }

    if (path === "/api/company-research" && req.method === "GET") {
      const key = getScoutKey(req);
      if (!key) {
        send(res, 401, { error: "Scout key required" });
        return;
      }
      const companyName = (url.searchParams.get("companyName") || "").trim();
      if (!companyName) {
        send(res, 400, { error: "companyName required" });
        return;
      }
      const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
      const cacheKey = normalizeCompanyKey(companyName);
      const cache = await readCompanyResearch();
      if (!refresh && cache[cacheKey]) {
        send(res, 200, cache[cacheKey]);
        return;
      }
      const data = await fetchCompanyResearchViaClaude(companyName);
      if (data) {
        cache[cacheKey] = data;
        await writeCompanyResearch(cache);
      }
      send(res, 200, data || { name: companyName, description: "", size: "", stage: "", designTeamSize: "", designLeaders: "", culture: "", website: "" });
      return;
    }

    if (path === "/api/claude" && req.method === "POST") {
      const body = await parseBody(req);
      const text = await handleClaudeProxy(body);
      send(res, 200, { text });
      return;
    }

    console.warn(`404 ${req.method} ${path}`);
    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Scout API running at http://localhost:${PORT}`);
  if (!ANTHROPIC_KEY) console.warn("⚠ No VITE_ANTHROPIC_API_KEY in .env — AI features will fail.");
  else console.log("  Anthropic key: configured");
});
