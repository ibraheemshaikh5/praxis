import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBuildNoteSchema,
  dispatchBuildNotesSchema,
  updateBuildNoteSchema,
} from "@/lib/build-notes/contracts";
import {
  DispatchError,
  DispatchNotConfiguredError,
  DispatchRateLimitedError,
} from "@/lib/build-notes/errors";
import { fireRoutine, isDispatchConfigured } from "@/lib/build-notes/dispatch";
import { composeDispatchPrompt } from "@/lib/build-notes/prompt";

const FIRE_URL =
  "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEF/fire";

describe("build note contracts", () => {
  it("trims bodies and defaults priority to P2", () => {
    expect(
      createBuildNoteSchema.parse({
        pageKey: "/applications",
        body: "  Add status filters  ",
      }),
    ).toEqual({
      pageKey: "/applications",
      body: "Add status filters",
      priority: "p2",
    });
  });

  it("rejects page keys that are not routes and bodies past the limit", () => {
    expect(() =>
      createBuildNoteSchema.parse({ pageKey: "applications", body: "Filter" }),
    ).toThrow();
    expect(() =>
      createBuildNoteSchema.parse({
        pageKey: "/applications",
        body: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("refuses an empty update and a hand-set dispatched status", () => {
    expect(() => updateBuildNoteSchema.parse({})).toThrow();
    expect(() =>
      updateBuildNoteSchema.parse({ status: "dispatched" }),
    ).toThrow();
    expect(updateBuildNoteSchema.parse({ status: "done" })).toEqual({
      status: "done",
    });
  });

  it("requires at least one note id to dispatch", () => {
    expect(() =>
      dispatchBuildNotesSchema.parse({ pageKey: "/planner", noteIds: [] }),
    ).toThrow();
  });
});

describe("dispatch prompt composition", () => {
  const notes = [
    { body: "Ship the empty state", priority: "p2" as const },
    { body: "Fix the crash on save", priority: "p0" as const },
    { body: "Tighten the week strip", priority: "p1" as const },
  ];

  it("groups notes by priority, most urgent first", () => {
    const prompt = composeDispatchPrompt({ notes, pageKey: "/planner" });

    expect(prompt).toContain("# Build notes for /planner");
    expect(prompt).toContain("vertical slice");
    expect(prompt.indexOf("## P0")).toBeLessThan(prompt.indexOf("## P1"));
    expect(prompt.indexOf("## P1")).toBeLessThan(prompt.indexOf("## P2"));
    expect(prompt).toContain("1. Fix the crash on save");
    // P3 has no notes, so it gets no heading.
    expect(prompt).not.toContain("## P3");
  });

  it("numbers each priority group from one", () => {
    const prompt = composeDispatchPrompt({
      notes: [
        { body: "First blocker", priority: "p0" as const },
        { body: "Second blocker", priority: "p0" as const },
      ],
      pageKey: "/planner",
    });

    expect(prompt).toContain("1. First blocker");
    expect(prompt).toContain("2. Second blocker");
  });

  it("flattens multi-line bodies so one note stays one list item", () => {
    const prompt = composeDispatchPrompt({
      notes: [{ body: "Add a view\n  then wire the toggle", priority: "p1" }],
      pageKey: "/planner",
    });

    expect(prompt).toContain("1. Add a view then wire the toggle");
  });

  it("refuses to compose an empty dispatch", () => {
    expect(() =>
      composeDispatchPrompt({ notes: [], pageKey: "/planner" }),
    ).toThrow();
  });
});

describe("routine dispatch", () => {
  beforeEach(() => {
    process.env.CLAUDE_ROUTINE_FIRE_URL = FIRE_URL;
    process.env.CLAUDE_ROUTINE_TOKEN = "sk-ant-oat01-test";
  });

  afterEach(() => {
    delete process.env.CLAUDE_ROUTINE_FIRE_URL;
    delete process.env.CLAUDE_ROUTINE_TOKEN;
    vi.unstubAllGlobals();
  });

  it("reports configuration only when both variables are set", () => {
    expect(isDispatchConfigured()).toBe(true);

    delete process.env.CLAUDE_ROUTINE_TOKEN;
    expect(isDispatchConfigured()).toBe(false);
  });

  it("sends the beta headers and returns the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          claude_code_session_id: "session_01HJKL",
          claude_code_session_url: "https://claude.ai/code/session_01HJKL",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await fireRoutine("# Build notes for /planner");

    expect(session).toEqual({
      sessionId: "session_01HJKL",
      sessionUrl: "https://claude.ai/code/session_01HJKL",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FIRE_URL);
    expect(init.headers["anthropic-beta"]).toBe(
      "experimental-cc-routine-2026-04-01",
    );
    expect(init.headers.authorization).toBe("Bearer sk-ant-oat01-test");
    expect(JSON.parse(init.body)).toEqual({
      text: "# Build notes for /planner",
    });
  });

  it("refuses a fire URL pointing anywhere but the routine endpoint", async () => {
    // The bearer token rides in a header, so a mistyped host would leak it.
    process.env.CLAUDE_ROUTINE_FIRE_URL = "https://example.com/fire";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fireRoutine("notes")).rejects.toBeInstanceOf(
      DispatchNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a missing token before making a request", async () => {
    delete process.env.CLAUDE_ROUTINE_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fireRoutine("notes")).rejects.toBeInstanceOf(
      DispatchNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a rate limited routine to its own error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );

    await expect(fireRoutine("notes")).rejects.toBeInstanceOf(
      DispatchRateLimitedError,
    );
  });

  it("maps a rejected token to a dispatch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );

    await expect(fireRoutine("notes")).rejects.toBeInstanceOf(DispatchError);
  });

  it("rejects a response missing the session fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ type: "routine_fire" }), {
          status: 200,
        }),
      ),
    );

    await expect(fireRoutine("notes")).rejects.toBeInstanceOf(DispatchError);
  });
});
