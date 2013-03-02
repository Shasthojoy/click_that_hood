/*
 * Click That ’Hood
 *
 * Front-end written (mostly) by Marcin Wichary, Code for America fellow 
 * in the year 2013.
 *
 * Note: This code is really gnarly. It’s been done under a lot of time 
 * pressure and there’s a lot of shortcut and tech debt. It might be improved
 * later if there’s time later.
 */

var EASY_MODE_COUNT = 20;

var HIGHLIGHT_DELAY = 1500;
var NEXT_GUESS_DELAY = 1000;

var REMOVE_NEIGHBORHOOD_ANIMATE_GUESS_DELAY = 2000;

var SMALL_NEIGHBORHOOD_THRESHOLD = 8;

var MAP_VERT_PADDING = 50;

var MAP_OVERLAY_TILES_COUNT_X = 2;
var MAP_OVERLAY_TILES_COUNT_Y = 2;
var MAP_OVERLAY_OVERLAP_RATIO = .95;
var MAP_OVERLAY_SIZE_THRESHOLD = 500;

var MAP_OVERLAY_DEFAULT_ZOOM = 12;

var GOOGLE_MAPS_TILE_SIZE = 640;
var GOOGLE_MAPS_DEFAULT_SCALE = 512;
var D3_DEFAULT_SCALE = 500;

var GOOGLE_MAPS_API_KEY = 'AIzaSyCMwHPyd0ntfh2RwROQmp_ozu1EoYo9AXk';

var startTime = 0;
var timerIntervalId;

var totalNeighborhoodsCount;
var neighborhoods = [];
var neighborhoodsToBeGuessed = [];
var neighborhoodsGuessed = [];

var geoData;
var geoMapPath;

var mapClickable = false;

var easyMode = false;
var mainMenu = false;

var pixelRatio;

var canvasWidth, canvasHeight;

var centerLat, centerLon;
var latSpread, lonSpread;

var cityId = '';

var bodyLoaded = false;
var geoDataLoaded = false;

function lonToTile(lon, zoom) { 
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function latToTile(lat, zoom) { 
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 
      1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

function tileToLon(x, zoom) {
  return x / Math.pow(2, zoom) * 360 - 180;
}

function tileToLat(y, zoom) {
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return 180 / Math.PI * Math.atan(.5 * (Math.exp(n) - Math.exp(-n)));
}

function updateCanvasSize() {
  canvasWidth = document.querySelector('#map').offsetWidth;
  canvasHeight = 
      document.querySelector('#map').offsetHeight - MAP_VERT_PADDING * 2;
}

function calculateMapSize() {
  var minLat = 99999999;
  var maxLat = -99999999;
  var minLon = 99999999;
  var maxLon = -99999999;

  // TODO move outside
  function findMinMax(lon, lat) {
    if (lat > maxLat) {
      maxLat = lat;
    }
    if (lat < minLat) {
      minLat = lat;
    }
    if (lon > maxLon) {
      maxLon = lon;
    }
    if (lon < minLon) {
      minLon = lon;
    }
  }

  for (var i in geoData.features) {
    for (var j in geoData.features[i].geometry.coordinates[0]) {
      if (geoData.features[i].geometry.coordinates[0][j].length && 
          typeof geoData.features[i].geometry.coordinates[0][j][0] != 'number') {
        for (var k in geoData.features[i].geometry.coordinates[0][j]) {
          var lon = geoData.features[i].geometry.coordinates[0][j][k][0];
          var lat = geoData.features[i].geometry.coordinates[0][j][k][1];

          findMinMax(lon, lat);
        }
      } else if (geoData.features[i].geometry.coordinates[0][j].length) {
        var lon = geoData.features[i].geometry.coordinates[0][j][0];
        var lat = geoData.features[i].geometry.coordinates[0][j][1];

        findMinMax(lon, lat);
      }
    }
  }

  centerLat = (minLat + maxLat) / 2;
  centerLon = (minLon + maxLon) / 2;
  latSpread = maxLat - minLat;
  lonSpread = maxLon - minLon;

  updateCanvasSize();

  var zoom = MAP_OVERLAY_DEFAULT_ZOOM;
  var tile = latToTile(centerLat, zoom);
  var latStep = (tileToLat(tile + 1, zoom) - tileToLat(tile, zoom));

  // Calculate for height first
  // TODO: not entirely sure where these magic numbers are coming from
  globalScale = 
      ((D3_DEFAULT_SCALE * 180) / latSpread * (canvasHeight - 50)) / 
          GOOGLE_MAPS_DEFAULT_SCALE / 0.045 * (-latStep);

  // Calculate width according to that scale
  var width = globalScale / (D3_DEFAULT_SCALE * 360) * 
      lonSpread * GOOGLE_MAPS_DEFAULT_SCALE;

  if (width > canvasWidth) {
    globalScale = ((D3_DEFAULT_SCALE * 360) / lonSpread * canvasWidth) / 
        GOOGLE_MAPS_DEFAULT_SCALE;
  }

  geoMapPath = d3.geo.path().projection(
      d3.geo.mercator().center([centerLon, centerLat]).
      scale(globalScale).translate([canvasWidth / 2, canvasHeight / 2]));
}

function loadGeoData() {
  updateCanvasSize();

  mapSvg = d3.select('#svg-container').append('svg')
      .attr('width', canvasWidth)
      .attr('height', canvasHeight);    

  var url = 'data/' + cityId + '.geojson';
  queue().defer(d3.json, url).await(onGeoDataLoad);
}

function removeSmallNeighborhoods() {
  var els = document.querySelectorAll('#map .neighborhood');

  someSmallNeighborhoodsRemoved = false;

  for (var i = 0, el; el = els[i]; i++) {
    var boundingBox = el.getBBox();

    if ((boundingBox.width < SMALL_NEIGHBORHOOD_THRESHOLD) || 
        (boundingBox.height < SMALL_NEIGHBORHOOD_THRESHOLD)) {
      var name = el.getAttribute('name');

      neighborhoods.splice(neighborhoods.indexOf(name), 1);

      makeNeighborhoodInactive(name);

      totalNeighborhoodsCount--;

      someSmallNeighborhoodsRemoved = true;
    }
  }

  if (someSmallNeighborhoodsRemoved) {
    document.querySelector('footer .neighborhoods-removed').classList.add('visible');
  }
}

function updateCount() {
  if (totalNeighborhoodsCount <= EASY_MODE_COUNT) {
    easyModeCount = totalNeighborhoodsCount;

    document.body.classList.add('no-difficult-game');
  } else {
    easyModeCount = EASY_MODE_COUNT;
  }

  var els = document.querySelectorAll('.easy-mode-count');
  for (var i = 0, el; el = els[i]; i++) {
    el.innerHTML = easyModeCount;
  }

  var els = document.querySelectorAll('.hard-mode-count');
  for (var i = 0, el; el = els[i]; i++) {
    el.innerHTML = totalNeighborhoodsCount;
  }
}

function everythingLoaded() {
  if (!mainMenu) {
    calculateMapSize();

    prepareMapOverlay();
    resizeMapOverlay();

    prepareNeighborhoods();

    createMap();

    removeSmallNeighborhoods();
    updateCount();

    startIntro();
  }
}

function onGeoDataLoad(error, data) {
  geoData = data;

  geoDataLoaded = true;

  checkIfEverythingLoaded();
}

function prepareNeighborhoods() {
  neighborhoods = [];

  for (var i in geoData.features) {
    neighborhoods.push(geoData.features[i].properties.name);
  }
  neighborhoods.sort();

  totalNeighborhoodsCount = neighborhoods.length;
}

function createMap() {
  mapSvg
    .selectAll('path')
    .data(geoData.features)
    .enter()
    .append('path')
    .attr('d', geoMapPath)
    .attr('class', 'neighborhood unguessed')
    .attr('name', function(d) { return d.properties.name; })
    .on('click', function(d) {
      var el = d3.event.target || d3.event.toElement;

      if (!el.getAttribute('inactive')) {      
        handleNeighborhoodClick(el, d.properties.name);
      }
    })
    .on('mousedown', function(d) {
      d3.event.preventDefault();
    })
    .on('mouseover', function(d) {
      // TODO make a function
      var el = d3.event.target || d3.event.toElement;

      var boundingBox = el.getBBox();

      var hoverEl = document.querySelector('#neighborhood-hover');

      hoverEl.innerHTML = d.properties.name;  

      hoverEl.style.left = 
          (boundingBox.x + boundingBox.width / 2 - hoverEl.offsetWidth / 2) + 'px';
      hoverEl.style.top = (boundingBox.y + boundingBox.height) + 'px';

      hoverEl.classList.add('visible');  

      if (el.getAttribute('inactive')) {
        hoverEl.classList.add('inactive');
      } else {
        hoverEl.classList.remove('inactive');
      }
    })
    .on('mouseout', function(d) {
      // TODO use target
      document.querySelector('#neighborhood-hover').classList.remove('visible');  
    });

  onResize();
}

function setMapClickable(newMapClickable) {
  mapClickable = newMapClickable;

  if (mapClickable) {
    document.body.classList.remove('no-hover');
  } else {
    document.body.classList.add('no-hover');    
  }
}

function animateNeighborhoodGuess(el) {
  var animEl = el.cloneNode(true);
  if (animEl.classList) {
    el.parentNode.appendChild(animEl);

    animEl.classList.remove('guessed');
    animEl.classList.add('guessed-animation');

    window.setTimeout(function() {
      animEl.classList.add('animate');
    }, 0);

    window.setTimeout(function() { animEl.parentNode.removeChild(animEl); }, REMOVE_NEIGHBORHOOD_ANIMATE_GUESS_DELAY);
  }
}

function handleNeighborhoodClick(el, name) {
  if (!mapClickable) {
    return;
  }

  // Assuming accidental click on a neighborhood already guessed
  // TODO does this still work?
  if (neighborhoodsGuessed.indexOf('name') != -1) {
    return;
  }

  setMapClickable(false);

  if (name == neighborhoodToBeGuessedNext) {
    if (el.classList) {
      el.classList.remove('unguessed');
      el.classList.add('guessed');

      animateNeighborhoodGuess(el);
    } else {
      // Fix for early Safari 6 not supporting classes on SVG objects
      el.style.fill = 'rgba(0, 255, 0, .25)';
      el.style.stroke = 'transparent';
    }

    neighborhoodsGuessed.push(name);

    neighborhoodsToBeGuessed.splice(neighborhoodsToBeGuessed.indexOf(name), 1);

    updateGameProgress();

    if (neighborhoodsToBeGuessed.length == 0) {
      gameOver();
    } else {
      window.setTimeout(nextGuess, NEXT_GUESS_DELAY);
    }
  } else {
    if (el.classList) {
      el.classList.remove('unguessed');
      el.classList.add('wrong-guess');
    } else {
      // Fix for early Safari 6 not supporting classes on SVG objects
      el.style.fill = 'rgba(255, 0, 0, .7)';
      el.style.stroke = 'white';
      el.id = 'safari-wrong-guess';
    }

    var correctEl = document.querySelector('#map svg [name="' + neighborhoodToBeGuessedNext + '"]');
    if (correctEl.classList) {
      correctEl.classList.add('right-guess');
    } else {
      // Fix for early Safari 6 not supporting classes on SVG objects
      correctEl.style.webkitAnimationName = 'blink';
      correctEl.style.webkitAnimationDuration = '500ms';
      correctEl.style.webkitAnimationIterationCount = 'infinite';
      correctEl.id = 'safari-right-guess';
    }

    window.setTimeout(removeNeighborhoodHighlights, HIGHLIGHT_DELAY);
    window.setTimeout(nextGuess, HIGHLIGHT_DELAY + NEXT_GUESS_DELAY);
  }

  neighborhoodToBeGuessedNext = '';
  updateNeighborhoodDisplay();
}

function updateGameProgress() {
  document.querySelector('#count').innerHTML = 
      neighborhoodsGuessed.length + ' of ' + 
      (neighborhoodsGuessed.length + neighborhoodsToBeGuessed.length);
}

function removeNeighborhoodHighlights() {
  var el = document.querySelector('#map svg .wrong-guess');
  if (el) {
    el.classList.remove('wrong-guess');
    el.classList.add('unguessed');
  }
  var el = document.querySelector('#map svg .right-guess');
  if (el) {
    el.classList.remove('right-guess');
    el.classList.add('unguessed');
  }

  // Fix for early Safari 6 not supporting classes on SVG objects
  var el = document.querySelector('#safari-wrong-guess');
  if (el) {
    el.id = '';
    el.style.stroke = 'white';
    el.style.fill = '';
  }
  var el = document.querySelector('#safari-right-guess');
  if (el) {
    el.id = '';
    el.style.webkitAnimationName = '';
    el.style.stroke = 'white';
    el.style.fill = '';
  }
}

function updateNeighborhoodDisplay() {
  if (neighborhoodToBeGuessedNext) {
    document.querySelector('#neighborhood-guess').classList.add('visible');  
  } else {
    document.querySelector('#neighborhood-guess').classList.remove('visible');      
  }

  document.querySelector('#neighborhood-guess span').innerHTML = 
    neighborhoodToBeGuessedNext;  
}

function nextGuess() {
  setMapClickable(true);

  var pos = Math.floor(Math.random() * neighborhoodsToBeGuessed.length);

  neighborhoodToBeGuessedNext = neighborhoodsToBeGuessed[pos];
  updateNeighborhoodDisplay();
}

function startIntro() {
  document.querySelector('#loading').classList.remove('visible');
  document.querySelector('#intro').classList.add('visible');
}

function makeNeighborhoodInactive(name) {
  var el = document.querySelector('#map svg [name="' + name + '"]');

  el.setAttribute('inactive', true);
}

function removeNeighborhoodsForEasyMode() {
  while (neighborhoodsToBeGuessed.length > EASY_MODE_COUNT) {
    var pos = Math.floor(Math.random() * neighborhoodsToBeGuessed.length);

    var name = neighborhoodsToBeGuessed[pos];

    makeNeighborhoodInactive(name);

    neighborhoodsToBeGuessed.splice(pos, 1);
  }
}

function reloadPage() {
  location.reload();
}

function startGame(useEasyMode) {
  document.querySelector('#intro').classList.remove('visible');  
  document.querySelector('#cover').classList.remove('visible');

  neighborhoodsToBeGuessed = [];
  for (var i in neighborhoods) {
    neighborhoodsToBeGuessed.push(neighborhoods[i]);
  }

  easyMode = useEasyMode;
  if (easyMode) {
    removeNeighborhoodsForEasyMode();
  }

  updateGameProgress();

  startTime = new Date().getTime();
  timerIntervalId = window.setInterval(updateTimer, 100);

  window.setTimeout(nextGuess, NEXT_GUESS_DELAY);
}

function createTimeout(fn, data, delay) {
  window.setTimeout(function() { fn.call(null, data); }, delay);
}

function gameOver() {
  setMapClickable(false);
  window.clearInterval(timerIntervalId);

  var els = document.querySelectorAll('#map .guessed');

  // TODO constants
  var timer = 300;
  var timerDelta = 100;
  var timerDeltaDiff = 5;
  var TIMER_DELTA_MIN = 10; 

  for (var i = 0, el; el = els[i]; i++) {
    createTimeout(function(el) { animateNeighborhoodGuess(el); }, el, timer);

    timer += timerDelta;
    timerDelta -= timerDeltaDiff;
    if (timerDelta < TIMER_DELTA_MIN) {
      timerDelta = TIMER_DELTA_MIN;
    }
  }

  // TODO constants
  window.setTimeout(gameOverPart2, timer + 1000);
}

function gameOverPart2() {
  document.querySelector('#cover').classList.add('visible');
  document.querySelector(easyMode ? '#congrats-easy' : '#congrats-hard').classList.add('visible');  
}

function updateTimer() {
  var elapsedTime = Math.floor((new Date().getTime() - startTime) / 100);

  var tenthsOfSeconds = elapsedTime % 10;

  var seconds = Math.floor(elapsedTime / 10) % 60;
  if (seconds < 10) {
    seconds = '0' + seconds;
  }

  var minutes = Math.floor(elapsedTime / 600);

  document.querySelector('#time').innerHTML = 
    minutes + ':' + seconds + '.' + tenthsOfSeconds;
}

function getGoogleMapsUrl(lat, lon, zoom, type) {
  var url = 'http://maps.googleapis.com/maps/api/staticmap' +
      '?center=' + lat + ',' + lon +
      '&zoom=' + zoom + 
      '&size=' + GOOGLE_MAPS_TILE_SIZE + 'x' + GOOGLE_MAPS_TILE_SIZE +
      '&key=' + GOOGLE_MAPS_API_KEY +
      '&sensor=false' +
      '&scale=' + pixelRatio + 
      '&maptype=' + type + 
      '&format=jpg';

  return url;
}

function prepareMapOverlay() {
  for (var x = 0; x < MAP_OVERLAY_TILES_COUNT_X; x++) {
    for (var y = 0; y < MAP_OVERLAY_TILES_COUNT_Y; y++) {
      var imgEl = document.createElement('img');

      document.querySelector('#google-maps-overlay').appendChild(imgEl);
    }
  }
}

function resizeMapOverlay() {
  updateCanvasSize();

  // TODO unhardcode
  var size = globalScale * 0.0012238683395795992 * 0.995 / 2;

  // TODO remove global
  zoom = MAP_OVERLAY_DEFAULT_ZOOM;

  while (size < MAP_OVERLAY_SIZE_THRESHOLD) {
    size *= 2;
    zoom--;
  }

  var tile = latToTile(centerLat, zoom);

  var longStep = 
      (tileToLon(1, zoom) - tileToLon(0, zoom)) / 256 * GOOGLE_MAPS_TILE_SIZE;
  var latStep = 
      (tileToLat(tile + 1, zoom) - tileToLat(tile, zoom)) / 256 * GOOGLE_MAPS_TILE_SIZE;

  var startLat = centerLat - latStep / 2;
  var startLon = centerLon - longStep / 2;

  var offsetX = canvasWidth / 2 - size;
  var offsetY = canvasHeight / 2 - size + 50;

  var els = document.querySelectorAll('#google-maps-overlay img');
  var elCount = 0;
  for (var x = 0; x < MAP_OVERLAY_TILES_COUNT_X; x++) {
    for (var y = 0; y < MAP_OVERLAY_TILES_COUNT_Y; y++) {
      var el = els[elCount];
      elCount++;

      var url = getGoogleMapsUrl(
          startLat + y * latStep * MAP_OVERLAY_OVERLAP_RATIO, 
          startLon + x * longStep * MAP_OVERLAY_OVERLAP_RATIO, 
          zoom, 
          'satellite');
      el.src = url;

      el.style.width = size + 'px';
      el.style.height = size + 'px';

      el.style.left = (offsetX + size * x * MAP_OVERLAY_OVERLAP_RATIO) + 'px';
      el.style.top = (offsetY + size * y * MAP_OVERLAY_OVERLAP_RATIO) + 'px';
    }
  }
}

function onResize() {
  if (!mainMenu) {
    calculateMapSize();
    resizeMapOverlay();

    mapSvg.attr('width', canvasWidth);
    mapSvg.attr('height', canvasHeight);
    mapSvg.selectAll('path').attr('d', geoMapPath);
  }
}

function getCityId() {
  var cityMatch = location.href.match(/[\?\&]city=([^&]*)/);

  if (cityMatch && cityMatch[1]) {
    if (CITY_DATA[cityMatch[1]]) {
      cityId = cityMatch[1];
    }
  }      

  if (!cityId) {
    mainMenu = true;
  }
}

function updateFooter() {
  if (CITY_DATA[cityId].dataUrl) {
    document.querySelector('footer .data-source a').href = 
        CITY_DATA[cityId].dataUrl;
    document.querySelector('footer .data-source a').innerHTML = 
        CITY_DATA[cityId].dataTitle;
    document.querySelector('footer .data-source').classList.add('visible');
  }

  if (CITY_DATA[cityId].authorTwitter) {
    document.querySelector('footer .author a').href = 
        'http://twitter.com/' + CITY_DATA[cityId].authorTwitter;
    document.querySelector('footer .author a').innerHTML = 
        '@' + CITY_DATA[cityId].authorTwitter;
    document.querySelector('footer .author').classList.add('visible');
  } 

  if (CITY_DATA[cityId].calloutUrl) {
    var el = document.querySelector('#callout');
    el.innerHTML = CITY_DATA[cityId].calloutTitle;
    el.href = CITY_DATA[cityId].calloutUrl;
    el.classList.add('visible');
  }
}

function resizeLogoIfNecessary() {
  var headerEl = document.querySelector('header');
  var el = document.querySelector('body > header .location-name');

  var ratio = el.offsetWidth / headerEl.offsetWidth;

  if (ratio > 1) {
    var el = document.querySelector('body > header .names');

    // TODO const
    el.querySelector('.location-name').style.fontSize = (48 / ratio) + 'px';
    el.querySelector('.state-or-country').style.fontSize = (42 / ratio) + 'px';
  }
}

function prepareLogo() {
  document.querySelector('header .state-or-country').innerHTML = 
      CITY_DATA[cityId].stateName || CITY_DATA[cityId].countryName;

  document.querySelector('header .annotation').innerHTML = 
      CITY_DATA[cityId].annotation || '';

  var els = document.querySelectorAll('.location-name');
  for (var i = 0, el; el = els[i]; i++) {
    el.innerHTML = CITY_DATA[cityId].locationName;
  }

  resizeLogoIfNecessary();
}

function prepareMainMenu() {
  document.body.classList.add('main-menu');

  var ids = [];
  for (var id in CITY_DATA) {
    ids.push(id);
  }
  ids.sort();

  for (var id in ids) {
    var cityData = CITY_DATA[ids[id]];

    var el = document.createElement('li');
    el.innerHTML = 
        '<a href="?city=' + ids[id] + '">' +
        '<span class="map">' +
        '<img src="http://maps.googleapis.com/maps/api/staticmap?center=' + 
        encodeURIComponent(cityData.googleMapsQuery) + 
        '&key=AIzaSyCMwHPyd0ntfh2RwROQmp_ozu1EoYo9AXk' +
        '&zoom=11&maptype=terrain&size=200x240&sensor=false&scale=' + pixelRatio + '"></span>' +
        '<header>' + 
        '<span class="location-name">' + cityData.locationName + '</span>' +
        '<span class="state-or-country">' + (cityData.stateName || cityData.countryName) + '</span>' +
        '<span class="annotation">' + (cityData.annotation || '') + '</span>' +
        '</header></a>';

    document.querySelector('#main-menu .cities').appendChild(el);
  }

  var el = document.createElement('li');
  el.classList.add('add');
  el.innerHTML = '<a target="_blank" href="https://docs.google.com/document/d/1ePUmeH1jgsnjiByGfToIU1DTGqn6OPFWgkRC9m03IqE/edit?usp=sharing"><header><span class="location-name">Add your city</span></header></a>';
  document.querySelector('#main-menu .cities').appendChild(el);

  document.querySelector('#main-menu').classList.add('visible');
}

function getEnvironmentInfo() {
  pixelRatio = window.devicePixelRatio || 1;
}

function removeHttpsIfPresent() {
  // Gets out of HTTPS to do HTTP, because D3 doesn’t allow linking via 
  // HTTPS. But there’s a better way to deal with all of this, I feel
  // (hosting our own copy of D3?).
  if (location.protocol == 'https:') {
    location.replace(location.href.replace(/https:\/\//, 'http://'));
  }
}

function checkIfEverythingLoaded() {
  if (geoDataLoaded && bodyLoaded) {
    everythingLoaded();
  }
}

function onBodyLoad() {
  bodyLoaded = true;
  checkIfEverythingLoaded();
}

function main() {
  window.addEventListener('load', onBodyLoad, false);
  window.addEventListener('resize', onResize, false);

  removeHttpsIfPresent();

  getEnvironmentInfo();
  getCityId();

  if (mainMenu) {
    prepareMainMenu();
  } else {
    document.querySelector('#cover').classList.add('visible');
    document.querySelector('#loading').classList.add('visible');

    prepareLogo();
    updateFooter();
    loadGeoData();
  }
}
