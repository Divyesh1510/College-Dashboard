import React from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '../utils/firebase';
import { db } from '../utils/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Compass, Loader2 } from 'lucide-react';

const parseDevice = (ua) => {
  let browser = "Unknown", os = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  else if (ua.includes("Edge") || ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "MacOS";
  else if (ua.includes("X11")) os = "UNIX";
  else if (ua.includes("Linux")) os = "Linux";
  if (ua.includes("Android")) os = "Android";
  if (ua.includes("like Mac OS X")) os = "iOS";

  const type = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "Mobile" : "Desktop";
  return { browser, os, type };
};

export default function Login() {
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  React.useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          // Log the login event
          try {
            const device = parseDevice(navigator.userAgent);
            await addDoc(collection(db, 'loginLogs'), {
              userId: result.user.uid,
              userName: result.user.displayName,
              userEmail: result.user.email,
              timestamp: serverTimestamp(),
              deviceOS: device.os,
              deviceBrowser: device.browser,
              deviceType: device.type,
              userAgent: navigator.userAgent
            });
          } catch (logErr) {
            console.error("Failed to write audit log:", logErr);
          }
        }
      } catch (error) {
        console.error("Redirect Error:", error);
      }
    };
    handleRedirectResult();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsRedirecting(true);
      const result = await signInWithPopup(auth, googleProvider);
      sessionStorage.setItem('needsTermsAcceptance', 'true');
      
      // Log the login event
      try {
        const device = parseDevice(navigator.userAgent);
        await addDoc(collection(db, 'loginLogs'), {
          userId: result.user.uid,
          userName: result.user.displayName,
          userEmail: result.user.email,
          timestamp: serverTimestamp(),
          deviceOS: device.os,
          deviceBrowser: device.browser,
          deviceType: device.type,
          userAgent: navigator.userAgent
        });
      } catch (logErr) {
        console.error("Failed to write audit log:", logErr);
      }
    } catch (error) {
      setIsRedirecting(false);
      console.error("Error signing in with Google", error);
      // alert("Failed to login with Google.");
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      color: 'white',
      padding: '24px'
    }}>
      {/* Animated Mesh Gradient Background */}
      <div className="animated-bg"></div>

      <div className="glass-card-premium" style={{
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '36px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        position: 'relative'
      }}>
        {/* Logo & Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <img src="/logo.png" alt="Campus Nav Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ 
              fontSize: '36px', 
              margin: 0, 
              fontWeight: 800, 
              letterSpacing: '-1px',
              background: 'linear-gradient(to right, #ffffff, #94A3B8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>College Dashboard</h1>
            <p style={{ color: '#94A3B8', fontSize: '16px', margin: '8px 0 0 0', fontWeight: 500 }}>
              Your all-in-one portal for navigation, attendance & timetables.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isRedirecting}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: 'white',
            color: '#0F172A',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: isRedirecting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
          onMouseOver={(e) => {
            if(!isRedirecting) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
            }
          }}
          onMouseOut={(e) => {
            if(!isRedirecting) {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            }
          }}
        >
          {isRedirecting ? (
            <>
              <Loader2 size={24} className="spin" />
              Connecting securely...
            </>
          ) : (
            <>
              <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '24px', height: '24px' }} />
              Continue with Google
            </>
          )}
        </button>
      </div>
      
      {/* Footer Watermark */}
      <div style={{ position: 'absolute', bottom: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '14px', textAlign: 'center', zIndex: 10, fontWeight: 500, letterSpacing: '0.5px' }}>
        &copy; {new Date().getFullYear()} Divyesh Reddy. All Rights Reserved.
      </div>
    </div>
  );
}
