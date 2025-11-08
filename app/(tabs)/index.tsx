import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Route {
  id: string;
  name: string;
  shortName: string;
  description: string;
  agency: string;
  type: string;
}

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = () => {
    // Popular Metro Manila routes
    const popularRoutes: Route[] = [
      { id: 'ROUTE_880747', name: 'LRT 1: Baclaran - Roosevelt', shortName: 'LRT 1', description: 'Urban railway line serving 20 stations between Baclaran and Roosevelt', agency: 'LRTA', type: 'Rail' },
      { id: 'ROUTE_880801', name: 'LRT 2: Recto - Santolan', shortName: 'LRT 2', description: 'Light rail line serving 11 stations between Recto and Santolan', agency: 'LRTA', type: 'Rail' },
      { id: 'LTFRB_PUB1003', name: 'Alabang - Fairview', shortName: '', description: 'South Luzon Expressway to SM Public Transport Terminal', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1007', name: 'Alabang - Lawton via Zapote Coastal Rd', shortName: '', description: 'Alabang-Zapote Road to Taft Ave, Manila', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1009', name: 'Alabang - Malabon (Letre) via EDSA', shortName: '', description: 'South Luzon Expressway to MMDA Navotos Bus Terminal', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1011', name: 'Alabang - Malanday', shortName: '', description: 'South Luzon Expressway to ET Pacific, MacArthur Highway', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1013', name: 'Ayala - Dasmarinas (Cavite) via Coastal Rd', shortName: '', description: 'Governor\'s Drive to MRT-3 Ayala Station', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1017', name: 'Ayala - Malabon via EDSA', shortName: '', description: 'MRT-3 Ayala Station to Circumferential Road 4, Malabon City', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1019', name: 'Ayala - Monumento via EDSA', shortName: '', description: 'MRT-3 Ayala Station to Epifanio de los Santos Avenue', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1021', name: 'Ayala - NAIA', shortName: '', description: 'Natalia, Parañaque City to MRT-3 Ayala Station', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1025', name: 'Ayala - Quiapo via Kamagong Taft', shortName: '', description: 'Paseo de Roxas to Quezon Blvd, Manila', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1029', name: 'Baclaran - Malabon (Letre) via EDSA', shortName: '', description: 'Roxas Blvd to Circumferential Road 4, Malabon City', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1031', name: 'Baclaran - Malanday via EDSA', shortName: '', description: 'Roxas Blvd to Mercury Drug Store, MacArthur Highway', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1033', name: 'Baclaran - Monumento via EDSA', shortName: '', description: 'Roxas Blvd to Epifanio de los Santos Avenue', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1035', name: 'Baclaran - Navotas via Ayala', shortName: '', description: 'Roxas Blvd to MMDA Navotos Bus Terminal', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1037', name: 'Baclaran - Novaliches via EDSA Quirino', shortName: '', description: 'Natalia, Parañaque City to SM Cinema, Quirino Highway', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1039', name: 'Baclaran - SJDM via Commonwealth EDSA', shortName: '', description: 'Roxas Blvd to Dr Eduardo V. Roquero Sr. Rd', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1041', name: 'Baclaran - SM Fairview via Lagro', shortName: '', description: 'Maria, Parañaque City to SM Public Transport Terminal', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1045', name: 'Leveriza - Monumento', shortName: '', description: 'Senator Gil Puyat Ave to Epifanio de los Santos Avenue', agency: 'LTFRB', type: 'Bus' },
      { id: 'LTFRB_PUB1047', name: 'Navotas Terminal - Pacita Complex via EDSA', shortName: '', description: 'National Highway to Circumferential Road 4, Malabon City', agency: 'LTFRB', type: 'Bus' },
    ];
    
    setRoutes(popularRoutes);
    setLoading(false);
  };

  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) {
      return routes.slice(0, 20); // Show first 20 if no search
    }
    
    const query = searchQuery.toLowerCase();
    return routes.filter(route => 
      route.name.toLowerCase().includes(query) ||
      route.description.toLowerCase().includes(query) ||
      route.shortName.toLowerCase().includes(query)
    ).slice(0, 20);
  }, [routes, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Philippines Map Background Pattern */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPattern}>
          {/* Simple geometric pattern representing Philippines map outline */}
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

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search routes, stops, or destinations..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={() => {
              // Search is handled by filteredRoutes automatically
            }}
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Routes Section */}
        <ScrollView style={styles.routesContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>
            {searchQuery ? `Search Results (${filteredRoutes.length})` : 'Popular Routes'}
          </Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#DC143C" />
              <Text style={styles.loadingText}>Loading routes...</Text>
            </View>
          ) : filteredRoutes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No routes found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          ) : (
            filteredRoutes.map((route) => (
              <TouchableOpacity 
                key={route.id} 
                style={styles.routeCard}
                onPress={() => {
                  // Handle route selection
                  console.log('Selected route:', route.name);
                }}
              >
                <View style={styles.routeHeader}>
                  <Text style={styles.routeName}>{route.name}</Text>
                  {route.shortName && (
                    <View style={styles.routeBadge}>
                      <Text style={styles.routeBadgeText}>{route.shortName}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.routeDescription}>
                  {route.description || route.type} • {route.agency}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
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
    opacity: 0.15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPattern: {
    width: '80%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
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
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  routesContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  routeCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#DC143C',
  },
  routeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  routeDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    opacity: 0.7,
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  routeBadge: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  routeBadgeText: {
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
});
