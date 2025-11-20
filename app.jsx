import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, query } from 'firebase/firestore';
import { LucideBarChart3, LucideUsers, LucideTarget, LucideMapPin, LucideDollarSign } from 'lucide-react';

// NOTE: When running this code outside of the Gemini/Canvas environment, 
// you will need to manually replace the '__app_id', '__firebase_config', and 
// '__initial_auth_token' variables with actual configuration values 
// or set them as environment variables (e.g., in a .env file).

// --- Global Variables Access (Canvas Environment) ---
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// FIX: Sanitize the rawAppId to ensure it is treated as a single document ID,
// replacing path separators ('/') and dots ('.') that might be in the filename.
const appId = rawAppId.replace(/\//g, '__').replace(/\./g, '-');

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The main collection path for public data
const PUBLIC_COLLECTION_PATH = `/artifacts/${appId}/public/data/dashboard`;

// --- Utility Functions ---

// Simple number formatting utility
const formatNumber = (num) => {
  if (num === null || isNaN(num)) return 'N/A';
  return new Intl.NumberFormat('en-US').format(num);
};

// --- Component Definitions ---

/**
 * StatCard component for displaying key metrics.
 */
const StatCard = ({ icon: Icon, title, value, className = '' }) => (
  <div className={`p-5 bg-white rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl ${className}`}>
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <Icon className="w-5 h-5 text-indigo-500" />
    </div>
    <p className="mt-1 text-3xl font-bold text-gray-900 truncate">
      {value}
    </p>
  </div>
);

/**
 * Bar Chart Visualization Component (using simple HTML/CSS bars for visualization)
 */
const DataChart = ({ title, data, Icon }) => {
  const dataEntries = useMemo(() => Object.entries(data || {}), [data]);

  const total = dataEntries.reduce((sum, [, value]) => sum + value, 0);

  // Sort data entries by value in descending order
  const sortedEntries = useMemo(() => 
    dataEntries.sort(([, a], [, b]) => b - a), [dataEntries]
  );
  
  if (sortedEntries.length === 0) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 flex flex-col items-center justify-center min-h-80">
        <Icon className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-lg font-semibold text-gray-700">{title}</p>
        <p className="text-sm text-gray-500">No data available for this chart.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
      <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
        <Icon className="w-5 h-5 text-indigo-500 mr-2" />
        {title}
      </h2>
      <div className="space-y-4">
        {sortedEntries.map(([label, value], index) => {
          const percentage = total > 0 ? (value / total) * 100 : 0;
          
          let colorClass;
          if (index < 1) colorClass = 'bg-indigo-500';
          else if (index < 2) colorClass = 'bg-indigo-400';
          else colorClass = 'bg-indigo-300';
          
          return (
            <div key={label}>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{label}</span>
                <span className="font-medium text-gray-800">{formatNumber(value)} ({percentage.toFixed(1)}%)</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div 
                  className={`h-full rounded-full ${colorClass} transition-all duration-1000 ease-out`} 
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


/**
 * Main Application Component (App)
 */
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    populationByRegion: {},
    incomeDistribution: {},
    rawEntries: []
  });
  const [error, setError] = useState(null);

  // 1. Initialize Firebase and Handle Authentication
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        throw new Error("Firebase configuration is missing.");
      }
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      
      setDb(firestore);
      setAuth(authInstance);

      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (!user) {
          // If no user is signed in (e.g., initial load or signed out), sign in anonymously
          console.log("No user found, attempting anonymous sign-in...");
          if (initialAuthToken) {
            // Use custom token if available (Canvas environment)
            await signInWithCustomToken(authInstance, initialAuthToken);
          } else {
             // Fallback to standard anonymous sign-in
            await signInAnonymously(authInstance);
          }
        }
        // Set user ID once we have an authenticated user (either custom or anonymous)
        setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
        console.log("Authentication complete. User ID:", authInstance.currentUser?.uid);
      });

      // Cleanup subscription on component unmount
      return () => unsubscribe();

    } catch (e) {
      console.error("Firebase Initialization or Auth Error:", e);
      setError("Failed to initialize Firebase or authenticate.");
    }
  }, [initialAuthToken]); // Reruns if the token changes

  // 2. Fetch and Aggregate Data (Real-time with onSnapshot)
  useEffect(() => {
    // Only proceed if auth is ready and we have a database instance
    if (!isAuthReady || !db) return;

    const dataDocRef = doc(db, PUBLIC_COLLECTION_PATH, "current_data");
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(dataDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        console.log("Real-time data received:", data);
        setDashboardData({
          populationByRegion: data.populationByRegion || {},
          incomeDistribution: data.incomeDistribution || {},
          rawEntries: data.rawEntries || []
        });
        setError(null);
      } else {
        console.log("No dashboard data document found.");
        setDashboardData({ populationByRegion: {}, incomeDistribution: {}, rawEntries: [] });
      }
    }, (err) => {
      console.error("Firestore snapshot error:", err);
      setError("Error loading data from Firestore. Check security rules and network connection.");
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, [isAuthReady, db]);

  // --- Data Calculations ---
  
  // Memoize all complex calculations
  const { totalPopulation, avgIncome, topRegion } = useMemo(() => {
    const { populationByRegion, incomeDistribution } = dashboardData;

    // Total Population
    const totalPop = Object.values(populationByRegion).reduce((sum, value) => sum + value, 0);

    // Average Income (Weighted average based on income brackets)
    // NOTE: This assumes incomeDistribution keys are bracket labels (e.g., "0-25k") and values are counts.
    // For a real calculation, we'd need the actual income values or bracket midpoints.
    // For this example, we'll use a simple count of entries as a proxy for "total reported entries."
    const totalEntries = Object.values(incomeDistribution).reduce((sum, count) => sum + count, 0);
    
    // Simple mock average calculation: Sum of all data point values divided by count of entries.
    // This is a highly simplified assumption for visualization.
    let totalValue = 0; 
    let mockIncomeMidpoints = {
      '0-25k': 12500,
      '25k-50k': 37500,
      '50k-75k': 62500,
      '75k-100k': 87500,
      '100k+': 150000 // Using a high estimate
    };

    Object.entries(incomeDistribution).forEach(([bracket, count]) => {
      const midpoint = mockIncomeMidpoints[bracket] || 0;
      totalValue += midpoint * count;
    });

    const avgInc = totalEntries > 0 ? totalValue / totalEntries : 0;

    // Top Populated Region
    const regionEntries = Object.entries(populationByRegion);
    let topRegionName = 'N/A';
    if (regionEntries.length > 0) {
      const [name] = regionEntries.reduce((a, b) => (a[1] > b[1] ? a : b));
      topRegionName = name;
    }

    return {
      totalPopulation: totalPop,
      avgIncome: avgInc,
      topRegion: topRegionName,
    };
  }, [dashboardData]);


  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="p-8 bg-red-100 border border-red-400 rounded-xl shadow-lg text-center">
          <h2 className="text-xl font-bold text-red-700 mb-4">Application Error</h2>
          <p className="text-red-600">{error}</p>
          <p className="mt-2 text-sm text-red-500">Please check the console for details.</p>
        </div>
      </div>
    );
  }

  // Show a loading state while fetching data/authenticating
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded-full bg-indigo-500 animate-bounce"></div>
          <div className="w-4 h-4 rounded-full bg-indigo-500 animate-bounce delay-75"></div>
          <div className="w-4 h-4 rounded-full bg-indigo-500 animate-bounce delay-150"></div>
          <span className="text-lg font-medium text-gray-700">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Demographics Dashboard
          </h1>
          <div className="text-sm font-mono text-gray-600 p-2 bg-gray-100 rounded-md shadow-sm">
            User ID: <span className="font-bold">{userId}</span>
          </div>
        </header>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            icon={LucideUsers}
            title="Total Reported Population"
            value={formatNumber(totalPopulation)}
          />
          <StatCard
            icon={LucideDollarSign}
            title="Average Reported Income"
            // Displaying a currency value
            value={`$${formatNumber(avgIncome.toFixed(2))}`}
          />
          <StatCard
            icon={LucideMapPin}
            title="Highest Populated Region"
            value={topRegion}
            className="col-span-1"
          />
          <StatCard
            icon={LucideTarget}
            title="Total Data Entries"
            // Display total number of raw entries collected
            value={formatNumber(dashboardData.rawEntries.length)}
          />
        </div>

        {/* Detailed Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <DataChart
            title="Population Distribution by Region"
            data={dashboardData.populationByRegion}
            Icon={LucideBarChart3}
          />
          <DataChart
            title="Income Distribution by Bracket"
            data={dashboardData.incomeDistribution}
            Icon={LucideDollarSign}
          />
        </div>
        
      </div>
    </div>
  );
};

export default App;