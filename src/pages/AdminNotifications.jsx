import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs, deleteDoc, doc, addDoc } from 'firebase/firestore';

export default function AdminNotifications() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState({});

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'user_requests'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const approveRequest = async (req) => {
    try {
      await addDoc(collection(db, 'saved_classrooms'), {
        name: req.roomName
      });
      
      const reply = replies[req.id] || '';
      if (req.userEmail) {
        await addDoc(collection(db, 'emails'), {
          to: req.userEmail,
          userName: req.userName,
          roomName: req.roomName,
          status: 'approved',
          replyText: reply,
          timestamp: Date.now()
        });
      }

      await deleteDoc(doc(db, 'user_requests', req.id));
      alert(`Room "${req.roomName}" approved and added to Saved Classrooms.`);
      fetchRequests();
    } catch (err) {
      console.error("Error approving request", err);
      alert("Error approving request");
    }
  };

  const deleteRequest = async (req) => {
    if (!window.confirm("Are you sure you want to dismiss this request?")) return;
    try {
      const reply = replies[req.id] || '';
      if (req.userEmail) {
        await addDoc(collection(db, 'emails'), {
          to: req.userEmail,
          userName: req.userName,
          roomName: req.roomName,
          status: 'rejected',
          replyText: reply,
          timestamp: Date.now()
        });
      }

      await deleteDoc(doc(db, 'user_requests', req.id));
      fetchRequests();
    } catch (err) {
      console.error("Error deleting request", err);
    }
  };

  if (loading) return <div style={{ padding: '20px', color: '#94A3B8' }}>Loading notifications...</div>;

  return (
    <div style={{ padding: '24px', color: '#F8FAFC', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <h2>User Notifications & Requests</h2>
      {requests.length === 0 ? (
        <p style={{ color: '#94A3B8' }}>No pending requests.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {requests.map(req => (
            <div key={req.id} style={{ background: '#1E293B', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#818CF8' }}>{req.type === 'classroom_request' ? 'Custom Classroom Request' : 'Feedback / Error'}</h3>
                  <p style={{ margin: '0 0 4px 0' }}><strong>User:</strong> {req.userName} ({req.userEmail})</p>
                  {req.type === 'classroom_request' && (
                    <p style={{ margin: '0 0 4px 0' }}><strong>Requested Room:</strong> {req.roomName}</p>
                  )}
                  {req.message && (
                    <p style={{ margin: '0 0 4px 0', color: '#CBD5E1' }}><strong>Message:</strong> {req.message}</p>
                  )}
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                    {new Date(req.timestamp).toLocaleString()}
                  </p>
                  
                  <div style={{ marginTop: '12px' }}>
                    <textarea 
                      placeholder="Optional message to the user..."
                      value={replies[req.id] || ''}
                      onChange={(e) => setReplies({ ...replies, [req.id]: e.target.value })}
                      style={{ width: '100%', minHeight: '60px', background: 'rgba(0,0,0,0.2)', border: '1px solid #475569', borderRadius: '6px', color: '#F8FAFC', padding: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  {req.type === 'classroom_request' && (
                    <button 
                      onClick={() => approveRequest(req)}
                      style={{ background: '#10B981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Approve & Add
                    </button>
                  )}
                  <button 
                    onClick={() => deleteRequest(req)}
                    style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Reject & Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
