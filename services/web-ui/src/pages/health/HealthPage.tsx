const GRAFANA_DASHBOARD =
  '/grafana/d/gateway-system/protocol-gateway-system-health?orgId=1&refresh=30s&theme=dark&kiosk';

export function HealthPage() {
  return (
    <div className="h-full w-full">
      <iframe
        src={GRAFANA_DASHBOARD}
        title="Protocol Gateway – System Health"
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
