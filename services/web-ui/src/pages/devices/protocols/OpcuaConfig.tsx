import { Input } from '@/components/ui/input';
import type { OpcuaDeviceConfig } from '@/lib/api';

interface OpcuaConfigProps {
  config: Partial<OpcuaDeviceConfig>;
  onChange: (config: Partial<OpcuaDeviceConfig>) => void;
  disabled?: boolean;
}

const SECURITY_POLICIES = ['None', 'Basic128Rsa15', 'Basic256', 'Basic256Sha256'] as const;
const SECURITY_MODES = ['None', 'Sign', 'SignAndEncrypt'] as const;
const AUTH_MODES = ['anonymous', 'username', 'certificate'] as const;

export function OpcuaConfig({ config, onChange, disabled }: OpcuaConfigProps) {
  const authMode = config.authMode ?? 'anonymous';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        OPC UA Settings
      </h4>

      {/* Endpoint URL (optional override) */}
      <div>
        <label className="text-sm font-medium">Endpoint URL</label>
        <Input
          value={config.endpointUrl ?? ''}
          onChange={(e) => onChange({ ...config, endpointUrl: e.target.value || undefined })}
          placeholder="opc.tcp://192.168.1.10:4840"
          disabled={disabled}
          className="mt-1.5 font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Override endpoint URL (defaults to host:port)
        </p>
      </div>

      {/* Security */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Security Policy</label>
          <select
            value={config.securityPolicy ?? 'None'}
            onChange={(e) =>
              onChange({
                ...config,
                securityPolicy: e.target.value as OpcuaDeviceConfig['securityPolicy'],
              })
            }
            disabled={disabled}
            className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            {SECURITY_POLICIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Security Mode</label>
          <select
            value={config.securityMode ?? 'None'}
            onChange={(e) =>
              onChange({
                ...config,
                securityMode: e.target.value as OpcuaDeviceConfig['securityMode'],
              })
            }
            disabled={disabled}
            className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            {SECURITY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Authentication */}
      <div>
        <label className="text-sm font-medium">Authentication</label>
        <select
          value={authMode}
          onChange={(e) =>
            onChange({
              ...config,
              authMode: e.target.value as OpcuaDeviceConfig['authMode'],
              // Clear credentials when switching away from username
              ...(e.target.value !== 'username' && { username: undefined, password: undefined }),
            })
          }
          disabled={disabled}
          className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          {AUTH_MODES.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Username / Password (conditional) */}
      {authMode === 'username' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Username</label>
            <Input
              value={config.username ?? ''}
              onChange={(e) => onChange({ ...config, username: e.target.value })}
              placeholder="admin"
              disabled={disabled}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              value={config.password ?? ''}
              onChange={(e) => onChange({ ...config, password: e.target.value })}
              placeholder="••••••••"
              disabled={disabled}
              className="mt-1.5"
            />
          </div>
        </div>
      )}

      {/* Subscription settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="useSubscriptions"
            checked={config.useSubscriptions ?? false}
            onChange={(e) => onChange({ ...config, useSubscriptions: e.target.checked })}
            disabled={disabled}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <label htmlFor="useSubscriptions" className="text-sm font-medium">
            Use Subscriptions (push mode)
          </label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1 ml-7">
          Report-by-Exception instead of polling. Server pushes value changes.
        </p>

        {config.useSubscriptions && (
          <div className="grid grid-cols-2 gap-3 ml-7">
            <div>
              <label className="text-sm font-medium">Publish Interval (ms)</label>
              <Input
                type="number"
                value={config.publishInterval ?? ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    publishInterval: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                min={50}
                placeholder="1000"
                disabled={disabled}
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sampling Interval (ms)</label>
              <Input
                type="number"
                value={config.samplingInterval ?? ''}
                onChange={(e) =>
                  onChange({
                    ...config,
                    samplingInterval: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                min={0}
                placeholder="500"
                disabled={disabled}
                className="mt-1.5 font-mono"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function getOpcuaDefaults(): Partial<OpcuaDeviceConfig> {
  return {
    securityPolicy: 'None',
    securityMode: 'None',
    authMode: 'anonymous',
    useSubscriptions: false,
  };
}
