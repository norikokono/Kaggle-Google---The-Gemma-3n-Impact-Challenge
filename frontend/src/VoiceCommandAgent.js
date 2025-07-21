import React, { useEffect, useRef } from 'react';

/**
 * VoiceCommandAgent: A component that listens for voice commands and processes them
 * to determine user intent and entities.
 * 
 * @param {Object} props - Component props
 * @param {Function} props.onIntent - Callback function that receives an object with {intent, entities, transcript}
 * @param {boolean} [props.disabled=false] - Whether the voice command is disabled
 * @returns {JSX.Element} A button to trigger voice commands
 */
export default function VoiceCommandAgent({ onIntent, disabled = false }) {
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Clean up recognition on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startVoiceCommand = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const intent = processVoiceCommand(transcript);
        onIntent && onIntent({
          intent: intent.intent,
          entities: intent.entities,
          transcript: transcript
        });
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
      };
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting voice recognition:', error);
    }
  };

  // Simple command processing - can be enhanced with more sophisticated NLP
  const processVoiceCommand = (transcript) => {
    const lowerTranscript = transcript.toLowerCase();
    
    // Check for search intent
    if (lowerTranscript.includes('search for') || 
        lowerTranscript.includes('find') || 
        lowerTranscript.includes('look for') ||
        lowerTranscript.includes('show me')) {
      return {
        intent: 'search',
        entities: {
          location: transcript.replace(/(search for|find|look for|show me)/i, '').trim()
        }
      };
    }
    
    // Check for report generation
    if (lowerTranscript.includes('generate report') || 
        lowerTranscript.includes('create report') ||
        lowerTranscript.includes('show report')) {
      return { intent: 'report' };
    }

    // Default to search if no specific intent is detected
    return {
      intent: 'search',
      entities: { location: transcript }
    };
  };

  return (
    <button 
      onClick={startVoiceCommand}
      disabled={disabled}
      style={{
        background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 12px',
        marginLeft: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.9em',
        fontWeight: 500
      }}
      aria-label="Voice command"
    >
      <span role="img" aria-label="microphone">🎤</span>
      <span>Command</span>
    </button>
  );
}