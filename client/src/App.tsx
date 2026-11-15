import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BillingPage } from './pages/BillingPage';
import { BillingHistoryPage } from './pages/BillingHistoryPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { CustomersPage } from './pages/CustomersPage';
import { GstReportsPage } from './pages/GstReportsPage';
import { SalesAnalyticsPage } from './pages/SalesAnalyticsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { UsersPage } from './pages/UsersPage';
import { ShopSettingsPage } from './pages/ShopSettingsPage';
import { PrintableInvoice } from './components/billing/PrintableInvoice';
import { Invoice } from './types';
import api from './services/api';

const MainApp: React.FC = () => {
  const { user, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [autoPrintActiveInvoice, setAutoPrintActiveInvoice] = useState<boolean>(false);
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  // Check low stock count periodically
  useEffect(() => {
    if (user) {
      api.get('/products/alerts/status')
        .then(res => {
          setLowStockCount(res.data.low_stock_count || 0);
        })
        .catch(() => { });
    }
  }, [user, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleOpenInvoice = (inv: Invoice, autoPrint = false) => {
    // If inv doesn't have items or shop, fetch full invoice
    if (!inv.items || !inv.shop) {
      api.get(`/invoices/${inv.id}`).then(res => {
        setActiveInvoice(res.data);
        setAutoPrintActiveInvoice(autoPrint);
      });
    } else {
      setActiveInvoice(inv);
      setAutoPrintActiveInvoice(autoPrint);
    }
  };

  const handleInvoiceCreated = (inv: Invoice, autoPrint = true) => {
    setActiveInvoice(inv);
    setAutoPrintActiveInvoice(autoPrint);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        lowStockCount={lowStockCount}
      />

      {/* Main Workspace with Sidebar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onNavigate={setActiveTab}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardPage
              onNavigate={setActiveTab}
              onViewInvoice={handleOpenInvoice}
            />
          )}

          {activeTab === 'billing' && (
            <BillingPage
              onInvoiceCreated={handleInvoiceCreated}
            />
          )}

          {activeTab === 'history' && (
            <BillingHistoryPage
              onViewInvoice={handleOpenInvoice}
            />
          )}

          {activeTab === 'returns' && (
            <ReturnsPage />
          )}

          {activeTab === 'products' && (
            <ProductsPage />
          )}

          {activeTab === 'purchases' && (
            <PurchasesPage />
          )}

          {activeTab === 'customers' && (
            <CustomersPage
              onViewInvoice={handleOpenInvoice}
            />
          )}

          {activeTab === 'gst' && (
            <GstReportsPage />
          )}

          {activeTab === 'analytics' && (
            <SalesAnalyticsPage />
          )}

          {activeTab === 'payments' && (
            <PaymentsPage />
          )}

          {activeTab === 'expenses' && (
            <ExpensesPage />
          )}

          {activeTab === 'users' && isAdmin && (
            <UsersPage />
          )}

          {activeTab === 'settings' && isAdmin && (
            <ShopSettingsPage />
          )}
        </main>

      </div>

      {/* PRINTABLE BILL MODAL (PORTRAIT 3:4 ASPECT RATIO) */}
      {activeInvoice && (
        <PrintableInvoice
          invoice={activeInvoice}
          autoPrint={autoPrintActiveInvoice}
          onClose={() => setActiveInvoice(null)}
        />
      )}

    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
