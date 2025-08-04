const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://wildguard-backend-26060761891.us-central1.run.app'
    : 'http://localhost:8080');

export const apiRequest = async (endpoint, options = {}) => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = `${API_BASE_URL}/${cleanEndpoint}`;
  
  console.log('Making request to:', url);
  
  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  // Remove Content-Type for FormData to let the browser set it with the correct boundary
  if (options.body && options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = {
    ...options,
    headers,
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'include',
    redirect: 'follow',
    referrerPolicy: 'no-referrer-when-downgrade'
  };

  // Only stringify the body if it's not FormData and not already a string
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    config.body = JSON.stringify(options.body);
  } else if (options.body) {
    config.body = options.body;
  }

  try {
    const response = await fetch(url, config);
    
    // Handle non-2xx responses
    if (!response.ok) {
      let errorData;
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.clone().json();
        } else {
          const text = await response.text();
          throw new Error(text || `HTTP error! status: ${response.status}`);
        }
      } catch (e) {
        console.error('Error parsing error response:', e);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Handle CORS-related errors
      if (response.status === 0) {
        throw new Error('Network error or CORS issue. Please check if the server is running and CORS is properly configured.');
      }
      
      throw new Error(
        errorData.detail || 
        errorData.message || 
        errorData.error || 
        `HTTP error! status: ${response.status}`
      );
    }

    // Handle different response types
    const responseContentType = response.headers.get('content-type');
    if (responseContentType && responseContentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    console.error('API request failed:', {
      url,
      error: error.message,
      config: {
        ...config,
        // Don't log the entire request body as it might contain sensitive data
        body: config.body ? (config.body instanceof FormData ? '[FormData]' : '[REDACTED]') : undefined
      }
    });
    
    // Enhance CORS-related error messages
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error(`Unable to connect to the server. Please check your internet connection and make sure the server is running. If this persists, the server may be down or there may be a CORS configuration issue.`);
    }
    
    throw error;
  }
};

export const post = async (endpoint, data, options = {}) => {
  return apiRequest(endpoint, {
    method: 'POST',
    body: data,
    ...options
  });
};

export const testConnection = async () => {
  try {
    return await apiRequest('health', { method: 'GET' });
  } catch (error) {
    console.error('Connection test failed:', error);
    throw new Error(`Failed to connect to the server: ${error.message}`);
  }
};

const api = {
  apiRequest,
  post,
  testConnection
};

export default api;