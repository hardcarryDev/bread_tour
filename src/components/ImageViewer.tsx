import { useEffect, useRef } from 'react';

export interface ViewerImage {
  url: string;
  alt?: string;
}

interface ImageViewerProps {
  images: ViewerImage[];
  // The currently shown image (index into `images`).
  index: number;
  onClose: () => void;
  // Emits the next index to show. The viewer is controlled, so the parent owns
  // the current index and re-renders with the new value.
  onIndexChange: (next: number) => void;
}

// Minimum horizontal travel (px) for a touch swipe to count as prev/next.
const SWIPE_THRESHOLD = 40;

// Full-screen lightbox overlay for viewing menu photos in-app (mobile-friendly,
// replaces the old "open image in a new tab" behavior). Controlled component:
// the parent holds `index` and supplies `onIndexChange` / `onClose`. Renders
// nothing when there are no images.
export default function ImageViewer({
  images,
  index,
  onClose,
  onIndexChange,
}: ImageViewerProps) {
  const touchStartX = useRef<number | null>(null);
  const count = images.length;
  // Clamp so an out-of-range index (e.g. after a delete) still shows something.
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
  const hasMany = count > 1;

  // Wrap-around navigation. No-op when there is 0/1 image.
  function goPrev() {
    if (!hasMany) return;
    onIndexChange((safeIndex - 1 + count) % count);
  }
  function goNext() {
    if (!hasMany) return;
    onIndexChange((safeIndex + 1) % count);
  }

  // Keyboard: Escape closes, Left/Right navigate. Listener lives for the
  // lifetime of the open viewer and is torn down on unmount.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'ArrowRight') {
        goNext();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // safeIndex/count drive goPrev/goNext; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, count]);

  // Lock background scroll while open; restore the prior value on unmount so we
  // never clobber a scroll lock set by some other overlay.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (count === 0) return null;

  const current = images[safeIndex];

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx > 0) goPrev();
    else goNext();
  }

  return (
    <div
      className="image-viewer-overlay"
      role="dialog"
      aria-modal="true"
      data-testid="image-viewer"
      // Backdrop click closes — but only when the click landed on the overlay
      // itself, not bubbled up from the image or controls.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        className="image-viewer-close"
        aria-label="이미지 닫기"
        data-testid="image-viewer-close"
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>

      {hasMany && (
        <button
          type="button"
          className="image-viewer-nav image-viewer-prev"
          aria-label="이전 사진"
          data-testid="image-viewer-prev"
          onClick={goPrev}
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}

      <img
        className="image-viewer-img"
        data-testid="image-viewer-img"
        src={current.url}
        alt={current.alt ?? ''}
      />

      {hasMany && (
        <button
          type="button"
          className="image-viewer-nav image-viewer-next"
          aria-label="다음 사진"
          data-testid="image-viewer-next"
          onClick={goNext}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}

      {hasMany && (
        <span className="image-viewer-counter" data-testid="image-viewer-counter">
          {safeIndex + 1} / {count}
        </span>
      )}
    </div>
  );
}
