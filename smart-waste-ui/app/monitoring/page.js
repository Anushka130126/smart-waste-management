"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Battery, Flame, Trash2, Filter, Search, Activity, RefreshCw } from 'lucide-react';

export default function Monitoring() {
  const [bins, setBins] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchBins = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/bins');
      const data = await resp.json();
      if (data.data) setBins(data.data);
    } catch (e) {
      console.error("Failed to fetch bins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBins();
    const inv = setInterval(fetchBins, 5000);
    return () => clearInterval(inv);
  }, []);

  const filteredBins = bins.filter(b => {
    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL') return b.status === 'FIRE_ALERT' || b.fill_percentage >= 90;
    if (filter === 'WARNING') return b.status === 'MAINTENANCE' || (b.fill_percentage >= 70 && b.fill_percentage < 90);
    return true;
  });

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Live Network Telemetry</h1>
          <p className="text-slate-400 font-medium mt-1">Real-time status tracking for all deployed ultrasonic bin sensors.</p>
        </div>
        <div className="flex border border-slate-200 bg-white rounded-2xl p-1.5 shadow-sm">
          <FilterButton label="All" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <FilterButton label="Critical" active={filter === 'CRITICAL'} onClick={() => setFilter('CRITICAL')} color="rose" />
          <FilterButton label="Warning" active={filter === 'WARNING'} onClick={() => setFilter('WARNING')} color="amber" />
        </div>
      </header>

      {loading && bins.length === 0 ? (
        <div className="p-20 text-center font-bold text-slate-300 uppercase tracking-widest animate-pulse flex items-center justify-center">
          <RefreshCw className="animate-spin mr-3" /> Establishing Data Stream...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredBins.map(bin => (
              <motion.div 
                key={bin.bin_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <SensorCard bin={bin} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick, color }) {
  const activeStyles = {
    rose: 'bg-rose-600 text-white shadow-lg shadow-rose-200',
    amber: 'bg-amber-500 text-white shadow-lg shadow-amber-200',
    default: 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
  };
  
  return (
    <button 
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${active ? (activeStyles[color] || activeStyles.default) : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );
}

function SensorCard({ bin }) {
  const isCritical = bin.status === 'FIRE_ALERT' || bin.fill_percentage >= 90;
  
  return (
    <div className={`bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm relative overflow-hidden group transition-all duration-500 ${isCritical ? 'ring-2 ring-rose-300 ring-offset-4 ring-offset-slate-50' : ''}`}>
      {isCritical && (
        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-20 transition-opacity">
          <Flame size={100} className="text-rose-500" />
        </div>
      )}

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{bin.bin_id}</h3>
          <p className="text-[10px] font-black text-slate-300 tracking-tighter">S/N: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isCritical ? 'bg-rose-50 text-rose-500' : (bin.fill_percentage >= 70 ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-600')}`}>
          {bin.status}
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        <div>
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-bold text-slate-400">Fill Percentage</span>
            <span className={`text-xl font-black ${bin.fill_percentage >= 90 ? 'text-rose-600' : 'text-slate-800'}`}>{bin.fill_percentage}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${bin.fill_percentage}%` }}
              className={`h-full transition-all duration-1000 ${bin.fill_percentage >= 90 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : (bin.fill_percentage >= 70 ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_4px_10px_rgba(16,185,129,0.3)]')}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl bg-slate-50 ${bin.temperature > 50 ? 'text-rose-500' : 'text-slate-400'}`}><Flame size={18}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Temp</p>
              <p className="font-bold text-slate-800">{bin.temperature}°C</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl bg-slate-50 ${bin.battery_status < 20 ? 'text-rose-500' : 'text-slate-400'}`}><Battery size={18}/></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Battery</p>
              <p className="font-bold text-slate-800">{bin.battery_status}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
