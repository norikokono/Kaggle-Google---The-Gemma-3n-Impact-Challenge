import React, { useState, useEffect, useRef } from 'react';
import { identifyPlant, answerQuestion } from './gemma3n';
import { getPlantInfo, logObservation, getUnsyncedLogs } from './offlineDB';
import knowledgeBase from './KnowledgeBase';
import { syncObservations, useScrollFadeIn } from './SyncService';

function LandingPage() {
    // State variables for app functionality
    const [response, setResponse] = useState("Welcome to Wildfire Watcher. How can I assist you today?");
    const [speaking, setSpeaking] = useState(false);
    const [speechError, setSpeechError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [location, setLocation] = useState(null); // { lat: number, lon: number }
    const [queryText, setQueryText] = useState(""); // For text-based queries
    const [logs, setLogs] = useState([]);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");

    // Refs for browser APIs
    const synthRef = useRef(window.speechSynthesis);
    const voicesRef = useRef([]); // To store available voices
    const videoRef = useRef(null); // For camera stream
    const canvasRef = useRef(null); // For capturing camera frame
    const hasSpokenWelcome = useRef(false); // To ensure welcome message is spoken only once

    // --- Animation Refs ---
    const heroRef = useScrollFadeIn();
    const dashboardRef = useScrollFadeIn();
    const vegetationRef = useScrollFadeIn();
    const fireSafetyRef = useScrollFadeIn();
    const logRef = useScrollFadeIn();
    const responseRef = useScrollFadeIn();

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
                if (!speaking && !speechError && !hasSpokenWelcome.current) {
                    speakText(response);
                    hasSpokenWelcome.current = true;
                }
                synthRef.current.removeEventListener('voiceschanged', loadVoicesAndSpeak);
            }
        };

        if (synthRef.current.getVoices().length > 0) {
            loadVoicesAndSpeak();
        } else {
            synthRef.current.addEventListener('voiceschanged', loadVoicesAndSpeak);
        }

        return () => {
            if (synthRef.current) {
                synthRef.current.removeEventListener('voiceschanged', loadVoicesAndSpeak);
            }
        };
    }, []);

    useEffect(() => {
        // Load logs for dashboard
        getUnsyncedLogs().then(setLogs);
    }, [logs.length]);

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

    const handleFireSafetyQuestion = async () => {
        setLoading(true);
        const ans = await answerQuestion(question, knowledgeBase);
        setAnswer(ans);
        speakText(ans);
        setLoading(false);
    };

    // --- Action Handlers ---
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
            {/* Hero Section */}
            <section ref={heroRef} className="w-full max-w-5xl mx-auto mb-10 relative">
                <div className="bg-gradient-to-r from-black via-orange-900 to-orange-400 rounded-3xl shadow-2xl p-8 flex flex-col md:flex-row items-center justify-between border-4 border-orange-500 relative z-10">
                    <div className="flex-1 text-center md:text-left">
                        <h1 className="text-5xl font-extrabold text-white mb-4 drop-shadow-lg">Wildfire Watcher: Across North America</h1>
                        <p className="text-lg md:text-xl text-orange-100 mb-6 font-medium">Empowering communities to prevent, assess, and detect wildfires using AI, offline-first technology, and real-time insights. Privacy-first, accessible, and ready for real-world impact.</p>
                        <ul className="text-base text-orange-100 mb-4 list-disc list-inside">
                            <li>Vegetation Identification</li>
                            <li>Drought & Fuel Moisture Assessment</li>
                            <li>Smoke Detection</li>
                            <li>Fire Safety Q&A</li>
                            <li>Offline Observation Logging & Sync</li>
                        </ul>
                        <span className="inline-block bg-black bg-opacity-30 text-orange-300 font-bold px-4 py-2 rounded-full shadow-md mt-2 animate-pop">Google Gemma 3n Impact Challenge</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center mt-8 md:mt-0">
                        <img src="/wildfire-hero.png" alt="Wildfire Watcher Hero" className="w-64 h-64 object-cover rounded-2xl shadow-xl border-4 border-orange-500 animate-zoom-in" />
                    </div>
                </div>
                {/* Bottom gradient overlay for dark cross-center effect */}
                <div className="absolute left-0 right-0 bottom-0 h-24 rounded-b-3xl z-0 pointer-events-none"
                    style={{
                        background: "radial-gradient(ellipse at center, rgba(30,30,30,0.7) 0%, rgba(30,30,30,0.3) 60%, rgba(0,0,0,0) 100%)"
                    }}
                ></div>
            </section>
            {/* Tailwind CSS and Font Import */}
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                `}
            </style>
            <div ref={dashboardRef} className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col space-y-8 border border-gray-700">
                <h1 className="text-4xl font-extrabold text-center text-gradient bg-gradient-to-r from-red-400 via-yellow-400 to-orange-500 bg-clip-text text-transparent mb-2 drop-shadow-lg">
                    Wildfire Watcher Dashboard
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Vegetation Identification */}
                    <div ref={vegetationRef} className="bg-gradient-to-br from-green-900 via-gray-700 to-green-700 rounded-xl p-6 shadow-xl flex flex-col items-center border border-green-600">
                        <h2 className="text-2xl font-bold text-green-200 mb-3 drop-shadow animate-fade-in">
                            Vegetation Identification
                        </h2>
                        <div className="flex space-x-2 mb-3">
                            <button
                                onClick={startCamera}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-full shadow-lg transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-400 animate-pop"
                                disabled={loading || speaking}
                            >
                                Start Camera
                            </button>
                            <button
                                onClick={captureImage}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-5 rounded-full shadow-lg transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-pop"
                                disabled={loading || speaking || !videoRef.current?.srcObject}
                            >
                                Capture Photo
                            </button>
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-800 file:text-white hover:file:bg-green-900 cursor-pointer mb-3 animate-fade-in"
                            disabled={loading || speaking}
                        />
                        <video
                            ref={videoRef}
                            className="w-full max-h-40 bg-gray-900 rounded-lg object-cover mb-3 border border-green-700 animate-fade-in"
                            autoPlay
                            playsInline
                            muted
                        ></video>
                        <canvas ref={canvasRef} className="hidden"></canvas>
                        {imagePreview && (
                            <img
                                src={imagePreview}
                                alt="Preview"
                                className="max-w-full h-auto rounded-xl shadow-xl border-2 border-green-500 mb-3 animate-zoom-in"
                            />
                        )}
                        <button
                            onClick={handleIdentifyVegetation}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-full shadow-xl transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 animate-pop"
                            disabled={loading || speaking || !imagePreview}
                        >
                            Identify Vegetation
                        </button>
                    </div>
                    {/* Fire Safety Q&A */}
                    <div ref={fireSafetyRef} className="bg-gradient-to-br from-blue-900 via-gray-700 to-blue-700 rounded-xl p-6 shadow-xl flex flex-col items-center border border-blue-600">
                        <h2 className="text-2xl font-bold text-blue-200 mb-3 drop-shadow animate-fade-in">Fire Safety Q&A</h2>
                        <input
                            type="text"
                            placeholder="Ask about defensible space, go-bag, etc."
                            value={question}
                            onChange={e => setQuestion(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-800 text-white placeholder-gray-400 border-2 border-blue-400 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400 animate-fade-in"
                            disabled={loading || speaking}
                        />
                        <button
                            onClick={handleFireSafetyQuestion}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-5 rounded-full shadow-xl mb-3 transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-teal-400 animate-pop"
                            disabled={loading || speaking || !question.trim()}
                        >
                            Get Answer
                        </button>
                        {answer && (
                            <div className="mt-2 text-base text-gray-200 bg-gray-800 p-3 rounded-xl border-2 border-blue-400 shadow-lg animate-fade-in">
                                {answer}
                            </div>
                        )}
                    </div>
                </div>
                {/* Observation Log */}
                <div ref={logRef} className="bg-gradient-to-br from-yellow-900 via-gray-700 to-yellow-700 rounded-xl p-6 shadow-xl mt-8 border border-yellow-600">
                    <h2 className="text-2xl font-bold text-yellow-200 mb-3 drop-shadow animate-fade-in">My Observations (Offline)</h2>
                    <ul className="space-y-2">
                        {logs.length === 0 ? (
                            <li className="text-gray-400 animate-fade-in">No observations yet.</li>
                        ) : (
                            logs.map((log, idx) => (
                                <li
                                    key={idx}
                                    className="bg-gray-800 p-3 rounded-xl border-2 border-yellow-400 text-sm text-gray-200 shadow-lg animate-fade-in"
                                >
                                    <span className="font-bold text-yellow-300">{log.type}</span>: {log.plant}{' '}
                                    <span className="text-xs text-gray-400">
                                        ({new Date(log.timestamp).toLocaleString()})
                                    </span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
                {/* Main Response Area & Status */}
                <div className="mt-8">
                    <div ref={responseRef} className="w-full bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 p-6 rounded-2xl text-center text-lg font-semibold min-h-[60px] flex items-center justify-center border-2 border-gray-600 shadow-xl mb-3">
                        {loading ? (
                            <span className="text-blue-400 animate-pulse">Processing...</span>
                        ) : (
                            <span dangerouslySetInnerHTML={{ __html: response.replace(/\n/g, '<br/>') }} />
                        )}
                    </div>
                    <div className="flex flex-row justify-center items-center space-x-4 text-sm text-gray-400">
                        {speaking && <span className="animate-pulse">Speaking...</span>}
                        {speechError && <span className="text-red-400">Speech Error</span>}
                        {location && <span>Loc: {location.lat.toFixed(2)}, {location.lon.toFixed(2)}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LandingPage;

/* Tailwind custom animations */
<style>
{`
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scroll-fade-in {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slide-up {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pop {
  0% { transform: scale(0.95); }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
@keyframes zoom-in {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in { animation: fade-in 0.7s ease; }
.animate-scroll-fade-in { animation: scroll-fade-in 1s cubic-bezier(0.4,0,0.2,1); }
.animate-slide-up { animation: slide-up 0.8s cubic-bezier(0.4,0,0.2,1); }
.animate-pop { animation: pop 0.4s cubic-bezier(0.4,0,0.2,1); }
.animate-zoom-in { animation: zoom-in 0.6s cubic-bezier(0.4,0,0.2,1); }
`}
</style>
