/**
 * Curated interview-process payloads for companies where AI + web search
 * is often wrong or too generic. Matched on normalized company name.
 */

function normalizeInterviewCompanyName(name) {
  if (!name || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const ADOBE_INTERVIEW = {
  intensity: 4,
  rounds: "4+",
  timeline: "3–6 weeks",
  caseStudy: false,
  stages: [
    "Recruiter interview",
    "Hiring manager interview",
    "Portfolio presentation",
    "5 one-on-one interviews (craft, strategy, leadership, Adobe values)",
  ],
  summary:
    "Adobe typically runs recruiter and hiring manager screens, a portfolio presentation, then multiple one-on-one interviews focused on craft, strategy, leadership, and Adobe values.",
};

/** @returns {typeof ADOBE_INTERVIEW | null} */
export function getInterviewProcessOverride(companyName) {
  const n = normalizeInterviewCompanyName(companyName);
  const first = n.split(/\s+/)[0] || "";
  if (first === "adobe") return { ...ADOBE_INTERVIEW };
  return null;
}
