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
  
  // Function to parse list items with indentation
  const parseListItems = (startIdx, baseIndent = null) => {
    const items = [];
    let i = startIdx;
    
    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/^(\s*)[-*]\s*(.*)/);
      
      // If we hit a non-list item, stop processing
      if (!match) {
        // If we're at the root level, stop completely
        if (baseIndent === null) break;
        // If we're in a nested list, check if this line is part of a paragraph continuation
        const isContinuation = line.trim() !== '' && line.match(/^\s{2,}/);
        if (!isContinuation) break;
      }
      
      if (match) {
        const [_, lineIndent, content] = match;
        const currentIndent = lineIndent.length;
        
        // If this is the first item, set the base indentation
        const currentBaseIndent = baseIndent !== null ? baseIndent : currentIndent;
        
        // If indentation is less than base, we're done with this list
        if (currentIndent < currentBaseIndent) break;
        
        // If this is a new item at the current level
        if (currentIndent === currentBaseIndent) {
          items.push({
            content: content.trim(),
            children: [],
            key: i
          });
          i++;
        } 
        // If this is a nested list
        else if (currentIndent > currentBaseIndent) {
          // Process the nested list
          const nestedItems = parseListItems(i, currentIndent);
          if (items.length > 0) {
            // Attach nested items to the last item at this level
            items[items.length - 1].children = nestedItems.items;
          }
          i = nestedItems.nextIndex;
        }
      } else {
        // Handle paragraph continuations (lines that are indented under a list item)
        if (items.length > 0) {
          const lastItem = items[items.length - 1];
          lastItem.content = (lastItem.content + ' ' + line.trim()).trim();
        }
        i++;
      }
    }
    
    return { items, nextIndex: i };
  };
  
  // Function to render list items recursively
  const renderListItems = (items, level = 0) => {
    return items.map((item, idx) => {
      // Check if the content contains line breaks (for multi-line list items)
      const contentParts = item.content.split('\n');
      const firstLine = contentParts[0];
      const remainingLines = contentParts.slice(1);
      
      return (
        <li key={item.key || idx} style={{ marginBottom: '0.5em' }}>
          {renderInline(firstLine)}
          {remainingLines.length > 0 && (
            <div style={{ marginTop: '0.5em', marginLeft: '1.5em' }}>
              {remainingLines.map((line, i) => (
                <div key={i}>{renderInline(line)}</div>
              ))}
            </div>
          )}
          {item.children && item.children.length > 0 && (
            <ul style={{ 
              marginTop: '0.5em', 
              marginBottom: '0.5em', 
              paddingLeft: '1.5em',
              listStyleType: 'disc'
            }}>
              {renderListItems(item.children, level + 1)}
            </ul>
          )}
        </li>
      );
    });
  };
  
  // Main parsing loop
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }
    
    // Check for list items
    if (/^\s*[-*]\s*/.test(line)) {
      const { items, nextIndex } = parseListItems(i);
      elements.push(
        <ul key={`list-${i}`} style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>
          {renderListItems(items)}
        </ul>
      );
      i = nextIndex;
      continue;
    }
    
    // Headers
    if (/^###\s+/.test(line)) {
      elements.push(<h4 key={i} style={{marginBottom:4,marginTop:18}}>{line.replace(/^###\s+/, '')}</h4>);
    } else if (/^##\s+/.test(line)) {
      elements.push(<h3 key={i} style={{marginBottom:8,marginTop:24}}>{line.replace(/^##\s+/, '')}</h3>);
    } else if (/^#\s+/.test(line)) {
      elements.push(<h2 key={i} style={{marginBottom:10,marginTop:32}}>{line.replace(/^#\s+/, '')}</h2>);
    }
    // Horizontal rule
    else if (line.trim() === '---') {
      elements.push(<hr key={i} />);
    }
    // Paragraph
    else {
      elements.push(<p key={i} style={{marginBottom:8}}>{renderInline(line)}</p>);
    }
    
    i++;
  }
  
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

// Helper for inline formatting (bold and other markdown)
function renderInline(text) {
  if (typeof text !== 'string') return text;
  
  // Handle bold text with **** or **
  const parts = [];
  let remaining = text;
  let lastIndex = 0;
  
  // This regex matches either ****text**** or **text**
  const boldRegex = /(\*{2,4})([^*]+?)\1/g;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    const [fullMatch, delimiter, content] = match;
    const startIndex = match.index;
    
    // Add text before the match
    if (startIndex > lastIndex) {
      parts.push(text.substring(lastIndex, startIndex));
    }
    
    // Add the bold content
    parts.push(<strong key={startIndex}>{content}</strong>);
    
    lastIndex = startIndex + fullMatch.length;
  }
  
  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  // If no matches were found, return the original text
  if (parts.length === 0) {
    return text;
  }
  
  // Return the array of parts (strings and React elements)
  return <>{parts}</>;
}
