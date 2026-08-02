"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Companies are typed by hand, so there is no identifier to look a logo up by.
 * Guessing the domain from the name gets the common case right ("Capital One"
 * to capitalone.com) and simply fails to a monogram when it does not, which is
 * why the fallback has to be presentable rather than an error state.
 */
const DOMAIN_OVERRIDES: Record<string, string> = {
  bofa: "bankofamerica.com",
  bankofamerica: "bankofamerica.com",
  google: "google.com",
  googleearlydirect: "google.com",
  meta: "meta.com",
  x: "x.com",
  jpmorgan: "jpmorganchase.com",
  jpmc: "jpmorganchase.com",
  goldman: "goldmansachs.com",
  goldmansachs: "goldmansachs.com",
};

function normalizeCompany(company: string) {
  return (
    company
      .toLowerCase()
      // Drop parenthetical qualifiers like "Google (early/direct)".
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]/g, "")
  );
}

export function companyDomain(company: string) {
  const normalized = normalizeCompany(company);
  if (!normalized) return null;
  return DOMAIN_OVERRIDES[normalized] ?? `${normalized}.com`;
}

function monogram(company: string) {
  const letter = company.trim()[0];
  return letter ? letter.toUpperCase() : "?";
}

export function CompanyLogo({
  className,
  company,
}: {
  className?: string;
  company: string;
}) {
  const domain = companyDomain(company);
  // Keyed by domain rather than a boolean, so typing a new company retries
  // without an effect to reset it.
  const [failedDomain, setFailedDomain] = React.useState<string | null>(null);
  const failed = domain !== null && failedDomain === domain;

  const shell = cn(
    "grid size-5 shrink-0 place-items-center overflow-hidden rounded-[5px]",
    className,
  );

  if (!company.trim()) {
    return <span aria-hidden className={cn(shell, "bg-muted/60")} />;
  }

  if (!domain || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          shell,
          "bg-secondary text-[9px] font-semibold text-secondary-foreground",
        )}
      >
        {monogram(company)}
      </span>
    );
  }

  return (
    /* A third-party favicon endpoint on a guessed domain: next/image would
       proxy and cache every wrong guess for no benefit. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden
      className={cn(shell, "object-contain")}
      height={20}
      key={domain}
      loading="lazy"
      onError={() => setFailedDomain(domain)}
      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`}
      width={20}
    />
  );
}
