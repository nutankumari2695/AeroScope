// Global variables
let airQualityChart;
let currentLocation = null;

// DOM elements
const getLocationBtn = document.getElementById('getLocationBtn');
const refreshBtn = document.getElementById('refreshBtn');
const retryBtn = document.getElementById('retryBtn');
const loadingSection = document.getElementById('loadingSection');
const errorSection = document.getElementById('errorSection');
const resultsSection = document.getElementById('resultsSection');
const errorMessage = document.getElementById('errorMessage');
const aqiValue = document.getElementById('aqiValue');
const aqiDescription = document.getElementById('aqiDescription');
const componentsGrid = document.getElementById('componentsGrid');

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    getLocationBtn.addEventListener('click', requestLocation);
    refreshBtn.addEventListener('click', refreshData);
    retryBtn.addEventListener('click', requestLocation);
});

// Request user's location
function requestLocation() {
    hideAllSections();
    showLoading('Getting your location...');
    
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by this browser. Please use a modern browser with location services.');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        onLocationError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        }
    );
}

// Handle successful location retrieval
function onLocationSuccess(position) {
    currentLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    
    showLoading('Fetching air quality data...');
    fetchAirQualityData(currentLocation.lat, currentLocation.lon);
}

// Handle location error
function onLocationError(error) {
    let message = 'Unable to retrieve your location. ';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message += 'Location access was denied. Please enable location services and try again.';
            break;
        case error.POSITION_UNAVAILABLE:
            message += 'Location information is unavailable. Please try again later.';
            break;
        case error.TIMEOUT:
            message += 'Location request timed out. Please try again.';
            break;
        default:
            message += 'An unknown error occurred while retrieving location.';
            break;
    }
    
    showError(message);
}

// Fetch air quality data from API
async function fetchAirQualityData(lat, lon) {
    try {
        const response = await fetch(`/api/air-quality?lat=${lat}&lon=${lon}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch air quality data');
        }
        
        displayAirQualityData(data);
        
    } catch (error) {
        console.error('Error fetching air quality data:', error);
        showError(`Failed to fetch air quality data: ${error.message}`);
    }
}

// Display air quality data
function displayAirQualityData(data) {
    hideAllSections();
    
    // Update AQI display
    aqiValue.textContent = data.aqi.value;
    aqiValue.style.color = data.aqi.color;
    
    aqiDescription.textContent = data.aqi.description;
    aqiDescription.className = `aqi-description ${data.aqi.class}`;
    
    // Update location name
    const locationNameElement = document.getElementById('locationName');
    if (locationNameElement && data.location && data.location.name) {
        locationNameElement.textContent = data.location.name;
    }
    
    // Create component cards
    createComponentCards(data.components);
    
    // Create chart
    createPollutantChart(data.components);
    
    // Update protection advice
    updateProtectionAdvice(data.aqi.value);
    
    // Update overall pollution percentage
    updateOverallPollutionPercentage(data.components);
    
    // Show results with animation
    resultsSection.style.display = 'block';
    resultsSection.classList.add('fade-in');
}

// Create component cards
function createComponentCards(components) {
    componentsGrid.innerHTML = '';
    
    Object.entries(components).forEach(([key, component]) => {
        const card = createComponentCard(component);
        componentsGrid.appendChild(card);
    });
}

// Create individual component card
function createComponentCard(component) {
    const colDiv = document.createElement('div');
    colDiv.className = 'col-lg-4 col-md-6 mb-4';
    
    const progressColor = getProgressColor(component.percentage);
    
    colDiv.innerHTML = `
        <div class="component-card">
            <div class="component-header">
                <h5 class="component-name">${component.name}</h5>
                <p class="component-description">${component.description}</p>
            </div>
            <div class="component-body">
                <div class="component-value">${component.value.toFixed(2)}</div>
                <div class="component-unit">${component.unit}</div>
                <div class="progress">
                    <div class="progress-bar" 
                         style="width: ${component.percentage}%; background-color: ${progressColor};" 
                         role="progressbar" 
                         aria-valuenow="${component.percentage}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                </div>
                <div class="percentage-text">${component.percentage.toFixed(1)}% of WHO guideline</div>
            </div>
        </div>
    `;
    
    return colDiv;
}

// Get progress bar color based on percentage
function getProgressColor(percentage) {
    if (percentage <= 50) return '#00e400';  // Good - Green
    if (percentage <= 75) return '#ffcc00';  // Fair - Yellow
    if (percentage <= 100) return '#ff7e00'; // Moderate - Orange
    if (percentage <= 150) return '#ff0000'; // Poor - Red
    return '#8f3f97'; // Very Poor - Purple
}

// Create pollutant chart
function createPollutantChart(components) {
    const ctx = document.getElementById('pollutantChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (airQualityChart) {
        airQualityChart.destroy();
    }
    
    const labels = [];
    const values = [];
    const colors = [];
    
    Object.entries(components).forEach(([key, component]) => {
        labels.push(component.name);
        values.push(component.value);
        colors.push(getProgressColor(component.percentage));
    });
    
    airQualityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Concentration (µg/m³)',
                data: values,
                backgroundColor: colors,
                borderColor: colors.map(color => color + '80'),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Current Pollutant Concentrations',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Concentration (µg/m³)'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeInOutQuart'
            }
        }
    });
}

// Refresh data
function refreshData() {
    if (currentLocation) {
        showLoading('Refreshing air quality data...');
        fetchAirQualityData(currentLocation.lat, currentLocation.lon);
    } else {
        requestLocation();
    }
}

// Show loading section
function showLoading(message) {
    hideAllSections();
    loadingSection.style.display = 'block';
    const loadingText = loadingSection.querySelector('h4');
    if (loadingText) {
        loadingText.textContent = message;
    }
}

// Show error section
function showError(message) {
    hideAllSections();
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

// Add smooth scroll behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
        const href = this.getAttribute('href');
        if (href && href.length > 1) {
            e.preventDefault();
            const targetElement = document.querySelector(href);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }
    });
});


// Update protection advice based on AQI level
function updateProtectionAdvice(aqiValue) {
    const adviceContainer = document.getElementById('protectionAdvice');
    let advice = [];
    
    switch(aqiValue) {
        case 1: // Good
            advice = [
                { icon: 'fas fa-smile', text: 'Air quality is good! Perfect for outdoor activities and exercise.' },
                { icon: 'fas fa-running', text: 'Great time for jogging, cycling, or any outdoor sports.' },
                { icon: 'fas fa-window-open', text: 'Keep windows open for fresh air circulation.' }
            ];
            break;
        case 2: // Fair
            advice = [
                { icon: 'fas fa-meh', text: 'Air quality is acceptable for most people.' },
                { icon: 'fas fa-walking', text: 'Outdoor activities are generally safe.' },
                { icon: 'fas fa-heart', text: 'Sensitive individuals should monitor their comfort level.' }
            ];
            break;
        case 3: // Moderate
            advice = [
                { icon: 'fas fa-mask', text: 'Consider wearing a mask during extended outdoor activities.' },
                { icon: 'fas fa-exclamation-triangle', text: 'Sensitive people should limit prolonged outdoor exertion.' },
                { icon: 'fas fa-home', text: 'Keep indoor air clean with air purifiers if available.' }
            ];
            break;
        case 4: // Poor
            advice = [
                { icon: 'fas fa-mask', text: 'Wear a mask when going outside, especially N95 or similar.' },
                { icon: 'fas fa-times-circle', text: 'Avoid outdoor exercise and prolonged outdoor activities.' },
                { icon: 'fas fa-window-close', text: 'Keep windows closed and use air purifiers indoors.' },
                { icon: 'fas fa-lungs', text: 'People with heart/lung conditions should stay indoors.' }
            ];
            break;
        case 5: // Very Poor
            advice = [
                { icon: 'fas fa-home', text: 'Stay indoors as much as possible!' },
                { icon: 'fas fa-mask', text: 'Always wear high-quality mask (N95/P100) when outside.' },
                { icon: 'fas fa-ban', text: 'Cancel all outdoor activities and exercise.' },
                { icon: 'fas fa-phone-alt', text: 'Consult doctor if experiencing breathing difficulties.' },
                { icon: 'fas fa-air-freshener', text: 'Use air purifiers and keep all windows closed.' }
            ];
            break;
        default:
            advice = [{ icon: 'fas fa-question', text: 'Unable to determine current air quality level.' }];
    }
    
    adviceContainer.innerHTML = advice.map(item => `
        <div class="advice-item">
            <i class="${item.icon}"></i>
            <span>${item.text}</span>
        </div>
    `).join('');
}

// Update overall pollution percentage
function updateOverallPollutionPercentage(components) {
    // Calculate average percentage across all major pollutants
    const pollutants = ['pm2_5', 'pm10', 'no2', 'so2', 'o3'];
    let totalPercentage = 0;
    let count = 0;
    
    pollutants.forEach(pollutant => {
        if (components[pollutant]) {
            totalPercentage += components[pollutant].percentage;
            count++;
        }
    });
    
    const averagePercentage = count > 0 ? Math.round(totalPercentage / count) : 0;
    
    // Update the display
    const percentageElement = document.getElementById('overallPollutionPercentage');
    const summarySection = document.getElementById('pollutionSummary');
    
    if (percentageElement && summarySection) {
        percentageElement.textContent = `${averagePercentage}%`;
        
        // Apply color based on percentage level
        if (averagePercentage <= 50) {
            percentageElement.style.color = '#00e400'; // Good - Green
        } else if (averagePercentage <= 75) {
            percentageElement.style.color = '#ffcc00'; // Fair - Yellow  
        } else if (averagePercentage <= 100) {
            percentageElement.style.color = '#ff7e00'; // Moderate - Orange
        } else if (averagePercentage <= 150) {
            percentageElement.style.color = '#ff0000'; // Poor - Red
        } else {
            percentageElement.style.color = '#8f3f97'; // Very Poor - Purple
        }
        
        summarySection.style.display = 'block';
    }
}

// Hide all sections
function hideAllSections() {
    loadingSection.style.display = 'none';
    errorSection.style.display = 'none';
    resultsSection.style.display = 'none';
    
    // Also hide the pollution summary when hiding sections
    const summarySection = document.getElementById('pollutionSummary');
    if (summarySection) {
        summarySection.style.display = 'none';
    }
}

// Add smooth scroll behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
        const href = this.getAttribute('href');
        if (href && href.length > 1) {
            e.preventDefault();
            const targetElement = document.querySelector(href);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }
    });
});


// Add intersection observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll('.card, .component-card');
    animateElements.forEach(el => observer.observe(el));
});
