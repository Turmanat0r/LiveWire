import type { ReactNode } from 'react';

// How to pose the fish on the bump board, drawn over the live camera and,
// before it opens, on its own: nose against the stop, the mouth and tail
// uncovered (red), one hand mid-body behind the gill flap (blue). Every line
// and word has a dark edge, so it reads over a red board in full sun. "Other"
// fish get a plain frame instead.

const EDGE = 'rgba(0,0,0,0.78)';
const WHITE = '#FFFFFF';
const RED = '#FF6F5E';
const RED_FILL = 'rgba(224,55,37,0.42)';
const BLUE = '#5EB4FF';
const GREEN = '#7FDCA8';
const GREEN_FILL = 'rgba(95,174,133,0.34)';
const FISH = '#4FD2E8';

/** Shapes drawn twice: a wide dark edge, then the colour on top. */
function Outlined({
  color,
  width,
  fill = 'none',
  dash,
  children,
}: {
  readonly color: string;
  readonly width: number;
  readonly fill?: string;
  readonly dash?: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <g fill="none" stroke={EDGE} strokeWidth={width + 3.5}>
        {children}
      </g>
      <g fill={fill} stroke={color} strokeWidth={width} strokeDasharray={dash}>
        {children}
      </g>
    </>
  );
}

function Label({
  x,
  y,
  color,
  anchor = 'start',
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      stroke={EDGE}
      strokeWidth="4.5"
      paintOrder="stroke"
      textAnchor={anchor}
      fontFamily="sans-serif"
      fontSize="16"
      fontWeight="800"
      letterSpacing="0.4"
    >
      {children}
    </text>
  );
}

/** The fish faces left, nose at the stop; its tail fin is drawn separately. */
const BODY =
  'M34 152 C 60 130, 110 122, 170 124 C 228 126, 272 136, 300 146 L 300 158 C 272 168, 228 178, 170 180 C 110 182, 60 174, 34 152 Z';
const TAIL = 'M300 146 L 344 122 L 332 152 L 344 182 L 300 158 Z';
const MOUTH = 'M34 152 C 44 141, 54 136, 66 133 L 66 171 C 54 168, 44 163, 34 152 Z';
const GILL = 'M92 131 C 103 145, 103 160, 92 175';
/** A right hand laid across the fish, fingers up, thumb toward the tail. */
const HAND =
  'M168 238 L 168 198 C 159 189, 157 176, 157 164 L 157 114 A 6 6 0 0 1 169 114 L 169 140 L 171 140 ' +
  'L 171 104 A 6 6 0 0 1 183 104 L 183 140 L 185 140 L 185 102 A 6 6 0 0 1 197 102 L 197 140 L 199 140 ' +
  'L 199 110 A 6 6 0 0 1 211 110 L 211 160 L 236 147 A 6.5 6.5 0 0 1 241 158 L 214 179 ' +
  'C 211 188, 208 194, 206 198 L 206 238 Z';

export function BoardGuide({ species }: { readonly species: string }) {
  if (species === 'Other') {
    return (
      <svg
        className="vf-guide"
        viewBox="0 0 400 300"
        aria-hidden="true"
        focusable="false"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Outlined color={FISH} width={3}>
          <rect x="50" y="80" width="300" height="140" rx="8" />
        </Outlined>
        <Label x={200} y={244} color={WHITE} anchor="middle">
          WHOLE FISH INSIDE THE BOX
        </Label>
      </svg>
    );
  }
  return (
    <svg
      className="vf-guide"
      viewBox="0 0 400 300"
      aria-hidden="true"
      focusable="false"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The board, its ruler, and the stop the nose goes against. */}
      <Outlined color={WHITE} width={1.5} dash="6,5">
        <rect x="22" y="106" width="358" height="96" />
      </Outlined>
      <Outlined color={WHITE} width={1.5}>
        <path d="M22 186 H 380" />
        {[60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map((x, i) => (
          <path key={x} d={`M${String(x)} 186 V ${i % 2 === 0 ? '198' : '193'}`} />
        ))}
      </Outlined>
      <Outlined color={WHITE} width={5}>
        <path d="M28 100 V 208" />
      </Outlined>

      {/* No cover: the mouth and the tail. */}
      <path d={MOUTH} fill={RED_FILL} />
      <path d={TAIL} fill={RED_FILL} />

      <Outlined color={FISH} width={3}>
        <path d={BODY} />
        <path d="M140 125 L 156 106 L 200 108 L 204 126" />
        <path d="M216 128 L 236 114 L 266 120 L 262 137" />
        <path d="M120 172 L 132 188 L 156 182" />
      </Outlined>
      <Outlined color={RED} width={3}>
        <path d={TAIL} />
        <path d="M66 134 V 170" />
      </Outlined>
      <circle cx="54" cy="146" r="4.5" fill={FISH} stroke={EDGE} strokeWidth="2" />

      {/* The gill flap: the hand stays behind it, never under it. */}
      <Outlined color={BLUE} width={3.5} dash="7,5">
        <path d={GILL} />
      </Outlined>

      {/* Where the hand goes: across the middle of the fish. */}
      <Outlined color={GREEN} width={2.5} fill={GREEN_FILL}>
        <path d={HAND} />
      </Outlined>

      <Label x={24} y={94} color={RED}>
        MOUTH CLEAR
      </Label>
      <Label x={378} y={94} color={RED} anchor="end">
        TAIL CLEAR
      </Label>
      <Label x={22} y={226} color={WHITE}>
        NOSE TO STOP
      </Label>
      <Label x={214} y={228} color={GREEN}>
        HAND HERE
      </Label>
    </svg>
  );
}

/** The rules the drawing shows, in words. */
export function PoseRules() {
  return (
    <ol className="pose-rules">
      <li>
        <b>Nose against the stop</b>, fish flat on the board.
      </li>
      <li>
        <b>Mouth and tail uncovered</b> (red), the whole tail in the photo.
      </li>
      <li>
        <b>One hand mid-body, behind the gill flap</b> (blue line), never under it.
      </li>
      <li>
        <b>Board numbers readable</b> along the fish.
      </li>
    </ol>
  );
}
