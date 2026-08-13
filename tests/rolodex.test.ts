import { describe, expect, it } from "vitest";

import {
  createConnectionSchema,
  createMeetingSchema,
  updateConnectionSchema,
  updateMeetingSchema,
} from "@/lib/rolodex/contracts";
import {
  daysBetween,
  elapsedLabel,
  formatCalendarDate,
  metLabel,
  todayCalendarDate,
} from "@/lib/rolodex/dates";
import {
  linkedInProfile,
  nameFromHandle,
  parseConnectionInput,
  xProfile,
} from "@/lib/rolodex/entry";
import {
  buildEnrichmentUrl,
  parseEnrichedProfile,
  readEnrichmentConfig,
} from "@/lib/rolodex/provider";

describe("rolodex entry", () => {
  it("reads a pasted profile link as a LinkedIn profile", () => {
    expect(
      parseConnectionInput("  https://www.linkedin.com/in/ada-lovelace/  "),
    ).toEqual({
      kind: "linkedin",
      handle: "ada-lovelace",
      url: "https://www.linkedin.com/in/ada-lovelace",
    });
  });

  it("reduces every form of one profile to the same link", () => {
    const canonical = "https://www.linkedin.com/in/ada-lovelace";

    for (const input of [
      "linkedin.com/in/ada-lovelace",
      "http://linkedin.com/in/ada-lovelace",
      "https://uk.linkedin.com/in/ada-lovelace",
      "https://www.linkedin.com/in/ada-lovelace/?originalSubdomain=uk",
      "https://www.linkedin.com/in/ada-lovelace/details/experience/",
    ]) {
      expect(linkedInProfile(input)?.url).toBe(canonical);
    }
  });

  it("keeps a typed name a name", () => {
    expect(parseConnectionInput("Ada Lovelace")).toEqual({
      kind: "name",
      name: "Ada Lovelace",
    });
    // A company page and a job posting are not people.
    expect(parseConnectionInput("linkedin.com/company/acme")).toEqual({
      kind: "name",
      name: "linkedin.com/company/acme",
    });
    expect(parseConnectionInput("linkedin.com/in/")).toEqual({
      kind: "name",
      name: "linkedin.com/in/",
    });
  });

  it("rejects a look-alike host", () => {
    expect(linkedInProfile("https://linkedin.com.evil.test/in/ada")).toBeNull();
    expect(linkedInProfile("https://notlinkedin.com/in/ada")).toBeNull();
  });

  it("reads a name off the handle and drops the registration suffix", () => {
    expect(nameFromHandle("ada-lovelace")).toBe("Ada Lovelace");
    expect(nameFromHandle("ada-lovelace-8a12b3")).toBe("Ada Lovelace");
    expect(nameFromHandle("ada-lovelace-123456")).toBe("Ada Lovelace");
    // One trailing digit is part of the name people chose, not a suffix.
    expect(nameFromHandle("ada-lovelace2")).toBe("Ada Lovelace2");
    expect(nameFromHandle("8a12b3")).toBeNull();
  });
});

describe("x profiles", () => {
  it("reduces a handle and every link form to one account", () => {
    for (const input of [
      "ada",
      "@ada",
      "  @ada  ",
      "x.com/ada",
      "https://twitter.com/ada",
      "https://mobile.twitter.com/ada",
      "http://www.x.com/ada",
    ]) {
      expect(xProfile(input)?.url).toBe("https://x.com/ada");
    }
  });

  it("rejects a post, a look-alike host, and an impossible handle", () => {
    expect(xProfile("https://x.com/ada/status/1")).toBeNull();
    expect(xProfile("https://x.com.evil.test/ada")).toBeNull();
    expect(xProfile("ada lovelace")).toBeNull();
    expect(xProfile("averyverylonghandlename")).toBeNull();
    expect(xProfile("")).toBeNull();
  });
});

describe("rolodex dates", () => {
  it("counts whole days between calendar dates", () => {
    expect(daysBetween("2026-08-01", "2026-08-09")).toBe(8);
    expect(daysBetween("2026-08-09", "2026-08-01")).toBe(-8);
    // Across a daylight saving boundary, where an instant subtraction is off
    // by an hour.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("says how long ago in the terms the answer is wanted in", () => {
    expect(elapsedLabel("2026-08-09", "2026-08-09")).toBe("Today");
    expect(elapsedLabel("2026-08-08", "2026-08-09")).toBe("Yesterday");
    expect(elapsedLabel("2026-08-06", "2026-08-09")).toBe("3 days ago");
    expect(elapsedLabel("2026-08-01", "2026-08-09")).toBe("1 week ago");
    expect(elapsedLabel("2026-07-20", "2026-08-09")).toBe("2 weeks ago");
    expect(elapsedLabel("2026-05-01", "2026-08-09")).toBe("May 1, 2026");
    // A date logged ahead of today is stated rather than counted.
    expect(elapsedLabel("2026-08-11", "2026-08-09")).toBe("Aug 11, 2026");
  });

  it("reads a calendar date as the day it names, not as an instant", () => {
    expect(formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(todayCalendarDate(new Date(2026, 7, 9, 23, 30))).toBe("2026-08-09");
  });

  it("falls back to the date before the browser reports its own day", () => {
    expect(metLabel("2026-08-09", null)).toBe("Aug 9, 2026");
    expect(metLabel("2026-08-09", "2026-08-09")).toBe("Today");
  });
});

describe("rolodex contracts", () => {
  it("takes a link or a name from one field", () => {
    expect(
      createConnectionSchema.parse({ input: "  Ada Lovelace  " }).input,
    ).toBe("Ada Lovelace");
    expect(createConnectionSchema.safeParse({ input: "" }).success).toBe(false);
  });

  it("requires a field to update and a version to update against", () => {
    expect(
      updateConnectionSchema.safeParse({ expectedVersion: 1 }).success,
    ).toBe(false);
    expect(
      updateConnectionSchema.safeParse({ notes: null, expectedVersion: 1 })
        .success,
    ).toBe(true);
    expect(
      updateConnectionSchema.safeParse({ name: "Ada", expectedVersion: 0 })
        .success,
    ).toBe(false);
  });

  it("stores a contact link in its canonical form whatever was typed", () => {
    const parsed = updateConnectionSchema.parse({
      linkedinUrl: "linkedin.com/in/ada-lovelace/",
      xUrl: "@ada",
      email: "  Ada@Example.test  ",
      phone: "+1 (555) 010-1234",
      expectedVersion: 1,
    });

    expect(parsed).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
      xUrl: "https://x.com/ada",
      email: "Ada@Example.test",
      phone: "+1 (555) 010-1234",
    });
  });

  it("clears a contact field with null and refuses a bad one", () => {
    expect(
      updateConnectionSchema.parse({ email: null, expectedVersion: 1 }).email,
    ).toBeNull();
    expect(
      updateConnectionSchema.safeParse({ email: "ada@", expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      updateConnectionSchema.safeParse({
        linkedinUrl: "https://example.test/ada",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      updateConnectionSchema.safeParse({ phone: "  ", expectedVersion: 1 })
        .success,
    ).toBe(false);
  });

  it("only accepts a real calendar day for a meeting", () => {
    expect(createMeetingSchema.safeParse({ metOn: "2026-08-09" }).success).toBe(
      true,
    );
    expect(createMeetingSchema.safeParse({ metOn: "2026-02-30" }).success).toBe(
      false,
    );
    expect(createMeetingSchema.safeParse({ metOn: "9 Aug 2026" }).success).toBe(
      false,
    );
    expect(updateMeetingSchema.safeParse({}).success).toBe(false);
  });
});

describe("enrichment provider", () => {
  const env = {
    ROLODEX_ENRICHMENT_URL: "https://api.example.test/person?profile={url}",
    ROLODEX_ENRICHMENT_KEY: "secret",
  };

  it("is unconfigured until both the endpoint and the key are set", () => {
    expect(readEnrichmentConfig({})).toBeNull();
    expect(
      readEnrichmentConfig({
        ROLODEX_ENRICHMENT_URL: env.ROLODEX_ENRICHMENT_URL,
      }),
    ).toBeNull();
    expect(
      readEnrichmentConfig({ ROLODEX_ENRICHMENT_KEY: "secret" }),
    ).toBeNull();
  });

  it("refuses an endpoint that cannot carry the profile", () => {
    expect(
      readEnrichmentConfig({
        ...env,
        ROLODEX_ENRICHMENT_URL: "https://api.example.test/person",
      }),
    ).toBeNull();
    expect(
      readEnrichmentConfig({
        ...env,
        ROLODEX_ENRICHMENT_URL: "http://api.example.test/person?profile={url}",
      }),
    ).toBeNull();
  });

  it("sends the key as a bearer token unless another header is named", () => {
    expect(readEnrichmentConfig(env)).toEqual({
      endpoint: env.ROLODEX_ENRICHMENT_URL,
      headerName: "authorization",
      headerValue: "Bearer secret",
    });

    expect(
      readEnrichmentConfig({ ...env, ROLODEX_ENRICHMENT_HEADER: "X-Api-Key" }),
    ).toEqual({
      endpoint: env.ROLODEX_ENRICHMENT_URL,
      headerName: "x-api-key",
      headerValue: "secret",
    });
  });

  it("puts the profile into the endpoint template encoded", () => {
    expect(
      buildEnrichmentUrl(
        env.ROLODEX_ENRICHMENT_URL,
        "https://www.linkedin.com/in/ada-lovelace",
      ),
    ).toBe(
      "https://api.example.test/person?profile=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fada-lovelace",
    );
  });

  it("reads a wrapped record under the field names providers use", () => {
    expect(
      parseEnrichedProfile({
        status: 200,
        data: {
          full_name: "Ada  Lovelace",
          job_title: "Founding Engineer",
          job_company_name: "Analytical Engines",
          location_name: "London, England",
          profile_pic_url: "https://cdn.example.test/ada.jpg",
        },
      }),
    ).toEqual({
      name: "Ada Lovelace",
      headline: null,
      company: "Analytical Engines",
      role: "Founding Engineer",
      location: "London, England",
      avatarUrl: "https://cdn.example.test/ada.jpg",
    });
  });

  it("reads a flat record and a nested company alike", () => {
    expect(
      parseEnrichedProfile({
        name: "Ada Lovelace",
        headline: "Building engines",
        company: { name: "Analytical Engines" },
        avatar: "not-a-url",
      }),
    ).toEqual({
      name: "Ada Lovelace",
      headline: "Building engines",
      company: "Analytical Engines",
      role: null,
      location: null,
      avatarUrl: null,
    });
  });

  it("reads nothing out of a response that carries none of it", () => {
    const empty = {
      name: null,
      headline: null,
      company: null,
      role: null,
      location: null,
      avatarUrl: null,
    };

    expect(parseEnrichedProfile(null)).toEqual(empty);
    expect(parseEnrichedProfile("not json")).toEqual(empty);
    expect(parseEnrichedProfile({ data: [] })).toEqual(empty);
  });
});
