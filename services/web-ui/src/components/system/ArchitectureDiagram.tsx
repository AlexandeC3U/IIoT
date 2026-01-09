import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Cable,
  Cpu,
  Database,
  Factory,
  Globe,
  Monitor,
  Radio,
  Server,
  Timer,
} from 'lucide-react';
import { useMemo } from 'react';

// =============================================================================
// Custom Node Types
// =============================================================================

interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  icon: 'server' | 'database' | 'radio' | 'monitor' | 'cpu' | 'factory' | 'globe' | 'timer';
  status?: 'online' | 'offline' | 'warning';
  tech?: string;
  metrics?: string;
}

const iconMap = {
  server: Server,
  database: Database,
  radio: Radio,
  monitor: Monitor,
  cpu: Cpu,
  factory: Factory,
  globe: Globe,
  timer: Timer,
};

const statusColors = {
  online: 'bg-emerald-500/20 border-emerald-500/50',
  offline: 'bg-slate-500/20 border-slate-500/50',
  warning: 'bg-yellow-500/20 border-yellow-500/50',
};

function ServiceNode({ data }: NodeProps<Node<ServiceNodeData>>) {
  const Icon = iconMap[data.icon] || Server;
  const status = data.status || 'online';

  return (
    <div className="group relative">
      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-cyan-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-500 !w-2 !h-2" />

      {/* Node body */}
      <div
        className={`
          px-4 py-3 rounded-lg border-2 min-w-[140px] transition-all duration-200
          ${statusColors[status]}
          hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20
          cursor-pointer
        `}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-cyan-400" />
          <span className="font-medium text-sm text-white">{data.label}</span>
        </div>
        {data.tech && <div className="text-[10px] text-slate-400 font-mono">{data.tech}</div>}
      </div>

      {/* Tooltip on hover */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full
          bg-slate-800 border border-slate-600 rounded-lg p-3 min-w-[200px]
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
          pointer-events-none z-50 shadow-xl
        `}
      >
        <div className="text-sm font-medium text-white mb-1">{data.label}</div>
        <div className="text-xs text-slate-300 mb-2">{data.description}</div>
        {data.metrics && (
          <div className="text-[10px] text-cyan-400 font-mono border-t border-slate-600 pt-2 mt-2">
            {data.metrics}
          </div>
        )}
        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-slate-800 border-r border-b border-slate-600 rotate-45" />
      </div>
    </div>
  );
}

function DeviceGroupNode({ data }: NodeProps<Node<{ label: string; devices: string[] }>>) {
  return (
    <div className="group relative">
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2 !h-2" />

      <div className="px-4 py-3 rounded-lg border-2 border-orange-500/30 bg-orange-500/10 min-w-[160px]">
        <div className="flex items-center gap-2 mb-2">
          <Factory className="w-4 h-4 text-orange-400" />
          <span className="font-medium text-sm text-white">{data.label}</span>
        </div>
        <div className="space-y-1">
          {data.devices.map((device, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <Box className="w-3 h-3" />
              {device}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataFlowNode({
  data,
}: NodeProps<Node<{ label: string; direction: 'in' | 'out' | 'both' }>>) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-2 !h-2" />

      <div className="px-3 py-1.5 rounded-full border border-purple-500/50 bg-purple-500/10 flex items-center gap-1.5">
        <Cable className="w-3 h-3 text-purple-400" />
        <span className="text-[10px] text-purple-300 font-mono">{data.label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Node & Edge Definitions
// =============================================================================

const initialNodes: Node<
  | ServiceNodeData
  | { label: string; devices: string[] }
  | { label: string; direction: 'in' | 'out' | 'both' }
>[] = [
  // Web UI
  {
    id: 'web-ui',
    type: 'service',
    position: { x: 400, y: 0 },
    data: {
      label: 'Web UI',
      description: 'React dashboard for device management and system monitoring',
      icon: 'monitor',
      status: 'online',
      tech: 'React 18 + Vite',
      metrics: 'Port: 5173 (dev) / 80 (prod)',
    },
  },

  // Gateway Core
  {
    id: 'gateway-core',
    type: 'service',
    position: { x: 400, y: 120 },
    data: {
      label: 'Gateway Core',
      description: 'Central management API for device & tag configuration',
      icon: 'server',
      status: 'online',
      tech: 'TypeScript + Fastify',
      metrics: 'Port: 3001 | REST + WebSocket',
    },
  },

  // PostgreSQL
  {
    id: 'postgres',
    type: 'service',
    position: { x: 200, y: 120 },
    data: {
      label: 'PostgreSQL',
      description: 'Configuration database storing devices, tags, and settings',
      icon: 'database',
      status: 'online',
      tech: 'PostgreSQL 15',
      metrics: 'Port: 5433 | DB: nexus_config',
    },
  },

  // EMQX Broker
  {
    id: 'emqx',
    type: 'service',
    position: { x: 400, y: 250 },
    data: {
      label: 'EMQX Broker',
      description: 'Enterprise MQTT broker for message routing (Unified Namespace)',
      icon: 'radio',
      status: 'online',
      tech: 'EMQX 5.x',
      metrics: 'Port: 1883 (MQTT) / 18083 (Dashboard)',
    },
  },

  // Protocol Gateway
  {
    id: 'protocol-gateway',
    type: 'service',
    position: { x: 200, y: 380 },
    data: {
      label: 'Protocol Gateway',
      description: 'Multi-protocol adapter for industrial devices (Modbus, OPC UA, S7)',
      icon: 'cpu',
      status: 'online',
      tech: 'Go 1.22',
      metrics: 'Modbus TCP/RTU | OPC UA | Siemens S7',
    },
  },

  // Data Ingestion
  {
    id: 'data-ingestion',
    type: 'service',
    position: { x: 600, y: 380 },
    data: {
      label: 'Data Ingestion',
      description: 'High-throughput service writing telemetry to TimescaleDB',
      icon: 'timer',
      status: 'online',
      tech: 'Go 1.22',
      metrics: '200K+ points/sec | COPY protocol',
    },
  },

  // TimescaleDB
  {
    id: 'timescaledb',
    type: 'service',
    position: { x: 600, y: 500 },
    data: {
      label: 'TimescaleDB',
      description: 'Time-series database for historical data storage and analytics',
      icon: 'database',
      status: 'online',
      tech: 'TimescaleDB 2.x',
      metrics: 'Port: 5432 | DB: nexus_historian',
    },
  },

  // Industrial Devices
  {
    id: 'devices',
    type: 'device-group',
    position: { x: 150, y: 520 },
    data: {
      label: 'Industrial Devices',
      devices: ['Modbus PLC', 'OPC UA Server', 'Siemens S7-1500'],
    },
  },

  // Data flow annotations
  {
    id: 'flow-rest',
    type: 'data-flow',
    position: { x: 500, y: 65 },
    data: { label: 'REST API', direction: 'both' },
  },
  {
    id: 'flow-mqtt',
    type: 'data-flow',
    position: { x: 500, y: 185 },
    data: { label: 'MQTT Pub/Sub', direction: 'both' },
  },
  {
    id: 'flow-uns',
    type: 'data-flow',
    position: { x: 400, y: 315 },
    data: { label: 'UNS Topics', direction: 'both' },
  },
];

const initialEdges: Edge[] = [
  // Web UI -> Gateway Core
  {
    id: 'e-ui-gc',
    source: 'web-ui',
    target: 'gateway-core',
    animated: true,
    style: { stroke: '#22d3ee', strokeWidth: 2 },
  },
  // Gateway Core -> PostgreSQL
  {
    id: 'e-gc-pg',
    source: 'gateway-core',
    target: 'postgres',
    sourceHandle: undefined,
    style: { stroke: '#22d3ee', strokeWidth: 2 },
  },
  // Gateway Core -> EMQX
  {
    id: 'e-gc-emqx',
    source: 'gateway-core',
    target: 'emqx',
    animated: true,
    style: { stroke: '#a855f7', strokeWidth: 2 },
  },
  // EMQX -> Protocol Gateway
  {
    id: 'e-emqx-pg',
    source: 'emqx',
    target: 'protocol-gateway',
    animated: true,
    style: { stroke: '#a855f7', strokeWidth: 2 },
  },
  // EMQX -> Data Ingestion
  {
    id: 'e-emqx-di',
    source: 'emqx',
    target: 'data-ingestion',
    animated: true,
    style: { stroke: '#a855f7', strokeWidth: 2 },
  },
  // Protocol Gateway -> Devices
  {
    id: 'e-pg-devices',
    source: 'protocol-gateway',
    target: 'devices',
    style: { stroke: '#f97316', strokeWidth: 2 },
  },
  // Data Ingestion -> TimescaleDB
  {
    id: 'e-di-tsdb',
    source: 'data-ingestion',
    target: 'timescaledb',
    animated: true,
    style: { stroke: '#22d3ee', strokeWidth: 2 },
  },
];

// =============================================================================
// Main Component
// =============================================================================

const nodeTypes = {
  service: ServiceNode,
  'device-group': DeviceGroupNode,
  'data-flow': DataFlowNode,
};

export function ArchitectureDiagram() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div className="w-full h-[600px] rounded-lg border bg-slate-900/50 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls
          className="!bg-slate-800 !border-slate-600 !rounded-lg [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button:hover]:!bg-slate-600 [&>button>svg]:!fill-white"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-slate-800 !border-slate-600 !rounded-lg"
          nodeColor={(node) => {
            switch (node.type) {
              case 'device-group':
                return '#f97316';
              case 'data-flow':
                return '#a855f7';
              default:
                return '#22d3ee';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/90 border border-slate-600 rounded-lg p-3 backdrop-blur-sm">
        <div className="text-xs font-medium text-white mb-2">Legend</div>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-cyan-500" />
            <span className="text-slate-400">Database / REST</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-purple-500" />
            <span className="text-slate-400">MQTT Messaging</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-orange-500" />
            <span className="text-slate-400">Industrial Protocol</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 right-4 bg-slate-800/90 border border-slate-600 rounded-lg px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] text-slate-400">
          <span className="text-slate-300">🖱️ Scroll</span> to zoom •{' '}
          <span className="text-slate-300">Drag</span> to pan •{' '}
          <span className="text-slate-300">Hover</span> for details
        </div>
      </div>
    </div>
  );
}
