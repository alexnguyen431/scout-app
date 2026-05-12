const ASHBY_GRAPHQL_URL = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting";
const ASHBY_BOARD_API = "https://api.ashbyhq.com/posting-api/job-board";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const ASHBY_BOARD_BY_HOST = {
  "superhuman.com": "Superhuman Platform Inc",
  "www.superhuman.com": "Superhuman Platform Inc",
};

export const ASHBY_COMPANY_DISPLAY_NAME = {
  "Superhuman Platform Inc": "Superhuman",
};

export function getAshbyJobId(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    return u.searchParams.get("ashby_jid") || u.searchParams.get("ashbyJid") || null;
  } catch {
    return null;
  }
}

export function resolveAshbyBoardSlugFromUrl(url) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    const host = u.hostname.toLowerCase();
    if (host === "jobs.ashbyhq.com") {
      const slug = u.pathname.split("/").filter(Boolean)[0];
      return slug ? decodeURIComponent(slug) : null;
    }
    return ASHBY_BOARD_BY_HOST[host] || null;
  } catch {
    return null;
  }
}

function displayCompanyName(boardSlug) {
  if (!boardSlug) return null;
  return ASHBY_COMPANY_DISPLAY_NAME[boardSlug] || boardSlug;
}

async function fetchAshbyBoardJob(boardSlug, jobId) {
  const res = await fetch(`${ASHBY_BOARD_API}/${encodeURIComponent(boardSlug)}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
      Referer: "https://jobs.ashbyhq.com/",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.jobs || []).find((j) => j.id === jobId || (j.jobUrl && j.jobUrl.includes(jobId))) || null;
}

async function fetchAshbyGraphQLJob(boardSlug, jobId) {
  const query = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
    jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
      title
      locationName
      workplaceType
      descriptionHtml
      compensationTierSummary
    }
  }`;
  const res = await fetch(ASHBY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": BROWSER_UA,
      Referer: `https://jobs.ashbyhq.com/${encodeURIComponent(boardSlug)}`,
    },
    body: JSON.stringify({
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: boardSlug, jobPostingId: jobId },
      query,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.jobPosting || null;
}

export async function fetchAshbyJobPosting(boardSlug, jobId) {
  if (!boardSlug || !jobId) throw new Error("Missing Ashby board or job id");

  const boardJob = await fetchAshbyBoardJob(boardSlug, jobId);
  if (boardJob) {
    return {
      title: boardJob.title,
      companyName: displayCompanyName(boardSlug),
      location: boardJob.location || boardJob.workplaceType || "Remote",
      salary: boardJob.compensationTierSummary || null,
      raw: boardJob.descriptionHtml || boardJob.descriptionPlain || "",
    };
  }

  const graphJob = await fetchAshbyGraphQLJob(boardSlug, jobId);
  if (!graphJob) throw new Error("Job not found in Ashby board");

  return {
    title: graphJob.title,
    companyName: displayCompanyName(boardSlug),
    location: graphJob.locationName || graphJob.workplaceType || "Remote",
    salary: graphJob.compensationTierSummary || null,
    raw: graphJob.descriptionHtml || "",
  };
}
