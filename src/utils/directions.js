// src/utils/directions.js

function getDistanceInMeters(coord1, coord2) {
  const R = 6371e3;
  const p1 = coord1.lat * Math.PI/180;
  const p2 = coord2.lat * Math.PI/180;
  const dp = (coord2.lat-coord1.lat) * Math.PI/180;
  const dl = (coord2.lng-coord1.lng) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function getBearing(start, end) {
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  const dLng = (end.lng - start.lng) * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

export function generateTurnInstructions(rawCoords) {
  if (!rawCoords || rawCoords.length < 2) return [];

  // Smoothen path: remove points that are microscopically close to each other
  // This prevents floating-point bearing errors that cause fake U-turns
  const coords = [rawCoords[0]];
  for (let i = 1; i < rawCoords.length; i++) {
    const dist = getDistanceInMeters(coords[coords.length - 1], rawCoords[i]);
    if (dist > 3 || i === rawCoords.length - 1) {
      coords.push(rawCoords[i]);
    }
  }

  if (coords.length < 2) return [];

  const instructions = [];
  let currentSegmentDistance = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const dist = getDistanceInMeters(coords[i], coords[i+1]);
    currentSegmentDistance += dist;

    if (i < coords.length - 2) {
      const bearing1 = getBearing(coords[i], coords[i+1]);
      const bearing2 = getBearing(coords[i+1], coords[i+2]);
      
      let turnAngle = bearing2 - bearing1;
      if (turnAngle < -180) turnAngle += 360;
      if (turnAngle > 180) turnAngle -= 360;

      // Only register a turn if the angle is significant (> 30 degrees)
      if (Math.abs(turnAngle) > 30) {
        let turnType = 'Straight';
        if (turnAngle > 30 && turnAngle <= 60) turnType = 'Slight Right';
        else if (turnAngle > 60 && turnAngle <= 120) turnType = 'Right';
        else if (turnAngle > 120 || turnAngle < -120) turnType = 'U-Turn';
        else if (turnAngle < -60 && turnAngle >= -120) turnType = 'Left';
        else if (turnAngle < -30 && turnAngle > -60) turnType = 'Slight Left';

        instructions.push({
          text: `In ${Math.round(currentSegmentDistance)}m, turn ${turnType.toLowerCase()}`,
          turnType,
          distance: Math.round(currentSegmentDistance),
          coordIndex: i + 1
        });
        currentSegmentDistance = 0; // reset for next leg
      }
    } else {
      // Final destination
      instructions.push({
        text: `In ${Math.round(currentSegmentDistance)}m, you will arrive at your destination`,
        turnType: 'Arrive',
        distance: Math.round(currentSegmentDistance),
        coordIndex: i + 1
      });
    }
  }
  
  // If no significant turns, just one instruction
  if (instructions.length === 0 && currentSegmentDistance > 0) {
     instructions.push({
        text: `Walk straight for ${Math.round(currentSegmentDistance)}m to arrive`,
        turnType: 'Arrive',
        distance: Math.round(currentSegmentDistance),
        coordIndex: coords.length - 1
      });
  }

  return instructions;
}
