import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedBlock, setSelectedBlock] = useState('A');
  const [selectedFloor, setSelectedFloor] = useState('0');
  const [selectedRoom, setSelectedRoom] = useState('001');

  const [coordsInput, setCoordsInput] = useState('');

  // Compute available floors
  const availableFloors = selectedBlock === 'B' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 5, 6];

  // Compute available rooms for selected floor
  const availableRooms = Array.from({ length: 22 }, (_, i) => {
    const num = i + 1;
    const f = parseInt(selectedFloor);
    if (f === 0) {
      return num < 10 ? `00${num}` : `0${num}`;
    }
    return `${f}${num < 10 ? '0' + num : num}`;
  });

  // Keep dropdowns valid when dependencies change
  useEffect(() => {
    if (!availableFloors.includes(parseInt(selectedFloor))) {
      setSelectedFloor('0');
    }
  }, [selectedBlock]);

  useEffect(() => {
    if (!availableRooms.includes(selectedRoom)) {
      setSelectedRoom(availableRooms[0]);
    }
  }, [selectedFloor, availableRooms]);

  useEffect(() => {
    fetchClassrooms();
    
    // ONE-TIME MIGRATION SCRIPT
    const runMigration = async () => {
      try {
        const snap = await getDocs(collection(db, 'saved_classrooms'));
        let migratedCount = 0;
        for (const d of snap.docs) {
          const data = d.data();
          if (data.name && data.name.includes(' - ')) {
            const newName = data.name.replace(' - ', '');
            await updateDoc(doc(db, 'saved_classrooms', d.id), { name: newName });
            migratedCount++;
          }
        }
        if (migratedCount > 0) {
          console.log(`Migrated ${migratedCount} rooms automatically.`);
          fetchClassrooms(); // re-fetch to update UI
        }
      } catch (e) {
        console.error("Migration error:", e);
      }
    };
    runMigration();
  }, []);

  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'saved_classrooms'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setClassrooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const parseCoordinates = (input) => {
    // Decimal format: "17.534, 78.123" or "17.534 78.123"
    const decimalMatch = input.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (decimalMatch) {
      return { lat: parseFloat(decimalMatch[1]), lng: parseFloat(decimalMatch[2]) };
    }
    
    // DMS format: "17°28'08.4\"N 78°30'19.4\"E"
    const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["”″\s]*([NS])[\s,]*(\d+)[°\s]+(\d+)['\s]+([\d.]+)["”″\s]*([EW])/i;
    const dmsMatch = input.match(dmsRegex);
    if (dmsMatch) {
      let lat = parseFloat(dmsMatch[1]) + (parseFloat(dmsMatch[2]) / 60) + (parseFloat(dmsMatch[3]) / 3600);
      if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
      
      let lng = parseFloat(dmsMatch[5]) + (parseFloat(dmsMatch[6]) / 60) + (parseFloat(dmsMatch[7]) / 3600);
      if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
      
      return { lat, lng };
    }
    return null;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const finalRoomName = `${selectedBlock}${selectedRoom}`;
    
    if (classrooms.find(c => c.name === finalRoomName)) {
      alert(`Classroom "${finalRoomName}" is already saved.`);
      return;
    }

    const payload = { name: finalRoomName };
    if (coordsInput.trim()) {
      const coords = parseCoordinates(coordsInput);
      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
      } else {
        alert("Invalid format. Please enter 'Latitude, Longitude' (e.g., 17.53, 78.12) or DMS format.");
        return;
      }
    } else {
      // Auto-sync coordinates from a room in the same block with same last 2 digits
      const lastTwoDigits = finalRoomName.slice(-2);
      const blockLetter = finalRoomName.charAt(0);
      const matchingRoom = classrooms.find(c => 
        c.name.startsWith(blockLetter) && 
        c.name.endsWith(lastTwoDigits) && 
        c.name !== finalRoomName &&
        c.lat && c.lng
      );
      
      if (matchingRoom) {
        payload.lat = matchingRoom.lat;
        payload.lng = matchingRoom.lng;
      }
    }

    try {
      await addDoc(collection(db, 'saved_classrooms'), payload);
      setCoordsInput('');
      fetchClassrooms();
    } catch (err) {
      console.error("Error adding room", err);
      alert("Failed to add room.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this room from the saved list?")) return;
    try {
      await deleteDoc(doc(db, 'saved_classrooms', id));
      fetchClassrooms();
    } catch (err) {
      console.error("Error deleting room", err);
    }
  };

  const handleUpdateCoords = async (room) => {
    const existing = room.lat && room.lng ? `${room.lat}, ${room.lng}` : '';
    const input = prompt(`Enter Coordinates (Lat, Lng) or DMS for ${room.name}:`, existing);
    if (input === null || !input.trim()) return;

    const coords = parseCoordinates(input);
    if (!coords) {
      alert("Invalid format. Please enter 'Latitude, Longitude' (e.g., 17.53, 78.12) or DMS format.");
      return;
    }

    try {
      await updateDoc(doc(db, 'saved_classrooms', room.id), { lat: coords.lat, lng: coords.lng });
      
      const lastTwoDigits = room.name.slice(-2);
      const blockLetter = room.name.charAt(0);
      const matchingRooms = classrooms.filter(c => 
        c.id !== room.id &&
        c.name.startsWith(blockLetter) && 
        c.name.endsWith(lastTwoDigits)
      );

      if (matchingRooms.length > 0) {
        if (window.confirm(`Do you want to sync these coordinates to ${matchingRooms.length} other ${blockLetter}*${lastTwoDigits} rooms?`)) {
          for (let mRoom of matchingRooms) {
            await updateDoc(doc(db, 'saved_classrooms', mRoom.id), { lat: coords.lat, lng: coords.lng });
          }
        }
      }

      fetchClassrooms();
    } catch (err) {
      console.error("Error updating coordinates", err);
      alert("Failed to update coordinates.");
    }
  };

  // Group by Block -> Floor
  const grouped = {};
  classrooms.forEach(room => {
    const name = room.name || '';
    // Handle both new format (A615) and old format (A - 615) just in case
    const isOldFormat = name.includes(' - ');
    const block = isOldFormat ? name.split(' - ')[0] : name.charAt(0) || 'Unknown';
    let floor = 'Unknown';
    
    if (isOldFormat) {
      const parts = name.split(' - ');
      if (parts.length > 1) {
        const roomNum = parts[1];
        if (roomNum.length >= 3) {
          floor = roomNum.length === 3 ? roomNum[0] : roomNum.substring(0, 2);
        }
      }
    } else if (name.length > 1) {
      const roomNum = name.substring(1);
      if (roomNum.length >= 3) {
        floor = roomNum.length === 3 ? roomNum[0] : roomNum.substring(0, 2);
      }
    }
    if (!grouped[block]) grouped[block] = {};
    if (!grouped[block][floor]) grouped[block][floor] = [];
    grouped[block][floor].push(room);
  });

  if (loading) return <div style={{ padding: '20px', color: '#94A3B8' }}>Loading classrooms...</div>;

  return (
    <div style={{ padding: '24px', color: '#F8FAFC', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <h2>Manage Saved Classrooms</h2>
      
      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid #334155', maxWidth: '600px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Block</label>
            <select 
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', background: '#1E293B', border: '1px solid #334155', color: 'white', outline: 'none' }}
            >
              {BLOCKS.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Floor</label>
            <select 
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', background: '#1E293B', border: '1px solid #334155', color: 'white', outline: 'none' }}
            >
              {availableFloors.map(f => <option key={f} value={f.toString()}>{f === 0 ? 'Ground Floor (0)' : `Floor ${f}`}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Room</label>
            <select 
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', background: '#1E293B', border: '1px solid #334155', color: 'white', outline: 'none' }}
            >
              {availableRooms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Coordinates (Lat, Lng) [Optional]</label>
            <input 
              type="text" 
              value={coordsInput} 
              onChange={e => setCoordsInput(e.target.value)} 
              placeholder="e.g. 17.534, 78.123" 
              style={{ padding: '10px', borderRadius: '8px', background: '#1E293B', border: '1px solid #334155', color: 'white', outline: 'none' }}
            />
          </div>
          <button type="submit" style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', height: '38px' }}>
            Add Room
          </button>
        </div>
      </form>

      {classrooms.length === 0 ? (
        <p style={{ color: '#94A3B8' }}>No saved classrooms.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
          {Object.keys(grouped).sort().map(block => (
            <div key={block} style={{ background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
              <div style={{ background: '#334155', padding: '8px 16px', fontWeight: 'bold', fontSize: '16px', color: '#F8FAFC' }}>
                Block {block}
              </div>
              <div style={{ padding: '12px' }}>
                {Object.keys(grouped[block]).sort((a, b) => parseInt(a) - parseInt(b)).map(floor => (
                  <div key={floor} style={{ marginBottom: '16px' }}>
                    <div style={{ color: '#94A3B8', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                      Floor {floor}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                      {grouped[block][floor].map(room => (
                        <div key={room.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{room.name}</span>
                            {room.lat && room.lng && <span style={{ fontSize: '10px', color: '#10B981' }}>{room.lat.toFixed(5)}, {room.lng.toFixed(5)}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <button 
                              onClick={() => handleUpdateCoords(room)}
                              style={{ background: 'transparent', color: '#3B82F6', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                            >
                              {room.lat && room.lng ? 'Edit Coordinates' : 'Add Coordinates'}
                            </button>
                            <button 
                              onClick={() => handleDelete(room.id)}
                              style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
