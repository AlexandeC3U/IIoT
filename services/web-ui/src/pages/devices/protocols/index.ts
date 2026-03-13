import type { Protocol } from '@/lib/api';
import { BacnetConfig, getBacnetDefaults } from './BacnetConfig';
import { EthernetipConfig, getEthernetipDefaults } from './EthernetipConfig';
import { getModbusDefaults, ModbusConfig } from './ModbusConfig';
import { getMqttDefaults, MqttConfig } from './MqttConfig';
import { getOpcuaDefaults, OpcuaConfig } from './OpcuaConfig';
import { getS7Defaults, S7Config } from './S7Config';

export { BacnetConfig } from './BacnetConfig';
export { EthernetipConfig } from './EthernetipConfig';
export { ModbusConfig } from './ModbusConfig';
export { MqttConfig } from './MqttConfig';
export { OpcuaConfig } from './OpcuaConfig';
export { S7Config } from './S7Config';

// Map protocol → config component
export const PROTOCOL_CONFIG_COMPONENTS: Record<
  Protocol,
  React.ComponentType<{ config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled?: boolean }>
> = {
  modbus: ModbusConfig as never,
  opcua: OpcuaConfig as never,
  s7: S7Config as never,
  mqtt: MqttConfig as never,
  bacnet: BacnetConfig as never,
  ethernetip: EthernetipConfig as never,
};

// Map protocol → default config values
export function getProtocolDefaults(protocol: Protocol): Record<string, unknown> {
  switch (protocol) {
    case 'modbus':
      return getModbusDefaults();
    case 'opcua':
      return getOpcuaDefaults();
    case 's7':
      return getS7Defaults();
    case 'mqtt':
      return getMqttDefaults();
    case 'bacnet':
      return getBacnetDefaults();
    case 'ethernetip':
      return getEthernetipDefaults();
  }
}
