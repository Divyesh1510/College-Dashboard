import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, X as Cross, Loader2, UploadCloud, Save, Trash2 } from 'lucide-react';
import { db, storage } from '../utils/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadString } from 'firebase/storage';

export default function AttendanceManager({ isOpen, onClose, user }) {
  const [attendanceList, setAttendanceList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isParsingAI, setIsParsingAI] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchAttendance();
    }
  }, [isOpen, user]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'attendance'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendanceList(data);
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !user) return;

    setIsParsingAI(true);
    try {
      const functions = getFunctions();
      const parseAttendance = httpsCallable(functions, 'parseAttendanceImage');

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
          uploadString(storageRef, base64String, 'base64', { contentType: file.type }).catch(err => console.error(err));

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
      alert(`Successfully processed ${files.length} screenshot(s) and auto-merged subjects!`);
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

  const handleDelete = async (id) => {
    if (confirm("Delete this subject?")) {
      await deleteDoc(doc(db, 'attendance', id));
      setAttendanceList(prev => prev.filter(i => i.id !== id));
    }
  };

  // Calculations
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

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-700">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Check className="w-6 h-6 text-indigo-400" />
            Attendance Manager
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto flex-1">
          
          <div className="flex justify-between items-center mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div>
              <p className="text-slate-400 text-sm mb-1">Overall Attendance</p>
              <div className="flex items-end gap-3">
                <span className={`text-3xl font-bold ${overallPercent >= 75 ? 'text-green-400' : 'text-red-400'}`}>
                  {overallPercent}%
                </span>
                <span className="text-slate-500 mb-1">({attendedOverall}/{totalOverall})</span>
              </div>
              {overallNeeded > 0 && (
                <p className="text-red-400 text-sm mt-1">Need to attend next {overallNeeded} classes to reach 75% overall.</p>
              )}
            </div>

            <div className="flex items-center gap-3 relative">
              {attendanceList.length > 0 && (
                <button
                  onClick={handleClearAllAttendance}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg cursor-pointer transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All</span>
                </button>
              )}

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="attendance-upload"
                disabled={isParsingAI}
              />
              <label 
                htmlFor="attendance-upload"
                className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors shadow-lg shadow-indigo-900/20 ${isParsingAI ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {isParsingAI ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                <span className="font-medium">{isParsingAI ? 'Analyzing...' : 'Auto-fill from Image'}</span>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
          ) : attendanceList.length === 0 ? (
            <div className="text-center p-12 text-slate-400 border-2 border-dashed border-slate-700 rounded-xl">
              <p>No attendance data found.</p>
              <p className="text-sm mt-2">Upload a screenshot of your attendance portal to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-sm">
                    <th className="pb-3 px-2 font-medium">Subject</th>
                    <th className="pb-3 px-2 font-medium text-center">Attended</th>
                    <th className="pb-3 px-2 font-medium text-center">Total</th>
                    <th className="pb-3 px-2 font-medium">%</th>
                    <th className="pb-3 px-2 font-medium">Needed (60%)</th>
                    <th className="pb-3 px-2 font-medium text-center">Mark Today</th>
                    <th className="pb-3 px-2 font-medium text-center">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceList.map(item => {
                    const pct = item.totalClasses > 0 ? (item.attendedClasses / item.totalClasses * 100) : 0;
                    const needed = getNeededClasses(item.attendedClasses, item.totalClasses, 0.60);
                    return (
                      <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                        <td className="py-3 px-2 text-white font-medium">{item.subject}</td>
                        <td className="py-3 px-2 text-center">
                          <input 
                            type="number" 
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-center focus:outline-none focus:border-indigo-500"
                            value={item.attendedClasses}
                            onChange={(e) => handleUpdate(item.id, 'attendedClasses', e.target.value)}
                          />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <input 
                            type="number" 
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-center focus:outline-none focus:border-indigo-500"
                            value={item.totalClasses}
                            onChange={(e) => handleUpdate(item.id, 'totalClasses', e.target.value)}
                          />
                        </td>
                        <td className="py-3 px-2">
                          <span className={`font-bold ${pct >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          {needed > 0 ? (
                            <span className="text-red-400 text-sm font-medium">+{needed} classes</span>
                          ) : (
                            <span className="text-green-400 text-sm">Safe</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleMark(item, true)} className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-md transition-colors" title="Attended">
                              <Check className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleMark(item, false)} className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors" title="Missed">
                              <Cross className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded-md transition-colors">
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
