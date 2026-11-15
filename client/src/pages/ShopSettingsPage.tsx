import React, { useState, useEffect } from 'react';
import {
  Settings,
  Store,
  Upload,
  QrCode,
  Save,
  CheckCircle2,
  AlertCircle,
  Building,
  Phone,
  FileText,
  ShieldCheck,
  Printer,
  Zap,
  HelpCircle,
  Smartphone,
  Database,
  HardDrive,
  Download,
  RotateCw,
  Trash2,
  UploadCloud
} from 'lucide-react';
import api from '../services/api';
import { ShopSettings } from '../types';

export const ShopSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [states, setStates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Database Backup & Restore state
  const [backups, setBackups] = useState<{ filename: string; size: string; created_at: string }[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  // File upload state
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const fetchShop = async () => {
    try {
      setLoading(true);
      const [shopRes, statesRes] = await Promise.all([
        api.get('/shop'),
        api.get('/shop/states')
      ]);
      setSettings(shopRes.data);
      setStates(statesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      setBackupLoading(true);
      const res = await api.get('/backup/list');
      setBackups(res.data || []);
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    fetchShop();
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setMsg(null);
    try {
      const res = await api.post('/backup/create');
      setMsg({ type: 'success', text: `Backup snapshot "${res.data.filename}" created successfully!` });
      fetchBackups();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create database backup.' });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!window.confirm(`⚠️ CAUTION: Restoring database snapshot "${filename}" will restore all sales, inventory, and ledger records to that moment.\n\nA safety backup of your current database will be saved automatically before restoring.\n\nDo you want to proceed?`)) {
      return;
    }
    setRestoringFilename(filename);
    try {
      await api.post(`/backup/restore-existing/${filename}`);
      alert(`Database successfully restored from snapshot "${filename}". The application will now reload.`);
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Restore failed. The current database has been preserved safely.');
    } finally {
      setRestoringFilename(null);
    }
  };

  const handleDownloadBackup = (filename: string) => {
    window.open(`/api/backup/download/${filename}`, '_blank');
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Delete backup file "${filename}"?`)) return;
    try {
      await api.delete(`/backup/${filename}`);
      fetchBackups();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete backup.');
    }
  };

  const handleUploadDatabaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!window.confirm(`⚠️ CAUTION: You are uploading "${file.name}" to replace your active database.\n\nA pre-restore backup will be created automatically.\n\nProceed?`)) {
      return;
    }
    const data = new FormData();
    data.append('backup_file', file);
    try {
      await api.post('/backup/restore', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('Database restored successfully from uploaded file. Reloading...');
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload restore failed. Verify it is a valid SQLite .db file.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMsg(null);

    try {
      const res = await api.put('/shop', settings);
      setSettings(res.data);
      setMsg({ type: 'success', text: 'Shop configuration & GST settings saved successfully.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update shop settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadQrCode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const data = new FormData();
    data.append('qr_code', file);

    try {
      const res = await api.post('/shop/qr-code', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSettings(prev => prev ? { ...prev, qr_code_url: res.data.qr_code_url } : null);
      setMsg({ type: 'success', text: 'New UPI payment QR code uploaded and active on all printed bills.' });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload QR code.');
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const data = new FormData();
    data.append('logo', file);

    try {
      const res = await api.post('/shop/logo', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSettings(prev => prev ? { ...prev, logo_url: res.data.logo_url } : null);
      setMsg({ type: 'success', text: 'Shop logo updated successfully.' });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload logo.');
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Shop Configuration & GST Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Configure your textile store details, tax credentials, invoice prefixes, and fixed payment QR code.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
          msg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* ROW 1: STORE IDENTITY & GST DETAILS */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-indigo-600">
            <Store className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Textile Store Profile & Invoice Header
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            
            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Textile Shop Name (Printed in bold header) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.shop_name}
                onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Store Tagline / Subtitle
              </label>
              <input
                type="text"
                value={settings.tagline}
                onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                placeholder="e.g. Pure Silks • Sarees • Ready-mades"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Complete Shop Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Location / Area
              </label>
              <input
                type="text"
                value={settings.location || ''}
                onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.city}
                onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                District <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.district}
                onChange={(e) => setSettings({ ...settings, district: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                State (Determines Intra/Inter-state GST) <span className="text-red-500">*</span>
              </label>
              <select
                value={settings.state_code}
                onChange={(e) => {
                  const code = e.target.value;
                  const matched = states.find(s => s.code === code);
                  setSettings({
                    ...settings,
                    state_code: code,
                    state: matched ? matched.name : settings.state
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
              >
                {states.map(s => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                PIN Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.pincode}
                onChange={(e) => setSettings({ ...settings, pincode: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Primary Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.contact_number}
                onChange={(e) => setSettings({ ...settings, contact_number: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Alternate Phone
              </label>
              <input
                type="text"
                value={settings.alt_contact || ''}
                onChange={(e) => setSettings({ ...settings, alt_contact: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Store Email Address
              </label>
              <input
                type="email"
                value={settings.email || ''}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                GSTIN Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.gstin}
                onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold uppercase text-indigo-600"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Invoice Prefix Code
              </label>
              <input
                type="text"
                value={settings.invoice_prefix}
                onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value.toUpperCase() })}
                placeholder="e.g. SLT or TEX"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Invoice Starting Sequence Number
              </label>
              <input
                type="number"
                value={settings.invoice_starting_number}
                onChange={(e) => setSettings({ ...settings, invoice_starting_number: parseInt(e.target.value, 10) || 1001 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

          </div>
        </div>

        {/* ROW 2: THERMAL PRINTER CONFIGURATION */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-indigo-600">
              <Printer className="w-5 h-5" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Thermal Printer & Paper Roll Configuration
              </h3>
            </div>
            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold border border-indigo-200 dark:border-indigo-800">
              Thermal Rolls Only (Zero A4)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 80mm Option */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                (settings.thermal_paper_width || '80mm') === '80mm'
                  ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/50'
              }`}
            >
              <input
                type="radio"
                name="thermal_paper_width"
                value="80mm"
                checked={(settings.thermal_paper_width || '80mm') === '80mm'}
                onChange={() => setSettings({ ...settings, thermal_paper_width: '80mm' })}
                className="mt-1 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    80mm Thermal Paper Roll (Standard)
                  </span>
                  <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Standard 3-inch roll width (approx. 48-64 columns). Ideal for full itemized details, cloth specifications, HSN, and GST tax breakdowns.
                </p>
                <div className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Paper width: 72mm - 80mm • Continuous roll height
                </div>
              </div>
            </label>

            {/* 58mm Option */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                settings.thermal_paper_width === '58mm'
                  ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/50'
              }`}
            >
              <input
                type="radio"
                name="thermal_paper_width"
                value="58mm"
                checked={settings.thermal_paper_width === '58mm'}
                onChange={() => setSettings({ ...settings, thermal_paper_width: '58mm' })}
                className="mt-1 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    58mm Thermal Paper Roll (Compact)
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    Handheld / Mini
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Compact 2-inch roll width (approx. 32-36 columns). Optimized layout for portable handheld thermal printers and compact POS counters.
                </p>
                <div className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Paper width: 48mm - 58mm • Auto wrapping & compact tables
                </div>
              </div>
            </label>

          </div>

          {/* Browser Printer Setup Instructions */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              <span>Recommended Browser Print Settings for Thermal POS Printers:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold block text-slate-900 dark:text-slate-200">Destination:</span>
                Your Thermal POS Printer
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold block text-slate-900 dark:text-slate-200">Paper Size:</span>
                80mm / 58mm Roll or Receipt
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold block text-slate-900 dark:text-slate-200">Margins:</span>
                None (or Minimum)
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold block text-slate-900 dark:text-slate-200">Headers / Footers:</span>
                Unchecked (Disabled)
              </div>
            </div>
          </div>
        </div>

        {/* ROW 3: MERCHANT UPI SETTINGS & SCAN-TO-PAY CONFIGURATION */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-indigo-600">
              <QrCode className="w-5 h-5" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Merchant UPI Settings &amp; Payment QR Configuration
              </h3>
            </div>
            {settings.upi_id ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active VPA: {settings.upi_id}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-full text-xs font-bold border border-red-200 dark:border-red-800">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>UPI ID Missing</span>
              </div>
            )}
          </div>

          {!settings.upi_id && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Warning: Merchant UPI ID is empty! Dynamic UPI QR codes cannot be generated on printed bills until a valid UPI VPA is configured below.</span>
            </div>
          )}

          {/* QR Mode Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Payment QR Configuration:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (settings.qr_mode || 'dynamic') === 'dynamic'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="qr_mode"
                  value="dynamic"
                  checked={(settings.qr_mode || 'dynamic') === 'dynamic'}
                  onChange={() => setSettings({ ...settings, qr_mode: 'dynamic' })}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      ⚡ Dynamic UPI Amount QR (Exact Payable Amount)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    When the customer scans the QR code using Google Pay, PhonePe, Paytm, or BHIM, their mobile app <strong>automatically displays the exact payable bill amount</strong> (or remaining balance due if partially paid). No manual typing required.
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded inline-block">
                    Format: upi://pay?pa={settings.upi_id || 'YOUR_UPI_ID'}&amp;am=[BILL_AMOUNT]
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  settings.qr_mode === 'static'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="qr_mode"
                  value="static"
                  checked={settings.qr_mode === 'static'}
                  onChange={() => setSettings({ ...settings, qr_mode: 'static' })}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-slate-500" />
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      Original Uploaded Static QR Image
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Prints the exact static merchant QR image uploaded below. The customer must manually type in the bill total in their UPI app when paying.
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">
                    Uses fixed uploaded image file without embedded amount parameter
                  </div>
                </div>
              </label>

            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start pt-2">
            
            {/* QR Code Preview Display */}
            <div className="md:col-span-4 flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Merchant Uploaded QR Code:
              </span>
              
              <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-300">
                <img
                  src={settings.qr_code_url || '/uploads/default_upi_qr.jpg'}
                  alt="Shop UPI QR Code"
                  className="w-40 h-40 object-contain"
                  style={{ imageRendering: 'crisp-edges' }}
                />
              </div>

              <div className="mt-3 text-center">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  Replace QR Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadQrCode}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-slate-400 mt-1">
                  Decoded VPA: nawazrifan33@oksbi
                </p>
              </div>
            </div>

            {/* Merchant UPI Configuration Inputs */}
            <div className="md:col-span-8 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Merchant UPI VPA / ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.upi_id}
                    onChange={(e) => setSettings({ ...settings, upi_id: e.target.value })}
                    placeholder="e.g. nawazrifan33@oksbi"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-indigo-600"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Decoded from merchant QR: nawazrifan33@oksbi
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Merchant Payee Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.upi_payee_name || ''}
                    onChange={(e) => setSettings({ ...settings, upi_payee_name: e.target.value })}
                    placeholder="e.g. Nawaz Rifan"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Displayed in customer payment confirmation
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Prominent Bill Footer Message
                </label>
                <input
                  type="text"
                  value={settings.footer_text}
                  onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Terms & Conditions (Printed on Invoice)
                </label>
                <textarea
                  rows={3}
                  value={settings.terms_conditions}
                  onChange={(e) => setSettings({ ...settings, terms_conditions: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

            </div>

          </div>
        </div>

        {/* DATABASE BACKUP & SAFETY RESTORE SECTION */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Automatic & On-Demand Database Backup & Restore
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily automated snapshots and on-demand database exports to protect your store data.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors">
                <UploadCloud className="w-3.5 h-3.5" />
                Upload & Restore DB
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={handleUploadDatabaseFile}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5" />
                {creatingBackup ? 'Creating Snapshot...' : 'Backup Database Now'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Saved Backup Snapshots ({backups.length})</span>
              <span>Sorted by newest</span>
            </div>

            {backupLoading ? (
              <div className="py-6 text-center text-slate-400 text-xs">Loading backup catalog...</div>
            ) : backups.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No backup files found yet. Click "Backup Database Now" to take your first safety snapshot.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {backups.map((b) => (
                  <div key={b.filename} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="space-y-0.5">
                      <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{b.filename}</span>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.2 rounded font-sans">
                          {b.size}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Created: {new Date(b.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadBackup(b.filename)}
                        className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="Download backup file to your computer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>

                      <button
                        type="button"
                        disabled={restoringFilename === b.filename}
                        onClick={() => handleRestoreBackup(b.filename)}
                        className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Safely restore database from this snapshot"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${restoringFilename === b.filename ? 'animate-spin' : ''}`} />
                        {restoringFilename === b.filename ? 'Restoring...' : 'Restore'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(b.filename)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        title="Delete this snapshot file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Configuration...' : 'Save All Shop Settings'}
          </button>
        </div>

      </form>

    </div>
  );
};

