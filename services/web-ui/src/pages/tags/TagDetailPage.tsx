import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  deviceApi,
  historianApi,
  tagApi,
  type Device,
  type HistoryResponse,
  type Tag,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const RANGE_OPTIONS = [
  { label: '10 min', minutes: 10 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
] as const;

export function TagDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGE_OPTIONS[rangeIdx];

  // Fetch tag
  const {
    data: tag,
    isLoading: tagLoading,
    error: tagError,
  } = useQuery<Tag>({
    queryKey: ['tag', id],
    queryFn: () => tagApi.get(id!),
    enabled: !!id,
  });

  // Fetch parent device for UNS prefix
  const { data: device } = useQuery<Device>({
    queryKey: ['device', tag?.deviceId],
    queryFn: () => deviceApi.get(tag!.deviceId),
    enabled: !!tag?.deviceId,
  });

  // Build the MQTT topic
  const topic = useMemo(() => {
    if (!tag || !device) return null;
    const prefix = device.unsPrefix ?? '';
    const suffix = tag.topicSuffix || tag.name;
    return prefix ? `${prefix}/${suffix}` : suffix;
  }, [tag, device]);

  // Fetch history from historian
  const {
    data: history,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<HistoryResponse>({
    queryKey: ['history', topic, range.minutes],
    queryFn: () => {
      const now = new Date();
      const from = new Date(now.getTime() - range.minutes * 60_000);
      return historianApi.query(topic!, {
        from: from.toISOString(),
        to: now.toISOString(),
        limit: 1000,
      });
    },
    enabled: !!topic,
    refetchInterval: 15_000,
  });

  // Chart data
  const chartData = useMemo(() => {
    if (!history?.points) return [];
    return history.points.map((p) => ({
      time: new Date(p.time).getTime(),
      value: p.value,
    }));
  }, [history]);

  const stats = history?.stats;

  if (tagError) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <p className="text-lg font-medium">Tag not found</p>
        <Link to="/tags">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Tags
          </Button>
        </Link>
      </div>
    );
  }

  if (tagLoading || !tag) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-40 rounded bg-muted" />
        <div className="h-64 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-auto">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 px-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/tags">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Tags
            </Button>
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-3">
              {tag.name}
              <span
                className={cn(
                  'inline-block h-2.5 w-2.5 rounded-full',
                  tag.enabled
                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                    : 'bg-zinc-600'
                )}
                title={tag.enabled ? 'Enabled' : 'Disabled'}
              />
            </h1>
            {tag.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{tag.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Tag Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoCard label="Device" value={device?.name ?? '—'} />
          <InfoCard label="Address" value={tag.address} mono />
          <InfoCard label="Data Type">
            <Badge variant="outline" className="font-mono text-xs">
              {tag.dataType}
            </Badge>
          </InfoCard>
          <InfoCard label="Topic" value={topic ?? '—'} mono />
          <InfoCard label="Access Mode" value={tag.accessMode} />
          <InfoCard label="Units" value={tag.engineeringUnits ?? '—'} />
          <InfoCard label="Poll Interval" value={device ? `${device.pollIntervalMs}ms` : '—'} />
          <InfoCard label="Priority" value={String(tag.priority)} />
        </div>

        {/* Stats Table */}
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-medium">Statistics</h2>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last {range.label}
            </span>
          </div>
          {historyLoading ? (
            <div className="p-4 animate-pulse">
              <div className="h-10 rounded bg-muted" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-5 divide-x divide-border/40">
              <StatCell label="Latest" value={stats.latest_str ?? formatNum(stats.latest)} />
              <StatCell label="Average" value={formatNum(stats.avg)} />
              <StatCell label="Minimum" value={formatNum(stats.min)} />
              <StatCell label="Maximum" value={formatNum(stats.max)} />
              <StatCell label="Count" value={stats.count.toLocaleString()} />
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No data available for this topic
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-medium">Time Series</h2>
            <div className="flex items-center gap-2">
              {/* Range selector */}
              <div className="flex rounded-md border border-border/40 overflow-hidden">
                {RANGE_OPTIONS.map((r, i) => (
                  <button
                    key={r.label}
                    onClick={() => setRangeIdx(i)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium transition-colors',
                      i === rangeIdx
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchHistory()} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {historyLoading ? (
            <div className="h-72 animate-pulse bg-muted/20" />
          ) : chartData.length > 0 ? (
            <div className="p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(t) =>
                      new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    width={60}
                    tickFormatter={(v) => formatNum(v) ?? ''}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(t) => new Date(t as number).toLocaleString()}
                    formatter={(v) => [formatNum(v as number), 'Value']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
              No data points in the selected range
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(v: number | null | undefined): string {
  if (v == null) return '—';
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3);
}

function InfoCard({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-border/40 rounded-lg p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children ?? (
        <div
          className={cn('text-sm font-medium truncate', mono && 'font-mono text-xs')}
          title={value}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-semibold font-mono">{value}</div>
    </div>
  );
}
