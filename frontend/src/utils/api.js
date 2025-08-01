const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api'  // This will be relative to your domain
  : 'http://localhost:8000';  // For local development

export const apiRequest = async (endpoint, options = {}) => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = `${API_BASE_URL}/${cleanEndpoint}`;
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include',
    mode: 'cors'
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.clone().json();
      } catch (e) {
        const text = await response.text();
        throw new Error(text || `HTTP error! status: ${response.status}`);
      }
      throw new Error(errorData.detail || errorData.message || `HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {};
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

export const post = async (endpoint, data) => {
  return apiRequest(endpoint, {
    method: 'POST',
    body: data
  });
};

const api = {
  apiRequest,
  post
};

export default api;