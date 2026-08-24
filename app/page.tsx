import StockDashboard from '@/components/stock-dashboard';
import { createBaselineDashboard } from '@/lib/stock-data';

export default function Home() {
  return <StockDashboard initialData={createBaselineDashboard()} />;
}
