const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'salon-booking-app/1.0';
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACES_TEXT_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_PLACE_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const DEFAULT_BIAS_RADIUS_METERS = 50000;
/** Geographic center of India — treat as "no real bias" if client still sends it. */
const INDIA_DEFAULT_LAT = 20.5937;
const INDIA_DEFAULT_LNG = 78.9629;

const GEOCODE_RESULT_TYPE_PRIORITY = [
  'street_address',
  'premise',
  'subpremise',
  'route',
  'establishment',
  'point_of_interest',
  'neighborhood',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'locality',
];

let missingKeyWarned = false;

function getGoogleMapsApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
  if (!key && process.env.NODE_ENV === 'production' && !missingKeyWarned) {
    missingKeyWarned = true;
    console.error(
      '[geocoding] GOOGLE_MAPS_API_KEY is not set in production; falling back to Nominatim',
    );
  }
  return key;
}

function buildAddressQuery({ address, city, state }) {
  return [address, city, state].filter(Boolean).join(', ').trim();
}

function pickCityFromAddress(address = {}) {
  return (
    address.city
    || address.town
    || address.village
    || address.suburb
    || address.state_district
    || address.county
    || ''
  );
}

function pickStreetFromAddress(address = {}) {
  const parts = [
    address.house_number,
    address.road,
    address.neighbourhood,
    address.suburb,
  ].filter(Boolean);
  return parts.join(', ').trim();
}

function withStreetAlias(mapped) {
  if (!mapped) return null;
  const street = mapped.address || '';
  return {
    ...mapped,
    address: street,
    street,
  };
}

function mapNominatimHit(hit) {
  const address = hit.address || {};
  const latitude = parseFloat(hit.lat);
  const longitude = parseFloat(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const street = pickStreetFromAddress(address);
  const city = pickCityFromAddress(address);
  const state = address.state || '';
  const formattedAddress = (hit.display_name || '').trim();

  return withStreetAlias({
    place_id: String(hit.place_id),
    label: formattedAddress,
    main_text: street || formattedAddress.split(',')[0]?.trim() || '',
    secondary_text: [city, state].filter(Boolean).join(', '),
    formatted_address: formattedAddress,
    address: street || formattedAddress.split(',')[0]?.trim() || '',
    locality: address.city || address.town || address.village || address.suburb || '',
    postal_code: address.postcode || '',
    city,
    state,
    latitude,
    longitude,
  });
}

function componentValue(components, type) {
  const match = components.find((c) => c.types?.includes(type));
  return match?.long_name?.trim() || '';
}

function parseGoogleAddressComponents(components = []) {
  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const premise = componentValue(components, 'premise');
  const subpremise = componentValue(components, 'subpremise');
  const sublocality =
    componentValue(components, 'sublocality')
    || componentValue(components, 'sublocality_level_1')
    || componentValue(components, 'neighborhood');
  const locality = componentValue(components, 'locality');
  const city =
    locality
    || componentValue(components, 'administrative_area_level_2')
    || componentValue(components, 'administrative_area_level_3');
  const state = componentValue(components, 'administrative_area_level_1');
  const postalCode = componentValue(components, 'postal_code');

  const streetParts = [streetNumber, route, premise, subpremise].filter(Boolean);
  const address = streetParts.join(', ').trim();

  return {
    address,
    locality: sublocality || locality,
    city,
    state,
    postalCode,
  };
}

function geocodeResultScore(result) {
  const types = result?.types || [];
  let best = Infinity;
  for (let i = 0; i < GEOCODE_RESULT_TYPE_PRIORITY.length; i++) {
    if (types.includes(GEOCODE_RESULT_TYPE_PRIORITY[i])) {
      best = Math.min(best, i);
    }
  }
  return best;
}

function pickBestGeocodeResult(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  let best = results[0];
  let bestScore = geocodeResultScore(best);
  for (const result of results) {
    const score = geocodeResultScore(result);
    if (score < bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return best;
}

function logReverseGeocodeDiagnostics(lat, lng, data, selectedResult, mapped) {
  if (process.env.GEOCODING_DEBUG !== '1') return;

  console.log('[reverse-geocode]');
  console.log('latitude:', lat);
  console.log('longitude:', lng);

  const results = data.results || [];
  results.slice(0, 5).forEach((r, i) => {
    console.log(`Result ${i}:`);
    console.log('  types:', r.types ?? []);
    console.log('  formatted_address:', r.formatted_address ?? '');
  });

  if (selectedResult) {
    const selectedIndex = results.indexOf(selectedResult);
    console.log('selected result:', selectedIndex >= 0 ? selectedIndex : 'unknown');
    console.log('selected result types:', selectedResult.types ?? []);
    console.log('selected formatted_address:', selectedResult.formatted_address ?? '');
  }

  if (mapped) {
    console.log('mapped to Flutter:');
    console.log('  formatted_address:', mapped.formatted_address);
    console.log('  address:', mapped.address);
    console.log('  street:', mapped.street);
    console.log('  locality:', mapped.locality);
    console.log('  city:', mapped.city);
    console.log('  state:', mapped.state);
    console.log('  postal_code:', mapped.postal_code);
  }
}

function mapGooglePlaceResult(result) {
  if (!result) return null;

  const latitude = parseFloat(result.geometry?.location?.lat);
  const longitude = parseFloat(result.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const { address, locality, city, state, postalCode } = parseGoogleAddressComponents(
    result.address_components || [],
  );
  const formattedAddress = (result.formatted_address || result.name || '').trim();
  const street = address || formattedAddress.split(',')[0]?.trim() || '';

  return withStreetAlias({
    place_id: String(result.place_id || ''),
    label: formattedAddress,
    main_text: street,
    secondary_text: [locality, city, state, postalCode].filter(Boolean).join(', '),
    formatted_address: formattedAddress,
    address: street,
    locality,
    postal_code: postalCode,
    city,
    state,
    latitude,
    longitude,
  });
}

function isIndiaDefaultBias(lat, lng) {
  return (
    Math.abs(lat - INDIA_DEFAULT_LAT) < 0.001
    && Math.abs(lng - INDIA_DEFAULT_LNG) < 0.001
  );
}

function parseBiasOptions(options = {}) {
  const lat = options.lat != null ? Number(options.lat) : NaN;
  const lng = options.lng != null ? Number(options.lng) : NaN;
  const radius = options.radius != null
    ? Number(options.radius)
    : DEFAULT_BIAS_RADIUS_METERS;
  const sessiontoken = String(options.sessiontoken || '').trim();
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  // Ignore India-centroid bias so Autocomplete is not skewed to central India.
  const hasBias = hasCoords && !isIndiaDefaultBias(lat, lng);

  return {
    hasBias,
    lat,
    lng,
    radius: Number.isFinite(radius) && radius > 0
      ? Math.min(Math.max(Math.round(radius), 1000), 50000)
      : DEFAULT_BIAS_RADIUS_METERS,
    sessiontoken,
  };
}

function shouldLogGeocoding() {
  return process.env.GEOCODING_DEBUG === '1' || process.env.NODE_ENV !== 'production';
}

function logPlacesSearch(label, payload) {
  if (!shouldLogGeocoding()) return;
  console.log(`[places-search] ${label}`, payload);
}

function mapAutocompletePrediction(prediction) {
  const structured = prediction.structured_formatting || {};
  const mainText = (structured.main_text || '').trim();
  const secondaryText = (structured.secondary_text || '').trim();
  const label = (prediction.description || '').trim();

  return {
    place_id: String(prediction.place_id || ''),
    label,
    main_text: mainText || label,
    secondary_text: secondaryText,
    formatted_address: '',
    address: '',
    street: '',
    locality: '',
    postal_code: '',
    city: '',
    state: '',
    latitude: 0,
    longitude: 0,
  };
}

function mapTextSearchResult(result) {
  const name = (result.name || '').trim();
  const formatted = (result.formatted_address || result.vicinity || '').trim();
  const label = [name, formatted].filter(Boolean).join(', ') || formatted || name;
  const latitude = parseFloat(result.geometry?.location?.lat);
  const longitude = parseFloat(result.geometry?.location?.lng);

  return {
    place_id: String(result.place_id || ''),
    label,
    main_text: name || label,
    secondary_text: formatted,
    formatted_address: formatted,
    address: name || formatted.split(',')[0]?.trim() || '',
    street: name || formatted.split(',')[0]?.trim() || '',
    locality: '',
    postal_code: '',
    city: '',
    state: '',
    latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0,
  };
}

async function searchPlacesNominatim(query, { limit = 8, countryCode = 'in' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q,
        format: 'json',
        addressdetails: 1,
        limit: Math.min(Math.max(parseInt(limit, 10) || 8, 1), 10),
        countrycodes: countryCode,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 10000,
    });

    if (!Array.isArray(data)) return [];
    return data.map(mapNominatimHit).filter(Boolean);
  } catch {
    return [];
  }
}

async function searchPlacesAutocomplete(query, options = {}) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return { ok: false, results: null, status: 'NO_KEY' };

  const q = String(query || '').trim();
  if (q.length < 3) return { ok: true, results: [], status: 'SHORT_QUERY' };

  const bias = parseBiasOptions(options);
  const max = Math.min(Math.max(parseInt(options.limit, 10) || 8, 1), 10);

  try {
    const params = {
      input: q,
      key: apiKey,
      components: 'country:in',
      language: 'en',
    };

    if (bias.sessiontoken) {
      params.sessiontoken = bias.sessiontoken;
    }
    if (bias.hasBias) {
      params.location = `${bias.lat},${bias.lng}`;
      params.radius = bias.radius;
      params.origin = `${bias.lat},${bias.lng}`;
    }

    const { data } = await axios.get(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      params,
      timeout: 10000,
    });

    logPlacesSearch('autocomplete', {
      query: q,
      status: data.status,
      error_message: data.error_message || null,
      count: Array.isArray(data.predictions) ? data.predictions.length : 0,
      bias: bias.hasBias ? { lat: bias.lat, lng: bias.lng, radius: bias.radius } : null,
    });

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return { ok: false, results: null, status: data.status };
    }

    const predictions = Array.isArray(data.predictions) ? data.predictions : [];
    const results = predictions
      .slice(0, max)
      .map(mapAutocompletePrediction)
      .filter((item) => item.place_id && item.label);

    return { ok: true, results, status: data.status };
  } catch (err) {
    logPlacesSearch('autocomplete-error', { query: q, message: err.message });
    return { ok: false, results: null, status: 'NETWORK_ERROR' };
  }
}

async function searchPlacesTextSearch(query, options = {}) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const bias = parseBiasOptions(options);
  const max = Math.min(Math.max(parseInt(options.limit, 10) || 8, 1), 10);

  try {
    const params = {
      query: q,
      key: apiKey,
      language: 'en',
      region: 'in',
    };

    if (bias.hasBias) {
      params.location = `${bias.lat},${bias.lng}`;
      params.radius = bias.radius;
    }

    const { data } = await axios.get(GOOGLE_PLACES_TEXT_SEARCH_URL, {
      params,
      timeout: 10000,
    });

    logPlacesSearch('textsearch', {
      query: q,
      status: data.status,
      error_message: data.error_message || null,
      count: Array.isArray(data.results) ? data.results.length : 0,
      bias: bias.hasBias ? { lat: bias.lat, lng: bias.lng, radius: bias.radius } : null,
    });

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return [];
    }

    const hits = Array.isArray(data.results) ? data.results : [];
    return hits
      .slice(0, max)
      .map(mapTextSearchResult)
      .filter((item) => item.place_id && item.label);
  } catch (err) {
    logPlacesSearch('textsearch-error', { query: q, message: err.message });
    return [];
  }
}

/**
 * Prefer Autocomplete; fall back to Text Search for brand/salon names.
 * Nominatim only when no Google API key is configured.
 */
async function searchPlaces(query, options = {}) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return searchPlacesNominatim(query, options);
  }

  const autocomplete = await searchPlacesAutocomplete(query, options);
  if (autocomplete.ok && autocomplete.results.length > 0) {
    return autocomplete.results;
  }

  // ZERO_RESULTS, empty list, or Autocomplete hard-failure → Text Search.
  const textResults = await searchPlacesTextSearch(query, options);
  if (textResults.length > 0) return textResults;

  return [];
}

async function getPlaceDetails(placeId, options = {}) {
  const id = String(placeId || '').trim();
  if (!id) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const sessiontoken = String(options.sessiontoken || '').trim();

  try {
    const params = {
      place_id: id,
      key: apiKey,
      fields: 'place_id,formatted_address,geometry,address_components,name',
      language: 'en',
    };
    if (sessiontoken) {
      params.sessiontoken = sessiontoken;
    }

    const { data } = await axios.get(GOOGLE_PLACE_DETAILS_URL, {
      params,
      timeout: 10000,
    });

    if (data.status !== 'OK' || !data.result) return null;
    return mapGooglePlaceResult(data.result);
  } catch {
    return null;
  }
}

async function reverseGeocodeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!hasValidCoordinates(lat, lng)) return null;

  const apiKey = getGoogleMapsApiKey();
  if (apiKey) {
    try {
      const { data } = await axios.get(GOOGLE_GEOCODE_URL, {
        params: {
          latlng: `${lat},${lng}`,
          key: apiKey,
          language: 'en',
        },
        timeout: 10000,
      });

      if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        const best = pickBestGeocodeResult(data.results);
        const mapped = mapGooglePlaceResult({
          ...best,
          place_id: best.place_id || `geo:${lat},${lng}`,
          geometry: best.geometry || {
            location: { lat, lng },
          },
        });
        // Preserve the pin coordinates the user selected.
        if (mapped) {
          mapped.latitude = lat;
          mapped.longitude = lng;
        }
        logReverseGeocodeDiagnostics(lat, lng, data, best, mapped);
        if (mapped) return mapped;
      }
    } catch {
      // fall through to Nominatim
    }
  }

  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: `${lat},${lng}`,
        format: 'json',
        addressdetails: 1,
        limit: 1,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 10000,
    });

    if (!Array.isArray(data) || data.length === 0) return null;
    const mapped = mapNominatimHit(data[0]);
    if (mapped) {
      mapped.latitude = lat;
      mapped.longitude = lng;
    }
    return mapped;
  } catch {
    return null;
  }
}

async function geocodeSalonAddress({ address, city, state }) {
  const query = buildAddressQuery({ address, city, state });
  if (!query) return null;

  const apiKey = getGoogleMapsApiKey();
  if (apiKey) {
    try {
      const { data } = await axios.get(GOOGLE_GEOCODE_URL, {
        params: {
          address: query,
          key: apiKey,
          components: 'country:in',
          language: 'en',
        },
        timeout: 10000,
      });

      if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        const location = data.results[0].geometry?.location;
        const latitude = parseFloat(location?.lat);
        const longitude = parseFloat(location?.lng);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          return { latitude, longitude };
        }
      }
    } catch {
      // fall through to Nominatim
    }
  }

  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: query,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 10000,
    });

    if (!Array.isArray(data) || data.length === 0) return null;

    const hit = data[0];
    const latitude = parseFloat(hit.lat);
    const longitude = parseFloat(hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

function hasValidCoordinates(latitude, longitude) {
  const lat = latitude != null ? Number(latitude) : null;
  const lng = longitude != null ? Number(longitude) : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function ensureApplicationCoordinates(application) {
  if (hasValidCoordinates(application.latitude, application.longitude)) {
    return {
      latitude: Number(application.latitude),
      longitude: Number(application.longitude),
    };
  }

  const geocoded = await geocodeSalonAddress({
    address: application.address,
    city: application.city,
    state: application.state,
  });

  if (!geocoded) return null;
  return geocoded;
}

module.exports = {
  geocodeSalonAddress,
  searchPlaces,
  getPlaceDetails,
  reverseGeocodeCoordinates,
  ensureApplicationCoordinates,
  hasValidCoordinates,
};
