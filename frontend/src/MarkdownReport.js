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
  if (!text) return null;
  const lines = text.split(/\r?\n/);
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
    // Unordered list
    else if (/^\-\s+/.test(line)) {
      if (!currentList) currentList = [];
      currentList.push(<li key={i+'li'}>{renderInline(line.replace(/^\-\s+/, ''))}</li>);
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
  return <div style={{whiteSpace:'pre-line',fontSize:'1rem',color:'#222',textAlign:'left'}} aria-live="polite">{elements}</div>;
}

// Helper for inline formatting (bold)
function renderInline(text) {
  // Bold: **text**
  const boldRegex = /\*\*(.*?)\*\*/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let idx = 0;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={idx++}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}
