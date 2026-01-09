import { ArchitectureDiagram } from '@/components/system/ArchitectureDiagram';
import { Button } from '@/components/ui/button';
import { healthApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Database, Radio, RefreshCw, Server, XCircle } from 'lucide-react';

export function SystemPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.ready(),
    refetchInterval: 10000, // Refresh every 10s
  });

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">System Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor the health and status of NEXUS Edge services
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <XCircle className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="mt-4 font-semibold">Connection Failed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Unable to connect to Gateway Core API
          </p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Gateway Core Status */}
          <StatusCard
            title="Gateway Core"
            icon={Server}
            status={
              data?.status === 'healthy'
                ? 'online'
                : data?.status === 'degraded'
                  ? 'offline'
                  : data?.status === 'unhealthy'
                    ? 'error'
                    : 'unknown'
            }
            loading={isLoading}
          >
            {data && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="capitalize font-medium">{data.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-mono">{formatUptime(data.uptime)}</span>
                </div>
              </div>
            )}
          </StatusCard>

          {/* Database Status */}
          <StatusCard
            title="PostgreSQL"
            icon={Database}
            status={data?.checks.database.status === 'ok' ? 'online' : 'error'}
            loading={isLoading}
          >
            {data?.checks.database && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      'font-medium',
                      data.checks.database.status === 'ok' ? 'text-emerald-500' : 'text-destructive'
                    )}
                  >
                    {data.checks.database.status === 'ok' ? 'Connected' : 'Error'}
                  </span>
                </div>
                {data.checks.database.latencyMs && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className="font-mono">{data.checks.database.latencyMs}ms</span>
                  </div>
                )}
              </div>
            )}
          </StatusCard>

          {/* MQTT Status */}
          <StatusCard
            title="MQTT Broker"
            icon={Radio}
            status={data?.checks.mqtt.connected ? 'online' : 'offline'}
            loading={isLoading}
          >
            {data?.checks.mqtt && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      'font-medium',
                      data.checks.mqtt.connected ? 'text-emerald-500' : 'text-yellow-500'
                    )}
                  >
                    {data.checks.mqtt.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
            )}
          </StatusCard>
        </div>
      )}

      {/* Service Architecture - Interactive Diagram */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Service Architecture</h2>
        <ArchitectureDiagram />
      </div>
    </div>
  );
}

interface StatusCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'online' | 'offline' | 'error' | 'unknown';
  loading?: boolean;
  children?: React.ReactNode;
}

function StatusCard({ title, icon: Icon, status, loading, children }: StatusCardProps) {
  const statusConfig = {
    online: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Online' },
    offline: { color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Offline' },
    error: { color: 'text-destructive', bg: 'bg-destructive/10', label: 'Error' },
    unknown: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Unknown' },
  };

  const config = statusConfig[status];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', config.bg)}>
            <Icon className={cn('h-5 w-5', config.color)} />
          </div>
          <div>
            <h3 className="font-medium">{title}</h3>
          </div>
        </div>
        {loading ? (
          <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />
        ) : status === 'online' ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <XCircle className={cn('h-5 w-5', config.color)} />
        )}
      </div>
      {children}
    </div>
  );
}
