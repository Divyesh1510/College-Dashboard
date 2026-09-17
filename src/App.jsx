import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import MainApp from './pages/MainApp';
import AdminApp from './pages/AdminApp';
import AdminTimetablesApp from './pages/AdminTimetablesApp';
import AttendancePage from './pages/AttendancePage';
import CollegeDashboardHome from './pages/CollegeDashboardHome';
import Login from './pages/Login';
import { auth, db } from './utils/firebase';
import { onAuthStateChanged, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

function AdminRoute({ user, children }) {
  if (user && user.email === 'divyeshatla@gmail.com') {
    return children;
  }
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0F172A', color: 'white', padding: '24px', textAlign: 'center' }}>
      <h1 style={{ color: '#ef4444', marginBottom: '16px' }}>Access Denied</h1>
      <p style={{ color: 'var(--text-muted)' }}>You must be the administrator to access the mapping tools.</p>
      <a href="/" style={{ marginTop: '24px', color: '#3B82F6', textDecoration: 'none', fontWeight: 'bold' }}>Return to Dashboard</a>
    </div>
  );
}

function App() {
  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    // Check for native app authentication bridge token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('googleIdToken');
    
    if (token) {
      try {
        const credential = GoogleAuthProvider.credential(token);
        signInWithCredential(auth, credential).then(() => {
          // Remove token from URL to prevent accidental sharing
          window.history.replaceState({}, document.title, window.location.pathname);
        }).catch(err => console.error("Silent native auth failed", err));
      } catch (err) {
        console.error("Credential creation failed", err);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Automatically accept terms if coming from native app (already accepted there)
        if (token || sessionStorage.getItem('needsTermsAcceptance') === 'false') {
           setTermsAccepted(true);
        } else if (sessionStorage.getItem('needsTermsAcceptance') === 'true') {
          setTermsAccepted(false);
        } else {
          setTermsAccepted(true);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);


  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A', color: 'white' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const acceptTerms = async () => {
    sessionStorage.removeItem('needsTermsAcceptance');
    setTermsAccepted(true);
  };

  if (!termsAccepted) {
    return (
      <div style={{ height: '100dvh', width: '100vw', background: '#0F172A', color: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ flex: 1, maxWidth: '800px', margin: '0 auto', width: '100%', padding: '40px 24px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '32px', color: 'white' }}>Terms and Conditions</h2>
          
          <div style={{ flex: 1, fontSize: '16px', color: '#CBD5E1', lineHeight: 1.8 }}>
            <p>Welcome to College Dashboard!</p>
            <p>By using this application, you agree to the following terms:</p>
            <ul style={{ paddingLeft: '24px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <li>The map data and routing algorithms are provided "as-is" for informational purposes.</li>
              <li>We are not responsible for any inaccuracies in routing or physical changes to campus layout.</li>
              <li>You agree to share your location data solely for the purpose of live navigation features while using the app.</li>
              <li>Please remain aware of your surroundings and observe all physical safety signs and barriers on campus.</li>
            </ul>
          </div>

          <div style={{ marginTop: '48px', paddingBottom: '32px' }}>
            <button 
              onClick={acceptTerms}
              style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #4F46E5, #3B82F6)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)' }}
            >
              I Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CollegeDashboardHome />} />
          <Route path="/map" element={<MainApp />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/redev" element={
            <AdminRoute user={user}>
              <AdminApp />
            </AdminRoute>
          } />
          <Route path="/redevadmin" element={
            <AdminRoute user={user}>
              <AdminTimetablesApp />
            </AdminRoute>
          } />
        </Routes>
      </BrowserRouter>
    </APIProvider>
  );
}

export default App;
