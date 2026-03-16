import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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

function Spinner({ size = 14, color = "currentColor", style = {} }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "scout-spin 0.8s linear infinite",
        flexShrink: 0,
        ...style,
      }}
      aria-hidden
    />
  );
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
  inputType,
  displaySuffix,
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      if (multiline) inputRef.current?.select?.();
    }
  }, [isEditing, multiline]);
  const raw = value?.trim();
  const display = raw ? (raw + (displaySuffix || "")) : (emptyLabel || placeholder || "—");
  if (isEditing) {
    const common = {
      ...inputStyle,
      width: "100%",
      padding: "6px 8px",
      borderRadius: 4,
    };
    if (multiline) {
      return (
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
      );
    }
    if (inputType === "date") {
      return (
        <input
          ref={inputRef}
          type="date"
          value={editingValue}
          onChange={(e) => onEditingChange(e.target.value)}
          onBlur={onSave}
          placeholder={placeholder}
          style={common}
        />
      );
    }
    return (
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
        e.currentTarget.style.borderColor = "currentColor";
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

/** Strip dangerous tags for safe HTML display (job summary etc.). */
function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "");
}

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
  const res = await fetch((API_BASE || "") + "/api/claude", {
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

const AI_CLEANUP_SYSTEM = `You are a job posting data extractor. You will receive partially-extracted job data and the raw scraped text. Fill in missing fields and fix weak ones. Return ONLY raw JSON (no markdown, no backticks) with these exact fields:
{"title":"job title or null if not found","companyName":"company name or null","location":"location or null","salary":"salary/compensation range as a short string, or null if truly not mentioned","requirements":["requirement 1","requirement 2"],"summary":"2-3 sentence summary of THE ROLE ONLY: what the candidate will do, key scope, and impact. Do NOT describe the company or use intros like 'We are...'. Plain text."}
Rules:
- If a field already has a good value, return that same value unchanged.
- For salary: look for compensation, pay range, base salary, OTE, or equity. Format concisely (e.g. "$120k – $180k").
- For requirements: return 3-8 concise bullet points. If already good, keep them.
- For summary: ALWAYS write a 2-3 sentence role summary from the job text. Describe what the person will do in this role, not the company. If the provided summary is generic or company-focused, replace it. Never leave summary empty when the job text describes the role.
- NEVER fabricate data. If info is truly not in the text, return null.`;

/** Set to true to skip AI API calls for company research (companies page + auto-research on new company). */
const PAUSE_COMPANY_AI = false;

async function researchCompanyByName(companyName, options = {}) {
  const empty = {
    name: companyName || "",
    description: "",
    size: "",
    stage: "",
    designTeamSize: "",
    designLeaders: "",
    culture: "",
    website: "",
  };
  if (PAUSE_COMPANY_AI) return empty;
  const params = new URLSearchParams({ companyName: companyName || "" });
  if (options.refresh) params.set("refresh", "1");
  const headers = getScoutHeaders();
  const res = await fetch(
    (API_BASE || "") + "/api/company-research?" + params.toString(),
    { headers }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || res.statusText || "Request failed");
  return {
    name: data.name ?? companyName ?? "",
    description: data.description ?? "",
    size: data.size ?? "",
    stage: data.stage ?? "",
    designTeamSize: data.designTeamSize ?? "",
    designLeaders: data.designLeaders ?? "",
    culture: data.culture ?? "",
    website: data.website ?? "",
  };
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

  // --- Location (including multi-location: "City, State | City, State") ---
  function normalizeMultiLocation(raw) {
    if (!raw || typeof raw !== "string") return null;
    const parts = raw
      .split(/\s*\|\s*|\s*;\s*|\s+and\s+/i)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter((p) => p.length > 2 && p.length < 120);
    return parts.length > 0 ? parts.join(" / ") : null;
  }
  let location = prefill.location?.trim() || jsonLd?.location || null;
  if (!location) {
    // Full line after "location:" or "locations:" (may contain | or ; separated list)
    const locLineMatch = text.match(/(?:^|\n)\s*(?:location|locations|office)\s*:?\s*([^\n]+)/im);
    if (locLineMatch) {
      const normalized = normalizeMultiLocation(locLineMatch[1]);
      if (normalized) location = normalized;
      else if (locLineMatch[1].trim().length > 2 && locLineMatch[1].trim().length < 150) location = locLineMatch[1].trim();
    }
    if (!location) {
      const locPatterns = [
        /(?:based|located|headquarters?) in\s+([A-Z][A-Za-z, /]+)/,
        /(?:^|\n)\s*([A-Z][a-z]+(?:,\s*[A-Z]{2}))\s*(?:\n|$)/m,
      ];
      for (const pat of locPatterns) {
        const m = text.match(pat);
        if (m) { location = m[1].trim().replace(/\s*[,/]\s*$/, ""); break; }
      }
    }
    // Standalone "City, State | City, State | ..." pattern
    if (!location) {
      const pipeLine = text.match(/[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)(?:\s*\|\s*[A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+))*/);
      if (pipeLine) {
        const normalized = normalizeMultiLocation(pipeLine[0]);
        if (normalized) location = normalized;
      }
    }
    if (/\bremote\b/i.test(text) && !location) location = "Remote";
  }
  if (!location) location = "Remote";

  // --- Salary ---
  let salary = prefill.salary || jsonLd?.salary || null;
  if (!salary) {
    // Multi-zone / "base pay ranges" (e.g. Atlassian: Zone A: USD 182700 - USD 238525, ...)
    const zoneRangeRe = /(?:USD|CAD|GBP|EUR)\s*([\d,]+)\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?([\d,]+)/gi;
    const zoneMatches = [...text.matchAll(zoneRangeRe)];
    if (zoneMatches.length > 0) {
      let minV = Infinity, maxV = -Infinity;
      let cur = "USD";
      for (const m of zoneMatches) {
        const low = Number(m[1].replace(/,/g, ""));
        const high = Number(m[2].replace(/,/g, ""));
        if (!Number.isNaN(low) && !Number.isNaN(high)) {
          if (low < minV) minV = low;
          if (high > maxV) maxV = high;
          if (/USD/i.test(m[0])) cur = "USD"; else if (/CAD/i.test(m[0])) cur = "CAD"; else if (/GBP/i.test(m[0])) cur = "GBP"; else if (/EUR/i.test(m[0])) cur = "EUR";
        }
      }
      if (minV !== Infinity && maxV !== Infinity && minV <= maxV) {
        const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        salary = `${cur} ${fmt(minV)} – ${cur} ${fmt(maxV)}`;
      }
    }
    if (!salary) {
    const patterns = [
      /\b(?:salary|compensation|pay)\s*:?\s*\$[\d,]+\s*(?:[-–—]+|to)\s*\$[\d,]+/i,
      /(?:USD|CAD|GBP|EUR)\s*[\d,]+\s*(?:[-–—]+|to)\s*(?:(?:USD|CAD|GBP|EUR)\s*)?[\d,]+/i,
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

  // --- Summary: prefer "About the role" / responsibilities section; avoid company intro ---
  let summary = null;
  const ROLE_HEADERS = /^(?:about (?:the )?role|the role|in this role|what you(?:['']ll)? do|responsibilities|the opportunity|what we need)\s*:?\s*/i;
  const COMPANY_INTRO = /^(?:we are|we're|at\s+[A-Za-z]+,?\s+we|join (?:our|us)|come (?:join|build)|company\s+[A-Za-z]+\s+is|our (?:mission|team|company)|[A-Za-z]+\s+is\s+(?:a|an)\s+)/i;
  function takeRoleSummaryFromLines(linesArr, headerRegex, maxSentences = 3, maxLen = 420) {
    const sectionStop = /^(?:about|benefits|compensation|how to apply|apply|perks|our (?:team|company)|who we are|requirements?|qualifications?)/i;
    for (let i = 0; i < linesArr.length; i++) {
      if (headerRegex.test(linesArr[i])) {
        const chunk = [];
        for (let j = i + 1; j < linesArr.length && chunk.length < 12; j++) {
          if (sectionStop.test(linesArr[j]) && linesArr[j].length < 60) break;
          chunk.push(linesArr[j]);
        }
        const rest = chunk.join(" ");
        const sentences = rest.match(/[^.!?]{20,}[.!?]+/g);
        if (sentences?.length) {
          const picked = sentences.filter((s) => {
            const t = s.trim();
            return t.length > 25 && !COMPANY_INTRO.test(t);
          }).slice(0, maxSentences);
          if (picked.length) return picked.join(" ").trim().slice(0, maxLen);
        }
        break;
      }
    }
    return null;
  }
  summary = takeRoleSummaryFromLines(lines, ROLE_HEADERS);
  if (!summary) {
    const descSource = jsonLd?.description || text;
    const sentences = descSource.match(/[^.!?]{15,}[.!?]+/g);
    if (sentences?.length) {
      const filtered = sentences.filter((s) => !COMPANY_INTRO.test(s.trim())).slice(0, 2);
      if (filtered.length) summary = filtered.join(" ").trim().slice(0, 420);
      else summary = sentences.slice(0, 2).join(" ").trim().slice(0, 420);
    }
  }

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
  const then = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thenStart = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const d = Math.round((todayStart - thenStart) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d > 30) return `${then.getDate()} ${then.toLocaleDateString(undefined, { month: "short" })} ${then.getFullYear()}`;
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
/** Fallback: same company name always gets same color from palette (no API). */
function getCompanyColor(name) {
  if (!name) return "#007AFF";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length];
}

const brandColorCache = new Map();

/** Known primary brand colors by domain (used before any API call). Add more as needed. */
const KNOWN_BRAND_COLORS = {
  "stripe.com": "#635BFF",
  "figma.com": "#F24E1E",
  "linear.app": "#5E6AD2",
  "notion.so": "#000000",
  "instacart.com": "#43B02A",
  "via.transport": "#00C2FF",
  "zynga.com": "#E91D26",
  "kraken.com": "#5741D9",
  "thumbtack.com": "#009FD9",
};
/** Known brand colors by company name (when domain is missing). Lowercase, no spaces. */
const KNOWN_BRAND_COLORS_BY_NAME = {
  zynga: "#E91D26",
  kraken: "#5741D9",
  thumbtack: "#009FD9",
};

function normalizeDomain(website) {
  if (!website || typeof website !== "string") return "";
  const s = website.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  return s || "";
}

/**
 * Fetch primary brand color: known list → server cache (Claude once per company) → hash fallback.
 * Server stores result in data/brand_colors.json so we never call Claude twice for the same company.
 */
async function fetchBrandColor(domain, companyName, headers) {
  const normDomain = normalizeDomain(domain);
  const key = normDomain || (companyName || "").toLowerCase().replace(/\s+/g, "");
  if (!key) return null;
  if (normDomain && KNOWN_BRAND_COLORS[normDomain]) {
    const hex = KNOWN_BRAND_COLORS[normDomain];
    brandColorCache.set(key, hex);
    return hex;
  }
  if (!normDomain && companyName && KNOWN_BRAND_COLORS_BY_NAME[key]) {
    const hex = KNOWN_BRAND_COLORS_BY_NAME[key];
    brandColorCache.set(key, hex);
    return hex;
  }
  if (brandColorCache.has(key)) return brandColorCache.get(key);
  if (!headers || !(domain || companyName)) return null;
  try {
    const params = new URLSearchParams();
    if (domain) params.set("domain", normalizeDomain(domain) || domain);
    if (companyName) params.set("companyName", companyName);
    const res = await fetch((API_BASE || "") + "/api/brand-color?" + params.toString(), { headers });
    const data = await res.json();
    const hex = data?.hex && /^#[0-9A-Fa-f]{6}$/.test(data.hex) ? data.hex : null;
    brandColorCache.set(key, hex);
    return hex;
  } catch (_) {
    brandColorCache.set(key, null);
    return null;
  }
}
/** Card text: default to light (white) on colored backgrounds. */
function textOnColor() {
  return "#ffffff";
}
/** True if hex color is dark (low luminance). Used to fix dark brand icons on dark mode. */
function isColorDark(hex) {
  if (!hex || typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.25;
}

// SF Pro: Display for headings (≥20pt), Text for body/UI (≤19pt). -apple-system = SF Pro on Apple.
const FONT_DISPLAY = '"SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif';
const FONT_TEXT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif';
/** Set to true to show "by FUTURE-PROOF.XYZ" under the Scout logo in sidebar and modals. */
const SHOW_LOGO_CREDIT = false;

const THEMES = {
  dark: {
    bg: "#1a1a1a",
    surface: "#252525",
    surfaceHover: "#2e2e2e",
    border: "#3a3a3a",
    borderHover: "#484848",
    accent: "#7B5CFE",
    accentBg: "rgba(123, 92, 254, 0.25)",
    text: "#f5f0e8",
    textSec: "#a8a29e",
    textMuted: "#78716c",
    sidebarBg: "#1a1a1a",
    overlay: "rgba(0,0,0,0.6)",
    infoVal: "#a8a29e",
  },
  light: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceHover: "#F5F5F5",
    border: "#e5e5e5",
    borderHover: "#d4d4d4",
    accent: "#5B24FF",
    accentBg: "rgba(91, 36, 255, 0.15)",
    text: "#2c2c2c",
    textSec: "#6b6560",
    textMuted: "#8a837c",
    sidebarBg: "#FFFFFF",
    overlay: "rgba(0,0,0,0.3)",
    infoVal: "#5c5651",
  },
};

function getCss(T, isDark) {
  return {
    app: {
      display: "flex",
      width: "100%",
      height: "100vh",
      paddingTop: 0,
      background: T.bg,
      color: T.text,
      fontFamily: FONT_TEXT,
      overflow: "hidden",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
    },
    sidebar: { width: 220, minWidth: 220, background: T.sidebarBg, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "20px 12px" },
    logo: { fontSize: 22, fontWeight: 600, fontFamily: FONT_DISPLAY, color: T.text, letterSpacing: "-0.02em", padding: "0 8px 0 0", marginBottom: 0, display: "flex", alignItems: "center", gap: 0 },
    bottomNav: {
      wrapper: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", padding: "12px 16px max(12px, env(safe-area-inset-bottom))", zIndex: 50, pointerEvents: "none" },
      island: { pointerEvents: "auto", display: "flex", alignItems: "center", gap: 4, padding: "8px 12px 8px 12px", background: isDark ? "rgba(18,18,18,0.85)" : "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, borderRadius: 100, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.25)" : "0 4px 24px rgba(0,0,0,0.06)", fontFamily: FONT_TEXT },
      navItem: (on) => ({ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 18, border: "none", cursor: "pointer", fontSize: 14, fontWeight: on ? 600 : 500, color: on ? T.text : T.textSec, background: on ? (isDark ? T.surfaceHover : "rgba(0,0,0,0.06)") : "transparent", transition: "all 0.15s", fontFamily: FONT_TEXT }),
      navDivider: { width: 1, alignSelf: "stretch", background: T.border, margin: "4px 4px 4px 8px", borderRadius: 1 },
      themeBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 18, border: "none", cursor: "pointer", background: "transparent", color: T.textSec, transition: "all 0.15s" },
    },
    navBtn: (on) => ({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: on ? 600 : 400, color: on ? T.text : T.textSec, background: on ? (isDark ? T.surface : T.surfaceHover) : "transparent", border: "none", width: "100%", textAlign: "left", transition: "all 0.15s", letterSpacing: "-0.01em", fontFamily: FONT_TEXT }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.border}`, minHeight: 58 },
    headerTitle: { fontSize: 22, fontWeight: 600, fontFamily: FONT_DISPLAY, color: T.text, letterSpacing: "-0.02em" },
    btn: (v = "primary") => ({
      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", transition: "all 0.15s", letterSpacing: "-0.01em", fontFamily: FONT_TEXT,
      ...(v === "primary"
        ? { background: T.accent, color: "#fff" }
        : { background: isDark ? "rgba(255,255,255,0.06)" : "transparent", color: T.textSec, border: `1px solid ${T.border}` }),
    }),
    card: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: "20px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },
    input: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: FONT_TEXT, letterSpacing: "-0.01em" },
    textarea: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: T.text, outline: "none", resize: "vertical", minHeight: 110, fontFamily: FONT_TEXT, boxSizing: "border-box", lineHeight: 1.6, letterSpacing: "-0.01em" },
    select: { width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: FONT_TEXT },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, fontFamily: FONT_TEXT },
    tag: { display: "inline-flex", padding: "3px 9px", borderRadius: 6, fontSize: 12, background: T.surfaceHover, color: T.textSec, fontWeight: 500, fontFamily: FONT_TEXT },
    pill: { display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: T.textSec, fontWeight: 500, fontFamily: FONT_TEXT },
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
    modalTitle: { fontSize: 20, fontWeight: 600, fontFamily: FONT_DISPLAY, color: T.text, marginBottom: 22, letterSpacing: "-0.02em" },
    infoBox: {
      background: isDark ? "rgba(255,255,255,0.04)" : T.surfaceHover,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      padding: 18,
    },
    infoLabel: { fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: FONT_TEXT },
    infoVal: { fontSize: 13.5, color: T.infoVal, letterSpacing: "-0.01em", fontFamily: FONT_TEXT },
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
        fontFamily: FONT_TEXT,
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

  const logoBlock = (
    <div style={{ marginBottom: 20 }}>
      <div style={css.logo}>
        Scout<span style={{ color: T.accent, fontSize: 8, marginLeft: 2, marginBottom: 8, lineHeight: 1 }}>●</span>
      </div>
      {SHOW_LOGO_CREDIT && <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: "0.02em", marginTop: 4, padding: "0 8px 0" }}>by FUTURE-PROOF.XYZ</div>}
    </div>
  );
  if (createdKey) {
    return (
      <div className="scout-overlay" style={css.overlay} onClick={(e) => e.target === e.currentTarget && handleClose(false)}>
        <div className="scout-modal" style={{ ...css.modal, maxWidth: 400, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ ...css.modalTitle, marginBottom: 0 }}>New key</div>
            <button type="button" onClick={() => handleClose(false)} style={{ background: "none", border: "none", color: T.textSec, cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
          </div>
          <p style={{ fontSize: 13, color: T.textSec, marginBottom: 16, lineHeight: 1.5, textAlign: "left" }}>
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
    <div className="scout-overlay" style={css.overlay} onClick={(e) => e.target === e.currentTarget && handleClose(false)}>
      <div className="scout-modal" style={{ ...css.modal, maxWidth: 400, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ ...css.modalTitle, marginBottom: 0 }}>Sign up / Log in</div>
              <button type="button" onClick={() => handleClose(false)} style={{ background: "none", border: "none", color: T.textSec, cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
            </div>
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 20, lineHeight: 1.5, textAlign: "left" }}>
          {message || "Every job board is keyed to a unique ID. No email signup and password needed — pick an option below."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <div>
            <div style={css.label}>I'm a new user</div>
            <button type="button" style={{ ...css.btn("primary"), width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 14 }} onClick={startFresh}>
              Generate a new key
            </button>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 8 }}>
            <div style={css.label}>I have a key</div>
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
        <div style={{ marginBottom: 24 }}>
          <div style={css.modalTitle}>Recover key</div>
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
          <button type="submit" style={{ ...css.btn("primary"), width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }} disabled={loading}>{loading ? <><Spinner /> Sending…</> : "Send recovery link"}</button>
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
  const [dragStartRect, setDragStartRect] = useState(null);
  const [dragMouse, setDragMouse] = useState(null);
  const [dragGrabOffset, setDragGrabOffset] = useState(null);
  const [dragStartMouse, setDragStartMouse] = useState(null);
  const pendingDragRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [importStep, setImportStep] = useState(null);
  const [boardViewMode, setBoardViewMode] = useState("kanban");
  const [tableSortColumn, setTableSortColumn] = useState("company");
  const [tableSortDir, setTableSortDir] = useState("asc");
  const TABLE_COLUMNS = useMemo(() => [
    { id: "company", label: "Company", defaultWidth: 200 },
    { id: "position", label: "Position", defaultWidth: 280 },
    { id: "status", label: "Status", defaultWidth: 140 },
    { id: "priority", label: "Priority", defaultWidth: 100 },
    { id: "applied", label: "Applied", defaultWidth: 120 },
    { id: "added", label: "Date added", defaultWidth: 120 },
    { id: "salary", label: "Salary", defaultWidth: 160 },
    { id: "location", label: "Location", defaultWidth: 160 },
    { id: "contact", label: "Contact", defaultWidth: 160 },
    { id: "link", label: "Link", defaultWidth: 90 },
  ], []);
  const [tableColumnWidths, setTableColumnWidths] = useState(() => ({}));
  const companyColumnMinWidth = useMemo(() => {
    const avatarGapPadding = 28 + 10 + 32; // avatar + gap + cell padding
    const maxNameLen = Math.max(0, ...companies.map(c => (c?.name ?? "").length));
    return Math.max(200, avatarGapPadding + maxNameLen * 8);
  }, [companies]);
  const [resizingColumn, setResizingColumn] = useState(null); // { columnId, startX, startWidth }
  const [hoveredResizerColumnId, setHoveredResizerColumnId] = useState(null);
  const [kanbanSortByColumn, setKanbanSortByColumn] = useState({}); // { [statusId]: { column: string, dir: 'asc'|'desc' } }
  const [jobDetailMenuOpen, setJobDetailMenuOpen] = useState(false);
  const [brandColorsByDomain, setBrandColorsByDomain] = useState({});

  const T = THEMES[theme];
  const isDark = theme === "dark";
  const css = useMemo(() => getCss(T, isDark), [theme]);

  const ChevronIcon = useCallback(({ down = true, size = 10, color }) => {
    const svg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='${encodeURIComponent(color || T.textSec)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2 5l4 4 4-4'/%3E%3C/svg%3E")`;
    return (
      <span style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: svg,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
        transform: down ? undefined : "rotate(180deg)",
      }} />
    );
  }, [T.textSec]);

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

  // Table column resize: global mousemove/mouseup when dragging a column edge
  useEffect(() => {
    if (!resizingColumn) return;
    const onMove = (e) => {
      const newWidth = resizingColumn.startWidth + (e.clientX - resizingColumn.startX);
      setTableColumnWidths((prev) => ({
        ...prev,
        [resizingColumn.columnId]: Math.max(48, newWidth),
      }));
    };
    const onUp = () => setResizingColumn(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingColumn]);

  // Mouse-based drag with dead-zone: only start drag after 5px of movement so clicks still open jobs
  useEffect(() => {
    const DRAG_THRESHOLD = 5;

    const onMouseMove = (e) => {
      const p = pendingDragRef.current;
      if (p && !dragJobId) {
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          setDragJobId(p.jobId);
          setDragStartRect(p.rect);
          setDragGrabOffset(p.grabOffset);
          setDragStartMouse({ x: p.startX, y: p.startY });
          setDragMouse({ x: e.clientX, y: e.clientY });
        }
        return;
      }
      if (dragJobId) {
        setDragMouse({ x: e.clientX, y: e.clientY });
        const col = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-kanban-status]");
        setDragOverCol(col ? col.dataset.kanbanStatus : null);
      }
    };

    const onMouseUp = (e) => {
      if (pendingDragRef.current && !dragJobId) {
        const p = pendingDragRef.current;
        pendingDragRef.current = null;
        const job = jobs.find(j => j.id === p.jobId);
        if (job) openJob(job);
        return;
      }
      if (dragJobId) {
        const col = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-kanban-status]");
        if (col) moveJob(dragJobId, col.dataset.kanbanStatus);
        setDragJobId(null);
        setDragOverCol(null);
        setDragStartRect(null);
        setDragMouse(null);
        setDragGrabOffset(null);
        setDragStartMouse(null);
      }
      pendingDragRef.current = null;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragJobId, jobs]);

  // During active drag, set grabbing cursor and disable text selection
  useEffect(() => {
    if (!dragJobId) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragJobId]);

  useEffect(() => {
    if (!key || !companies.length) return;
    const headers = getScoutHeaders();
    companies.forEach((co) => {
      const domain = normalizeDomain(co.website);
      const cacheKey = domain || (co.name || "").toLowerCase().replace(/\s+/g, "");
      if (!cacheKey) return;
      setBrandColorsByDomain((prev) => {
        if (prev[cacheKey] !== undefined) return prev;
        fetchBrandColor(co.website, co.name, headers).then((hex) => {
          setBrandColorsByDomain((p) => ({ ...p, [cacheKey]: hex ?? null }));
        });
        return prev;
      });
    });
  }, [companies, key]);

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

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (modal === "addCo") {
        setModal(null);
        setCoName("");
        setCoData(null);
      } else if (modal === "addJob") {
        setModal(null);
        setJobData(null);
        setJobDesc("");
        setJobLink("");
        setJobCoId("");
        setJobInputMode("url");
        setJobPriority("medium");
        setFetchError(null);
        setImportStep(null);
        resetManualJobForm();
      } else if (modal === "job") {
        setEditing(null);
        setModal(null);
        setJobDetailMenuOpen(false);
      } else {
        setModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

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
  const [jobInputMode, setJobInputMode] = useState("url"); // "url" | "manual"
  const [jobPriority, setJobPriority] = useState("medium");
  const [newJobStatus, setNewJobStatus] = useState("interested");
  const [fetchError, setFetchError] = useState(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualSalary, setManualSalary] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualPriority, setManualPriority] = useState("medium");
  const [manualApplicationDate, setManualApplicationDate] = useState("");
  const [manualContact, setManualContact] = useState("");

  const BLOCKED_DOMAINS = ["linkedin.com"];
  const isBlockedUrl = (url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d));
    } catch {
      return false;
    }
  };
  const isLinkedInHost = (url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
    } catch {
      return false;
    }
  };

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
    if (isBlockedUrl(jobLink)) { setFetchError("blocked"); return; }
    setLoading(true);
    setImportStep("scraping");

    const PROXY_BASE = import.meta.env.VITE_JOB_PROXY_BASE || ((API_BASE || "") + "/api/job");

    try {
      let rawText = null;
      let prefill = {};
      let jsonLd = null;

      const ats = detectATS(jobLink);
      const ATS_WITH_API = ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"];
      if (ats) {
        const company = ats.boardSlug || ats.company;
        if (company && ats.jobId && ATS_WITH_API.includes(ats.ats)) {
          const proxyUrl = `${PROXY_BASE}?ats=${ats.ats}&company=${encodeURIComponent(company)}&jobId=${encodeURIComponent(ats.jobId)}`;
          try {
            const res = await fetch(proxyUrl);
            const data = await res.json();
            if (res.ok && data.content) {
              rawText = data.content;
              prefill = {
                title: data.title, location: data.location,
                companyName: data.companyName, salary: data.salary || null,
              };
            }
          } catch (_) {}
        }
      }

      if (!rawText) {
        try {
          const res = await fetch((API_BASE || "") + `/api/scrape?url=${encodeURIComponent(jobLink)}`);
          const data = await res.json();
          if (res.ok && data.content) {
            rawText = data.content;
            jsonLd = data.jsonLd || null;
            prefill = {
              title: data.title || prefill.title,
              location: data.location || prefill.location,
              companyName: data.companyName || prefill.companyName,
              salary: data.salary || null,
            };
          }
        } catch (_) {}
      }

      if (rawText) {
        const parsed = extractJobFree(rawText, prefill, jsonLd);

        const hasFullJsonLd = jsonLd && jsonLd.title && jsonLd.salary && jsonLd.location;
        const titleWeak = !parsed.title || parsed.title.length > 60 || /[|–—]/.test(parsed.title);
        const summaryFallback = parsed.summary === "Job posting imported. See link for full details.";
        const summaryGeneric = !summaryFallback && parsed.summary && (
          parsed.summary.length < 50 ||
          /^(?:we are|we're|at\s+[a-z]+,?\s+we|join (?:our|us)|our (?:mission|team|company)|[A-Za-z]+\s+is\s+(?:a|an)\s+)/i.test(parsed.summary.trim())
        );
        const needsAI = !hasFullJsonLd && (
          !parsed.salary
          || titleWeak
          || summaryFallback
          || summaryGeneric
          || (parsed.requirements.length === 1 && parsed.requirements[0] === "See job description")
        );

        if (needsAI) {
          setImportStep("ai");
          try {
            const already = { title: parsed.title, companyName: parsed.companyName, location: parsed.location, salary: parsed.salary, summary: parsed.summary };
            const aiText = await callClaude(
              `Scraped job posting. Fill in missing fields and improve weak ones. Current extracted: ${JSON.stringify(already)}\n\nIf the current summary is missing or sounds like company intro (e.g. "We are..."), write a 2-3 sentence summary of THE ROLE: what the candidate will do, scope, impact.\n\nJob text:\n${rawText.slice(0, 6000)}`,
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
            if (aiData.summary && (summaryFallback || summaryGeneric || !parsed.summary)) {
              parsed.summary = aiData.summary;
              aiFields.push("summary");
            }
            if (parsed.requirements.length === 1 && parsed.requirements[0] === "See job description" && aiData.requirements?.length) {
              parsed.requirements = aiData.requirements; aiFields.push("requirements");
            }
            if (aiFields.length > 0) {
              parsed._aiAssisted = true;
              parsed._aiFields = aiFields;
            }
          } catch (_) {}
        }

        setJobData(parsed);
      } else {
        setFetchError("failed");
      }
    } catch (e) {
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
        `Extract info from this job description:\n\n${sourceText.slice(0, 6000)}`,
        `You are a job description parser. Return ONLY raw JSON (no markdown, no backticks):
{"title":"job title","companyName":"company name if mentioned, else null","location":"location or Remote","salary":"salary range or null","requirements":["key requirement 1","key requirement 2","key requirement 3"],"niceToHave":["nice 1","nice 2"],"summary":"2-3 sentence summary of THE ROLE ONLY: what the candidate will do, key scope, and impact. Do not describe the company or use intros like 'We are...'. Plain text."}`
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
    setJobs(p => [...p, { id: uid(), companyId, ...cleanJobData, status: newJobStatus, priority: jobPriority, notes: [], link: jobLink || "", applicationDate: "", contact: "", addedAt: new Date().toISOString() }]);
    setModal(null); setJobDesc(""); setJobLink(""); setJobData(null); setJobCoId(""); setJobInputMode("url"); setJobPriority("medium"); setNewJobStatus("interested"); setFetchError(null); setImportStep(null);
    resetManualJobForm();
    if (createdNewCompany) {
      researchCompanyByName(jobData.companyName)
        .then((data) => {
          setCompanies((p) => p.map((c) => (c.id === companyId ? { ...c, ...data, id: c.id } : c)));
        })
        .catch((e) => console.error("Company research failed:", e));
    }
  };

  const resetManualJobForm = () => {
    setManualTitle(""); setManualCompanyId(""); setManualCompanyName(""); setManualLocation(""); setManualSalary("");
    setManualSummary(""); setManualPriority("medium"); setManualApplicationDate(""); setManualContact(""); setNewJobStatus("interested");
  };

  const saveJobFromManual = () => {
    const companyName = manualCompanyId ? (companies.find(c => c.id === manualCompanyId)?.name ?? "") : manualCompanyName.trim();
    if (!manualTitle.trim()) return;
    let companyId = manualCompanyId;
    let createdNewCompany = false;
    if (!companyId && companyName) {
      const existing = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
      if (existing) {
        companyId = existing.id;
      } else {
        const newCo = { id: uid(), name: companyName, description: "", size: "", stage: "", designTeamSize: "", designLeaders: "", culture: "", website: "" };
        setCompanies(p => [...p, newCo]);
        companyId = newCo.id;
        createdNewCompany = true;
      }
    }
    if (!companyId) return;
    setJobs(p => [...p, {
      id: uid(),
      companyId,
      title: manualTitle.trim(),
      location: manualLocation.trim() || undefined,
      salary: manualSalary.trim() || undefined,
      summary: manualSummary.trim() || undefined,
      status: newJobStatus,
      priority: manualPriority,
      notes: [],
      link: "",
      applicationDate: manualApplicationDate.trim() || "",
      contact: manualContact.trim() || "",
      addedAt: new Date().toISOString(),
    }]);
    setModal(null);
    setJobData(null); setJobCoId(""); setJobInputMode("url"); setJobPriority("medium");
    resetManualJobForm();
    if (createdNewCompany && companyName) {
      researchCompanyByName(companyName)
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
  const BRAND_COLOR_LOADING_GREY = "#6b7280";
  const getCompanyColorForDisplay = (company) => {
    if (!company) return getCompanyColor(null);
    const domain = normalizeDomain(company.website);
    if (domain && KNOWN_BRAND_COLORS[domain]) return KNOWN_BRAND_COLORS[domain];
    const cacheKey = domain || (company.name || "").toLowerCase().replace(/\s+/g, "");
    if (!cacheKey) return getCompanyColor(company.name);
    if (!domain && KNOWN_BRAND_COLORS_BY_NAME[cacheKey]) return KNOWN_BRAND_COLORS_BY_NAME[cacheKey];
    if (brandColorsByDomain[cacheKey] !== undefined) {
      const hex = brandColorsByDomain[cacheKey];
      return hex || getCompanyColor(company.name);
    }
    return BRAND_COLOR_LOADING_GREY;
  };
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
  const jobsByStatus = useMemo(() => {
    const map = {};
    for (const st of STATUSES) {
      map[st.id] = filterAndSortJobs(jobs.filter((j) => jobStatus(j) === st.id));
    }
    return map;
  }, [jobs, boardSearch, priorityFilter, sortBy, companies]);
  const byStatus = (s) => jobsByStatus[s] || [];
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
    <div style={css.app} data-dragging={dragJobId ? "true" : undefined}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.textMuted};border-radius:4px}
        button:disabled{opacity:0.4;cursor:not-allowed}
        select option{background:${T.surface};color:${T.text}}
        table{border-spacing:0}
        .job-summary-html p{margin:0 0 0.5em 0;font-size:inherit;line-height:inherit}
        .job-summary-html p:last-child{margin-bottom:0}
        .job-summary-html strong{font-weight:600}
        [data-dragging="true"],[data-dragging="true"] *{cursor:grabbing !important}
      `}</style>

      {/* Main */}
      <div style={css.main}>
        <div style={css.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={css.logo}>Scout<span style={{ color: T.accent, fontSize: 8, marginLeft: 2, marginBottom: 8, lineHeight: 1 }}>●</span></div>
              <div style={{ ...css.headerTitle, color: T.textMuted }}>{view === "board" ? "Board" : "Companies"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: T.textSec, fontWeight: 500 }}>
              <span><span style={{ color: T.textMuted, marginRight: 4 }}>Tracked</span><strong style={{ color: T.text }}>{jobs.length}</strong></span>
              <span><span style={{ color: T.textMuted, marginRight: 4 }}>Active</span><strong style={{ color: T.accent }}>{totalActive}</strong></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <button style={css.btn("primary")} onClick={() => setModal("addJob")}>+ Add Job</button>
            <div style={{ position: "relative" }}>
              {key ? (
                <>
              <button
                type="button"
                onClick={() => setKeyMenuOpen((o) => !o)}
                style={{ ...css.btn("sec"), display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ color: T.text }}>{truncatedKey}</span>
                <ChevronIcon size={10} />
              </button>
              {keyMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setKeyMenuOpen(false)} aria-hidden="true" />
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 280, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 100, padding: "14px 14px 12px", boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.25)" : "0 8px 24px rgba(0,0,0,0.08)" }}>
                    <div style={{ padding: "0 0 10px" }}>
                      <div style={css.label}>Access key</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <code style={{ fontSize: 12, color: T.text, flex: 1, wordBreak: "break-all" }}>{key}</code>
                        <button type="button" style={{ ...css.btn("sec"), padding: "6px 10px", fontSize: 11 }} onClick={() => { copyWithToast(key); setKeyMenuOpen(false); }}>Copy</button>
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>Save this key to access Scout from another device.</div>
                    </div>
                    <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 12 }} />
                    <div style={{ paddingTop: 12 }}>
                      <div style={css.label}>Recovery email</div>
                      {workspaceEmail ? (
                        <div style={{ fontSize: 12, color: T.textSec, marginBottom: 4 }}>
                          {workspaceEmail}
                          <button type="button" onClick={() => { removeRecoveryEmail(); setKeyMenuOpen(false); }} style={{ marginLeft: 8, background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11 }}>Remove</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                            <input type="email" value={recoveryEmailInput} onChange={(e) => setRecoveryEmailInput(e.target.value)} placeholder="Add recovery email" style={{ ...css.input, flex: 1, padding: "8px 10px", fontSize: 12 }} />
                            <button type="button" style={{ ...css.btn("primary"), padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }} onClick={() => saveRecoveryEmail()} disabled={recoveryEmailSaving || !recoveryEmailInput.trim()}>{recoveryEmailSaving ? <><Spinner /> Saving…</> : "Save"}</button>
                          </div>
                          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>If you lose your key, we'll send it to this address.</div>
                        </>
                      )}
                    </div>
                    <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 8 }} />
                    <button type="button" onClick={() => { handleLogout(); setKeyMenuOpen(false); }} style={{ display: "block", width: "100%", padding: "10px 0 0", fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left", marginTop: 4 }}>Log out of this device</button>
                  </div>
                </>
              )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setKeyModalMessage(null); setShowKeyModal(true); }}
                  style={{ ...css.btn("sec"), display: "flex", alignItems: "center", gap: 6 }}
                >
                  Sign up / Log in
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {/* Board */}
        {view === "board" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingBottom: 72 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 20px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 2, background: isDark ? T.surface : T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 2 }}>
                {[
                  ["kanban", <svg key="kanban" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>],
                  ["table", <svg key="table" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18" /></svg>],
                ].map(([mode, icon]) => (
                  <button key={mode} onClick={() => setBoardViewMode(mode)} style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${boardViewMode === mode ? T.border : "transparent"}`, cursor: "pointer", fontSize: 14, transition: "all 0.15s", fontWeight: 500, fontFamily: FONT_TEXT,
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
                style={{ ...css.input, width: 220, height: 38, lineHeight: "38px", padding: "0 10px", fontSize: 12, borderRadius: 8, boxSizing: "border-box" }}
              />
              {(() => {
                const selectBaseStyle = {
                  ...css.select,
                  width: "auto",
                  height: 38,
                  lineHeight: "38px",
                  padding: "0 30px 0 10px",
                  fontSize: 12,
                  minWidth: 90,
                  borderRadius: 8,
                  appearance: "none",
                  WebkitAppearance: "none",
                  boxSizing: "border-box",
                };
                const selectWrapperStyle = { position: "relative", display: "inline-block" };
                const chevronOverlayStyle = { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" };
                return (
              <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority</span>
                <div style={selectWrapperStyle}>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ ...selectBaseStyle, minWidth: 90 }}>
                    <option value="">All</option>
                    {PRIORITIES.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.label}</option>
                    ))}
                  </select>
                  <span style={chevronOverlayStyle}><ChevronIcon down size={10} color={T.textSec} /></span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort</span>
                <div style={selectWrapperStyle}>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...selectBaseStyle, minWidth: 100 }}>
                    <option value="priority">Priority</option>
                    <option value="date">Date added</option>
                    <option value="company">Company</option>
                  </select>
                  <span style={chevronOverlayStyle}><ChevronIcon down size={10} color={T.textSec} /></span>
                </div>
              </div>
              </>
                );
              })()}
            </div>

            {/* Kanban: sticky header row (sits below Board row when stuck); scroll area has only columns */}
            {boardViewMode === "kanban" && (() => {
              const KANBAN_SORT_FIELDS = ["company", "position", "priority", "applied"];
              const getKanbanSortValue = (job, col) => {
                const co = getCompany(job.companyId);
                switch (col) {
                  case "company": return (co?.name ?? "").toLowerCase();
                  case "position": return (job.title ?? "").toLowerCase();
                  case "priority": return priorityOrder[job.priority || "medium"] ?? 1;
                  case "applied": return job.applicationDate ? new Date(job.applicationDate).getTime() : 0;
                  default: return "";
                }
              };
              const handleKanbanColumnSort = (statusId) => {
                const current = kanbanSortByColumn[statusId];
                if (!current) {
                  setKanbanSortByColumn(prev => ({ ...prev, [statusId]: { column: "company", dir: "asc" } }));
                  return;
                }
                if (current.dir === "asc") {
                  setKanbanSortByColumn(prev => ({ ...prev, [statusId]: { ...current, dir: "desc" } }));
                  return;
                }
                setKanbanSortByColumn(prev => {
                  const next = { ...prev };
                  delete next[statusId];
                  return next;
                });
              };
              const sortJobsForColumn = (statusId, jobList) => {
                const s = kanbanSortByColumn[statusId];
                if (!s) return jobList;
                const isNum = s.column === "priority" || s.column === "applied";
                return [...jobList].sort((a, b) => {
                  const va = getKanbanSortValue(a, s.column);
                  const vb = getKanbanSortValue(b, s.column);
                  const cmp = isNum ? (va - vb) : String(va).localeCompare(String(vb));
                  return s.dir === "desc" ? -cmp : cmp;
                });
              };
              return (
            <>
              <div className="kanban-scroll-container" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 20px 20px" }}>
                <div className="kanban-header-row" style={{ display: "flex", gap: 12, position: "sticky", top: 0, zIndex: 20, background: T.bg, padding: "12px 0 6px", alignItems: "flex-start" }}>
                  {STATUSES.map(st => {
                    const sortState = kanbanSortByColumn[st.id];
                    return (
                    <div key={st.id} className="kanban-column" style={{ minWidth: 300, width: 300 }}>
                      <button
                        type="button"
                        onClick={() => handleKanbanColumnSort(st.id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, padding: "0px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", boxSizing: "border-box", minHeight: 32 }}
                      >
                        <span style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: "-0.04em", lineHeight: 1, whiteSpace: "nowrap" }}>{st.label} <span style={{ color: T.textMuted, fontWeight: 500 }}>• {byStatus(st.id).length}</span></span>
                        <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, lineHeight: 0, minHeight: 20, color: sortState ? T.accent : T.textMuted }}>
                          {sortState ? (
                            <ChevronIcon down={sortState.dir === "desc"} size={10} color={sortState ? T.accent : T.textMuted} />
                          ) : (
                            <>
                              <ChevronIcon down={false} size={10} />
                              <ChevronIcon down size={10} />
                            </>
                          )}
                        </span>
                      </button>
                    </div>
                    );
                  })}
                </div>
              <div className="kanban-scroll-row" style={{ display: "flex", gap: 12, paddingTop: 8 }}>
            {STATUSES.map(st => {
              const isOver = dragOverCol === st.id && dragJobId && jobStatus(jobs.find(j => j.id === dragJobId) || {}) !== st.id;
              return (
                <div
                  key={st.id}
                  className="kanban-column"
                  data-kanban-status={st.id}
                  style={{ minWidth: 300, width: 300, display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {sortJobsForColumn(st.id, byStatus(st.id)).map(job => {
                    const co = getCompany(job.companyId);
                    const coColor = co ? getCompanyColorForDisplay(co) : T.textMuted;
                    const cardFg = textOnColor(coColor);
                    const isDragging = dragJobId === job.id;
                    return (
                      <div
                        key={job.id}
                        onMouseDown={e => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          pendingDragRef.current = {
                            jobId: job.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            rect: { width: rect.width, height: rect.height },
                            grabOffset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
                          };
                        }}
                        style={{
                          ...css.card,
                          background: coColor,
                          color: cardFg,
                          border: "none",
                          borderRadius: 20,
                          opacity: isDragging ? 0.35 : 1,
                          cursor: "grab",
                          position: "relative",
                        }}
                        onMouseEnter={e => {
                          if (!dragJobId) {
                            e.currentTarget.style.transform = "translateY(-5px)";
                            e.currentTarget.style.boxShadow = isDark ? "0 12px 28px rgba(0,0,0,0.35)" : "0 12px 28px rgba(0,0,0,0.14)";
                            e.currentTarget.style.zIndex = "5";
                          }
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = "none";
                          e.currentTarget.style.boxShadow = "";
                          e.currentTarget.style.zIndex = "";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          {co && (
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: cardFg, flexShrink: 0, letterSpacing: "-0.02em", boxShadow: "none" }}>
                              {initials(co.name)}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {co && <div style={{ fontSize: 12, fontWeight: 600, color: "inherit", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{co.name}</div>}
                            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 1 }}>Added {timeAgo(job.addedAt)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600, fontFamily: FONT_DISPLAY, color: "inherit", lineHeight: 1.2, marginBottom: 10, paddingTop: 8, paddingBottom: 16, letterSpacing: "-0.02em" }}>{job.title}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                          {(() => {
                            const pr = PRIORITIES.find((p) => p.id === (job.priority || "medium"));
                            return pr ? <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontFamily: FONT_TEXT, fontWeight: 600, borderLeft: `3px solid ${pr.color}`, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, letterSpacing: "-0.01em", boxSizing: "border-box", overflow: "hidden" }}>{pr.label}</span> : null;
                          })()}
                          {job.location && <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: FONT_TEXT, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, fontWeight: 500 }}>{job.location}</span>}
                          {job.salary && <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: FONT_TEXT, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, fontWeight: 500 }}>{job.salary}</span>}
                        </div>
                        {job.contact && (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9, display: "flex", alignItems: "center", gap: 5, letterSpacing: "-0.01em" }}>
                            <span style={{ fontSize: 10, opacity: 0.6 }}>●</span> {job.contact}
                          </div>
                        )}
                        {(() => {
                          const noteList = getNotesList(job);
                          if (noteList.length === 0) return null;
                          const latest = noteList[noteList.length - 1];
                          return (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: cardFg === "#ffffff" ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(0,0,0,0.08)", fontSize: 12, opacity: 0.9, lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                              {latest.text.slice(0, 60)}{latest.text.length > 60 ? "…" : ""}
                              {noteList.length > 1 && <span style={{ opacity: 0.8, fontWeight: 500 }}> · {noteList.length} notes</span>}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                  {(() => {
                    const dragSourceStatus = dragJobId ? jobStatus(jobs.find(j => j.id === dragJobId) || {}) : null;
                    const isDragging = !!dragJobId;
                    const isDropTarget = isDragging && dragSourceStatus !== st.id;
                    const isHovering = isOver;
                    if (isDragging && !isDropTarget) return null;
                    return (
                      <div
                        style={{
                          border: `2px dashed ${isHovering ? st.color : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                          borderRadius: 16,
                          padding: "20px 14px",
                          textAlign: "center",
                          color: isHovering ? st.color : T.textMuted,
                          fontSize: 14,
                          background: isHovering ? `${st.color}0a` : "transparent",
                          transition: "all 0.2s ease",
                          fontWeight: 500,
                          cursor: isDragging ? "default" : "pointer",
                        }}
                        onClick={isDragging ? undefined : () => { setNewJobStatus(st.id); setModal("addJob"); }}
                      >
                        {isDragging ? "Drop here" : "+ Add Job"}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
              </div>
            </div>
            </>
              );
            })()}

            {/* Table View */}
            {boardViewMode === "table" && (() => {
              const allFiltered = filterAndSortJobs(jobs);
              const statusOrder = STATUSES.reduce((acc, s, i) => { acc[s.id] = i; return acc; }, {});
              const getTableSortValue = (job, col) => {
                const co = getCompany(job.companyId);
                switch (col) {
                  case "company": return (co?.name ?? "").toLowerCase();
                  case "position": return (job.title ?? "").toLowerCase();
                  case "status": return statusOrder[jobStatus(job)] ?? -1;
                  case "priority": return priorityOrder[job.priority || "medium"] ?? 1;
                  case "applied": return job.applicationDate ? new Date(job.applicationDate).getTime() : 0;
                  case "added": return new Date(job.addedAt || 0).getTime();
                  case "salary": return (job.salary ?? "").toLowerCase();
                  case "location": return (job.location ?? "").toLowerCase();
                  case "contact": return (job.contact ?? "").toLowerCase();
                  case "link": return (job.link ?? "").toLowerCase();
                  default: return "";
                }
              };
              const tableSorted = [...allFiltered].sort((a, b) => {
                const va = getTableSortValue(a, tableSortColumn);
                const vb = getTableSortValue(b, tableSortColumn);
                const isNum = tableSortColumn === "status" || tableSortColumn === "priority" || tableSortColumn === "applied" || tableSortColumn === "added";
                let cmp = isNum ? (va - vb) : String(va).localeCompare(String(vb));
                return tableSortDir === "desc" ? -cmp : cmp;
              });
              const handleTableSort = (col) => {
                if (tableSortColumn === col) setTableSortDir(d => d === "asc" ? "desc" : "asc");
                else { setTableSortColumn(col); setTableSortDir("asc"); }
              };
              const cellPadding = 32;
              const pxPerChar = 9;
              const contentWidths = (() => {
                const w = {};
                TABLE_COLUMNS.forEach(c => {
                  const labelW = c.label.length * pxPerChar + cellPadding;
                  let contentW = c.label.length * pxPerChar;
                  if (c.id === "company") {
                    contentW = Math.max(contentW, companyColumnMinWidth - cellPadding);
                  } else if (c.id === "position") {
                    tableSorted.forEach(job => { contentW = Math.max(contentW, (job.title || "").length * pxPerChar); });
                    contentW = Math.min(contentW, 320);
                  } else if (c.id === "status") {
                    tableSorted.forEach(job => { const st = STATUSES.find(s => s.id === jobStatus(job)) || STATUSES[0]; contentW = Math.max(contentW, st.label.length * pxPerChar + 24); });
                  } else if (c.id === "priority") {
                    tableSorted.forEach(job => { const pr = PRIORITIES.find(p => p.id === (job.priority || "medium")); if (pr) contentW = Math.max(contentW, pr.label.length * pxPerChar + 24); });
                  } else if (c.id === "applied") {
                    tableSorted.forEach(job => { const s = job.applicationDate ? formatDate(job.applicationDate) : "—"; contentW = Math.max(contentW, s.length * pxPerChar); });
                  } else if (c.id === "added") {
                    tableSorted.forEach(job => { contentW = Math.max(contentW, timeAgo(job.addedAt).length * pxPerChar); });
                  } else if (c.id === "location") {
                    tableSorted.forEach(job => { const val = job.location || "—"; contentW = Math.max(contentW, String(val).length * pxPerChar); });
                    contentW = Math.min(contentW, 240);
                  } else if (c.id === "salary" || c.id === "contact") {
                    tableSorted.forEach(job => { const val = job[c.id] || "—"; contentW = Math.max(contentW, String(val).length * pxPerChar); });
                  } else if (c.id === "link") {
                    contentW = Math.max(contentW, 56);
                  }
                  w[c.id] = Math.max(labelW, contentW + cellPadding, c.id === "company" ? companyColumnMinWidth : 72);
                });
                return w;
              })();
              const getColumnWidth = (colId) => {
                const def = contentWidths[colId] ?? TABLE_COLUMNS.find(c => c.id === colId)?.defaultWidth ?? 100;
                const w = tableColumnWidths[colId] ?? def;
                return colId === "company" ? Math.max(w, companyColumnMinWidth) : w;
              };
              const thStyleBase = { padding: "12px 16px", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: isDark ? T.bg : T.surface, zIndex: 1 };
              const thClickStyle = { ...thStyleBase, cursor: "pointer", userSelect: "none" };
              const Th = ({ id, label }) => {
                const w = getColumnWidth(id);
                return (
                  <th
                    style={{ ...thClickStyle, minWidth: w, position: "relative", boxSizing: "border-box" }}
                    onClick={() => handleTableSort(id)}
                  >
                    {label}
                    {tableSortColumn === id && <span style={{ marginLeft: 4, display: "inline-flex", alignItems: "center" }}><ChevronIcon down={tableSortDir === "desc"} size={10} color={T.accent} /></span>}
                  </th>
                );
              };
              const getResizerLeft = (colId) => {
                let left = 0;
                for (const c of TABLE_COLUMNS) {
                  const cw = getColumnWidth(c.id);
                  if (c.id === colId) return left + cw;
                  left += cw;
                }
                return left;
              };
              const getTdStyle = (colId) => {
                const w = getColumnWidth(colId);
                return { padding: "12px 16px", fontSize: 13.5, color: T.text, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`, whiteSpace: "nowrap", minWidth: 0, width: w, overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em", boxSizing: "border-box" };
              };
              const tableMinWidth = TABLE_COLUMNS.reduce((s, c) => s + getColumnWidth(c.id), 0);
              return (
                <div style={{ overflow: "auto" }}>
                  <div style={{ position: "relative", display: "inline-block", minWidth: "100%" }}>
                    <table style={{ width: "100%", minWidth: tableMinWidth, borderCollapse: "collapse", tableLayout: "auto" }}>
                    <colgroup>
                      {TABLE_COLUMNS.map((c) => <col key={c.id} style={{ width: getColumnWidth(c.id) }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        {TABLE_COLUMNS.map((c) => <Th key={c.id} id={c.id} label={c.label} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {tableSorted.map(job => {
                        const co = getCompany(job.companyId);
                        const coColor = co ? getCompanyColorForDisplay(co) : T.textMuted;
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
                            <td style={getTdStyle("company")}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {co && (
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 7,
                                    background: isDark && isColorDark(coColor) ? "rgba(255,255,255,0.12)" : `${coColor}15`,
                                    border: isDark && isColorDark(coColor) ? "1px solid rgba(255,255,255,0.2)" : "none",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700,
                                    color: isDark && isColorDark(coColor) ? "#fff" : coColor,
                                    flexShrink: 0, boxShadow: "none",
                                  }}>
                                    {initials(co.name)}
                                  </div>
                                )}
                                <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>{co?.name || "—"}</span>
                              </div>
                            </td>
                            <td style={{ ...getTdStyle("position"), fontWeight: 600, whiteSpace: "normal", letterSpacing: "-0.02em" }}>{job.title}</td>
                            <td style={getTdStyle("status")}>
                              <span style={{
                                display: "inline-flex", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                background: `${st.color}15`, color: st.color,
                              }}>{st.label}</span>
                            </td>
                            <td style={getTdStyle("priority")}>
                              {pr && <span style={{ ...css.pill, borderLeft: `3px solid ${pr.color}`, fontSize: 12, fontWeight: 600, boxSizing: "border-box", overflow: "hidden" }}>{pr.label}</span>}
                            </td>
                            <td style={{ ...getTdStyle("applied"), color: T.textSec, fontSize: 13 }}>{job.applicationDate ? formatDate(job.applicationDate) : <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...getTdStyle("added"), color: T.textSec, fontSize: 13 }}>{timeAgo(job.addedAt)}</td>
                            <td style={{ ...getTdStyle("salary"), color: T.textSec, fontSize: 13 }}>{job.salary || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...getTdStyle("location"), color: T.textSec, fontSize: 13 }}>{job.location || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={{ ...getTdStyle("contact"), color: T.textSec, fontSize: 13 }}>{job.contact || <span style={{ color: T.textMuted }}>—</span>}</td>
                            <td style={getTdStyle("link")}>
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
                      {tableSorted.length === 0 && (
                        <tr>
                          <td colSpan={10} style={{ padding: "12px 16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`, textAlign: "center", color: T.textMuted, padding: 48, fontSize: 14, fontWeight: 500 }}>
                            No jobs match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                    {TABLE_COLUMNS.map((c) => {
                      const id = c.id;
                      const w = getColumnWidth(id);
                      const isHovered = hoveredResizerColumnId === id;
                      return (
                        <div
                          key={id}
                          role="separator"
                          aria-orientation="vertical"
                          style={{
                            position: "absolute",
                            left: getResizerLeft(id),
                            top: 0,
                            bottom: 0,
                            width: 8,
                            cursor: "col-resize",
                            zIndex: 2,
                            pointerEvents: "auto",
                            borderLeft: isHovered ? `2px solid ${T.accent}` : "2px solid transparent",
                            transition: "border-color 0.15s",
                          }}
                          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingColumn({ columnId: id, startX: e.clientX, startWidth: w }); }}
                          onMouseEnter={() => setHoveredResizerColumnId(id)}
                          onMouseLeave={() => setHoveredResizerColumnId(null)}
                        />
                      );
                    })}
                  </div>
                  </div>
                  <div style={{ display: "flex", gap: 20, padding: "14px 18px", fontSize: 13, color: T.textMuted }}>
                    <span>Count <strong style={{ color: T.text, fontWeight: 700 }}>{tableSorted.length}</strong></span>
                  </div>
                </div>
              );
            })()}

          </div>
        )}

        {/* Companies */}
        {view === "companies" && (
          <div style={{ flex: 1, padding: "20px 24px", paddingBottom: 72 }}>
            {companies.length === 0 ? (
              <div style={{ color: T.textMuted, fontSize: 14, padding: 48, fontWeight: 500, letterSpacing: "-0.01em" }}>No companies yet. Add a job to the board to get started.</div>
            ) : (
            <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
              {companies.map(co => {
                const coColor = getCompanyColorForDisplay(co);
                const cardFg = textOnColor(coColor);
                const coJobs = jobs.filter(j => j.companyId === co.id);
                const is = (field) => editing?.context === "company" && editing?.id === co.id && editing?.field === field;
                return (
                  <div key={co.id} style={{ ...css.card, display: "flex", flexDirection: "column", background: coColor, color: cardFg, border: "none", borderRadius: 16, padding: 22 }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: cardFg, flexShrink: 0, letterSpacing: "-0.02em", boxShadow: "none" }}>
                          {initials(co.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EditableField isEditing={is("name")} value={co.name} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "name", co.name)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Company name" displayStyle={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, color: cardFg, letterSpacing: "-0.02em" }} inputStyle={css.input} />
                          <EditableField isEditing={is("website")} value={co.website} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "website", co.website)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="website.com" emptyLabel="Add website" displayStyle={{ fontSize: 12, color: cardFg, opacity: 0.85 }} inputStyle={css.input} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <EditableField isEditing={is("description")} value={co.description} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "description", co.description)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Company description" multiline displayStyle={{ fontSize: 13, color: cardFg, opacity: 0.9, lineHeight: 1.6, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                      </div>
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
                        {[["Stage", "stage", null], ["Size", "size", " employees"]].map(([label, field, suffix]) => (
                          <div key={field}>
                            <div style={{ ...css.infoLabel, color: cardFg, opacity: 0.75 }}>{label}</div>
                            <EditableField isEditing={is(field)} value={co[field]} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, field, co[field])} onEditingChange={setEditingValue} onSave={saveEdit} placeholder={label} emptyLabel="—" displaySuffix={suffix} displayStyle={{ fontSize: 13, color: cardFg, fontWeight: 600, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ ...css.infoLabel, color: cardFg, opacity: 0.75 }}>Leaders</div>
                        <EditableField isEditing={is("designLeaders")} value={co.designLeaders} editingValue={editingValue} onStartEdit={() => startEdit("company", co.id, "designLeaders", co.designLeaders)} onEditingChange={setEditingValue} onSave={saveEdit} placeholder="Main leaders at the company" emptyLabel="—" displayStyle={{ fontSize: 13, color: cardFg, opacity: 0.9, letterSpacing: "-0.01em" }} inputStyle={css.input} />
                      </div>
                    </div>
                    <div style={{ borderTop: cardFg === "#ffffff" ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(0,0,0,0.1)", paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                      <span style={{ fontSize: 13, color: cardFg, opacity: 0.9, fontWeight: 500 }}>{coJobs.length} job{coJobs.length !== 1 ? "s" : ""} tracked</span>
                      <button style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a1a", border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONT_TEXT }} onClick={() => { setJobCoId(co.id); setModal("addJob"); }}>+ Add Job</button>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
            )}
          </div>
        )}

        {/* Footer: big Scout watermark; extends to very bottom of screen */}
        <div style={{
          width: "100%",
          flexShrink: 0,
          marginTop: "auto",
          background: T.bg,
          padding: "24px 0 0",
          overflow: "hidden",
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: "clamp(180px, 42vw, 520px)",
          lineHeight: 0.85,
          height: "0.72em",
        }}>
          <span style={{
            display: "block",
            width: "100%",
            letterSpacing: "-0.04em",
            color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)",
            whiteSpace: "nowrap",
            userSelect: "none",
            textAlign: "center",
          }}>Scout</span>
        </div>
          </div>
        </div>
      </div>

      {/* Bottom navigation (floating island) */}
      <div style={css.bottomNav.wrapper}>
        <div style={css.bottomNav.island}>
          <button type="button" style={css.bottomNav.navItem(view === "board")} onClick={() => setView("board")} title="Board">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            Board
          </button>
          <button type="button" style={css.bottomNav.navItem(view === "companies")} onClick={() => setView("companies")} title="Companies">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M2 20h20" /><path d="M5 20V8l7-4 7 4v12" /><path d="M9 20v-6h6v6" /></svg>
            Companies
          </button>
          <div style={css.bottomNav.navDivider} />
          <button type="button" style={css.bottomNav.themeBtn} onClick={toggleTheme} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            {isDark ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
          </button>
        </div>
      </div>

      {/* Kanban drag preview: pivots on the grab point as you drag */}
      {dragJobId && dragMouse != null && dragStartRect && dragGrabOffset && dragStartMouse && (() => {
        const job = jobs.find(j => j.id === dragJobId);
        if (!job) return null;
        const co = getCompany(job.companyId);
        const coColor = co ? getCompanyColorForDisplay(co) : T.textMuted;
        const cardFg = textOnColor(coColor);
        const angle = Math.atan2(dragMouse.y - dragStartMouse.y, dragMouse.x - dragStartMouse.x);
        const raw = angle * 0.22;
        const swingAngle = raw > 0 ? Math.min(0.18, raw) : Math.max(-0.12, raw);
        const pr = PRIORITIES.find(p => p.id === (job.priority || "medium"));
        return (
          <div
            style={{
              position: "fixed",
              left: dragMouse.x - dragGrabOffset.x,
              top: dragMouse.y - dragGrabOffset.y,
              width: dragStartRect.width,
              height: dragStartRect.height,
              transformOrigin: `${dragGrabOffset.x}px ${dragGrabOffset.y}px`,
              transform: `rotate(${swingAngle}rad)`,
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: isDark ? "0 24px 48px rgba(0,0,0,0.45)" : "0 24px 48px rgba(0,0,0,0.2)",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <div style={{ ...css.card, background: coColor, color: cardFg, border: "none", borderRadius: 20, padding: "20px", width: "100%", height: "100%", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                {co && (
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: cardFg, flexShrink: 0, letterSpacing: "-0.02em", boxShadow: "none" }}>
                    {initials(co.name)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {co && <div style={{ fontSize: 12, fontWeight: 600, color: "inherit", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{co.name}</div>}
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 1 }}>Added {timeAgo(job.addedAt)}</div>
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: FONT_DISPLAY, color: "inherit", lineHeight: 1.2, marginBottom: 10, paddingTop: 8, paddingBottom: 16, letterSpacing: "-0.02em" }}>{job.title}</div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                {pr && <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontFamily: FONT_TEXT, fontWeight: 600, borderLeft: `3px solid ${pr.color}`, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, letterSpacing: "-0.01em", boxSizing: "border-box", overflow: "hidden" }}>{pr.label}</span>}
                {job.location && <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: FONT_TEXT, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, fontWeight: 500 }}>{job.location}</span>}
                {job.salary && <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: FONT_TEXT, background: cardFg === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.65)", color: cardFg, fontWeight: 500 }}>{job.salary}</span>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Company Modal */}
      {modal === "addCo" && (
        <div className="scout-overlay" style={css.overlay} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="scout-modal" style={css.modal}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={css.modalTitle}>Add Company</div>
              <button type="button" onClick={() => { setModal(null); setCoName(""); setCoData(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1, color: T.textMuted }} aria-label="Close">×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={css.label}>Company Name</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={css.input} value={coName} onChange={e => setCoName(e.target.value)} placeholder="e.g. Stripe, Vercel, Figma..." onKeyDown={e => e.key === "Enter" && researchCompany()} />
                <button style={{ ...css.btn("primary"), whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }} onClick={researchCompany} disabled={loading || !coName.trim()}>
                  {loading ? <><Spinner /> Researching…</> : "✦ Research"}
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
                  {[["Stage", coData.stage], ["Size", coData.size], ["Design Team", coData.designTeamSize], ["Leaders", coData.designLeaders]].map(([k, v]) => (
                    <div key={k}><div style={css.infoLabel}>{k}</div><div style={css.infoVal}>{v || "—"}</div></div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}><div style={css.infoLabel}>Culture</div><div style={{ ...css.infoVal, fontStyle: "italic" }}>{coData.culture}</div></div>
              </div>
            )}

            {coData && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button style={css.btn("primary")} onClick={saveCompany}>Save Company</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Job Modal */}
      {modal === "addJob" && (() => {
        const closeAddJobModal = () => {
          setModal(null); setJobData(null); setJobDesc(""); setJobLink(""); setJobCoId(""); setJobInputMode("url"); setJobPriority("medium"); setFetchError(null); setImportStep(null); resetManualJobForm();
        };
        return (
        <div className="scout-overlay" style={css.overlay} onClick={e => e.target === e.currentTarget && closeAddJobModal()}>
          <div className="scout-modal" style={css.modal}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ ...css.modalTitle, marginBottom: 0 }}>Add Job</div>
              <button type="button" onClick={closeAddJobModal} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1, color: T.textMuted }} aria-label="Close">×</button>
            </div>
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 18, lineHeight: 1.45 }}>
              Import a job posting from a link, or fill in the details yourself.
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
              {[["url", "From URL"], ["manual", "Fill in details"]].map(([mode, label]) => (
                <button key={mode} onClick={() => { setJobInputMode(mode); setJobData(null); }} style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: 500, transition: "all 0.2s", fontFamily: FONT_TEXT,
                  background: jobInputMode === mode ? T.surface : "transparent",
                  color: jobInputMode === mode ? T.text : T.textSec,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {jobInputMode === "manual" ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={css.label}>Company</label>
                  <select value={manualCompanyId} onChange={e => { setManualCompanyId(e.target.value); setManualCompanyName(""); }} style={{ ...css.select, width: "100%", marginBottom: 6 }}>
                    <option value="">New company…</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!manualCompanyId && (
                    <input style={css.input} value={manualCompanyName} onChange={e => setManualCompanyName(e.target.value)} placeholder="Company name" />
                  )}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={css.label}>Job Title</label>
                  <input style={css.input} value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="e.g. Senior Product Designer" />
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={css.label}>Location</label>
                    <input style={css.input} value={manualLocation} onChange={e => setManualLocation(e.target.value)} placeholder="e.g. Remote, New York" />
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={css.label}>Salary</label>
                    <input style={css.input} value={manualSalary} onChange={e => setManualSalary(e.target.value)} placeholder="e.g. $120k – $150k" />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={css.label}>Description / Summary</label>
                  <textarea style={css.textarea} value={manualSummary} onChange={e => setManualSummary(e.target.value)} placeholder="Brief role description or paste a summary…" rows={3} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={css.label}>Application Date</label>
                  <input style={css.input} type="date" value={manualApplicationDate} onChange={e => setManualApplicationDate(e.target.value)} placeholder="e.g. 2025-03-01" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={css.label}>Contact</label>
                  <input style={css.input} value={manualContact} onChange={e => setManualContact(e.target.value)} placeholder="Name, email, or title" />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={css.label}>Priority</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PRIORITIES.map((pr) => (
                      <button key={pr.id} type="button" onClick={() => setManualPriority(pr.id)} style={{
                        ...css.btn("sec"), fontSize: 12, padding: "5px 11px",
                        borderColor: manualPriority === pr.id ? pr.color : T.border,
                        color: manualPriority === pr.id ? pr.color : T.textSec,
                        background: manualPriority === pr.id ? `${pr.color}18` : T.surface,
                      }}>{pr.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={css.btn("primary")} onClick={saveJobFromManual} disabled={!manualTitle.trim() || (!manualCompanyId && !manualCompanyName.trim())}>
                    Save Job
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={css.label}>Job Posting URL</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...css.input, border: fetchError ? `1px solid #f87171` : `1px solid ${T.border}` }}
                    value={jobLink}
                    onChange={e => { setJobLink(e.target.value); setJobData(null); setFetchError(null); }}
                    placeholder="e.g. https://stripe.com/jobs/listing/product-designer/..."
                    onKeyDown={e => e.key === "Enter" && extractFromUrl()}
                  />
                  <button style={{ ...css.btn("primary"), whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }} onClick={extractFromUrl} disabled={loading || !jobLink.trim()}>
                    {loading ? <><Spinner /> Importing…</> : <><span style={{ fontSize: 14 }}>✨</span> Import</>}
                  </button>
                </div>
                {loading && (
                  <div style={{ marginTop: 10, fontSize: 12, color: T.textSec, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: T.accent, animation: "pulse 1.2s infinite" }} />
                    {importStep === "ai" ? "Cleaning up with AI…" : "Scraping job posting…"}
                  </div>
                )}
                {fetchError === "blocked" && (
                  <div style={{ marginTop: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12.5, color: "#f87171", fontWeight: 500 }}>
                      {isLinkedInHost(jobLink) ? "LinkedIn requires login to view job postings." : "This site blocks external access."}
                    </div>
                  </div>
                )}
                {fetchError && fetchError !== "blocked" && (
                  <div style={{ marginTop: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12.5, color: "#f87171", fontWeight: 500, marginBottom: 4 }}>
                      {fetchError === "failed" ? "Couldn't find the job posting." : "Import failed"}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSec }}>
                      {fetchError === "failed"
                        ? "Couldn't reach or parse this page. The site may require login or block scraping."
                        : fetchError}
                    </div>
                  </div>
                )}
              </div>
            )}

            {jobData && jobInputMode !== "manual" && (
              <div style={{ ...css.infoBox, marginTop: 16 }}>
                {jobData._aiAssisted && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "5px 9px", background: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: 6, width: "fit-content" }}>
                    <span style={{ fontSize: 12 }}>✨</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.accent, letterSpacing: "-0.01em", fontFamily: FONT_TEXT }}>
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

            {jobInputMode !== "manual" && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                {jobData && <button style={css.btn("primary")} onClick={saveJob}>Save Job</button>}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Job Detail Modal */}
      {modal === "job" && activeJob && (() => {
        const detailCo = getCompany(activeJob.companyId);
        const detailCoColor = detailCo ? getCompanyColorForDisplay(detailCo) : T.accent;
        const closeJobModal = () => { setEditing(null); setModal(null); setJobDetailMenuOpen(false); };
        return (
        <div className="scout-overlay" style={css.overlay} onClick={e => { if (e.target === e.currentTarget) closeJobModal(); }}>
          <div className="scout-modal" style={{ ...css.modal, maxWidth: 600, overflow: "visible", padding: 0, borderTop: `4px solid ${detailCoColor}`, borderLeft: "none", borderRight: "none" }}>
            {/* Brand-color header: company, title, location, salary, actions — ends before description */}
            {(() => {
              const headerFg = textOnColor(detailCoColor);
              const headerFgMuted = headerFg === "#ffffff" ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.7)";
              const btnOnBrand = { background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: headerFg, textDecoration: "none", fontSize: 11.5, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontFamily: FONT_TEXT };
              return (
            <div style={{ background: detailCoColor, color: headerFg, padding: "20px 28px 32px", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            {/* Row 1: Company name + View Job, menu, close */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14, paddingBottom: 24 }}>
              {detailCo && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: headerFg, flexShrink: 0, boxShadow: "none" }}>
                    {initials(detailCo.name)}
                  </div>
                  <EditableField
                    isEditing={editing?.context === "company" && editing?.id === activeJob.companyId && editing?.field === "name"}
                    value={detailCo.name}
                    editingValue={editingValue}
                    onStartEdit={() => startEdit("company", activeJob.companyId, "name", detailCo.name)}
                    onEditingChange={setEditingValue}
                    onSave={saveEdit}
                    displayStyle={{ fontSize: 15, color: headerFg, fontWeight: 600, letterSpacing: "-0.01em" }}
                    inputStyle={{ ...css.input, background: T.surface, color: T.text }}
                  />
                </div>
              )}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: headerFgMuted, letterSpacing: "-0.01em", paddingRight: 4 }}>Added {timeAgo(activeJob.addedAt)}</span>
                {activeJob.link && (
                  <a href={activeJob.link} target="_blank" rel="noopener noreferrer" style={btnOnBrand}>↗ View Job</a>
                )}
                <div style={{ position: "relative" }}>
                  <button type="button" onClick={() => setJobDetailMenuOpen(o => !o)} style={{ ...btnOnBrand, padding: "8px 10px", fontSize: 16, lineHeight: 1 }} title="More actions">⋮</button>
                  {jobDetailMenuOpen && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setJobDetailMenuOpen(false)} aria-hidden="true" />
                      <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 140, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, zIndex: 99, padding: "6px 0", boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 8px 24px rgba(0,0,0,0.12)" }}>
                        <button type="button" onClick={() => { deleteJob(activeJob.id); setJobDetailMenuOpen(false); }} style={{ display: "block", width: "100%", padding: "10px 14px", fontSize: 13, color: "#FF3B30", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>Delete job</button>
                      </div>
                    </>
                  )}
                </div>
                <button type="button" onClick={closeJobModal} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1, color: headerFg, opacity: 0.9 }} aria-label="Close">×</button>
              </div>
            </div>
            {/* Row 2: Job title */}
            <div style={{ marginBottom: 8 }}>
              <EditableField
                isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "title"}
                value={activeJob.title}
                editingValue={editingValue}
                onStartEdit={() => startEdit("job", activeJob.id, "title", activeJob.title)}
                onEditingChange={setEditingValue}
                onSave={saveEdit}
                placeholder="Job title"
                displayStyle={{ fontSize: 22, fontWeight: 600, fontFamily: FONT_DISPLAY, color: headerFg, lineHeight: 1.25, letterSpacing: "-0.02em" }}
                inputStyle={{ ...css.input, background: T.surface, color: T.text }}
              />
            </div>
            {/* Row 3: Location · Salary */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", fontSize: 13, color: headerFgMuted }}>
              <EditableField
                isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "location"}
                value={activeJob.location}
                editingValue={editingValue}
                onStartEdit={() => startEdit("job", activeJob.id, "location", activeJob.location)}
                onEditingChange={setEditingValue}
                onSave={saveEdit}
                placeholder="Location"
                displayStyle={{ fontSize: 13, color: headerFgMuted }}
                inputStyle={{ ...css.input, background: T.surface, color: T.text }}
              />
              <span style={{ opacity: 0.7 }}>·</span>
              <EditableField
                isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "salary"}
                value={activeJob.salary}
                editingValue={editingValue}
                onStartEdit={() => startEdit("job", activeJob.id, "salary", activeJob.salary)}
                onEditingChange={setEditingValue}
                onSave={saveEdit}
                placeholder="Salary"
                displayStyle={{ fontSize: 13, color: headerFgMuted }}
                inputStyle={{ ...css.input, background: T.surface, color: T.text }}
              />
            </div>
            </div>
              );
            })()}

            <div style={{ padding: "0 28px 0", position: "relative" }}>
            <div style={{ marginTop: 24, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              {editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "summary" ? (
                <textarea
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onBlur={saveEdit}
                  placeholder="Summary"
                  rows={3}
                  style={{ ...css.input, minHeight: 56, resize: "vertical", width: "100%", display: "block" }}
                />
              ) : (
                <div
                  onClick={e => { e.stopPropagation(); startEdit("job", activeJob.id, "summary", activeJob.summary); }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "currentColor"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}
                  style={{ fontSize: 13, color: T.textSec, lineHeight: 1.65, cursor: "pointer", borderRadius: 4, padding: "2px 6px", margin: "-2px -6px", border: "1px solid transparent", transition: "border-color 0.15s" }}
                >
                  {activeJob.summary ? (
                    <div className="job-summary-html" style={{ fontFamily: FONT_TEXT }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeJob.summary) }} />
                  ) : (
                    <span style={{ color: T.textMuted }}>Add summary…</span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1 }}>
                <label style={css.label}>Application Date</label>
                <EditableField
                  isEditing={editing?.context === "job" && editing?.id === activeJob.id && editing?.field === "applicationDate"}
                  value={activeJob.applicationDate ? formatDate(activeJob.applicationDate) : ""}
                  editingValue={editingValue}
                  onStartEdit={() => startEdit("job", activeJob.id, "applicationDate", activeJob.applicationDate ? String(activeJob.applicationDate).slice(0, 10) : "")}
                  onEditingChange={setEditingValue}
                  onSave={saveEdit}
                  placeholder="e.g. 2025-03-01"
                  emptyLabel="Not set"
                  displayStyle={{ fontSize: 13, color: T.text }}
                  inputStyle={css.input}
                  inputType="date"
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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <textarea
                    style={{ ...css.textarea, minHeight: 56, resize: "vertical", flex: 1 }}
                    value={newNoteInput}
                    onChange={e => setNewNoteInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(activeJob.id, newNoteInput); setNewNoteInput(""); } }}
                    placeholder="Add a note (Interview notes, prep, gut feelings, dates to remember...)"
                    rows={2}
                  />
                  <button type="button" style={css.btn("primary")} onClick={() => { addNote(activeJob.id, newNoteInput); setNewNoteInput(""); }} disabled={!newNoteInput.trim()}>Add</button>
                </div>
              </div>
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
