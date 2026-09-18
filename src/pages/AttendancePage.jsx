import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, X as Cross, Loader2, UploadCloud, Save, Trash2, ArrowLeft, BarChart2, Clock, MapPin, Calendar, RotateCcw } from 'lucide-react';
import { db, storage, auth } from '../utils/firebase';
import { collection, deleteDoc, doc, updateDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadString } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';

export default function AttendancePage() {
  const [attendanceList, setAttendanceList] = useState([]);
  const [todayClasses, setTodayClasses] = useState([]);
  const [allTimetables, setAllTimetables] = useState([]);
  const [markedClasses, setMarkedClasses] = useState({});
  const [targetDates, setTargetDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [isParsingAI, setIsParsingAI] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchAttendance(currentUser.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAttendance = async (uid) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'attendance'), where('userId', '==', uid));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendanceList(data);

      const ttQ = query(collection(db, 'timetables'), where('userId', '==', uid));
      const ttSnap = await getDocs(ttQ);
      const allTts = ttSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllTimetables(allTts);
      
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayIndex = new Date().getDay();
      const todayName = days[todayIndex];

      const todays = allTts.filter(c => {
        if (c.day) return c.day.toLowerCase() === todayName.toLowerCase();
        return c.dayOfWeek === todayIndex;
      }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      
      setTodayClasses(todays);
    } catch (err) {
      console.error("Failed to fetch attendance or timetables:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !user) return;

    setIsParsingAI(true);
    try {
      const functions = getFunctions();
      const parseAttendance = httpsCallable(functions, 'parseAttendanceImage');

      // Fetch existing attendance records from Firestore for smart merging
      const q = query(collection(db, 'attendance'), where('userId', '==', user.uid));
      const snap = await getDocs(q);

      const subjectMap = new Map();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const normKey = (data.subject || '').trim().toLowerCase();
        if (normKey) {
          subjectMap.set(normKey, {
            id: docSnap.id,
            subject: data.subject.trim(),
            totalClasses: parseInt(data.totalClasses) || 0,
            attendedClasses: parseInt(data.attendedClasses) || 0
          });
        }
      });

      let parsedCount = 0;
      for (const file of files) {
        try {
          const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const timestamp = Date.now();
          const storageRef = ref(storage, `attendance_uploads/${user.uid}/${timestamp}_${Math.random().toString(36).substring(7)}.jpg`);
          uploadString(storageRef, base64String, 'base64', { contentType: file.type }).catch(e => console.error(e));

          const result = await parseAttendance({
            base64Image: base64String,
            mimeType: file.type
          });

          const extracted = result.data?.attendance || [];
          if (extracted.length > 0) {
            parsedCount++;
            for (const subj of extracted) {
              if (!subj.subject) continue;
              const normKey = subj.subject.trim().toLowerCase();
              const total = parseInt(subj.totalClasses) || 0;
              const attended = parseInt(subj.attendedClasses) || 0;

              if (subjectMap.has(normKey)) {
                const existing = subjectMap.get(normKey);
                existing.totalClasses = Math.max(existing.totalClasses, total);
                existing.attendedClasses = Math.max(existing.attendedClasses, attended);
              } else {
                subjectMap.set(normKey, {
                  id: null,
                  subject: subj.subject.trim(),
                  totalClasses: total,
                  attendedClasses: attended
                });
              }
            }
          }
        } catch (err) {
          console.error("AI parsing failed for file:", file.name, err);
        }
      }

      if (parsedCount === 0) {
        alert("Could not extract attendance from the uploaded image(s).");
        setIsParsingAI(false);
        return;
      }

      const batch = writeBatch(db);
      for (const [normKey, item] of subjectMap.entries()) {
        if (item.id) {
          batch.update(doc(db, 'attendance', item.id), {
            totalClasses: item.totalClasses,
            attendedClasses: item.attendedClasses
          });
        } else {
          const newRef = doc(collection(db, 'attendance'));
          item.id = newRef.id;
          batch.set(newRef, {
            userId: user.uid,
            subject: item.subject,
            totalClasses: item.totalClasses,
            attendedClasses: item.attendedClasses
          });
        }
      }

      await batch.commit();
      setAttendanceList(Array.from(subjectMap.values()));
      alert(`Successfully processed ${files.length} image(s) and auto-merged subjects!`);
    } catch (err) {
      console.error(err);
      alert("Failed to process attendance image(s).");
    } finally {
      setIsParsingAI(false);
      e.target.value = null;
    }
  };

  const handleClearAllAttendance = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to clear all your attendance records? This action cannot be undone.")) return;

    try {
      const q = query(collection(db, 'attendance'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      setAttendanceList([]);
      alert("All attendance records have been cleared.");
    } catch (err) {
      console.error("Failed to clear attendance:", err);
      alert("Failed to clear attendance records.");
    }
  };

  const handleUpdate = async (id, field, value) => {
    try {
      await updateDoc(doc(db, 'attendance', id), { [field]: parseInt(value) || 0 });
      setAttendanceList(prev => prev.map(item => item.id === id ? { ...item, [field]: parseInt(value) || 0 } : item));
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handleMark = async (item, attended) => {
    const newTotal = item.totalClasses + 1;
    const newAttended = attended ? item.attendedClasses + 1 : item.attendedClasses;
    try {
      await updateDoc(doc(db, 'attendance', item.id), {
        totalClasses: newTotal,
        attendedClasses: newAttended
      });
      setAttendanceList(prev => prev.map(i => i.id === item.id ? { ...i, totalClasses: newTotal, attendedClasses: newAttended } : i));
    } catch (err) {
      console.error("Marking failed:", err);
    }
  };

  const handleMarkTodayClass = async (ttClass, attended) => {
    // Find if subject exists in attendanceList
    const existingItem = attendanceList.find(a => a.subject.toLowerCase() === ttClass.subject.toLowerCase());
    
    if (existingItem) {
      await handleMark(existingItem, attended);
    } else {
      // Create new attendance record
      const newRef = doc(collection(db, 'attendance'));
      const data = {
        userId: user.uid,
        subject: ttClass.subject,
        totalClasses: 1,
        attendedClasses: attended ? 1 : 0
      };
      try {
        await writeBatch(db).set(newRef, data).commit();
        setAttendanceList(prev => [...prev, { id: newRef.id, ...data }]);
      } catch (err) {
        console.error("Failed to create new attendance record:", err);
      }
    }
    setMarkedClasses(prev => ({ ...prev, [ttClass.id]: true }));
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this subject?")) {
      await deleteDoc(doc(db, 'attendance', id));
      setAttendanceList(prev => prev.filter(i => i.id !== id));
    }
  };

  if (loading && attendanceList.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={40} className="animate-spin text-indigo-500" style={{ color: '#6366F1' }} />
      </div>
    );
  }

  let totalOverall = 0;
  let attendedOverall = 0;
  
  attendanceList.forEach(item => {
    totalOverall += item.totalClasses;
    attendedOverall += item.attendedClasses;
  });

  const getNeededClasses = (attended, total, targetPercent) => {
    if (total === 0) return 0;
    const current = attended / total;
    if (current >= targetPercent) return 0;
    const needed = (targetPercent * total - attended) / (1 - targetPercent);
    return Math.ceil(needed);
  };

  const overallPercent = totalOverall > 0 ? ((attendedOverall / totalOverall) * 100).toFixed(1) : 0;
  const overallNeeded = getNeededClasses(attendedOverall, totalOverall, 0.75);

  const getPercentageColor = (pct) => {
    if (pct >= 75) return '#34D399';
    if (pct >= 60) return '#FBBF24';
    return '#F87171';
  };

  const getClassesUntilDate = (subject, targetDateStr) => {
    if (!targetDateStr || !allTimetables.length) return 0;
    
    const targetDate = new Date(targetDateStr);
    targetDate.setHours(23, 59, 59, 999);
    
    const now = new Date();
    if (targetDate <= now) return 0;

    let count = 0;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const subjectClasses = allTimetables.filter(t => t.subject.toLowerCase() === subject.toLowerCase());
    if (subjectClasses.length === 0) return 0;

    // Iterate day by day
    const current = new Date();
    current.setDate(current.getDate() + 1); // Start from tomorrow

    while (current <= targetDate) {
      const dayIndex = current.getDay();
      const dayName = days[dayIndex];
      
      const classesOnDay = subjectClasses.filter(c => {
        if (c.day) return c.day.toLowerCase() === dayName.toLowerCase();
        return c.dayOfWeek === dayIndex;
      }).length;
      
      count += classesOnDay;
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px', minHeight: '100vh', boxSizing: 'border-box', animation: 'fadeIn 0.5s ease-out' }}>
      
      {/* Header */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button 
            onClick={() => navigate('/')} 
            style={{ 
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', 
              width: '40px', height: '40px', borderRadius: '50%', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' 
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BarChart2 size={32} color="#818CF8" />
            Attendance Manager
          </h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <button
            onClick={handleClearAllAttendance}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#F87171',
              padding: '10px 18px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.28)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
            }}
            title="Reset / Clear all attendance data"
          >
            <RotateCcw size={18} />
            <span>Reset Attendance</span>
          </button>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            id="attendance-upload"
            disabled={isParsingAI || !user}
          />
          <label 
            htmlFor="attendance-upload"
            className="glow-button"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              opacity: (isParsingAI || !user) ? 0.6 : 1, 
              pointerEvents: (isParsingAI || !user) ? 'none' : 'auto',
              background: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
            }}
          >
            {isParsingAI ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
            {isParsingAI ? 'Analyzing...' : 'Auto-fill via AI'}
          </label>
        </div>
      </div>

      {/* Today's Schedule */}
      {todayClasses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={24} color="#818CF8" />
            Today's Schedule
          </h2>
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px', WebkitOverflowScrolling: 'touch' }}>
            {todayClasses.map(cls => (
              <div 
                key={cls.id} 
                className="glass-panel" 
                style={{ 
                  minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
                  opacity: markedClasses[cls.id] ? 0.5 : 1,
                  transition: 'opacity 0.3s'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '18px', color: 'white' }}>{cls.subject}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                    <Clock size={14} /> {cls.startTime} - {cls.endTime}
                  </div>
                  {cls.room && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                      <MapPin size={14} /> {cls.room}
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => handleMarkTodayClass(cls, true)}
                    disabled={markedClasses[cls.id]}
                    style={{ 
                      flex: 1, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', 
                      color: '#34D399', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      gap: '8px', cursor: markedClasses[cls.id] ? 'default' : 'pointer', transition: 'all 0.2s',
                      fontWeight: 600, fontSize: '14px'
                    }}
                  >
                    <Check size={18} /> Attended
                  </button>
                  <button 
                    onClick={() => handleMarkTodayClass(cls, false)}
                    disabled={markedClasses[cls.id]}
                    style={{ 
                      flex: 1, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', 
                      color: '#F87171', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      gap: '8px', cursor: markedClasses[cls.id] ? 'default' : 'pointer', transition: 'all 0.2s',
                      fontWeight: 600, fontSize: '14px'
                    }}
                  >
                    <Cross size={18} /> Missed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Overall Attendance</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '48px', fontWeight: 800, color: getPercentageColor(overallPercent) }}>
              {overallPercent}%
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '18px', fontWeight: 500 }}>({attendedOverall} / {totalOverall} classes)</span>
          </div>
          <div style={{ marginTop: '8px' }}>
            {overallNeeded > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#F87171', padding: '12px', borderRadius: '8px', fontWeight: 500 }}>
                ⚠️ You need to attend the next <strong>{overallNeeded}</strong> classes to hit 75%.
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', padding: '12px', borderRadius: '8px', fontWeight: 500 }}>
                🎉 You are safely above the 75% overall requirement!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="premium-table-wrapper fade-in">
        {attendanceList.length === 0 && !loading ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <BarChart2 size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
            <h3 style={{ fontSize: '20px', color: 'white', marginBottom: '8px' }}>No Attendance Data</h3>
            <p>Upload a screenshot of your portal to automatically populate your subjects.</p>
          </div>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th style={{ textAlign: 'center' }}>Attended</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th>Performance</th>
                <th>Target (75%)</th>
                <th>Target Date</th>
                <th>By Date Need</th>
                <th style={{ textAlign: 'center' }}>Mark Today</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {attendanceList.map(item => {
                const pct = item.totalClasses > 0 ? (item.attendedClasses / item.totalClasses * 100) : 0;
                const needed = getNeededClasses(item.attendedClasses, item.totalClasses, 0.75);
                
                const targetDate = targetDates[item.id] || '';
                const futureClasses = getClassesUntilDate(item.subject, targetDate);
                const totalWithFuture = item.totalClasses + futureClasses;
                const requiredAttended = Math.ceil(totalWithFuture * 0.75);
                const additionalNeeded = Math.max(0, requiredAttended - item.attendedClasses);
                const isPossible = additionalNeeded <= futureClasses;
                
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'white', fontSize: '15px' }}>{item.subject}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="number" 
                        className="premium-input"
                        style={{ width: '70px', textAlign: 'center', fontSize: '15px', fontWeight: 600 }}
                        value={item.attendedClasses}
                        onChange={(e) => handleUpdate(item.id, 'attendedClasses', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="number" 
                        className="premium-input"
                        style={{ width: '70px', textAlign: 'center', fontSize: '15px', fontWeight: 600 }}
                        value={item.totalClasses}
                        onChange={(e) => handleUpdate(item.id, 'totalClasses', e.target.value)}
                      />
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
                    <td>
                      <input 
                        type="date" 
                        className="premium-input" 
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                        value={targetDate}
                        onChange={(e) => setTargetDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </td>
                    <td>
                      {targetDate ? (
                        <div style={{ fontSize: '13px', lineHeight: 1.4 }}>
                          {isPossible ? (
                            additionalNeeded > 0 ? (
                              <><span style={{ color: '#FBBF24', fontWeight: 600 }}>Attend {additionalNeeded}</span> / {futureClasses} upcoming</>
                            ) : (
                              <span style={{ color: '#34D399', fontWeight: 600 }}>Safe</span>
                            )
                          ) : (
                            <span style={{ color: '#F87171', fontWeight: 600 }}>Impossible ({additionalNeeded} needed, {futureClasses} left)</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select date</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <button 
                          onClick={() => handleMark(item, true)} 
                          style={{ 
                            background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', 
                            color: '#34D399', width: '36px', height: '36px', borderRadius: '8px', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' 
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'}
                          title="Attended"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => handleMark(item, false)} 
                          style={{ 
                            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', 
                            color: '#F87171', width: '36px', height: '36px', borderRadius: '8px', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' 
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                          title="Missed"
                        >
                          <Cross size={18} />
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        style={{ 
                          background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                          cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
