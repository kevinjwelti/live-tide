import assert from "node:assert/strict";
import {
  CURATED,
  distanceKm,
  memoryStore,
  rememberBeach,
  resolveInitialBeach,
  toggleFavorite,
  favoriteBeaches,
  recentBeaches,
} from "../src/beaches.js";
import { nearestBeach, searchBeaches, timezoneForStation } from "../src/stations.js";

assert.equal(resolveInitialBeach("").id, "boom");
assert.equal(resolveInitialBeach("?beach=pipeline").id, "pipeline");
assert.equal(resolveInitialBeach("?beach=manhattan").noaaId, "9410840");
assert.equal(resolveInitialBeach("?kiosk=1&beach=ericeira").id, "ericeira");
assert.equal(resolveInitialBeach("?beach=no-such-beach").id, "boom");

const store = memoryStore();
rememberBeach(CURATED.find((beach) => beach.id === "malibu"), store);
assert.equal(resolveInitialBeach("", store).id, "malibu");
assert.equal(recentBeaches(store)[0].id, "malibu");
assert.equal(toggleFavorite(CURATED.find((beach) => beach.id === "pipeline"), store), true);
assert.equal(favoriteBeaches(store)[0].id, "pipeline");
assert.equal(toggleFavorite(CURATED.find((beach) => beach.id === "pipeline"), store), false);

const santaKm = distanceKm(33.8847, -118.4109, 34.0083, -118.5);
const losAngelesKm = distanceKm(33.8847, -118.4109, 33.72, -118.272);
assert.ok(santaKm < losAngelesKm, "Santa Monica should be the nearer Manhattan Beach station");

const pipeline = nearestBeach(21.665, -158.053, [
  { id: "1612340", name: "Honolulu", lat: 21.306, lng: -157.867, state: "HI", tz: "Pacific/Honolulu" },
]);
assert.equal(pipeline.beach.id, "pipeline");

const harbor = nearestBeach(21.3, -157.87, [
  { id: "1612340", name: "Honolulu", lat: 21.3067, lng: -157.867, state: "HI", tz: "Pacific/Honolulu" },
]);
assert.equal(harbor.beach.id, "noaa-1612340");

const found = searchBeaches("ericeira", []);
assert.equal(found[0].id, "ericeira");
const santa = searchBeaches("santa monica", [
  { id: "9410840", name: "Santa Monica", lat: 34.008, lng: -118.5, state: "CA", tz: "America/Los_Angeles" },
]);
assert.ok(santa.some((beach) => beach.id === "noaa-9410840"));

assert.equal(timezoneForStation({ state: "HI", lng: -158 }), "Pacific/Honolulu");
assert.equal(timezoneForStation({ state: "FL", lng: -81 }), "America/New_York");
assert.equal(timezoneForStation({ state: "FL", lng: -88 }), "America/Chicago");
assert.equal(CURATED.filter((beach) => beach.model || beach.noaaId || beach.id === "boom").length, CURATED.length);

console.log("beaches ok", CURATED.length);
