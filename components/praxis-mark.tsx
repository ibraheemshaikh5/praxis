import * as React from "react";

// Charging bull drawn as tapered calligraphic strokes on a 100-unit grid.
const BULL_STROKES = [
  // back: crest over hump to rump
  "M27 26 C 34 12 44 8 53 12 C 64 17 73 27 79 38 C 71 27 62 19 52 16 C 44 13 35 17 30 29 Z",
  // face
  "M27 26 C 21 34 17 45 16 57 C 20 46 24 36 31 29 Z",
  // muzzle
  "M16 57 C 15 62 16 66 19 69 C 17 65 17 61 18 56 Z",
  // jaw
  "M21 71 C 27 76 35 79 44 79 C 35 74 28 72 23 68 Z",
  // horn
  "M27 29 C 20 28 14 24 12 17 C 13 12 16 9 21 8 C 17 11 15 14 16 18 C 18 23 23 27 29 31 Z",
  // ear
  "M19 34 C 15 38 13 43 14 48 C 16 43 18 39 21 36 Z",
  // tail
  "M77 39 C 83 33 86 26 86 18 C 87 12 89 6 94 2 C 86 7 83 13 84 20 C 84 28 81 34 76 41 Z",
  // front legs and hooves
  "M32 78 C 29 83 26 87 22 91 C 27 85 29 81 29 77 Z",
  "M38 79 C 37 84 36 88 35 92 C 35 87 35 82 36 78 Z",
  "M21 91 L 29 91 L 27.5 95.5 L 19.5 95.5 Z",
  "M34 92 L 41 92 L 40 96 L 33 96 Z",
  // belly
  "M44 80 C 51 78 58 74 63 68 C 58 77 51 81 44 82 Z",
  // hind leg and hoof
  "M75 60 C 75 68 75 76 77 85 C 72 76 71 68 71 60 Z",
  "M64 68 C 64 73 66 79 68 84 C 64 79 62 73 62 69 Z",
  "M67 85 L 76.5 85 L 76.5 90.5 L 65.5 90.5 Z",
];

function Bull({
  weight,
  ...props
}: React.SVGProps<SVGSVGElement> & { weight?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" {...props}>
      {BULL_STROKES.map((d) => (
        <path
          d={d}
          fill="currentColor"
          key={d}
          stroke={weight ? "currentColor" : undefined}
          strokeLinejoin={weight ? "round" : undefined}
          strokeWidth={weight}
        />
      ))}
    </svg>
  );
}

// Display weight: login and other large surfaces (40px and up).
export function PraxisBull(props: React.SVGProps<SVGSVGElement>) {
  return <Bull weight={1} {...props} />;
}

// Bold cut of the same strokes: sidebar tile and other small surfaces.
export function PraxisMark(props: React.SVGProps<SVGSVGElement>) {
  return <Bull weight={2.2} {...props} />;
}
