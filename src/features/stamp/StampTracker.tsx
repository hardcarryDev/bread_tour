// GPS tracking control surface (SPEC-BREADTOUR-001 / NFR-GEO).
//
// Presentational companion to useGeoStamp: it explains the auto-stamp purpose
// before the permission prompt (NFR-GEO-001), shows a persistent "tracking
// active" indicator (NFR-GEO-004), exposes start + pause/stop controls
// (NFR-GEO-005), surfaces the accuracy warning (REQ-F1-006), and — when location
// permission is denied/unavailable — guides the user to the manual check-in
// fallback (NFR-GEO-002 / REQ-F1-007). It holds no geolocation state itself;
// all of that lives in useGeoStamp so this stays trivially testable.

import SectionTitle from '../../components/SectionTitle';

interface StampTrackerProps {
  tracking: boolean;
  accuracyWarning: boolean;
  permissionDenied: boolean;
  error: string | null;
  purpose: string;
  onStart: () => void;
  onPause: () => void;
}

export default function StampTracker({
  tracking,
  accuracyWarning,
  permissionDenied,
  error,
  purpose,
  onStart,
  onPause,
}: StampTrackerProps) {
  return (
    <div className="stamp-tracker" aria-label="위치 추적">
      {/* Heading + start/stop control share one row (title left, control right). */}
      <div className="stamp-tracker-head">
        <SectionTitle icon="stamps">스탬프</SectionTitle>

        {tracking ? (
          <div className="tracking-active">
            {/* Persistent indicator while watchPosition is active (NFR-GEO-004). */}
            <span
              className="tracking-indicator"
              data-testid="tracking-indicator"
              role="status"
            >
              위치 추적 중
            </span>
            <button type="button" className="link-button" onClick={onPause}>
              위치 추적 중지
            </button>
          </div>
        ) : (
          <button type="button" onClick={onStart}>
            위치 추적 시작
          </button>
        )}
      </div>

      <p className="muted stamp-purpose">{purpose}</p>

      {accuracyWarning && (
        <p className="form-warning" role="alert">
          위치 정확도가 낮아 자동 스탬프를 보류했습니다. 정확도가 개선되면 다시
          시도됩니다.
        </p>
      )}

      {permissionDenied && (
        <p className="form-error" role="alert">
          위치 권한이 거부되어 자동 스탬프를 사용할 수 없습니다. 지도·길찾기·계획은
          계속 사용할 수 있으며, 도착은 다른 멤버의 확인을 거친 수동 체크인으로
          기록할 수 있습니다.
        </p>
      )}

      {error && !permissionDenied && (
        <p className="muted" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
