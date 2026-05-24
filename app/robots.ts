import type { MetadataRoute } from "next";

// Customer funnels at /r/<slug> ARE public landing pages — letting Google
// crawl them is intentional. Owners want their Google Business profile
// links to surface in search. Everything else is private surface area.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/r/"],
        disallow: ["/dashboard", "/admin", "/api", "/auth"],
      },
    ],
  };
}
