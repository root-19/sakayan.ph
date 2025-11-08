const fs = require('fs');

const data = fs.readFileSync('manila/stops.txt', 'utf8');
const lines = data.split('\n').slice(1);
const stops = [];

lines.forEach(line => {
  if (!line.trim()) return;
  
  // Parse CSV handling quoted fields
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  
  if (parts.length >= 6 && parts[2]) {
    stops.push({
      id: parts[0] || '',
      name: parts[2].replace(/^"|"$/g, '') || '',
      lat: parseFloat(parts[4]) || 0,
      lon: parseFloat(parts[5]) || 0,
      description: parts[3] || '',
    });
  }
});

fs.writeFileSync('utils/stopsData.json', JSON.stringify(stops, null, 2));
console.log(`Parsed ${stops.length} stops`);

