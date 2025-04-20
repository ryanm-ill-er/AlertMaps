const alertPolygons = {};

const map = new maplibregl.Map({
  container: 'alertMap',
  style: 'https://api.maptiler.com/maps/basic-v2-dark/style.json?key=SskdAs3Zk3tm9lBUtRKN',
  center: [-98.5795, 39.8283],
  zoom: 4
});

// Function to draw a polygon on the map
function drawPolygon(coords, id, color = 'red') {
  console.log('Drawing polygon with coords:', coords);
  
  try {
    // Extract coordinates appropriately
    const latLngs = coords[0].map(coord => {
      // Validate and ensure coordinates are within valid ranges
      // GeoJSON standard order is [longitude, latitude]
      const [lon, lat] = coord;
      
      // Ensure values are within valid ranges
      if (lat < -90 || lat > 90) {
        console.error(`Invalid latitude value: ${lat}`);
        return null;
      }
      if (lon < -180 || lon > 180) {
        console.error(`Invalid longitude value: ${lon}`);
        return null;
      }
      
      return [lon, lat];
    }).filter(coord => coord !== null);
    
    // Create a GeoJSON object
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [latLngs]
      },
      properties: {}
    };
    
    const sourceId = `polygon-source-${id}`;
    const layerId = `polygon-layer-${id}`;
    
    // Add source and layer with error handling
    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojson
        });
        
        map.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': color,
            'fill-opacity': 0.5,
            'fill-outline-color': '#000'
          }
        });
        
        console.log(`Added polygon layer ${layerId}`);
      } else {
        map.getSource(sourceId).setData(geojson);
        console.log(`Updated polygon layer ${layerId}`);
      }
    } catch (err) {
      console.error('Error adding map source or layer:', err);
    }
    
    // Store bounds for later use
    const bounds = new maplibregl.LngLatBounds();
    latLngs.forEach(coord => bounds.extend(coord));
    alertPolygons[id] = bounds;
  } catch (err) {
    console.error('Error in drawPolygon:', err);
  }
}

// Function to create and display the alert card
function createAlertCard(warning, id) {
  const { event, areaDesc, expires } = warning.properties;

  const li = document.createElement('li');
  li.innerHTML = `
    <strong>${event}</strong><br/>
    <small>${areaDesc}</small><br/>
    <small>Until: ${new Date(expires).toLocaleTimeString()}</small>
  `;

  li.onclick = () => {
    if (alertPolygons[id]) {
      map.fitBounds(alertPolygons[id], { padding: 50 });
    }

    const title = document.getElementById('alert-title');
    const details = document.getElementById('alert-details');
    const infoBox = document.getElementById('alert-info');

    title.textContent = event;
    details.innerHTML = `
      <strong>Area:</strong> ${areaDesc}<br/>
      <strong>Expires:</strong> ${new Date(expires).toLocaleString()}
    `;
    infoBox.style.display = 'block';
  };

  document.getElementById('warningList').prepend(li);
}

// Function to display a notification with sound
function displayNotification(warning) {
  const { event, areaDesc } = warning.properties;
  let sound = 'default.mp3';

  if (event.includes('Tornado Emergency')) sound = 'tornado_emergency.mp3';
  else if (event.includes('PDS Tornado Warning')) sound = 'pds_tornado.mp3';
  else if (event.includes('Observed Tornado Warning')) sound = 'observed_tornado.mp3';
  else if (event.includes('Tornado Warning')) sound = 'tornado.mp3';
  else if (event.includes('Destructive Severe Thunderstorm Warning')) sound = 'destructive_svr.mp3';
  else if (event.includes('Considerable Severe Thunderstorm Warning')) sound = 'considerable_svr.mp3';
  else if (event.includes('Severe Thunderstorm Warning')) sound = 'svr.mp3';

  const audio = new Audio(sound);
  audio.play().catch(err => console.error('Error playing audio:', err));
}

// Function to process polygon data from NWS API or XMPP
function processPolygon(polygonData, id) {
  try {
    // Handle string format from NWS API or XMPP (lat,lon lat,lon format)
    if (typeof polygonData === 'string') {
      const coordinates = polygonData.split(' ').map(coord => {
        const [lat, lon] = coord.split(',');
        return [parseFloat(lat), parseFloat(lon)];
      });
      
      // Structure it as expected by drawPolygon
      drawPolygon([[coordinates]], id);
    } 
    // Handle array format if already parsed
    else if (Array.isArray(polygonData)) {
      drawPolygon([[polygonData]], id);
    }
    else {
      console.error('Unknown polygon format:', polygonData);
    }
  } catch (err) {
    console.error('Error processing polygon:', err);
  }
}

// Function to fetch alerts from the NWS API
async function fetchAlerts() {
  try {
    const response = await fetch('https://api.weather.gov/alerts/active');
    const data = await response.json();
    
    console.log('Fetched data:', data);
    console.log('Number of features:', data.features.length);
    
    // Clear existing alerts
    document.getElementById('warningList').innerHTML = '';
    
    // Process the alerts
    data.features.forEach(feature => {
      const id = feature.id || `${Date.now()}-${Math.random()}`;
      
      createAlertCard(feature, id);
      
      // Process polygon if it exists
      if (feature.geometry && feature.geometry.coordinates) {
        drawPolygon(feature.geometry.coordinates, id);
      } else if (feature.properties.polygon) {
        processPolygon(feature.properties.polygon, id);
      }
      
      displayNotification(feature);
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
  }
}

// Setup Socket.io connection for real-time alerts
const socket = io();

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('new-alert', (warning) => {
  console.log('Received new alert:', warning);
  
  const id = `alert-${Date.now()}`;
  createAlertCard(warning, id);
  
  if (warning.properties.polygon) {
    processPolygon(warning.properties.polygon, id);
  }
  
  displayNotification(warning);
});

// Wait for map to load before fetching alerts
map.on('load', () => {
  console.log('Map loaded');
  
  // Test polygon - this should definitely appear if your code is working
  const testCoords = [
    [-85, 35],
    [-85, 36],
    [-86, 36],
    [-86, 35],
    [-85, 35]
  ];
  
  const testPolygonData = [testCoords];
  drawPolygon(testPolygonData, 'test-polygon', '#FF0000');
  
  // Fetch initial alerts when the map loads
  fetchAlerts();
  
  // Poll for new alerts every 5 minutes
  setInterval(fetchAlerts, 5 * 60 * 1000);
});
