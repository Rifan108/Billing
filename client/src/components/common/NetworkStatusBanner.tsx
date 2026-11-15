import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const NetworkStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showReconnectedAlert, setShowReconnectedAlert] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedAlert(true);
      const timer = setTimeout(() => {
        setShowReconnectedAlert(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnectedAlert(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md">
        <WifiOff className="w-4 h-4 animate-pulse" />
        <span>No internet connection detected. Offline changes will not synchronize with the server until connected.</span>
      </div>
    );
  }

  if (showReconnectedAlert) {
    return (
      <div className="bg-emerald-600 text-white px-4 py-2 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md transition-all">
        <Wifi className="w-4 h-4" />
        <span>Network connection restored. Active session synchronized.</span>
      </div>
    );
  }

  return null;
};
