// Section heading with a small leading icon (멤버 / 장소 / 스탬프). The icon is
// decorative (aria-hidden) so the heading's accessible name stays the text only.

import type { ReactNode } from 'react';

type SectionIcon = 'members' | 'spots' | 'stamps';

const ICON_PATHS: Record<SectionIcon, ReactNode> = {
  // Users / 멤버
  members: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  // Map pin / 장소
  spots: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  // Stamp / 스탬프
  stamps: (
    <>
      <path d="M5 22h14" />
      <path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z" />
      <path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 2 1 2 1 3.5V13" />
    </>
  ),
};

export default function SectionTitle({
  icon,
  children,
}: {
  icon: SectionIcon;
  children: ReactNode;
}) {
  return (
    <h2 className="section-title">
      <svg
        className="section-title-icon"
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICON_PATHS[icon]}
      </svg>
      <span>{children}</span>
    </h2>
  );
}
