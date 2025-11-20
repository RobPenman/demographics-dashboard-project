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
const PUBLIC_COLLECTION_PATH = `/artifacts/${appId}/public/data/demographics`;
// Path to the primary document to hold the aggregated data
const AGGREGATE_DOC_PATH = `${PUBLIC_COLLECTION_PATH}/aggregatedData`;

const App = () => {
  // State for Firebase services
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // State for application data and status
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("Initializing dashboard...");
  const [error, setError] = useState(null);

  // 1. Firebase Initialization and Authentication Effect
  useEffect(() => {
    // Check for a dummy config object if running outside Canvas
    if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        // Fallback for local development: Replace this with your actual Firebase config object
        const localFirebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_AUTH_DOMAIN",
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_STORAGE_BUCKET",
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        // If still missing (i.e., you didn't update the placeholder), display error
        if (localFirebaseConfig.apiKey === "YOUR_API_KEY") {
            setError("Firebase configuration is missing or placeholder values are present. Please update `localFirebaseConfig` in src/DemographicsDashboard.jsx.");
            return;
        }
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const userAuth = getAuth(app);
      
      setDb(firestore);
      setAuth(userAuth);
      
      // Attempt sign in with custom token or anonymously
      const signIn = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(userAuth, initialAuthToken);
          } else {
            await signInAnonymously(userAuth);
          }
        } catch (e) {
          console.error("Authentication failed:", e);
          // Only set user ID if sign-in fails
          setUserId('unauthenticated-user'); 
        }
      };

      signIn();

      // Listener for Auth State Changes
      const unsubscribe = onAuthStateChanged(userAuth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // If sign-in failed or user signed out, use a temporary ID if not already set
          setUserId(userAuth.currentUser?.uid || crypto.randomUUID());
        }
        setIsAuthReady(true);
        setLoadingMessage("Connecting to public data...");
      });

      return () => unsubscribe();

    } catch (e) {
      console.error("Firebase Initialization Error:", e);
      setError("Failed to initialize Firebase services.");
    }
  }, []);

  // 2. Data Fetching Effect (Dependent on Auth Readiness)
  useEffect(() => {
    // Guard clause: Only proceed if Firebase is initialized and Auth is ready
    if (!db || !isAuthReady) return;

    // Use a clean-up function for onSnapshot
    let unsubscribe = () => {};

    try {
      const docRef = doc(db, AGGREGATE_DOC_PATH);

      // Set up real-time listener for the public document
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setDashboardData(docSnap.data());
          setLoadingMessage("Data loaded successfully.");
        } else {
          // If the document doesn't exist, show a message but don't error out
          setDashboardData({}); 
          setLoadingMessage("No aggregated data found yet. Please wait for initial setup.");
        }
      }, (err) => {
        console.error("Firestore Snapshot Error:", err);
        setError("Failed to fetch dashboard data. Check database permissions.");
      });

    } catch (e) {
      console.error("Firestore Setup Error:", e);
      setError("A critical error occurred while setting up data listener.");
    }

    // Clean up the listener when the component unmounts or dependencies change
    return () => unsubscribe();
  }, [db, isAuthReady]);

  // --- Utility Functions and Calculated Values ---

  const formatNumber = (num) => {
    if (num === undefined || num === null) return 'N/A';
    return num.toLocaleString();
  };

  const calculateTotal = (key) => {
    if (!dashboardData || !dashboardData[key]) return 0;
    return Object.values(dashboardData[key]).reduce((sum, count) => sum + count, 0);
  };

  // Memoized values for the main cards
  const totalPopulation = useMemo(() => calculateTotal('populationByRegion'), [dashboardData]);
  const avgIncome = useMemo(() => dashboardData?.averageIncome || 0, [dashboardData]);
  const topRegion = useMemo(() => {
    if (!dashboardData || !dashboardData.populationByRegion) return 'N/A';
    const entries = Object.entries(dashboardData.populationByRegion);
    if (entries.length === 0) return 'N/A';
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }, [dashboardData]);

  // --- Data Visualization Components ---

  const StatCard = ({ icon: Icon, title, value, className = "" }) => (
    <div className={`p-5 bg-white rounded-xl shadow-lg transition duration-300 hover:shadow-xl ${className}`}>
      <div className="flex items-center space-x-4">
        <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
      </div>
    </div>
  );

  const DataChart = ({ title, data, Icon }) => {
    const dataEntries = data ? Object.entries(data).sort((a, b) => b[1] - a[1]) : [];
    const total = dataEntries.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return (
      <div className="p-6 bg-white rounded-xl shadow-lg h-96 flex flex-col items-center justify-center">
        <Icon className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500 mt-3">No data available for this chart.</p>
      </div>
    );

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg h-96 flex flex-col">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <Icon className="w-5 h-5 mr-2 text-indigo-500" />
          {title}
        </h2>
        <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
          {dataEntries.map(([label, count]) => {
            const percentage = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={label} className="flex flex-col">
                <div className="flex justify-between text-sm font-medium text-gray-600 mb-1">
                  <span>{label}</span>
                  <span>{formatNumber(count)} ({percentage.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-indigo-600 h-2.5 rounded-full" 
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

  // --- Rendering Logic ---

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto mt-10 bg-red-50 rounded-xl shadow-xl text-center">
        <h1 className="text-2xl font-bold text-red-700">Application Error</h1>
        <p className="mt-4 text-red-600">{error}</p>
        <p className="mt-2 text-sm text-red-500">
          Please check your console for detailed configuration or permission errors.
        </p>
      </div>
    );
  }

  // Show a generic loading state while Firebase initialization and auth are pending
  if (!isAuthReady || !db || dashboardData === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center p-8 bg-white rounded-xl shadow-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-lg font-medium text-gray-600">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  // Main Dashboard Content
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">
            Global Demographics Public Review
          </h1>
          <p className="text-lg text-gray-600">
            Real-time aggregated data sourced from citizen contributions.
          </p>
        </header>

        {/* User ID for identification - MANDATORY for multi-user apps */}
        <div className="mb-6 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-800 break-words">
            Current User ID: <span className="font-mono font-semibold">{userId}</span>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            icon={LucideUsers}
            title="Total Reported Population"
            value={formatNumber(totalPopulation)}
          />
          <StatCard
            icon={LucideDollarSign}
            title="Average Reported Income"
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
            title="Active Data Contributors"
            // Display total number of data keys collected
            value={formatNumber(Object.keys(dashboardData.populationByRegion || {}).length)}
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