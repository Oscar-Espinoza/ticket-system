-- The local Neon proxy (service neon-proxy) looks endpoints up here; it must
-- exist (it may stay empty) before the app connects. Runs once, on an empty volume.
CREATE SCHEMA IF NOT EXISTS neon_control_plane;
CREATE TABLE IF NOT EXISTS neon_control_plane.endpoints (
  endpoint_id varchar(255) NOT NULL PRIMARY KEY,
  allowed_ips varchar(255)
);
