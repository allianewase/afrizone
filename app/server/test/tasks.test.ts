import request from "supertest";
import app from "../src/index";
import { prisma, createUserWithToken } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tasks", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("creates a task then lists and fetches it", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");

    const create = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Same-day parcel run",
        description: "Deliver parcels around Yaba",
        category: "Dispatch",
        tier: "DISPATCH_RIDER",
        payModel: "FIXED",
        budget: 15000,
        slots: 2,
      });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeDefined();
    expect(create.body.filledCount).toBe(0);
    expect(create.body.applicantCount).toBe(0);

    const list = await request(app).get("/api/tasks").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t: any) => t.id === create.body.id)).toBe(true);

    const get = await request(app)
      .get(`/api/tasks/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.title).toBe("Same-day parcel run");
  });

  it("rejects a task missing required fields", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Missing stuff" });
    expect(res.status).toBe(400);
  });

  it("rejects an HOURLY task with no rate and a FIXED task with no budget", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const base = {
      title: "Bad pay model",
      description: "desc",
      category: "Promo",
      tier: "STUDENT",
    };

    const hourly = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...base, payModel: "HOURLY" });
    expect(hourly.status).toBe(400);

    const fixed = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...base, payModel: "FIXED" });
    expect(fixed.status).toBe(400);
  });

  it("404s for a task id that doesn't exist", async () => {
    const { token } = await createUserWithToken("SUPER_ADMIN");
    const res = await request(app)
      .get("/api/tasks/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
