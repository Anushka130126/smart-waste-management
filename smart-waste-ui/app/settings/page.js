"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Shield, Save, RefreshCw, Server, AlertCircle, Info } from 'lucide-react';

export default function SettingsPage() {
  const defaultSettings = {
    thresholds: { fill_critical: 80, temp_critical: 75, battery_warning: 20 },
    system_info: { sector: "Dehradun Sector", admin: "Devesh Khurana", version: "1.0.0" }
  };

  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/settings');
        const data = await resp.json();

        // Deep merge the database settings with our safe defaults to prevent crashes
        if (data && Object.keys(data).length > 0) {
          setSettings({
            thresholds: data.thresholds || defaultSettings.thresholds,
            system_info: data.system_info || defaultSettings.system_info
          });
        }
      } catch (e) {
        console.error("Failed to load settings, using defaults.");
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdate = async (key, value) => {
    setSaving(true);
    // Optimistically update UI
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      await fetch(`http://127.0.0.1:8000/api/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
    } catch (e) {
      alert("Failed to save settings to database.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20 animate-pulse text-slate-400 font-bold uppercase tracking-widest">
      <RefreshCw className="animate-spin mr-3" /> Syncing Configurations...
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800">System Settings</h1>
          <p className="text-slate-400 font-medium mt-1">Configure global IoT thresholds and administrative metadata.</p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center ${saving ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
          {saving && <RefreshCw size={14} className="animate-spin mr-2" />}
          {saving ? 'Saving...' : 'All synced'}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Thresholds Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-rose-50 text-rose-500 rounded-lg"><Bell size={20}/></div>
            <h2 className="text-xl font-bold text-slate-800">Alert Thresholds</h2>
          </div>

          <div className="space-y-4">
            <SettingInput
              label="Critical Fill Level (%)"
              value={settings?.thresholds?.fill_critical || 80}
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, fill_critical: parseInt(v) || 0})}
            />
            <SettingInput
              label="Critical Temperature (°C)"
              value={settings?.thresholds?.temp_critical || 75}
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, temp_critical: parseInt(v) || 0})}
            />
            <SettingInput
              label="Battery Warning (%)"
              value={settings?.thresholds?.battery_warning || 20}
              onChange={(v) => handleUpdate('thresholds', {...settings.thresholds, battery_warning: parseInt(v) || 0})}
            />
          </div>
        </section>

        {/* System Info Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Server size={20}/></div>
            <h2 className="text-xl font-bold text-slate-800">Metadata</h2>
          </div>

          <div className="space-y-4">
            <SettingInput
              label="Sector Location"
              value={settings?.system_info?.sector || ""}
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, sector: v})}
            />
            <SettingInput
              label="Admin Name"
              value={settings?.system_info?.admin || ""}
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, admin: v})}
            />
            <SettingInput
              label="System Version"
              value={settings?.system_info?.version || "1.0.0"}
              onChange={(v) => handleUpdate('system_info', {...settings.system_info, version: v})}
              disabled
            />
          </div>
        </section>
      </div>

      <div className="bg-slate-900 p-8 rounded-3xl flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-white/10 text-white rounded-2xl"><Shield size={24}/></div>
          <div>
            <h3 className="text-white font-bold">Persistence Layer</h3>
            <p className="text-slate-400 text-sm">Changes are applied immediately across all IoT listeners.</p>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center"
        >
          <RefreshCw size={18} className="mr-2" /> Force Global Refresh
        </button>
      </div>
    </motion.div>
  );
}

function SettingInput({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}