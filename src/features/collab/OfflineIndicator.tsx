// Offline indicator (SPEC-BREADTOUR-001 / REQ-F5-005 / AC-F5-05 / EC-03).
// When the realtime channel is disconnected the app keeps showing the last
// synced state; this banner just tells the member they are temporarily offline
// and that the view will re-sync on reconnect. Presentational only.

interface OfflineIndicatorProps {
  online: boolean;
}

export default function OfflineIndicator({ online }: OfflineIndicatorProps) {
  if (online) return null;
  return (
    <p className="offline-indicator" role="status">
      오프라인입니다. 마지막으로 동기화된 내용을 표시하고 있으며, 다시 연결되면
      최신 상태로 동기화됩니다.
    </p>
  );
}
