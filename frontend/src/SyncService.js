// Background sync service (stub)
import { getUnsyncedLogs, markLogsAsSynced } from './offlineDB';
import React from 'react';

// Intersection Observer scroll animation utility
export const useScrollFadeIn = (className = 'animate-scroll-fade-in') => {
  const ref = React.useRef();
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add(className);
        } else {
          node.classList.remove(className);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [className]);
  return ref;
};

export const syncObservations = async () => {
  const logs = await getUnsyncedLogs();
  if (navigator.onLine && logs.length) {
    // Simulate upload
    // In a real app, send logs to backend/cloud
    await new Promise(r => setTimeout(r, 500));
    await markLogsAsSynced(logs);
    console.log('Synced logs:', logs);
  }
};

window.addEventListener('online', syncObservations);
