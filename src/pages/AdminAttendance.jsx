import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Loader2, User, ChevronRight, BarChart2 } from 'lucide-react';

export default function AdminAttendance() {
  const [loading, setLoading] = useState(true);
  const [usersData, setUsersData] = useState([]); 
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const attendanceSnap = await getDocs(collection(db, 'attendance'));
      
      const usersSnap = await getDocs(collection(db, 'loginLogs'));
      const userMap = {}; 
      usersSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.userId && !userMap[d.userId]) {
          userMap[d.userId] = { name: d.userName, email: d.userEmail };
        }
      });

      const grouped = {};
      attendanceSnap.docs.forEach(doc => {
        const a = { id: doc.id, ...doc.data() };
        if (!grouped[a.userId]) {
          grouped[a.userId] = [];
        }
        grouped[a.userId].push(a);
      });

      const result = Object.keys(grouped).map(uid => ({
        userId: uid,
        name: userMap[uid]?.name || 'Unknown User',
        email: userMap[uid]?.email || 'No Email',
        attendance: grouped[uid]
      }));

      result.sort((a, b) => a.name.localeCompare(b.name));
      setUsersData(result);
      if (result.length > 0) {
        setSelectedUserId(result[0].userId);
      }

    } catch (err) {
      console.error("Failed to fetch admin attendance:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Loader2 size={40} className="animate-spin text-indigo-500" style={{ color: '#6366F1' }} />
      </div>
    );
  }

  const selectedUser = usersData.find(u => u.userId === selectedUserId);

  const getNeededClasses = (attended, total, targetPercent) => {
    if (total === 0) return 0;
    const current = attended / total;
    if (current >= targetPercent) return 0;
    const needed = (targetPercent * total - attended) / (1 - targetPercent);
    return Math.ceil(needed);
  };

  const getPercentageColor = (pct) => {
    if (pct >= 75) return '#34D399';
    if (pct >= 60) return '#FBBF24';
    return '#F87171';
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', padding: '24px', gap: '24px', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Sidebar List */}
      <div className="glass-panel" style={{ width: '320px', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'white' }}>User Attendance</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{usersData.length} users with attendance data</p>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {usersData.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No users found.</div>
          ) : (
            usersData.map(user => (
              <button
                key={user.userId}
                onClick={() => setSelectedUserId(user.userId)}
                style={{
                  width: '100%', textAlign: 'left', padding: '16px', borderRadius: '12px',
                  background: selectedUserId === user.userId ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
                  border: '1px solid',
                  borderColor: selectedUserId === user.userId ? 'rgba(79, 70, 229, 0.4)' : 'transparent',
                  color: 'white', cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'
                }}
                onMouseOver={(e) => { if (selectedUserId !== user.userId) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseOut={(e) => { if (selectedUserId !== user.userId) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ 
                  width: '40px', height: '40px', borderRadius: '50%', 
                  background: 'rgba(79, 70, 229, 0.2)', display: 'flex', 
                  alignItems: 'center', justifyContent: 'center', color: '#818CF8' 
                }}>
                  <User size={20} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                </div>
                <ChevronRight size={18} style={{ color: selectedUserId === user.userId ? '#818CF8' : 'var(--text-muted)' }} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedUser ? (
          <>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'white' }}>{selectedUser.name}'s Attendance</h1>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{selectedUser.email}</p>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              {(() => {
                let totalOverall = 0;
                let attendedOverall = 0;
                
                selectedUser.attendance.forEach(item => {
                  totalOverall += item.totalClasses;
                  attendedOverall += item.attendedClasses;
                });
                
                const overallPercent = totalOverall > 0 ? ((attendedOverall / totalOverall) * 100).toFixed(1) : 0;
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                      <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Overall:</span>
                      <span style={{ fontSize: '32px', fontWeight: 800, color: getPercentageColor(overallPercent) }}>
                        {overallPercent}%
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '16px', fontWeight: 500 }}>({attendedOverall} / {totalOverall} classes)</span>
                    </div>

                    <div className="premium-table-wrapper">
                      <table className="premium-table">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th style={{ textAlign: 'center' }}>Attended</th>
                            <th style={{ textAlign: 'center' }}>Total</th>
                            <th>Performance</th>
                            <th>Target (60%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedUser.attendance.map(item => {
                            const pct = item.totalClasses > 0 ? (item.attendedClasses / item.totalClasses * 100) : 0;
                            const needed = getNeededClasses(item.attendedClasses, item.totalClasses, 0.60);
                            
                            return (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 600, color: 'white', fontSize: '15px' }}>{item.subject}</td>
                                <td style={{ textAlign: 'center', fontSize: '15px', fontWeight: 600 }}>
                                  {item.attendedClasses}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '15px', fontWeight: 600 }}>
                                  {item.totalClasses}
                                </td>
                                <td>
                                  <div className={`badge badge-${pct >= 75 ? 'green' : (pct >= 60 ? 'orange' : 'red')}`} style={{ fontSize: '14px', padding: '6px 12px' }}>
                                    {pct.toFixed(1)}%
                                  </div>
                                </td>
                                <td>
                                  {needed > 0 ? (
                                    <span style={{ color: '#F87171', fontWeight: 600 }}>+{needed} classes</span>
                                  ) : (
                                    <span style={{ color: '#34D399', fontWeight: 600 }}>Safe</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a user from the sidebar to view their attendance.
          </div>
        )}
      </div>
    </div>
  );
}
