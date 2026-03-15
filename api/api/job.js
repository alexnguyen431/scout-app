export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { searchParams } = new URL(req.url);
  const ats = searchParams.get("ats");
  const company = searchParams.get("company");
  const jobId = searchParams.get("jobId");

  if (!ats || !company || !jobId) {
    return new Response(JSON.stringify({ error: "Missing ats, company, or jobId" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    let apiUrl, result;

    if (ats === "greenhouse") {
      apiUrl = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}?content=true`;
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`Greenhouse returned ${res.status}`);
      const data = await res.json();
      result = {
        title: data.title,
        companyName: company,
        location: data.location?.name || "Remote",
        content: data.content || "",
      };

    } else if (ats === "lever") {
      apiUrl = `https://api.lever.co/v0/postings/${company}/${jobId}`;
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`Lever returned ${res.status}`);
      const data = await res.json();
      result = {
        title: data.text,
        companyName: company,
        location: data.categories?.location || data.categories?.allLocations?.[0] || "Remote",
        content: [data.description, data.descriptionBody, ...(data.lists || []).map(l => l.content)].join(" "),
      };

    } else if (ats === "ashby") {
      apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}`;
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`Ashby returned ${res.status}`);
      const data = await res.json();
      const job = (data.jobs || []).find(j => j.id === jobId || (j.jobUrl && j.jobUrl.includes(jobId)));
      if (!job) throw new Error("Job not found in Ashby board");
      result = {
        title: job.title,
        companyName: company,
        location: job.location || job.workplaceType || "Remote",
        content: [job.descriptionHtml, job.descriptionPlain].filter(Boolean).join(" "),
      };

    } else {
      return new Response(JSON.stringify({ error: `Unknown ATS: ${ats}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Strip HTML tags from content
    result.content = result.content.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
