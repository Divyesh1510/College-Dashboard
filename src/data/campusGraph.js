// Coordinates are approximate based on a central point for GITAM Hyd
const CENTER_LAT = 17.5501;
const CENTER_LNG = 78.1666;

// Helper to create small offsets
const offset = (latOff, lngOff) => ({ lat: CENTER_LAT + latOff, lng: CENTER_LNG + lngOff });

export const nodes = {
  'A': { id: 'A', name: 'Block A', type: 'block', coords: offset(0.001, -0.001) },
  'B': { id: 'B', name: 'Block B', type: 'block', coords: offset(0.001, 0) },
  'C': { id: 'C', name: 'Block C', type: 'block', coords: offset(0.001, 0.001) },
  'D': { id: 'D', name: 'Block D', type: 'block', coords: offset(0, 0.002) },
  'E': { id: 'E', name: 'Block E', type: 'block', coords: offset(-0.001, 0.001) },
  'F': { id: 'F', name: 'Block F', type: 'block', coords: offset(-0.001, 0) },
  'G': { id: 'G', name: 'Block G', type: 'block', coords: offset(-0.001, -0.001) },
  'H': { id: 'H', name: 'Block H', type: 'block', coords: offset(0, -0.002) },
  'J': { id: 'J', name: 'Block J', type: 'block', coords: offset(0, 0) }, // Center-ish
  'Cafe1': { id: 'Cafe1', name: 'Main Cafe', type: 'cafe', coords: offset(0.0005, 0.0005) },
  'Cafe2': { id: 'Cafe2', name: 'Mini Canteen', type: 'cafe', coords: offset(-0.0005, -0.0005) },
  // Intersections to make paths more realistic instead of straight lines
  'I1': { id: 'I1', type: 'intersection', coords: offset(0.0005, 0) },
  'I2': { id: 'I2', type: 'intersection', coords: offset(-0.0005, 0) },
};

// Haversine formula to calculate distance between two coordinates in meters
function getDistance(node1, node2) {
  const R = 6371e3; // metres
  const φ1 = node1.coords.lat * Math.PI/180; // φ, λ in radians
  const φ2 = node2.coords.lat * Math.PI/180;
  const Δφ = (node2.coords.lat-node1.coords.lat) * Math.PI/180;
  const Δλ = (node2.coords.lng-node1.coords.lng) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

// Connections between nodes. Format: [nodeId1, nodeId2]
const connections = [
  ['A', 'B'], ['B', 'C'], ['C', 'Cafe1'], ['Cafe1', 'D'],
  ['A', 'H'], ['B', 'I1'], ['C', 'I1'], ['I1', 'J'],
  ['H', 'J'], ['D', 'J'], 
  ['J', 'I2'], ['I2', 'F'], ['F', 'Cafe2'], ['Cafe2', 'G'],
  ['G', 'H'], ['E', 'D'], ['F', 'E'], ['E', 'I2']
];

// Build adjacency list
export const graph = {};

// Initialize graph
Object.keys(nodes).forEach(key => {
  graph[key] = {};
});

// Populate weights based on geographical distance
connections.forEach(([n1, n2]) => {
  const dist = getDistance(nodes[n1], nodes[n2]);
  // Assuming walking speed is ~1.4 meters/second, weight = time in seconds
  const timeInSeconds = dist / 1.4;
  
  graph[n1][n2] = timeInSeconds;
  graph[n2][n1] = timeInSeconds; // undirected graph
});
