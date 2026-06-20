const EARTH_RADIUS_KM = 6371;

function roundDistanceKm(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 10) / 10;
}

function parseUserCoordinates(query = {}) {
  const userLat = parseFloat(query.user_lat);
  const userLng = parseFloat(query.user_lng);
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
    return null;
  }
  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return null;
  }
  return { userLat, userLng };
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function distanceKmSqlLiteral(sequelize, userLat, userLng) {
  return sequelize.literal(`
    CASE
      WHEN "Salon"."latitude" IS NOT NULL AND "Salon"."longitude" IS NOT NULL THEN (
        ${EARTH_RADIUS_KM} * acos(LEAST(1, GREATEST(-1,
          cos(radians(${userLat})) * cos(radians("Salon"."latitude")) *
          cos(radians("Salon"."longitude") - radians(${userLng})) +
          sin(radians(${userLat})) * sin(radians("Salon"."latitude"))
        )))
      )
      ELSE NULL
    END
  `);
}

function attachDistance(salonJson, userLat, userLng) {
  if (userLat == null || userLng == null) {
    return { ...salonJson, distance_km: null };
  }

  const lat = salonJson.latitude != null ? Number(salonJson.latitude) : null;
  const lng = salonJson.longitude != null ? Number(salonJson.longitude) : null;

  if (salonJson.distance_km != null) {
    return { ...salonJson, distance_km: roundDistanceKm(salonJson.distance_km) };
  }

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ...salonJson, distance_km: null };
  }

  return {
    ...salonJson,
    distance_km: roundDistanceKm(haversineDistanceKm(userLat, userLng, lat, lng)),
  };
}

function shapeSalonDistanceFields(salonJson) {
  const next = { ...salonJson };
  if (next.distance_km != null) {
    next.distance_km = roundDistanceKm(next.distance_km);
  }
  if (next.latitude != null) next.latitude = Number(next.latitude);
  if (next.longitude != null) next.longitude = Number(next.longitude);
  return next;
}

module.exports = {
  EARTH_RADIUS_KM,
  roundDistanceKm,
  parseUserCoordinates,
  haversineDistanceKm,
  distanceKmSqlLiteral,
  attachDistance,
  shapeSalonDistanceFields,
};
