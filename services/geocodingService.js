const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'salon-booking-app/1.0';

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

async function searchPlaces(query, { limit = 5, countryCode = 'in' } = {}) {
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

async function geocodeSalonAddress({ address, city, state }) {
  const query = buildAddressQuery({ address, city, state });
  if (!query) return null;

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
  ensureApplicationCoordinates,
  hasValidCoordinates,
};
