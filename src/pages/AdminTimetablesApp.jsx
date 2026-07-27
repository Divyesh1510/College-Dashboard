import React from 'react';
import { auth } from '../utils/firebase';
import { Link } from 'react-router-dom';
import { LogOut, Calendar } from 'lucide-react';
import AdminTimetables from './AdminTimetables';

const TabButton = ({ active, icon, label }) => (
  <button 
    style={{ 
      display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', 
      background: active ? 'linear-gradient(90deg, rgba(79, 70, 229, 0.2) 0%, rgba(79, 70, 229, 0) 100%)' : 'transparent', 
      color: active ? '#818CF8' : '#94A3B8', 
      border: 'none', 
      borderLeft: active ? '4px solid #818CF8' : '4px solid transparent',
      borderRadius: '0 12px 12px 0', 
      cursor: 'pointer', 
      fontWeight: active ? 700 : 500, 
      fontSize: '15px', 
      textAlign: 'left', 
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      marginLeft: '-16px',
      width: '100%'
    }}
  >
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
      padding: '8px', borderRadius: '10px',
      transition: 'all 0.3s ease'
    }}>
      {icon}
    </div>
    {label}
  </button>
);

export default function AdminTimetablesApp() {
  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      backgroundColor: '#0F172A',
      color: 'white',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Sidebar */}
      <div style={{ 
        width: '280px', 
        backgroundColor: '#1E293B', 
        display: 'flex', 
        flexDirection: 'column', 
        borderRight: '1px solid #334155',
        boxShadow: '4px 0 24px rgba(0,0,0,0.2)',
        zIndex: 10
      }}>
        {/* Header */}
        <div style={{ 
          padding: '24px', 
          borderBottom: '1px solid #334155',
          background: 'linear-gradient(to bottom, rgba(30,41,59,1) 0%, rgba(30,41,59,0.9) 100%)'
        }}>
          <h1 style={{ 
            fontSize: '22px', 
            margin: 0, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            color: '#F8FAFC',
            fontWeight: 800,
            letterSpacing: '-0.5px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
              padding: '8px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
            }}>
              <Calendar size={20} color="white" strokeWidth={2.5} />
            </div>
            Timetables
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '13px', margin: '8px 0 0 0', paddingLeft: '44px' }}>
            Timetable Viewing Portal
          </p>
        </div>
        
        {/* Navigation */}
        <div style={{ 
          flex: 1, 
          padding: '24px 16px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px',
          overflowY: 'auto'
        }}>
          <TabButton 
            active={true}
            icon={<Calendar size={20} />} 
            label="All Timetables" 
          />
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '24px', 
          borderTop: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <button style={{ 
              width: '100%', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', 
              border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', cursor: 'pointer', 
              fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
              Return to Map
            </button>
          </Link>
          <button 
            onClick={handleLogout}
            style={{ 
              width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', 
              border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', cursor: 'pointer', 
              fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <AdminTimetables />
      </div>
    </div>
  );
}
