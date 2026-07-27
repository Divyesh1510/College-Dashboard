import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, Loader2, LogOut, Sun, Moon, Globe, WifiOff, Crosshair, Map, Compass as CompassIcon, CloudRain, ChevronUp, ChevronDown, Calendar } from 'lucide-react';
import CampusMap from '../components/Map';
import SearchableSelect from '../components/SearchableSelect';
import { findShortestPath, findAlternatePaths } from '../utils/dijkstra';
import { generateTurnInstructions, getBearing } from '../utils/directions';
import { Link } from 'react-router-dom';
import { db, auth } from '../utils/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { findUpcomingClass } from '../utils/schedule';
import TimetableManager from '../components/TimetableManager';
import { CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Helper to calculate walking time between two coordinates
function getDistanceInSeconds(coord1, coord2) {
  const R = 6371e3; // metres
  const p1 = coord1.lat * Math.PI/180;
  const p2 = coord2.lat * Math.PI/180;
  const dp = (coord2.lat-coord1.lat) * Math.PI/180;
  const dl = (coord2.lng-coord1.lng) * Math.PI/180;

  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // in metres
  return Math.round(d / 0.8); // 0.8 m/s realistic campus walking speed (accounting for stairs, turns)
}

// Distance from point p to line segment a-b
function closestPointOnSegment(p, a, b) {
  const atob = { lat: b.lat - a.lat, lng: b.lng - a.lng };
  const atop = { lat: p.lat - a.lat, lng: p.lng - a.lng };
  const len2 = atob.lat * atob.lat + atob.lng * atob.lng;
  if (len2 === 0) return a;
  let dot = (atop.lat * atob.lat + atop.lng * atob.lng) / len2;
  const t = Math.max(0, Math.min(1, dot));
  return { lat: a.lat + atob.lat * t, lng: a.lng + atob.lng * t };
}

function connectIsolatedNodes(nodes, edges) {
  let newNodes = { ...nodes };
  let newEdges = [...edges];

  const connectedNodeIds = new Set();
  edges.forEach(e => { connectedNodeIds.add(e[0]); connectedNodeIds.add(e[1]); });

  const isolatedNodes = Object.keys(nodes).filter(id => !connectedNodeIds.has(id) && nodes[id].type !== 'intersection');

  isolatedNodes.forEach(isoId => {
    const isoNode = nodes[isoId];
    let minDistance = Infinity;
    let bestEdgeIndex = -1;
    let bestSegmentIndex = -1;
    let bestPoint = null;

    newEdges.forEach((edge, eIdx) => {
      const n1 = newNodes[edge[0]];
      const n2 = newNodes[edge[1]];
      if (!n1 || !n2) return;
      const points = [n1.coords, ...(edge[4] || []), n2.coords];
      for (let i = 0; i < points.length - 1; i++) {
        const closest = closestPointOnSegment(isoNode.coords, points[i], points[i+1]);
        const dist = getDistanceInSeconds(isoNode.coords, closest);
        if (dist < minDistance) {
          minDistance = dist;
          bestEdgeIndex = eIdx;
          bestSegmentIndex = i;
          bestPoint = closest;
        }
      }
    });

    if (bestEdgeIndex !== -1 && bestPoint) {
      const vNodeId = `virtual_${isoId}`;
      newNodes[vNodeId] = { id: vNodeId, name: 'Virtual Intersection', type: 'intersection', coords: bestPoint, isVirtual: true };
      
      const targetEdge = newEdges[bestEdgeIndex];
      const tStart = targetEdge[0];
      const tEnd = targetEdge[1];
      const tType = targetEdge[2];
      const tName = targetEdge[3];
      const tWaypoints = targetEdge[4] || [];

      const wps1 = tWaypoints.slice(0, bestSegmentIndex);
      const wps2 = tWaypoints.slice(bestSegmentIndex);

      newEdges.splice(bestEdgeIndex, 1);
      newEdges.push([tStart, vNodeId, tType, tName, wps1]);
      newEdges.push([vNodeId, tEnd, tType, tName, wps2]);
      newEdges.push([isoId, vNodeId, 'corridor', 'Walkway', []]);
    }
  });

  return { connectedNodes: newNodes, connectedEdges: newEdges };
}

function getLineIntersection(p0, p1, p2, p3) {
  const denom = ((p3.lat - p2.lat) * (p1.lng - p0.lng)) - ((p3.lng - p2.lng) * (p1.lat - p0.lat));
  if (Math.abs(denom) < 1e-9) return null; // Parallel

  const ua = (((p3.lng - p2.lng) * (p0.lat - p2.lat)) - ((p3.lat - p2.lat) * (p0.lng - p2.lng))) / denom;
  const ub = (((p1.lng - p0.lng) * (p0.lat - p2.lat)) - ((p1.lat - p0.lat) * (p0.lng - p2.lng))) / denom;

  if (ua > 0.001 && ua < 0.999 && ub > 0.001 && ub < 0.999) {
    return {
      lat: p0.lat + (ua * (p1.lat - p0.lat)),
      lng: p0.lng + (ua * (p1.lng - p0.lng))
    };
  }
  return null;
}

function snapNodesToEdges(nodes, edges) {
  let newNodes = { ...nodes };
  let newEdges = [...edges];

  Object.keys(newNodes).forEach(nodeId => {
    const node = newNodes[nodeId];
    
    let minDistance = Infinity;
    let bestEdgeIndex = -1;
    let bestSegmentIndex = -1;
    let bestPoint = null;

    newEdges.forEach((edge, eIdx) => {
      // Skip if this node is already an endpoint of this edge
      if (edge[0] === nodeId || edge[1] === nodeId) return;

      const n1 = newNodes[edge[0]];
      const n2 = newNodes[edge[1]];
      if (!n1 || !n2) return;

      const points = [n1.coords, ...(edge[4] || []), n2.coords];
      for (let i = 0; i < points.length - 1; i++) {
        const closest = closestPointOnSegment(node.coords, points[i], points[i+1]);
        const dist = getDistanceInSeconds(node.coords, closest);
        
        // If it's extremely close (< 3 seconds walking, ~4 meters)
        if (dist < 3 && dist < minDistance) {
          minDistance = dist;
          bestEdgeIndex = eIdx;
          bestSegmentIndex = i;
          bestPoint = closest;
        }
      }
    });

    if (bestEdgeIndex !== -1 && bestPoint) {
      // Move the node exactly onto the line
      newNodes[nodeId] = { ...node, coords: bestPoint };
      
      const targetEdge = newEdges[bestEdgeIndex];
      const wps1 = (targetEdge[4] || []).slice(0, bestSegmentIndex);
      const wps2 = (targetEdge[4] || []).slice(bestSegmentIndex);

      newEdges.splice(bestEdgeIndex, 1);
      
      // Split the edge into two, joined by this node
      newEdges.push([targetEdge[0], nodeId, targetEdge[2], targetEdge[3], wps1]);
      newEdges.push([nodeId, targetEdge[1], targetEdge[2], targetEdge[3], wps2]);
    }
  });

  return { nodes: newNodes, edges: newEdges };
}

function processIntersectingEdges(nodes, edges) {
  let newNodes = { ...nodes };
  let newEdges = [...edges];

  let intersectionFound = true;
  let virtualCount = 0;
  let loops = 0;

  while (intersectionFound && loops < 100) {
    intersectionFound = false;
    loops++;

    for (let i = 0; i < newEdges.length; i++) {
      for (let j = i + 1; j < newEdges.length; j++) {
        const e1 = newEdges[i];
        const e2 = newEdges[j];

        const n1_start = newNodes[e1[0]];
        const n1_end = newNodes[e1[1]];
        const n2_start = newNodes[e2[0]];
        const n2_end = newNodes[e2[1]];

        if (!n1_start || !n1_end || !n2_start || !n2_end) continue;

        const pts1 = [n1_start.coords, ...(e1[4] || []), n1_end.coords];
        const pts2 = [n2_start.coords, ...(e2[4] || []), n2_end.coords];

        let crossing = null;
        let c_s1 = -1;
        let c_s2 = -1;

        for (let s1 = 0; s1 < pts1.length - 1; s1++) {
          for (let s2 = 0; s2 < pts2.length - 1; s2++) {
            const intersect = getLineIntersection(pts1[s1], pts1[s1+1], pts2[s2], pts2[s2+1]);
            if (intersect) {
              crossing = intersect;
              c_s1 = s1;
              c_s2 = s2;
              break;
            }
          }
          if (crossing) break;
        }

        if (crossing) {
          const vNodeId = `virtual_cross_${virtualCount++}`;
          newNodes[vNodeId] = { id: vNodeId, name: 'Cross Intersection', type: 'intersection', coords: crossing, isVirtual: true };

          const wps1_a = (e1[4] || []).slice(0, c_s1);
          const wps1_b = (e1[4] || []).slice(c_s1);
          const new_e1_a = [e1[0], vNodeId, e1[2], e1[3], wps1_a];
          const new_e1_b = [vNodeId, e1[1], e1[2], e1[3], wps1_b];

          const wps2_a = (e2[4] || []).slice(0, c_s2);
          const wps2_b = (e2[4] || []).slice(c_s2);
          const new_e2_a = [e2[0], vNodeId, e2[2], e2[3], wps2_a];
          const new_e2_b = [vNodeId, e2[1], e2[2], e2[3], wps2_b];

          newEdges.splice(j, 1);
          newEdges.splice(i, 1);
          newEdges.push(new_e1_a, new_e1_b, new_e2_a, new_e2_b);

          intersectionFound = true;
          break;
        }
      }
      if (intersectionFound) break;
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

function buildGraph(nodes, edges) {
  const graph = {};
  for (let nodeId in nodes) {
    graph[nodeId] = {};
  }
  for (let edge of edges) {
    const n1 = nodes[edge[0]];
    const n2 = nodes[edge[1]];
    const waypoints = edge[4] || [];
    if (n1 && n2) {
      let totalSeconds = 0;
      let prevCoord = n1.coords;
      for (let wp of waypoints) {
        totalSeconds += getDistanceInSeconds(prevCoord, wp);
        prevCoord = wp;
      }
      totalSeconds += getDistanceInSeconds(prevCoord, n2.coords);
      
      graph[edge[0]][edge[1]] = totalSeconds;
      graph[edge[1]][edge[0]] = totalSeconds; // Bi-directional
    }
  }
  return graph;
}

export default function MainApp() {
  const [startNode, setStartNode] = useState('');
  const [endNode, setEndNode] = useState('');
  const [calculatedPath, setCalculatedPath] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [userHeading, setUserHeading] = useState(0);
  const [showLocationSuggestion, setShowLocationSuggestion] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Function to handle start navigation & log route analytics
  const handleStartNavigation = async () => {
    setIsNavigating(true);
    setIsFollowingUser(true);
    
    try {
      if (startNode && endNode) {
        const startName = startNode === 'CURRENT_LOCATION' ? 'Current Location' : (nodes[startNode]?.name || 'Unknown');
        const endName = nodes[endNode]?.name || 'Unknown';
        
        await addDoc(collection(db, 'routeLogs'), {
          startNodeId: startNode,
          endNodeId: endNode,
          startNodeName: startName,
          endNodeName: endName,
          timestamp: serverTimestamp(),
          userId: auth.currentUser?.uid || 'anonymous'
        });
      }
    } catch (err) {
      console.error("Failed to log route:", err);
    }
  };
  const isDarkMode = true;
  const [isSatellite, setIsSatellite] = useState(true);
  const [turnInstructions, setTurnInstructions] = useState([]);
  const [pathCoordinates, setPathCoordinates] = useState([]);

  const [alternatePaths, setAlternatePaths] = useState([]);
  const [alternatePathsCoords, setAlternatePathsCoords] = useState([]);
  const [selectedPathIndex, setSelectedPathIndex] = useState(0);

  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [graph, setGraph] = useState({});
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasLocationPermission, setHasLocationPermission] = useState(true);

  // New UI feature states
  const [isIndoorMode, setIsIndoorMode] = useState(false);
  const [weather, setWeather] = useState(null);
  const [highlightedPOICategory, setHighlightedPOICategory] = useState(null);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [headingUpMode, setHeadingUpMode] = useState(false);
  const [upcomingClass, setUpcomingClass] = useState(null);
  
  const [showTimetable, setShowTimetable] = useState(false);
  const [timetables, setTimetables] = useState([]);
  const navigate = useNavigate();

  // Fetch User's Timetable
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'timetables'), where("userId", "==", auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTimetables(data);
    });
    return () => unsubscribe();
  }, []);  // Fetch Weather
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=17.5501&longitude=78.1666&current=temperature_2m,weather_code");
        const data = await res.json();
        setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
      } catch(e) {
        console.error("Weather fetch failed", e);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000); // refresh 15 mins
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = (code) => {
    if (code <= 3) return '☀️'; 
    if (code <= 49) return '☁️'; 
    if (code <= 69) return '🌧️'; 
    return '⛈️'; 
  };

  // Check location permission on mount
  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        if (result.state === 'prompt' || result.state === 'denied') {
          setHasLocationPermission(false);
        }
        
        result.addEventListener('change', () => {
          if (result.state === 'granted') {
            setHasLocationPermission(true);
          } else {
            setHasLocationPermission(false);
          }
        });
      } catch (err) {
        // Fallback for browsers that don't support permissions.query for geolocation (like some Safari versions)
        setHasLocationPermission(false);
      }
    };
    checkLocationPermission();
  }, []);

  const requestLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHasLocationPermission(true);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          alert("Location access was denied. Please enable it in your browser settings to continue.");
        }
      },
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Compass & Heading Logic
  useEffect(() => {
    let orientationHandler;
    if (headingUpMode) {
      if ('ondeviceorientationabsolute' in window) {
        orientationHandler = (e) => {
          if (e.alpha !== null) {
            setUserHeading(360 - e.alpha);
          }
        };
        window.addEventListener('deviceorientationabsolute', orientationHandler);
      } else if ('ondeviceorientation' in window) {
        orientationHandler = (e) => {
          if (e.webkitCompassHeading !== undefined) {
            setUserHeading(e.webkitCompassHeading); // iOS
          } else if (e.alpha !== null) {
            setUserHeading(360 - e.alpha);
          }
        };
        window.addEventListener('deviceorientation', orientationHandler);
      }
    } else {
      setUserHeading(0); // reset when disabled
    }
    return () => {
      if (orientationHandler) {
        window.removeEventListener('deviceorientationabsolute', orientationHandler);
        window.removeEventListener('deviceorientation', orientationHandler);
      }
    };
  }, [headingUpMode]);

  const toggleCompass = () => {
    if (navigator.vibrate) navigator.vibrate(20); // haptic tick
    
    // Request permission for iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            setHeadingUpMode(!headingUpMode);
          }
        })
        .catch(console.error);
    } else {
      setHeadingUpMode(!headingUpMode);
    }
  };

  // Fetch map data from Firebase
  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const docRef = doc(db, "campus_map", "latest_graph");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const fetchedEdges = (data.edges || []).map(e => Array.isArray(e) ? e : [e.start, e.end, e.type, e.name, e.waypoints || []]);
          const fetchedNodes = data.nodes || {};
          
          let { connectedNodes, connectedEdges } = connectIsolatedNodes(fetchedNodes, fetchedEdges);
          let snapped = snapNodesToEdges(connectedNodes, connectedEdges);
          let processed = processIntersectingEdges(snapped.nodes, snapped.edges);

          // INJECT MOCK CLASSROOMS FOR INDOOR NAVIGATION
          // We attach them logically to their respective building entrances
          const mockClassrooms = {
            'room_d_304': { 
              id: 'room_d_304', name: 'D Block - Room 304', type: 'classroom', 
              buildingNodeId: 'D', coords: processed.nodes['D']?.coords || {lat:17.55, lng:78.16}, 
              indoorInstructions: 'Take the main stairs to the 3rd floor, turn left. Room 304 is the second door on your right.' 
            },
            'room_a_102': { 
              id: 'room_a_102', name: 'A Block - Room 102', type: 'classroom', 
              buildingNodeId: 'A', coords: processed.nodes['A']?.coords || {lat:17.55, lng:78.16}, 
              indoorInstructions: 'Walk straight past the lobby. Room 102 is the first door on the left.' 
            }
          };
          processed.nodes = { ...processed.nodes, ...mockClassrooms };

          setNodes(processed.nodes);
          setEdges(processed.edges);
          setBlocks(data.blocks || []);
          
          const generatedGraph = buildGraph(processed.nodes, processed.edges);
          setGraph(generatedGraph);
        } else {
          console.warn("No custom map data found in Firestore.");
        }
      } catch (error) {
        console.error("Error fetching map data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMapData();
  }, []);

  // Handle continuous global GPS tracking
  useEffect(() => {
    let watchId;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          
          setUserLocation(prevLoc => {
            if (prevLoc) {
              // If device provides heading, use it. Otherwise, calculate from movement.
              if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
                setUserHeading(pos.coords.heading);
              } else {
                // Only calculate bearing if moved > 1 meter to avoid jitter
                const dist = Math.sqrt(Math.pow(newLocation.lat - prevLoc.lat, 2) + Math.pow(newLocation.lng - prevLoc.lng, 2)) * 111000;
                if (dist > 1) {
                  setUserHeading(getBearing(prevLoc, newLocation));
                }
              }
            }
            return newLocation;
          });
        },
        (err) => {
          console.warn("Location services disabled or unavailable.", err);
        },
        { enableHighAccuracy: true }
      );
    }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, []);

  // Smart Start Suggestion Logic
  useEffect(() => {
    if (startNode && startNode !== 'CURRENT_LOCATION' && userLocation && nodes[startNode]) {
      const distSeconds = getDistanceInSeconds(userLocation, nodes[startNode].coords);
      // Roughly 75 seconds walking (~100m) threshold
      if (distSeconds > 75) {
        setShowLocationSuggestion(true);
      } else {
        setShowLocationSuggestion(false);
      }
    } else {
      setShowLocationSuggestion(false);
    }
  }, [startNode, userLocation, nodes]);

  useEffect(() => {
    let effectiveStartNode = startNode;
    let effectiveEndNode = endNode;

    // Academic Schedule Polling
    const scheduleInterval = setInterval(() => {
      const cls = findUpcomingClass(timetables);
      if (cls) {
        // If class starts in between 1 and 15 mins and we aren't already navigating to it
        if (endNode !== cls.roomNodeId) {
          setUpcomingClass(cls);
        } else {
          setUpcomingClass(null);
        }
      } else {
        setUpcomingClass(null);
      }
    }, 10000); // Poll every 10 seconds for demo

    // Route to building entrance if it's a classroom, otherwise route to classroom itself
    if (endNode && nodes[endNode]?.type === 'classroom') {
      effectiveEndNode = nodes[endNode].buildingNodeId || endNode;
    }

    if (startNode === 'CURRENT_LOCATION' && userLocation) {
      let nearest = null;
      let minDistance = Infinity;
      for (const id in nodes) {
        if (nodes[id].type === 'classroom') continue; // Don't snap to indoor nodes
        const d = getDistanceInSeconds(userLocation, nodes[id].coords);
        if (d < minDistance) {
          minDistance = d;
          nearest = id;
        }
      }
      effectiveStartNode = nearest;
    }

    // Arrival Detection
    if (isNavigating && userLocation && effectiveEndNode && nodes[effectiveEndNode]) {
      const distToDest = getDistanceInSeconds(userLocation, nodes[effectiveEndNode].coords);
      // Roughly 15 seconds walking (~20 meters)
      if (distToDest < 15) {
        if (nodes[endNode]?.type === 'classroom') {
          setIsIndoorMode(true);
        } else {
          // Normal outdoor arrival
          setIsNavigating(false);
          setStartNode(null);
          setEndNode(null);
          alert("You have arrived at your destination!");
        }
      }
    }

    if (effectiveStartNode && effectiveEndNode && effectiveStartNode !== effectiveEndNode && Object.keys(graph).length > 0) {
      // Find up to 3 alternate paths
      const paths = findAlternatePaths(effectiveStartNode, effectiveEndNode, graph, 3);
      if (paths.length > 0) {
        setAlternatePaths(paths);
        
        // Generate path coordinates for all alternate routes
        const allCoords = paths.map(route => {
          const coords = [];
          if (startNode === 'CURRENT_LOCATION' && userLocation) {
            coords.push(userLocation);
          }
          for (let i = 0; i < route.path.length; i++) {
            const nodeId = route.path[i];
            
            // Anti-lasso loop fix: if starting from GPS, check if we passed the first node
            if (i === 0 && startNode === 'CURRENT_LOCATION' && userLocation && route.path.length > 1) {
              const nextNodeId = route.path[1];
              // Avoid undefined errors if nodes aren't loaded yet
              if (nodes[nodeId] && nodes[nextNodeId]) {
                const distUserToNext = getDistanceInSeconds(userLocation, nodes[nextNodeId].coords);
                const distFirstToNext = getDistanceInSeconds(nodes[nodeId].coords, nodes[nextNodeId].coords);
                if (distUserToNext < distFirstToNext) {
                  continue; // Skip adding the first node and its trailing waypoints
                }
              }
            }

            if (nodes[nodeId]) {
              coords.push(nodes[nodeId].coords);
            }

            if (i < route.path.length - 1) {
              const nextNodeId = route.path[i+1];
              const connectingEdge = edges.find(e => 
                (e[0] === nodeId && e[1] === nextNodeId) || 
                (e[1] === nodeId && e[0] === nextNodeId)
              );

              if (connectingEdge && connectingEdge[4] && connectingEdge[4].length > 0) {
                const wps = [...connectingEdge[4]];
                if (connectingEdge[1] === nodeId) wps.reverse();
                coords.push(...wps);
              }
            }
          }
          return coords;
        });

        setAlternatePathsCoords(allCoords);

        // We don't reset selectedPathIndex here if it's already valid, 
        // to prevent resetting user selection when GPS updates slightly.
        const activeIndex = selectedPathIndex < paths.length ? selectedPathIndex : 0;
        if (activeIndex !== selectedPathIndex) setSelectedPathIndex(activeIndex);

        // Update the active calculated path
        setCalculatedPath(paths[activeIndex].path);
        let time = paths[activeIndex].timeSeconds;
        if (startNode === 'CURRENT_LOCATION' && userLocation && nodes[effectiveStartNode]) {
           time += getDistanceInSeconds(userLocation, nodes[effectiveStartNode].coords);
        }
        setEstimatedTime(time);
        setPathCoordinates(allCoords[activeIndex]);
        setTurnInstructions(generateTurnInstructions(allCoords[activeIndex]));
      }

    } else {
      setAlternatePaths([]);
      setAlternatePathsCoords([]);
      setCalculatedPath([]);
      setPathCoordinates([]);
      setTurnInstructions([]);
      setEstimatedTime(0);
      setIsNavigating(false);
    }
    
    return () => clearInterval(scheduleInterval);
  }, [startNode, endNode, graph, userLocation, nodes, edges]); // Re-runs on GPS update

  // Update active path when user clicks an alternate route
  useEffect(() => {
    if (alternatePaths.length > 0 && alternatePathsCoords.length > 0 && alternatePaths[selectedPathIndex]) {
      setCalculatedPath(alternatePaths[selectedPathIndex].path);
      
      let effectiveStartNode = startNode;
      if (startNode === 'CURRENT_LOCATION' && userLocation) {
        let nearest = null;
        let minDistance = Infinity;
        for (const id in nodes) {
          const d = getDistanceInSeconds(userLocation, nodes[id].coords);
          if (d < minDistance) { minDistance = d; nearest = id; }
        }
        effectiveStartNode = nearest;
      }

      let time = alternatePaths[selectedPathIndex].timeSeconds;
      if (startNode === 'CURRENT_LOCATION' && userLocation && effectiveStartNode) {
         time += getDistanceInSeconds(userLocation, nodes[effectiveStartNode].coords);
      }
      setEstimatedTime(time);
      setPathCoordinates(alternatePathsCoords[selectedPathIndex]);
      setTurnInstructions(generateTurnInstructions(alternatePathsCoords[selectedPathIndex]));
    }
  }, [selectedPathIndex]);

  // Auto-Rerouting Logic
  useEffect(() => {
    if (isNavigating && userLocation && pathCoordinates.length > 0) {
      let minDistance = Infinity;
      for (let i = 0; i < pathCoordinates.length - 1; i++) {
        const closest = closestPointOnSegment(userLocation, pathCoordinates[i], pathCoordinates[i+1]);
        const dist = getDistanceInSeconds(userLocation, closest);
        if (dist < minDistance) minDistance = dist;
      }
      
      // If user deviates by more than ~28 meters (20 seconds walking time)
      if (minDistance > 20) {
        // Force a recalculation by "reselecting" current location
        // Wait, if startNode is already CURRENT_LOCATION, changing it to itself doesn't trigger effect.
        // But userLocation changed, so the main effect already re-ran and updated the path from the nearest node!
        // So the main effect ALREADY acts as an auto-rerouter!
        // We just need to make sure we alert them or just let the main effect do its job.
        // Actually, if we are navigating, the main effect re-runs every GPS tick and recalculates the shortest path from their *new* nearest node.
        // So auto-rerouting is intrinsically built-in, but we might want to reset selectedPathIndex to 0.
        setSelectedPathIndex(0);
      }
    }
  }, [userLocation, isNavigating, pathCoordinates]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Error logging out", err);
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0F172A', color: 'white' }}>
        <Loader2 className="animate-spin" size={48} color="#D9252A" />
        <p style={{ marginTop: '16px' }}>Loading Campus Map...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      
      {/* Strict Location Permission Modal */}
      {!hasLocationPermission && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
        }}>
          <div className="glass-card-premium" style={{
            maxWidth: '400px', width: '100%', padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '24px'
          }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '50%' }}>
              <MapPin size={48} color="#3B82F6" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px 0', color: 'white' }}>Location Required</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0, lineHeight: 1.5 }}>
                Campus Nav needs access to your location to provide accurate routing and navigation across the GITAM campus.
              </p>
            </div>
            <button 
              onClick={requestLocation}
              style={{
                width: '100%', padding: '16px', background: 'linear-gradient(135deg, #4F46E5, #D9252A)',
                color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold',
                cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(217, 37, 42, 0.4)'
              }}
            >
              Allow Location Access
            </button>
          </div>
        </div>
      )}

      {/* Header Overlay */}
      <header style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '12px',
        zIndex: 10,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <div className="glass-panel" style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 700 }}>Campus Nav Gitam Hyd</h1>
        </div>
        
        {isOffline && (
          <div className="glass-panel" style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.9)', color: 'white' }}>
            <WifiOff size={16} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Navigating Offline</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
          {/* Weather Widget */}
          {weather && (
            <div className="glass-panel" style={{ padding: '0 8px', height: '38px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)', fontWeight: 'bold', border: '2px solid var(--border)' }}>
              <span style={{ fontSize: '16px' }}>{getWeatherIcon(weather.code)}</span>
              <span style={{ fontSize: '14px' }}>{weather.temp}°C</span>
            </div>
          )}

          {/* Timetable Toggle */}
          <button 
            onClick={() => setShowTimetable(true)}
            style={{ 
              width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', 
              background: 'var(--surface)', 
              border: '2px solid var(--border)', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', color: 'var(--text)' 
            }}
            title="Timetable"
          >
            <Calendar size={18} />
          </button>

          {/* Attendance Toggle */}
          <button 
            onClick={() => navigate('/attendance')}
            style={{ 
              width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', 
              background: 'var(--surface)', 
              border: '2px solid var(--border)', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', color: 'var(--text)' 
            }}
            title="Attendance"
          >
            <CheckSquare size={18} />
          </button>

          {/* Compass Toggle */}
          <button 
            onClick={toggleCompass}
            style={{ 
              width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', 
              background: headingUpMode ? '#4F46E5' : 'var(--surface)', 
              border: '2px solid var(--border)', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', color: headingUpMode ? 'white' : 'var(--text)' 
            }}
          >
            <CompassIcon size={18} />
          </button>

          {/* Satellite Toggle */}
          <button 
            onClick={() => setIsSatellite(!isSatellite)}
            style={{ 
              width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', 
              background: isSatellite ? '#4F46E5' : 'var(--surface)', 
              border: '2px solid var(--border)', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', color: isSatellite ? 'white' : 'var(--text)' 
            }}
          >
            <Globe size={18} />
          </button>



          {/* Profile / Logout Dropdown */}
          <div style={{ position: 'relative' }}>
            {auth.currentUser?.photoURL ? (
              <img 
                src={auth.currentUser.photoURL} 
                alt="Profile" 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', objectFit: 'cover' }}
              />
            ) : (
              <div 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', background: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontSize: '16px' }}
              >
                {auth.currentUser?.displayName ? auth.currentUser.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            )}

            {showDropdown && (
              <div className="glass-panel" style={{ position: 'absolute', top: '56px', right: 0, padding: '8px', minWidth: '150px', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
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
        </div>
      </header>


      {/* Map Area */}
      <div style={{ flex: 1 }}>
        <CampusMap 
          nodes={nodes}
          blocks={blocks}
          edges={edges}
          startNode={startNode === 'CURRENT_LOCATION' ? (calculatedPath.length > 0 ? calculatedPath[0] : null) : startNode} 
          endNode={endNode} 
          calculatedPath={calculatedPath}
          pathCoordinates={pathCoordinates}
          alternatePathsCoords={isNavigating ? [] : alternatePathsCoords}
          selectedPathIndex={selectedPathIndex}
          isNavigating={isNavigating}
          userLocation={userLocation}
          userHeading={userHeading}
          isDarkMode={isDarkMode}
          isSatellite={isSatellite}
          isFollowingUser={isFollowingUser}
          highlightedPOICategory={highlightedPOICategory}
          onDragStart={() => isNavigating && setIsFollowingUser(false)}
          onNodeClick={(id) => setEndNode(id)}
          onPathSelect={(idx) => !isNavigating && setSelectedPathIndex(idx)}
        />
        
        {/* Floating Re-Center Button */}
        {isNavigating && !isFollowingUser && (
          <button 
            onClick={() => setIsFollowingUser(true)}
            style={{ 
              position: 'absolute', bottom: 'calc(40dvh + 40px)', right: '16px', 
              width: '48px', height: '48px', borderRadius: '50%', background: '#4F46E5', color: 'white', 
              border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 10
            }}
          >
            <Crosshair size={24} />
          </button>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="glass-panel slide-up-panel" style={{
        position: 'absolute',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        left: '12px',
        right: '12px',
        padding: '16px',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottom: 'none',
        maxHeight: bottomSheetExpanded ? '85dvh' : '45dvh',
        overflowY: 'auto',
        transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {!isNavigating && (
            <>
              {/* POI Quick Filters Carousel */}
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {[
                  { id: 'Food', icon: '🍔', label: 'Food' },
                  { id: 'Washroom', icon: '🚻', label: 'Washrooms' },
                  { id: 'Academic', icon: '📚', label: 'Academic' },
                  { id: 'Admin', icon: '🏢', label: 'Admin' },
                  { id: 'Sports', icon: '⚽', label: 'Sports' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(10);
                      setHighlightedPOICategory(highlightedPOICategory === cat.id ? null : cat.id);
                    }}
                    style={{
                      flex: '0 0 auto',
                      padding: '8px 16px',
                      borderRadius: '20px',
                      background: highlightedPOICategory === cat.id ? '#4F46E5' : 'var(--surface)',
                      color: highlightedPOICategory === cat.id ? 'white' : 'var(--text)',
                      border: `1px solid ${highlightedPOICategory === cat.id ? '#4F46E5' : 'var(--border)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    <span>{cat.icon}</span> {cat.label}
                  </button>
                ))}
              </div>

              <SearchableSelect 
                label="STARTING POINT"
                value={startNode}
                onChange={setStartNode}
                nodes={nodes}
                placeholder="Select your location..."
                allowCurrentLocation={true}
              />

              <SearchableSelect 
                label="DESTINATION"
                value={endNode}
                onChange={setEndNode}
                nodes={nodes}
                placeholder="Where to?"
                allowCurrentLocation={false}
              />
            </>
          )}

          {calculatedPath.length > 0 && !isNavigating && (
            <button 
              className="glow-button pulse-button"
              style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #4F46E5, #3B82F6)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)' }}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]); // Start haptic
                handleStartNavigation();
              }}
            >
              <Navigation size={20} />
              Start Navigation ({Math.round(estimatedTime / 60)} min)
            </button>
          )}

          {isNavigating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Draggable indicator for expansion */}
              <div 
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setBottomSheetExpanded(!bottomSheetExpanded);
                }}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer', padding: '4px 0' }}
              >
                <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px' }} />
              </div>

              {/* Main Turn Instruction */}
              {turnInstructions.length > 0 && (
                <div style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <div style={{ background: 'linear-gradient(135deg, #4F46E5, #3B82F6)', color: 'white', padding: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Navigation size={28} style={{ transform: turnInstructions[0].turnType.includes('Left') ? 'rotate(-45deg)' : (turnInstructions[0].turnType.includes('Right') ? 'rotate(45deg)' : 'rotate(0deg)') }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text)' }}>{turnInstructions[0].text}</h3>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>Towards {nodes[endNode]?.name}</p>
                  </div>
                  <button onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}>
                    {bottomSheetExpanded ? <ChevronDown size={24}/> : <ChevronUp size={24}/>}
                  </button>
                </div>
              )}

              {/* ETA / Distance summary */}
              <div style={{ display: 'flex', gap: '12px' }}>
                 <div style={{ flex: 1, padding: '16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#10B981', fontWeight: 'bold', fontSize: '18px' }}>
                    <Clock size={20} />
                    {Math.round(estimatedTime / 60)} min
                 </div>
                 <div style={{ flex: 1, padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#3B82F6', fontWeight: 'bold', fontSize: '18px' }}>
                    <MapPin size={20} />
                    {Math.round(estimatedTime * 1.4)} m
                 </div>
              </div>

              {/* Expanded Turn-by-Turn List */}
              {bottomSheetExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40dvh', overflowY: 'auto', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                  {turnInstructions.slice(1).map((inst, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--surface)', borderRadius: '8px' }}>
                       <Navigation size={18} color="var(--text-muted)" style={{ transform: inst.turnType.includes('Left') ? 'rotate(-45deg)' : (inst.turnType.includes('Right') ? 'rotate(45deg)' : 'rotate(0deg)') }} />
                       <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '500' }}>{inst.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <button 
                style={{ width: '100%', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(20);
                  setIsNavigating(false);
                }}
              >
                End Navigation
              </button>
            </div>
          )}

        </div>
      </div>

      {/* INDOOR NAVIGATION MODE OVERLAY */}
      {isIndoorMode && endNode && nodes[endNode]?.type === 'classroom' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'white'
        }}>
          <div style={{ background: 'linear-gradient(135deg, #10B981, #059669)', padding: '24px', borderRadius: '50%', marginBottom: '24px', boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4)' }}>
            <MapPin size={48} color="white" />
          </div>
          
          <h2 style={{ fontSize: '28px', fontWeight: '800', textAlign: 'center', margin: '0 0 8px 0' }}>Arrived at Building!</h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', textAlign: 'center', margin: '0 0 32px 0' }}>Switching to indoor navigation...</p>
          
          <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '24px', color: '#60A5FA', margin: '0 0 16px 0', textAlign: 'center' }}>{nodes[endNode].name}</h3>
            <p style={{ fontSize: '18px', lineHeight: '1.6', textAlign: 'center', margin: '0 0 32px 0' }}>
              {nodes[endNode].indoorInstructions}
            </p>
            
            <button 
              onClick={() => {
                setIsIndoorMode(false);
                setIsNavigating(false);
                setStartNode(null);
                setEndNode(null);
                if (navigator.vibrate) navigator.vibrate(20);
              }}
              className="glow-button"
              style={{ width: '100%', padding: '16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Smart Location Suggestion Toast */}
      {showLocationSuggestion && !isNavigating && (
        <div className="glass-panel" style={{ position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 20, pointerEvents: 'auto', width: '90%', maxWidth: '400px', cursor: 'pointer', background: 'rgba(30, 41, 59, 0.9)', border: '1px solid #4F46E5', boxShadow: '0 8px 32px rgba(79, 70, 229, 0.2)' }}
          onClick={() => {
             setStartNode('CURRENT_LOCATION');
             setShowLocationSuggestion(false);
             if (navigator.vibrate) navigator.vibrate(20);
          }}
        >
          <div style={{ background: '#4F46E5', color: 'white', padding: '8px', borderRadius: '50%' }}>
            <Navigation size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'white', fontWeight: 600 }}>You are far from this start point.</p>
            <p style={{ margin: 0, fontSize: '13px', color: '#94A3B8' }}>Tap to use current location</p>
          </div>
        </div>
      )}

      {/* Academic Schedule Toast */}
      {upcomingClass && !isNavigating && (
        <div className="glass-panel pulse-button" style={{ position: 'absolute', top: showLocationSuggestion ? '140px' : '70px', left: '50%', transform: 'translateX(-50%)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 20, pointerEvents: 'auto', width: '90%', maxWidth: '400px', cursor: 'pointer', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.95), rgba(59, 130, 246, 0.95))', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}
          onClick={() => {
             setStartNode('CURRENT_LOCATION');
             setEndNode(upcomingClass.roomNodeId);
             setUpcomingClass(null);
             if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
          }}
        >
          <div style={{ background: 'white', color: '#4F46E5', padding: '8px', borderRadius: '50%' }}>
            <Clock size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '15px', color: 'white', fontWeight: 'bold' }}>{upcomingClass.name} in {upcomingClass.timeUntilMins} min</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>Tap to navigate to {nodes[upcomingClass.roomNodeId]?.name || 'class'}</p>
          </div>
        </div>
      )}

      {/* Copyright Watermark */}
      <div style={{ 
        position: 'absolute', 
        bottom: '8px', 
        left: '8px', 
        zIndex: 500, 
        background: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)', 
        backdropFilter: 'blur(4px)',
        padding: '4px 8px', 
        borderRadius: '6px', 
        fontSize: '12px', 
        color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
        pointerEvents: 'none'
      }}>
        &copy; {new Date().getFullYear()} Divyesh Reddy. All Rights Reserved.
      </div>

      {/* Timetable Modal */}
      <TimetableManager 
        isOpen={showTimetable} 
        onClose={() => setShowTimetable(false)} 
        user={auth.currentUser} 
        nodes={nodes} 
        timetables={timetables} 
      />

    </div>
  );
}
