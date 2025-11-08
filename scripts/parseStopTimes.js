const fs = require('fs');

// Parse stop_times.txt to create a map of trip_id -> stops with times
const stopTimesData = fs.readFileSync('manila/stop_times.txt', 'utf8');
const tripsData = fs.readFileSync('manila/trips.txt', 'utf8');

const stopTimes = {};
const lines = stopTimesData.split('\n').slice(1);

lines.forEach(line => {
  if (!line.trim()) return;
  const parts = line.split(',');
  if (parts.length >= 4) {
    const tripId = parts[0];
    const stopId = parts[2];
    const arrivalTime = parts[3];
    
    if (!stopTimes[tripId]) {
      stopTimes[tripId] = [];
    }
    stopTimes[tripId].push({ stopId, arrivalTime });
  }
});

// Parse trips to map route_id -> trip_ids
const trips = {};
const tripLines = tripsData.split('\n').slice(1);
tripLines.forEach(line => {
  if (!line.trim()) return;
  const parts = line.split(',');
  if (parts.length >= 8) {
    const routeId = parts[0];
    const tripId = parts[7];
    if (!trips[routeId]) {
      trips[routeId] = [];
    }
    trips[routeId].push(tripId);
  }
});

// Create route-stop-time mapping
const routeStopTimes = {};

Object.keys(trips).forEach(routeId => {
  const tripIds = trips[routeId];
  const routeStops = new Map();
  
  tripIds.forEach(tripId => {
    if (stopTimes[tripId]) {
      stopTimes[tripId].forEach(({ stopId, arrivalTime }) => {
        if (!routeStops.has(stopId)) {
          routeStops.set(stopId, []);
        }
        routeStops.get(stopId).push(arrivalTime);
      });
    }
  });
  
  routeStopTimes[routeId] = Array.from(routeStops.keys());
});

// Calculate average travel times between stops for each route
const routeTravelTimes = {};

Object.keys(trips).forEach(routeId => {
  const tripIds = trips[routeId];
  const stopSequences = [];
  
  tripIds.forEach(tripId => {
    if (stopTimes[tripId] && stopTimes[tripId].length > 1) {
      const sequence = stopTimes[tripId].map(st => ({
        stopId: st.stopId,
        time: st.arrivalTime,
      }));
      stopSequences.push(sequence);
    }
  });
  
  if (stopSequences.length > 0) {
    // Calculate average time between consecutive stops
    const timeMap = new Map();
    stopSequences.forEach(seq => {
      for (let i = 0; i < seq.length - 1; i++) {
        const fromStop = seq[i].stopId;
        const toStop = seq[i + 1].stopId;
        const fromTime = parseTime(seq[i].time);
        const toTime = parseTime(seq[i + 1].time);
        const diff = toTime - fromTime;
        
        const key = `${fromStop}-${toStop}`;
        if (!timeMap.has(key)) {
          timeMap.set(key, []);
        }
        timeMap.get(key).push(diff);
      }
    });
    
    routeTravelTimes[routeId] = {};
    timeMap.forEach((times, key) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      routeTravelTimes[routeId][key] = Math.round(avg / 60); // Convert to minutes
    });
  }
});

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

fs.writeFileSync('utils/routeTravelTimes.json', JSON.stringify(routeTravelTimes, null, 2));
fs.writeFileSync('utils/routeStops.json', JSON.stringify(routeStopTimes, null, 2));
console.log('Parsed travel times and route stops');

