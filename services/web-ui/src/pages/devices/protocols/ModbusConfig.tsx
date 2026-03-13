import { Input } from '@/components/ui/input';
import type { ModbusDeviceConfig } from '@/lib/api';

interface ModbusConfigProps {
  config: Partial<ModbusDeviceConfig>;
  onChange: (config: Partial<ModbusDeviceConfig>) => void;
  disabled?: boolean;
}

export function ModbusConfig({ config, onChange, disabled }: ModbusConfigProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Modbus Settings
      </h4>

      <div className="grid grid-cols-2 gap-3">
        {/* Slave / Unit ID */}
        <div>
          <label className="text-sm font-medium">Slave ID *</label>
          <Input
            type="number"
            value={config.slaveId ?? 1}
            onChange={(e) => onChange({ ...config, slaveId: parseInt(e.target.value) || 1 })}
            min={1}
            max={247}
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">Unit address (1-247)</p>
        </div>

        {/* Timeout */}
        <div>
          <label className="text-sm font-medium">Timeout (ms)</label>
          <Input
            type="number"
            value={config.timeout ?? ''}
            onChange={(e) =>
              onChange({ ...config, timeout: e.target.value ? parseInt(e.target.value) : undefined })
            }
            min={100}
            max={30000}
            placeholder="5000"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">Connection timeout</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Retry Count */}
        <div>
          <label className="text-sm font-medium">Retry Count</label>
          <Input
            type="number"
            value={config.retryCount ?? ''}
            onChange={(e) =>
              onChange({ ...config, retryCount: e.target.value ? parseInt(e.target.value) : undefined })
            }
            min={0}
            max={10}
            placeholder="3"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
        </div>

        {/* Retry Delay */}
        <div>
          <label className="text-sm font-medium">Retry Delay (ms)</label>
          <Input
            type="number"
            value={config.retryDelay ?? ''}
            onChange={(e) =>
              onChange({ ...config, retryDelay: e.target.value ? parseInt(e.target.value) : undefined })
            }
            min={0}
            max={10000}
            placeholder="1000"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
        </div>
      </div>
    </div>
  );
}

export function getModbusDefaults(): Partial<ModbusDeviceConfig> {
  return { slaveId: 1 };
}
