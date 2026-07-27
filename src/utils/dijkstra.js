export function findShortestPath(startNode, endNode, graph) {
  const distances = {};
  const prev = {};
  const unvisited = new Set();

  // Initialize
  for (let node in graph) {
    distances[node] = Infinity;
    prev[node] = null;
    unvisited.add(node);
  }
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    // Find unvisited node with minimum distance
    let currNode = null;
    let minDist = Infinity;
    for (let node of unvisited) {
      if (distances[node] < minDist) {
        minDist = distances[node];
        currNode = node;
      }
    }

    if (currNode === null) break; // Remaining nodes are unreachable
    if (currNode === endNode) break; // Found shortest path

    unvisited.delete(currNode);

    // Update neighbors
    for (let neighbor in graph[currNode]) {
      if (unvisited.has(neighbor)) {
        const altDist = distances[currNode] + graph[currNode][neighbor];
        if (altDist < distances[neighbor]) {
          distances[neighbor] = altDist;
          prev[neighbor] = currNode;
        }
      }
    }
  }

  // Reconstruct path
  const path = [];
  let current = endNode;
  while (current !== null) {
    path.unshift(current);
    current = prev[current];
  }

  if (path.length > 0 && path[0] === startNode) {
    return {
      path,
      timeSeconds: distances[endNode]
    };
  }

  return { path: [], timeSeconds: 0 };
}

export function findAlternatePaths(startNode, endNode, originalGraph, maxPaths = 3) {
  const paths = [];
  
  // Deep clone graph to apply penalties
  const graph = JSON.parse(JSON.stringify(originalGraph));
  const PENALTY_FACTOR = 1.5;

  for (let i = 0; i < maxPaths * 2; i++) { // Loop a few extra times in case of duplicates
    const result = findShortestPath(startNode, endNode, graph);
    if (!result || result.path.length === 0) break;

    // Check if we already found this exact path
    const isDuplicate = paths.some(p => p.path.join(',') === result.path.join(','));
    if (!isDuplicate) {
      // Calculate true time using original graph
      let trueTime = 0;
      for (let j = 0; j < result.path.length - 1; j++) {
        const u = result.path[j];
        const v = result.path[j+1];
        trueTime += originalGraph[u][v];
      }
      paths.push({
        path: result.path,
        timeSeconds: trueTime
      });

      if (paths.length >= maxPaths) break;

      // Penalize edges in this path
      for (let j = 0; j < result.path.length - 1; j++) {
        const u = result.path[j];
        const v = result.path[j+1];
        if (graph[u][v]) graph[u][v] *= PENALTY_FACTOR;
        if (graph[v][u]) graph[v][u] *= PENALTY_FACTOR;
      }
    } else {
      // If we got a duplicate despite penalties, increase penalty heavily to force diversity
      for (let j = 0; j < result.path.length - 1; j++) {
        const u = result.path[j];
        const v = result.path[j+1];
        if (graph[u][v]) graph[u][v] *= 3;
        if (graph[v][u]) graph[v][u] *= 3;
      }
    }
  }

  return paths;
}
