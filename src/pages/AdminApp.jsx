import React, { useState, useEffect, useRef } from 'react';
import { Map as GoogleMap, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { db, auth } from '../utils/firebase';
import { collection, addDoc, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { LogOut, ChevronDown, ChevronRight, LayoutDashboard, Map as MapIcon, ShieldAlert, Navigation as NavIcon, Globe, Smartphone } from 'lucide-react';

import AdminDashboard from './AdminDashboard';
import AdminAuditLogs from './AdminAuditLogs';
import AdminRouteAnalytics from './AdminRouteAnalytics';
import AdminNotifications from './AdminNotifications';
import AdminClassrooms from './AdminClassrooms';
import AdminTimetables from './AdminTimetables';
import AdminAttendance from './AdminAttendance';
import { Bell, BookOpen, Calendar as CalendarIcon, CheckSquare } from 'lucide-react';

// Helper component for portal sidebar tabs
const TabButton = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
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
      marginLeft: '-16px' // Negate parent padding for border effect
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

// Custom Polygon component
const Polygon = ({ id, paths, color, onClick, editable, registerPolygon }) => {
  const map = useMap();
  const polygonRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    const polygon = new window.google.maps.Polygon({
      paths,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35,
      editable,
      draggable: editable,
    });
    polygon.setMap(map);
    polygonRef.current = polygon;
    if (registerPolygon) registerPolygon(id, polygon);

    return () => {
      polygon.setMap(null);
      if (registerPolygon) registerPolygon(id, null);
    };
  }, [map]); // Only run when map instance is available

  // Sync options without recreating
  useEffect(() => {
    if (polygonRef.current) {
      polygonRef.current.setOptions({
        strokeColor: color,
        fillColor: color,
        editable,
        draggable: editable,
        clickable: !!onClick
      });
    }
  }, [color, editable, onClick]);

  // Sync paths only if not currently editing (to avoid interrupting drag)
  useEffect(() => {
    if (polygonRef.current && !editable && paths && paths.length > 0) {
      polygonRef.current.setPaths(paths);
    }
  }, [paths, editable]);

  // Sync click listener
  useEffect(() => {
    if (polygonRef.current && onClick) {
      const listener = polygonRef.current.addListener('click', onClick);
      return () => window.google.maps.event.removeListener(listener);
    }
  }, [onClick]);

  return null;
};

// Custom Polyline component
const Polyline = ({ path, color = '#10B981', dashed = false, onClick, weight = 4, editable = false, onPathChange }) => {
  const map = useMap();
  const polylineRef = useRef(null);
  const listenersRef = useRef([]);

  useEffect(() => {
    if (!map || !path || path.length === 0) return;
    
    const lineSymbol = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 1,
      scale: 4
    };

    if (!polylineRef.current) {
      polylineRef.current = new window.google.maps.Polyline({
        path, 
        strokeColor: color, 
        strokeOpacity: dashed ? 0 : 1.0, 
        strokeWeight: weight,
        editable,
        clickable: !!onClick,
        icons: dashed ? [{
          icon: lineSymbol,
          offset: '0',
          repeat: '20px'
        }] : []
      });
      polylineRef.current.setMap(map);
    } else {
      const options = {
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: dashed ? 0 : 1.0,
        editable,
        clickable: !!onClick,
        icons: dashed ? [{ icon: lineSymbol, offset: '0', repeat: '20px' }] : []
      };
      // Only sync path from React state if NOT currently editing it, to avoid interrupting drags
      if (!editable) {
        options.path = path;
      }
      polylineRef.current.setOptions(options);
    }
  }, [map, path, color, dashed, weight, editable, onClick]);

  useEffect(() => {
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (polylineRef.current) {
      listenersRef.current.forEach(l => window.google.maps.event.removeListener(l));
      listenersRef.current = [];

      if (editable && onPathChange) {
        const p = polylineRef.current.getPath();
        const triggerChange = () => onPathChange(p.getArray());
        listenersRef.current.push(
          window.google.maps.event.addListener(p, 'set_at', triggerChange),
          window.google.maps.event.addListener(p, 'insert_at', triggerChange),
          window.google.maps.event.addListener(p, 'remove_at', triggerChange)
        );
      }

      if (onClick) {
        listenersRef.current.push(
          polylineRef.current.addListener('click', onClick)
        );
      }
    }
  }, [editable, onClick, onPathChange]);

  return null;
};

export default function AdminApp() {
  const defaultCenter = { lat: 17.5501, lng: 78.1666 };
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, map, audit, routes
  const [mode, setMode] = useState('idle'); // idle, add_node, draw_block, add_edge_road, add_edge_corridor, move_node, edit_block, reconnect_edge
  const [isSatellite, setIsSatellite] = useState(false);
  const [savedClassrooms, setSavedClassrooms] = useState([]);
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState('');

  const [nodes, setNodes] = useState({});
  const [blocks, setBlocks] = useState([]);
  const [edges, setEdges] = useState([]); // edges are [node1, node2, type, name, waypoints]

  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [edgeStartNode, setEdgeStartNode] = useState(null);
  const [currentWaypoints, setCurrentWaypoints] = useState([]);
  const [drawingClickMode, setDrawingClickMode] = useState('bend'); // 'bend' or 'intersection'

  // Mobile Mapping State
  const [isMobileMapping, setIsMobileMapping] = useState(false);
  const [currentMobilePath, setCurrentMobilePath] = useState([]);
  const [mobileDrafts, setMobileDrafts] = useState([]);
  const watchIdRef = useRef(null);
  const lastPosRef = useRef(null);

  const [editingId, setEditingId] = useState(null); // stores node.id, block.id, or edge index
  const [selectedBlockId, setSelectedBlockId] = useState(null); // for highlighting
  const [selectedNodeId, setSelectedNodeId] = useState(null); // for map node selection
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState(null); // for map edge selection

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const originalDataStr = useRef(null);
  const activePolygons = useRef({});
  const [currentEdgeName, setCurrentEdgeName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [openSections, setOpenSections] = useState({
    blocks: false,
    entrances: false,
    intersections: false,
    paths: false,
    mobileMaps: true
  });

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const registerPolygon = (id, polygonInstance) => {
    if (polygonInstance) {
      activePolygons.current[id] = polygonInstance;
    } else {
      delete activePolygons.current[id];
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Error logging out", err);
    }
  };

  const toggleMobileMapping = () => {
    if (isMobileMapping) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsMobileMapping(false);
      if (currentMobilePath.length > 1) {
        setMobileDrafts([...mobileDrafts, { id: Date.now().toString(), path: currentMobilePath }]);
      }
      setCurrentMobilePath([]);
      lastPosRef.current = null;
    } else {
      if ("geolocation" in navigator) {
        setIsMobileMapping(true);
        setCurrentMobilePath([]);
        lastPosRef.current = null;
        
        watchIdRef.current = navigator.geolocation.watchPosition((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          if (lastPosRef.current) {
            const dLat = Math.abs(lat - lastPosRef.current.lat);
            const dLng = Math.abs(lng - lastPosRef.current.lng);
            if (dLat < 0.000015 && dLng < 0.000015) return; // distance filter to smooth minor jitter
          }
          
          const newPos = { lat, lng };
          lastPosRef.current = newPos;
          setCurrentMobilePath(prev => [...prev, newPos]);
        }, (error) => {
          console.error("GPS Error", error);
          alert("GPS Error: " + error.message);
          setIsMobileMapping(false);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
      } else {
        alert("Geolocation not supported by your browser");
      }
    }
  };

  const approveMobileDraft = (draftIdx) => {
    const draft = mobileDrafts[draftIdx];
    if (draft.path.length < 2) return;
    
    const startId = Date.now().toString() + "_start";
    const endId = Date.now().toString() + "_end";
    
    const startNode = { id: startId, name: 'Mobile Path Start', type: 'intersection', coords: draft.path[0] };
    const endNode = { id: endId, name: 'Mobile Path End', type: 'intersection', coords: draft.path[draft.path.length - 1] };
    
    setNodes(prev => ({ ...prev, [startId]: startNode, [endId]: endNode }));
    
    const waypoints = draft.path.slice(1, -1);
    setEdges(prev => [...prev, [startId, endId, 'corridor', 'Mobile Path', waypoints]]);
    
    setMobileDrafts(prev => prev.filter((_, i) => i !== draftIdx));
    setHasUnsavedChanges(true);
  };

  // Fetch saved classrooms
  useEffect(() => {
    const fetchClassrooms = async () => {
      try {
        const snap = await getDocs(collection(db, 'saved_classrooms'));
        const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        rooms.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSavedClassrooms(rooms);
      } catch(e) { console.error(e); }
    };
    fetchClassrooms();
  }, []);

  // Fetch existing map data on load
  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const docRef = doc(db, "campus_map", "latest_graph");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const fetchedNodes = data.nodes || {};
          const fetchedEdges = (data.edges || []).map(e => Array.isArray(e) ? e : [e.start, e.end, e.type, e.name, e.waypoints || []]);
          const fetchedBlocks = data.blocks || [];
          
          setNodes(fetchedNodes);
          setEdges(fetchedEdges);
          setBlocks(fetchedBlocks);
          
          originalDataStr.current = JSON.stringify({ nodes: fetchedNodes, blocks: fetchedBlocks, edges: fetchedEdges });
        } else {
          originalDataStr.current = JSON.stringify({ nodes: {}, blocks: [], edges: [] });
        }
      } catch (error) {
        console.error("Error fetching map data:", error);
      }
    };
    fetchMapData();
  }, []);

  // Track unsaved changes and auto-save
  useEffect(() => {
    if (originalDataStr.current) {
      const currentDataStr = JSON.stringify({ nodes, blocks, edges });
      if (currentDataStr !== originalDataStr.current) {
        setHasUnsavedChanges(true);
        
        // Auto-save logic
        const timer = setTimeout(() => {
          saveToFirebase(true);
        }, 2000);
        
        return () => clearTimeout(timer);
      } else {
        setHasUnsavedChanges(false);
      }
    }
  }, [nodes, blocks, edges]);

  // Warn before browser unload (refresh/close tab)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleMapClick = (e) => {
    if (!e.detail.latLng) return;
    const rawLatLng = e.detail.latLng;
    // Ensure we store a plain object, stripping any Google Maps class methods
    const latLng = { 
      lat: typeof rawLatLng.lat === 'function' ? rawLatLng.lat() : rawLatLng.lat, 
      lng: typeof rawLatLng.lng === 'function' ? rawLatLng.lng() : rawLatLng.lng 
    };

    if (mode === 'idle') {
      setSelectedBlockId(null);
      setSelectedNodeId(null);
      setSelectedEdgeIdx(null);
    } else if (mode === 'add_node') {
      const name = prompt("Enter node name (e.g., 'Block A Entrance'):");
      if (name) {
        const id = Date.now().toString();
        setNodes({ ...nodes, [id]: { id, name, type: 'node', coords: latLng } });
        setMode('idle');
      }
    } else if (mode === 'move_node' && editingId) {
      setNodes({ ...nodes, [editingId]: { ...nodes[editingId], coords: latLng } });
      setMode('idle');
      setEditingId(null);
    } else if (mode === 'add_node_poi') {
      const name = prompt("Enter POI name (e.g., 'Main Cafeteria'):");
      if (name) {
        const categoryList = ['Food', 'Washroom', 'Academic/Lab', 'Admin', 'Sports', 'Other'];
        let catPrompt = "Choose Category (enter number):\n";
        categoryList.forEach((c, i) => catPrompt += `${i+1}. ${c}\n`);
        const catChoice = prompt(catPrompt);
        const catIndex = parseInt(catChoice) - 1;
        const category = categoryList[catIndex] || 'Other';
        
        const id = Date.now().toString();
        setNodes({ ...nodes, [id]: { id, name, type: 'poi', category, coords: latLng } });
        setMode('idle');
      }
    } else if (mode === 'draw_block') {
      setCurrentPolygon([...currentPolygon, latLng]);
    } else if (mode.startsWith('add_edge')) {
      if (!edgeStartNode) return; // Cannot draw on map without a start node

      if (drawingClickMode === 'bend') {
        setCurrentWaypoints([...currentWaypoints, latLng]);
      } else {
        // Drop an intersection node
        const id = Date.now().toString();
        const newNode = { id, name: 'Intersection', type: 'intersection', coords: latLng };
        
        setNodes(prev => ({ ...prev, [id]: newNode }));

        const edgeType = mode === 'add_edge_corridor' ? 'corridor' : 'road';
        const safeName = currentEdgeName || 'Unnamed Road';
        setEdges(prev => [...prev, [edgeStartNode, id, edgeType, safeName, currentWaypoints]]);
        
        setEdgeStartNode(id);
        setCurrentWaypoints([]);
      }
    }
  };

  const handleNodeClick = (nodeId) => {
    if (mode.startsWith('add_edge')) {
      if (!edgeStartNode) {
        setEdgeStartNode(nodeId);
        setCurrentWaypoints([]);
      } else {
        if (edgeStartNode !== nodeId) {
          const edgeType = mode === 'add_edge_corridor' ? 'corridor' : 'road';
          const safeName = currentEdgeName || 'Unnamed Road';
          setEdges([...edges, [edgeStartNode, nodeId, edgeType, safeName, currentWaypoints]]);
        }
        
        // Keep mode active, but update start node so they can chain roads through nodes if they want
        setEdgeStartNode(nodeId); 
        setCurrentWaypoints([]);
      }
    } else if (mode === 'idle') {
      setSelectedEdgeIdx(null);
      setSelectedNodeId(selectedNodeId === nodeId ? null : nodeId);
    }
  };

  const finishPolygon = () => {
    if (currentPolygon.length > 2) {
      const name = prompt("Enter Block Name:");
      if (name) {
        const floorsStr = prompt(`How many floors does ${name} have? (Default: 1)`);
        const floors = parseInt(floorsStr) || 1;
        setBlocks([...blocks, { id: Date.now().toString(), name, paths: currentPolygon, floors }]);
      }
    }
    setCurrentPolygon([]);
    setMode('idle');
    setEditingId(null);
  };

  const finishEditingBlock = () => {
    if (editingId && activePolygons.current[editingId]) {
      const path = activePolygons.current[editingId].getPath();
      if (path) {
        const newPaths = path.getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
        setBlocks(blocks.map(b => b.id === editingId ? { ...b, paths: newPaths } : b));
      }
    }
    setMode('idle');
    setEditingId(null);
  };

  const saveToFirebase = async (silent = false) => {
    try {
      // Sanitize the data: Firestore throws errors if there are undefined fields or custom objects
      // JSON serialization safely strips undefined keys and calls toJSON() on any class instances
      const sanitizedNodes = JSON.parse(JSON.stringify(nodes));
      const sanitizedBlocks = JSON.parse(JSON.stringify(blocks));
      
      // Firestore does not support nested arrays, convert edges to array of objects
      const edgesToSave = edges.map(e => ({ start: e[0], end: e[1], type: e[2] || 'road', name: e[3] || '', waypoints: e[4] || [] }));
      const sanitizedEdges = JSON.parse(JSON.stringify(edgesToSave));

      await setDoc(doc(db, "campus_map", "latest_graph"), {
        nodes: sanitizedNodes,
        blocks: sanitizedBlocks,
        edges: sanitizedEdges
      });
      originalDataStr.current = JSON.stringify({ nodes, blocks, edges });
      setHasUnsavedChanges(false);
      if (!silent) alert("Successfully saved to Firebase!");
    } catch (e) {
      console.error("Error adding document: ", e);
      if (!silent) alert("Error saving. Did you enable Firestore and set security rules to allow writes? Details: " + e.message);
    }
  };

  const parseCoordinateString = (str) => {
    const coords = [];
    
    // Helper to parse DMS to Decimal Degrees
    const dmsToDd = (dmsStr) => {
      const regex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["\s]*([NSEW])/i;
      const match = dmsStr.match(regex);
      if (!match) return null;
      let dd = parseInt(match[1]) + parseInt(match[2])/60 + parseFloat(match[3])/3600;
      if (match[4].toUpperCase() === 'S' || match[4].toUpperCase() === 'W') dd = dd * -1;
      return dd;
    };

    // First check if the entire string is just a space-separated DMS pair or decimal pair without commas
    if (!str.includes(',') && !str.includes('\n') && !str.includes('|') && !str.includes(';')) {
      const parts = str.split(/\s+/).filter(p => p);
      if (parts.length === 2) {
        // Try DMS
        const latDd = dmsToDd(parts[0]);
        const lngDd = dmsToDd(parts[1]);
        if (latDd !== null && lngDd !== null) {
          coords.push({ lat: latDd, lng: lngDd });
          return coords;
        }
        // Try simple decimals
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          coords.push({ lat, lng });
          return coords;
        }
      }
    }

    // splits by newlines, semicolons, or pipes
    const pairs = str.split(/[\n;|]+/).map(s => s.trim()).filter(s => s);
    for (const pair of pairs) {
      // If it contains a comma, assume it's lat,lng
      if (pair.includes(',')) {
        const parts = pair.split(',');
        if (parts.length >= 2) {
          let lat = parseFloat(parts[0].trim());
          let lng = parseFloat(parts[1].trim());
          
          if (isNaN(lat) || isNaN(lng)) {
             // fallback to DMS
             const lDd = dmsToDd(parts[0].trim());
             const rDd = dmsToDd(parts[1].trim());
             if (lDd !== null && rDd !== null) {
               lat = lDd;
               lng = rDd;
             }
          }
          if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
        }
      } else {
        // Try space-separated fallback for lines
        const parts = pair.split(/\s+/).filter(p => p);
        if (parts.length >= 2) {
          const lDd = dmsToDd(parts[0]);
          const rDd = dmsToDd(parts[1]);
          if (lDd !== null && rDd !== null) {
            coords.push({ lat: lDd, lng: rDd });
          } else {
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
          }
        }
      }
    }
    return coords;
  };

  const handleAddPathByCoords = () => {
    const input = prompt("Paste coordinates for the path (e.g. 17.55,78.16 | 17.56,78.17):");
    if (!input) return;
    const coords = parseCoordinateString(input);
    if (coords.length < 2) {
      alert("You need at least 2 valid coordinates to create a path.");
      return;
    }
    
    const name = prompt("Name this path (e.g., Main Road):", "Unnamed Road") || "Unnamed Road";
    const typePrompt = prompt("Path type (road or corridor)?", "road");
    const edgeType = typePrompt?.toLowerCase() === 'corridor' ? 'corridor' : 'road';

    // Create Start Node
    const startId = Date.now().toString() + "_start";
    const endId = Date.now().toString() + "_end";
    
    const startNode = { id: startId, name: 'Path Start', type: 'intersection', coords: coords[0] };
    const endNode = { id: endId, name: 'Path End', type: 'intersection', coords: coords[coords.length - 1] };
    
    setNodes(prev => ({ ...prev, [startId]: startNode, [endId]: endNode }));
    
    const waypoints = coords.slice(1, -1);
    setEdges(prev => [...prev, [startId, endId, edgeType, name, waypoints]]);
    setHasUnsavedChanges(true);
    alert(`Path "${name}" created with ${coords.length} points!`);
  };

  const handleAddClassroomByCoords = () => {
    const coordsStr = prompt("Enter Coordinates (lat, lng):");
    if (!coordsStr) return;
    const parsed = parseCoordinateString(coordsStr);
    if (parsed.length === 0) { alert("Invalid coordinates."); return; }
    setPendingCoords(parsed[0]);
    setShowClassroomModal(true);
  };

  const deleteBlock = (id) => {
    setBlocks(blocks.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };
  const deleteNode = (id) => {
    const newNodes = { ...nodes };
    delete newNodes[id];
    setNodes(newNodes);
    setEdges(edges.filter(e => e[0] !== id && e[1] !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };
  const deleteEdge = (idx) => {
    setEdges(edges.filter((_, i) => i !== idx));
    if (selectedEdgeIdx === idx) setSelectedEdgeIdx(null);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--background)', color: 'var(--text)' }}>
      
      {/* GLOBAL ADMIN PORTAL SIDEBAR */}
      <div style={{ width: '280px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(16px)', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '4px 0 24px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '32px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'linear-gradient(135deg, #4F46E5, #3B82F6)', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)' }}>
            <MapIcon size={24} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, background: 'linear-gradient(to right, #F8FAFC, #94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Admin Portal</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Campus-Nav</p>
          </div>
        </div>
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
          <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={<MapIcon size={20}/>} label="Map Editor" />
          <TabButton active={activeTab === 'mobile'} onClick={() => setActiveTab('mobile')} icon={<Smartphone size={20}/>} label="Mobile Mapping" />
          <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ShieldAlert size={20}/>} label="Audit Logs" />
          <TabButton active={activeTab === 'routes'} onClick={() => setActiveTab('routes')} icon={<NavIcon size={20}/>} label="Route Analytics" />
          <TabButton active={activeTab === 'classrooms'} onClick={() => setActiveTab('classrooms')} icon={<BookOpen size={20}/>} label="Classrooms" />
          <TabButton active={activeTab === 'timetables'} onClick={() => setActiveTab('timetables')} icon={<CalendarIcon size={20}/>} label="Timetables" />
          <TabButton active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} icon={<CheckSquare size={20}/>} label="Attendance" />
          <TabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell size={20}/>} label="Notifications" />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'audit' && <AdminAuditLogs />}
        {activeTab === 'routes' && <AdminRouteAnalytics />}
        {activeTab === 'classrooms' && <AdminClassrooms />}
        {activeTab === 'timetables' && <AdminTimetables />}
        {activeTab === 'attendance' && <AdminAttendance />}
        {activeTab === 'notifications' && <AdminNotifications />}
        
        {/* Classroom Selection Modal */}
        {showClassroomModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1E293B', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#F8FAFC' }}>Select Classroom</h3>
              <select 
                value={selectedClassroom} 
                onChange={e => setSelectedClassroom(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#0F172A', border: '1px solid #334155', color: 'white', marginBottom: '16px' }}
              >
                <option value="">-- Select a Room --</option>
                {savedClassrooms.map(room => (
                  <option key={room.id} value={room.name}>{room.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowClassroomModal(false)} style={{ background: 'transparent', color: '#94A3B8', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button 
                  onClick={() => {
                    if (!selectedClassroom) return;
                    const id = Date.now().toString();
                    setNodes(prev => ({ ...prev, [id]: { id, name: selectedClassroom, type: 'classroom', coords: pendingCoords } }));
                    setHasUnsavedChanges(true);
                    setShowClassroomModal(false);
                    setSelectedClassroom('');
                    setPendingCoords(null);
                  }}
                  style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >Add Classroom</button>
              </div>
            </div>
          </div>
        )}
        
        {/* MAP EDITOR & MOBILE MAPPING UI */}
        <div style={{ display: (activeTab === 'map' || activeTab === 'mobile') ? 'flex' : 'none', height: '100%', width: '100%' }}>
          
          {/* Sidebar Controls */}
      <div className="glass-panel" style={{ width: '420px', margin: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', zIndex: 5, borderRadius: '20px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{activeTab === 'mobile' ? 'Mobile Mapper' : 'Map Controls'}</h2>
          <div style={{ position: 'relative', pointerEvents: 'auto' }}>
            {auth.currentUser?.photoURL ? (
              <img 
                src={auth.currentUser.photoURL} 
                alt="Profile" 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', objectFit: 'cover' }}
              />
            ) : (
              <div 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', background: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontSize: '18px' }}
              >
                {auth.currentUser?.displayName ? auth.currentUser.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            )}

            {showDropdown && (
              <div className="glass-panel" style={{ position: 'absolute', top: '50px', right: 0, padding: '8px', minWidth: '150px', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                <button 
                  onClick={handleLogout}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', width: '100%' }}
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>
        
        {activeTab === 'mobile' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '24px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
              <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px 0', color: '#ef4444' }}>Temporarily Disabled</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#CBD5E1' }}>
                The mobile mapping feature is currently undergoing maintenance. Please use the Manual Coordinate Entry tools in the Map Editor tab instead.
              </p>
            </div>
          </div>
        ) : (
          <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            className="glow-button" 
            style={{ backgroundColor: mode === 'add_node' ? '#10B981' : '#4F46E5', boxShadow: 'none' }}
            onClick={() => { setMode(mode === 'add_node' ? 'idle' : 'add_node'); setEdgeStartNode(null); setEditingId(null); setCurrentWaypoints([]); }}
          >
            1. Add Node (Entrance)
          </button>
          
          <button 
            className="glow-button" 
            style={{ backgroundColor: mode === 'add_node_poi' ? '#10B981' : '#4F46E5', boxShadow: 'none' }}
            onClick={() => { setMode(mode === 'add_node_poi' ? 'idle' : 'add_node_poi'); setEdgeStartNode(null); setEditingId(null); setCurrentWaypoints([]); }}
          >
            Drop POI (Point of Interest)
          </button>
          
          <button 
            className="glow-button" 
            style={{ backgroundColor: mode === 'draw_block' ? '#10B981' : '#4F46E5', boxShadow: 'none' }}
            onClick={() => { setMode(mode === 'draw_block' ? 'idle' : 'draw_block'); setCurrentPolygon([]); setEditingId(null); setSelectedBlockId(null); }}
          >
            2. Draw Block Boundary
          </button>
          {mode === 'draw_block' && currentPolygon.length > 0 && (
            <button className="glow-button" style={{ backgroundColor: '#F59E0B' }} onClick={finishPolygon}>
              Finish Shape
            </button>
          )}
          {mode === 'edit_block' && (
            <button className="glow-button" style={{ backgroundColor: '#F59E0B', animation: 'pulse 2s infinite' }} onClick={finishEditingBlock}>
              Save Block Coordinates
            </button>
          )}

          <button 
            className="glow-button" 
            style={{ backgroundColor: mode === 'add_edge_road' ? '#10B981' : '#4F46E5', boxShadow: 'none' }}
            onClick={() => { 
              if (mode === 'add_edge_road') { setMode('idle'); return; }
              const name = prompt("Name this path (e.g., Main Road):", "Main Road");
              if (name !== null) {
                setCurrentEdgeName(name || 'Unnamed Road');
                setMode('add_edge_road'); 
                setEdgeStartNode(null); 
                setEditingId(null); 
                setCurrentWaypoints([]);
              }
            }}
          >
            3. Connect Nodes (Road)
          </button>
          
          <div style={{ marginTop: '16px', borderTop: '1px dashed #334155', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#94A3B8' }}>Manual Coordinate Entry (No map clicking required)</span>
            <button 
              className="glow-button" 
              style={{ backgroundColor: '#059669', boxShadow: 'none' }}
              onClick={handleAddClassroomByCoords}
            >
              Add Classroom via Lat,Lng
            </button>
            <button 
              className="glow-button" 
              style={{ backgroundColor: '#059669', boxShadow: 'none' }}
              onClick={handleAddPathByCoords}
            >
              Add Path via Lat,Lng Array
            </button>
          </div>
        </div>

        {/* Edit / Delete Section */}
        <div style={{ marginTop: '16px', fontSize: '14px' }}>
          <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '8px', color: '#94A3B8' }}>Manage Map Data</h3>
          
          {/* Blocks Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #334155' }}
              onClick={() => toggleSection('blocks')}
            >
              <strong style={{ color: '#F8FAFC' }}>Blocks ({blocks.length})</strong>
              {openSections.blocks ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
            </div>
            {openSections.blocks && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                {blocks.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #334155', background: selectedBlockId === b.id ? 'rgba(16, 185, 129, 0.1)' : 'transparent' }}>
                    <span 
                      style={{ color: selectedBlockId === b.id ? '#10B981' : '#94A3B8', cursor: 'pointer', fontWeight: selectedBlockId === b.id ? 'bold' : 'normal' }}
                      onClick={() => setSelectedBlockId(selectedBlockId === b.id ? null : b.id)}
                    >
                      {b.name}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => {
                        const newName = prompt("Enter new Block Name:", b.name);
                        if (newName && newName !== b.name) {
                          setBlocks(blocks.map(block => block.id === b.id ? { ...block, name: newName } : block));
                        }
                      }} style={{ color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Rename</button>
                      <button onClick={() => {
                        const newFloors = prompt("Enter number of floors:", b.floors || 1);
                        if (newFloors) {
                          setBlocks(blocks.map(block => block.id === b.id ? { ...block, floors: parseInt(newFloors) || 1 } : block));
                        }
                      }} style={{ color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Floors</button>
                      <button onClick={() => { setMode('edit_block'); setEditingId(b.id); }} style={{ color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Edit Shape</button>
                      <button onClick={() => deleteBlock(b.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entrances Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #334155' }}
              onClick={() => toggleSection('entrances')}
            >
              <strong style={{ color: '#F8FAFC' }}>Entrances ({Object.values(nodes).filter(n => n.type !== 'intersection').length})</strong>
              {openSections.entrances ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
            </div>
            {openSections.entrances && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                {Object.values(nodes).filter(n => n.type !== 'intersection').map(n => (
                  <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #334155' }}>
                    <span style={{ color: '#94A3B8', maxWidth: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.name}>{n.name}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => {
                        const name = prompt("Name the road starting here:", currentEdgeName || "Main Road");
                        if (name !== null) {
                          setCurrentEdgeName(name || 'Unnamed Road');
                          setEdgeStartNode(n.id);
                          setMode('add_edge_road');
                          setCurrentWaypoints([]);
                        }
                      }} style={{ color: '#10B981', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Start Road</button>
                      <button onClick={() => {
                        const newName = prompt("Enter new Node Name:", n.name);
                        if (newName && newName !== n.name) {
                          setNodes({ ...nodes, [n.id]: { ...n, name: newName } });
                        }
                      }} style={{ color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Rename</button>
                      <button onClick={() => { setMode('move_node'); setEditingId(n.id); }} style={{ color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Move</button>
                      <button onClick={() => deleteNode(n.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Intersections Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #334155' }}
              onClick={() => toggleSection('intersections')}
            >
              <strong style={{ color: '#F8FAFC' }}>Intersections ({Object.values(nodes).filter(n => n.type === 'intersection').length})</strong>
              {openSections.intersections ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
            </div>
            {openSections.intersections && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                {Object.values(nodes).filter(n => n.type === 'intersection').map((n, idx) => (
                  <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #334155' }}>
                    <span style={{ color: '#94A3B8' }}>Intersection {idx + 1}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => {
                        const name = prompt("Name the road continuing from here:", currentEdgeName || "Main Road");
                        if (name !== null) {
                          setCurrentEdgeName(name || 'Unnamed Road');
                          setEdgeStartNode(n.id);
                          setMode('add_edge_road');
                          setCurrentWaypoints([]);
                        }
                      }} style={{ color: '#10B981', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Continue Road</button>
                      <button onClick={() => { setMode('move_node'); setEditingId(n.id); }} style={{ color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Move</button>
                      <button onClick={() => deleteNode(n.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Classrooms Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #334155' }}
              onClick={() => toggleSection('classroomsNode')}
            >
              <strong style={{ color: '#F8FAFC' }}>Classrooms ({Object.values(nodes).filter(n => n.type === 'classroom').length})</strong>
              {openSections.classroomsNode ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
            </div>
            {openSections.classroomsNode && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                <button 
                  onClick={async () => {
                    try {
                      const snap = await getDocs(collection(db, 'saved_classrooms'));
                      const saved = snap.docs.map(d => d.data());
                      let added = 0;
                      setNodes(prev => {
                        const next = { ...prev };
                        saved.forEach(s => {
                          if (s.lat !== undefined && s.lng !== undefined) {
                            const exists = Object.values(next).some(n => n.type === 'classroom' && n.name === s.name);
                            if (!exists) {
                              const newId = Date.now().toString() + Math.random().toString(36).substring(2, 6);
                              next[newId] = { id: newId, name: s.name, type: 'classroom', coords: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) } };
                              added++;
                            }
                          }
                        });
                        if (added > 0) setHasUnsavedChanges(true);
                        return next;
                      });
                      alert(`Synced ${added} classrooms from database to map nodes!`);
                    } catch (err) {
                      console.error(err);
                      alert("Failed to sync from database.");
                    }
                  }}
                  style={{ width: '100%', padding: '8px', marginBottom: '8px', marginTop: '8px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Sync Classrooms from DB
                </button>
                {Object.values(nodes).filter(n => n.type === 'classroom').map((n, idx) => (
                  <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #334155' }}>
                    <span style={{ color: '#94A3B8', maxWidth: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.name}>{n.name}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setMode('move_node'); setEditingId(n.id); }} style={{ color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Move</button>
                      <button onClick={() => deleteNode(n.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paths Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #334155' }}
              onClick={() => toggleSection('paths')}
            >
              <strong style={{ color: '#F8FAFC' }}>Paths ({edges.length} segments)</strong>
              {openSections.paths ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
            </div>
            {openSections.paths && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                {(() => {
                  const groups = {};
                  edges.forEach((e, idx) => {
                    const type = e[2] || 'road';
                    const name = e[3] || `${type} ${idx + 1}`;
                    if (!groups[name]) groups[name] = { type, indices: [] };
                    groups[name].indices.push(idx);
                  });
                  
                  return Object.entries(groups).map(([name, data]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #334155' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#94A3B8', textTransform: 'capitalize', maxWidth: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={name}>{name}</span>
                        <span style={{ color: '#475569', fontSize: '10px' }}>({data.indices.length} segments)</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => {
                          const newType = prompt("Enter new path type ('road' or 'corridor'):", data.type);
                          if (newType === 'road' || newType === 'corridor') {
                            const newEdges = [...edges];
                            data.indices.forEach(i => { newEdges[i][2] = newType; });
                            setEdges(newEdges);
                          }
                        }} style={{ color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Type</button>
                        
                        <button onClick={() => {
                          const newName = prompt("Rename this path:", name);
                          if (newName && newName !== name) {
                            const newEdges = [...edges];
                            data.indices.forEach(i => { newEdges[i][3] = newName; });
                            setEdges(newEdges);
                          }
                        }} style={{ color: '#10B981', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Rename</button>

                        <button onClick={() => {
                          if (window.confirm(`Delete ${name} and all its ${data.indices.length} segments?`)) {
                            setEdges(edges.filter((_, i) => !data.indices.includes(i)));
                          }
                        }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Mobile Maps Section */}
          <div style={{ marginTop: '12px' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px', border: '1px solid #EAB308' }}
              onClick={() => toggleSection('mobileMaps')}
            >
              <strong style={{ color: '#FCD34D' }}>Mobile Maps ({mobileDrafts.length})</strong>
              {openSections.mobileMaps ? <ChevronDown size={16} color="#FCD34D" /> : <ChevronRight size={16} color="#FCD34D" />}
            </div>
            {openSections.mobileMaps && (
              <div style={{ padding: '0 8px', maxHeight: '200px', overflowY: 'auto' }}>
                {mobileDrafts.length === 0 && (
                  <p style={{ color: '#94A3B8', fontSize: '12px', fontStyle: 'italic', padding: '8px' }}>No mobile drafts recorded yet. Use the Mobile Mapping tab to map paths with your phone.</p>
                )}
                {mobileDrafts.map((draft, idx) => (
                  <div key={draft.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 0', borderBottom: '1px dashed #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#FCD34D', fontWeight: 'bold' }}>Draft Path {idx + 1}</span>
                      <span style={{ color: '#94A3B8', fontSize: '12px' }}>{draft.path.length} points</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => approveMobileDraft(idx)} style={{ background: '#10B981', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Approve</button>
                      <button onClick={() => { setMode('edit_mobile_draft'); setEditingId(idx); }} style={{ color: '#F59E0B', background: 'none', border: '1px solid #F59E0B', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>Edit Shape</button>
                      <button onClick={() => setMobileDrafts(mobileDrafts.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: '1px solid #ef4444', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>Discard</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}></div>

        <button 
          className="glow-button" 
          style={{ 
            backgroundColor: hasUnsavedChanges ? '#F59E0B' : '#D9252A',
            animation: hasUnsavedChanges ? 'pulse 2s infinite' : 'none'
          }} 
          onClick={saveToFirebase}
        >
          {hasUnsavedChanges ? 'Save Changes (Unsaved)' : 'Save Changes'}
        </button>
        <Link 
          to="/" 
          onClick={(e) => {
            if (hasUnsavedChanges && !window.confirm("You have unsaved changes! Are you sure you want to leave without saving?")) {
              e.preventDefault();
            }
          }}
          style={{ color: '#94A3B8', textAlign: 'center', textDecoration: 'none', fontSize: '14px' }}
        >
          Back to Main App
        </Link>
        </>
        )}
      </div>

      {/* Map Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <button 
          onClick={() => setIsSatellite(!isSatellite)}
          style={{ 
            position: 'absolute', top: '16px', right: '16px', zIndex: 10,
            width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', 
            background: isSatellite ? '#4F46E5' : '#0F172A', 
            border: '2px solid #334155', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', color: isSatellite ? 'white' : '#94A3B8' 
          }}
          title="Toggle Satellite View"
        >
          <Globe size={24} />
        </button>

        <GoogleMap
          defaultZoom={17}
          defaultCenter={defaultCenter}
          mapId="DEMO_MAP_ID"
          mapTypeId={isSatellite ? "satellite" : "roadmap"}
          disableDefaultUI={true}
          onClick={handleMapClick}
          gestureHandling="greedy"
        >
          {/* Render drawn blocks */}
          {blocks.map(block => {
            let color = '#D9252A'; // Red default
            if (block.id === editingId && mode === 'edit_block') color = '#F59E0B'; // Orange if editing
            else if (block.id === selectedBlockId) color = '#10B981'; // Green if selected
            
            return (
              <Polygon 
                key={block.id} 
                id={block.id}
                paths={block.paths} 
                color={color} 
                editable={block.id === editingId && mode === 'edit_block'}
                registerPolygon={registerPolygon}
                onClick={mode === 'idle' ? () => {
                  setSelectedBlockId(selectedBlockId === block.id ? null : block.id);
                } : undefined}
              />
            );
          })}
          
          {/* Render currently drawing block */}
          {currentPolygon.length > 0 && <Polygon paths={currentPolygon} color="#10B981" />}

          {/* Render Mobile Mapping Live Path */}
          {isMobileMapping && currentMobilePath.length > 0 && (
            <Polyline path={currentMobilePath} color="#EAB308" weight={4} dashed={true} />
          )}

          {/* Render Mobile Drafts */}
          {mobileDrafts.map((draft, idx) => (
            <Polyline 
              key={draft.id} 
              path={draft.path} 
              color="#EAB308" 
              weight={4} 
              dashed={true}
              editable={idx === editingId && mode === 'edit_mobile_draft'}
              onPathChange={(newPathArray) => {
                if (newPathArray.length >= 2) {
                  const newPath = newPathArray.map(p => ({ lat: p.lat(), lng: p.lng() }));
                  setMobileDrafts(prev => prev.map((d, i) => i === idx ? { ...d, path: newPath } : d));
                }
              }}
            />
          ))}

          {/* Render currently drawing edge */}
          {mode.startsWith('add_edge') && edgeStartNode && currentWaypoints.length > 0 && (
            <Polyline 
              path={[nodes[edgeStartNode].coords, ...currentWaypoints]} 
              color={mode === 'add_edge_corridor' ? '#F59E0B' : '#10B981'} 
              dashed={mode === 'add_edge_corridor'} 
              weight={4} 
            />
          )}

          {/* Render edges (roads/corridors) */}
          {edges.map((edge, idx) => {
            const n1 = nodes[edge[0]];
            const n2 = nodes[edge[1]];
            const waypoints = edge[4] || [];
            const isCorridor = edge[2] === 'corridor';
            
            let color = isCorridor ? '#F59E0B' : '#10B981';
            let weight = 4;
            if (idx === editingId && mode === 'reconnect_edge') color = '#3B82F6';
            else if (idx === selectedEdgeIdx) {
              color = '#EF4444'; // Red when selected
              weight = 6;
            }
            
            if(n1 && n2) return (
              <Polyline 
                key={idx} 
                path={[n1.coords, ...waypoints, n2.coords]} 
                color={color} 
                dashed={isCorridor} 
                weight={weight}
                editable={idx === selectedEdgeIdx && mode === 'idle'}
                onPathChange={(newPathArray) => {
                  // newPathArray includes the start and end nodes at index 0 and length-1
                  // The rest are waypoints!
                  if (newPathArray.length >= 2) {
                    const newWaypoints = newPathArray.slice(1, -1).map(p => ({ lat: p.lat(), lng: p.lng() }));
                    setEdges(prevEdges => {
                      const updated = [...prevEdges];
                      updated[idx][4] = newWaypoints;
                      return updated;
                    });
                  }
                }}
                onClick={mode === 'idle' ? () => { 
                  setSelectedNodeId(null);
                  setSelectedEdgeIdx(idx);
                } : undefined}
              />
            );
            return null;
          })}

          {/* Render nodes */}
          {Object.values(nodes).map(node => (
            <AdvancedMarker 
              key={node.id} 
              position={node.coords}
              title={node.name}
              onClick={() => handleNodeClick(node.id)}
            >
              {node.type === 'intersection' ? (
                <div 
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                  style={{
                    width: selectedNodeId === node.id ? '16px' : '12px', 
                    height: selectedNodeId === node.id ? '16px' : '12px', 
                    borderRadius: '50%',
                    background: edgeStartNode === node.id ? '#F59E0B' : (selectedNodeId === node.id ? '#10B981' : (node.id === editingId && mode === 'move_node' ? '#3B82F6' : '#94A3B8')),
                    border: selectedNodeId === node.id ? '3px solid white' : '2px solid white', 
                    cursor: 'pointer', pointerEvents: 'auto',
                    boxShadow: selectedNodeId === node.id ? '0 0 12px #10B981' : 'none'
                  }}
                />
              ) : (
                <div 
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                  style={{
                    background: edgeStartNode === node.id ? '#F59E0B' : (selectedNodeId === node.id ? '#10B981' : (node.id === editingId && mode === 'move_node' ? '#3B82F6' : '#4F46E5')),
                    color: 'white', padding: '4px 8px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 'bold', 
                    border: selectedNodeId === node.id ? '3px solid white' : '2px solid white',
                    cursor: 'pointer', pointerEvents: 'auto',
                    boxShadow: selectedNodeId === node.id ? '0 0 12px #10B981' : 'none'
                  }}
                >
                  {node.name}
                </div>
              )}
            </AdvancedMarker>
          ))}
        </GoogleMap>

        {/* Current Mode Indicator */}
        {mode !== 'idle' && (
          <div className="glass-panel" style={{
            position: 'absolute', top: 16, left: 16, padding: '12px 24px', 
            color: '#10B981', fontWeight: 'bold', border: '1px solid #10B981',
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span>
                {mode === 'add_node' && 'Click map to place a node'}
                {mode === 'add_node_poi' && 'Click map to drop a POI'}
                {mode === 'draw_block' && 'Click map to trace block boundaries'}
                {mode.startsWith('add_edge') && (!edgeStartNode ? 'Click a node to start drawing a path' : 'Click map to draw points, click a node to finish.')}
                {mode === 'move_node' && 'Click a new location on the map for the node'}
                {mode === 'edit_block' && 'Drag the handles on the polygon to reshape the block'}
                {mode === 'edit_mobile_draft' && 'Drag the handles to fix GPS inaccuracies. Click Approve in the sidebar when done.'}
                {mode === 'reconnect_edge' && (!edgeStartNode ? 'Click a node to start the reconnected path' : 'Click a second node to finish reconnecting')}
              </span>
            </div>
            {mode.startsWith('add_edge') && edgeStartNode && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  onClick={() => setDrawingClickMode('bend')} 
                  style={{ background: drawingClickMode === 'bend' ? '#10B981' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Click adds Curve
                </button>
                <button 
                  onClick={() => setDrawingClickMode('intersection')} 
                  style={{ background: drawingClickMode === 'intersection' ? '#10B981' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Click drops Intersection
                </button>
                <button 
                  onClick={() => { setMode('idle'); setEdgeStartNode(null); setCurrentWaypoints([]); }} 
                  style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Stop Drawing
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selected Node Panel */}
        {selectedNodeId && mode === 'idle' && nodes[selectedNodeId] && (
          <div className="glass-panel" style={{
            position: 'absolute', top: 16, right: 16, padding: '16px 24px', 
            color: 'white', display: 'flex', alignItems: 'center', gap: '16px',
            border: '1px solid #334155', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{nodes[selectedNodeId].name}</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8', textTransform: 'capitalize' }}>
                {nodes[selectedNodeId].type}
              </p>
            </div>
            
            <button className="glow-button" style={{ padding: '6px 12px', fontSize: '14px', background: '#F59E0B', boxShadow: 'none' }} onClick={() => {
              setMode('move_node');
              setEditingId(selectedNodeId);
              setSelectedNodeId(null);
            }}>
              Move
            </button>
            
            <button className="glow-button" style={{ padding: '6px 12px', fontSize: '14px', background: '#10B981', boxShadow: 'none' }} onClick={() => {
              const name = prompt("Name the road continuing from here:", currentEdgeName || "Main Road");
              if (name !== null) {
                setCurrentEdgeName(name || 'Unnamed Road');
                setEdgeStartNode(selectedNodeId);
                setMode('add_edge_road');
                setSelectedNodeId(null);
                setCurrentWaypoints([]);
              }
            }}>
              Continue Road
            </button>

            <button style={{ 
              background: 'none', border: 'none', color: '#94A3B8', fontSize: '18px', cursor: 'pointer', marginLeft: '8px' 
            }} onClick={() => setSelectedNodeId(null)}>
              ×
            </button>
          </div>
        )}

        {/* Selected Edge Panel */}
        {selectedEdgeIdx !== null && mode === 'idle' && edges[selectedEdgeIdx] && (
          <div className="glass-panel" style={{
            position: 'absolute', top: 16, right: 16, padding: '16px 24px', 
            color: 'white', display: 'flex', alignItems: 'center', gap: '16px',
            border: '1px solid #334155', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: '500px'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{edges[selectedEdgeIdx][3] || 'Unnamed Path'}</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8', textTransform: 'capitalize' }}>
                {edges[selectedEdgeIdx][2]} Segment
              </p>
            </div>
            
            <button className="glow-button" style={{ padding: '6px 12px', fontSize: '14px', background: '#3B82F6', boxShadow: 'none', whiteSpace: 'nowrap' }} onClick={() => {
              // Split into two edges, add an intersection node
              const edge = edges[selectedEdgeIdx];
              const n1 = nodes[edge[0]];
              const n2 = nodes[edge[1]];
              
              // Find midpoint of first segment to safely place intersection
              const midLat = (n1.coords.lat + n2.coords.lat) / 2;
              const midLng = (n1.coords.lng + n2.coords.lng) / 2;
              
              const newId = Date.now().toString();
              const newNode = { id: newId, name: 'Intersection', type: 'intersection', coords: {lat: midLat, lng: midLng} };
              
              setNodes(prev => ({ ...prev, [newId]: newNode }));
              
              const newEdges = [...edges];
              // First half
              newEdges[selectedEdgeIdx] = [edge[0], newId, edge[2], edge[3], []]; // Clear waypoints for simplicity on split
              // Second half
              newEdges.push([newId, edge[1], edge[2], edge[3], []]);
              
              setEdges(newEdges);
              setSelectedEdgeIdx(null);
              setSelectedNodeId(newId);
              setMode('move_node');
              setEditingId(newId);
            }}>
              Split Path (Add Branch Node)
            </button>

            <div style={{ color: '#FCD34D', fontSize: '13px', fontStyle: 'italic', maxWidth: '200px' }}>
              Drag the faint white dots on the red line to curve it!
            </div>

            <button style={{ 
              background: 'none', border: 'none', color: '#94A3B8', fontSize: '18px', cursor: 'pointer', marginLeft: '8px' 
            }} onClick={() => setSelectedEdgeIdx(null)}>
              ×
            </button>
          </div>
        )}
      </div>

        </div>
      </div>
    </div>
  );
}
