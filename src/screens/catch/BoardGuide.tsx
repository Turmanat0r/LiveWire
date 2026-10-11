// Drawn over the live camera: where the fish goes on the bump board. Red
// hatching is where hands must not be (the nose at the stop, the tail, the
// ruler); green is where to hold. The old app's guide, line for line. The
// walleye outline shows only for walleye; any other scored species gets the
// board without it, and "Other" a plain frame.

export function BoardGuide({ species }: { readonly species: string }) {
  if (species === 'Other') {
    return (
      <svg className="vf-guide" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
        <rect
          x="60"
          y="70"
          width="280"
          height="160"
          fill="none"
          stroke="#4FD2E8"
          strokeWidth="3"
          rx="8"
        />
        <g stroke="#4FD2E8" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M60 96 L60 70 L86 70" />
          <path d="M314 70 L340 70 L340 96" />
          <path d="M340 204 L340 230 L314 230" />
          <path d="M86 230 L60 230 L60 204" />
        </g>
        <text x="200" y="252" fill="#fff" fontSize="13" fontFamily="sans-serif" textAnchor="middle">
          frame the whole fish inside the box
        </text>
      </svg>
    );
  }
  return (
    <svg className="vf-guide" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id="no-hands"
          width="8"
          height="8"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="8" height="8" fill="rgba(224,55,37,0.13)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(224,55,37,0.75)" strokeWidth="2.5" />
        </pattern>
      </defs>
      {/* The board, and its ruler. */}
      <rect
        x="34"
        y="112"
        width="336"
        height="82"
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />
      <rect
        x="34"
        y="176"
        width="336"
        height="18"
        fill="rgba(255,255,255,0.07)"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1"
      />
      <g stroke="rgba(255,255,255,0.65)" strokeWidth="1.5">
        {[70, 106, 142, 178, 214, 250, 286, 322].map((x, i) => (
          <line key={x} x1={x} y1="176" x2={x} y2={i % 2 === 0 ? 188 : 184} />
        ))}
      </g>
      {/* No hands: the nose at the stop, and the tail. */}
      <rect
        x="34"
        y="112"
        width="52"
        height="82"
        fill="url(#no-hands)"
        stroke="#E03725"
        strokeWidth="2"
      />
      <rect
        x="300"
        y="112"
        width="70"
        height="82"
        fill="url(#no-hands)"
        stroke="#E03725"
        strokeWidth="2"
      />
      <line
        x1="44"
        y1="104"
        x2="44"
        y2="200"
        stroke="#E03725"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {species === 'Walleye' ? (
        <g>
          <g
            fill="none"
            stroke="#4FD2E8"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M46 152 C 74 134, 118 128, 168 130 C 222 132, 268 140, 296 149 L 330 132 L 321 152 L 330 172 L 296 155 C 268 164, 222 172, 168 174 C 118 176, 74 170, 46 152 Z" />
            <path d="M150 129 L 166 112 L 205 114 L 208 131" />
            <path d="M222 133 L 240 120 L 268 124 L 264 139" />
            <path d="M120 160 L 132 174 L 154 170" />
            <path d="M86 138 C 92 150, 92 155, 86 166" />
          </g>
          <circle cx="64" cy="147" r="4.5" fill="#4FD2E8" />
        </g>
      ) : null}
      {/* Hold here: mid-body, behind the gill plate. */}
      <rect
        x="100"
        y="112"
        width="190"
        height="82"
        fill="rgba(95,174,133,0.10)"
        stroke="#5FAE85"
        strokeWidth="2"
        strokeDasharray="7,5"
      />
      <g fontFamily="sans-serif" fontWeight="700">
        <text x="60" y="106" fill="#E03725" fontSize="11" textAnchor="middle">
          NO HANDS
        </text>
        <text x="335" y="106" fill="#E03725" fontSize="11" textAnchor="middle">
          NO HANDS
        </text>
        <text x="195" y="106" fill="#5FAE85" fontSize="11" textAnchor="middle">
          HOLD HERE
        </text>
        <text x="44" y="214" fill="#fff" fontSize="10" textAnchor="middle">
          NOSE TO STOP
        </text>
        <text x="335" y="214" fill="#fff" fontSize="10" textAnchor="middle">
          TAIL IN FRAME
        </text>
      </g>
    </svg>
  );
}
