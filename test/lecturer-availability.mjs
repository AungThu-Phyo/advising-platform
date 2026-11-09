import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = mkdtempSync(join(tmpdir(), "advising-availability-test-"));
process.on("exit", () => rmSync(tempDir, { recursive: true, force: true }));
const output = join(tempDir, "availability.mjs");
buildSync({ entryPoints: ["src/services/lecturerAvailability.ts"], bundle: true, platform: "node", format: "esm", outfile: output });
const {
  generateLecturerSlots,
  normalizeLecturerRecord,
  validateAvailabilityInput,
  validateOverrideInput,
} = await import(pathToFileURL(output).href);

const record = normalizeLecturerRecord({
  uid: "digital-technology-1",
  name: "Taylor Morgan",
  email: "taylor.morgan@example.test",
  department: "Software Engineering",
  office: null,
  title: "Assistant Professor",
  schoolId: "digital-technology",
  schoolName: "School of Applied Digital Technology",
  reviews: null,
  updatedAt: "2026-11-09T15:18:45+07:00",
});
assert.equal(record.uid, "digital-technology-1");
assert.equal(record.office, null);
assert.equal(validateAvailabilityInput({ schoolId: "digital-technology", dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }).timezone, "Asia/Bangkok");
assert.equal(validateOverrideInput({ schoolId: "digital-technology", date: "2026-11-12", isAvailable: false }).isAvailable, false);
assert.throws(() => validateAvailabilityInput({ schoolId: "digital-technology", dayOfWeek: 1, startTime: "12:00", endTime: "09:00" }));

const profile = {
  uid: "digital-technology-1",
  name: "Taylor Morgan",
  email: "taylor.morgan@example.test",
  department: "Software Engineering",
  office: null,
  title: "Assistant Professor",
  school_id: "digital-technology",
  school_name: "School of Applied Digital Technology",
};
const db = {
  prepare(query) {
    return {
      bind(...values) {
        return {
          async first() {
            if (query.includes("lecturer_profiles")) return profile;
            if (query.includes("availability_overrides")) return null;
            if (query.includes("FROM users")) return { id: "advisor-1" };
            return null;
          },
          async all() {
            if (query.includes("weekly_availability")) return { results: [{ start_time: "09:00", end_time: "12:00", timezone: "Asia/Bangkok" }] };
            if (query.includes("advisor_slots")) return { results: [] };
            return { results: [] };
          },
        };
      },
    };
  },
};
const slots = await generateLecturerSlots(db, "digital-technology-1", "2099-11-12", 60, new Date("2099-11-01T00:00:00Z"));
assert.deepEqual(slots.map((slot) => [slot.startTime, slot.endTime]), [["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"]]);
assert.equal(slots.every((slot) => slot.bookable), true);
console.log("Lecturer availability tests passed.");
