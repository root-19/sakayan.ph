import Constants from 'expo-constants';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


interface Route {
  id: string;
  name: string;
  shortName: string;
  description: string;
  agency: string;
  type: string;
  fare?: number;
}

interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  description: string;
}

type RouteLeg = {
  route: Route;
  fromStop: Stop;
  toStop: Stop;
  travelTime: number;
  fare: number;
  vehicleType: string;
  vehicleEmoji: string;
};

type MultiLegJourney = {
  legs: RouteLeg[];
  totalTime: number;
  totalFare: number;
  fromLocation: string;
  toLocation: string;
};

type SearchResult = {
  type: 'route' | 'stop' | 'journey';
  data: Route | Stop | MultiLegJourney;
  travelTime?: number; // Estimated travel time in minutes
  fare?: number; // Fare in PHP
  vehicleType?: string; // Jeepney, Bus, LRT, MRT
  isAISuggestion?: boolean; // Mark AI-powered suggestions
};

export default function HomeScreen() {
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [routeTravelTimes, setRouteTravelTimes] = useState<Record<string, Record<string, number>>>({});
  const [routeStops, setRouteStops] = useState<Record<string, string[]>>({});
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Route[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [mapboxSuggestions, setMapboxSuggestions] = useState<Array<{ name: string; lat: number; lon: number; context?: string }>>([]);
  const [searchingMapbox, setSearchingMapbox] = useState(false);
  const [mapboxVehicles, setMapboxVehicles] = useState<SearchResult[]>([]);
  const [loadingMapboxVehicles, setLoadingMapboxVehicles] = useState(false);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<Set<string>>(new Set(['Jeepney', 'Bus', 'LRT 1', 'LRT 2', 'MRT 3']));
  const [showDonationModal, setShowDonationModal] = useState(false);

  // API Configuration
  const ENABLE_GPT_SUGGESTIONS = true;
  
  // OpenAI GPT API Configuration (from .env)
  const OPENAI_API_KEY = Constants.expoConfig?.extra?.openaiApiKey || '';
  const OPENAI_API_URL = Constants.expoConfig?.extra?.openaiApiUrl || 'https://api.openai.com/v1/chat/completions';

  // Using Expo Location for current location - no Mapbox native module needed



  // No local data loading - using Mapbox only
  useEffect(() => {
    setLoading(false);
  }, []);

  // Get current location using Expo Location
  const getCurrentLocation = async () => {
    try {
      setGettingLocation(true);
      
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'We need your location to find the best routes from your current location to your destination. Please enable location permission in settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => getCurrentLocation() },
          ]
        );
        setGettingLocation(false);
        return;
      }

      // Get current position with high accuracy
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const { latitude, longitude } = location.coords;
      
      // Get location name using reverse geocoding
      let locationName = '📍 Current Location';
      
      try {
        // Use Expo Location's reverse geocoding
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        
        if (reverseGeocode && reverseGeocode.length > 0) {
          const address = reverseGeocode[0];
          // Build a readable address
          const addressParts = [];
          if (address.street) addressParts.push(address.street);
          if (address.district) addressParts.push(address.district);
          if (address.city) addressParts.push(address.city);
          
          if (addressParts.length > 0) {
            locationName = addressParts.join(', ');
          } else if (address.name) {
            locationName = address.name;
          }
        }
      } catch (geocodeError) {
        // If reverse geocoding fails, just use "Current Location"
        console.log('Reverse geocoding error:', geocodeError);
      }

      // Update current location state
      setCurrentLocation({
        lat: latitude,
        lon: longitude,
        name: locationName,
      });
      
      // Auto-fill "From" field
      setFromQuery(locationName);
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert(
        'Error', 
        error.message || 'Could not get your current location. Please try again.'
      );
    } finally {
      setGettingLocation(false);
    }
  };

  // Watch location updates (optional - for continuous tracking)
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    
    const startWatchingLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000, // Update every 30 seconds
            distanceInterval: 100, // Update every 100 meters
          },
          (location) => {
            const { latitude, longitude } = location.coords;
            setCurrentLocation({
              lat: latitude,
              lon: longitude,
              name: currentLocation?.name || '📍 Current Location',
            });
          }
        );
      }
    };
    
    // Only watch if user has set current location
    if (currentLocation) {
      startWatchingLocation();
    }
    
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [currentLocation?.name]);

  // Calculate travel time between two stops on a route
  const calculateTravelTime = (routeId: string, fromStopId: string, toStopId: string): number | null => {
    if (!routeTravelTimes[routeId] || !routeStops[routeId]) {
      return null;
    }

    const routeStopList = routeStops[routeId];
    const fromIndex = routeStopList.indexOf(fromStopId);
    const toIndex = routeStopList.indexOf(toStopId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
      return null;
    }

    // Calculate cumulative travel time
    let totalMinutes = 0;
    for (let i = fromIndex; i < toIndex; i++) {
      const key = `${routeStopList[i]}-${routeStopList[i + 1]}`;
      const time = routeTravelTimes[routeId][key];
      if (time) {
        totalMinutes += time;
      } else {
        // If no specific time, estimate 3 minutes per stop
        totalMinutes += 3;
      }
    }

    return totalMinutes;
  };

  // Calculate distance between two coordinates (Haversine formula) in kilometers
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Check if two locations are within reasonable distance (Metro Manila area ~50km radius)
  const isWithinMetroManila = (lat1: number, lon1: number, lat2: number, lon2: number): boolean => {
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    return distance <= 50; // 50km radius for Metro Manila
  };

  // Calculate fare based on vehicle type and distance
  const calculateFare = React.useCallback((vehicleType: string, travelTime: number | null): number => {
    // Base fares in PHP (as of 2024)
    const baseFares: Record<string, number> = {
      'Rail': 15, // LRT/MRT minimum fare
      'Bus': 12, // Bus minimum fare
      'Jeepney': 9, // Jeepney minimum fare
      'Other': 10, // Default for other types
    };

    const baseFare = baseFares[vehicleType] || baseFares['Other'];
    
    if (!travelTime) {
      return baseFare;
    }

    // Add distance-based fare (approximately 1 PHP per 5 minutes)
    const additionalFare = Math.floor(travelTime / 5) * 1;
    
    return baseFare + additionalFare;
  }, []);

  // Get vehicle type emoji and name from vehicle type string
  const getVehicleInfoFromType = (vehicleType: string): { emoji: string; name: string } => {
    const type = vehicleType?.toLowerCase() || '';
    
    if (type.includes('lrt 1')) {
      return { emoji: '🚇', name: 'LRT 1' };
    }
    if (type.includes('lrt 2')) {
      return { emoji: '🚇', name: 'LRT 2' };
    }
    if (type.includes('lrt')) {
      return { emoji: '🚇', name: 'LRT' };
    }
    if (type.includes('mrt')) {
      return { emoji: '🚆', name: 'MRT' };
    }
    if (type.includes('bus')) {
      return { emoji: '🚌', name: 'Bus' };
    }
    if (type.includes('jeepney') || type.includes('jeep')) {
      return { emoji: '🚐', name: 'Jeepney' };
    }
    
    return { emoji: '🚐', name: 'Jeepney' };
  };

  // Get vehicle type emoji and name
  const getVehicleInfo = (route: Route): { emoji: string; name: string } => {
    const type = route.type?.toLowerCase() || '';
    const name = route.name?.toLowerCase() || '';
    const shortName = route.shortName?.toLowerCase() || '';

    if (type.includes('rail') || name.includes('lrt') || name.includes('mrt') || shortName.includes('lrt') || shortName.includes('mrt')) {
      if (name.includes('lrt 1') || shortName.includes('lrt 1')) {
        return { emoji: '🚇', name: 'LRT 1' };
      }
      if (name.includes('lrt 2') || shortName.includes('lrt 2')) {
        return { emoji: '🚇', name: 'LRT 2' };
      }
      if (name.includes('mrt') || shortName.includes('mrt')) {
        return { emoji: '🚆', name: 'MRT' };
      }
      return { emoji: '🚇', name: 'LRT/MRT' };
    }
    
    if (type.includes('bus') || route.agency === 'LTFRB') {
      // Check if it's a jeepney route (usually shorter routes)
      if (name.includes('jeepney') || name.includes('fx') || route.description?.toLowerCase().includes('jeepney')) {
        return { emoji: '🚐', name: 'Jeepney' };
      }
      return { emoji: '🚌', name: 'Bus' };
    }

    // Default to jeepney for LTFRB routes
    if (route.agency === 'LTFRB') {
      return { emoji: '🚐', name: 'Jeepney' };
    }

    return { emoji: '🚌', name: 'Transport' };
  };

  // Get route suggestions using GPT API with step-by-step guide
  const getGPTRouteSuggestions = React.useCallback(async (from: string, to: string): Promise<SearchResult[]> => {
    if (!from.trim() || !to.trim() || !ENABLE_GPT_SUGGESTIONS) return [];
    
    try {
      setLoadingMapboxVehicles(true);
      
      const prompt = `You are a transportation assistant for Metro Manila, Philippines ONLY. 
Provide step-by-step guide (hakbang-hakbang) for going from "${from}" to "${to}" in Metro Manila.

CRITICAL RESTRICTIONS:
- ONLY suggest routes within Metro Manila, Philippines
- DO NOT suggest routes to other countries, provinces, or cities outside Metro Manila
- If the destination is outside Metro Manila, respond with an empty array []
- Metro Manila includes: Manila, Quezon City, Makati, Pasig, Mandaluyong, San Juan, Taguig, Parañaque, Las Piñas, Muntinlupa, Marikina, Caloocan, Malabon, Navotas, Valenzuela, Pasay

IMPORTANT: You MUST provide a COMPLETE step-by-step journey with ALL vehicles they need to ride, including transfers.
For example, if going from Masinag to Baclaran, the journey might be:
1. From Masinag, ride LRT 2 to Recto Station
2. At Recto Station, transfer to LRT 1
3. Ride LRT 1 from Recto to Baclaran Station

Available transportation types (Metro Manila only):
- Jeepney (🚐) - Short to medium distances, fare: ₱9-20
- Bus (🚌) - Medium to long distances, fare: ₱12-25
- LRT 1 (🚇) - Runs from Roosevelt to Baclaran, fare: ₱15-30
- LRT 2 (🚇) - Runs from Recto to Antipolo, fare: ₱15-30
- MRT 3 (🚆) - Runs from North Avenue to Taft Avenue, fare: ₱15-30

REQUIREMENTS:
- Return 1-3 route options (prioritize the best/fastest)
- Each route MUST include ALL steps from start to destination
- Include transfer points (where to get off and transfer)
- Show specific stations/stops where they board and alight
- Estimate realistic travel time for EACH step and TOTAL time
- Estimate realistic fare for EACH step and TOTAL fare
- If direct route exists (no transfer), show it as a single step

Respond with a JSON array in this EXACT format (no other text):
[
  {
    "routeName": "Route option name",
    "totalTime": 60,
    "totalFare": 30,
    "steps": [
      {
        "stepNumber": 1,
        "vehicleType": "LRT 2",
        "from": "Masinag Station",
        "to": "Recto Station",
        "description": "Ride LRT 2 from Masinag Station to Recto Station",
        "travelTime": 30,
        "fare": 15
      },
      {
        "stepNumber": 2,
        "vehicleType": "LRT 1",
        "from": "Recto Station",
        "to": "Baclaran Station",
        "description": "Transfer to LRT 1 at Recto Station, ride to Baclaran Station",
        "travelTime": 30,
        "fare": 15
      }
    ]
  }
]

Example for Masinag to Baclaran:
[
  {
    "routeName": "Via LRT 2 and LRT 1",
    "totalTime": 60,
    "totalFare": 30,
    "steps": [
      {
        "stepNumber": 1,
        "vehicleType": "LRT 2",
        "from": "Masinag Station",
        "to": "Recto Station",
        "description": "Ride LRT 2 from Masinag Station to Recto Station",
        "travelTime": 30,
        "fare": 15
      },
      {
        "stepNumber": 2,
        "vehicleType": "LRT 1",
        "from": "Recto Station",
        "to": "Baclaran Station",
        "description": "Transfer to LRT 1 at Recto Station, ride to Baclaran Station",
        "travelTime": 30,
        "fare": 15
      }
    ]
  }
]`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful transportation assistant for Metro Manila. Always respond with valid JSON arrays only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('GPT API Error:', response.status, errorText.substring(0, 200));
        setLoadingMapboxVehicles(false);
        return [];
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        setLoadingMapboxVehicles(false);
        return [];
      }
      
      // Parse JSON from response (handle markdown code blocks if present)
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/```\n?/g, '');
      }
      
      console.log('GPT Response content:', jsonContent.substring(0, 200)); // Debug log
      
      let suggestions;
      try {
        suggestions = JSON.parse(jsonContent);
      } catch (parseError) {
        console.log('JSON Parse Error:', parseError);
        console.log('Full content:', jsonContent);
        setLoadingMapboxVehicles(false);
        return [];
      }
      
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        setLoadingMapboxVehicles(false);
        return [];
      }
      
      // Convert to SearchResult format with step-by-step journeys
      const results: SearchResult[] = suggestions.slice(0, 3).map((suggestion: any, index: number) => {
        // Check if this is a multi-step journey
        if (suggestion.steps && Array.isArray(suggestion.steps) && suggestion.steps.length > 0) {
          // Convert steps to RouteLeg format
          const legs: RouteLeg[] = suggestion.steps.map((step: any) => {
            const vehicleInfo = getVehicleInfoFromType(step.vehicleType || 'Jeepney');
            return {
              route: {
                id: `gpt-leg-${index}-${step.stepNumber}-${Date.now()}`,
                name: step.description || `${step.from} to ${step.to}`,
                shortName: `${step.from} → ${step.to}`,
                description: step.description || `Ride ${step.vehicleType} from ${step.from} to ${step.to}`,
                agency: step.vehicleType?.includes('LRT') || step.vehicleType?.includes('MRT') ? 'LRTA' : 'LTFRB',
                type: step.vehicleType || 'Jeepney',
                fare: step.fare || calculateFare(step.vehicleType || 'Jeepney', step.travelTime || 30),
              },
              fromStop: {
                id: `stop-${step.from}-${Date.now()}`,
                name: step.from,
                lat: 0,
                lon: 0,
              },
              toStop: {
                id: `stop-${step.to}-${Date.now()}`,
                name: step.to,
                lat: 0,
                lon: 0,
              },
              travelTime: step.travelTime || 30,
              fare: step.fare || calculateFare(step.vehicleType || 'Jeepney', step.travelTime || 30),
              vehicleType: step.vehicleType || 'Jeepney',
              vehicleEmoji: vehicleInfo.emoji,
            };
          });
          
          const journey: MultiLegJourney = {
            legs: legs,
            totalTime: suggestion.totalTime || legs.reduce((sum, leg) => sum + leg.travelTime, 0),
            totalFare: suggestion.totalFare || legs.reduce((sum, leg) => sum + leg.fare, 0),
            fromLocation: from,
            toLocation: to,
          };
          
          return {
            type: 'journey',
            data: journey,
            travelTime: journey.totalTime,
            fare: journey.totalFare,
            vehicleType: 'Multi-Leg Journey',
            isAISuggestion: true,
          };
        } else {
          // Fallback for single-step routes (backward compatibility)
          const vehicleType = suggestion.vehicleType || 'Jeepney';
          const travelTime = suggestion.travelTime || 30;
          const fare = suggestion.fare || calculateFare(vehicleType, travelTime);
          
          const syntheticRoute: Route = {
            id: `gpt-${index}-${Date.now()}`,
            name: suggestion.routeName || `${from} to ${to} via ${vehicleType}`,
            shortName: suggestion.routeName || `${from} → ${to}`,
            description: suggestion.description || `Route from ${from} to ${to} using ${vehicleType}`,
            agency: vehicleType.includes('LRT') || vehicleType.includes('MRT') ? 'LRTA' : 'LTFRB',
            type: vehicleType,
            fare: fare,
          };
          
          return {
            type: 'route',
            data: syntheticRoute,
            travelTime: travelTime,
            fare: fare,
            vehicleType: vehicleType,
            isAISuggestion: true,
          };
        }
      });
      
      setLoadingMapboxVehicles(false);
      console.log('GPT Results:', results.length, 'routes found'); // Debug log
      return results;
    } catch (error: any) {
      setLoadingMapboxVehicles(false);
      if (error.name === 'AbortError') {
        console.log('GPT API request timeout');
      } else {
        console.log('Error getting GPT suggestions:', error.message || error);
      }
      return [];
    }
  }, [calculateFare]);

  // Get AI-powered route suggestions (disabled - using GPT instead)
  const getAIRouteSuggestions = React.useCallback(async (from: string, to: string) => {
    // DeepSeek API disabled - using GPT getGPTRouteSuggestions instead
    return;
  }, []);

  // Find routes that connect from location to destination with travel time
  const findRoutes = useMemo(() => {
    if (!fromQuery.trim() || !toQuery.trim()) {
      return [];
    }

    const fromLower = fromQuery.toLowerCase();
    const toLower = toQuery.toLowerCase();
    
    // Find stops matching "from" and "to" - FLEXIBLE MATCHING
    const fromStops = stops.filter(stop => {
      if (!stop || !stop.name || !stop.id || !stop.lat || !stop.lon) return false;
      const stopName = (stop.name || '').toLowerCase();
      const stopDesc = (stop.description || '').toLowerCase();
      const searchTerm = fromLower;
      
      // Remove common words for better matching
      const cleanStopName = stopName.replace(/\b(lrt|mrt|station|stop|mall|sm)\b/gi, '').trim();
      const cleanSearch = searchTerm.replace(/\b(lrt|mrt|station|stop|mall|sm)\b/gi, '').trim();
      
      // Match if: exact match, contains search, or search contains stop name
      return stopName === searchTerm ||
             stopName.includes(searchTerm) || 
             searchTerm.includes(stopName) ||
             cleanStopName.includes(cleanSearch) ||
             cleanSearch.includes(cleanStopName) ||
             stopDesc.includes(searchTerm);
    });
    
    const toStops = stops.filter(stop => {
      if (!stop || !stop.name || !stop.id || !stop.lat || !stop.lon) return false;
      const stopName = (stop.name || '').toLowerCase();
      const stopDesc = (stop.description || '').toLowerCase();
      const searchTerm = toLower;
      
      // Remove common words for better matching
      const cleanStopName = stopName.replace(/\b(lrt|mrt|station|stop|mall|sm)\b/gi, '').trim();
      const cleanSearch = searchTerm.replace(/\b(lrt|mrt|station|stop|mall|sm)\b/gi, '').trim();
      
      // Match if: exact match, contains search, or search contains stop name
      return stopName === searchTerm ||
             stopName.includes(searchTerm) || 
             searchTerm.includes(stopName) ||
             cleanStopName.includes(cleanSearch) ||
             cleanSearch.includes(cleanStopName) ||
             stopDesc.includes(searchTerm);
    });

    // Filter: Only show routes if stops are within Metro Manila distance
    const validFromStops = fromStops.filter(fromStop => {
      return toStops.some(toStop => {
        return isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
      });
    });

    const validToStops = toStops.filter(toStop => {
      return fromStops.some(fromStop => {
        return isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
      });
    });

    // If no valid stops found, return empty
    if (validFromStops.length === 0 || validToStops.length === 0) {
      return [];
    }

    // Find routes that connect both locations with scoring and travel time
    const matchingRoutes: Array<Route & { travelTime?: number; score: number }> = [];
    const routeScores = new Map<string, number>();
    
    routes.forEach(route => {
      if (!route || !route.id || !route.name) return;
      
      const routeName = (route.name || '').toLowerCase();
      const routeDesc = (route.description || '').toLowerCase();
      let score = 0;
      let travelTime: number | null = null;
      
      // Check if route has both stops and calculate travel time
      // Only check valid stops (within distance)
      if (routeStops[route.id]) {
        for (const fromStop of validFromStops) {
          if (!fromStop || !fromStop.id) continue;
          for (const toStop of validToStops) {
            if (!toStop || !toStop.id) continue;
            
            // Check distance first - only proceed if within Metro Manila
            if (!isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon)) {
              continue;
            }
            
            const time = calculateTravelTime(route.id, fromStop.id, toStop.id);
            if (time !== null) {
              travelTime = time;
              score += 30; // High score for direct route with travel time
              break;
            }
          }
          if (travelTime !== null) break;
        }
      }
      
      // High priority: Route name mentions both locations
      const routeNameHasFrom = routeName.includes(fromLower);
      const routeNameHasTo = routeName.includes(toLower);
      if (routeNameHasFrom && routeNameHasTo) {
        score += 20;
        if (routeName.includes(' - ') || routeName.includes(' to ')) {
          score += 10;
        }
      }
      
      // Check route description mentions both locations
      const descHasFrom = routeDesc.includes(fromLower);
      const descHasTo = routeDesc.includes(toLower);
      if (descHasFrom && descHasTo) {
        score += 15;
      } else if (descHasFrom || descHasTo) {
        score += 5;
      }
      
      // Check if route passes through matching stops (only valid stops)
      validFromStops.forEach(stop => {
        if (!stop || !stop.name) return;
        const stopNameLower = (stop.name || '').toLowerCase();
        if (routeDesc.includes(stopNameLower) || routeName.includes(stopNameLower)) {
          score += 8;
        }
      });
      
      validToStops.forEach(stop => {
        if (!stop || !stop.name) return;
        const stopNameLower = (stop.name || '').toLowerCase();
        if (routeDesc.includes(stopNameLower) || routeName.includes(stopNameLower)) {
          score += 8;
        }
      });
      
      // Only add route if it has a meaningful score AND has valid stops
      if (score > 0 && (travelTime !== null || score >= 8)) {
        routeScores.set(route.id, score);
        matchingRoutes.push({ ...route, travelTime: travelTime || undefined, score });
      }
    });

    // Sort by score (highest first), then by travel time (shortest first)
    return matchingRoutes.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.travelTime && b.travelTime) {
        return a.travelTime - b.travelTime;
      }
      return 0;
    });
  }, [fromQuery, toQuery, routes, stops, routeTravelTimes, routeStops]);

  // Find multi-leg journeys (routes with transfers)
  const findMultiLegJourneys = useMemo((): MultiLegJourney[] => {
    if (!fromQuery.trim() || !toQuery.trim()) {
      return [];
    }

    const fromLower = fromQuery.toLowerCase();
    const toLower = toQuery.toLowerCase();
    
    // Find stops matching "from" and "to" - STRICT MATCHING
    const fromStops = stops.filter(stop => {
      if (!stop || !stop.name || !stop.id || !stop.lat || !stop.lon) return false;
      const stopName = (stop.name || '').toLowerCase();
      return stopName === fromLower ||
             stopName.includes(fromLower) || 
             fromLower.includes(stopName);
    });
    
    const toStops = stops.filter(stop => {
      if (!stop || !stop.name || !stop.id || !stop.lat || !stop.lon) return false;
      const stopName = (stop.name || '').toLowerCase();
      return stopName === toLower ||
             stopName.includes(toLower) || 
             toLower.includes(stopName);
    });

    // Filter: Only show journeys if stops are within Metro Manila distance
    const validFromStops = fromStops.filter(fromStop => {
      return toStops.some(toStop => {
        return isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
      });
    });

    const validToStops = toStops.filter(toStop => {
      return fromStops.some(fromStop => {
        return isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
      });
    });

    // If no valid stops found, return empty
    if (validFromStops.length === 0 || validToStops.length === 0) {
      return [];
    }

    const journeys: MultiLegJourney[] = [];

    // Try to find 2-leg journeys (one transfer) - only with valid stops
    validFromStops.forEach(fromStop => {
      validToStops.forEach(toStop => {
        
        // Check distance first - skip if too far
        if (!isWithinMetroManila(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon)) {
          return;
        }
        // Find routes that go from start to an intermediate stop
        routes.forEach(firstRoute => {
          if (!routeStops[firstRoute.id]) return;
          
          const firstRouteStops = routeStops[firstRoute.id];
          const fromIndex = firstRouteStops.indexOf(fromStop.id);
          
          if (fromIndex === -1) return;

          // Find all stops this route can reach
          for (let i = fromIndex + 1; i < firstRouteStops.length; i++) {
            const intermediateStopId = firstRouteStops[i];
            const intermediateStop = stops.find(s => s.id === intermediateStopId);
            
            if (!intermediateStop) continue;

            // Find routes from intermediate stop to destination
            routes.forEach(secondRoute => {
              if (secondRoute.id === firstRoute.id) return; // Skip same route
              if (!routeStops[secondRoute.id]) return;

              const secondRouteStops = routeStops[secondRoute.id];
              const intermediateIndex = secondRouteStops.indexOf(intermediateStopId);
              const toIndex = secondRouteStops.indexOf(toStop.id);

              if (intermediateIndex !== -1 && toIndex !== -1 && intermediateIndex < toIndex) {
                // Found a 2-leg journey!
                const firstLegTime = calculateTravelTime(firstRoute.id, fromStop.id, intermediateStopId) || 15;
                const secondLegTime = calculateTravelTime(secondRoute.id, intermediateStopId, toStop.id) || 15;
                
                const firstVehicleInfo = getVehicleInfo(firstRoute);
                const secondVehicleInfo = getVehicleInfo(secondRoute);
                
                const firstLegFare = calculateFare(firstVehicleInfo.name, firstLegTime);
                const secondLegFare = calculateFare(secondVehicleInfo.name, secondLegTime);

                const journey: MultiLegJourney = {
                  legs: [
                    {
                      route: firstRoute,
                      fromStop: fromStop,
                      toStop: intermediateStop,
                      travelTime: firstLegTime,
                      fare: firstLegFare,
                      vehicleType: firstVehicleInfo.name,
                      vehicleEmoji: firstVehicleInfo.emoji,
                    },
                    {
                      route: secondRoute,
                      fromStop: intermediateStop,
                      toStop: toStop,
                      travelTime: secondLegTime,
                      fare: secondLegFare,
                      vehicleType: secondVehicleInfo.name,
                      vehicleEmoji: secondVehicleInfo.emoji,
                    },
                  ],
                  totalTime: firstLegTime + secondLegTime + 5, // Add 5 min for transfer
                  totalFare: firstLegFare + secondLegFare,
                  fromLocation: fromQuery,
                  toLocation: toQuery,
                };

                journeys.push(journey);
              }
            });
          }
        });
      });
    });

    // Sort by total time (shortest first)
    return journeys
      .slice(0, 5) // Limit to 5 best journeys
      .sort((a, b) => a.totalTime - b.totalTime);
  }, [fromQuery, toQuery, routes, stops, routeTravelTimes, routeStops, calculateFare]);

  // Call AI when both from and to are filled
  useEffect(() => {
    if (fromQuery.trim() && toQuery.trim() && routes.length > 0) {
      const timeoutId = setTimeout(() => {
        getAIRouteSuggestions(fromQuery, toQuery);
      }, 1000); // Debounce for 1 second
      return () => clearTimeout(timeoutId);
    } else {
      setAiSuggestions([]);
    }
  }, [fromQuery, toQuery, routes.length, getAIRouteSuggestions]);

  // Location suggestions disabled - using GPT only

  // Get GPT route suggestions when both locations are filled
  useEffect(() => {
    if (!fromQuery.trim() || !toQuery.trim() || !ENABLE_GPT_SUGGESTIONS) {
      setMapboxVehicles([]);
      return;
    }

    let isCancelled = false;

    const timeoutId = setTimeout(async () => {
      try {
        // Use current location properly - if current location is set, use it; otherwise use fromQuery
        let fromLocation = fromQuery;
        if (currentLocation && currentLocation.name) {
          // If current location name contains "Current Location" or coordinates, use it as-is
          // Otherwise use the stop name if it was found
          if (currentLocation.name.includes('Current Location') || currentLocation.name.includes('📍')) {
            fromLocation = 'Current Location';
          } else {
            // Use the stop name found near current location
            fromLocation = currentLocation.name;
          }
        }
        const vehicles = await getGPTRouteSuggestions(fromLocation, toQuery);
        
        if (!isCancelled) {
          setMapboxVehicles(vehicles || []);
        }
      } catch (error) {
        if (!isCancelled) {
          console.log('Error getting GPT suggestions:', error);
          setMapboxVehicles([]);
        }
      }
    }, 1000); // Debounce for 1 second
    
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fromQuery, toQuery, currentLocation, getGPTRouteSuggestions]);

  // Helper function to check if a vehicle type matches selected filters
  const matchesVehicleFilter = (vehicleType: string | undefined, journey?: MultiLegJourney): boolean => {
    if (!vehicleType) return true;
    
    // Normalize vehicle type names
    const normalizedType = vehicleType.toLowerCase();
    
    // Check if any selected vehicle type matches
    for (const selected of selectedVehicleTypes) {
      const normalizedSelected = selected.toLowerCase();
      if (normalizedType.includes(normalizedSelected) || normalizedSelected.includes(normalizedType)) {
        return true;
      }
      // Handle variations
      if ((normalizedSelected.includes('lrt') && normalizedType.includes('lrt')) ||
          (normalizedSelected.includes('mrt') && normalizedType.includes('mrt')) ||
          (normalizedSelected.includes('jeep') && normalizedType.includes('jeep')) ||
          (normalizedSelected.includes('bus') && normalizedType.includes('bus'))) {
        return true;
      }
    }
    
    // For journeys, check if any leg matches
    if (journey) {
      return journey.legs.some(leg => matchesVehicleFilter(leg.vehicleType));
    }
    
    return false;
  };

  const searchResults = useMemo((): SearchResult[] => {
    const results: SearchResult[] = [];
    
    // If both from and where are filled, show routes that connect them (PRIORITIZE TRANSPORTATION)
    if (fromQuery.trim() && toQuery.trim()) {
      // FIRST PRIORITY: Mapbox vehicle results (actual sasakyan na pwedeng sakyan)
      if (mapboxVehicles.length > 0) {
        mapboxVehicles.forEach(vehicle => {
          if (vehicle && vehicle.data) {
            // Filter by selected vehicle types
            if (vehicle.type === 'journey') {
              const journey = vehicle.data as MultiLegJourney;
              if (matchesVehicleFilter(vehicle.vehicleType, journey)) {
                results.push(vehicle);
              }
            } else if (matchesVehicleFilter(vehicle.vehicleType)) {
              results.push(vehicle);
            }
          }
        });
      }
      
      // Second: AI suggestions if available
      if (aiSuggestions.length > 0) {
        aiSuggestions.forEach(route => {
          if (route && route.id && route.name) {
            // Avoid duplicates from Mapbox vehicles
            if (!mapboxVehicles.some(mv => mv.type === 'route' && (mv.data as Route).id === route.id)) {
              const vehicleInfo = getVehicleInfo(route);
              const vehicleType = vehicleInfo.name;
              
              // Filter by selected vehicle types
              if (matchesVehicleFilter(vehicleType)) {
                const fare = (route as any).aiFare || route.fare || calculateFare((route as any).aiVehicleType || vehicleType, (route as any).aiTime || null);
                const travelTime = (route as any).aiTime || null;
                
                results.push({ 
                  type: 'route', 
                  data: route,
                  travelTime: travelTime || undefined,
                  fare: fare,
                  vehicleType: vehicleType,
                  isAISuggestion: true
                });
              }
            }
          }
        });
      }

      // Only show routes (transportation), not stops
      return results;
    }
    
    // If only "Where" is filled, PRIORITIZE ROUTES over stops
    if (toQuery.trim() && !fromQuery.trim()) {
      const searchTerm = toQuery.toLowerCase();
      
      // FIRST show routes (transportation vehicles)
      routes.forEach(route => {
        if (route && route.name && route.id) {
          const routeName = (route.name || '').toLowerCase();
          const routeDesc = (route.description || '').toLowerCase();
          
          if (routeName.includes(searchTerm) || routeDesc.includes(searchTerm)) {
            const vehicleInfo = getVehicleInfo(route);
            const fare = calculateFare(vehicleInfo.name, null);
            
            results.push({ 
              type: 'route', 
              data: route,
              fare: fare,
              vehicleType: vehicleInfo.name
            });
          }
        }
      });
      
      // THEN show stops only if we have less than 20 route results
      if (results.length < 20) {
        stops.forEach(stop => {
          if (stop && stop.id && stop.name) {
            const stopName = (stop.name || '').toLowerCase();
            if (stopName.includes(searchTerm)) {
              results.push({ type: 'stop', data: stop });
            }
          }
        });
      }
      
      return results.slice(0, 30);
    }
    
    // If only "From" is filled, PRIORITIZE ROUTES over stops
    if (fromQuery.trim() && !toQuery.trim()) {
      const searchTerm = fromQuery.toLowerCase();
      
      // FIRST show routes (transportation vehicles)
      routes.forEach(route => {
        if (route && route.name && route.id) {
          const routeName = (route.name || '').toLowerCase();
          const routeDesc = (route.description || '').toLowerCase();
          
          if (routeName.includes(searchTerm) || routeDesc.includes(searchTerm)) {
            const vehicleInfo = getVehicleInfo(route);
            const fare = calculateFare(vehicleInfo.name, null);
            
            results.push({ 
              type: 'route', 
              data: route,
              fare: fare,
              vehicleType: vehicleInfo.name
            });
          }
        }
      });
      
      // THEN show stops only if we have less than 20 route results
      if (results.length < 20) {
        stops.forEach(stop => {
          if (stop && stop.id && stop.name) {
            const stopName = (stop.name || '').toLowerCase();
            if (stopName.includes(searchTerm)) {
              results.push({ type: 'stop', data: stop });
            }
          }
        });
      }
      
      return results.slice(0, 30);
    }
    
    // If no search, show popular routes (transportation only)
    return routes
      .filter(route => route && route.id && route.name)
      .slice(0, 20)
      .map(route => {
        const vehicleInfo = getVehicleInfo(route);
        const fare = calculateFare(vehicleInfo.name, null);
        return { 
          type: 'route' as const, 
          data: route,
          fare: fare,
          vehicleType: vehicleInfo.name
        };
      });
  }, [fromQuery, toQuery, routes, stops, findRoutes, aiSuggestions, mapboxVehicles, selectedVehicleTypes, matchesVehicleFilter]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Pattern (using Expo Location for current location) */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPattern}>
          <View style={styles.mapShape} />
        </View>
      </View>

      {/* Content Overlay */}
      <View style={styles.contentOverlay}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>sakayan.ph</Text>
          <Text style={styles.tagline}>Find your ride in Metro Manila</Text>
        </View>

        {/* From and To Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchInputContainer}>
              <Text style={styles.searchLabel}>From</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.searchInput, fromFocused && styles.searchInputFocused]}
                  placeholder="Enter your location or tap 📍 for current location"
                  placeholderTextColor="#999"
                  value={fromQuery}
                  onChangeText={setFromQuery}
                  onFocus={() => setFromFocused(true)}
                  onBlur={() => setFromFocused(false)}
                />
                {gettingLocation && (
                  <ActivityIndicator size="small" color="#DC143C" style={styles.inputLoader} />
                )}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.locationButton, gettingLocation && styles.locationButtonDisabled]}
              onPress={getCurrentLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.locationButtonText}>📍</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchInputContainer}>
              <Text style={styles.searchLabel}>Where</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.searchInput, toFocused && styles.searchInputFocused]}
                  placeholder="Where do you want to go?"
                  placeholderTextColor="#999"
                  value={toQuery}
                  onChangeText={setToQuery}
                  onFocus={() => setToFocused(true)}
                  onBlur={() => setToFocused(false)}
                />
              </View>
            </View>
            <TouchableOpacity
              style={[styles.destinationButton, !toQuery && styles.destinationButtonDisabled]}
              onPress={() => {
                // Clear destination
                setToQuery('');
              }}
              disabled={!toQuery}
            >
              {toQuery ? (
                <Text style={styles.destinationButtonText}>✕</Text>
              ) : (
                <Text style={styles.destinationButtonText}>🎯</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Vehicle Type Filter */}
        {fromQuery && toQuery && (
          <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Choose Vehicle Type:</Text>
            <View style={styles.filterButtons}>
              {['Jeepney', 'Bus', 'LRT 1', 'LRT 2', 'MRT 3'].map((vehicleType) => {
                const isSelected = selectedVehicleTypes.has(vehicleType);
                const emoji = vehicleType.includes('LRT 1') ? '🚇' : 
                             vehicleType.includes('LRT 2') ? '🚇' : 
                             vehicleType.includes('MRT') ? '🚆' : 
                             vehicleType.includes('Bus') ? '🚌' : '🚐';
                return (
                  <TouchableOpacity
                    key={vehicleType}
                    style={[styles.filterButton, isSelected && styles.filterButtonSelected]}
                    onPress={() => {
                      const newSet = new Set(selectedVehicleTypes);
                      if (isSelected) {
                        newSet.delete(vehicleType);
                        // Don't allow deselecting all
                        if (newSet.size > 0) {
                          setSelectedVehicleTypes(newSet);
                        }
                      } else {
                        newSet.add(vehicleType);
                        setSelectedVehicleTypes(newSet);
                      }
                    }}
                  >
                    <Text style={[styles.filterButtonText, isSelected && styles.filterButtonTextSelected]}>
                      {emoji} {vehicleType}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Results Section */}
        <ScrollView style={styles.resultsContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>
            {fromQuery && toQuery
              ? `🚌 Available Transportation (${searchResults.filter(r => r.type === 'route' || r.type === 'journey').length})`
              : toQuery && !fromQuery
              ? `🚌 Transportation to: ${toQuery}`
              : fromQuery && !toQuery
              ? `🚌 Transportation from: ${fromQuery}`
              : '🚌 Popular Transportation Routes'}
          </Text>
          
          {fromQuery && toQuery && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📍 From: {fromQuery}
              </Text>
              <Text style={styles.infoText}>
                🎯 Where: {toQuery}
              </Text>
              {(loadingAI || loadingMapboxVehicles) ? (
                <View style={styles.aiLoadingContainer}>
                  <ActivityIndicator size="small" color="#DC143C" />
                  <Text style={styles.infoSubtext}>
                    {loadingMapboxVehicles ? 'Finding routes...' : 'Finding best routes...'}
                  </Text>
                </View>
              ) : searchResults.filter(r => r.type === 'route' || r.type === 'journey').length > 0 ? (
                <Text style={styles.infoSubtext}>
                  Found {searchResults.filter(r => r.type === 'route' || r.type === 'journey').length} transportation option(s) you can take
                  {aiSuggestions.length > 0 && (
                    <Text style={styles.aiInfoText}> • {aiSuggestions.length} AI suggestions</Text>
                  )}
                </Text>
              ) : (
                <Text style={styles.infoSubtext}>
                  No direct routes found. Try different locations.
                </Text>
              )}
            </View>
          )}
          
          {toQuery && !fromQuery && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                🎯 Where: {toQuery}
              </Text>
              <Text style={styles.infoSubtext}>
                Select a destination, then we'll find routes from your location
              </Text>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#DC143C" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : !Array.isArray(searchResults) || searchResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>Try different search terms</Text>
            </View>
          ) : (
            searchResults
              .filter(result => {
                if (!result || !result.data) return false;
                if (result.type === 'journey') return true;
                return (result.data as Route | Stop).id;
              })
              .map((result, index) => {
                if (result.type === 'journey') {
                  const journey = result.data as MultiLegJourney;
                  
                  return (
                    <TouchableOpacity
                      key={`journey-${index}`}
                      style={styles.journeyCard}
                      onPress={() => {
                        console.log('Selected journey:', journey);
                      }}
                    >
                      <View style={styles.journeyHeader}>
                        <Text style={styles.journeyTitle}>🔄 Journey with Transfer</Text>
                        <View style={styles.journeyBadges}>
                          <View style={styles.timeBadge}>
                            <Text style={styles.timeText}>⏱️ {journey.totalTime} min</Text>
                          </View>
                          <View style={styles.fareBadge}>
                            <Text style={styles.fareText}>₱{journey.totalFare}</Text>
                          </View>
                        </View>
                      </View>
                      
                      <View style={styles.journeySteps}>
                        {journey.legs.map((leg, legIndex) => (
                          <View key={legIndex} style={styles.journeyStep}>
                            <View style={styles.stepNumber}>
                              <Text style={styles.stepNumberText}>{legIndex + 1}</Text>
                            </View>
                            <View style={styles.stepContent}>
                              <View style={styles.stepHeader}>
                                <Text style={styles.stepVehicle}>
                                  {leg.vehicleEmoji} {leg.vehicleType} - {leg.route.name}
                                </Text>
                              </View>
                              <Text style={styles.stepRoute}>
                                From: {leg.fromStop.name}
                              </Text>
                              <Text style={styles.stepRoute}>
                                To: {leg.toStop.name}
                              </Text>
                              <View style={styles.stepFooter}>
                                <Text style={styles.stepTime}>⏱️ {leg.travelTime} min</Text>
                                <Text style={styles.stepFare}>₱{leg.fare}</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                      
                      {journey.legs.length > 1 && (
                        <View style={styles.transferNote}>
                          <Text style={styles.transferNoteText}>
                            ⚠️ Transfer time: ~5 minutes
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                } else if (result.type === 'route') {
                  const route = result.data as Route;
                  if (!route || !route.id || !route.name) return null;
                  
                  const vehicleInfo = getVehicleInfo(route);
                  const vehicleEmoji = vehicleInfo.emoji;
                  const vehicleName = result.vehicleType || vehicleInfo.name;
                  
                  return (
                    <TouchableOpacity
                      key={`route-${route.id}-${index}`}
                      style={styles.resultCard}
                      onPress={() => {
                        console.log('Selected route:', route.name);
                      }}
                    >
                      <View style={styles.resultHeader}>
                        <View style={styles.routeTitleContainer}>
                          <Text style={styles.vehicleEmoji}>{vehicleEmoji}</Text>
                          <View style={styles.routeTitleText}>
                            <Text style={styles.resultName} numberOfLines={2}>{route.name || 'Unknown Route'}</Text>
                            <Text style={styles.vehicleTypeText} numberOfLines={1}>{vehicleName}</Text>
                          </View>
                        </View>
                        {route.shortName && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{route.shortName}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.resultDescription}>
                        {route.description || route.type || 'Route'} • {route.agency || 'Unknown'}
                      </Text>
                      <View style={styles.routeFooter}>
                        <View style={styles.resultTypeBadge}>
                          <Text style={styles.resultTypeText}>Route</Text>
                        </View>
                        <View style={styles.footerBadges}>
                          {result.isAISuggestion && (
                            <View style={styles.aiBadge}>
                              <Text style={styles.aiBadgeText}>AI</Text>
                            </View>
                          )}
                          {result.travelTime && (
                            <View style={styles.timeBadge}>
                              <Text style={styles.timeText}>⏱️ {result.travelTime} min</Text>
                            </View>
                          )}
                          {result.fare && (
                            <View style={styles.fareBadge}>
                              <Text style={styles.fareText}>₱{result.fare}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                } else {
                  const stop = result.data as Stop;
                  if (!stop || !stop.id || !stop.name) return null;
                  
                  return (
                    <TouchableOpacity
                      key={`stop-${stop.id}-${index}`}
                      style={styles.resultCard}
                      onPress={() => {
                        if (!fromQuery) {
                          setFromQuery(stop.name);
                        } else if (!toQuery) {
                          setToQuery(stop.name);
                        }
                      }}
                    >
                      <View style={styles.resultHeader}>
                        <Text style={styles.resultName}>{stop.name || 'Unknown Stop'}</Text>
                      </View>
                      {stop.description && (
                        <Text style={styles.resultDescription}>{stop.description}</Text>
                      )}
                      <View style={styles.resultTypeBadge}>
                        <Text style={styles.resultTypeText}>Stop</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
              })
              .filter(item => item !== null)
          )}
        </ScrollView>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => {
            // Scroll to top or reset search
            setFromQuery('');
            setToQuery('');
          }}
        >
          <Text style={styles.footerButtonIcon}>🏠</Text>
          <Text style={styles.footerButtonText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => setShowDonationModal(true)}
        >
          <Text style={styles.footerButtonIcon}>💝</Text>
          <Text style={styles.footerButtonText}>Donation</Text>
        </TouchableOpacity>
      </View>

      {/* Donation Modal */}
      <Modal
        visible={showDonationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDonationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Support sakayan.ph</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowDonationModal(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalDescription}>
              Your donation helps us improve and maintain sakayan.ph for everyone in Metro Manila.
            </Text>
            
            <View style={styles.qrCodeContainer}>
              <Image
                source={require('@/assets/images/icon.png')} // Placeholder - replace with your QR code image
                style={styles.qrCodeImage}
                resizeMode="contain"
              />
              <Text style={styles.qrCodeNote}>
                Scan this QR code to donate
              </Text>
            </View>
            
            <Text style={styles.modalFooter}>
              Thank you for your support! 🙏
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  mapView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mapPattern: {
    width: '80%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: '10%',
  },
  mapShape: {
    width: 200,
    height: 300,
    borderWidth: 2,
    borderColor: '#DC143C',
    borderRadius: 20,
    opacity: 0.3,
    transform: [{ rotate: '10deg' }],
  },
  contentOverlay: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },
  filterContainer: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
  },
  filterButtonSelected: {
    backgroundColor: '#DC143C',
    borderColor: '#DC143C',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  filterButtonTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#DC143C',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  searchSection: {
    marginBottom: 30,
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  searchInputContainer: {
    flex: 1,
  },
  searchLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 4,
    fontWeight: '600',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    fontSize: 16,
    flex: 1,
  },
  searchInputFocused: {
    borderColor: '#DC143C',
    borderWidth: 2,
  },
  inputLoader: {
    position: 'absolute',
    right: 12,
  },
  locationButton: {
    backgroundColor: '#DC143C',
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationButtonDisabled: {
    opacity: 0.6,
  },
  locationButtonText: {
    fontSize: 20,
  },
  destinationButton: {
    backgroundColor: '#DC143C',
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationButtonDisabled: {
    opacity: 0.5,
  },
  destinationButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  resultsContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#DC143C',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  routeTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  vehicleEmoji: {
    fontSize: 24,
  },
  routeTitleText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0, // Allow text to shrink properly
  },
  resultName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  vehicleTypeText: {
    fontSize: 12,
    color: '#CCCCCC',
    opacity: 0.8,
    marginTop: 2,
    textAlign: 'left',
  },
  resultDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    opacity: 0.7,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#333333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  resultTypeText: {
    color: '#CCCCCC',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  routeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  footerBadges: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  aiBadge: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  aiBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  aiInfoText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
  },
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeBadge: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fareBadge: {
    backgroundColor: '#28A745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  fareText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#CCCCCC',
    fontSize: 14,
    opacity: 0.7,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC143C',
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoSubtext: {
    color: '#CCCCCC',
    fontSize: 12,
    opacity: 0.7,
  },
  journeyCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
  },
  journeyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  journeyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  journeyBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  journeySteps: {
    gap: 12,
  },
  journeyStep: {
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
    backgroundColor: '#252525',
    padding: 12,
    borderRadius: 6,
  },
  stepHeader: {
    marginBottom: 6,
  },
  stepVehicle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stepRoute: {
    fontSize: 12,
    color: '#CCCCCC',
    opacity: 0.8,
    marginBottom: 4,
  },
  stepFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  stepTime: {
    fontSize: 11,
    color: '#DC143C',
    fontWeight: '600',
  },
  stepFare: {
    fontSize: 11,
    color: '#28A745',
    fontWeight: '600',
  },
  transferNote: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
  },
  transferNoteText: {
    fontSize: 11,
    color: '#FFA500',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  footerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  footerButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  footerButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  qrCodeImage: {
    width: 250,
    height: 250,
    marginBottom: 12,
  },
  qrCodeNote: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
    textAlign: 'center',
  },
  modalFooter: {
    fontSize: 16,
    color: '#DC143C',
    fontWeight: '600',
    textAlign: 'center',
  },
});
