// SMS delivery for worker phone-OTP: env-driven, mirrors services/paystack.ts.
//
// Set SMS_PROVIDER to "termii" or "twilio" plus the matching keys to go live.
// With no provider configured, `enabled` is false and the OTP flow runs in
// SIMULATED mode: nothing is sent over the wire, the code is logged, and the
// request handler returns it as `devCode` (dev only). Master code 123456 also
// works in dev: see routes/authOtp.ts.

const PROVIDER = (process.env.SMS_PROVIDER || "").trim().toLowerCase();
const TERMII_API_KEY = process.env.TERMII_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_FROM || "";

const TERMII_BASE = process.env.TERMII_BASE || "https://api.ng.termii.com";

export const sms = {
  /** True when a real SMS provider is configured. False = simulated (devCode). */
  get enabled(): boolean {
    if (PROVIDER === "termii") return TERMII_API_KEY.length > 0;
    if (PROVIDER === "twilio") {
      return TWILIO_ACCOUNT_SID.length > 0 && TWILIO_AUTH_TOKEN.length > 0 && TWILIO_FROM.length > 0;
    }
    return false;
  },

  /** Send a 6-digit OTP to `phone`. In sim mode just logs it. */
  async sendOtp(phone: string, code: string): Promise<void> {
    const text = `Your Afrizone verification code is ${code}. It expires in 10 minutes.`;
    if (!this.enabled) {
      console.log(`[sms:sim] OTP for ${phone}: ${code}`);
      return;
    }
    if (PROVIDER === "termii") {
      await this.sendTermii(phone, text);
      return;
    }
    if (PROVIDER === "twilio") {
      await this.sendTwilio(phone, text);
      return;
    }
  },

  async sendTermii(phone: string, text: string): Promise<void> {
    const res = await fetch(`${TERMII_BASE}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: phone,
        from: process.env.TERMII_FROM || "Afrizone",
        sms: text,
        type: "plain",
        channel: "generic",
        api_key: TERMII_API_KEY,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new Error(json.message || `Termii send failed (${res.status})`);
    }
  },

  async sendTwilio(phone: string, text: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: text });
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new Error(json.message || `Twilio send failed (${res.status})`);
    }
  },
};
