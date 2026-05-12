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

/** From Superhuman’s published interview process (design roles). */
const SUPERHUMAN_INTERVIEW = {
  intensity: 4,
  rounds: "4",
  timeline: "Varies by role",
  caseStudy: true,
  stages: [
    "Recruiter call — intro with recruiter (30 min)",
    "Hiring manager interview (45 min)",
    "Virtual onsite I: portfolio presentation (1 hr)",
    "Virtual onsite II: design exercise (1 hr)",
    "Virtual onsite II: collaboration & product sense (45 min)",
    "Virtual onsite II: user research (45 min)",
  ],
  summary:
    "Superhuman’s design interview track starts with a recruiter intro, a hiring manager screen, then two virtual onsites: a one-hour portfolio presentation followed by a second onsite with a design exercise, collaboration and product sense, and user research sessions.",
};

/** @returns {typeof ADOBE_INTERVIEW | null} */
export function getInterviewProcessOverride(companyName) {
  const n = normalizeInterviewCompanyName(companyName);
  const first = n.split(/\s+/)[0] || "";
  if (first === "adobe") return { ...ADOBE_INTERVIEW };
  if (first === "superhuman") return { ...SUPERHUMAN_INTERVIEW };
  return null;
}
