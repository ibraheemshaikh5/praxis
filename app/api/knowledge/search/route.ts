import { NextResponse } from "next/server";

import { parseQuery, routeError } from "@/lib/api/routes";
import { bookSearchSchema } from "@/lib/knowledge/contracts";
import { searchBookCandidates } from "@/lib/knowledge/resolve";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

/**
 * The picker reads the catalogue before anything is written, so the owner
 * chooses which book the title meant. Archive identifiers stay on the server:
 * they are how the PDF is found at save time, not something the client picks.
 */
export async function GET(request: Request) {
  try {
    await requireAuthenticatedUserId();
    const { title } = parseQuery(request, bookSearchSchema);
    const candidates = await searchBookCandidates(title);

    return NextResponse.json({
      candidates: candidates.map((candidate) => ({
        workKey: candidate.workKey,
        title: candidate.title,
        author: candidate.author,
        firstPublishYear: candidate.firstPublishYear,
        editionCount: candidate.editionCount,
        covers: candidate.covers,
      })),
    });
  } catch (error) {
    return routeError(error);
  }
}
