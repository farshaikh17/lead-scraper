import { describe, expect, it } from "vitest";
import { overtureCategories, overtureToLead } from "../src/free";
import { detailsQuery, sameBusiness } from "../src/google-details";
import { TOP_100 } from "../src/taxonomy";

describe("free tier: business types", () => {
  it("maps the common trades to the open data's types", () => {
    expect(overtureCategories("Plumber")).toEqual(["plumbing"]);
    expect(overtureCategories("HVAC contractor")).toEqual(["hvac_service"]);
    expect(overtureCategories("Dentist")).toContain("dental_clinic");
    expect(overtureCategories("plumber")).toEqual(["plumbing"]); // any capitalisation
    expect(overtureCategories("Not a real type")).toEqual([]);
  });
  it("covers every Top 100 type", () => {
    expect(TOP_100.filter((c) => !overtureCategories(c).length)).toEqual([]);
  });
});

describe("free tier: an open-data record as a lead", () => {
  const row = {
    id: "08f2", name: "Emerald Plumbing", category: "plumbing", alternates: ["hvac_service"], confidence: 0.99,
    websites: ["https://www.emeraldplumbing.net"], phones: ["14078983538"], socials: ["https://www.facebook.com/emerald", "not a url"],
    emails: ["Info@EmeraldPlumbing.net", "bad@"], brand: null, street: "2311 Henderson Dr  Ste A", city: "Orlando", region: "FL",
    postcode: "32806-1901", country: "US", lat: 28.53, lng: -81.36, operating_status: "open",
  };
  it("keeps the contact details in the app's formats", () => {
    const l = overtureToLead(row);
    expect(l.googlePlaceId).toBe("ovt:08f2");
    expect(l.phone).toBe("+14078983538");
    expect(l.website).toBe("https://www.emeraldplumbing.net");
    expect(l.domain).toBe("emeraldplumbing.net");
    expect(l.emails).toEqual(["info@emeraldplumbing.net"]);
    expect(l.socials).toBe("https://www.facebook.com/emerald");
    expect(l.country).toBe("USA");
    expect(l.state).toBe("FL");
    expect(l.status).toBe("operational");
    expect(l.subCategory).toBe("Plumbing");
    expect(JSON.parse(l.raw).source).toBe("overture");
  });
  it("tidies all-capitals city names", () => {
    expect(overtureToLead({ ...row, city: "APOLLO BEACH" }).city).toBe("Apollo Beach");
    expect(overtureToLead({ ...row, city: "WINSTON-SALEM" }).city).toBe("Winston-Salem");
    expect(overtureToLead({ ...row, city: "McKinney" }).city).toBe("McKinney");
    expect(overtureToLead({ ...row, city: "  " }).city).toBeNull();
  });
  it("marks closed businesses and leaves foreign numbers without + alone", () => {
    expect(overtureToLead({ ...row, operating_status: "permanently_closed" }).status).toBe("permanently_closed");
    expect(overtureToLead({ ...row, country: "IN", phones: ["09820012345"] }).phone).toBeNull();
    expect(overtureToLead({ ...row, country: "IN", phones: ["+91 98200 12345"] }).phone).toBe("+919820012345");
  });
});

describe("paid tier: Google lookups", () => {
  it("asks Google Maps by name and address", () => {
    expect(detailsQuery({ business_name: "Emerald Plumbing", address: "2311 Henderson Dr, Orlando, FL 32806", city: "Orlando", state: "FL" }))
      .toBe("Emerald Plumbing, 2311 Henderson Dr, Orlando, FL 32806");
    expect(detailsQuery({ business_name: "Emerald Plumbing", address: null, city: "Orlando", state: "FL" })).toBe("Emerald Plumbing, Orlando, FL");
  });
  it("only accepts Google's answer when it's the same business", () => {
    expect(sameBusiness({ name: "Emerald Plumbing", phone: "+14078983538" }, { name: "Totally Different", phone: "+14078983538" })).toBe(true);
    expect(sameBusiness({ name: "Emerald Plumbing Inc.", phone: null }, { name: "Emerald Plumbing", phone: "+14070000000" })).toBe(true);
    expect(sameBusiness({ name: "Emerald Plumbing", phone: null }, { name: "Ruby Roofing", phone: null })).toBe(false);
    expect(sameBusiness({ name: null, phone: null }, { name: "Emerald Plumbing", phone: null })).toBe(false);
  });
});

import { checkClaims } from "../src/github-oidc";

describe("free collector sign-in (GitHub's signed pass)", () => {
  const ok = {
    iss: "https://token.actions.githubusercontent.com", aud: "lead-finder", exp: 2_000_000_000, repository: "Mianrodev/lead-scraper",
    ref: "refs/heads/main", workflow_ref: "Mianrodev/lead-scraper/.github/workflows/free-collect.yml@refs/heads/main",
  };
  it("accepts our workflow on main", () => expect(checkClaims(ok, "Mianrodev/lead-scraper", 1_900_000_000)).toBeNull());
  it("refuses anything else", () => {
    const now = 1_900_000_000;
    expect(checkClaims({ ...ok, repository: "someone/else" }, "Mianrodev/lead-scraper", now)).toBe("wrong repository");
    expect(checkClaims({ ...ok, ref: "refs/heads/feature" }, "Mianrodev/lead-scraper", now)).toBe("not the main branch");
    expect(checkClaims({ ...ok, workflow_ref: "Mianrodev/lead-scraper/.github/workflows/other.yml@refs/heads/main" }, "Mianrodev/lead-scraper", now)).toBe("not the free collector workflow");
    expect(checkClaims({ ...ok, aud: "someone-else" }, "Mianrodev/lead-scraper", now)).toBe("wrong audience");
    expect(checkClaims({ ...ok, exp: now - 3600 }, "Mianrodev/lead-scraper", now)).toBe("expired");
    expect(checkClaims({ ...ok, iss: "https://evil.example" }, "Mianrodev/lead-scraper", now)).toBe("wrong issuer");
  });
});

describe("the free collector's repository after a move", () => {
  const moved = {
    iss: "https://token.actions.githubusercontent.com", aud: "lead-finder", exp: 2_000_000_000, repository: "farshaikh17/lead-scraper", repository_id: "1387869989",
    ref: "refs/heads/main", workflow_ref: "farshaikh17/lead-scraper/.github/workflows/free-collect.yml@refs/heads/main",
  };
  it("is recognised by its permanent id, whatever its name", () => {
    expect(checkClaims(moved, "Mianrodev/lead-scraper", 1_900_000_000, "1387869989")).toBeNull();
    expect(checkClaims({ ...moved, repository_id: "42" }, "farshaikh17/lead-scraper", 1_900_000_000, "1387869989")).toBe("wrong repository");
  });
});
