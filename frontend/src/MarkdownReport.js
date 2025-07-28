import React from 'react';

/**
 * MarkdownReport: Renders markdown with proper HTML tags for headings, bold, lists, hr, and paragraphs.
 * - Supports #, ##, ### for headings
 * - Supports **bold**
 * - Supports unordered lists (- ...)
 * - Handles horizontal rules (---)
 * - No center alignment; uses left-align for all text
 */
export default function MarkdownReport({ text }) {
  // Handle different input types
  let content = '';
  
  if (typeof text === 'string') {
    content = text;
  } else if (text && typeof text === 'object') {
    // If it's an object with a 'summary' or 'analysis' property, use that
    if (text.summary) {
      content = text.summary;
    } else if (text.analysis) {
      content = text.analysis;
    } else {
      // Fallback: stringify the object
      content = JSON.stringify(text, null, 2);
    }
  } else if (text !== null && text !== undefined) {
    // Handle numbers, booleans, etc.
    content = String(text);
  } else {
    return null;
  }

  const lines = content.split(/\r?\n/);
  const elements = [];
  let currentList = null;
  
  lines.forEach((line, i) => {
    // Headings
    if (/^###\s+/.test(line)) {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<h4 key={i+'h4'} style={{marginBottom:4,marginTop:18}}>{line.replace(/^###\s+/, '')}</h4>);
    } else if (/^##\s+/.test(line)) {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<h3 key={i+'h3'} style={{marginBottom:8,marginTop:24}}>{line.replace(/^##\s+/, '')}</h3>);
    } else if (/^#\s+/.test(line)) {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<h2 key={i+'h2'} style={{marginBottom:10,marginTop:32}}>{line.replace(/^#\s+/, '')}</h2>);
    }
    // Unordered list (supports both - and * for bullet points)
    else if (/^[-*]\s+/.test(line)) {
      if (!currentList) currentList = [];
      currentList.push(<li key={i+'li'}>{renderInline(line.replace(/^[-*]\s+/, ''))}</li>);
    }
    // Horizontal rule
    else if (line.trim() === '---') {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<hr key={i+'hr'} />);
    }
    // Paragraph or inline
    else if (line.trim() !== '') {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<p key={i+'p'} style={{marginBottom:8}}>{renderInline(line)}</p>);
    }
  });
  
  if (currentList) elements.push(<ul key={'endul'}>{currentList}</ul>);
  
  return (
    <div 
      style={{
        whiteSpace: 'pre-line',
        fontSize: '1rem',
        color: '#222',
        textAlign: 'left',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: '1.5'
      }} 
      aria-live="polite"
    >
      {elements}
    </div>
  );
}

// Helper for inline formatting (bold)
function renderInline(text) {
  if (typeof text !== 'string') return text;
  
  // Split by ** but keep the delimiters
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
