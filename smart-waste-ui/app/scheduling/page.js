"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, User, Truck, MapPin, Clock, MoreHorizontal, ChevronRight, RefreshCw, CheckCircle2, X } from 'lucide-react';

export default function Scheduling() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    driver_name: "", truck_id: "", zone: "", shift: "06:00 AM - 02:00 PM", status: "Standby"
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchFleet = async () => {
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/fleet');
      const data = await resp.json();
      if (data.data) setSchedules(data.data);
    } catch (e) {
      console.error("Fleet fetch failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleet();
  }, []);

  const handleAssign = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('http://127.0.0.1:8000/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAssignment)
      });
      setShowModal(false);
      fetchFleet();
      setNewAssignment({ driver_name: "", truck_id: "", zone: "", shift: "06:00 AM - 02:00 PM", status: "Standby" });
    } catch (e) {
      alert("Assignment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Fleet Schedule</h1>
          <p className="text-slate-400 font-medium mt-1">Resource allocation and deployment tracking.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
        >
          <Plus size={20} />
          <span>Assign Route</span>
        </button>
      </header>

      {/* Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20 animate-pulse text-slate-300 font-bold uppercase tracking-widest">
            <RefreshCw className="animate-spin mb-4" size={32} />
            Synchronizing Fleet Data...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone Details</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shift Window</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {schedules.length > 0 ? schedules.map((s, i) => (
                    <tr key={s.id || i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                            <Truck size={24} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 leading-tight">{s.driver_name}</p>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{s.truck_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-2 text-slate-600">
                          <MapPin size={16} className="text-slate-300" />
                          <span className="text-sm font-semibold">{s.zone}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-2 text-slate-600">
                          <Clock size={16} className="text-slate-300" />
                          <span className="text-sm font-medium tracking-tight">{s.shift}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <StatusChip status={s.status} />
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
                          <MoreHorizontal size={20} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="px-8 py-20 text-center">
                        <div className="max-w-xs mx-auto space-y-2">
                           <CheckCircle2 size={40} className="mx-auto text-slate-200" />
                           <p className="font-bold text-slate-400 uppercase text-xs tracking-widest">No routes assigned yet</p>
                           <p className="text-xs text-slate-300 leading-relaxed">Start by clicking 'Assign Route' to deploy your first collection truck.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-auto bg-slate-50 p-6 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Persistent Archive · v2.1.0</p>
              <div className="flex space-x-2">
                <button
                  onClick={() => window.open('http://127.0.0.1:8000/api/reports/export?scope=all', '_blank')}
                  className="px-5 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-sans"
                >
                  Export Archive
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assignment Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Assign New Fleet Route</h3>
                <button onClick={() => setShowModal(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X/></button>
              </div>

              <form onSubmit={handleAssign} className="p-8 space-y-6">
                <Input label="Driver Name" value={newAssignment.driver_name} onChange={(v) => setNewAssignment({...newAssignment, driver_name: v})} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Truck ID" value={newAssignment.truck_id} onChange={(v) => setNewAssignment({...newAssignment, truck_id: v})} required />
                  <Input label="Collection Zone" value={newAssignment.zone} onChange={(v) => setNewAssignment({...newAssignment, zone: v})} required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Shift Window</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50"
                    value={newAssignment.shift}
                    onChange={(e) => setNewAssignment({...newAssignment, shift: e.target.value})}
                  >
                    <option>06:00 AM - 02:00 PM</option>
                    <option>02:00 PM - 10:00 PM</option>
                    <option>10:00 PM - 06:00 AM</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Initial Status</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50"
                      value={newAssignment.status}
                      onChange={(e) => setNewAssignment({...newAssignment, status: e.target.value})}
                    >
                      <option>Standby</option>
                      <option>On Route</option>
                      <option>Completed</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex space-x-4">
                  <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-500 shadow-xl shadow-emerald-100 flex items-center justify-center">
                    {submitting && <RefreshCw size={18} className="animate-spin mr-2" />}
                    Deploy Now
                  </button>
                  <button type="button" onClick={() => setShowModal(false)} className="bg-slate-50 text-slate-500 py-4 px-8 rounded-2xl font-bold hover:bg-slate-100">Cancel</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Input({ label, value, onChange, required }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={label}
        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all"
      />
    </div>
  );
}

function StatusChip({ status }) {
  const styles = {
    'On Route': 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    'Standby': 'bg-amber-50 text-amber-600 ring-amber-100',
    'Completed': 'bg-blue-50 text-blue-600 ring-blue-100',
  };
  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${styles[status] || styles.Standby}`}>
      {status || 'Standby'}
    </span>
  );
}