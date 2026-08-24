import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StockDashboard from '@/components/stock-dashboard';
import { createBaselineDashboard } from '@/lib/stock-data';
import '@/app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <StockDashboard
      initialData={createBaselineDashboard()}
      dataUrl={`${import.meta.env.BASE_URL}data/dashboard.json`}
    />
  </StrictMode>,
);
