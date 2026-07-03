const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'salon-booking-app/1.0';
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACE_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
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

function mapNominatimHit(hit) {
  const address = hit.address || {};
  const latitude = parseFloat(hit.lat);
  const longitude = parseFloat(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const street = pickStreetFromAddress(address);
  const city = pickCityFromAddress(address);
  const state = address.state || '';

  return {
    place_id: String(hit.place_id),
    label: hit.display_name,
    address: street || hit.display_name?.split(',')[0]?.trim() || '',
    city,
    state,
    latitude,
    longitude,
  };
}

function componentValue(components, type) {
  const match = components.find((c) => c.types?.includes(type));
  return match?.long_name?.trim() || '';
}

function parseGoogleAddressComponents(components = []) {
  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const sublocality =
    componentValue(components, 'sublocality')
    || componentValue(components, 'sublocality_level_1')
    || componentValue(components, 'neighborhood');
  const city =
    componentValue(components, 'locality')
    || componentValue(components, 'administrative_area_level_2')
    || componentValue(components, 'administrative_area_level_3');
  const state = componentValue(components, 'administrative_area_level_1');

  const streetParts = [streetNumber, route, sublocality].filter(Boolean);
  const address = streetParts.join(', ').trim();

  return { address, city, state };
}

function mapGooglePlaceResult(result) {
  if (!result) return null;

  const latitude = parseFloat(result.geometry?.location?.lat);
  const longitude = parseFloat(result.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const { address, city, state } = parseGoogleAddressComponents(
    result.address_components || [],
  );
  const label = result.formatted_address || result.name || '';

  return {
    place_id: String(result.place_id || ''),
    label,
    address: address || label.split(',')[0]?.trim() || '',
    city,
    state,
    latitude,
    longitude,
  };
}

async function searchPlacesNominatim(query, { limit = 5, countryCode = 'in' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q,
        format: 'json',
        addressdetails: 1,
        limit: Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10),
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

async function searchPlacesGoogle(query, { limit = 5 } = {}) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const q = String(query || '').trim();
  if (q.length < 3) return [];

  try {
    const { data } = await axios.get(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      params: {
        input: q,
        key: apiKey,
        components: 'country:in',
        language: 'en',
      },
      timeout: 10000,
    });

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return null;
    }

    const predictions = Array.isArray(data.predictions) ? data.predictions : [];
    const max = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10);

    return predictions.slice(0, max).map((prediction) => ({
      place_id: String(prediction.place_id || ''),
      label: prediction.description || '',
      address: '',
      city: '',
      state: '',
      latitude: 0,
      longitude: 0,
    })).filter((item) => item.place_id && item.label);
  } catch {
    return null;
  }
}

async function searchPlaces(query, options = {}) {
  const googleResults = await searchPlacesGoogle(query, options);
  if (googleResults !== null) return googleResults;
  return searchPlacesNominatim(query, options);
}

async function getPlaceDetails(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  try {
    const { data } = await axios.get(GOOGLE_PLACE_DETAILS_URL, {
      params: {
        place_id: id,
        key: apiKey,
        fields: 'place_id,formatted_address,geometry,address_components,name',
        language: 'en',
      },
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
        const mapped = mapGooglePlaceResult({
          ...data.results[0],
          place_id: data.results[0].place_id || `geo:${lat},${lng}`,
        });
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
    return mapNominatimHit(data[0]);
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
