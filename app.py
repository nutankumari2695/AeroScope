import os
import logging
import requests
from flask import Flask, render_template, jsonify, request

# Load environment variables if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Create the app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default-secret-key")

# OpenWeatherMap API configuration
API_KEY = os.getenv("OPENWEATHERMAP_API_KEY", "45bf81d059a1ad325c7b7013cc8cabba")
BASE_URL = "http://api.openweathermap.org/data/2.5/air_pollution"

# Google Maps API configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"

def get_air_quality_description(aqi):
    """Convert AQI number to description and color class"""
    if aqi == 1:
        return {"description": "Good", "class": "good", "color": "#00e400"}
    elif aqi == 2:
        return {"description": "Fair", "class": "fair", "color": "#ffff00"}
    elif aqi == 3:
        return {"description": "Moderate", "class": "moderate", "color": "#ff7e00"}
    elif aqi == 4:
        return {"description": "Poor", "class": "poor", "color": "#ff0000"}
    elif aqi == 5:
        return {"description": "Very Poor", "class": "very-poor", "color": "#8f3f97"}
    else:
        return {"description": "Unknown", "class": "unknown", "color": "#999999"}

def calculate_percentage(value, max_value):
    """Calculate percentage for pollutant concentration"""
    if max_value == 0:
        return 0
    return min(100, (value / max_value) * 100)

def get_location_name(lat, lon):
    """Get detailed location name from coordinates using Google Geocoding API"""
    if not GOOGLE_API_KEY:
        # Fallback to OpenWeatherMap if Google API key not provided
        app.logger.warning("Google Maps API key not found, falling back to OpenWeatherMap geocoding")
        return get_location_name_fallback(lat, lon)

    try:
        url = f"{GOOGLE_GEOCODING_URL}?latlng={lat},{lon}&key={GOOGLE_API_KEY}"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'OK' and data.get('results'):
                # Get the first (most relevant) result
                result = data['results'][0]
                address_components = result.get('address_components', [])

                # Extract specific address components
                location_parts = {}
                for component in address_components:
                    types = component.get('types', [])
                    long_name = component.get('long_name', '')

                    if 'postal_code' in types:
                        location_parts['postal_code'] = long_name
                    elif 'route' in types:  # Street name
                        location_parts['street'] = long_name
                    elif 'sublocality' in types or 'neighborhood' in types:
                        location_parts['area'] = long_name
                    elif 'locality' in types:  # City
                        location_parts['city'] = long_name
                    elif 'administrative_area_level_1' in types:  # State
                        location_parts['state'] = long_name
                    elif 'country' in types:
                        location_parts['country'] = long_name

                # Build detailed location string like "122506, heli mandi road, farrukhnagar"
                parts = []
                if 'postal_code' in location_parts:
                    parts.append(location_parts['postal_code'])
                if 'street' in location_parts:
                    parts.append(location_parts['street'])
                if 'area' in location_parts:
                    parts.append(location_parts['area'])
                elif 'city' in location_parts:
                    parts.append(location_parts['city'])

                return ', '.join(parts) if parts else result.get('formatted_address', 'Unknown Location')
            else:
                app.logger.warning(f"Google Geocoding API returned status: {data.get('status')}")
                return get_location_name_fallback(lat, lon)
        else:
            app.logger.warning(f"Google Geocoding request failed with status {response.status_code}")
            return get_location_name_fallback(lat, lon)

    except Exception as e:
        app.logger.error(f"Error getting location name from Google: {str(e)}")
        return get_location_name_fallback(lat, lon)

def get_location_name_fallback(lat, lon):
    """Fallback location name using OpenWeatherMap geocoding"""
    try:
        GEOCODING_URL = "http://api.openweathermap.org/geo/1.0/reverse"
        url = f"{GEOCODING_URL}?lat={lat}&lon={lon}&limit=1&appid={API_KEY}"
        response = requests.get(url, timeout=5)

        if response.status_code == 200:
            data = response.json()
            if data:
                location_data = data[0]
                # Build location string with available information
                parts = []
                if 'name' in location_data:
                    parts.append(location_data['name'])
                if 'state' in location_data:
                    parts.append(location_data['state'])
                if 'country' in location_data:
                    parts.append(location_data['country'])

                return ', '.join(parts) if parts else 'Unknown Location'
            else:
                return 'Unknown Location'
        else:
            app.logger.warning(f"Fallback geocoding request failed with status {response.status_code}")
            return 'Unknown Location'

    except Exception as e:
        app.logger.error(f"Error in fallback geocoding: {str(e)}")
        return 'Unknown Location'

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html', google_maps_api_key=GOOGLE_API_KEY or '')

@app.route('/api/air-quality')
def get_air_quality():
    """Get air quality data for given coordinates"""
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        
        if not lat or not lon:
            return jsonify({'error': 'Latitude and longitude are required'}), 400
        
        # Make API request to OpenWeatherMap
        url = f"{BASE_URL}?lat={lat}&lon={lon}&appid={API_KEY}"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            app.logger.error(f"API request failed with status {response.status_code}")
            return jsonify({'error': 'Failed to fetch air quality data'}), 500
        
        data = response.json()
        
        if 'list' not in data or not data['list']:
            return jsonify({'error': 'No air quality data available'}), 404
        
        # Extract air quality data
        aqi_data = data['list'][0]
        aqi = aqi_data['main']['aqi']
        components = aqi_data['components']
        
        # Get AQI description
        aqi_info = get_air_quality_description(aqi)
        
        # Define maximum values for percentage calculation (WHO guidelines)
        max_values = {
            'pm2_5': 25,    # WHO guideline
            'pm10': 50,     # WHO guideline
            'co': 10000,    # WHO guideline
            'no2': 200,     # WHO guideline
            'so2': 350,     # WHO guideline
            'o3': 180       # WHO guideline
        }
        
        # Calculate percentages and prepare component data
        component_data = {
            'pm2_5': {
                'name': 'PM2.5',
                'value': components.get('pm2_5', 0),
                'percentage': calculate_percentage(components.get('pm2_5', 0), max_values['pm2_5']),
                'unit': 'µg/m³',
                'description': 'Fine Particulate Matter'
            },
            'pm10': {
                'name': 'PM10',
                'value': components.get('pm10', 0),
                'percentage': calculate_percentage(components.get('pm10', 0), max_values['pm10']),
                'unit': 'µg/m³',
                'description': 'Coarse Particulate Matter'
            },
            'co': {
                'name': 'CO',
                'value': components.get('co', 0),
                'percentage': calculate_percentage(components.get('co', 0), max_values['co']),
                'unit': 'µg/m³',
                'description': 'Carbon Monoxide'
            },
            'no2': {
                'name': 'NO₂',
                'value': components.get('no2', 0),
                'percentage': calculate_percentage(components.get('no2', 0), max_values['no2']),
                'unit': 'µg/m³',
                'description': 'Nitrogen Dioxide'
            },
            'so2': {
                'name': 'SO₂',
                'value': components.get('so2', 0),
                'percentage': calculate_percentage(components.get('so2', 0), max_values['so2']),
                'unit': 'µg/m³',
                'description': 'Sulfur Dioxide'
            },
            'o3': {
                'name': 'O₃',
                'value': components.get('o3', 0),
                'percentage': calculate_percentage(components.get('o3', 0), max_values['o3']),
                'unit': 'µg/m³',
                'description': 'Ozone'
            }
        }
        
        # Get location name from reverse geocoding
        location_name = get_location_name(lat, lon)
        
        result = {
            'aqi': {
                'value': aqi,
                'description': aqi_info['description'],
                'class': aqi_info['class'],
                'color': aqi_info['color']
            },
            'components': component_data,
            'location': {
                'lat': float(lat),
                'lon': float(lon),
                'name': location_name
            }
        }
        
        return jsonify(result)
        
    except requests.RequestException as e:
        app.logger.error(f"Request exception: {str(e)}")
        return jsonify({'error': 'Network error while fetching air quality data'}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
