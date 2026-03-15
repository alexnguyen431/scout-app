import { useState, useRef, useEffect, useCallback } from "react";
import confetti from "canvas-confetti";

const SCOUT_KEY_STORAGE = "scout-key";
const API_BASE = import.meta.env.VITE_API_URL ?? "";

const SCOUT_KEY_REGEX = /^scout_[a-z0-9]{8}$/i;
function isValidScoutKey(key) {
  return typeof key === "string" && SCOUT_KEY_REGEX.test(key.trim());
}
/** Extract and normalize key from pasted text (lowercase for consistency with server). */
function normalizeScoutKey(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const match = trimmed.match(/(scout_[a-z0-9]{8})/i);
  const key = match ? match[1].toLowerCase() : trimmed.toLowerCase();
  return isValidScoutKey(key) ? key : null;
}
function generateScoutKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `scout_${suffix}`;
}
function getScoutHeaders() {
  const key = typeof localStorage !== "undefined" ? localStorage.getItem(SCOUT_KEY_STORAGE) : null;
  if (!key) return {};
  return { "X-Scout-Key": key, Authorization: `Bearer ${key}` };
}
function getStoredKey() {
  try {
    const k = localStorage.getItem(SCOUT_KEY_STORAGE);
    return k ? normalizeScoutKey(k) : null;
  } catch { return null; }
}

function EditableField({
  isEditing,
  value,
  editingValue,
  onStartEdit,
  onEditingChange,
  onSave,
  placeholder,
  multiline,
  displayStyle,
  inputStyle,
  emptyLabel,
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      if (multiline) inputRef.current?.select?.();
    }
  }, [isEditing, multiline]);
  const display = value?.trim() || emptyLabel || placeholder || "—";
  if (isEditing) {
    const common = {
      ...inputStyle,
      width: "100%",
      padding: "6px 8px",
      borderRadius: 4,
    };
    return multiline ? (
      <textarea
        ref={inputRef}
        value={editingValue}
        onChange={(e) => onEditingChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), onSave())}
        placeholder={placeholder}
        rows={3}
        style={{ ...common, minHeight: 56, resize: "vertical" }}
      />
    ) : (
      <input
        ref={inputRef}
        type="text"
        value={editingValue}
        onChange={(e) => onEditingChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSave())}
        placeholder={placeholder}
        style={common}
      />
    );
  }
  return (
    <div
      style={{
        ...displayStyle,
        cursor: "pointer",
        borderRadius: 4,
        padding: "2px 6px",
        margin: "-2px -6px",
        border: "1px solid transparent",
        transition: "border-color 0.15s",
      }}
      onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(124, 92, 252, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {display}
    </div>
  );
}

const STATUSES = [
  { id: "interested", label: "Interested", color: "#818cf8" },
  { id: "applied", label: "Applied", color: "#fb923c" },
  { id: "interviewing", label: "Interviewing", color: "#38bdf8" },
  { id: "offer", label: "Offer", color: "#4ade80" },
  { id: "rejected", label: "Rejected", color: "#f87171" },
];

const PRIORITIES = [
  { id: "high", label: "High", color: "#ef4444" },
  { id: "medium", label: "Medium", color: "#eab308" },
  { id: "low", label: "Low", color: "#22c55e" },
];

const SEED_COMPANIES = [
  {
    id: "c1",
    name: "Figma",
    description: "The collaborative interface design tool. Expanding aggressively into dev mode, AI, and variables. Design-led from the ground up.",
    size: "1,000+",
    stage: "Late Stage / Post-IPO",
    designTeamSize: "50+",
    designLeaders: "Noah Levin (VP Design)",
    culture: "Craft-obsessed, collaborative, fast-moving. Design has real influence on product.",
    website: "figma.com",
  },
  {
    id: "c2",
    name: "Linear",
    description: "Project management for high-performance software teams. Known for obsessive attention to quality and speed.",
    size: "50–100",
    stage: "Series B",
    designTeamSize: "~8",
    designLeaders: "Nan Yu (Design Lead)",
    culture: "Extremely high craft bar. Async-first. Deep focus. Small team, large impact.",
    website: "linear.app",
  },
];

const SEED_JOBS = [
  {
    id: "j1",
    companyId: "c1",
    title: "Staff Product Designer, Design Systems",
    location: "San Francisco / Remote",
    salary: "$180k–$220k",
    status: "interested",
    priority: "high",
    requirements: ["8+ yrs product design", "Design systems depth", "Cross-functional leadership"],
    niceToHave: ["Figma plugin experience", "Frontend fluency"],
    summary: "Leading the design systems work that powers all of Figma's product surfaces. High visibility, high craft expectations.",
    notes: [{ id: "n1", text: "Noah posted about this role on LinkedIn. Reach out to recruiter Sarah Chen.", createdAt: new Date(Date.now() - 3 * 86400000).toISOString() }],
    link: "https://figma.com/careers",
    addedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "j2",
    companyId: "c2",
    title: "Senior Product Designer",
    location: "Remote",
    salary: "$160k–$200k",
    status: "applied",
    priority: "medium",
    requirements: ["5+ yrs product design", "B2B SaaS experience", "Strong systems thinking"],
    niceToHave: ["Dev handoff expertise", "Motion design"],
    summary: "Core product work across the Linear app. Direct collaboration with founders. Extremely high bar for execution.",
    notes: [{ id: "n2", text: "Submitted portfolio Jan 12. Heard back within 3 days — good sign.", createdAt: new Date(Date.now() - 7 * 86400000).toISOString() }],
    link: "https://linear.app/careers",
    addedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

async function callClaude(userMsg, systemMsg, useWebSearch = false) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMsg, systemMsg, useWebSearch }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.text ?? "";
}

const AI_CLEANUP_SYSTEM = `You are a job posting data extractor. You will receive partially-extracted job data and the raw scraped text. Your job is to fill in ONLY the missing (null) fields. Return ONLY raw JSON (no markdown, no backticks) with these exact fields:
{"title":"job title or null if not found","companyName":"company name or null","location":"location or null","salary":"salary/compensation range as a short string, or null if truly not mentioned","requirements":["requirement 1","requirement 2"],"summary":"1-2 sentence summary of the role"}
Rules:
- If a field already has a good value, return that same value unchanged.
- For salary: look carefully for compensation, pay range, base salary, OTE, or equity mentions. Format concisely (e.g. "$120k – $180k").
- For requirements: return 3-8 concise bullet points. If already good, keep them.
- For summary: 1-2 sentences max. If already good, keep it.
- NEVER fabricate data. If info is truly not in the text, return null.`;

const COMPANY_RESEARCH_SYSTEM = `You are a career researcher. Return ONLY raw JSON (no markdown, no backticks) with these exact fields:
{"name":"official name","description":"2-3 sentences on what they do and their design culture","size":"headcount range e.g. 200-500","stage":"e.g. Series B, Public","designTeamSize":"estimated design headcount","designLeaders":"Head of Design or notable design leaders if known","culture":"2-3 words on culture and craft expectations","website":"domain only e.g. company.com"}`;

/** Set to true to skip AI API calls for company research (companies page + auto-research on new company). */
const PAUSE_COMPANY_AI = true;

async function researchCompanyByName(companyName) {
  if (PAUSE_COMPANY_AI) {
    return {
      name: companyName || "",
      description: "",
      size: "",
      stage: "",
      designTeamSize: "",
      designLeaders: "",
      culture: "",
      website: "",
    };
  }
  const text = await callClaude(
    `Research this company for a designer evaluating job opportunities: "${companyName}"`,
    COMPANY_RESEARCH_SYSTEM
  );
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

/** Free, no-API extraction from job description text (regex/heuristics). */
function extractJobFree(rawText, prefill = {}, jsonLd = null) {
  // Strip any remaining HTML tags that may have survived server-side processing
  const cleaned = rawText
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const normalized = cleaned.replace(/\r\n/g, "\n").replace(/\t/g, " ");
  const text = normalized.replace(/\s+/g, " ").trim();
  const lines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // --- Title ---
  let title = prefill.title?.trim() || jsonLd?.title || null;
  if (!title) {
    // "Role Title at Company" or "Company is hiring a Role Title"
    const atMatch = text.match(/^(.+?)\s+at\s+[A-Z]/);
    if (atMatch) title = atMatch[1].trim();
  }

  // --- Company ---
  let companyName = prefill.companyName?.trim() || jsonLd?.companyName || null;
  if (!companyName) {
    const atCoMatch = text.match(/at\s+([A-Z][A-Za-z0-9 &.]+?)(?:\s+[-–—|·]|\s*$)/m);
    if (atCoMatch) companyName = atCoMatch[1].trim();
  }

  // --- Location ---
  let location = prefill.location?.trim() || jsonLd?.location || null;
  if (!location) {
    const locPatterns = [
      /(?:^|\n)\s*(?:location|office)\s*:\s*([A-Z][A-Za-z, /]+)/im,
      /(?:based|located|headquarters?) in\s+([A-Z][A-Za-z, /]+)/,
      /(?:^|\n)\s*([A-Z][a-z]+(?:,\s*[A-Z]{2}))\s*(?:\n|$)/m,
    ];
    for (const pat of locPatterns) {
      const m = text.match(pat);
      if (m) { location = m[1].trim().replace(/\s*[,/]\s*$/, ""); break; }
    }
    if (/\bremote\b/i.test(text) && !location) location = "Remote";
  }
  if (!location) location = "Remote";

  // --- Salary ---
  let salary = prefill.salary || jsonLd?.salary || null;
  if (!salary) {
    const patterns = [
      /\b(?:salary|compensation|pay)\s*:?\s*\$[\d,]+\s*(?:[-–—]+|to)\s*\$[\d,]+/i,
      /CA\$\s*[\d,]+\s*(?:[-–—]+|to)\s*CA\$\s*[\d,]+/i,
      /(?:US|AU)\$\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:US|AU)\$\s*[\d,]+/i,
      /\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/i,
      /\$[\d,]+(?:\.\d+)?\s*(?:k|K)\s*(?:[-–—]+|to)\s*\$?[\d,]+(?:\.\d+)?\s*(?:k|K)\s*(?:USD|CAD|GBP|EUR|per\s+\w+)?/i,
      /\$[\d,]+(?:\.\d+)?\s*(?:[-–—]+|to)\s*\$[\d,]+(?:\.\d+)?\s*(?:USD|CAD|GBP|EUR|per\s+\w+)?/i,
      /\$[\d,]+(?:\.\d+)?\s+\$[\d,]+(?:\.\d+)?\s*(?:USD|CAD|GBP|EUR)/i,
      /(?:USD|CAD|GBP|EUR)\s*\$?[\d,]+\s*(?:[-–—]+|to)\s*\$?[\d,]+/i,
      /\$[\d,]+(?:\.\d+)?\s*(?:[-–—]+|to)\s*[\d,]+\s*(?:USD|CAD|GBP|EUR)?/i,
      /€[\d,]+\s*(?:[-–—]+|to)\s*€[\d,]+/i,
      /£[\d,]+\s*(?:[-–—]+|to)\s*£[\d,]+/i,
      /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\s*(?:[-–—]+|to)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*k\b/i,
      /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:[-–—]+|to)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:USD|CAD|GBP|EUR|per\s+year|per\s+yr)?/i,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        if (m[1] !== undefined && m[2] !== undefined) {
          // Captured "100k - 150k" or "120,000 - 150,000"
          if (/\d+\s*k/i.test(m[0])) salary = `$${m[1]}k – $${m[2]}k`;
          else salary = `$${m[1]} – $${m[2]}`;
        } else {
          salary = m[0]
            .replace(/\s+/g, " ")
            .replace(/\s*[-–—]{2,}\s*/g, " - ")
            .replace(/(\$[\d,]+)\s+(\$[\d,]+)/, "$1 – $2")
            .trim();
        }
        break;
      }
    }
    if (!salary) {
      const yrRanges = text.match(/\$[\d,]+(?:\s*\/\s*yr)?\s+to\s+\$[\d,]+(?:\s*\/\s*yr)?/gi);
      if (yrRanges && yrRanges.length > 0) {
        salary = [...new Set(yrRanges.map((r) => r.replace(/\s+/g, " ").trim()))].slice(0, 2).join("; ");
      }
    }
  }

  // --- Requirements & Nice-to-have ---
  const REQ_HEADERS = /^(?:requirements?|qualifications?|what you(?:['']ll)? (?:bring|need|have)|what (?:you|we) need(?: to succeed)?|what we(?:['']re)? looking for|you(?:['']ll)? have|must[- ]haves?|the ideal candidate|about you|skills (?:and|&) (?:experience|qualifications?)|skills you(?:['']ll)? (?:need|bring)|who you are)\s*(?:to bring)?\s*:?\s*/i;
  const NICE_HEADERS = /^(?:nice[- ]to[- ]haves?|preferred(?:\s+(?:qualifications?|skills|experience))?|bonus(?:es)?|plus(?:es)?|we['']d love (?:it )?if|ideally you|preferred accessibility)\s*(?:design)?\s*(?:skills)?\s*:?\s*/i;
  const RESP_HEADERS = /^(?:responsibilities|what you(?:['']ll)? do|the role|about (?:the )?role|in this role|the opportunity)\s*:?\s*/i;
  const BULLET = /^[\s]*[•\-*▪▸→]\s+|\d+[.)]\s+/;
  const ANY_SECTION_HEAD = /^(?:about|responsibilities|what you|requirements?|qualifications?|nice[- ]to[- ]haves?|preferred|benefits|compensation|how to apply|apply|the role|in this role|perks|our (?:team|company)|who we are|skills|must[- ]haves?|the opportunity|what we need|state[- ]specific)\b/i;

  function trimBullet(line) {
    return line.replace(/^[\s•\-*▪▸→]+/, "").replace(/^\d+[.)]\s*/, "").trim();
  }

  function collectListItems(linesArr, startIdx, maxItems = 15) {
    const out = [];
    for (let i = startIdx; i < linesArr.length && out.length < maxItems; i++) {
      const line = linesArr[i];
      if (!line) continue;
      if (ANY_SECTION_HEAD.test(line) && line.length < 70 && i > startIdx) break;
      const hasBullet = BULLET.test(line);
      const looksLikeItem = line.length >= 12 && !/^[A-Z][a-z]*\s*:?\s*$/.test(line);
      if (hasBullet || (looksLikeItem && (out.length > 0 || line.length > 25))) {
        let item = trimBullet(line);
        // Truncate long paragraph-style items to the first sentence
        if (item.length > 150) {
          const firstSentence = item.match(/^[^.!?]+[.!?]/);
          item = firstSentence ? firstSentence[0].trim() : item.slice(0, 150) + "…";
        }
        if (item.length > 4 && !out.includes(item)) out.push(item);
      }
    }
    return out;
  }

  function findSectionItems(headerRegex, limit = 15) {
    const seen = new Set();
    const allItems = [];
    for (let i = 0; i < lines.length; i++) {
      if (headerRegex.test(lines[i])) {
        const restOfLine = lines[i].replace(headerRegex, "").trim();
        const items = [];
        if (restOfLine.length > 10 && restOfLine.length < 350) items.push(restOfLine);
        items.push(...collectListItems(lines, i + 1, limit - allItems.length - items.length));
        for (const item of items) {
          if (item.length > 3 && !seen.has(item)) { seen.add(item); allItems.push(item); }
        }
        if (allItems.length >= limit) break;
      }
    }
    return allItems.slice(0, limit);
  }

  // Use JSON-LD qualifications if available
  let requirements = [];
  let niceToHave = [];
  if (jsonLd?.qualifications) {
    const q = jsonLd.qualifications;
    const items = typeof q === "string" ? q.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(q) ? q.map((s) => typeof s === "string" ? s : s.name || "").filter(Boolean)
      : [];
    requirements = items.slice(0, 15);
  }

  if (requirements.length === 0) requirements = findSectionItems(REQ_HEADERS, 15);
  if (niceToHave.length === 0) niceToHave = findSectionItems(NICE_HEADERS, 10);

  // Fallback: find any section that loosely matches
  if (requirements.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/requirements?|qualifications?|what you need|must[- ]haves?|you(?:['']ll)? have|skills.+(?:need|bring|require)/i.test(lines[i]) && lines[i].length < 80) {
        requirements = collectListItems(lines, i + 1, 15);
        if (requirements.length > 0) break;
      }
    }
  }
  // Last resort: bullet lines that mention experience-related keywords
  if (requirements.length === 0) {
    lines.filter((l) => BULLET.test(l) && /\d+\+?\s*years?|experience|ability|proficient|strong\s+|bachelor|degree|expertise/i.test(l))
      .slice(0, 10)
      .forEach((l) => { const t = trimBullet(l); if (t.length > 8 && t.length < 300) requirements.push(t); });
  }
  if (requirements.length === 0) requirements = ["See job description"];

  // --- Responsibilities (bonus field) ---
  const responsibilities = findSectionItems(RESP_HEADERS, 10);

  // --- Summary ---
  let summary = null;
  // Prefer JSON-LD description first sentence, then OG description, then first paragraph
  const descSource = jsonLd?.description || text;
  const sentences = descSource.match(/[^.!?]{15,}[.!?]+/g);
  if (sentences?.length) summary = sentences.slice(0, 2).join(" ").trim().slice(0, 300);

  return {
    title,
    companyName,
    location,
    salary,
    requirements,
    niceToHave,
    responsibilities: responsibilities.length ? responsibilities : undefined,
    summary: summary || "Job posting imported. See link for full details.",
  };
}

function detectATS(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;
    const params = u.searchParams;

    // Greenhouse: boards.greenhouse.io/company/jobs/id
    //             job-boards.greenhouse.io/company/jobs/id
    //             company.com/jobs/listing/id?gh_src=...
    //             company.com/job?gh_jid=123
    if (host.includes("greenhouse.io") || params.has("gh_src") || params.has("gh_jid")) {
      const jobId = params.get("gh_jid") || path.match(/\/(\d{6,})/)?.[1] || null;
      let boardSlug = null;
      if (host.includes("greenhouse.io")) {
        boardSlug = path.split("/").filter(Boolean)[0];
      } else {
        boardSlug = host.replace("www.", "").replace("jobs.", "").replace("careers.", "").split(".")[0];
      }
      return jobId ? { ats: "greenhouse", jobId, boardSlug } : null;
    }

    // Lever: jobs.lever.co/company/uuid
    if (host === "jobs.lever.co") {
      const parts = path.split("/").filter(Boolean);
      return { ats: "lever", company: parts[0], jobId: parts[1] };
    }

    // Ashby: jobs.ashbyhq.com/company/uuid
    if (host === "jobs.ashbyhq.com") {
      const parts = path.split("/").filter(Boolean);
      return { ats: "ashby", company: parts[0], jobId: parts[1] };
    }

    // SmartRecruiters: jobs.smartrecruiters.com/CompanyName/postingId-slug
    if (host === "jobs.smartrecruiters.com") {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const company = parts[0];
        const postingSlug = parts[1];
        const postingId = postingSlug.match(/^(\d+)/)?.[1] || postingSlug;
        return { ats: "smartrecruiters", company, jobId: postingId };
      }
    }

    // Workday: company.wd{N}.myworkdayjobs.com/.../job/Title_ID
    if (host.includes("myworkdayjobs.com") && path.includes("/job/")) {
      const company = host.split(".")[0];
      return { ats: "workday", company, jobId: url };
    }

    // iCIMS: jobs-company.icims.com/jobs/ID/... or careers-company.icims.com/jobs/ID/...
    if (host.includes(".icims.com")) {
      const company = host.replace(".icims.com", "").replace(/^(jobs|careers)-/, "");
      const jobIdMatch = path.match(/\/jobs\/(\d+)/);
      return { ats: "icims", company, jobId: jobIdMatch?.[1] || null };
    }

    // BambooHR: company.bamboohr.com/careers/ID or company.bamboohr.com/jobs/view.php?id=ID
    if (host.includes(".bamboohr.com") && !host.startsWith("www.")) {
      const company = host.split(".")[0];
      const jobIdMatch = path.match(/\/careers\/(\d+)/) || path.match(/\/jobs\/view\.php/);
      const jobId = jobIdMatch ? (path.match(/\/careers\/(\d+)/)?.[1] || params.get("id")) : null;
      return { ats: "bamboohr", company, jobId };
    }

    // Workable: apply.workable.com/company/j/jobId
    if (host === "apply.workable.com") {
      const parts = path.split("/").filter(Boolean);
      const jIdx = parts.indexOf("j");
      if (jIdx >= 0 && parts[jIdx + 1]) {
        return { ats: "workable", company: parts[0], jobId: parts[jIdx + 1] };
      }
    }

    return null;
  } catch { return null; }
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Format for note timestamps: relative when recent, then date+time */
function formatNoteTime(iso) {
  const date = new Date(iso);
  const now = Date.now();
  const sec = Math.floor((now - date) / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (day < 7) return `${day}d ago`;
  return date.toLocaleString([], { month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined, hour: "numeric", minute: "2-digit" });
}

/** Normalize job.notes to array of { id, text, createdAt } (support legacy string) */
function getNotesList(job) {
  if (!job) return [];
  const n = job.notes;
  if (Array.isArray(n)) return n;
  if (typeof n === "string" && n.trim()) return [{ id: "legacy", text: n.trim(), createdAt: job.addedAt || new Date().toISOString() }];
  return [];
}

function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const COMPANY_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE",
  "#30B0C7", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
  "#A2845E", "#5AC8FA",
];
function getCompanyColor(name) {
  if (!name) return "#007AFF";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length];
}

const FONT_SERIF = '"Fraunces", Georgia, "Times New Roman", serif';
const FONT_SANS = '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif';

const THEMES = {
  dark: {
    bg: "#1a1a1a",
    surface: "#252525",
    surfaceHover: "#2e2e2e",
    border: "#3a3a3a",
    borderHover: "#484848",
    accent: "#c9a227",
    accentBg: "rgba(201, 162, 39, 0.15)",
    text: "#f5f0e8",
    textSec: "#a8a29e",
    textMuted: "#78716c",
    sidebarBg: "#1a1a1a",
    overlay: "rgba(0,0,0,0.6)",
    infoVal: "#a8a29e",
  },
  light: {
    bg: "#F8F6F1",
    surface: "#FFFDF9",
    surfaceHover: "#F5F0E8",
    border: "#e8e4dc",
    borderHover: "#ddd9d0",
    accent: "#b8860b",
    accentBg: "rgba(184, 134, 11, 0.1)",
    text: "#2c2c2c",
    textSec: "#6b6560",
    textMuted: "#8a837c",
    sidebarBg: "#FFFDF9",
    overlay: "rgba(0,0,0,0.3)",
    infoVal: "#5c5651",
  },
};

function getCss(T, isDark) {
  return {
    app: {
      display: "flex",
      height: "100vh",
      background: T.bg,
      color: T.text,
      fontFamily: FONT_SANS,
      overflow: "hidden",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
    },
    sidebar: { width: 220, minWidth: 220, background: T.sidebarBg, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "20px 12px" },
    logo: { fontSize: 22, fontWeight: 300, fontFamily: FONT_SERIF, color: T.text, letterSpacing: "-0.02em", padding: "0 8px 20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 0 },
    navBtn: (on) => ({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: on ? 600 : 400, color: on ? T.text : T.textSec, background: on ? (isDark ? T.surface : T.surfaceHover) : "transparent", border: "none", width: "100%", textAlign: "left", transition: "all 0.15s", letterSpacing: "-0.01em", fontFamily: FONT_SANS }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${T.border}`, minHeight: 58 },
    headerTitle: { fontSize: 22, fontWeight: 300, fontFamily: FONT_SERIF, color: T.text, letterSpacing: "-0.02em" },
    btn: (v = "primary") => ({
      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", transition: "all 0.15s", letterSpacing: "-0.01em", fontFamily: FONT_SANS,
      ...(v === "primary"
        ? { background: T.accent, color: isDark ? "#1a1a1a" : "#fff" }
        : { background: isDark ? "rgba(255,255,255,0.06)" : "transparent", color: T.textSec, border: `1px solid ${T.border}` }),
    }),
    card: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      padding: "14px 16px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },
    input: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: FONT_SANS, letterSpacing: "-0.01em" },
    textarea: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: T.text, outline: "none", resize: "vertical", minHeight: 110, fontFamily: FONT_SANS, boxSizing: "border-box", lineHeight: 1.6, letterSpacing: "-0.01em" },
    select: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: FONT_SANS },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, fontFamily: FONT_SANS },
    tag: { display: "inline-flex", padding: "3px 9px", borderRadius: 6, fontSize: 12, background: T.surfaceHover, color: T.textSec, fontWeight: 500, fontFamily: FONT_SANS },
    pill: { display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: T.textSec, fontWeight: 500, fontFamily: FONT_SANS },
    overlay: { position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 20,
      width: "100%",
      maxWidth: 520,
      maxHeight: "88vh",
      overflow: "auto",
      padding: 28,
    },
    modalTitle: { fontSize: 20, fontWeight: 300, fontFamily: FONT_SERIF, color: T.text, marginBottom: 22, letterSpacing: "-0.02em" },
    infoBox: {
      background: isDark ? "rgba(255,255,255,0.04)" : T.surfaceHover,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      padding: 18,
    },
    infoLabel: { fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: FONT_SANS },
    infoVal: { fontSize: 13.5, color: T.infoVal, letterSpacing: "-0.01em", fontFamily: FONT_SANS },
  };
}

const THEME_KEY = "scout-theme";

function Toast({ message, theme }) {
  const T = THEMES[theme];
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        padding: "11px 20px",
        borderRadius: 12,
        background: theme === "dark" ? T.surface : T.text,
        border: `1px solid ${theme === "dark" ? T.border : "rgba(0,0,0,0.08)"}`,
        fontSize: 14,
        fontWeight: 600,
        color: theme === "dark" ? T.text : "#FFFFFF",
        letterSpacing: "-0.02em",
        fontFamily: FONT_SANS,
      }}
    >
      {message}
    </div>
  );
}

function KeyEntryModal({ onKeyReady, onClose, theme, message, onCopyToast }) {
  const T = THEMES[theme];
  const isDark = theme === "dark";
  const css = getCss(T, isDark);
  const [pasteKey, setPasteKey] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [createdKey, setCreatedKey] = useState(null);

  const startFresh = () => {
    const key = generateScoutKey();
    localStorage.setItem(SCOUT_KEY_STORAGE, key);
    setCreatedKey(key);
  };

  const finishWithCreatedKey = () => {
    if (createdKey) {
      onKeyReady(createdKey);
      onClose(true);
    }
  };

  const restoreKey = () => {
    setPasteError("");
    const k = normalizeScoutKey(pasteKey);
    if (!k) {
      setPasteError("Enter a valid key (e.g. scout_xxxxxxxx — 8 letters or numbers)");
      return;
    }
    localStorage.setItem(SCOUT_KEY_STORAGE, k);
    onKeyReady(k);
    onClose(true);
  };

  const handleClose = (success) => {
    onClose(success);
  };

  if (createdKey) {
    return (
      <div style={css.overlay} onClick={(e) => e.target === e.currentTarget && handleClose(false)}>
        <div style={{ ...css.modal, maxWidth: 400, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.04em" }}>Scout</span><span style={{ color: "#FF3B30", fontSize: 6, marginBottom: 6 }}>●</span>
              <span style={{ fontSize: 14, color: T.textSec, marginLeft: 10, fontWeight: 400 }}>New key</span>
            </div>
            <button type="button" onClick={() => handleClose(false)} style={{ background: "none", border: "none", color: T.textSec, cursor: "pointer", fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
          </div>
          <p style={{ fontSize: 13, color: T.textSec, marginBottom: 16, lineHeight: 1.5 }}>
            Save this key to access your board from another device.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
            <code style={{ fontSize: 14, color: T.text, flex: 1, wordBreak: "break-all" }}>{createdKey}</code>
            <button type="button" style={{ ...css.btn("sec"), padding: "6px 12px", fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(createdKey); onCopyToast?.(); }}>Copy</button>
          </div>
          <button type="button" style={{ ...css.btn("primary"), width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 14 }} onClick={finishWithCreatedKey}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={css.overlay} onClick={(e) => e.target === e.currentTarget && handleClose(false)}>
      <div style={{ ...css.modal, maxWidth: 400, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: "-0.04em" }}>Scout</span><span style={{ color: "#FF3B30", fontSize: 6, marginBottom: 6 }}>●</span>
              <span style={{ fontSize: 14, color: T.textSec, marginLeft: 10, fontWeight: 400 }}>Log in</span>
            </div>
          <button type="button" onClick={() => handleClose(false)} style={{ background: "none", border: "none", color: T.textSec, cursor: "pointer", fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 20, lineHeight: 1.5 }}>
          {message || "Your job board is keyed to you. No signup — pick an option below."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" style={{ ...css.btn("primary"), width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 14 }} onClick={startFresh}>
            Start fresh
          </button>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>I have a key</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={pasteKey}
                onChange={(e) => { setPasteKey(e.target.value); setPasteError(""); }}
                placeholder="scout_xxxxxxxx"
                style={{ ...css.input, flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && restoreKey()}
              />
              <button type="button" style={css.btn("sec")} onClick={restoreKey}>Restore</button>
            </div>
            {pasteError && <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{pasteError}</div>}
          </div>
        </div>
        <p style={{ fontSize: 12, color: T.textMuted, marginTop: 20 }}>
          <a href="/recover" style={{ color: T.accent, textDecoration: "none" }}>Lost your key?</a> Recover with email.
        </p>
      </div>
    </div>
  );
}

const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
const recoverToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;

function RecoverPage({ theme, onKeyRestored }) {
  const T = THEMES[theme];
  const isDark = theme === "dark";
  const css = getCss(T, isDark);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch((API_BASE || "") + "/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage("If an account is linked to this email, you’ll receive a recovery link shortly. It expires in 15 minutes.");
      } else {
        setError(data.error === "No account found for this email" ? "No recovery email saved. Add one from your key menu." : (data.error || "Request failed"));
      }
    } catch (err) {
      setError(err.message || "Network error");
    }
    setLoading(false);
  };

  return (
    <div style={{ ...css.app, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...css.modal, maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.04em" }}>Scout</span><span style={{ color: "#FF3B30", fontSize: 6, marginBottom: 8 }}>●</span>
          <span style={{ fontSize: 15, color: T.textSec, marginLeft: 10, fontWeight: 400 }}>Recover key</span>
        </div>
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 20, lineHeight: 1.5 }}>
          Enter the email you added as a recovery address. We’ll send a one-time link to restore your key on this device.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={css.label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={css.input} />
          </div>
          {error && <div style={{ color: "#f87171", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          {message && <div style={{ color: T.accent, fontSize: 12.5, marginBottom: 12 }}>{message}</div>}
          <button type="submit" style={{ ...css.btn("primary"), width: "100%" }} disabled={loading}>{loading ? "…" : "Send recovery link"}</button>
        </form>
        <p style={{ fontSize: 12, color: T.textMuted, marginTop: 20 }}>
          <a href="/" style={{ color: T.accent, textDecoration: "none" }}>← Back to Scout</a>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [key, setKey] = useState(getStoredKey);
  const [dataLoading, setDataLoading] = useState(!!getStoredKey());
  const [view, setView] = useState("board");
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [modal, setModal] = useState(null); // "addCo" | "addJob" | "job"
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyModalMessage, setKeyModalMessage] = useState(null);
  const [keyMenuOpen, setKeyMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const pendingImportAfterKeyRef = useRef(null);
  const [workspaceEmail, setWorkspaceEmail] = useState(null);
  const [recoveryEmailInput, setRecoveryEmailInput] = useState("");
  const [recoveryEmailSaving, setRecoveryEmailSaving] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [dragJobId, setDragJobId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importStep, setImportStep] = useState(null);
  const [boardViewMode, setBoardViewMode] = useState("kanban");

  const T = THEMES[theme];
  const isDark = theme === "dark";
  const css = getCss(T, isDark);

  useEffect(() => {
    if (key && isValidScoutKey(key)) {
      try {
        localStorage.setItem(SCOUT_KEY_STORAGE, key);
      } catch (_) {}
    }
  }, [key]);

  // Handle /recover?token=xxx: redeem and set key then go to app
  useEffect(() => {
    if (pathname !== "/recover" || !recoverToken) return;
    (async () => {
      try {
        const res = await fetch((API_BASE || "") + "/api/recover?token=" + encodeURIComponent(recoverToken));
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.key && isValidScoutKey(data.key)) {
          localStorage.setItem(SCOUT_KEY_STORAGE, data.key);
          window.history.replaceState({}, "", "/");
          window.location.reload();
        }
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    if (!key) {
      setDataLoading(false);
      return;
    }
    const headers = { "X-Scout-Key": key, Authorization: `Bearer ${key}` };
    fetch((API_BASE || "") + "/api/data", { headers })
      .then((res) => {
        if (res.status === 401) {
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.jobs)) setJobs(data.jobs.map(j => ({ ...j, status: (j.status || "interested").toLowerCase() })));
        if (data && Array.isArray(data.companies)) setCompanies(data.companies);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, [key]);

  useEffect(() => {
    const k = getStoredKey();
    if (!k) return;
    fetch((API_BASE || "") + "/api/workspace", { headers: getScoutHeaders() })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => setWorkspaceEmail(data?.email ?? null))
      .catch(() => {});
  }, [key]);

  const saveDataToServer = useCallback(() => {
    if (!key) return;
    const headers = {
      "Content-Type": "application/json",
      "X-Scout-Key": key,
      Authorization: `Bearer ${key}`,
    };
    fetch((API_BASE || "") + "/api/data", {
      method: "POST",
      headers,
      body: JSON.stringify({ jobs, companies }),
    }).catch((err) => console.error("Save failed:", err));
  }, [jobs, companies, key]);

  useEffect(() => {
    if (!key || dataLoading) return;
    const t = setTimeout(saveDataToServer, 600);
    return () => clearTimeout(t);
  }, [jobs, companies, key, dataLoading, saveDataToServer]);

  useEffect(() => {
    if (!key) return;
    const onBeforeUnload = () => {
      const payload = JSON.stringify({ key, jobs, companies });
      navigator.sendBeacon?.((API_BASE || "") + "/api/data", new Blob([payload], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [key, jobs, companies]);

  const handleLogout = () => {
    localStorage.removeItem(SCOUT_KEY_STORAGE);
    setKey(null);
    setWorkspaceEmail(null);
    setJobs([]);
    setCompanies([]);
    setModal(null);
    setActiveJobId(null);
    setKeyMenuOpen(false);
  };

  const onKeyReady = useCallback((newKey) => {
    setKey(newKey);
    setDataLoading(true);
    const headers = { "X-Scout-Key": newKey, Authorization: `Bearer ${newKey}` };
    fetch((API_BASE || "") + "/api/data", { headers })
      .then((r) => {
        if (r.status === 401) return null;
        return r.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.jobs)) setJobs(data.jobs.map(j => ({ ...j, status: (j.status || "interested").toLowerCase() })));
        if (data && Array.isArray(data.companies)) setCompanies(data.companies);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  const saveRecoveryEmail = async () => {
    const email = recoveryEmailInput.trim();
    if (!email) return;
    setRecoveryEmailSaving(true);
    try {
      const res = await fetch((API_BASE || "") + "/api/workspace/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getScoutHeaders() },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setWorkspaceEmail(email);
        setRecoveryEmailInput("");
      }
    } catch (_) {}
    setRecoveryEmailSaving(false);
  };

  const removeRecoveryEmail = async () => {
    try {
      const res = await fetch((API_BASE || "") + "/api/workspace/email", { method: "DELETE", headers: getScoutHeaders() });
      if (res.ok) setWorkspaceEmail(null);
    } catch (_) {}
  };

  const copyWithToast = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setToast("Copied!");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  // Add Company
  const [coName, setCoName] = useState("");
  const [coData, setCoData] = useState(null);

  // Add Job
  const [jobCoId, setJobCoId] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobData, setJobData] = useState(null);
  const [jobInputMode, setJobInputMode] = useState("url"); // "url" | "paste"
  const [jobPriority, setJobPriority] = useState("medium");
  const [fetchError, setFetchError] = useState(null);
  const [debugLog, setDebugLog] = useState([]);

  const BLOCKED_DOMAINS = ["linkedin.com"];
  const isBlockedUrl = (url) => BLOCKED_DOMAINS.some(d => url.includes(d));

  const [newNoteInput, setNewNoteInput] = useState("");

  const [editing, setEditing] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const startEdit = (context, id, field, currentValue) => {
    setEditing({ context, id, field });
    setEditingValue(currentValue ?? "");
  };
  const saveEdit = () => {
    if (!editing) return;
    const { context, id, field } = editing;
    if (context === "job") {
      setJobs((p) => p.map((j) => (j.id === id ? { ...j, [field]: editingValue } : j)));
    } else {
      setCompanies((p) => p.map((c) => (c.id === id ? { ...c, [field]: editingValue } : c)));
    }
    setEditing(null);
    setEditingValue("");
  };

  const openJob = (job) => {
    setActiveJobId(job.id);
    setNewNoteInput("");
    setEditing(null);
    setModal("job");
  };

  const activeJob = jobs.find(j => j.id === activeJobId);

  const researchCompany = async () => {
    if (!coName.trim()) return;
    setLoading(true);
    try {
      const data = await researchCompanyByName(coName);
      setCoData(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveCompany = () => {
    setCompanies(p => [...p, { id: uid(), ...coData }]);
    setModal(null); setCoName(""); setCoData(null);
  };

  const extractFromUrl = async () => {
    if (!jobLink.trim()) return;
    if (!getStoredKey()) {
      setKeyModalMessage("Get an access key to import jobs from a URL.");
      pendingImportAfterKeyRef.current = () => extractFromUrl();
      setShowKeyModal(true);
      return;
    }
    setFetchError(null);
    setDebugLog([]);
    const log = (msg) => setDebugLog(p => [...p, msg]);
    if (isBlockedUrl(jobLink)) { setFetchError("blocked"); return; }
    setLoading(true);
    setImportStep("scraping");

    const PROXY_BASE = import.meta.env.VITE_JOB_PROXY_BASE || "/api/job";

    try {
      let rawText = null;
      let prefill = {};
      let jsonLd = null;

      // Step 1: Try ATS API proxy for platforms with public APIs
      const ats = detectATS(jobLink);
      const ATS_WITH_API = ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"];
      if (ats) {
        log(`ATS detected: ${ats.ats}`);
        const company = ats.boardSlug || ats.company;
        if (company && ats.jobId && ATS_WITH_API.includes(ats.ats)) {
          const proxyUrl = `${PROXY_BASE}?ats=${ats.ats}&company=${encodeURIComponent(company)}&jobId=${encodeURIComponent(ats.jobId)}`;
          log(`→ ATS proxy`);
          try {
            const res = await fetch(proxyUrl);
            const data = await res.json();
            if (res.ok && data.content) {
              log(`← OK (${data.content.length} chars)`);
              rawText = data.content;
              prefill = {
                title: data.title, location: data.location,
                companyName: data.companyName, salary: data.salary || null,
              };
            } else {
              log(`← ATS proxy failed: ${data.error || res.status}`);
            }
          } catch (e) {
            log(`← ATS proxy error: ${e.message}`);
          }
        }
      }

      // Step 2: Scrape the page if ATS proxy didn't return content
      if (!rawText) {
        log(`→ Scraping page`);
        try {
          const res = await fetch(`/api/scrape?url=${encodeURIComponent(jobLink)}`);
          const data = await res.json();
          if (res.ok && data.content) {
            log(`← OK (${data.content.length} chars${data.jsonLd ? ", has JSON-LD" : ""})`);
            rawText = data.content;
            jsonLd = data.jsonLd || null;
            prefill = {
              title: data.title || prefill.title,
              location: data.location || prefill.location,
              companyName: data.companyName || prefill.companyName,
              salary: data.salary || null,
            };
          } else {
            log(`← Scrape failed: ${data.error || res.status}`);
          }
        } catch (e) {
          log(`← Scrape error: ${e.message}`);
        }
      }

      // Step 3: Extract with free heuristic parser
      if (rawText) {
        log(`→ Extracting (free)`);
        const parsed = extractJobFree(rawText, prefill, jsonLd);

        // Step 4: Selective AI cleanup when scraping has gaps
        const hasFullJsonLd = jsonLd && jsonLd.title && jsonLd.salary && jsonLd.location;
        const titleWeak = !parsed.title || parsed.title.length > 60 || /[|–—]/.test(parsed.title);
        const needsAI = !hasFullJsonLd && (
          !parsed.salary
          || titleWeak
          || parsed.summary === "Job posting imported. See link for full details."
          || (parsed.requirements.length === 1 && parsed.requirements[0] === "See job description")
        );

        if (needsAI) {
          setImportStep("ai");
          log(`→ Cleaning up with AI…`);
          try {
            const already = { title: parsed.title, companyName: parsed.companyName, location: parsed.location, salary: parsed.salary };
            const aiText = await callClaude(
              `Here is scraped job posting text. Fill in missing/improve fields.\nAlready extracted: ${JSON.stringify(already)}\n\nJob text:\n${rawText.slice(0, 4000)}`,
              AI_CLEANUP_SYSTEM
            );
            const aiData = JSON.parse(aiText.replace(/```json|```/g, "").trim());
            const aiFields = [];
            if (!parsed.salary && aiData.salary) { parsed.salary = aiData.salary; aiFields.push("salary"); }
            if (titleWeak && aiData.title && aiData.title.length <= 80) { parsed.title = aiData.title; aiFields.push("title"); }
            if (!parsed.companyName && aiData.companyName) { parsed.companyName = aiData.companyName; aiFields.push("company"); }
            if (!parsed.location || parsed.location === "Remote") {
              if (aiData.location && aiData.location !== "null") { parsed.location = aiData.location; aiFields.push("location"); }
            }
            if (parsed.summary === "Job posting imported. See link for full details." && aiData.summary) { parsed.summary = aiData.summary; aiFields.push("summary"); }
            if (parsed.requirements.length === 1 && parsed.requirements[0] === "See job description" && aiData.requirements?.length) {
              parsed.requirements = aiData.requirements; aiFields.push("requirements");
            }
            if (aiFields.length > 0) {
              parsed._aiAssisted = true;
              parsed._aiFields = aiFields;
              log(`← AI filled: ${aiFields.join(", ")}`);
            } else {
              log(`← AI had nothing to add`);
            }
          } catch (e) {
            log(`← AI cleanup skipped (${e.message})`);
          }
        }

        setJobData(parsed);
      } else {
        setFetchError("failed");
      }
    } catch (e) {
      log(`Error: ${e.message}`);
      setFetchError(e.message || "failed");
    }
    setImportStep(null);
    setLoading(false);
  };

  const refineWithAI = async (sourceText) => {
    if (!sourceText?.trim()) return;
    setLoading(true);
    try {
      const text = await callClaude(
        `Extract info from this job description:\n\n${sourceText.slice(0, 4000)}`,
        `You are a job description parser. Return ONLY raw JSON (no markdown, no backticks):
{"title":"job title","companyName":"company name if mentioned, else null","location":"location or Remote","salary":"salary range or null","requirements":["key requirement 1","key requirement 2","key requirement 3"],"niceToHave":["nice 1","nice 2"],"summary":"2 sentence summary of the role"}`
      );
      setJobData(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch (e) { console.error(e); setFetchError(e.message || "AI refinement failed"); }
    setLoading(false);
  };

  const saveJob = () => {
    if (!jobData) return;
    let companyId = jobCoId;
    let createdNewCompany = false;
    if (!companyId && jobData.companyName) {
      const existing = companies.find(c => c.name.toLowerCase() === jobData.companyName.toLowerCase());
      if (existing) {
        companyId = existing.id;
      } else {
        const newCo = { id: uid(), name: jobData.companyName, description: "", size: "", stage: "", designTeamSize: "", designLeaders: "", culture: "", website: "" };
        setCompanies(p => [...p, newCo]);
        companyId = newCo.id;
        createdNewCompany = true;
      }
    }
    const { _aiAssisted, _aiFields, ...cleanJobData } = jobData;
    setJobs(p => [...p, { id: uid(), companyId, ...cleanJobData, status: "interested", priority: jobPriority, notes: [], link: jobLink, applicationDate: "", contact: "", addedAt: new Date().toISOString() }]);
    setModal(null); setJobDesc(""); setJobLink(""); setJobData(null); setJobCoId(""); setJobInputMode("url"); setJobPriority("medium"); setFetchError(null); setImportStep(null);
    if (createdNewCompany) {
      researchCompanyByName(jobData.companyName)
        .then((data) => {
          setCompanies((p) => p.map((c) => (c.id === companyId ? { ...c, ...data, id: c.id } : c)));
        })
        .catch((e) => console.error("Company research failed:", e));
    }
  };

  const setJobPriorityLevel = (jobId, priority) => {
    setJobs((p) => p.map((j) => (j.id === jobId ? { ...j, priority } : j)));
  };

  const moveJob = (jobId, newStatus) => {
    const job = jobs.find((j) => j.id === jobId);
    const movingToOffer = job && (job.status || "").toLowerCase() !== "offer" && newStatus === "offer";
    setJobs((p) => p.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
    if (activeJobId === jobId) setActiveJobId(jobId);
    if (movingToOffer) {
      setTimeout(() => {
        const colors = ["#4ade80", "#22c55e", "#7c5cfc", "#38bdf8", "#fbbf24", "#fff"];
        confetti({
          particleCount: 180,
          spread: 360,
          origin: { x: 0.5, y: 0.5 },
          colors,
          startVelocity: 40,
          scalar: 1.15,
        });
      }, 50);
    }
  };

  const addNote = (jobId, text) => {
    if (!text.trim()) return;
    const note = { id: uid(), text: text.trim(), createdAt: new Date().toISOString() };
    setJobs(p => p.map(j => j.id === jobId ? { ...j, notes: getNotesList(j).concat(note) } : j));
  };
  const deleteNote = (jobId, noteId) => {
    setJobs(p => p.map(j => j.id === jobId ? { ...j, notes: getNotesList(j).filter(n => n.id !== noteId) } : j));
  };

  const deleteJob = (jobId) => {
    setJobs((p) => p.filter((j) => j.id !== jobId));
    if (activeJobId === jobId) {
      setActiveJobId(null);
      setModal(null);
      setEditing(null);
    }
  };

  const getCompany = id => companies.find(c => c.id === id);
  const [boardSearch, setBoardSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState(""); // "" | "high" | "medium" | "low"
  const [sortBy, setSortBy] = useState("priority"); // "priority" | "date" | "company"

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const filterAndSortJobs = (jobList) => {
    let list = [...jobList];
    const q = boardSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((j) => {
        const co = getCompany(j.companyId);
        const coName = (co?.name ?? "").toLowerCase();
        const title = (j.title ?? "").toLowerCase();
        return coName.includes(q) || title.includes(q);
      });
    }
    if (priorityFilter) {
      list = list.filter((j) => (j.priority || "medium") === priorityFilter);
    }
    if (sortBy === "priority") {
      list.sort((a, b) => (priorityOrder[a.priority || "medium"] ?? 1) - (priorityOrder[b.priority || "medium"] ?? 1));
    } else if (sortBy === "date") {
      list.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
    } else if (sortBy === "company") {
      list.sort((a, b) => {
        const na = (getCompany(a.companyId)?.name ?? "").toLowerCase();
        const nb = (getCompany(b.companyId)?.name ?? "").toLowerCase();
        return na.localeCompare(nb);
      });
    }
    return list;
  };
  const jobStatus = (j) => (j.status || "").toLowerCase();
  const byStatus = (s) => filterAndSortJobs(jobs.filter((j) => jobStatus(j) === s));
  const totalActive = jobs.filter(j => jobStatus(j) !== "rejected").length;

  if (pathname === "/recover" && recoverToken) {
    return (
      <div style={{ ...css.app, alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: T.textSec, fontSize: 14 }}>Restoring your key…</span>
      </div>
    );
  }
  if (pathname === "/recover") {
    return <RecoverPage theme={theme} />;
  }

  const truncatedKey = key ? `${key.slice(0, 10)}…` : "";

  return (
    <div style={css.app}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.textMuted};border-radius:4px}
        button:disabled{opacity:0.4;cursor:not-allowed}
        select option{background:${T.surface};color:${T.text}}
        table{border-spacing:0}
      `}</style>

      {/* Sidebar */}
      <div style={css.sidebar}>
        <div style={css.logo}>
          Scout<span style={{ color: "#FF3B30", fontSize: 8, marginLeft: 2, marginBottom: 8, lineHeight: 1 }}>●</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[
          { id: "board", label: "Board" },
          { id: "companies", label: "Companies" },
        ].map(n => (
          <button key={n.id} style={css.navBtn(view === n.id)} onClick={() => setView(n.id)}>
            {n.label}
          </button>
        ))}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", marginBottom: 16,
              fontSize: 13, fontWeight: 400, color: T.textSec, background: "transparent", border: "none", borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
            }}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span style={{ fontSize: 15 }}>{isDark ? "☀" : "☽"}</span>
            {isDark ? "Light mode" : "Dark mode"}
          </button>
          <div style={{ padding: "14px 12px", background: isDark ? T.surface : T.bg, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 12 }}>Overview</div>
            {[["Tracked", jobs.length, T.text], ["Active", totalActive, T.accent], ["Companies", companies.length, T.text]].map(([k, v, col]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: T.textSec, fontWeight: 400, letterSpacing: "-0.01em" }}>{k}</span>
                <span style={{ fontSize: 13, color: col, fontWeight: 700, letterSpacing: "-0.02em" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={css.main}>
        <div style={css.header}>
          <div style={css.headerTitle}>{view === "board" ? "Board" : "Companies"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={css.btn("sec")} onClick={() => setModal("addCo")}>+ Company</button>
            <button style={css.btn("primary")} onClick={() => setModal("addJob")}>+ Add Job</button>
            <div style={{ position: "relative" }}>
              {key ? (
                <>
              <button
                type="button"
                onClick={() => setKeyMenuOpen((o) => !o)}
                style={{ ...css.btn("sec"), display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12 }}
              >
                <span style={{ color: T.text }}>{truncatedKey}</span>
                <span style={{ color: T.textSec, fontSize: 10 }}>▾</span>
              </button>
              {keyMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setKeyMenuOpen(false)} aria-hidden="true" />
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 280, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, zIndex: 100, padding: "10px 0" }}>
                    <div style={{ padding: "8px 12px", fontSize: 11, color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>Access key</div>
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <code style={{ fontSize: 12, color: T.text, flex: 1, wordBreak: "break-all" }}>{key}</code>
                      <button type="button" style={{ ...css.btn("sec"), padding: "4px 8px", fontSize: 11 }} onClick={() => { copyWithToast(key); setKeyMenuOpen(false); }}>Copy</button>
                    </div>
                    <div style={{ padding: "6px 12px", fontSize: 11, color: T.textMuted }}>Save this key to access Scout from another device.</div>
                    <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }} />
                    <div style={{ padding: "8px 12px" }}>
                      {workspaceEmail ? (
                        <div style={{ fontSize: 12, color: T.textSec }}>
                          Recovery email: {workspaceEmail}
                          <button type="button" onClick={() => { removeRecoveryEmail(); setKeyMenuOpen(false); }} style={{ marginLeft: 8, background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11 }}>Remove</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <input type="email" value={recoveryEmailInput} onChange={(e) => setRecoveryEmailInput(e.target.value)} placeholder="Add recovery email" style={{ ...css.input, flex: 1, padding: "6px 10px", fontSize: 12 }} />
                            <button type="button" style={{ ...css.btn("primary"), padding: "6px 10px", fontSize: 11 }} onClick={() => saveRecoveryEmail()} disabled={recoveryEmailSaving || !recoveryEmailInput.trim()}>{recoveryEmailSaving ? "…" : "Save"}</button>
                          </div>
                          <div style={{ fontSize: 10.5, color: T.textMuted }}>If you lose your key, we'll send it to this address.</div>
                        </>
                      )}
                    </div>
                    <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 8 }} />
                    <button type="button" onClick={() => { handleLogout(); setKeyMenuOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 12px", fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>Log out of this device</button>
                  </div>
                </>
              )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setKeyModalMessage(null); setShowKeyModal(true); }}
                  style={{ ...css.btn("sec"), display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12 }}
                >
                  Log in
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Board */}
        {view === "board" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 2, background: isDark ? T.surface : T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 2 }}>
                {[["kanban", "⊞"], ["table", "☰"]].map(([mode, icon]) => (
                  <button key={mode} onClick={() => setBoardViewMode(mode)} style={{
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${boardViewMode === mode ? T.border : "transparent"}`, cursor: "pointer", fontSize: 14, transition: "all 0.15s", fontWeight: 500, fontFamily: FONT_SANS,
                    background: boardViewMode === mode ? T.surfaceHover : "transparent",
                    color: boardViewMode === mode ? T.text : T.textMuted,
                  }} title={mode === "kanban" ? "Kanban view" : "Table view"}>{icon}</button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search company or job title..."
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                style={{ ...css.input, width: 220, padding: "6px 10px", fontSize: 12 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority</span>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ ...css.select, width: "auto", padding: "6px 10px", fontSize: 12, minWidth: 90 }}>
                  <option value="">All</option>
                  {PRIORITIES.map((pr) => (
                    <option key={pr.id} value={pr.id}>{pr.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...css.select, width: "auto", padding: "6px 10px", fontSize: 12, minWidth: 100 }}>
                  <option value="priority">Priority</option>
                  <option value="date">Date added</option>
                  <option value="company">Company</option>
                </select>
              </div>
            </div>

            {/* Kanban View */}
            {boardViewMode === "kanban" && (
            <div style={{ flex: 1, display: "flex", gap: 12, overflow: "auto", padding: "20px 20px" }}>
            {STATUSES.map(st => {
              const isOver = dragOverCol === st.id && dragJobId && jobStatus(jobs.find(j => j.id === dragJobId) || {}) !== st.id;
              return (
                <div
                  key={st.id}
                  style={{ minWidth: 260, width: 260, display: "flex", flexDirection: "column", gap: 10 }}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(st.id); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null); }}
                  onDrop={e => { e.preventDefault(); if (dragJobId) moveJob(dragJobId, st.id); setDragOverCol(null); setDragJobId(null); }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 8px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                    <span style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>{st.label}</span>
                    <span style={{ fontSize: 12, color: T.textMuted, marginLeft: "auto", fontWeight: 500 }}>{byStatus(st.id).length}</span>
                  </div>
                  {byStatus(st.id).map(job => {
                    const co = getCompany(job.companyId);
                    const coColor = co ? getCompanyColor(co.name) : T.textMuted;
                    const isDragging = dragJobId === job.id;
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={e => { setDragJobId(job.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDragJobId(null); setDragOverCol(null); }}
                        style={{
                          ...css.card,
                          opacity: isDragging ? 0.3 : 1,
                          cursor: "grab",
                          transform: isDragging ? "scale(0.96)" : undefined,
                        }}
                        onClick={() => !dragJobId && openJob(job)}
                        onMouseEnter={e => { if (!dragJobId) { e.currentTarget.style.transform = "translateY(-1px)"; }}}
                        onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          {co && (
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${coColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: coColor, flexShrink: 0, letterSpacing: "-0.02em", boxShadow: "none" }}>
                              {initials(co.name)}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {co && <div style={{ fontSize: 12, fontWeight: 600, color: coColor, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{co.name}</div>}
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{timeAgo(job.addedAt)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.text, lineHeight: 1.35, marginBottom: 10, letterSpacing: "-0.02em" }}>{job.title}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                          {(() => {
                            const pr = PRIORITIES.find((p) => p.id === (job.priority || "medium"));
                            return pr ? <span style={{ ...css.pill, borderLeft: `3px solid ${pr.color}`, fontWeight: 600, fontSize: 11 }}>{pr.label}</span> : null;
                          })()}
                          {job.location && <span style={css.pill}>{job.location}</span>}
                          {job.salary && <span style={{ ...css.pill, fontWeight: 500 }}>{job.salary}</span>}
                        </div>
                        {job.contact && (
                          <div style={{ marginTop: 8, fontSize: 12, color: T.textSec, display: "flex", alignItems: "center", gap: 5, letterSpacing: "-0.01em" }}>
                            <span style={{ fontSize: 10, opacity: 0.5 }}>●</span> {job.contact}
                          </div>
                        )}
                        {(() => {
                          const noteList = getNotesList(job);
                          if (noteList.length === 0) return null;
                          const latest = noteList[noteList.length - 1];
                          return (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`, fontSize: 12, color: T.textSec, lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                              {latest.text.slice(0, 60)}{latest.text.length > 60 ? "…" : ""}
                              {noteList.length > 1 && <span style={{ color: T.textMuted, fontWeight: 500 }}> · {noteList.length} notes</span>}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                  <div style={{
                    border: `2px dashed ${isOver ? st.color : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                    borderRadius: 14,
                    padding: byStatus(st.id).length === 0 ? 24 : "10px 14px",
                    textAlign: "center",
                    color: isOver ? st.color : T.textMuted,
                    fontSize: 13,
                    background: isOver ? `${st.color}0a` : "transparent",
                    transition: "all 0.2s ease",
                    minHeight: byStatus(st.id).length === 0 ? "auto" : 36,
                    fontWeight: 500,
                  }}>
                    {isOver ? "Drop here" : byStatus(st.id).length === 0 ? "No jobs" : ""}
                  </div>
                </div>
              );
            })}
            </div>
            )}

            {/* Table View */}
            {boardViewMode === "table" && (() => {
              const allFiltered = filterAndSortJobs(jobs);
              const thStyle = { padding: "12px 16px", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: isDark ? T.bg : T.surface, zIndex: 1 };
              const tdStyle = { padding: "12px 16px", fontSize: 13.5, color: T.text, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`, whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" };
              return (
                <div style={{ flex: 1, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Company</th>
                        <th style={{ ...thStyle, minWidth: 200 }}>Position</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Priority</th>
                        <th style={thStyle}>Applied</th>
                        <th style={thStyle}>Salary</th>
                        <th style={thStyle}>Location</th>
                        <th style={thStyle}>Contact</th>
                        <th style={thStyle}>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allFiltered.map(job => {
                        const co = getCompany(job.companyId);
                        const coColor = co ? getCompanyColor(co.name) : T.textMuted;
                        const st = STATUSES.find(s => s.id === jobStatus(job)) || STATUSES[0];
                        const pr = PRIORITIES.find(p => p.id === (job.priority || "medium"));
                        return (
                          <tr
                            key={job.id}
                            onClick={() => openJob(job)}
                            style={{ cursor: "pointer", transition: "background 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {co && (
                                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${coColor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: coColor, flexShrink: 0, boxShadow: "none" }}>
                                    {initials(co.name)}
                                  </div>
                                )}
                                <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>{co?.name || "—"}</span>
                              </div>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: "normal", maxWidth: 260, letterSpacing: "-0.02em" }}>{job.title}</td>
                            <td style={tdStyle}>
                              <span style={{
                                display: "inline-flex", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                background: `${st.color}15`, color: st.color,
                              }}>{st.label}</span>
                            </td>
                            <td style={tdStyle}>
                              {pr && <span style={{ ...css.pill, borderLeft: `3px solid ${pr.color}`, fontSize: 12, fontWeight: 600 }}>{pr.label}</span>}
                            </td>
                            <td style={{ ...tdStyle, color: T.textSec, fontSize: 13 }}>{job.applicationDate ? formatDate(job.applicationDate) : <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...tdStyle, color: T.textSec, fontSize: 13 }}>{job.salary || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...tdStyle, color: T.textSec, fontSize: 13 }}>{job.location || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...tdStyle, color: T.textSec, fontSize: 13 }}>{job.contact || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={tdStyle}>
                              {job.link ? (
                                <a
                                  href={job.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ color: T.accent, textDecoration: "none", fontSize: 12.5, fontWeight: 500 }}
                                >View ↗</a>
                              ) : <span style={{ color: T.textMuted }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {allFiltered.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: T.textMuted, padding: 48, fontSize: 14, fontWeight: 500 }}>
                            No jobs match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", gap: 20, padding: "14px 18px", borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.textMuted }}>
                    <span>Count <strong style={{ color: T.text, fontWeight: 700 }}>{allFiltered.length}</strong></span>
                  </div>
                </div>
              );
            })()}

          </div>
        )}

        {/* Companies */}
        {view === "companies" && (
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
              {companies.map(co => {
                const coColor = getCompanyColor(co.name);
                const coJobs = jobs.filter(j => j.companyId === co.id);
                const is = (field) => editing?.context === "company" && editing?.id === co.id && editing?.field === field;
                return (
                  <div key={co.id} style={{ ...css.card, padding: 22, borderLeft: `3px solid ${coColor}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${coColor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: coColor, flexShrink: 0, letterSpacing: "-0.02em", boxShadow: "none" }}>
                        {initials(co.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <EditableField isEditing={is("name")} value={co.name} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "name", co.name)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Company name" displayStyle={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }} inputStyle={css.input} />
                        <EditableField isEditing={is("website")} value={co.website} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "website", co.website)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="website.com" emptyLabel="Add website" displayStyle={{ fontSize: 12, color: T.textSec }} inputStyle={css.input} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <EditableField isEditing={is("description")} value={co.description} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "description", co.description)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Description" multiline displayStyle={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                    </div>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
                      {[["Stage", "stage"], ["Size", "size"], ["Design", "designTeamSize"]].map(([label, field]) => (
                        <div key={field}>
                          <div style={css.infoLabel}>{label}</div>
                          <EditableField isEditing={is(field)} value={co[field]} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, field, co[field])} onEditingChange={setEditingValue} onSave={saveEdit} placeholder={label} emptyLabel="—" displayStyle={{ fontSize: 13, color: T.text, fontWeight: 600, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={css.infoLabel}>Design Leaders</div>
                      <EditableField isEditing={is("designLeaders")} value={co.designLeaders} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "designLeaders", co.designLeaders)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Names or titles" emptyLabel="—" displayStyle={{ fontSize: 13, color: T.infoVal, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={css.infoLabel}>Culture</div>
                      <EditableField isEditing={is("culture")} value={co.culture} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "culture", co.culture)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="e.g. Craft-obsessed, fast-moving" emptyLabel="—" displayStyle={{ fontSize: 13, color: T.textSec, fontStyle: "italic", letterSpacing: "-0.01em" }} inputStyle={css.input} />
                    </div>
                    <div style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: T.textSec, fontWeight: 500 }}>{coJobs.length} job{coJobs.length !== 1 ? "s" : ""} tracked</span>
                      <button style={{ ...css.btn("sec"), fontSize: 12, padding: "6px 12px" }} onClick={() => { setJobCoId(co.id); setModal("addJob"); }}>+ Add Job</button>
                    </div>
                  </div>
                );
              })}
              {companies.length === 0 && (
                <div style={{ color: T.textMuted, fontSize: 14, padding: 48, fontWeight: 500, letterSpacing: "-0.01em" }}>No companies yet. Add one to get started.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Company Modal */}
      {modal === "addCo" && (
        <div style={css.overlay} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={css.modal}>
            <div style={css.modalTitle}>Add Company</div>
            <div style={{ marginBottom: 16 }}>
              <label style={css.label}>Company Name</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={css.input} value={coName} onChange={e => setCoName(e.target.value)} placeholder="e.g. Stripe, Vercel, Figma..." onKeyDown={e => e.key === "Enter" && researchCompany()} />
                <button style={{ ...css.btn("primary"), whiteSpace: "nowrap" }} onClick={researchCompany} disabled={loading || !coName.trim()}>
                  {loading ? "..." : "✦ Research"}
                </button>
              </div>
            </div>

            {coData && (
              <div style={css.infoBox}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 7, background: T.accentBg, border: `1px solid ${T.accent}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.accent, boxShadow: "none" }}>
                    {initials(coData.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{coData.name}</div>
                    <div style={{ fontSize: 11.5, color: T.textSec }}>{coData.website}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, marginBottom: 14 }}>{coData.description}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Stage", coData.stage], ["Size", coData.size], ["Design Team", coData.designTeamSize], ["Design Leaders", coData.designLeaders]].map(([k, v]) => (
                    <div key={k}><div style={css.infoLabel}>{k}</div><div style={css.infoVal}>{v || "—"}</div></div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}><div style={css.infoLabel}>Culture</div><div style={{ ...css.infoVal, fontStyle: "italic" }}>{coData.culture}</div></div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button style={css.btn("sec")} onClick={() => { setModal(null); setCoName(""); setCoData(null); }}>Cancel</button>
              {coData && <button style={css.btn("primary")} onClick={saveCompany}>Save Company</button>}
            </div>
          </div>
        </div>
      )}

      {/* Add Job Modal */}
      {modal === "addJob" && (
        <div style={css.overlay} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={css.modal}>
            <div style={css.modalTitle}>Add Job</div>
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 18, lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 14 }}>✨</span>
              <span>We use AI to import the role from your link or pasted description.</span>
            </div>

            {/* Tab toggle */}
            <div style={{
              display: "flex",
              gap: 4,
              marginBottom: 14,
              background: T.surfaceHover,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 4,
            }}>
              {[["url", "From URL"], ["paste", "Paste Description"]].map(([mode, label]) => (
                <button key={mode} onClick={() => { setJobInputMode(mode); setJobData(null); }} style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: 500, transition: "all 0.2s", fontFamily: FONT_SANS,
                  background: jobInputMode === mode ? T.surface : "transparent",
                  color: jobInputMode === mode ? T.text : T.textSec,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {jobInputMode === "url" ? (
              <div style={{ marginBottom: 14 }}>
                <label style={css.label}>Job Posting URL</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...css.input, borderColor: fetchError ? "#f87171" : undefined }}
                    value={jobLink}
                    onChange={e => { setJobLink(e.target.value); setJobData(null); setFetchError(null); }}
                    placeholder="https://notion.so/jobs/..."
                    onKeyDown={e => e.key === "Enter" && extractFromUrl()}
                  />
                  <button style={{ ...css.btn("primary"), whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }} onClick={extractFromUrl} disabled={loading || !jobLink.trim()}>
                    {loading ? "..." : <><span style={{ fontSize: 14 }}>✨</span> Import</>}
                  </button>
                </div>
                {loading && (
                  <div style={{ marginTop: 10, fontSize: 12, color: T.textSec, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: T.accent, animation: "pulse 1.2s infinite" }} />
                    {importStep === "ai" ? "Cleaning up with AI…" : "Scraping job posting…"}
                  </div>
                )}
                {debugLog.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    background: T.surfaceHover,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}>
                    {debugLog.map((l, i) => (
                      <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: T.textSec, lineHeight: 1.6 }}>{l}</div>
                    ))}
                  </div>
                )}
                {fetchError === "blocked" && (
                  <div style={{ marginTop: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12.5, color: "#f87171", fontWeight: 500, marginBottom: 4 }}>
                      {jobLink.includes("linkedin.com") ? "LinkedIn requires login to view job postings." : "This site blocks external access."}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Copy the job description from the page and paste it instead.</div>
                    <button style={{ ...css.btn("sec"), fontSize: 11.5, padding: "5px 10px" }} onClick={() => { setJobInputMode("paste"); setFetchError(null); }}>
                      Switch to paste →
                    </button>
                  </div>
                )}
                {fetchError && fetchError !== "blocked" && (
                  <div style={{ marginTop: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12.5, color: "#f87171", fontWeight: 500, marginBottom: 4 }}>
                      {fetchError === "failed" ? "Couldn't find the job posting." : "Import failed"}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>
                      {fetchError === "failed"
                        ? "Couldn't reach or parse this page. The site may require login or block scraping. Paste the description instead."
                        : fetchError}
                    </div>
                    <button style={{ ...css.btn("sec"), fontSize: 11.5, padding: "5px 10px" }} onClick={() => { setJobInputMode("paste"); setFetchError(null); }}>
                      Switch to paste →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={css.label}>Paste Job Description</label>
                <textarea style={css.textarea} value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder="Paste the full job description here..." />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={{ ...css.btn("primary"), flex: 1, justifyContent: "center" }} onClick={() => { setJobData(extractJobFree(jobDesc, {})); }} disabled={!jobDesc.trim()}>
                    Extract (free)
                  </button>
                  <button style={{ ...css.btn("sec"), flex: 1, justifyContent: "center" }} onClick={() => refineWithAI(jobDesc)} disabled={loading || !jobDesc.trim()}>
                    {loading ? "..." : "Refine with AI"}
                  </button>
                </div>
              </div>
            )}

            {jobData && (
              <div style={{ ...css.infoBox, marginTop: 16 }}>
                {jobData._aiAssisted && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "5px 9px", background: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: 6, width: "fit-content" }}>
                    <span style={{ fontSize: 12 }}>✨</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.accent, letterSpacing: "-0.01em", fontFamily: FONT_SANS }}>
                      AI-assisted import{jobData._aiFields?.length ? ` · filled ${jobData._aiFields.join(", ")}` : ""}
                    </span>
                  </div>
                )}
                {jobData.companyName && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                    {jobData.companyName}
                    {companies.find(c => c.name.toLowerCase() === jobData.companyName?.toLowerCase())
                      ? <span style={{ marginLeft: 6, color: T.accent, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>· matched</span>
                      : <span style={{ marginLeft: 6, color: T.textMuted, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>· will be created</span>
                    }
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{jobData.title}</div>
                <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 10 }}>
                  {jobData.location}{jobData.salary ? ` · ${jobData.salary}` : ""}
                </div>
                {jobData.summary && <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.6, marginBottom: 12 }}>{jobData.summary}</div>}
                <div style={{ marginTop: 12 }}>
                  <label style={css.label}>Priority</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PRIORITIES.map((pr) => (
                      <button key={pr.id} type="button" onClick={() => setJobPriority(pr.id)} style={{
                        ...css.btn("sec"), fontSize: 12, padding: "5px 11px",
                        borderColor: jobPriority === pr.id ? pr.color : T.border,
                        color: jobPriority === pr.id ? pr.color : T.textSec,
                        background: jobPriority === pr.id ? `${pr.color}18` : T.surface,
                      }}>{pr.label}</button>
                    ))}
                  </div>
                </div>
                {/* Requirements/nice-to-haves hidden for now — extraction logic preserved in extractJobFree */}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button style={css.btn("sec")} onClick={() => { setModal(null); setJobData(null); setJobDesc(""); setJobLink(""); setJobCoId(""); setJobInputMode("url"); setJobPriority("medium"); setFetchError(null); setImportStep(null); }}>Cancel</button>
              {jobData && <button style={css.btn("primary")} onClick={saveJob}>Save Job</button>}
            </div>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {modal === "job" && activeJob && (() => {
        const detailCo = getCompany(activeJob.companyId);
        const detailCoColor = detailCo ? getCompanyColor(detailCo.name) : T.accent;
        return (
        <div style={css.overlay} onClick={e => { if (e.target === e.currentTarget) { setEditing(null); setModal(null); } }}>
          <div style={{ ...css.modal, maxWidth: 600 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {detailCo && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${detailCoColor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: detailCoColor, flexShrink: 0, boxShadow: "none" }}>
                      {initials(detailCo.name)}
                    </div>
                    <EditableField
                      isEditing={editing?.context === "company" && editing?.id === activeJob.companyId && editing?.field === "name"}
                      value={detailCo.name}
                      editingValue={editingValue}
                      onStartEdit={() => startEdit("company", activeJob.companyId, "name", detailCo.name)}
                      onEditingChange={setEditingValue}
                      onSave={saveEdit}
                      displayStyle={{ fontSize: 14, color: detailCoColor, fontWeight: 600, letterSpacing: "-0.01em" }}
                      inputStyle={css.input}
                    />
                  </div>
                )}
                <div style={{ marginBottom: 4 }}>
                  <EditableField
                    isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "title"}
                    value={activeJob.title}
                    editingValue={editingValue}
                    onStartEdit={() => startEdit("job", activeJob.id, "title", activeJob.title)}
                    onEditingChange={setEditingValue}
                    onSave={saveEdit}
                    placeholder="Job title"
                    displayStyle={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.2, letterSpacing: "-0.03em" }}
                    inputStyle={css.input}
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", fontSize: 12.5, color: T.textSec }}>
                  <EditableField
                    isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "location"}
                    value={activeJob.location}
                    editingValue={editingValue}
                    onStartEdit={() => startEdit("job", activeJob.id, "location", activeJob.location)}
                    onEditingChange={setEditingValue}
                    onSave={saveEdit}
                    placeholder="Location"
                    displayStyle={{ fontSize: 12.5, color: T.textSec }}
                    inputStyle={css.input}
                  />
                  <span style={{ color: T.textMuted }}>·</span>
                  <EditableField
                    isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "salary"}
                    value={activeJob.salary}
                    editingValue={editingValue}
                    onStartEdit={() => startEdit("job", activeJob.id, "salary", activeJob.salary)}
                    onEditingChange={setEditingValue}
                    onSave={saveEdit}
                    placeholder="Salary"
                    displayStyle={{ fontSize: 12.5, color: T.textSec }}
                    inputStyle={css.input}
                  />
                </div>
              </div>
              {activeJob.link && (
                <div style={{ flexShrink: 0, marginLeft: 12 }}>
                  <a href={activeJob.link} target="_blank" rel="noopener noreferrer" style={{ ...css.btn("sec"), textDecoration: "none", fontSize: 11.5 }}>↗ View Job</a>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              <EditableField
                isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "summary"}
                value={activeJob.summary}
                editingValue={editingValue}
                onStartEdit={() => startEdit("job", activeJob.id, "summary", activeJob.summary)}
                onEditingChange={setEditingValue}
                onSave={saveEdit}
                placeholder="Summary"
                multiline
                displayStyle={{ fontSize: 13, color: T.textSec, lineHeight: 1.65 }}
                inputStyle={css.input}
              />
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1 }}>
                <label style={css.label}>Application Date</label>
                <EditableField
                  isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "applicationDate"}
                  value={activeJob.applicationDate ? formatDate(activeJob.applicationDate) : ""}
                  editingValue={editingValue}
                  onStartEdit={() => startEdit("job", activeJob.id, "applicationDate", activeJob.applicationDate || "")}
                  onEditingChange={setEditingValue}
                  onSave={saveEdit}
                  placeholder="e.g. 2025-03-01"
                  emptyLabel="Not set"
                  displayStyle={{ fontSize: 13, color: T.text }}
                  inputStyle={css.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={css.label}>Contact</label>
                <EditableField
                  isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "contact"}
                  value={activeJob.contact}
                  editingValue={editingValue}
                  onStartEdit={() => startEdit("job", activeJob.id, "contact", activeJob.contact || "")}
                  onEditingChange={setEditingValue}
                  onSave={saveEdit}
                  placeholder="Name, email, or title"
                  emptyLabel="Not set"
                  displayStyle={{ fontSize: 13, color: T.text }}
                  inputStyle={css.input}
                />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={css.label}>Priority</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {PRIORITIES.map((pr) => (
                  <button key={pr.id} type="button" onClick={() => setJobPriorityLevel(activeJob.id, pr.id)} style={{
                    ...css.btn("sec"), fontSize: 12, padding: "5px 11px",
                    borderColor: (activeJob.priority || "medium") === pr.id ? pr.color : T.border,
                    color: (activeJob.priority || "medium") === pr.id ? pr.color : T.textSec,
                    background: (activeJob.priority || "medium") === pr.id ? `${pr.color}18` : T.surface,
                  }}>{pr.label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={css.label}>Status</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {STATUSES.map(st => (
                  <button key={st.id} onClick={() => moveJob(activeJob.id, st.id)} style={{
                    ...css.btn("sec"),
                    fontSize: 12,
                    padding: "5px 11px",
                    borderColor: jobStatus(activeJob) === st.id ? st.color : T.border,
                    color: jobStatus(activeJob) === st.id ? st.color : T.textSec,
                    background: jobStatus(activeJob) === st.id ? `${st.color}18` : T.surface,
                  }}>{st.label}</button>
                ))}
              </div>
            </div>

            {/* Requirements/nice-to-haves hidden for now — data still saved on job object */}

            <div style={{ marginBottom: 20 }}>
              <label style={css.label}>Notes</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {getNotesList(activeJob).slice().reverse().map((note) => (
                  <div key={note.id} style={{ background: T.surface, borderRadius: 8, padding: "10px 12px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note.text}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ fontSize: 10.5, color: T.textMuted }}>{formatNoteTime(note.createdAt)}</span>
                      <button type="button" onClick={() => deleteNote(activeJob.id, note.id)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    style={{ ...css.textarea, minHeight: 56, resize: "vertical", flex: 1 }}
                    value={newNoteInput}
                    onChange={e => setNewNoteInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(activeJob.id, newNoteInput); setNewNoteInput(""); } }}
                    placeholder="Add a note (contacts, interview prep, gut feelings...)"
                    rows={2}
                  />
                  <button type="button" style={css.btn("primary")} onClick={() => { addNote(activeJob.id, newNoteInput); setNewNoteInput(""); }} disabled={!newNoteInput.trim()}>Add</button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: T.textMuted, letterSpacing: "-0.01em" }}>Added {timeAgo(activeJob.addedAt)}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={() => deleteJob(activeJob.id)} style={{ ...css.btn("sec"), color: "#FF3B30", borderColor: "rgba(255,59,48,0.3)", background: "rgba(255,59,48,0.08)" }}>Delete job</button>
                <button style={css.btn("sec")} onClick={() => setModal(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {showKeyModal && (
        <KeyEntryModal
          theme={theme}
          onKeyReady={onKeyReady}
          onClose={(success) => {
            setShowKeyModal(false);
            setKeyModalMessage(null);
            if (success && pendingImportAfterKeyRef.current) {
              const runImport = pendingImportAfterKeyRef.current;
              pendingImportAfterKeyRef.current = null;
              setTimeout(runImport, 0);
            }
          }}
          message={keyModalMessage}
          onCopyToast={() => setToast("Copied!")}
        />
      )}

      <Toast message={toast} theme={theme} />

    </div>
  );
}
