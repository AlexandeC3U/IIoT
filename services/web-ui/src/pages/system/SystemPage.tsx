import { ArchitectureDiagram } from '@/components/system/ArchitectureDiagram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { healthApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  Radio,
  RefreshCw,
  Server,
  Wifi,
  XCircle,
} from 'lucide-react';

export function SystemPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.ready(),
    refetchInterval: 10000,
  });

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const overallStatus = data?.status ?? 'unknown';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Monitor the health and status of all NEXUS Edge services
        </p>
        <div className="flex items-center gap-3">
          <Badge
            variant={overallStatus === 'healthy' ? 'online' : overallStatus === 'degraded' ? 'unknown' : 'error'}
            className="px-3 py-1"
          >
            {overallStatus === 'healthy' ? 'All Systems Operational' : overallStatus === 'degraded' ? 'Degraded' : isLoading ? 'Checking...' : 'Unhealthy'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="p-8 text-center">
          <XCircle className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="mt-4 font-semibold">Connection Failed</h3>
          <p className="text-sm text-muted-foreground mt-1">Unable to connect to Gateway Core API</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : (
        <>
          {/* Service Health Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ServiceCard
              title="Gateway Core"
              icon={Server}
              status={data?.status === 'healthy' ? 'online' : data?.status === 'degraded' ? 'degraded' : 'error'}
              loading={isLoading}
              details={[
                { label: 'Status', value: data?.status ?? '—', color: data?.status === 'healthy' ? 'text-emerald-400' : 'text-yellow-400' },
                { label: 'Uptime', value: data ? formatUptime(data.uptime) : '—', mono: true },
              ]}
            />

            <ServiceCard
              title="PostgreSQL"
              icon={Database}
              status={data?.checks.database.status === 'ok' ? 'online' : 'error'}
              loading={isLoading}
              details={[
                { label: 'Status', value: data?.checks.database.status === 'ok' ? 'Connected' : 'Error', color: data?.checks.database.status === 'ok' ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Latency', value: data?.checks.database.latencyMs ? `${data.checks.database.latencyMs}ms` : '—', mono: true },
              ]}
            />

            <ServiceCard
              title="MQTT Broker"
              icon={Radio}
              status={data?.checks.mqtt.connected ? 'online' : 'offline'}
              loading={isLoading}
              details={[
                { label: 'Status', value: data?.checks.mqtt.connected ? 'Connected' : 'Disconnected', color: data?.checks.mqtt.connected ? 'text-emerald-400' : 'text-yellow-400' },
                { label: 'Broker', value: 'EMQX' },
              ]}
            />

            <ServiceCard
              title="WebSocket"
              icon={Wifi}
              status={data?.status === 'healthy' ? 'online' : 'offline'}
              loading={isLoading}
              details={[
                { label: 'Bridge', value: data?.status === 'healthy' ? 'Active' : 'Inactive', color: data?.status === 'healthy' ? 'text-emerald-400' : 'text-slate-400' },
                { label: 'Protocol', value: 'MQTT→WS' },
              ]}
            />
          </div>

          {/* Architecture Diagram */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Service Architecture</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ArchitectureDiagram />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface ServiceCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'online' | 'offline' | 'degraded' | 'error';
  loading?: boolean;
  details: Array<{ label: string; value: string; color?: string; mono?: boolean }>;
}

function ServiceCard({ title, icon: Icon, status, loading, details }: ServiceCardProps) {
  const statusConfig = {
    online: { iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
    offline: { iconBg: 'bg-slate-500/10', iconColor: 'text-slate-400' },
    degraded: { iconBg: 'bg-yellow-500/10', iconColor: 'text-yellow-500' },
    error: { iconBg: 'bg-red-500/10', iconColor: 'text-red-500' },
  };

  const config = statusConfig[status];
  const stripColor = status === 'online' ? 'bg-emerald-500/20' : status === 'error' ? 'bg-red-500/20' : status === 'degraded' ? 'bg-yellow-500/20' : 'bg-slate-500/10';

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', config.iconBg)}>
              <Icon className={cn('h-4 w-4', config.iconColor)} />
            </div>
            <h3 className="font-medium text-sm">{title}</h3>
          </div>
          {loading ? (
            <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />
          ) : status === 'online' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className={cn('h-4 w-4', config.iconColor)} />
          )}
        </div>

        <div className="space-y-2">
          {details.map((detail) => (
            <div key={detail.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{detail.label}</span>
              <span className={cn('font-medium', detail.mono && 'font-mono', detail.color)}>
                {detail.value}
              </span>
            </div>
          ))}
        </div>

        <div className={cn('absolute top-0 right-0 w-1 h-full', stripColor)} />
      </CardContent>
    </Card>
  );
}
