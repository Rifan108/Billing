import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Key,
  Database,
  Download,
  Upload,
  RefreshCw,
  History,
  Lock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import api from '../services/api';
import { User, AuditLog } from '../types';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'staff',
    phone: ''
  });

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, auditRes, backupsRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/audit?limit=50'),
        api.get('/backup')
      ]);
      setUsers(usersRes.data);
      setAuditLogs(auditRes.data);
      setBackups(backupsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/users', userFormData);
      setMsg({ type: 'success', text: `User "${userFormData.username}" created successfully.` });
      setShowAddUserModal(false);
      setUserFormData({ username: '', password: '', full_name: '', role: 'staff', phone: '' });
      fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create user.' });
    }
  };

  // Create Manual Backup
  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await api.post('/backup/create');
      setMsg({ type: 'success', text: `Database backup created: ${res.data.filename}` });
      fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Backup creation failed.' });
    } finally {
      setBackupLoading(false);
    }
  };

  // Restore Database
  const handleRestoreBackup = async () => {
    if (!restoreFile) {
      alert('Please choose a .db backup file to restore.');
      return;
    }
    if (!window.confirm('WARNING: Restoring will overwrite current database records with the backup. A safety copy of current data will be saved. Continue?')) {
      return;
    }

    setRestoreLoading(true);
    try {
      const data = new FormData();
      data.append('backup_file', restoreFile);
      const res = await api.post('/backup/restore', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(res.data.message);
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Restore failed.');
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            User Roles, Security & System Backups
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Control terminal operator permissions, review audit logs of sensitive operations, and manage database snapshots.
          </p>
        </div>

        <button
          onClick={() => setShowAddUserModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Add Authorized User
        </button>
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

      {/* ROW 1: USERS LIST & DATABASE BACKUP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Users Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-base">
            Authorized Users & Roles
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">Username</th>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-mono font-bold text-slate-950 dark:text-white">
                      {u.username}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-200">
                      {u.full_name}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === 'admin'
                          ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400'
                          : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500">{u.phone || '-'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Database Backup & Restore (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Database className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Database Backup & Restore
            </h3>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Protect financial, tax, customer, and invoice records with instant database snapshots.
          </p>

          <div className="space-y-3 pt-2">
            
            {/* Create manual backup */}
            <button
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {backupLoading ? 'Creating Backup...' : 'Take Immediate SQLite Backup'}
            </button>

            {/* Restore form */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                Restore From Backup File (.db):
              </span>
              <input
                type="file"
                accept=".db,.sqlite"
                onChange={(e) => setRestoreFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-slate-500 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-200 dark:file:bg-slate-700"
              />
              <button
                onClick={handleRestoreBackup}
                disabled={restoreLoading || !restoreFile}
                className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {restoreLoading ? 'Restoring DB...' : 'Upload & Restore Database'}
              </button>
            </div>

            {/* Backups List */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Previous Backups:
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
                    <div>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-bold block">{b.filename}</span>
                      <span className="text-[10px] text-slate-400">{b.created_at} • {(b.filesize / 1024).toFixed(1)} KB</span>
                    </div>
                    <a
                      href={`/api/backup/download/${b.filename}`}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg"
                      title="Download backup file"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* ROW 2: SENSITIVE OPERATIONS AUDIT TRAIL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-900 dark:text-white text-base">
            System Financial & Modification Audit Trail
          </h3>
        </div>

        <p className="text-xs text-slate-500">
          Permanent chronological log of billing generation, cancellations, refunds, stock adjustments, and settings updates.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Operator</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Entity Type</th>
                <th className="py-2.5 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{log.created_at}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{log.user_name}</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{log.entity_type || '-'}</td>
                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-sans text-xs">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Create Operator Account
              </h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value.toLowerCase() })}
                  placeholder="e.g. cashier1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.full_name}
                  onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                  placeholder="e.g. Meena Sundaram"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Initial Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Role
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-bold"
                  >
                    <option value="staff">Staff (POS Billing)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Mobile Phone
                  </label>
                  <input
                    type="text"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md text-xs"
                >
                  Save User
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

