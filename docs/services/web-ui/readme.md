# Web UI Service

Modern, responsive web interface for the NEXUS Edge platform. Built with React 18, Vite 5, and TailwindCSS with a dark theme optimized for industrial control room environments.

## Features

- **Device Management**: View, create, edit, and delete device configurations
- **System Overview**: Real-time health monitoring of all platform services
- **Dark Theme**: Reduced eye strain for 24/7 control room operations
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Updates**: TanStack Query for automatic data refresh
- **Type Safety**: Full TypeScript coverage

## Screenshots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔷 NEXUS Edge                         📊 Dashboard  🔧 Devices  ⚙️ System│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Devices                                              [+ Add Device]        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 🟢  Production PLC          modbus-tcp    192.168.1.100:502   1000ms│    │
│  │     Main production line controller                         [Edit] │     │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ 🟢  OPC UA Server          opcua         192.168.1.101:4840   2000ms│    │
│  │     Quality control station                                 [Edit] │     │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ 🟠  Siemens S7-1500        s7            192.168.1.102:102    500ms │    │
│  │     Packaging line PLC                                      [Edit]  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WEB UI SERVICE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         REACT APPLICATION                           │    │
│  │                                                                     │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │   │    Pages     │  │  Components  │  │     Hooks    │              │    │
│  │   │              │  │              │  │              │              │    │
│  │   │ • Dashboard  │  │ • Layout     │  │ • useQuery   │              │    │
│  │   │ • Devices    │  │ • DeviceCard │  │ • useMutation│              │    │
│  │   │ • Tags       │  │ • TagTable   │  │ • useToast   │              │    │
│  │   │ • System     │  │ • Dialog     │  │              │              │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │    │
│  │                              │                                      │    │
│  │                       ┌──────▼──────┐                               │    │
│  │                       │  API Client │                               │    │
│  │                       │  (lib/api)  │                               │    │
│  │                       └──────┬──────┘                               │    │
│  │                              │                                      │    │
│  └──────────────────────────────┼──────────────────────────────────────┘    │
│                                 │                                           │
│                                 │ HTTP/REST                                 │
│                                 ▼                                           │
│                       ┌─────────────────┐                                   │
│                       │  Gateway Core   │                                   │
│                       │  API (Port 3001)│                                   │
│                       └─────────────────┘                                   │
│                                                                             │
│  Production: Served by Nginx with API reverse proxy                         │
│  Development: Vite dev server with proxy                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- Gateway Core running (for API)

### Running Locally

```bash
# Navigate to service directory
cd services/web-ui

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The UI will be available at `http://localhost:5173`

### Environment Variables

Create a `.env` file for configuration:

```bash
# API endpoint (development uses Vite proxy)
VITE_API_URL=http://localhost:3001

# Optional: Custom port
VITE_PORT=5173
```

## Project Structure

```
services/web-ui/
├── public/
│   └── nexus-icon.svg          # Application icon
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   └── Layout.tsx      # Main navigation layout
│   │   └── ui/
│   │       ├── button.tsx      # Reusable button component
│   │       └── toaster.tsx     # Toast notifications
│   ├── lib/
│   │   ├── api.ts              # API client (devices, tags, health)
│   │   └── utils.ts            # Utility functions (cn, etc.)
│   ├── pages/
│   │   ├── devices/
│   │   │   ├── DevicesPage.tsx # Device list and management
│   │   │   └── DeviceDialog.tsx# Add/Edit device modal
│   │   └── system/
│   │       └── SystemPage.tsx  # System health overview
│   ├── styles/
│   │   └── globals.css         # Tailwind + custom styles
│   ├── App.tsx                 # Main app with routing
│   └── main.tsx                # Application entry point
├── index.html
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json
├── package.json
├── nginx.conf                  # Production Nginx config
└── Dockerfile
```

## Pages

### Dashboard (Coming Soon)

Overview of the entire system with key metrics and quick actions.

### Devices (`/devices`)

Full device management:

- **List View**: All configured devices with protocol badges
- **Search/Filter**: Find devices by name or protocol
- **Add Device**: Create new device configuration
- **Edit Device**: Modify existing device settings
- **Delete Device**: Remove device with confirmation

### Tags (`/tags` - Coming Soon)

Tag browser for viewing and editing data tags:

- Browse tags by device
- Configure scaling, offsets, units
- Set poll intervals per tag

### System (`/system`)

Real-time health monitoring:

- **Gateway Core Status**: API health and uptime
- **PostgreSQL Status**: Database connectivity
- **MQTT Broker Status**: Message broker connection
- **Architecture Diagram**: Visual system overview

## Technology Stack

| Component  | Technology        | Why                         |
| ---------- | ----------------- | --------------------------- |
| Framework  | React 18          | Modern, component-based UI  |
| Build Tool | Vite 5            | Lightning-fast HMR          |
| Styling    | TailwindCSS 3     | Utility-first, dark mode    |
| State      | TanStack Query v5 | Server state management     |
| Routing    | React Router v6   | Client-side navigation      |
| Forms      | React Hook Form   | Performant form handling    |
| Icons      | Lucide React      | Beautiful, consistent icons |
| TypeScript | 5.4+              | Full type safety            |

## API Client

The `lib/api.ts` provides typed API calls:

```typescript
import { devicesApi, tagsApi, healthApi } from '@/lib/api';

// Devices
const devices = await devicesApi.list();
const device = await devicesApi.get('device-id');
const newDevice = await devicesApi.create({ name: 'PLC', ... });
await devicesApi.update('device-id', { name: 'Updated' });
await devicesApi.delete('device-id');

// Tags
const tags = await tagsApi.listByDevice('device-id');
const tag = await tagsApi.create({ deviceId: '...', name: 'temp', ... });

// Health
const health = await healthApi.ready();
```

## Styling

### Dark Theme

The UI uses a dark theme optimized for industrial environments:

```css
:root {
  --background: 224 71% 4%; /* Deep blue-black */
  --foreground: 213 31% 91%; /* Light gray */
  --primary: 210 40% 98%; /* Near white */
  --accent: 217 33% 17%; /* Muted blue */
  --destructive: 0 63% 31%; /* Dark red */
}
```

### Component Classes

Using TailwindCSS with shadcn/ui patterns:

```tsx
// Button variants
<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
<Button variant="destructive">Danger</Button>
```

## Deployment

### Development

```bash
pnpm dev    # Vite dev server with hot reload
```

### Production Build

```bash
pnpm build  # Creates optimized build in /dist
pnpm preview # Preview production build locally
```

### Docker

```bash
# Build image
docker build -t nexus/web-ui:latest .

# Run container
docker run -d \
  --name web-ui \
  -p 80:80 \
  nexus/web-ui:latest
```

### Nginx Configuration

Production uses Nginx for:

- Static file serving with caching
- API reverse proxy to Gateway Core
- SPA fallback routing
- Gzip compression

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://gateway-core:3001/api/;
    }

    # Health proxy
    location /health {
        proxy_pass http://gateway-core:3001/health;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-ui
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-ui
  template:
    spec:
      containers:
        - name: web-ui
          image: nexus/web-ui:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: '64Mi'
              cpu: '50m'
            limits:
              memory: '128Mi'
              cpu: '100m'
---
apiVersion: v1
kind: Service
metadata:
  name: web-ui
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: web-ui
```

## Development Scripts

```bash
pnpm dev        # Start dev server (port 5173)
pnpm build      # Production build
pnpm preview    # Preview production build
pnpm lint       # ESLint check
pnpm lint:fix   # ESLint auto-fix
pnpm typecheck  # TypeScript check
```

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## Accessibility

- Keyboard navigation support
- ARIA labels on interactive elements
- Focus management in modals
- Color contrast ratios meet WCAG AA

## Roadmap

### Completed ✅

- Device list with search/filter
- Add/Edit device dialog (basic)
- Delete device with confirmation
- System health overview
- Dark theme
- Responsive layout

### In Progress 🔄

- Protocol-specific config fields
- Tag browser UI

### Planned 📋

- Dashboard with metrics
- WebSocket real-time updates
- Tag configuration UI
- User authentication
- Role-based access control
- Audit log viewer

## Troubleshooting

### API Connection Issues

```bash
# Check Gateway Core is running
curl http://localhost:3001/health

# Verify Vite proxy is configured
# Check vite.config.ts proxy settings
```

### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules .vite
pnpm install
pnpm dev
```

### TypeScript Errors

```bash
# Check for type errors
pnpm typecheck

# Generate types from API schema (if using codegen)
pnpm generate-types
```

## Related Documentation

- [Gateway Core](../gateway-core/readme.md)
- [Architecture Overview](../../ARCHITECTURE.md)
- [Roadmap](../../../ROADMAP.md)
