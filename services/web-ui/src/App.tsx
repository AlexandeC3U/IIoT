import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/toaster';
import { DevicesPage } from '@/pages/devices/DevicesPage';
import { SystemPage } from '@/pages/system/SystemPage';
import { Navigate, Route, Routes } from 'react-router-dom';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/devices" replace />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

