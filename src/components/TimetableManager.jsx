import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Plus, Trash2, Clock, MapPin, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { db, storage } from '../utils/firebase';
import { collection, addDoc, deleteDoc, doc, writeBatch, setDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import SearchableSelect from './SearchableSelect';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TimetableManager({ isOpen, onClose, user, nodes, timetables, fetchTimetables, setUploadedImageUrl }) {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingAI, setIsParsingAI] = useState(false);
  
  // Form State
  const [subject, setSubject] = useState('');
  const [faculty, setFaculty] = useState('');
  const [roomNodeId, setRoomNodeId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  const [currentDayIndex, setCurrentDayIndex] = useState(new Date().getDay());

  if (!isOpen) return null;

  const handleAddClass = async (e) => {
    if (e) e.preventDefault();
    if (!subject || !user) return;

    setIsSubmitting(true);
    try {
      const selectedNode = nodes[roomNodeId];
      const roomName = selectedNode ? (selectedNode.name || selectedNode.label || '') : '';

      await addDoc(collection(db, 'timetables'), {
        userId: user.uid,
        subject,
        faculty,
        roomNodeId,
        room: roomName,
        dayOfWeek: parseInt(dayOfWeek),
        day: DAYS[dayOfWeek],
        startTime,
        endTime
      });

      // Reset form
      setSubject('');
      setFaculty('');
      setRoomNodeId('');
      setShowForm(false);
      if (fetchTimetables) fetchTimetables();
    } catch (err) {
      console.error("Error adding timetable entry:", err);
      alert("Failed to save class schedule.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClass = async (id) => {
    try {
      await deleteDoc(doc(db, 'timetables', id));
      if (fetchTimetables) fetchTimetables();
    } catch (err) {
      console.error("Error deleting class:", err);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !user) return;

    setIsParsingAI(true);
    try {
      const functions = getFunctions();
      const parseTimetable = httpsCallable(functions, 'parseTimetableImage');

      // Fetch existing timetables for smart merging
      const q = query(collection(db, 'timetables'), where('userId', '==', user.uid));
      const snap = await getDocs(q);

      const slotMap = new Map();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const normKey = `${data.dayOfWeek || 0}_${(data.startTime || '').trim().toLowerCase()}_${(data.subject || '').trim().toLowerCase()}`;
        slotMap.set(normKey, {
          id: docSnap.id,
          data: { ...data }
        });
      });

      let totalAddedOrUpdated = 0;

      for (const file of files) {
        try {
          const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          try {
            const timestamp = Date.now();
            const storageRef = ref(storage, `timetable_uploads/${user.uid}/${timestamp}_${Math.random().toString(36).substring(7)}.jpg`);
            await uploadString(storageRef, base64String, 'base64', { contentType: file.type });
            const imageUrl = await getDownloadURL(storageRef);
            if (setUploadedImageUrl) setUploadedImageUrl(imageUrl);

            await setDoc(doc(db, 'timetable_meta', user.uid), {
              imageUrl,
              updatedAt: serverTimestamp()
            });
          } catch (storageErr) {
            console.error("Failed to upload screenshot to storage", storageErr);
          }

          const result = await parseTimetable({
            base64Image: base64String,
            mimeType: file.type
          });

          const classes = result.data?.classes || [];
          if (classes.length > 0) {
            totalAddedOrUpdated += classes.length;
            for (const cls of classes) {
              let matchedNodeId = '';
              for (const [id, node] of Object.entries(nodes || {})) {
                if (node.name && node.name.toLowerCase().includes((cls.room || '').toLowerCase())) {
                  matchedNodeId = id;
                  break;
                }
              }

              const dayIndex = DAYS.findIndex(d => d.toLowerCase() === (cls.day || '').toLowerCase());
              const dayVal = dayIndex !== -1 ? dayIndex : 1;
              const dayName = dayIndex !== -1 ? DAYS[dayIndex] : 'Monday';
              const startTimeStr = cls.startTime || '09:00';
              const endTimeStr = cls.endTime || '10:00';
              const subjectName = (cls.subject || '').trim();

              const normKey = `${dayVal}_${startTimeStr.trim().toLowerCase()}_${subjectName.toLowerCase()}`;

              const itemData = {
                userId: user.uid,
                subject: subjectName,
                faculty: cls.faculty || '',
                room: cls.room || '',
                roomNodeId: matchedNodeId,
                dayOfWeek: dayVal,
                day: dayName,
                startTime: startTimeStr,
                endTime: endTimeStr
              };

              if (slotMap.has(normKey)) {
                const existing = slotMap.get(normKey);
                slotMap.set(normKey, { id: existing.id, data: { ...existing.data, ...itemData } });
              } else {
                slotMap.set(normKey, { id: null, data: itemData });
              }
            }
          }
        } catch (err) {
          console.error("AI timetable parsing failed for file:", file.name, err);
        }
      }

      if (totalAddedOrUpdated === 0) {
        alert("Could not extract any classes from the uploaded image(s).");
        setIsParsingAI(false);
        return;
      }

      const batch = writeBatch(db);
      for (const [normKey, item] of slotMap.entries()) {
        if (item.id) {
          batch.update(doc(db, 'timetables', item.id), item.data);
        } else {
          const docRef = doc(collection(db, 'timetables'));
          item.id = docRef.id;
          batch.set(docRef, item.data);
        }
      }
      await batch.commit();

      if (fetchTimetables) fetchTimetables();
      alert(`Successfully processed ${files.length} timetable image(s) and auto-merged your schedule!`);
    } catch (err) {
      console.error("Timetable upload error:", err);
      alert("Failed to process timetable image(s).");
    } finally {
      setIsParsingAI(false);
      e.target.value = null;
    }
  };

  const handleClearAllTimetables = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to clear your entire timetable schedule? This action cannot be undone.")) return;

    try {
      const q = query(collection(db, 'timetables'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      // Clear meta image doc if exists
      batch.delete(doc(db, 'timetable_meta', user.uid));

      await batch.commit();
      if (setUploadedImageUrl) setUploadedImageUrl('');
      if (fetchTimetables) fetchTimetables();
      alert("Your entire timetable schedule has been cleared.");
    } catch (err) {
      console.error("Failed to clear timetable:", err);
      alert("Failed to clear timetable schedule.");
    }
  };

  const sortedTimetables = Array.isArray(timetables) ? [...timetables].sort((a, b) => {
    const getDayIndex = (cls) => {
      if (cls.dayOfWeek !== undefined) return cls.dayOfWeek;
      if (cls.day) return DAYS.indexOf(cls.day);
      return 0;
    };
    const dayA = getDayIndex(a);
    const dayB = getDayIndex(b);
    if (dayA !== dayB) return dayA - dayB;
    
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!match) return 0;
      let [ , h, m, ampm ] = match;
      h = parseInt(h, 10);
      m = parseInt(m, 10);
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      return h * 60 + m;
    };

    const startA = a.startTime || a.time || '';
    const startB = b.startTime || b.time || '';
    return parseTime(startA) - parseTime(startB);
  }) : [];

  return createPortal(
    <div style={{ position: 'relative', zIndex: 9999 }}>
      {/* Backdrop */}
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', zIndex: 100 }}
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div style={{
        position: 'fixed', top: '10vh', left: '16px', right: '16px', bottom: '10vh',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)', zIndex: 101, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', color: 'var(--text)', maxWidth: '500px', margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={24} color="#3B82F6" />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>My Timetable</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Add New Class Form Toggle & Actions */}
          {!showForm ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setShowForm(true)}
                style={{
                  flex: 1, padding: '12px 8px', background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
                  border: '1px dashed #3B82F6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s'
                }}
              >
                <Plus size={16} /> Add Manually
              </button>
              
              <label style={{
                flex: 1, padding: '12px 8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
                border: 'none', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                cursor: isParsingAI ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
              }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  onChange={handleFileUpload} 
                  style={{ display: 'none' }} 
                  disabled={isParsingAI}
                />
                {isParsingAI ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> AI Screenshot</>}
              </label>

              {timetables && timetables.length > 0 && (
                <button
                  onClick={handleClearAllTimetables}
                  style={{
                    padding: '12px 14px', background: 'rgba(239, 68, 68, 0.15)', color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s'
                  }}
                  title="Clear All Timetable Entries"
                >
                  <Trash2 size={16} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '4px' }}>Add Class</h3>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>Subject Name</label>
                <input 
                  value={subject} onChange={e => setSubject(e.target.value)} 
                  placeholder="e.g. Data Structures"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>Faculty Name</label>
                <input 
                  value={faculty} onChange={e => setFaculty(e.target.value)} 
                  placeholder="e.g. Dr. Smith"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
              </div>

              <SearchableSelect 
                label="Classroom"
                value={roomNodeId}
                onChange={setRoomNodeId}
                nodes={nodes}
                placeholder="Select Classroom..."
                allowCurrentLocation={false}
                filterType="classroom"
              />

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>Day</label>
                  <select 
                    value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                  >
                    {DAYS.map((day, idx) => (
                      <option key={idx} value={idx}>{day}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>Start Time</label>
                  <input 
                    type="time" value={startTime} onChange={e => setStartTime(e.target.value)} 
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>End Time</label>
                  <input 
                    type="time" value={endTime} onChange={e => setEndTime(e.target.value)} 
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '10px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                >Cancel</button>
                <button 
                  onClick={handleAddClass}
                  disabled={isSubmitting}
                  style={{ flex: 1, padding: '10px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Save Class'}
                </button>
              </div>
            </div>
          )}

          {/* List of Classes */}
          {sortedTimetables.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Calendar size={48} opacity={0.2} />
              <p>Your timetable is empty.<br/>Add your classes to get automatic routing!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Day Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <button 
                  onClick={() => setCurrentDayIndex(prev => (prev - 1 + 7) % 7)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronLeft size={20} />
                </button>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {DAYS[currentDayIndex]}
                </h4>
                <button 
                  onClick={() => setCurrentDayIndex(prev => (prev + 1) % 7)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Classes for selected day */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(() => {
                  const dayClasses = sortedTimetables.filter(c => {
                    const cDayIndex = c.dayOfWeek !== undefined ? c.dayOfWeek : (c.day ? DAYS.indexOf(c.day) : -1);
                    return cDayIndex === currentDayIndex;
                  });

                  if (dayClasses.length === 0) {
                    return (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                        No classes scheduled for {DAYS[currentDayIndex]}.
                      </div>
                    );
                  }

                  return dayClasses.map(cls => (
                        <div key={cls.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h5 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text)' }}>{cls.subject} {cls.faculty && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({cls.faculty})</span>}</h5>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {cls.startTime || cls.time} {cls.endTime ? `- ${cls.endTime}` : ''}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {cls.roomNodeId ? (nodes[cls.roomNodeId]?.name || 'Unknown Room') : (cls.room || 'Unknown Room')}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDelete(cls.id)}
                            style={{ background: 'transparent', border: 'none', color: '#EF4444', padding: '8px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                  ));
                })()}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
