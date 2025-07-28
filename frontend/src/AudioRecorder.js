import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function AudioRecorder({ onTranscription, disabled }) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    // Create a new speech recognition instance
    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Stop after the first result
    recognition.interimResults = false; // We only want final results
    recognition.maxAlternatives = 1; // Only get the best result
    recognition.lang = 'en-US';

    // Set up event handlers
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript && onTranscription) {
        onTranscription(transcript);
        // Stop listening after getting a result
        setIsListening(false);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event);
      let errorMessage = 'Error occurred during speech recognition';
      
      // Provide more specific error messages
      switch(event.error) {
        case 'no-speech':
          errorMessage = 'No speech was detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone was found. Please ensure a microphone is connected.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access was denied. Please allow microphone access to use this feature.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }
      
      setError(errorMessage);
      setIsListening(false);
    };

    recognition.onend = () => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // If we're still supposed to be listening, restart recognition
      if (isListening) {
        // Small delay before restarting to prevent rapid restarts
        timeoutRef.current = setTimeout(() => {
          if (isListening) {
            try {
              recognition.start();
            } catch (err) {
              console.error('Error restarting recognition:', err);
              setIsListening(false);
            }
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    // Clean up on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening, onTranscription]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      // Start listening
      setError(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        setError('Failed to access microphone. Please ensure you have granted microphone permissions.');
      }
    }
  }, [isListening]);

  // Handle disabled state
  useEffect(() => {
    if (disabled && isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    }
  }, [disabled, isListening]);

  // Auto-close after 30 seconds of no speech
  useEffect(() => {
    if (isListening) {
      const timer = setTimeout(() => {
        if (isListening) {
          setError('No speech detected. Please try again.');
          setIsListening(false);
        }
      }, 30000); // 30 seconds timeout
      
      return () => clearTimeout(timer);
    }
  }, [isListening]);

  return (
    <div style={{ margin: '0.5em 0' }}>
      <button
        onClick={toggleListening}
        disabled={disabled}
        style={{
          backgroundColor: isListening ? '#dc3545' : '#4a90e2',
          color: 'white',
          border: 'none',
          padding: '0.5em 1em',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          opacity: disabled ? 0.6 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          transition: 'background-color 0.2s',
          fontSize: '0.9em',
          fontWeight: 500,
          minWidth: '140px',
          justifyContent: 'center'
        }}
        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isListening ? (
          <>
            <span className="pulse-dot"></span>
            Listening...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 1C10.34 1 9 2.37 9 4.07V11.93C9 13.63 10.34 15 12 15C13.66 15 15 13.63 15 11.93V4.07C15 2.37 13.66 1 12 1Z" fill="currentColor"/>
              <path d="M17.5 11C17.5 14.17 15.07 16.7 12 16.7C8.93 16.7 6.5 14.17 6.5 11H5C5 14.41 7.72 17.24 11 17.72V22H13V17.72C16.28 17.23 19 14.4 19 11H17.5Z" fill="currentColor"/>
            </svg>
            Speak Location
          </>
        )}
      </button>
      {error && (
        <div style={{
          color: '#dc3545',
          marginTop: '8px',
          fontSize: '0.85em',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          padding: '0.5em',
          borderRadius: '4px',
          textAlign: 'center',
          maxWidth: '300px',
          margin: '8px auto 0',
          wordBreak: 'break-word'
        }}>
          {error}
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .pulse-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          background-color: white;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
      `}</style>
    </div>
  );
}
