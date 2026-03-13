import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { DeviceDetailPage } from '@/pages/devices/DeviceDetailPage';
import { DevicesPage } from '@/pages/devices/DevicesPage';
import { HealthPage } from '@/pages/health/HealthPage';
import { SystemPage } from '@/pages/system/SystemPage';
import { TagDetailPage } from '@/pages/tags/TagDetailPage';
import { TagsPage } from '@/pages/tags/TagsPage';
import { Navigate, Route, Routes } from 'react-router-dom';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="devices/:id" element={<DeviceDetailPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="tags/:id" element={<TagDetailPage />} />
          <Route path="system" element={<SystemPage />} />
          <Route path="health" element={<HealthPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
