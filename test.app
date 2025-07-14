import React, { useState, useEffect, useRef } from 'react';

// Main App component
function App() {
    // State variables for app functionality
    const [response, setResponse] = useState("Welcome to Wildfire Watcher. How can I assist you today?");
    const [speaking, setSpeaking] = useState(false);
    const [speechError, setSpeechError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [location, setLocation] = useState(null); // { lat: number, lon: number }
    const [queryText, setQueryText] = useState(""); // For text-based queries

    // Refs for browser APIs
    const synthRef = useRef(window.speechSynthesis);
    const voicesRef = useRef([]); // To store available voices
    const videoRef = useRef(null); // For camera stream
    const canvasRef = useRef(null); // For capturing camera frame
    const hasSpokenWelcome = useRef(false); // To ensure welcome message is spoken only once

    // --- Speech Synthesis Functions ---
    const speakText = (text) => {
        if (!synthRef.current) {
            console.error("SpeechSynthesis API not available.");
            setSpeechError(true);
            return;
        }

        // Ensure voices are loaded before attempting to speak
        if (voicesRef.current.length === 0) {
            console.warn("SpeechSynthesis voices not loaded yet. Cannot speak.");
            setSpeechError(true); // Indicate a temporary speech issue
            return;
        }

        if (synthRef.current.speaking) {
            synthRef.current.cancel(); // Stop current speech if any
        }
        
        setSpeechError(false); // Reset error state on new attempt

        const utterance = new SpeechSynthesisUtterance(text);

        // Try to set a preferred English voice if available
        const englishVoice = voicesRef.current.find(
            (voice) => voice.lang.startsWith('en-')
        );
        utterance.voice = englishVoice || voicesRef.current[0];


        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            setSpeaking(false);
            setSpeechError(true);
        };

        // Add a small delay for better browser compatibility
        setTimeout(() => {
            try {
                synthRef.current.speak(utterance);
            } catch (e) {
                console.error("Error calling speechSynthesis.speak:", e);
                setSpeaking(false);
                setSpeechError(true);
            }
        }, 100);
    };

    // --- Initial Setup (Welcome message, Voice loading) ---
    useEffect(() => {
        if (!('speechSynthesis' in window)) {
            setResponse("Speech synthesis not supported in this browser. Please use a different browser.");
            setSpeechError(true);
            console.error("SpeechSynthesis API not supported in this browser.");
            return;
        }

        const loadVoicesAndSpeak = () => {
            voicesRef.current = synthRef.current.getVoices();
            console.log("SpeechSynthesis voices loaded:", voicesRef.current.length);
            if (voicesRef.current.length > 0) {
                // Speak the welcome message only if not already spoken, not speaking, and no prior error
                // This ensures it only speaks once on initial load after voices are ready
                if (!speaking && !speechError && !hasSpokenWelcome.current) {
                    speakText(response);
                    hasSpokenWelcome.current = true; // Mark as spoken
                }
                // Remove the event listener after voices are loaded and initial speech attempt
                synthRef.current.removeEventListener('voiceschanged', loadVoicesAndSpeak);
            }
        };

        // Check if voices are already loaded
        if (synthRef.current.getVoices().length > 0) {
            loadVoicesAndSpeak(); // Voices are available immediately
        } else {
            // If not, wait for voices to be loaded
            synthRef.current.addEventListener('voiceschanged', loadVoicesAndSpeak);
        }

        // Cleanup listener on unmount
        return () => {
            if (synthRef.current) {
                synthRef.current.removeEventListener('voiceschanged', loadVoicesAndSpeak);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Geolocation Function ---
    const handleGetLocation = () => {
        if (navigator.geolocation) {
            setLoading(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lon: longitude });
                    const msg = `Location acquired: Latitude ${latitude.toFixed(4)}, Longitude ${longitude.toFixed(4)}.`;
                    setResponse(msg);
                    speakText(msg);
                    setLoading(false);
                },
                (error) => {
                    console.error("Error getting location:", error);
                    const msg = "Could not get your location. Please ensure location services are enabled.";
                    setResponse(msg);
                    speakText(msg);
                    setLoading(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            const msg = "Geolocation is not supported by your browser.";
            setResponse(msg);
            speakText(msg);
        }
    };

    // --- Camera & Image Upload Functions ---
    const startCamera = async () => {
        if (videoRef.current && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setImagePreview(null); // Clear previous image preview
                const msg = "Camera active. Point at vegetation or horizon and capture.";
                setResponse(msg);
                speakText(msg);
            } catch (err) {
                console.error("Error accessing camera:", err);
                const msg = "Could not access camera. Please check permissions.";
                setResponse(msg);
                speakText(msg);
            }
        } else {
            const msg = "Camera access not supported by your browser.";
            setResponse(msg);
            speakText(msg);
        }
    };

    const captureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Stop camera stream
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }

            const imageDataUrl = canvas.toDataURL('image/png');
            setImagePreview(imageDataUrl);
            const msg = "Image captured. Ready for analysis.";
            setResponse(msg);
            speakText(msg);
            return imageDataUrl; // Return the captured image data
        }
        return null;
    };

    const handleImageUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
                const msg = "Image uploaded. Ready for analysis.";
                setResponse(msg);
                speakText(msg);
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Simulated Backend API Calls ---
    const simulateGemmaCall = async (actionType, data) => {
        setLoading(true);
        setSpeaking(false); // Stop speaking during "processing"
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay

        let simulatedResult = "";
        switch (actionType) {
            case "describe_vegetation":
                const descriptions = [
                    "This appears to be a Ponderosa Pine. It's a common species in western North America, known for its high flammability due to its needles and resin.",
                    "I identify this as Sagebrush. While not as explosive as some fuels, it can burn intensely, especially when dry.",
                    "This looks like a patch of Cheatgrass. It's an invasive species that dries out early in the season, creating highly flammable fine fuels.",
                    "This is a deciduous tree, likely an Oak. Deciduous trees generally pose a lower fire risk when green, but dry leaves can be a hazard."
                ];
                simulatedResult = descriptions[Math.floor(Math.random() * descriptions.length)];
                break;
            case "assess_drought":
                const droughtAssessments = [
                    "The vegetation shows signs of severe drought stress, with significant browning and wilting. This indicates very low fuel moisture and an extremely high fire risk.",
                    "Moderate drought stress detected. Leaves are slightly discolored, suggesting reduced fuel moisture. Be cautious.",
                    "Vegetation appears healthy with no significant signs of drought stress. Fuel moisture seems adequate for now.",
                    "This area is extremely dry. The ground cover is parched, and plants are brittle. Fire danger is critical."
                ];
                simulatedResult = droughtAssessments[Math.floor(Math.random() * droughtAssessments.length)];
                break;
            case "detect_smoke":
                const smokeDetections = [
                    "Possible smoke plume detected on the horizon. It has characteristics consistent with a distant fire. Please verify and report to local authorities if confirmed.",
                    "No clear smoke plume detected. The haze appears to be atmospheric dust or fog.",
                    "A small, wispy plume is visible, but it doesn't appear to be from a significant fire. Could be a small burn or exhaust."
                ];
                simulatedResult = smokeDetections[Math.floor(Math.random() * smokeDetections.length)];
                break;
            case "get_fire_info":
                const fireInfoResponses = {
                    "defensible space": "Defensible space is the area around a structure that has been modified to reduce fire hazard. In North America, it typically involves three zones: Zone 1 (0-5 feet), Zone 2 (5-30 feet), and Zone 3 (30-100 feet).",
                    "emergency kit": "An emergency kit should include water, non-perishable food, a first-aid kit, medications, a flashlight, extra batteries, a whistle, a dust mask, plastic sheeting, duct tape, a wrench or pliers, a manual can opener, a cell phone with chargers, and important documents.",
                    "fire ban": "Current simulated fire ban status: High fire danger. Open burning is prohibited in many areas. Check local regulations for specifics.",
                    "active fires": location ? `Simulated active fires near Latitude ${location.lat.toFixed(2)}, Longitude ${location.lon.toFixed(2)}: There are 2 small fires reported within 50 miles, and one large incident 150 miles to the east. Always check official sources like FIRMS for real-time data.` : "Please get your location first to check for nearby active fires.",
                    "default": "I can provide information on defensible space, emergency kits, current fire ban status, or active fires. What would you like to know?"
                };
                simulatedResult = fireInfoResponses[data.toLowerCase()] || fireInfoResponses["default"];
                break;
            case "log_observation":
                simulatedResult = "Your observation has been logged successfully. Thank you for contributing to wildfire safety!";
                break;
            case "generate_preparedness_plan": // New Gemini-powered feature
                const userContext = data || "a typical home in a high-risk area with pets";
                // Simulate a call to Gemini API for text generation
                // In a real app, this would be a fetch to your backend, which then calls Gemini
                const geminiPrompt = `Generate a concise wildfire preparedness plan for ${userContext}. Include steps for before, during, and after a wildfire.`;
                
                // Mock Gemini API call response
                const mockGeminiResponse = `
                    **Wildfire Preparedness Plan for ${userContext}:**

                    **Before a Wildfire:**
                    1.  **Create Defensible Space:** Clear flammable vegetation at least 100 feet around your home.
                    2.  **Harden Your Home:** Use fire-resistant building materials, seal vents, and keep gutters clear.
                    3.  **Emergency Kit:** Assemble a 'go-bag' with food, water, medications, and important documents for all family members and pets.
                    4.  **Evacuation Plan:** Establish multiple escape routes and a family meeting point. Practice regularly.
                    5.  **Stay Informed:** Monitor local fire alerts and weather conditions.

                    **During a Wildfire:**
                    1.  **Evacuate Immediately:** If advised by authorities, do not delay. Follow designated routes.
                    2.  **Stay Calm:** Listen to emergency broadcasts for updates.
                    3.  **Protect Pets:** Ensure pets are included in your evacuation plan and have carriers/leashes ready.
                    4.  **Close Doors/Windows:** If sheltering in place (only if advised), close all openings to prevent ember entry.

                    **After a Wildfire:**
                    1.  **Return Safely:** Only return home when authorities declare it safe.
                    2.  **Assess Damage:** Check for embers, hot spots, and structural damage.
                    3.  **Document Losses:** Take photos for insurance claims.
                    4.  **Seek Support:** Utilize community resources for recovery assistance.
                `;
                simulatedResult = mockGeminiResponse;
                break;
            default:
                simulatedResult = "Processing complete, but no specific action was defined for this simulation.";
        }
        setLoading(false);
        setResponse(simulatedResult);
        speakText(simulatedResult);
    };

    // --- Action Handlers ---
    const handleIdentifyVegetation = () => {
        if (!imagePreview) {
            setResponse("Please capture or upload an image first for vegetation identification.");
            speakText("Please capture or upload an image first for vegetation identification.");
            return;
        }
        simulateGemmaCall("describe_vegetation", imagePreview);
    };

    const handleAssessDrought = () => {
        if (!imagePreview) {
            setResponse("Please capture or upload an image first for drought assessment.");
            speakText("Please capture or upload an image first for drought assessment.");
            return;
        }
        simulateGemmaCall("assess_drought", imagePreview);
    };

    const handleDetectSmoke = () => {
        if (!imagePreview) {
            setResponse("Please capture or upload an image first for smoke detection.");
            speakText("Please capture or upload an image first for smoke detection.");
            return;
        }
        simulateGemmaCall("detect_smoke", imagePreview);
    };

    const handleGetFireInformation = () => {
        if (!queryText.trim()) {
            setResponse("Please type your question about fire information.");
            speakText("Please type your question about fire information.");
            return;
        }
        simulateGemmaCall("get_fire_info", queryText);
    };

    const handleLogObservation = () => {
        // In a real app, you'd collect more data (type of observation, location, etc.)
        simulateGemmaCall("log_observation", { type: "general", image: imagePreview, location: location });
    };

    // New handler for Gemini-powered feature
    const handleGeneratePreparednessPlan = () => {
        // In a real app, you might ask for user context here,
        // but for simulation, we'll use a default context.
        simulateGemmaCall("generate_preparedness_plan", "a home in a wildfire-prone area with a family and pets");
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 text-white font-inter flex flex-col items-center justify-center p-4">
            {/* Tailwind CSS and Font Import */}
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                `}
            </style>

            <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col items-center space-y-6 border border-gray-700">
                <h1 className="text-3xl sm:text-4xl font-bold text-center text-red-400 mb-2">
                    Wildfire Watcher
                </h1>
                <p className="text-center text-lg sm:text-xl mb-4 text-gray-300">
                    Across North America: Your Partner in Fire Prevention
                </p>

                {/* Main Response Area */}
                <div className="w-full bg-gray-700 p-4 sm:p-6 rounded-xl text-center text-base sm:text-lg font-medium min-h-[100px] flex items-center justify-center border border-gray-600 shadow-inner">
                    {loading ? (
                        <div className="flex flex-col items-center">
                            <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="mt-2 text-blue-400">Processing...</p>
                        </div>
                    ) : (
                        // Render response with line breaks for markdown-like output
                        <div dangerouslySetInnerHTML={{ __html: response.replace(/\n/g, '<br/>') }} />
                    )}
                </div>

                {/* Status Indicators */}
                <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full text-sm text-gray-400">
                    {speaking && (
                        <div className="animate-pulse flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9.383 3.003C10.056 2.455 11 2.923 11 3.702v12.596c0 .779-.944 1.247-1.617.699L5.383 12H2.5A1.5 1.5 0 011 10.5v-1A1.5 1.5 0 012.5 8h2.883L9.383 3.003zM16.5 10a4.5 4.5 0 00-8.954-.72l-1.97 1.97A6.5 6.5 0 0116.5 10z" clipRule="evenodd"></path></svg>
                            Speaking...
                        </div>
                    )}
                    {speechError && (
                        <div className="text-red-400 flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                            Speech Error
                        </div>
                    )}
                    {location && (
                        <div className="flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path></svg>
                            Loc: {location.lat.toFixed(2)}, {location.lon.toFixed(2)}
                        </div>
                    )}
                </div>

                {/* Camera & Image Upload Section */}
                <div className="w-full flex flex-col items-center space-y-4 bg-gray-700 p-4 rounded-xl border border-gray-600 shadow-inner">
                    <h2 className="text-xl font-semibold text-blue-300">Image Input</h2>
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full">
                        <button
                            onClick={startCamera}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-full shadow-md transition-all duration-300 ease-in-out transform hover:scale-105"
                            disabled={loading || speaking}
                        >
                            <svg className="inline-block w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"></path></svg>
                            Start Camera
                        </button>
                        <button
                            onClick={captureImage}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-full shadow-md transition-all duration-300 ease-in-out transform hover:scale-105"
                            disabled={loading || speaking || !videoRef.current?.srcObject}
                        >
                            <svg className="inline-block w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 6.293A1 1 0 015.586 7H4zm4 3a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V8zm5 0a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1V8z" clipRule="evenodd"></path></svg>
                            Capture Photo
                        </button>
                    </div>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-700 cursor-pointer"
                        disabled={loading || speaking}
                    />
                    
                    {/* Video stream for camera preview */}
                    <video ref={videoRef} className="w-full max-h-64 bg-gray-900 rounded-lg object-cover" autoPlay playsInline muted></video>
                    {/* Hidden canvas for image capture */}
                    <canvas ref={canvasRef} className="hidden"></canvas>
                    
                    {imagePreview && (
                        <div className="mt-4 w-full flex flex-col items-center">
                            <h3 className="text-lg font-semibold text-gray-300 mb-2">Image Preview:</h3>
                            <img src={imagePreview} alt="Captured or Uploaded Preview" className="max-w-full h-auto rounded-lg shadow-lg border border-gray-600" />
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                    <button
                        onClick={handleIdentifyVegetation}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75"
                        disabled={loading || speaking || !imagePreview}
                    >
                        Identify Vegetation
                    </button>
                    <button
                        onClick={handleAssessDrought}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-75"
                        disabled={loading || speaking || !imagePreview}
                    >
                        Assess Drought Stress
                    </button>
                    <button
                        onClick={handleDetectSmoke}
                        className="bg-yellow-600 hover:bg-yellow-700 text-gray-900 font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-75"
                        disabled={loading || speaking || !imagePreview}
                    >
                        Detect Smoke Plume
                    </button>
                    <button
                        onClick={handleGetLocation}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
                        disabled={loading || speaking}
                    >
                        <svg className="inline-block w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path></svg>
                        Get My Location
                    </button>
                    <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col space-y-2">
                        <input
                            type="text"
                            placeholder="e.g., 'defensible space' or 'active fires'"
                            value={queryText}
                            onChange={(e) => setQueryText(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            disabled={loading || speaking}
                        />
                        <button
                            onClick={handleGetFireInformation}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75"
                            disabled={loading || speaking || !queryText.trim()}
                        >
                            Get Fire Information
                        </button>
                    </div>
                    <button
                        onClick={handleLogObservation}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                        disabled={loading || speaking}
                    >
                        Log Observation
                    </button>
                    {/* New Gemini API Powered Feature */}
                    <button
                        onClick={handleGeneratePreparednessPlan}
                        className="col-span-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75"
                        disabled={loading || speaking}
                    >
                        Generate Preparedness Plan ✨
                    </button>
                </div>

                {/* Error Message */}
                {speechError && (
                    <div className="mt-4 text-sm text-red-400 p-2 bg-gray-700 rounded-lg border border-red-500">
                        Speech playback failed. Your browser might not support it or encountered an error.
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
