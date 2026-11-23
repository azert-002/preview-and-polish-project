import { describe, expect, it } from "vitest";
import { directorMissing, isDefaultDirectorLogin } from "./director-setup";
import { authPassword } from "./username";

describe("built-in director account", () => {
  it("uses admin as both username and password", () => {
    expect(isDefaultDirectorLogin("admin", "admin")).toBe(true);
  });
  it("ignores case and spaces in the username only", () => {
    expect(isDefaultDirectorLogin(" Admin ", "admin")).toBe(true);
    expect(isDefaultDirectorLogin("admin", "Admin")).toBe(false);
  });
  it("does not treat other credentials as the built-in director", () => {
    expect(isDefaultDirectorLogin("admin", "123456")).toBe(false);
    expect(isDefaultDirectorLogin("sara", "admin")).toBe(false);
  });
  it("is set up only while the academy has no director", () => {
    expect(directorMissing(0, 0)).toBe(true);
    expect(directorMissing(1, 0)).toBe(false);
    expect(directorMissing(0, 1)).toBe(false);
  });
  it("fails closed when the director state cannot be read", () => {
    expect(directorMissing(null, 0)).toBe(false);
    expect(directorMissing(0, null)).toBe(false);
  });
  it("lets the five-letter password admin pass the six-character account minimum", () => {
    expect(authPassword("admin").length).toBeGreaterThanOrEqual(6);
    expect(authPassword("admin")).not.toBe(authPassword("admin1"));
    expect(authPassword("123456")).toBe("123456");
  });
});
