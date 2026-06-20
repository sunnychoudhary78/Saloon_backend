'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const SALON_LOCATIONS = [
  {
    salon_name: 'Glow & Grace',
    address: 'Shipra Mall, Ahinsa Khand, Indirapuram',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6339,
    longitude: 77.3695,
  },
  {
    salon_name: 'Elite Cuts',
    address: 'Indirapuram Habitat Centre, Ahinsa Khand',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6388,
    longitude: 77.3706,
  },
  {
    salon_name: 'Urban Style Salon',
    address: 'Near Vaishali Metro Station, Sector 4',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6495,
    longitude: 77.3398,
  },
  {
    salon_name: 'Serenity Spa',
    address: 'Sahibabad Railway Station Road',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6714,
    longitude: 77.3505,
  },
  {
    salon_name: 'The Barber Lounge',
    address: 'Mohan Nagar, Ram Nagar',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6763,
    longitude: 77.3736,
  },
  {
    salon_name: 'Bliss Salon',
    address: 'Sector 62, Noida',
    city: 'Noida',
    state: 'Uttar Pradesh',
    latitude: 28.6289,
    longitude: 77.3648,
  },
  {
    salon_name: 'Bridal Studio by Meera',
    address: 'Vasundhara Sector 15',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    latitude: 28.6661,
    longitude: 77.3864,
  },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    for (const location of SALON_LOCATIONS) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id, latitude, longitude FROM ${schema}.salons WHERE salon_name = :salonName LIMIT 1`,
        {
          replacements: { salonName: location.salon_name },
          type: queryInterface.sequelize.QueryTypes.SELECT,
        }
      );

      if (!existing) {
        console.log(`Skipping ${location.salon_name} (salon not found)`);
        continue;
      }

      const latMatch = existing.latitude != null && Number(existing.latitude) === location.latitude;
      const lngMatch = existing.longitude != null && Number(existing.longitude) === location.longitude;
      if (latMatch && lngMatch) {
        console.log(`Skipping ${location.salon_name} (coordinates already set)`);
        continue;
      }

      await queryInterface.sequelize.query(
        `UPDATE ${schema}.salons
         SET address = :address,
             city = :city,
             state = :state,
             latitude = :latitude,
             longitude = :longitude,
             updated_at = :now
         WHERE id = :id`,
        {
          replacements: {
            id: existing.id,
            address: location.address,
            city: location.city,
            state: location.state,
            latitude: location.latitude,
            longitude: location.longitude,
            now,
          },
        }
      );
      console.log(`Updated location for ${location.salon_name}`);
    }
  },

  down: async () => {
    // Intentional no-op: coordinates are reference data for demo salons.
  },
};
