import * as React from "react";

// Side-profile bull based on the lowered-head silhouette used across the brand.
// The horns are solid so they remain distinct from the ear and muzzle at 24px.
const BULL_OUTLINE =
  "M32 85 C30 78 27 72 24 67 C21 62 21 56 23 48 L27 32 C35 25 42 15 49 8 C54 3 59 6 64 10 C74 18 82 30 91 39 C98 45 105 48 112 48 C119 48 123 45 122 38 C121 31 117 25 119 16 C120 10 123 6 128 4 C124 8 123 13 123 18 C123 25 127 31 127 38 C128 47 123 54 114 55 C108 56 103 54 99 52 C106 61 109 72 110 84 C106 87 106 91 106 95 L99 93 C99 84 97 76 93 70 C89 63 84 62 78 65 L68 72 C64 79 62 87 62 95 C58 93 54 93 50 95 C51 88 52 83 55 78 L55 72";

const BULL_DETAILS = [
  // Head, neck, and planted foreleg.
  "M27 32 C25 41 22 51 22 59 C22 65 25 69 28 74 L32 85 C35 87 38 87 41 85 C41 78 41 74 46 71 C50 69 51 66 51 61",
  // Hooves and body details remain separate from the neck.
  "M21 84 C25 83 28 83 32 85 L30 94 C26 93 23 93 19 92 C20 88 20 86 21 84",
  "M50 95 C54 92 58 92 62 95",
  // Belly, rear leg, and hoof.
  "M68 72 C72 70 75 67 78 65",
  "M78 65 C76 74 75 84 75 94 C70 92 66 92 62 95",
  "M99 93 C102 91 104 91 106 95",
];

const BULL_HORNS = [
  // Long near horn, swept forward like the supplied reference.
  "M7 70 C15 63 21 56 22 49 C22 45 24 42 28 41 C29 51 23 63 7 70 Z",
  // Far horn, visible behind the lowered head.
  "M28 69 C34 61 37 54 36 47 C36 44 38 41 41 41 C45 48 42 57 28 69 Z",
];

function Bull(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 132 100" {...props}>
      <path
        d={BULL_OUTLINE}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
      {BULL_DETAILS.map((d) => (
        <path
          d={d}
          fill="none"
          key={d}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
        />
      ))}
      {BULL_HORNS.map((d) => (
        <path d={d} fill="currentColor" key={d} />
      ))}
    </svg>
  );
}

export function PraxisBull(props: React.SVGProps<SVGSVGElement>) {
  return <Bull {...props} />;
}

export function PraxisMark(props: React.SVGProps<SVGSVGElement>) {
  return <Bull {...props} />;
}
