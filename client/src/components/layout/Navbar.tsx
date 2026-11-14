import React from 'react';
import { Sun, Moon, LogOut, User, PlusCircle, Store, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface NavbarProps {
  onNavigate: (tab: string) => void;
  activeTab: string;
  lowStockCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate, lowStockCount = 0 }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors shadow-xs">
      
      {/* Left: Brand / Shop identifier */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Store className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
            TEXTILE POS & ERP
            <span className="text-[10px] uppercase font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
              GST Ready
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Professional Retail & Wholesale Textile Management
          </p>
        </div>
      </div>

      {/* Right: Quick actions, notifications, theme toggle, user pill */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* Fast "New Bill" Button */}
        <button
          onClick={() => onNavigate('billing')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">New Billing (F2)</span>
          <span className="sm:hidden">Bill</span>
        </button>

        {/* Low Stock Warning Pill */}
        {lowStockCount > 0 && (
          <button
            onClick={() => onNavigate('products')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors"
            title={`${lowStockCount} products are low on stock`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            <span className="hidden md:inline">Low Stock:</span>
            <span className="font-bold">{lowStockCount}</span>
          </button>
        )}

        {/* Dark / Light Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-400" />}
        </button>

        {/* User Profile Pill */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <User className="w-4 h-4" />
            </div>
            <div className="hidden lg:block text-left">
              <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                {user.full_name}
              </div>
              <div className="text-[10px] font-semibold uppercase text-indigo-600 dark:text-indigo-400">
                {user.role}
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ml-1"
              title="Logout session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </header>
  );
};

