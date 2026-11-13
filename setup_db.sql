-- 1. Create development user if not exists, and set password
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'salonbookinguser') THEN
      CREATE USER salonbookinguser WITH PASSWORD 'SalonBooking@123';
   ELSE
      ALTER USER salonbookinguser WITH PASSWORD 'SalonBooking@123';
   END IF;
END
$do$;

-- 2. Create development database if not exists
SELECT 'CREATE DATABASE salon_booking_db OWNER salonbookinguser'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'salon_booking_db')\gexec

-- 3. Grants and Schema inside salon_booking_db
\connect salon_booking_db

CREATE SCHEMA IF NOT EXISTS salon_booking_schema AUTHORIZATION salonbookinguser;

REVOKE ALL ON SCHEMA salon_booking_schema FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA salon_booking_schema TO salonbookinguser;

ALTER DEFAULT PRIVILEGES FOR ROLE salonbookinguser IN SCHEMA salon_booking_schema
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salonbookinguser;

ALTER DEFAULT PRIVILEGES FOR ROLE salonbookinguser IN SCHEMA salon_booking_schema
  GRANT USAGE, SELECT ON SEQUENCES TO salonbookinguser;

ALTER ROLE salonbookinguser SET search_path = 'salon_booking_schema', public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

GRANT CONNECT ON DATABASE salon_booking_db TO salonbookinguser;
GRANT ALL PRIVILEGES ON DATABASE salon_booking_db TO salonbookinguser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA salon_booking_schema TO salonbookinguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA salon_booking_schema TO salonbookinguser;

