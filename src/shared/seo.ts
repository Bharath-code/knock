export type Guide = { slug: string; role: string; title: string; description: string; intro: string; steps: string[]; example: string; mistake: string };

const g = (role: string, slug: string, intro: string, steps: string[], example: string, mistake: string): Guide => ({
  slug,
  role,
  title: `How to apply to a ${role} referral post on X`,
  description: `A short guide to answering a ${role} referral post on X: what to put in the DM, a sample message, and a common mistake to avoid.`,
  intro,
  steps,
  example,
  mistake,
});

export const GUIDES: Guide[] = [
  g("software engineer", "software-engineer-referral-post-x",
    "Engineers who post referrals read dozens of DMs. The ones that get an answer show working code in the first two lines.",
    ["Name the stack the post asked for and your years with it.", "Link one repo or demo that matches the post, not your whole profile.", "State one measurable result, such as latency cut or users served.", "End with a single question they can answer yes or no."],
    "Hi Sam, 5 yrs of Go and Postgres. I cut p95 on our billing API from 800 ms to 120 ms: github.com/me/billing. Open to a 15 minute call this week?",
    "Pasting a resume and writing 'any opening works'. The poster cannot tell which role you mean."),
  g("product designer", "product-designer-referral-post-x",
    "Design referrers want to see taste and process quickly, and a PDF attachment in a DM is rarely opened.",
    ["Link one case study that fits their product area.", "Say what you owned: research, flows, UI or all three.", "Mention the outcome in one number, such as sign-up lift.", "Offer a portfolio password only if you have one, in the same message."],
    "Hi Maya, product designer, 4 yrs in fintech. I redesigned onboarding at Ledgr and lifted completion from 52% to 71%: me.design/ledgr. Is the role open to remote?",
    "Sending a link to a portfolio homepage with twelve projects and no pointer to the relevant one."),
  g("data scientist", "data-scientist-referral-post-x",
    "Posts for data roles often come from a team lead who wants evidence you ship models, not only notebooks.",
    ["Say which problem type you have solved: forecasting, ranking, NLP or experimentation.", "Name the tools in the post and one dataset size you handled.", "Link a write-up or repo with results, not just code.", "Ask whether the team needs more modeling or more analysis."],
    "Hi Ravi, data scientist, 3 yrs on ranking models. I raised click-through 9% on 40M daily events: github.com/me/rank-eval. Is the team mostly modeling or analytics?",
    "Listing every library you have imported. A short list of what shipped is more convincing."),
  g("product manager", "product-manager-referral-post-x",
    "Product referrers look for clear writing, so the DM itself is your first work sample.",
    ["Open with the product area you have run and the size of the team.", "Give one decision you made with the trade-off in a clause.", "Include a number tied to a launch.", "Keep it under five lines; brevity signals prioritisation."],
    "Hi Lena, PM for 4 yrs on marketplaces. I cut a launch scope by a third to ship in 6 weeks and it reached 20k sellers. Notes: me.pm/launch. Is the role growth or core product?",
    "Describing responsibilities instead of decisions. 'Managed roadmap' says nothing about judgment."),
  g("devops engineer", "devops-engineer-referral-post-x",
    "Infrastructure leads care about reliability and cost, and they scan for specific tooling.",
    ["Match the cloud and orchestration tools named in the post.", "State a reliability or cost result, such as uptime or monthly savings.", "Link a public module, runbook or write-up if you have one.", "Ask about on-call load, since it decides if the role fits you."],
    "Hi Dev, 6 yrs on AWS and Terraform. I moved 40 services to ECS and cut the bill 28%: me.dev/ecs-migration. What does on-call look like on the team?",
    "Claiming every tool. Naming ten platforms makes the two you know well hard to find."),
  g("frontend engineer", "frontend-engineer-referral-post-x",
    "Frontend referrers will open a link, so give them something live they can click in ten seconds.",
    ["Link a deployed app or a short screen recording.", "Name the framework from the post and your years with it.", "Mention one performance or accessibility result.", "Say whether you want product work or design-system work."],
    "Hi Ana, 4 yrs of React and TypeScript. Live demo of a dashboard that scores 98 on Lighthouse: dash.me. Is the team on product features or a design system?",
    "Linking a repo with no live demo. Many reviewers will not clone and run it."),
  g("backend engineer", "backend-engineer-referral-post-x",
    "Backend hiring posts tend to mention scale, so show you have worked with similar load.",
    ["Quote a throughput, data size or latency figure from your work.", "Name the language and database the post lists.", "Link a design note or open source change, not a toy project.", "Ask how the team handles migrations or incidents."],
    "Hi Tom, 5 yrs of Java and Kafka. I built an ingest pipeline at 30k events per second: me.dev/ingest. How does the team handle schema changes?",
    "Skipping scale. 'Built REST APIs' fits half the applicants and tells the poster nothing."),
  g("mobile engineer", "mobile-engineer-referral-post-x",
    "Mobile referrers want to see an app in a store, because store links prove you shipped.",
    ["Link your App Store or Play Store page.", "Say iOS, Android or cross-platform, as the post does.", "Share one number such as downloads or crash-free rate.", "Mention any release process you owned."],
    "Hi Priya, 4 yrs of Swift. My habit tracker has 60k installs and 99.7% crash-free sessions: apps.apple.com/app/me. Is the role iOS only?",
    "Sending screenshots only. A store link lets them check ratings and update history."),
  g("technical writer", "technical-writer-referral-post-x",
    "Writing roles are judged on the message itself, so typos and padding cost more than in any other role.",
    ["Link two published docs, one tutorial and one reference.", "Name the tools: docs-as-code, OpenAPI, static site generators.", "Say who the readers were, for example developers or admins.", "Keep the DM free of filler and proofread it twice."],
    "Hi Jo, technical writer, 5 yrs on API docs. I rewrote the auth guide and support tickets on it dropped 35%: docs.me/auth. Do you write in Markdown in the repo?",
    "Describing yourself as a strong communicator while the message has errors. Show it instead."),
  g("sales engineer", "sales-engineer-referral-post-x",
    "Sales engineering posts want technical depth and a clear sense of how you work with customers.",
    ["Mention the product category you have demoed and the buyers you met.", "Give a deal size or win rate if you can share it.", "Link a recorded demo or a public talk.", "Ask about the split between pre-sales calls and proofs of concept."],
    "Hi Chris, sales engineer, 4 yrs in observability. I ran demos for 30 enterprise deals and closed $2M in a year: me.dev/demo. How many calls per week does the role cover?",
    "Leading with job titles and no deal context. The poster cannot judge your scope."),
];

export const guideBySlug = (slug: string) => GUIDES.find((x) => x.slug === slug);

export const sitemapXml = (origin: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "/check", "/guides", ...GUIDES.map((x) => `/guides/${x.slug}`)]
    .map((p) => `<url><loc>${origin}${p}</loc></url>`)
    .join("")}</urlset>\n`;

export const robotsTxt = (origin: string) => `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${origin}/sitemap.xml\n`;
