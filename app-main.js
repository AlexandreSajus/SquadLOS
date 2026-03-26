import { mapPaths } from './mapPaths.js';

// Get the selected map from the URL parameters
const urlParams = new URLSearchParams(window.location.search);
const selectedMap = urlParams.get('map') || 'Manicouagan';

// Set the selected value in the dropdown
document.getElementById('map-selector').value = selectedMap;

// Add event listener to the map selector
document.getElementById('map-selector').addEventListener('change', function () {
    const selectedMap = this.value;
    console.log(`Selected map: ${selectedMap}`);
    window.location.search = `?map=${selectedMap}`;
});

// Define a custom coordinate reference system
var crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, -1, 0)
});

// Initialize the map with the custom coordinate reference system
var map = L.map('map', {
    crs: crs,
    minZoom: -1,
    attributionControl: false,
});

var heightArray = [];
var clickX = null;
var clickY = null;
var scaleX = mapPaths[selectedMap].scaleX;
var scaleY = mapPaths[selectedMap].scaleY;
var losOpacity = 0.3;
var markers = [];
var textMarkers = [];

// Recalculate the distance and azimut for each fixed marker
function refreshMarkers(markers) {
    textMarkers.forEach(function (text_marker) {
        map.removeLayer(text_marker);
    });
    markers.forEach(function (marker) {
        var markerX = Math.floor(marker.getLatLng().lng);
        var markerY = Math.floor(marker.getLatLng().lat);
        var distanceToClick = Math.sqrt(Math.pow((clickX - markerX) * scaleX, 2) + Math.pow((clickY - markerY) * scaleY, 2));
        distanceToClick = Math.round(distanceToClick * 3);
        distanceToClick = distanceToClick + "m";
        var azimutFromClick = Math.atan2((clickX - markerX) * scaleX, (clickY - markerY) * scaleY) * 180 / Math.PI + 180;
        azimutFromClick = Math.round(azimutFromClick);
        azimutFromClick = azimutFromClick + "°";
        var new_marker = L.marker([markerY, markerX], {
            icon: new L.DivIcon({
                html:
                    "<div class='text-marker'>" +
                    "<div class='text-marker-content'>" +
                    "<p>" + distanceToClick + "</p>" +
                    "<p>" + azimutFromClick + "</p>",
                className: 'text-marker-container'
            })
        }).addTo(map);
        textMarkers.push(new_marker);
    });
}

// Load the height array from the CSV file
Papa.parse(mapPaths[selectedMap].heightmap, {
    download: true,
    complete: function (results) {
        heightArray = results.data;
        heightArray = heightArray.map(function (row) {
            return row.map(function (cell) {
                return parseFloat(cell);
            });
        });

        // Define the bounds of the image overlays
        var bounds = [[0, 0], [heightArray.length, heightArray[0].length]];

        // Set the view to the center of the bounds
        var centerX = heightArray[0].length / 2;
        var centerY = heightArray.length / 2;
        map.setView([centerY, centerX], -2);

        // Add the satellite map layer
        var satelliteLayer = L.imageOverlay(mapPaths[selectedMap].satellite, bounds).addTo(map);
        satelliteLayer.setOpacity(0.75);

        // Add the color map layer
        var colorLayer = L.imageOverlay(mapPaths[selectedMap].colormap, bounds).addTo(map);
        colorLayer.setOpacity(0.75);

        // Add the contour lines layer
        var contourLayer = L.imageOverlay(mapPaths[selectedMap].contour, bounds).addTo(map);

        // Update the opacity of the satellite map layer
        document.getElementById('satellite-opacity').addEventListener('input', function (e) {
            satelliteLayer.setOpacities(e.target.value);
        });

        // Update the opacity of the color map layer
        document.getElementById('color-opacity').addEventListener('input', function (e) {
            colorLayer.setOpacity(e.target.value);
        });

        // Update the opacity of the contour lines layer
        document.getElementById('contour-opacity').addEventListener('input', function (e) {
            contourLayer.setOpacity(e.target.value);
        });

        // Update the opacity of the lines of sight layer
        document.getElementById('los-opacity').addEventListener('input', function (e) {
            losOpacity = e.target.value;
            map.fire('click');
        });

        // Display the height value when the user hovers on the map
        map.on('mousemove', function (e) {
            // Check if height array is loaded
            if (heightArray.length === 0) {
                return;
            }
            var x = Math.floor(e.latlng.lng);
            var y = Math.floor(e.latlng.lat);
            var height = heightArray[y] && heightArray[y][x] ? heightArray[y][x] : 'N/A';
            height = Math.round(height);
            if (clickX != null && clickY != null) {
                var distance = Math.sqrt(Math.pow((clickX - x) * scaleX, 2) + Math.pow((clickY - y) * scaleY, 2));
                distance = Math.round(distance * 3);
            } else {
                distance = 'N/A';
            }
            document.getElementById('height-info').innerText = 'Height: ' + height + ' m';
            document.getElementById('distance-info').innerText = 'Distance: ' + distance + ' m';
        });

        // Store the lines of sight
        var linesOfSight = [];

        // Draw lines of sight when the user clicks on the map
        map.on('click', function (e) {
            // Remove previous lines of sight
            linesOfSight.forEach(function (line) {
                map.removeLayer(line);
            });
            linesOfSight = [];

            // Remove previous marker
            map.eachLayer(function (layer) {
                if (layer instanceof L.Marker) {
                    // Check that marker is not in the other markers array
                    if (!markers.includes(layer)) {
                        map.removeLayer(layer);
                    }
                }
            });

            // Check if e and e.latlng are defined
            if (!e || !e.latlng) {
                return;
            }

            var x = Math.floor(e.latlng.lng);
            var y = Math.floor(e.latlng.lat);

            console.log(`Placed LOS marker on map ${selectedMap} at: (${x}, ${y})`);

            // Add a marker at the clicked location
            var marker = L.marker([y, x]).addTo(map);

            marker._icon.classList.add('huechange');
            clickX = x;
            clickY = y;
            var maxDistance = 10000;
            var lines = [];

            for (var aimAngle = 0; aimAngle < 360; aimAngle += 1) {
                var endPoint = calculateLineOfSight(x, y, aimAngle, maxDistance);
                // Add all visible segments to the lines array
                for (var i = 0; i < endPoint.length - 1; i++) {
                    if (i % 2 == 0) {
                        lines.push([
                            [endPoint[i][1], endPoint[i][0]],
                            [endPoint[i + 1][1], endPoint[i + 1][0]]
                        ]);
                    }
                }
            }
            refreshMarkers(markers);

            // Draw the lines of sight
            lines.forEach(function (line) {
                var polyline = L.polyline(line, { color: 'red', weight: 3, opacity: losOpacity }).addTo(map);
                linesOfSight.push(polyline);
            });
        });

        // Hide the spinner once the map is fully loaded
        document.getElementById('spinner').style.display = 'none';
    }
});

// Add or remove static markers
map.on('mousedown', function (e) {
    if (e.originalEvent.button === 1) { // Middle mouse button
        var x = Math.floor(e.latlng.lng);
        var y = Math.floor(e.latlng.lat);
        console.log(`Placed marker on map ${selectedMap} at: (${x}, ${y})`);
        var markerCounter = markers.length + 1;
        var marker = L.marker([y, x]).addTo(map);
        var distanceToClick = Math.sqrt(Math.pow((clickX - x) * scaleX, 2) + Math.pow((clickY - y) * scaleY, 2));
        distanceToClick = Math.round(distanceToClick);
        distanceToClick = distanceToClick + "m";
        var azimutFromClick = Math.atan2((clickX - x) * scaleX, (clickY - y) * scaleY) * 180 / Math.PI + 180;
        azimutFromClick = Math.round(azimutFromClick);
        azimutFromClick = azimutFromClick + "°";
        markers.push(marker);
        refreshMarkers(markers);

        // Add click event to remove marker
        marker.on('click', function () {
            console.log(`Removed marker on map ${selectedMap} at: (${marker.getLatLng().lng}, ${marker.getLatLng().lat})`);
            map.removeLayer(marker);
            markers = markers.filter(function (m) {
                return m !== marker;
            });
            refreshMarkers(markers);
        });
    }
});

// Function to calculate the segments of line of sight from (x, y) in the direction of aimAngle
// up to a maximum distance of maxDistance
function calculateLineOfSight(x, y, aimAngle, maxDistance) {
    var rad = aimAngle * Math.PI / 180;
    var dx = Math.cos(rad);
    var dy = Math.sin(rad);
    var distance = 0;
    var playerHeight = 2;
    var step = 5;
    if (
        y >= 0 && y < heightArray.length &&
        x >= 0 && x < heightArray[0].length &&
        typeof heightArray[y][x] === 'number'
    ) {
        playerHeight = playerHeight + heightArray[y][x];
    }
    var visible = true;
    var angle = -Math.PI / 2;
    var blockingAngle = 0;
    var visible_segments = [[x, y]];
    var currentX = x;
    var currentY = y;

    while (distance < maxDistance) {
        currentX += dy * step;
        currentY += dx * step;

        // Use Math.floor instead of Math.round to prevent excessive snapping
        var gridX = Math.floor(currentX);
        var gridY = Math.floor(currentY);

        distance += step;

        if (gridX < 0 || gridX >= heightArray[0].length || gridY < 0 || gridY >= heightArray.length) {
            if (visible === true) {
                visible_segments.push([currentX, currentY]); // Use floating-point for smoother results
            }
            break;
        }

        var newHeight = heightArray[gridY][gridX];
        var newAngle = Math.atan((newHeight - playerHeight) / distance);
        if (newAngle < angle && visible === true) {
            visible = false;
            blockingAngle = newAngle;
            visible_segments.push([currentX, currentY]); // Preserve floating-point precision
        }
        if (newAngle > blockingAngle && visible === false) {
            visible = true;
            visible_segments.push([currentX, currentY]);
        }
        angle = newAngle;
    }

    return visible_segments;
}