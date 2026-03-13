import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  deviceApi,
  healthApi,
  tagApi,
  type Device,
  type HealthReadyResponse,
} from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  Radio,
  Tags,
  Wifi,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function StatCard({ title, value, subtitle, icon, loading }: StatCardProps) {
  return (
    <Card className="group transition-all hover:border-border/80 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
            ) : (
              <>
                <p className="text-2xl font-bold tracking-tight">{value}</p>
                {subtitle && (
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                )}
              </>
            )}
          </div>
          <div className="rounded-md p-2.5 bg-muted/50 group-hover:bg-muted transition-colors">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Status Dot
// ============================================================================

const statusDotColors: Record<string, string> = {
  online: 'bg-emerald-500 shadow-emerald-500/40',
  offline: 'bg-slate-500 shadow-slate-500/40',
  error: 'bg-red-500 shadow-red-500/40',
  unknown: 'bg-yellow-500 shadow-yellow-500/40',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full shadow-sm',
        statusDotColors[status] ?? statusDotColors.unknown
      )}
    />
  );
}

// ============================================================================
// System Status Helpers
// ============================================================================

function getSystemStatusDisplay(health: HealthReadyResponse | undefined) {
  if (!health) return { label: 'Unknown', color: 'text-yellow-400', icon: AlertCircle };
  switch (health.status) {
    case 'healthy':
      return { label: 'Healthy', color: 'text-emerald-400', icon: CheckCircle2 };
    case 'degraded':
      return { label: 'Degraded', color: 'text-yellow-400', icon: AlertCircle };
    case 'unhealthy':
      return { label: 'Unhealthy', color: 'text-red-400', icon: AlertCircle };
    default:
      return { label: 'Unknown', color: 'text-yellow-400', icon: AlertCircle };
  }
}

// ============================================================================
// Recent Devices Section
// ============================================================================

function RecentDevices({
  devices,
  loading,
}: {
  devices: Device[];
  loading: boolean;
}) {
  const recent = [...devices]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Devices</CardTitle>
          <Link
            to="/devices"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View All
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-muted" />
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-4 w-14 rounded bg-muted" />
                <div className="flex-1" />
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No devices configured yet.
          </p>
        ) : (
          <div className="space-y-1">
            {recent.map((device) => (
              <Link
                key={device.id}
                to="/devices"
                className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <StatusDot status={device.status} />
                <span className="font-medium truncate min-w-0 max-w-[10rem]">
                  {device.name}
                </span>
                <Badge variant={device.protocol} className="shrink-0">
                  {device.protocol}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono truncate hidden sm:inline">
                  {device.host}:{device.port}
                </span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {device.lastSeen ? formatRelativeTime(device.lastSeen) : 'never'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// System Health Section
// ============================================================================

function SystemHealth({
  health,
  loading,
}: {
  health: HealthReadyResponse | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">System Health</CardTitle>
          <Link
            to="/system"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-10 rounded bg-muted" />
            <div className="h-10 rounded bg-muted" />
          </div>
        ) : !health ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span>Unable to reach health endpoint</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Database */}
            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Database</span>
              </div>
              <div className="flex items-center gap-2">
                {health.checks.database.latencyMs !== undefined && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {health.checks.database.latencyMs}ms
                  </span>
                )}
                {health.checks.database.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
              </div>
            </div>

            {/* MQTT */}
            <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">MQTT Broker</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {health.checks.mqtt.connected ? 'Connected' : 'Disconnected'}
                </span>
                {health.checks.mqtt.connected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Dashboard Page
// ============================================================================

export function DashboardPage() {
  const devicesQuery = useQuery({
    queryKey: ['dashboard', 'devices'],
    queryFn: () => deviceApi.list({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const tagsQuery = useQuery({
    queryKey: ['dashboard', 'tags'],
    queryFn: () => tagApi.list({ limit: 1 }),
    refetchInterval: 30_000,
  });

  const healthQuery = useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: () => healthApi.ready(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const devices = devicesQuery.data?.data ?? [];
  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const totalTags = tagsQuery.data?.total ?? 0;
  const health = healthQuery.data;
  const systemStatus = getSystemStatusDisplay(health);
  const SystemStatusIcon = systemStatus.icon;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Page Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            NEXUS Edge platform overview
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Devices"
            value={devicesQuery.data?.total ?? 0}
            subtitle={`${devices.filter((d) => d.enabled).length} enabled`}
            icon={<Cpu className="h-5 w-5 text-primary" />}
            loading={devicesQuery.isLoading}
          />
          <StatCard
            title="Online Devices"
            value={onlineCount}
            subtitle={
              devices.length > 0
                ? `${Math.round((onlineCount / devices.length) * 100)}% of total`
                : undefined
            }
            icon={<Radio className="h-5 w-5 text-emerald-400" />}
            loading={devicesQuery.isLoading}
          />
          <StatCard
            title="Total Tags"
            value={totalTags}
            icon={<Tags className="h-5 w-5 text-blue-400" />}
            loading={tagsQuery.isLoading}
          />
          <StatCard
            title="System Status"
            value={systemStatus.label}
            subtitle={health ? `uptime ${formatUptime(health.uptime)}` : undefined}
            icon={
              <SystemStatusIcon
                className={cn('h-5 w-5', systemStatus.color)}
              />
            }
            loading={healthQuery.isLoading}
          />
        </div>

        {/* Bottom Grid: Recent Devices + System Health */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentDevices
              devices={devices}
              loading={devicesQuery.isLoading}
            />
          </div>
          <div>
            <SystemHealth
              health={health}
              loading={healthQuery.isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
