"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, ArrowRight, RefreshCw, AlertCircle, CheckCircle2, Navigation2, Activity, X } from 'lucide-react';
import dynamic from 'next/dynamic';

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs rounded-[2.5rem]">Loading Map Engine...</div>
});

export default function Optimization() {
  const [route, setRoute] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchData, setDispatchData] = useState({ driver_name: "", truck_id: "" });
  const [submittingDispatch, setSubmittingDispatch] = useState(false);
  const [showSensitivityModal, setShowSensitivityModal] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.05);

  const handleDispatch = async (e) => {
    e.preventDefault();
    setSubmittingDispatch(true);
    try {
      await fetch('http://127.0.0.1:8000/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dispatchData,
          zone: "Dynamic Route",
          shift: "Immediate Deployment",
          status: "On Route"
        })
      });
      setShowDispatchModal(false);
      window.location.href = '/scheduling';
    } catch (e) {
      console.error("Dispatch failed");
    } finally {
      setSubmittingDispatch(false);
    }
  };

  const handleSensitivityUpdate = async (e) => {
    e.preventDefault();
    try {
      await fetch('http://127.0.0.1:8000/api/settings/sensitivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity })
      });
      setShowSensitivityModal(false);
      triggerOptimization();
    } catch (e) {}
  };

  const triggerOptimization = async () => {
    setOptimizing(true);
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/routes/optimize');
      const data = await resp.json();
      if (data.optimized_route) {
        setRoute(data.optimized_route);
      }
    } catch (e) {
      console.error("Optimization failed.");
    } finally {
      setOptimizing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSensitivity = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:8000/api/settings/sensitivity');
        const data = await resp.json();
        if (data.threshold !== undefined) setSensitivity(data.threshold);
      } catch (e) {}
    };
    fetchSensitivity();
    triggerOptimization();
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Dynamic Routing</h1>
          <p className="text-slate-400 font-medium mt-1">Shortest-path generation using the Nearest Neighbor algorithm.</p>
        </div>
        <button
          onClick={triggerOptimization}
          disabled={optimizing}
          className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={20} className={`mr-2 ${optimizing ? 'animate-spin' : ''}`} />
          {optimizing ? 'Recalculating...' : 'Trigger Optimizer'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Route Steps */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[600px] flex flex-col">
            <h2 className="text-xl font-bold text-slate-800 mb-8 flex items-center">
              <Navigation className="mr-3 text-emerald-500" /> Planned Path
            </h2>

            <div className="flex-1 space-y-0 relative">
              {/* Central connection line */}
              <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-100 z-0"></div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 font-bold uppercase tracking-widest space-y-4">
                  <RefreshCw className="animate-spin" size={32} />
                  <span>Computing Path...</span>
                </div>
              ) : route.length > 0 ? (
                route.map((node, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="relative flex space-x-6 pb-10 last:pb-0 group"
                  >
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 z-10 flex items-center justify-center font-black text-sm transition-all duration-500 ${node.stop === 'DEPOT' ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                      {i === 0 ? "S" : (i === route.length - 1 ? "E" : i)}
                    </div>
                    <div className="pt-1.5 flex-1 p-5 rounded-2xl border border-slate-50 group-hover:border-emerald-100 group-hover:bg-emerald-50/20 transition-all">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{node.stop}</h4>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{node.reason}</span>
                      </div>
                      <div className="flex items-center space-x-4 mt-3">
                         <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                          <MapPin size={12} className="mr-1 opacity-50" /> {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-4">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                  <p className="font-bold text-slate-800">Clear Network</p>
                  <p className="text-sm text-slate-400">All bins are currently below collection thresholds. No route needed.</p>
                </div>
              )}
            </div>

            {route.length > 0 && (
              <button
                onClick={() => setShowDispatchModal(true)}
                className="w-full mt-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-100 transition-all flex items-center justify-center space-x-2"
              >
                <span>Dispatch to Fleet</span>
                <Navigation2 size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Console / Map Placeholder */}
        <div className="lg:col-span-2 flex flex-col h-full space-y-6">
          <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-50 opacity-40"></div>

            <div className="absolute inset-0 z-0">
              <RouteMap route={route} />
            </div>

            {route.length > 0 && (
              <div className="absolute top-6 right-6 z-10 bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl flex space-x-4 border border-white">
                <Stat label="Total Stops" value={route.length} />
                <Stat label="Est. Drive" value={route.length * 4 + " mins"} />
              </div>
            )}
          </div>

          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex justify-between items-center group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 transform translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-700 opacity-20">
              <Activity size={120} className="text-emerald-500" />
            </div>
            <div className="relative z-10">
              <h4 className="font-bold text-lg mb-1">Algorithm Sensitivity</h4>
              <p className="text-slate-400 text-sm">Nearest Neighbor prioritization active with ΔR threshold of {sensitivity}.</p>
            </div>
            <button
              onClick={() => setShowSensitivityModal(true)}
              className="relative z-10 px-6 py-3 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-2xl font-bold transition-all flex items-center transform group-hover:scale-105"
            >
              <span>Adjust Sensitivity</span>
              <ArrowRight size={18} className="ml-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Dispatch Modal */}
      <AnimatePresence>
        {showDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Dispatch Fleet</h3>
                <button onClick={() => setShowDispatchModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleDispatch} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Driver Name</label>
                  <input
                    value={dispatchData.driver_name}
                    onChange={(e) => setDispatchData({...dispatchData, driver_name: e.target.value})}
                    required
                    placeholder="E.g. Rajesh Kumar"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Truck ID</label>
                  <input
                    value={dispatchData.truck_id}
                    onChange={(e) => setDispatchData({...dispatchData, truck_id: e.target.value})}
                    required
                    placeholder="E.g. TRK-402"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all font-sans"
                  />
                </div>
                <div className="pt-4 flex space-x-4">
                  <button type="submit" disabled={submittingDispatch} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-500 shadow-xl shadow-emerald-100 flex items-center justify-center">
                    {submittingDispatch && <RefreshCw size={18} className="animate-spin mr-2" />}
                    Deploy Now
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sensitivity Modal */}
      <AnimatePresence>
        {showSensitivityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Algorithm Sensitivity</h3>
                <button onClick={() => setShowSensitivityModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleSensitivityUpdate} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ΔR Threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1.00"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-sans"
                  />
                </div>
                <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 shadow-xl flex items-center justify-center">
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-slate-800 mt-1">{value || "0"}</p>
    </div>
  );
}