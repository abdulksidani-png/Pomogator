export type Mood = 'idle' | 'focus' | 'quiz' | 'happy' | 'rest' | 'cheer';

const INK = '#3A1D22';

/** Tomato buddy, shown in the Tomato theme. Its face follows the timer. */
export function Mascot({ mood }: { mood: Mood }) {
  return (
    <svg className="mascot" viewBox="0 0 120 124" data-mood={mood}>
      <ellipse cx="60" cy="117" rx="32" ry="5" fill="var(--sunk)" />
      <g className="m-bob">
        <path d="M60 30C90 29 108 50 106 75c-2 24-21 37-46 37S16 99 14 75C12 50 30 31 60 30z" fill="var(--accent)" />
        <path d="M28 58c3-11 12-19 23-21" fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 33c-6-6-15-8-22-6 5 3 10 6 14 9-7 0-14 3-17 8 7-1 15-1 23-4 8 3 16 3 23 4-3-5-10-8-17-8 4-3 9-6 14-9-7-2-16 0-22 6z" fill="var(--margin)" />
        <rect x="57.5" y="14" width="5" height="18" rx="2.5" fill="var(--margin)" />
        <ellipse cx="37" cy="83" rx="7" ry="4.5" fill="#FF9AA6" opacity=".75" />
        <ellipse cx="83" cy="83" rx="7" ry="4.5" fill="#FF9AA6" opacity=".75" />
        <g className="v v-idle v-quiz v-cheer" fill={INK}>
          <ellipse cx="46" cy="71" rx="4.5" ry="6" /><ellipse cx="74" cy="71" rx="4.5" ry="6" />
          <circle cx="47.5" cy="68.5" r="1.6" fill="#FFFFFF" /><circle cx="75.5" cy="68.5" r="1.6" fill="#FFFFFF" />
        </g>
        <g className="v v-focus" fill={INK}>
          <ellipse cx="46" cy="72" rx="4.5" ry="5" /><ellipse cx="74" cy="72" rx="4.5" ry="5" />
          <path d="M39 62l13 3M81 62l-13 3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className="v v-happy" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round"><path d="M40 72q6-7 12 0M68 72q6-7 12 0" /></g>
        <g className="v v-rest" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round"><path d="M40 70q6 6 12 0M68 70q6 6 12 0" /></g>
        <path className="v v-idle v-cheer" d="M52 85q8 8 16 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path className="v v-focus" d="M54 88h12" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <ellipse className="v v-quiz" cx="60" cy="88" rx="4" ry="5" fill={INK} />
        <path className="v v-happy" d="M49 83q11 15 22 0z" fill={INK} />
        <path className="v v-rest" d="M55 87q5 3 10 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <g className="v v-rest" fill="var(--fg-3)"><text x="96" y="30" fontSize="14">z</text><text x="106" y="18" fontSize="10">z</text></g>
      </g>
    </svg>
  );
}
