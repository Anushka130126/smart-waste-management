"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, CheckCircle, Truck, Zap, ArrowUpRight, ArrowDownRight, 
  Activity, X, Navigation, RefreshCw, FileText, Download, ShieldCheck
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

export default function AdminDashboard() {
  const [bins, setBins] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('today');

  const fetchData = async () => {
    try {
      const [binsResp, alertsResp, fleetResp] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/bins'),
        fetch('http://127.0.0.1:8000/api/alerts'),
        fetch('http://127.0.0.1:8000/api/fleet')
      ]);
      const [binsData, alertsData, fleetData] = await Promise.all([binsResp.json(), alertsResp.json(), fleetResp.json()]);
      if (binsData.data) setBins(binsData.data.sort((a,b) => a.bin_id.localeCompare(b.bin_id)));
      if (alertsData.data) setAlerts(alertsData.data);
      if (fleetData.data) setFleet(fleetData.data);
    } catch (e) {
      console.warn("Dashboard sync warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(fetchData, 5000);
    return () => clearInterval(inv);
  }, []);

  const handleExport = () => {
    window.open(`http://127.0.0.1:8000/api/reports/export?scope=${exportScope}`, '_blank');
    setShowExportModal(false);
  };

  const activeBinsRes = bins.length;
  const criticalCount = bins.filter(b => b.status === 'FIRE_ALERT' || b.fill_percentage >= 90).length;
  const onRouteCount = fleet.filter(f => f.status === 'On Route').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Network Health"
          value={loading ? "..." : "Optimal"}
          sub="99% Database Sync"
          icon={<ShieldCheck size={22} className="text-emerald-500" />}
          trend={+1.2}
        />
        <StatCard
          title="Monitored Bins"
          value={loading ? "..." : activeBinsRes}
          sub="Live Telemetry Nodes"
          icon={<Zap size={22} className="text-blue-500" />}
          trend={+0.0}
        />
        <StatCard
          title="Operational Trucks"
          value={loading ? "..." : onRouteCount}
          sub="Live From Scheduler"
          icon={<Truck size={22} className="text-indigo-500" />}
          trend={+onRouteCount > 0 ? 100 : 0}
        />
        <StatCard
          title="Critical Tasks"
          value={loading ? "..." : criticalCount}
          sub="High Priority Alerts"
          icon={<AlertTriangle size={22} className="text-rose-500" />}
          trend={+criticalCount > 0 ? 100 : 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col h-[480px]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-800">System Capacity</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Real-time Fill Percentage Trends</p>
            </div>
          </div>
          <div className="flex-1 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bins}>
                <defs>
                  <linearGradient id="colorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="fill_percentage" name="Fill Level %" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl overflow-hidden relative group border border-white/5">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
             <Activity size={140} className="text-emerald-500" />
          </div>

          <h2 className="text-xl font-bold text-white mb-6 relative z-10 flex items-center justify-between">
            <span>Live Feed</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
          </h2>
          <div className="space-y-4 relative z-10 font-mono h-[280px] overflow-y-auto pr-2 custom-scrollbar">
            {alerts.length > 0 ? alerts.map(alert => (
              <IngestionItem
                key={alert.id}
                bin={alert.bin_id}
                status={alert.type}
                data={alert.message}
                color={alert.type === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}
              />
            )) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-white text-xs">
                Scanning IoT Network...
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <button
              onClick={() => window.location.href = '/monitoring'}
              className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-bold hover:bg-emerald-500 transition-all shadow-lg flex items-center justify-center space-x-2"
            >
              <span>Full Telemetry</span>
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-10">
           <div>
              <h2 className="text-2xl font-black text-slate-800">Operations Hub</h2>
              <p className="text-sm text-slate-400 font-medium">Global system control and persistent reporting.</p>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <OpCard
            title="Dynamic Optimizer"
            desc="Run AI recalculation for current full bins across Dehradun sector."
            action="Calculate Route"
            variant="emerald"
            onClick={() => window.location.href='/optimization'}
          />
          <OpCard
            title="Fleet Manager"
            desc="Deploy trucks and manage driver assignments."
            action="Open Scheduler"
            variant="blue"
            onClick={() => window.location.href='/scheduling'}
          />
          <OpCard
            title="System Reporting"
            desc="Generate persistent CSV archives for audit and billing logs."
            action="Generate Report"
            variant="slate"
            onClick={() => setShowExportModal(true)}
          />
        </div>
      </div>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div
               initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
               className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-slate-100 text-slate-800 rounded-3xl mx-auto flex items-center justify-center mb-8">
                 <FileText size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Export Data Archive</h3>
              <p className="text-slate-500 font-medium mb-10">Select the scope of the telemetry report to generate.</p>

              <div className="space-y-4 mb-10">
                <button
                   onClick={() => setExportScope('today')}
                   className={`w-full p-5 rounded-[1.5rem] border-2 transition-all text-left flex items-center justify-between ${exportScope === 'today' ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <span className="font-bold">Today's History</span>
                  {exportScope === 'today' && <CheckCircle size={20} className="text-emerald-600" />}
                </button>
                <button
                   onClick={() => setExportScope('all')}
                   className={`w-full p-5 rounded-[1.5rem] border-2 transition-all text-left flex items-center justify-between ${exportScope === 'all' ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <span className="font-bold">All-Time Database Dump</span>
                  {exportScope === 'all' && <CheckCircle size={20} className="text-emerald-600" />}
                </button>
              </div>

              <div className="flex space-x-4">
                <button onClick={handleExport} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-bold flex items-center justify-center shadow-xl shadow-slate-200">
                   <Download size={20} className="mr-3" /> Start Export
                </button>
                <button onClick={() => setShowExportModal(false)} className="px-8 py-5 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatCard({ title, value, sub, icon, trend }) {
  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 group">
      <div className="flex justify-between items-start mb-6">
        <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-emerald-50 transition-colors">{icon}</div>
        <div className={`flex items-center space-x-1 text-xs font-black ${trend > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(trend)}%</span>
        </div>
      </div>
      <div>
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[2px] mb-2">{title}</h3>
        <p className="text-3xl font-black text-slate-800 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-slate-400 font-bold mt-2 tracking-tight">{sub}</p>
      </div>
    </div>
  );
}

function IngestionItem({ bin, status, data, color }) {
  return (
    <div className="p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-default">
      <div className="flex justify-between text-[10px] font-bold tracking-[2px] mb-2 opacity-50 text-white uppercase">
        <span>{bin}</span>
        <span className={color}>{status}</span>
      </div>
      <p className="text-xs text-slate-200 font-medium leading-relaxed">{data}</p>
    </div>
  );
}

function OpCard({ title, desc, action, variant, onClick }) {
  const styles = {
    emerald: "bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700",
    blue: "bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700",
    slate: "bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800"
  };

  return (
    <div className="p-8 rounded-[2rem] border border-slate-100 bg-slate-50/30 flex flex-col justify-between group transition-all">
      <div>
        <h3 className="text-lg font-black text-slate-800 mb-3">{title}</h3>
        <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">{desc}</p>
      </div>
      <button onClick={onClick} className={`w-full py-4 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 ${styles[variant]}`}>
        {action}
      </button>
    </div>
  );
}