import React, { useRef, useState } from 'react';

export default function AudioRecorder({ onTranscription, disabled }) {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    setAudioURL(null);
    setRecording(true);
    audioChunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new window.MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      setAudioURL(URL.createObjectURL(audioBlob));
      setRecording(false);
      setLoading(true);
      // Upload for transcription
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');
      try {
        const res = await fetch('http://127.0.0.1:8000/api/transcribe', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.text && onTranscription) {
          onTranscription(data.text);
        }
      } catch (err) {
        alert('Transcription failed.');
      }
      setLoading(false);
    };
    mediaRecorder.start();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div style={{margin: '1em 0'}}>
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || loading}
        className={`audio-recorder-btn${recording ? ' recording' : ''}`}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        style={{ marginRight: 12 }}
      >
        {recording ? 'Stop Recording' : 'Record Audio'}
      </button>
      {loading && <span style={{marginLeft:8}}>Transcribing...</span>}
      {audioURL && (
        <audio controls src={audioURL} style={{ display: 'block', marginTop: 10 }} />
      )}
    </div>
  );
}
