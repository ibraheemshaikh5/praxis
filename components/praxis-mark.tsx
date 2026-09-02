import * as React from "react";

// The bull head: favicon, sidebar tile, and other small surfaces.
export function PraxisMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 64 64" {...props}>
      <path
        d="M10 44 L14 30 L17 24 L7 16 Q2 9 2 1 Q6 11 13 17 L19 19 L24 20 L27 18 L23 8 Q23 3 25 -1 Q27 8 31 12 L35 15 C42 18 47 24 49 31 C51 38 49 45 44 49 C40 52 35 52 32 50 L21 57 L13 55 L13 46 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// The full charging figure: login and other large surfaces.
export function PraxisBull(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" {...props}>
      <path d="M77 15 L63 3" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        d="M10 62 L13 50 L16 43 L7 35 Q1 26 1 15 Q5 27 12 36 L18 38 L21 35 L23 33 L15 19 Q13 10 14 3 Q20 15 25 24 L27 28 C34 22 40 14 46 10 C50 12 53 14 56 16 Q66 10 72 13 Q82 15 84 22 L82 32 Q90 42 94 56 L95 62 L87 65 L79 48 L74 46 C66 50 58 52 48 56 L50 70 L42 70 L42 60 L38 62 L34 68 L30 80 L21 80 L25 66 L28 62 L18 67 L8 73 L2 68 L5 62 Z"
        fill="currentColor"
      />
    </svg>
  );
}
