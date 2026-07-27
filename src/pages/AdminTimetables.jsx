import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Loader2, Calendar, Clock, Image as ImageIcon, User, ChevronRight } from 'lucide-react';

export default function AdminTimetables() {
  const [loading, setLoading] = useState(true);
  const [usersData, setUsersData] = useState([]); // Array of { userId, email, name, timetables, meta }
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const timetablesSnap = await getDocs(collection(db, 'timetables'));
      
      const usersSnap = await getDocs(collection(db, 'loginLogs'));
      const userMap = {}; 
      usersSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.userId && !userMap[d.userId]) {
          userMap[d.userId] = { name: d.userName, email: d.userEmail };
        }
      });

      const metaSnap = await getDocs(collection(db, 'timetable_meta'));
      const metaMap = {}; 
      metaSnap.docs.forEach(doc => {
        metaMap[doc.id] = doc.data();
      });

      const grouped = {};
      timetablesSnap.docs.forEach(doc => {
        const t = { id: doc.id, ...doc.data() };
        if (!grouped[t.userId]) {
          grouped[t.userId] = [];
        }
        grouped[t.userId].push(t);
      });

      const result = Object.keys(grouped).map(uid => ({
        userId: uid,
        name: userMap[uid]?.name || 'Unknown User',
        email: userMap[uid]?.email || 'No Email',
        timetables: grouped[uid],
        meta: metaMap[uid] || null
      }));

      result.sort((a, b) => a.name.localeCompare(b.name));
      setUsersData(result);
      if (result.length > 0) {
        setSelectedUserId(result[0].userId);
      }

    } catch (err) {
      console.error("Failed to fetch admin timetables:", err);
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

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Slots from 8 AM to 3:50 PM
  const TIME_SLOTS = [
    { label: "08:00 AM - 08:50 AM", prefix: "08:00 AM" },
    { label: "09:00 AM - 09:50 AM", prefix: "09:00 AM" },
    { label: "10:00 AM - 10:50 AM", prefix: "10:00 AM" },
    { label: "11:00 AM - 11:50 AM", prefix: "11:00 AM" },
    { label: "12:00 PM - 12:50 PM", prefix: "12:00 PM" },
    { label: "01:00 PM - 01:50 PM", prefix: "01:00 PM" },
    { label: "02:00 PM - 02:50 PM", prefix: "02:00 PM" },
    { label: "03:00 PM - 03:50 PM", prefix: "03:00 PM" }
  ];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', padding: '24px', gap: '24px', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Sidebar List */}
      <div className="glass-panel" style={{ width: '320px', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'white' }}>User Timetables</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{usersData.length} users with schedules</p>
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
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'white' }}>{selectedUser.name}'s Schedule</h1>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{selectedUser.email}</p>
              </div>
              
              {selectedUser.meta?.imageUrl && (
                <a 
                  href={selectedUser.meta.imageUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="glow-button"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'linear-gradient(135deg, #4F46E5, #3B82F6)', fontSize: '14px', padding: '10px 20px', flexShrink: 0 }}
                >
                  <ImageIcon size={18} />
                  View Screenshot
                </a>
              )}
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
              <div className="premium-table-wrapper" style={{ overflow: 'visible', borderRadius: '12px', minWidth: '1200px' }}>
                <table className="premium-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '120px', background: 'rgba(79, 70, 229, 0.1)', color: '#818CF8', borderRight: '1px solid rgba(255,255,255,0.05)' }}>Day</th>
                      {TIME_SLOTS.map(slot => (
                        <th key={slot.prefix} style={{ textAlign: 'center', fontSize: '11px' }}>
                          {slot.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(dayName => {
                      const dayClasses = selectedUser.timetables.filter(c => {
                        if (c.day) {
                          return c.day.toLowerCase() === dayName.toLowerCase();
                        }
                        // Fallback if day string is missing
                        const dayIndex = dayName === 'Sunday' ? 0 : DAYS.indexOf(dayName) + 1;
                        return c.dayOfWeek === dayIndex;
                      });
                      
                      // Skip days with no classes to save space? Or show them empty? 
                      // Let's show them empty to keep table consistent.
                      return (
                        <tr key={dayName}>
                          <td style={{ fontWeight: 600, color: 'white', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                            {dayName}
                          </td>
                          {TIME_SLOTS.map(slot => {
                            const cls = dayClasses.find(c => c.startTime.startsWith(slot.prefix.substring(0, 5)));
                            return (
                              <td key={slot.prefix} style={{ padding: '8px', borderRight: '1px solid rgba(255,255,255,0.02)' }}>
                                {cls ? (
                                  <div style={{ 
                                    background: 'rgba(79, 70, 229, 0.15)', 
                                    border: '1px solid rgba(79, 70, 229, 0.3)',
                                    borderRadius: '8px', 
                                    padding: '8px',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    minHeight: '80px'
                                  }}>
                                    <div style={{ color: 'white', fontSize: '13px', fontWeight: 600, lineHeight: 1.2, marginBottom: '4px' }}>
                                      {cls.subject}
                                    </div>
                                    <div style={{ color: '#818CF8', fontSize: '11px', fontWeight: 500 }}>
                                      {cls.room}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '20px' }}>-</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a user from the sidebar to view their timetable.
          </div>
        )}
      </div>
    </div>
  );
}
