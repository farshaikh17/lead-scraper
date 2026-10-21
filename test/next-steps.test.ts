import { describe, expect, it } from "vitest";
import { planNextSteps, type NextStepCounts } from "../src/next-steps";

const none: NextStepCounts = { unassignedNew: 0, myWaiting: 0, noGoogle: 0, sitesUnchecked: 0, ai: { keyed: true, enabled: true, doneToday: 0, waiting: 0, problem: null } };

describe("what to do next", () => {
  it("says you're all caught up, with one button to find more, when nothing is waiting", () => {
    const s = planNextSteps(none, "member");
    expect(s.map((x) => x.key)).toEqual(["caught_up"]);
    expect(s[0].button).toBe("Find more businesses");
    expect(s[0].action).toBe("find_more");
  });

  it("orders the admin's steps: hand out new ones, own leads, Google ratings, websites, then the AI helper", () => {
    const s = planNextSteps({ unassignedNew: 120, myWaiting: 3, noGoogle: 40, sitesUnchecked: 9, ai: { keyed: false } }, "super_admin");
    expect(s.map((x) => x.key)).toEqual(["assign_new", "show_mine", "google_ratings", "check_sites", "ai_setup"]);
    expect(s[0].text).toBe("120 new businesses nobody is working yet");
    expect(s[0].button).toBe("Hand out 50"); // more than one person can work: 50 at a time
    expect(planNextSteps({ unassignedNew: 12, myWaiting: 0, noGoogle: 0, sitesUnchecked: 0, ai: null }, "admin")[0].button).toBe("Give them to someone");
    expect(s[1].text).toBe("3 of your leads are waiting for a first call or email");
    expect(s[2].button).toBe("Add Google ratings · about $0.20");
    expect(s[2].costUsd).toBe(0.2);
    expect(s[3].button).toBe("Check them (free)");
    expect(s[4].button).toBe("Turn on the free AI helper");
  });

  it("never offers members the team's work or anything that costs money", () => {
    const s = planNextSteps({ unassignedNew: 120, myWaiting: 1, noGoogle: 40, sitesUnchecked: 2, ai: { keyed: false } }, "member");
    expect(s.map((x) => x.key)).toEqual(["show_mine", "check_sites"]);
    expect(s[0].text).toBe("1 of your leads is waiting for a first call or email");
    expect(s.some((x) => x.costUsd)).toBe(false);
  });

  it("prices one run of Google ratings (the first 500) and says the rest come after", () => {
    const s = planNextSteps({ ...none, noGoogle: 2400 }, "admin").find((x) => x.key === "google_ratings")!;
    expect(s.costUsd).toBe(2.5);
    expect(s.text).toBe("2,400 businesses have no Google rating yet");
    expect(s.detail).toContain("The first 500 now");
  });

  it("shows the AI helper's progress or problem as a line without a button", () => {
    const busy = planNextSteps({ ...none, ai: { keyed: true, enabled: true, doneToday: 12, waiting: 30, problem: null } }, "admin");
    expect(busy.map((x) => x.key)).toEqual(["caught_up", "ai_status"]);
    expect(busy[1].text).toBe("AI helper is reading websites: 12 done today, 30 waiting");
    expect(busy[1].button).toBeNull();
    const bad = planNextSteps({ ...none, myWaiting: 2, ai: { keyed: true, problem: "The free daily limit is used up; it carries on tomorrow." } }, "member");
    expect(bad.map((x) => x.key)).toEqual(["show_mine", "ai_problem"]);
    expect(bad[1].button).toBeNull();
  });

  it("only offers to set up or switch on the AI helper to admins", () => {
    expect(planNextSteps({ ...none, ai: { keyed: false } }, "member").map((x) => x.key)).toEqual(["caught_up"]);
    expect(planNextSteps({ ...none, ai: { keyed: false } }, "admin").map((x) => x.key)).toEqual(["caught_up", "ai_setup"]);
    const off = { ...none, ai: { keyed: true, enabled: false, doneToday: 0, waiting: 0, problem: null } };
    expect(planNextSteps(off, "member").map((x) => x.key)).toEqual(["caught_up"]);
    const on = planNextSteps(off, "super_admin").find((x) => x.key === "ai_enable")!;
    expect(on.button).toBe("Switch it on");
  });

  it("shows at most five steps", () => {
    const s = planNextSteps({ unassignedNew: 1, myWaiting: 1, noGoogle: 1, sitesUnchecked: 1, ai: { keyed: true, problem: "Stopped." } }, "admin");
    expect(s.length).toBe(5);
  });
});

describe("paid services paused", () => {
  it("doesn't offer Google ratings when this month's budget is $0", () => {
    const base = { unassignedNew: 0, myWaiting: 0, noGoogle: 400, sitesUnchecked: 0, ai: null };
    expect(planNextSteps({ ...base, budgetLeft: 0 }, "super_admin").map((s) => s.key)).not.toContain("google_ratings");
    expect(planNextSteps({ ...base, budgetLeft: 10 }, "super_admin").map((s) => s.key)).toContain("google_ratings");
  });
});
