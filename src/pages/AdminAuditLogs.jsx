import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, 'loginLogs'), orderBy('timestamp', 'desc'), limit(100));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLogs(data);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#F8FAFC', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 800 }}>Audit Logs</h1>
        <div style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4F46E5', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
          Showing Last {logs.length} Logins
        </div>
      </div>

      <div className="premium-table-wrapper slide-up-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table className="premium-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Date & Time</th>
                <th>User</th>
                <th>Email</th>
                <th>Device / Browser</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center' }}>Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No logs found.</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ color: '#CBD5E1' }}>
                      {log.timestamp ? (() => {
                        const d = log.timestamp.toDate();
                        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                        return `${dateStr}, ${d.toLocaleTimeString()}`;
                      })() : 'N/A'}
                    </td>
                    <td style={{ fontWeight: 500, color: '#F8FAFC' }}>{log.userName || 'Unknown'}</td>
                    <td style={{ color: '#94A3B8' }}>{log.userEmail || 'Unknown'}</td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <span className="badge badge-blue">{log.deviceOS || 'Unknown OS'}</span>
                        <span className="badge badge-green">{log.deviceBrowser || 'Unknown Browser'}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
