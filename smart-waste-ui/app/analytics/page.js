"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { Activity, Battery, Flame, Trash2, Download, Filter } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AnalyticsDashboard() {
  const [bins, setBins] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [binsResp, alertsResp] = await Promise.all([
          fetch('http://127.0.0.1:8000/api/bins'),
          fetch('http://127.0.0.1:8000/api/alerts')
        ]);
        const [binsData, alertsData] = await Promise.all([binsResp.json(), alertsResp.json()]);
        if (binsData.data) setBins(binsData.data.sort((a,b) => a.bin_id.localeCompare(b.bin_id)));
        if (alertsData.data) setAlerts(alertsData.data);
      } catch (e) {
        // quiet fail
      }
    };
    fetchData();
    const inv = setInterval(fetchData, 10000);
    return () => clearInterval(inv);
  }, []);

  const totalBins = bins.length;
  const avgFill = totalBins ? (bins.reduce((acc, bin) => acc + bin.fill_percentage, 0) / totalBins).toFixed(1) + "%" : "0%";
  const fireIncidents = alerts.filter(a => a.type === 'CRITICAL').length;
  const avgBattery = totalBins ? (bins.reduce((acc, bin) => acc + bin.battery_status, 0) / totalBins).toFixed(1) + "%" : "0%";


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">System Analytics</h1>
          <p className="text-slate-400 font-medium mt-1">Detailed performance metrics across the Dehradun IoT network.</p>
        </div>
        <div className="flex space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter size={18} />
            <span>Filter</span>
          </button>
          <button
            onClick={() => window.open('http://127.0.0.1:8000/api/reports/export?scope=all', '_blank')}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
          >
            <Download size={18} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Bins" value={totalBins === 0 ? "..." : totalBins} icon={<Trash2 size={22} className="text-emerald-500" />} color="bg-emerald-50" />
        <MetricCard title="Avg Fill Level" value={totalBins === 0 ? "..." : avgFill} icon={<Activity size={22} className="text-blue-500" />} color="bg-blue-50" />
        <MetricCard title="Fire Incidents" value={totalBins === 0 ? "..." : fireIncidents.toString().padStart(2, '0')} icon={<Flame size={22} className="text-rose-500" />} color="bg-rose-50" />
        <MetricCard title="Battery Health" value={totalBins === 0 ? "..." : avgBattery} icon={<Battery size={22} className="text-amber-500" />} color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Fill Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 font-sans">Fill Distribution</h2>
          <div className="h-[350px] w-full min-w-[0px] min-h-[0px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} domain={[0, 100]} />
                <Tooltip
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Bar dataKey="fill_percentage" name="Fill (%)" radius={[8, 8, 0, 0]}>
                  {bins.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill_percentage >= 80 ? '#ef4444' : COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Temperature Trends */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Thermal Variance</h2>
          <div className="h-[350px] w-full min-w-[0px] min-h-[0px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bin_id" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                />
                <Line type="stepAfter" dataKey="temperature" name="Temp (°C)" stroke="#10b981" strokeWidth={3} dot={{ r: 6, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetricCard({ title, value, icon, color }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex items-center space-x-5">
      <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{title}</p>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      </div>
    </div>
  );
}