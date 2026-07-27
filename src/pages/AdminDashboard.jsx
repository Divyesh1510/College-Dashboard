import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Users, LogIn, Map, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalLogins: 0, uniqueUsers: 0, totalRoutes: 0 });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const loginsSnap = await getDocs(collection(db, 'loginLogs'));
        const routesSnap = await getDocs(collection(db, 'routeLogs'));
        
        const logins = loginsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const routes = routesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const uniqueUsers = new Set(logins.map(l => l.userId)).size;
        
        // Group logins by day for the chart
        const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
        }).reverse();

        const dailyCounts = {};
        last7Days.forEach(day => dailyCounts[day] = 0);

        logins.forEach(log => {
          if (log.timestamp) {
            const date = log.timestamp.toDate().toISOString().split('T')[0];
            if (dailyCounts[date] !== undefined) {
              dailyCounts[date]++;
            }
          }
        });

        const chartFormat = Object.keys(dailyCounts).map(date => ({
          name: date.split('-').slice(1).join('/'), // MM/DD
          logins: dailyCounts[date]
        }));

        setStats({
          totalLogins: logins.length,
          uniqueUsers,
          totalRoutes: routes.length
        });
        setChartData(chartFormat);
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <div style={{ color: 'white', padding: '24px' }}>Loading Dashboard...</div>;

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#F8FAFC', width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', fontWeight: 800, background: 'linear-gradient(to right, #ffffff, #94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Overview</h1>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '15px' }}>Monitor campus navigation activity and system health.</p>
        </div>
      </header>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', marginBottom: '48px' }}>
        <StatCard icon={<LogIn />} title="Total Logins" value={stats.totalLogins} color="#4F46E5" />
        <StatCard icon={<Users />} title="Unique Users" value={stats.uniqueUsers} color="#10B981" />
        <StatCard icon={<Map />} title="Routes Navigated" value={stats.totalRoutes} color="#F59E0B" />
        <StatCard icon={<Activity />} title="System Health" value="100%" color="#ef4444" />
      </div>

      <div className="glass-panel slide-up-panel" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '32px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '24px', background: 'linear-gradient(to bottom, #4F46E5, #818CF8)', borderRadius: '4px' }}></div>
          Login Activity (Last 7 Days)
        </h2>
        <div style={{ width: '100%', height: '350px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.6}/>
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} dy={10} />
              <YAxis stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} tickLine={false} dx={-10} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', color: 'white' }} 
                itemStyle={{ color: '#818CF8', fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="logins" stroke="#818CF8" strokeWidth={3} fillOpacity={1} fill="url(#colorLogins)" activeDot={{ r: 6, strokeWidth: 0, fill: '#818CF8', filter: 'drop-shadow(0 0 8px rgba(129,140,248,0.8))' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }) {
  return (
    <div className="glass-panel" style={{ 
      padding: '24px', 
      display: 'flex', alignItems: 'center', gap: '24px', 
      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      cursor: 'default'
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 12px 40px ${color}20`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
    }}
    >
      <div style={{ 
        background: `linear-gradient(135deg, ${color}20, ${color}10)`, 
        color: color, 
        padding: '18px', 
        borderRadius: '16px', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${color}30`,
        boxShadow: `inset 0 0 20px ${color}10`
      }}>
        {React.cloneElement(icon, { size: 32 })}
      </div>
      <div>
        <p style={{ margin: '0 0 4px 0', color: '#94A3B8', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
        <h3 style={{ margin: 0, color: 'white', fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</h3>
      </div>
    </div>
  );
}
