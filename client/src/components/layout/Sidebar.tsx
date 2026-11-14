import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  History,
  Package,
  Users,
  FileSpreadsheet,
  TrendingUp,
  CreditCard,
  Wallet,
  ShieldCheck,
  Settings,
  Scissors
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate }) => {
  const { isAdmin } = useAuth();

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'billing', label: 'New Billing', icon: Receipt, primary: true },
    { id: 'history', label: 'Billing History', icon: History },
    { id: 'products', label: 'Products & Inventory', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'gst', label: 'GST Reports', icon: FileSpreadsheet },
    { id: 'analytics', label: 'Sales Analytics', icon: TrendingUp },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'expenses', label: 'Expenses & P&L', icon: Wallet },
    ...(isAdmin ? [{ id: 'users', label: 'User & Security', icon: ShieldCheck }] : []),
    ...(isAdmin ? [{ id: 'settings', label: 'Shop Settings', icon: Settings }] : [])
  ];

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 transition-colors h-[calc(100vh-4rem)] sticky top-16 select-none overflow-y-auto">
      
      {/* Navigation Links */}
      <div className="p-3 space-y-1.5">
        <div className="px-3 py-2 text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
          Core Operations
        </div>

        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          if (item.primary) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200/80 dark:border-indigo-800/80'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto text-[10px] bg-indigo-700/80 text-white px-1.5 py-0.5 rounded font-mono font-bold">
                  POS
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-colors text-left ${
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer Branding */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
          <Scissors className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Textile ERP Engine</span>
        </div>
        <p className="text-[11px] mt-1 text-slate-400 dark:text-slate-500">
          GST Intra/Inter State • Version 1.0.0
        </p>
      </div>

    </aside>
  );
};

