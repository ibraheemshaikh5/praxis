import { z } from "zod";

export type JobPosting = { company: string | null; title: string | null };

/** Reads a job posting's company and title from its page. */
export type PostingReader = (url: string) => Promise<JobPosting>;

const SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

// The agent has about 45 seconds for the whole text, so a slow page is
// abandoned well inside that and the agent can still ask for the details.
const SCRAPE_TIMEOUT_MS = 25_000;

const EXTRACTION_PROMPT =
  "This is a job posting. Extract the hiring company's name and the job title exactly as the posting states them. Use null for anything the page does not state; do not guess from the URL.";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    company: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
  },
  required: ["company", "title"],
};

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    json: z
      .object({
        company: z.string().nullish(),
        title: z.string().nullish(),
      })
      .nullish(),
  }),
});

export class PostingUnreadableError extends Error {}

/**
 * A reader backed by Firecrawl's scrape endpoint with JSON extraction.
 * Fails with PostingUnreadableError when the page cannot be fetched or the
 * response is not what was asked for.
 */
export function firecrawlPostingReader(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): PostingReader {
  return async (url) => {
    let response: Response;
    try {
      response = await fetchImpl(SCRAPE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          onlyMainContent: true,
          timeout: SCRAPE_TIMEOUT_MS - 2_000,
          formats: [
            {
              type: "json",
              prompt: EXTRACTION_PROMPT,
              schema: EXTRACTION_SCHEMA,
            },
          ],
        }),
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PostingUnreadableError(
        `Could not reach the posting: ${describe(error)}`,
      );
    }

    if (!response.ok) {
      throw new PostingUnreadableError(
        `Firecrawl answered ${response.status} for the posting`,
      );
    }

    const parsed = responseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new PostingUnreadableError("Firecrawl returned no posting details");
    }

    const json = parsed.data.data.json;
    return { company: clean(json?.company), title: clean(json?.title) };
  };
}

function clean(value: string | null | undefined) {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function describe(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "timed out";
  }
  return error instanceof Error ? error.message : String(error);
}
