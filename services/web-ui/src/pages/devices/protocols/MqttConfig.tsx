import { Input } from '@/components/ui/input';
import type { MqttDeviceConfig } from '@/lib/api';

interface MqttConfigProps {
  config: Partial<MqttDeviceConfig>;
  onChange: (config: Partial<MqttDeviceConfig>) => void;
  disabled?: boolean;
}

export function MqttConfig({ config, onChange, disabled }: MqttConfigProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        MQTT Source Settings
      </h4>

      {/* Broker URL */}
      <div>
        <label className="text-sm font-medium">Broker URL</label>
        <Input
          value={config.brokerUrl ?? ''}
          onChange={(e) => onChange({ ...config, brokerUrl: e.target.value || undefined })}
          placeholder="mqtt://192.168.1.10:1883"
          disabled={disabled}
          className="mt-1.5 font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Override broker URL (defaults to host:port)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Client ID */}
        <div>
          <label className="text-sm font-medium">Client ID</label>
          <Input
            value={config.clientId ?? ''}
            onChange={(e) => onChange({ ...config, clientId: e.target.value || undefined })}
            placeholder="nexus-edge-001"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
        </div>

        {/* QoS */}
        <div>
          <label className="text-sm font-medium">QoS Level</label>
          <select
            value={config.qos ?? 0}
            onChange={(e) =>
              onChange({ ...config, qos: parseInt(e.target.value) as MqttDeviceConfig['qos'] })
            }
            disabled={disabled}
            className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value={0}>0 - At most once</option>
            <option value={1}>1 - At least once</option>
            <option value={2}>2 - Exactly once</option>
          </select>
        </div>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Username</label>
          <Input
            value={config.username ?? ''}
            onChange={(e) => onChange({ ...config, username: e.target.value || undefined })}
            placeholder="Optional"
            disabled={disabled}
            className="mt-1.5"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            value={config.password ?? ''}
            onChange={(e) => onChange({ ...config, password: e.target.value || undefined })}
            placeholder="Optional"
            disabled={disabled}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Topic Filter */}
      <div>
        <label className="text-sm font-medium">Topic Filter</label>
        <Input
          value={config.topicFilter ?? ''}
          onChange={(e) => onChange({ ...config, topicFilter: e.target.value || undefined })}
          placeholder="plant/area1/#"
          disabled={disabled}
          className="mt-1.5 font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          MQTT topic pattern to subscribe (supports + and # wildcards)
        </p>
      </div>
    </div>
  );
}

export function getMqttDefaults(): Partial<MqttDeviceConfig> {
  return { qos: 0 };
}
