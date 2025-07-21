import React, { useState } from 'react';

export default function ImageWithPlaceholder({ src, alt, placeholder, style }) {
  const [imgSrc, setImgSrc] = useState(placeholder);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  React.useEffect(() => {
    setImgSrc(placeholder);
    setLoading(true);
    setErrored(false);
    const img = new window.Image();
    img.src = src;
    img.onload = () => {
      setImgSrc(src);
      setLoading(false);
    };
    img.onerror = () => {
      setImgSrc(placeholder);
      setLoading(false);
      setErrored(true);
    };
    // eslint-disable-next-line
  }, [src, placeholder]);

  return (
    <div style={{ position: 'relative', width: style?.width || '100%', minHeight: 120 }}>
      <img
        src={imgSrc}
        alt={alt}
        style={{ ...style, filter: loading ? 'blur(3px) grayscale(0.5)' : 'none', transition: 'filter 0.3s' }}
      />
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.7)', zIndex: 2, fontSize: 18, color: '#ef4444', fontWeight: 600
        }}>
          Loading image...
        </div>
      )}
      {errored && !loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.8)', zIndex: 2, fontSize: 16, color: '#ef4444', fontWeight: 600
        }}>
          Image unavailable
        </div>
      )}
    </div>
  );
}
