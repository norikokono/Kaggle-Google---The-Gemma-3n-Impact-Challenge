import requests
import json

url = "http://localhost:8000/generate"
payload = {
    "prompt": "Explain the main causes of wildfires in California:",
    "max_tokens": 500,
    "temperature": 0.7
}
headers = {
    "Content-Type": "application/json"
}

try:
    response = requests.post(url, json=payload, headers=headers)
    print("Status Code:", response.status_code)
    print("Response:", json.dumps(response.json(), indent=2))
except Exception as e:
    print("Error:", str(e))