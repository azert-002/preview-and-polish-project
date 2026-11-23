import { describe, expect, it } from "vitest";
import { displayUsername, isValidUsername, loginEmail } from "./username";

describe("username sign-in", () => {
  it("maps the director's username admin to its private account address", () => {
    expect(loginEmail("admin")).toBe("admin@beyondwords.local");
  });
  it("ignores case and surrounding spaces", () => {
    expect(loginEmail("  Sara.B ")).toBe("sara.b@beyondwords.local");
  });
  it("shows the username, not the private address, in the users list", () => {
    expect(displayUsername("sara.b@beyondwords.local")).toBe("sara.b");
  });
  it("accepts latin letters, digits, dot, dash and underscore only", () => {
    expect(isValidUsername("sec_01")).toBe(true);
    expect(isValidUsername("سارة")).toBe(false);
    expect(isValidUsername("a b")).toBe(false);
    expect(isValidUsername("a")).toBe(false);
  });
});
