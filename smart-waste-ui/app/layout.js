"use client";
import './globals.css';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Map, Calendar, Route, BarChart3, Settings, Bell, User, Clock, Check, Trash2, ShieldAlert
} from 'lucide-react';

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const fetchAlerts = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/alerts');
      const data = await resp.json();
      if (data.data) setAlerts(data.data);
    } catch (e) { /* ignore to prevent next.js dev overlay */ }
  };

  useEffect(() => {
    fetchAlerts();
    const inv = setInterval(fetchAlerts, 10000);
    return () => clearInterval(inv);
  }, []);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <html lang="en">
      <body className="flex h-screen bg-bg-main text-slate-900 font-sans selection:bg-emerald-100">
        <aside className="w-72 glass-sidebar flex flex-col z-20">
          <div className="p-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <Route className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-800">EcoRoute</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">IoT Network Manager</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</div>
            <NavItem href="/" icon={<LayoutDashboard size={20} />} label="Dashboard" active={pathname === "/"} />
            <NavItem href="/monitoring" icon={<Map size={20} />} label="Live Monitoring" active={pathname === "/monitoring"} />
            <NavItem href="/scheduling" icon={<Calendar size={20} />} label="Fleet Schedule" active={pathname === "/scheduling"} />
            <NavItem href="/optimization" icon={<Route size={20} />} label="Dynamic Routing" active={pathname === "/optimization"} />
            <NavItem href="/analytics" icon={<BarChart3 size={20} />} label="System Analytics" active={pathname === "/analytics"} />
            
            <div className="px-4 py-2 mt-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preferences</div>
            <NavItem href="/settings" icon={<Settings size={20} />} label="Settings" active={pathname === "/settings"} />
          </nav>

          <div className="p-4 m-4 bg-white/50 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 ring-2 ring-white">
                <User size={20} />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-slate-800 truncate">Devesh Khurana</p>
                <p className="text-xs text-slate-400 truncate">Dehradun Sector</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <header className="h-20 flex items-center justify-between px-10 bg-white/40 backdrop-blur-sm border-b border-slate-200/50 flex-shrink-0 z-30">
            <div>
              <h2 className="text-sm font-semibold text-slate-500">System Live</h2>
              <p className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <div className="flex items-center space-x-4 relative">
              <button 
                onClick={() => setShowNotifs(!showNotifs)}
                className={`p-2.5 rounded-full bg-white border border-slate-200 transition-all relative ${showNotifs ? 'text-emerald-600 ring-4 ring-emerald-50' : 'text-slate-500 hover:text-emerald-600'}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2.5 w-4 h-4 bg-rose-500 text-[10px] text-white font-bold flex items-center justify-center rounded-full border-2 border-white ring-1 ring-rose-200">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifs && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-14 right-0 w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                  >
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800">Recent Alerts</h3>
                      <button 
                        onClick={async () => {
                          setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
                          try {
                            await fetch('http://localhost:8000/api/alerts/mark-read', { method: 'POST' });
                            fetchAlerts();
                          } catch (e) { console.error("Mark read failed"); }
                        }}
                        className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline"
                      >
                        Mark as Read
                      </button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                      {alerts.length > 0 ? (
                        alerts.map((alert) => (
                          <div key={alert.id} className="p-4 border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                            <div className="flex space-x-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.type === 'CRITICAL' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                                {alert.type === 'CRITICAL' ? <ShieldAlert size={16} /> : <Clock size={16} />}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-slate-800 leading-tight">{alert.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">{alert.bin_id} · {new Date(alert.created_at).toLocaleTimeString()}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-12 text-center">
                          <Check size={40} className="mx-auto text-emerald-200 mb-4" />
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No active alerts</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

function NavItem({ href, icon, label, active }) {
  return (
    <Link 
      href={href} 
      className={`
        flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300
        ${active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-[1.02]' 
          : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
        }
      `}
    >
      <span className={active ? 'text-white' : 'text-slate-400'}>{icon}</span>
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  );
}
