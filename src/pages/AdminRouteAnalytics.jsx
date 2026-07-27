import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapPin, ArrowRight } from 'lucide-react';

export default function AdminRouteAnalytics() {
  const [routeData, setRouteData] = useState([]);
  const [destData, setDestData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const snap = await getDocs(collection(db, 'routeLogs'));
        const logs = snap.docs.map(d => d.data());

        // Process top destinations
        const destCounts = {};
        // Process top full routes
        const pathCounts = {};

        logs.forEach(log => {
          if (log.endNodeName) {
            destCounts[log.endNodeName] = (destCounts[log.endNodeName] || 0) + 1;
          }
          if (log.startNodeName && log.endNodeName) {
            const pathName = `${log.startNodeName} -> ${log.endNodeName}`;
            pathCounts[pathName] = (pathCounts[pathName] || 0) + 1;
          }
        });

        // Format for Recharts and Lists
        const formattedDest = Object.keys(destCounts).map(name => ({
          name,
          searches: destCounts[name]
        })).sort((a, b) => b.searches - a.searches).slice(0, 10);

        const formattedPaths = Object.keys(pathCounts).map(path => ({
          path,
          count: pathCounts[path],
          start: path.split(' -> ')[0],
          end: path.split(' -> ')[1]
        })).sort((a, b) => b.count - a.count).slice(0, 10);

        setDestData(formattedDest);
        setRouteData(formattedPaths);
      } catch (err) {
        console.error("Failed to load route analytics", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRoutes();
  }, []);

  if (loading) return <div style={{ color: 'white', padding: '24px' }}>Loading Analytics...</div>;

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#F8FAFC', width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '32px', fontWeight: 800 }}>Route Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        {/* Left Column: Top Destinations Chart */}
        <div className="glass-panel slide-up-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '32px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '8px', height: '24px', background: 'linear-gradient(to bottom, #ef4444, #f87171)', borderRadius: '4px' }}></div>
            Most Popular Destinations
          </h2>
          <div style={{ width: '100%', height: '350px' }}>
            {destData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={destData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#64748B" tick={{fill: '#94A3B8', fontSize: 12}} axisLine={{stroke: '#334155'}} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#64748B" width={100} tick={{fill: '#94A3B8', fontSize: 12}} axisLine={{stroke: '#334155'}} tickLine={false} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px' }} />
                  <Bar dataKey="searches" fill="#D9252A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>No data available</div>
            )}
          </div>
        </div>

        {/* Right Column: Top Routes List */}
        <div className="glass-panel slide-up-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '32px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '8px', height: '24px', background: 'linear-gradient(to bottom, #10B981, #34D399)', borderRadius: '4px' }}></div>
            Most Searched Routes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {routeData.length > 0 ? routeData.map((route, idx) => (
              <div key={idx} style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.2s ease', cursor: 'default'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {idx + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 500 }}>{route.start}</span>
                    <ArrowRight size={16} color="#94A3B8" />
                    <span style={{ fontWeight: 600, color: '#4F46E5' }}>{route.end}</span>
                  </div>
                </div>
                <div style={{ background: '#0F172A', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', color: '#94A3B8' }}>
                  {route.count} trips
                </div>
              </div>
            )) : (
              <div style={{ color: '#94A3B8', textAlign: 'center', padding: '24px' }}>No routes navigated yet.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
