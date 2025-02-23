// lib/ai/tools/infer-domains.ts
import { cache } from 'react'; // Next.js server-side caching

// In-memory cache for company -> logo mappings
const logoCache = new Map<string, string>();

// Guess a domain from a company name (basic heuristic)
function guessDomain(company: string): string {
  const normalized = company.toLowerCase().replace(/\s+/g, '');
  return `${normalized}.com`; // Could be improved with a real lookup service
}

// Fetch logo URL from Clearbit
async function fetchLogoUrl(domain: string): Promise<string> {
  const url = `https://logo.clearbit.com/${domain}`;
  try {
    const response = await fetch(url, { method: 'HEAD' }); // Check if logo exists
    return response.ok ? url : 'unknown';
  } catch (error) {
    console.error(`Failed to fetch logo for ${domain}:`, error);
    return 'unknown';
  }
}

// Cached inferDomains function
export const inferDomains = cache(async (companies: string[]): Promise<Record<string, string>> => {
  const results: Record<string, string> = {};

  for (const company of companies) {
    if (!company || typeof company !== 'string') continue;

    // Check cache first
    if (logoCache.has(company)) {
      results[company] = logoCache.get(company)!;
      continue;
    }

    // Guess domain and fetch logo
    const domain = guessDomain(company);
    const logoUrl = await fetchLogoUrl(domain);

    // Cache the result
    logoCache.set(company, logoUrl);
    results[company] = logoUrl;
  }

  return results;
});
