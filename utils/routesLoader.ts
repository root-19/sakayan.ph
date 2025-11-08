export interface Route {
  id: string;
  name: string;
  shortName: string;
  description: string;
  agency: string;
  type: string;
}

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function loadRoutesFromFile(): Promise<Route[]> {
  try {
    // Try to fetch the routes file
    const response = await fetch('/manila/routes.txt');
    if (!response.ok) {
      throw new Error('Failed to fetch routes.txt');
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    const routes: Route[] = [];
    
    // Skip header line (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = parseCSVLine(line);
      
      if (parts.length >= 9) {
        const agency = parts[0] || '';
        const shortName = parts[1] || '';
        const longName = parts[2] || '';
        const description = parts[3] || '';
        const routeType = parts[4] || '';
        const routeId = parts[8] || '';
        
        if (longName && routeId) {
          routes.push({
            id: routeId,
            name: longName,
            shortName: shortName,
            description: description || shortName,
            agency: agency,
            type: routeType === '2' ? 'Rail' : routeType === '3' ? 'Bus' : 'Other',
          });
        }
      }
    }
    
    // Remove duplicates by route name, keeping unique routes
    const uniqueRoutes = Array.from(
      new Map(routes.map(route => [route.name, route])).values()
    );
    
    return uniqueRoutes;
  } catch (error) {
    console.error('Error loading routes from file:', error);
    // Return empty array or fallback routes
    return [];
  }
}

