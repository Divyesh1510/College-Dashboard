import React, { useEffect } from 'react';
import { Map as GoogleMap, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { PolygonLayer } from '@deck.gl/layers';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';

// Polyline component for drawing the route
const Polyline = ({ pathCoordinates, color = '#D9252A', weight = 6, opacity = 0.8, dashed = false, zIndex = 1, onClick = null }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !pathCoordinates || pathCoordinates.length === 0) return;

    const lineSymbol = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 1,
      scale: Math.max(1, weight / 1.5)
    };

    // Create polyline instance
    const polyline = new window.google.maps.Polyline({
      path: pathCoordinates,
      strokeColor: color,
      strokeOpacity: dashed ? 0 : opacity,
      strokeWeight: weight,
      zIndex: zIndex,
      geodesic: true,
      icons: dashed ? [{
        icon: lineSymbol,
        offset: '0',
        repeat: '16px'
      }] : []
    });

    polyline.setMap(map);
    
    let listener;
    if (onClick) {
      listener = polyline.addListener('click', () => onClick());
    }

    // Cleanup on unmount or when path changes
    return () => {
      if (listener) window.google.maps.event.removeListener(listener);
      polyline.setMap(null);
    };
  }, [map, pathCoordinates, color, weight, opacity, dashed, zIndex, onClick]);

  return null;
};



// DeckGL 3D Buildings Overlay
const DeckGlBuildings = ({ blocks }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !blocks || blocks.length === 0) return;
    
    const polygonLayer = new PolygonLayer({
      id: 'blocks-3d',
      data: blocks,
      getPolygon: d => d.paths.map(p => [p.lng, p.lat]),
      getFillColor: [217, 37, 42, 150], // Translucent Red
      getLineColor: [255, 255, 255, 255],
      getElevation: d => (d.floors || 1) * 4.5, // 4.5 meters per floor roughly
      extruded: true,
      wireframe: true,
      pickable: false
    });

    const overlay = new GoogleMapsOverlay({
      layers: [polygonLayer]
    });
    
    overlay.setMap(map);
    
    return () => overlay.setMap(null);
  }, [map, blocks]);
  
  return null;
};

// Custom Polygon component
const Polygon = ({ paths, color }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !paths || paths.length === 0) return;
    const polygon = new window.google.maps.Polygon({
      paths,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35,
    });
    polygon.setMap(map);
    return () => polygon.setMap(null);
  }, [map, paths, color]);
  return null;
};

const MapController = ({ pathCoordinates, isNavigating, startCoords, userLocation, userHeading, isFollowingUser }) => {
  const map = useMap();

  // Handle one-time navigation start setup (Tilt & Zoom)
  useEffect(() => {
    if (!map || !isNavigating) return;
    map.setTilt(45);
    map.setZoom(19);
  }, [map, isNavigating]);

  // Handle high-frequency live tracking updates
  useEffect(() => {
    if (!map) return;

    if (isNavigating && pathCoordinates.length > 0) {
      if (!isFollowingUser) return; // Allow free panning

      const centerPos = userLocation || startCoords;
      
      // Use moveCamera for instantaneous, un-animated updates to prevent animation freezing
      // when GPS pings fire multiple times per second.
      const cameraOptions = {
        center: centerPos,
      };
      
      if (userHeading !== undefined && userHeading !== null) {
         cameraOptions.heading = userHeading;
      }
      
      map.moveCamera(cameraOptions);

    } else if (!isNavigating && pathCoordinates.length > 0) {
      // Just fit bounds to show the whole path
      const bounds = new window.google.maps.LatLngBounds();
      pathCoordinates.forEach(coord => bounds.extend(coord));
      // Increase padding to account for the larger bottom sheet and top header
      map.fitBounds(bounds, { top: 120, bottom: 380, left: 40, right: 40 });
      map.setTilt(0);
      map.setHeading(0);
    }
  }, [map, isNavigating, pathCoordinates, startCoords, userLocation, userHeading, isFollowingUser]);

  return null;
};

export default function CampusMap({ startNode, endNode, calculatedPath, pathCoordinates, alternatePathsCoords, selectedPathIndex = 0, nodes, blocks, edges, isNavigating, userLocation, userHeading, isDarkMode, isSatellite = false, isFollowingUser = true, highlightedPOICategory, onDragStart, onNodeClick, onPathSelect }) {
  // Center of GITAM Hyd
  const defaultCenter = { lat: 17.5501, lng: 78.1666 };

  // Light Mode Styles (Hide labels)
  const lightMapStyles = [
    {
      featureType: "all",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    }
  ];

  // Dark Mode Styles (Dark background, custom roads, hide labels)
  const darkMapStyles = [
    { elementType: "geometry", stylers: [{ color: "#1f2937" }] }, // match app dark surface
    { elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#166534" }] }, // dark green for parks
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] }, // slate-700
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#4b5563" }] }, // slate-600
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] }, // match app very dark background
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#1e293b" }] }
  ];

  // Confine map to GITAM campus bounds
  const campusBounds = {
    north: 17.5560,
    south: 17.5440,
    east: 78.1720,
    west: 78.1600,
  };

  // Helper to categorize nodes for colors
  const getCategoryColor = (name = '') => {
    const lower = name.toLowerCase();
    if (lower.includes('canteen') || lower.includes('cafe') || lower.includes('food')) return '#F59E0B'; // Orange
    if (lower.includes('admin') || lower.includes('office') || lower.includes('library')) return '#8B5CF6'; // Purple
    if (lower.includes('ground') || lower.includes('court') || lower.includes('sports')) return '#10B981'; // Green
    return '#3B82F6'; // Blue for Academic/Other
  };

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <GoogleMap
        defaultZoom={17}
        minZoom={16}
        defaultCenter={defaultCenter}
        disableDefaultUI={true}
        gestureHandling="greedy"
        colorScheme={isDarkMode ? "DARK" : "LIGHT"}
        mapTypeId={isSatellite ? "satellite" : "roadmap"}
        restriction={{
          latLngBounds: campusBounds,
          strictBounds: false
        }}
        onDragStart={onDragStart}
        mapId="DEMO_MAP_ID"
      >
        <MapController 
          pathCoordinates={pathCoordinates} 
          isNavigating={isNavigating} 
          startCoords={nodes[startNode]?.coords} 
          userLocation={userLocation}
          userHeading={userHeading}
          isFollowingUser={isFollowingUser}
        />

        {isNavigating && blocks && blocks.length > 0 && <DeckGlBuildings blocks={blocks} />}

        {/* User Location Marker with Radar Pulse */}
        {userLocation && (
          <AdvancedMarker position={userLocation} zIndex={1000}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="radar-pulse"></div>
              <div style={{ width: '16px', height: '16px', backgroundColor: '#3B82F6', borderRadius: '50%', border: '3px solid white', zIndex: 2 }}></div>
            </div>
          </AdvancedMarker>
        )}
        {/* Draw ALL Entrance Nodes as clickable pins */}
        {nodes && Object.values(nodes).filter(n => n.type !== 'intersection').map((node) => {
          const isSelected = startNode === node.id || endNode === node.id;
          
          let isHighlighted = false;
          if (highlightedPOICategory) {
             const lowerName = node.name.toLowerCase();
             const cat = highlightedPOICategory.toLowerCase();
             if (cat === 'food' && (lowerName.includes('canteen') || lowerName.includes('cafe') || lowerName.includes('food'))) isHighlighted = true;
             if (cat === 'washroom' && (lowerName.includes('washroom') || lowerName.includes('toilet') || lowerName.includes('restroom'))) isHighlighted = true;
             if (cat === 'academic' && (lowerName.includes('block') || lowerName.includes('bhavan'))) isHighlighted = true;
             if (cat === 'admin' && (lowerName.includes('admin') || lowerName.includes('office'))) isHighlighted = true;
             if (cat === 'sports' && (lowerName.includes('ground') || lowerName.includes('court') || lowerName.includes('sports'))) isHighlighted = true;
          }

          // Hide unselected pins during active navigation
          if (isNavigating && !isSelected) return null;
          
          // If a category is selected and this isn't in it, heavily fade it out
          const opacity = highlightedPOICategory && !isHighlighted && !isSelected ? 0.3 : 1;
          const scale = highlightedPOICategory && isHighlighted ? 1.3 : 1;

          const anySelected = startNode || endNode;
          const isStart = startNode === node.id;
          const isEnd = endNode === node.id;
          const baseColor = getCategoryColor(node.name);
          const pinColor = isStart ? '#4F46E5' : (isEnd ? '#EF4444' : baseColor);
          
          return (
            <AdvancedMarker 
              key={node.id} 
              position={node.coords}
              title={node.name}
              onClick={() => onNodeClick && onNodeClick(node.id)}
              zIndex={isHighlighted ? 400 : (isSelected ? 500 : 100)}
            >
              <div 
                className="interactive-pin"
                style={{
                  width: isSelected ? '28px' : '20px',
                  height: isSelected ? '28px' : '20px',
                  backgroundColor: pinColor,
                  borderRadius: '50%',
                  border: isSelected ? '3px solid white' : '2px solid rgba(255,255,255,0.8)',
                  boxShadow: isSelected ? '0 0 15px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  opacity: opacity,
                  transform: `scale(${scale})`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Inner dot for selected pins */}
                {isSelected && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                    borderRadius: '50%'
                  }}></div>
                )}
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Draw the calculated route(s) */}
        {alternatePathsCoords && alternatePathsCoords.length > 0 ? (
          alternatePathsCoords.map((coords, idx) => (
             <Polyline 
               key={idx} 
               pathCoordinates={coords} 
               color={idx === selectedPathIndex ? "#4F46E5" : "#94A3B8"} 
               weight={idx === selectedPathIndex ? 6 : 4} 
               opacity={idx === selectedPathIndex ? 1.0 : 0.6} 
               zIndex={idx === selectedPathIndex ? 50 : 10}
               onClick={onPathSelect ? () => onPathSelect(idx) : null}
             />
          ))
        ) : (
          pathCoordinates.length > 0 && <Polyline pathCoordinates={pathCoordinates} color="#4F46E5" weight={6} opacity={1.0} zIndex={50} />
        )}
      </GoogleMap>
    </div>
  );
}
