import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  BarChart2, 
  Map, 
  Calendar, 
  Clock, 
  BookOpen, 
  CheckCircle2, 
  TrendingUp, 
  MapPin, 
  ChevronRight, 
  LogOut, 
  User, 
  Check, 
  X as Cross, 
  Loader2, 
  ShieldCheck,
  UploadCloud 
} from 'lucide-react';
import { auth, db, storage } from '../utils/firebase';
import { collection, query, where, getDocs, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadString } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import TimetableManager from '../components/TimetableManager';
import { nodes } from '../data/campusGraph';

export default function CollegeDashboardHome() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isParsingAI, setIsParsingAI] = useState(false);
  const [attendanceList, setAttendanceList] = useState([]);
  const [todayClasses, setTodayClasses] = useState([]);
  const [markedClasses, setMarkedClasses] = useState({});
  const [timetables, setTimetables] = useState([]);
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchDashboardData(currentUser.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsParsingAI(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result.split(',')[1];
        
        try {
          const timestamp = Date.now();
          const storageRef = ref(storage, `attendance_uploads/${user.uid}/${timestamp}.jpg`);
          await uploadString(storageRef, base64String, 'base64', { contentType: file.type }).catch(e => console.error(e));

          const functions = getFunctions();
          const parseAttendance = httpsCallable(functions, 'parseAttendanceImage');
          const result = await parseAttendance({
            base64Image: base64String,
            mimeType: file.type
          });

          const extracted = result.data.attendance;
          if (!extracted || extracted.length === 0) {
            alert("Could not extract attendance from image.");
            setIsParsingAI(false);
            return;
          }

          const batch = writeBatch(db);
          const newItems = [];
          for (const subj of extracted) {
            const newRef = doc(collection(db, 'attendance'));
            const data = {
              userId: user.uid,
              subject: subj.subject,
              totalClasses: parseInt(subj.totalClasses) || 0,
              attendedClasses: parseInt(subj.attendedClasses) || 0
            };
            batch.set(newRef, data);
            newItems.push({ id: newRef.id, ...data });
          }
          await batch.commit();
          setAttendanceList(prev => [...prev, ...newItems]);

        } catch (err) {
          console.error("AI parsing failed:", err);
          alert("Failed to parse image.");
        } finally {
          setIsParsingAI(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsParsingAI(false);
    }
    e.target.value = null;
  };

  const fetchDashboardData = async (uid) => {
    setLoading(true);
    try {
      // 1. Fetch Attendance Summary
      const attQ = query(collection(db, 'attendance'), where('userId', '==', uid));
      const attSnap = await getDocs(attQ);
      const attData = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendanceList(attData);

      // 2. Fetch Timetable Data
      const ttQ = query(collection(db, 'timetables'), where('userId', '==', uid));
      const ttSnap = await getDocs(ttQ);
      const ttData = ttSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTimetables(ttData);

      // 3. Calculate Today's Classes
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayIndex = new Date().getDay();
      const todayName = days[todayIndex];

      const todays = ttData.filter(c => {
        if (c.day) return c.day.toLowerCase() === todayName.toLowerCase();
        return c.dayOfWeek === todayIndex;
      }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      setTodayClasses(todays);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkTodayClass = async (ttClass, attended) => {
    const existingItem = attendanceList.find(a => a.subject.toLowerCase() === ttClass.subject.toLowerCase());
    
    if (existingItem) {
      const newTotal = existingItem.totalClasses + 1;
      const newAttended = attended ? existingItem.attendedClasses + 1 : existingItem.attendedClasses;
      try {
        await updateDoc(doc(db, 'attendance', existingItem.id), {
          totalClasses: newTotal,
          attendedClasses: newAttended
        });
        setAttendanceList(prev => prev.map(i => i.id === existingItem.id ? { ...i, totalClasses: newTotal, attendedClasses: newAttended } : i));
      } catch (err) {
        console.error("Marking failed:", err);
      }
    } else {
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

  // Stats Calculations
  let totalClassesCount = 0;
  let attendedClassesCount = 0;
  attendanceList.forEach(item => {
    totalClassesCount += item.totalClasses;
    attendedClassesCount += item.attendedClasses;
  });

  const overallPercent = totalClassesCount > 0 
    ? ((attendedClassesCount / totalClassesCount) * 100).toFixed(1) 
    : 0;

  const lowAttendanceCount = attendanceList.filter(item => {
    if (item.totalClasses === 0) return false;
    return (item.attendedClasses / item.totalClasses) < 0.75;
  }).length;

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}>
        <Loader2 size={40} className="animate-spin" style={{ color: '#6366F1' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', color: 'white', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <header className="glass-panel" style={{ margin: '16px 24px 0 24px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, background: 'linear-gradient(to right, #ffffff, #94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              College Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>Welcome back, {user?.displayName || 'Student'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user?.email === 'divyeshatla@gmail.com' && (
            <button 
              onClick={() => navigate('/redev')} 
              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <ShieldCheck size={16} /> Admin Tools
            </button>
          )}
          <button 
            onClick={() => auth.signOut()} 
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94A3B8', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '28px', boxSizing: 'border-box' }}>
        
        {/* Overview Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          {/* Attendance Stat Card */}
          <div 
            className="glass-panel" 
            onClick={() => navigate('/attendance')}
            style={{ 
              padding: '24px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px', 
              position: 'relative', 
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Attendance</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="dashboard-attendance-upload"
                  disabled={isParsingAI || !user}
                />
                <label 
                  htmlFor="dashboard-attendance-upload"
                  onClick={(e) => e.stopPropagation()}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', 
                    opacity: (isParsingAI || !user) ? 0.6 : 1, 
                    pointerEvents: (isParsingAI || !user) ? 'none' : 'auto',
                    background: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
                    color: 'white', padding: '6px 12px', borderRadius: '10px',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  {isParsingAI ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  {isParsingAI ? 'Analyzing...' : 'Update via Screenshot'}
                </label>

                <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '10px', borderRadius: '12px', color: '#818CF8' }}>
                  <TrendingUp size={20} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '42px', fontWeight: 800, color: overallPercent >= 75 ? '#34D399' : (overallPercent >= 60 ? '#FBBF24' : '#F87171') }}>
                {overallPercent}%
              </span>
              <span style={{ fontSize: '14px', color: '#94A3B8' }}>({attendedClassesCount}/{totalClassesCount} classes)</span>
            </div>
            <div style={{ fontSize: '13px', color: lowAttendanceCount > 0 ? '#F87171' : '#34D399', fontWeight: 500 }}>
              {lowAttendanceCount > 0 ? `⚠️ ${lowAttendanceCount} subject(s) below 75% target` : '🎉 Safe in all subjects!'}
            </div>
          </div>

          {/* Timetable / Classes Stat Card */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Classes</span>
              <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '10px', borderRadius: '12px', color: '#60A5FA' }}>
                <Calendar size={22} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '42px', fontWeight: 800, color: '#F8FAFC' }}>
                {todayClasses.length}
              </span>
              <span style={{ fontSize: '14px', color: '#94A3B8' }}>scheduled today</span>
            </div>
            <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>
              {timetables.length > 0 ? `${timetables.length} total weekly timetable entries` : 'No timetable added yet'}
            </div>
          </div>

        </div>

        {/* Today's Schedule Interactive Strip */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={22} color="#818CF8" />
              Today's Schedule
            </h2>
            <button 
              onClick={() => setShowTimetableModal(true)} 
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Manage Timetable
            </button>
          </div>

          {todayClasses.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
              <Calendar size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '15px' }}>No classes scheduled for today.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {todayClasses.map(cls => (
                <div 
                  key={cls.id} 
                  className="glass-panel" 
                  style={{ 
                    padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
                    opacity: markedClasses[cls.id] ? 0.6 : 1, transition: 'all 0.3s'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '18px', color: 'white' }}>{cls.subject}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', fontSize: '13px', marginTop: '6px' }}>
                      <Clock size={14} /> {cls.startTime} - {cls.endTime}
                    </div>
                    {cls.room && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>
                        <MapPin size={14} color="#60A5FA" /> {cls.room}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleMarkTodayClass(cls, true)}
                      disabled={markedClasses[cls.id]}
                      style={{ 
                        flex: 1, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', 
                        color: '#34D399', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        gap: '6px', cursor: markedClasses[cls.id] ? 'default' : 'pointer', fontWeight: 600, fontSize: '13px'
                      }}
                    >
                      <Check size={16} /> Attended
                    </button>
                    <button 
                      onClick={() => handleMarkTodayClass(cls, false)}
                      disabled={markedClasses[cls.id]}
                      style={{ 
                        flex: 1, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', 
                        color: '#F87171', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        gap: '6px', cursor: markedClasses[cls.id] ? 'default' : 'pointer', fontWeight: 600, fontSize: '13px'
                      }}
                    >
                      <Cross size={16} /> Missed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Navigation Cards Header */}
        <h2 style={{ margin: '8px 0 -12px 0', fontSize: '20px', fontWeight: 700, color: 'white' }}>
          Dashboard Features
        </h2>

        {/* Navigation Action Buttons Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          {/* 📊 Attendance Button */}
          <div 
            onClick={() => navigate('/attendance')}
            className="glass-panel" 
            style={{ 
              padding: '24px', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '20px',
              transition: 'all 0.3s ease', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(30, 41, 59, 0.7))',
              border: '1px solid rgba(79, 70, 229, 0.3)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#6366F1'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(79, 70, 229, 0.3)'; }}
          >
            <div style={{ background: '#4F46E5', color: 'white', padding: '16px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={28} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'white' }}>Attendance</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8' }}>Track, edit & AI auto-fill subject logs</p>
            </div>
            <ChevronRight size={20} color="#94A3B8" />
          </div>

          {/* 🗺️ Campus Maps Button */}
          <div 
            onClick={() => navigate('/map')}
            className="glass-panel" 
            style={{ 
              padding: '24px', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '20px',
              transition: 'all 0.3s ease', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(30, 41, 59, 0.7))',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#3B82F6'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'; }}
          >
            <div style={{ background: '#3B82F6', color: 'white', padding: '16px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Map size={28} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'white' }}>Campus Map</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8' }}>Interactive building & route navigation</p>
            </div>
            <ChevronRight size={20} color="#94A3B8" />
          </div>

          {/* 📅 Timetable Button */}
          <div 
            onClick={() => setShowTimetableModal(true)}
            className="glass-panel" 
            style={{ 
              padding: '24px', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '20px',
              transition: 'all 0.3s ease', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(30, 41, 59, 0.7))',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#10B981'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'; }}
          >
            <div style={{ background: '#10B981', color: 'white', padding: '16px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={28} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'white' }}>Timetable</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8' }}>Manage weekly class schedules & rooms</p>
            </div>
            <ChevronRight size={20} color="#94A3B8" />
          </div>

        </div>

      </main>

      {/* Bottom Fixed Navigation Bar */}
      <nav className="glass-panel" style={{ position: 'sticky', bottom: '16px', margin: '0 24px 16px 24px', padding: '10px 24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderRadius: '20px', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)' }}>
        
        <button 
          onClick={() => navigate('/attendance')}
          style={{ background: 'transparent', border: 'none', color: '#818CF8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
        >
          <BarChart2 size={22} />
          <span>Attendance</span>
        </button>

        <button 
          onClick={() => navigate('/map')}
          style={{ background: 'transparent', border: 'none', color: '#60A5FA', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
        >
          <Map size={22} />
          <span>Maps</span>
        </button>

        <button 
          onClick={() => setShowTimetableModal(true)}
          style={{ background: 'transparent', border: 'none', color: '#34D399', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
        >
          <Calendar size={22} />
          <span>Timetable</span>
        </button>

      </nav>

      {/* Timetable Modal */}
      <TimetableManager 
        isOpen={showTimetableModal} 
        onClose={() => {
          setShowTimetableModal(false);
          if (user) fetchDashboardData(user.uid);
        }} 
        user={user} 
        nodes={nodes} 
        timetables={timetables} 
      />

    </div>
  );
}
