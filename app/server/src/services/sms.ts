// SMS delivery for worker phone-OTP: env-driven, mirrors services/paystack.ts.
//
// Set SMS_PROVIDER to "termii" or "twilio" plus the matching keys to go live.
// With no provider configured, `enabled` is false and the OTP flow runs in
// SIMULATED mode: nothing is sent over the wire, the code is logged, and the
// request handler returns it as `devCode` (dev only). Master code 123456 also
// works in dev: see routes/authOtp.ts.

// Read lazily, not at module load: Workers only populate process.env from
// bindings once request handling begins, not at pure module-evaluation time -
// reading these eagerly always saw them as unset, permanently forcing
// simulated mode regardless of what's actually configured. See
// src/services/paystack.ts for the same pattern.
function config() {
  return {
    provider: (process.env.SMS_PROVIDER || "").trim().toLowerCase(),
    termiiApiKey: process.env.TERMII_API_KEY || "",
    termiiBase: process.env.TERMII_BASE || "https://api.ng.termii.com",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioFrom: process.env.TWILIO_FROM || "",
  };
}

export const sms = {
  /** True when a real SMS provider is configured. False = simulated (devCode). */
  get enabled(): boolean {
    const c = config();
    if (c.provider === "termii") return c.termiiApiKey.length > 0;
    if (c.provider === "twilio") {
      return c.twilioAccountSid.length > 0 && c.twilioAuthToken.length > 0 && c.twilioFrom.length > 0;
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
    const { provider } = config();
    if (provider === "termii") {
      await this.sendTermii(phone, text);
      return;
    }
    if (provider === "twilio") {
      await this.sendTwilio(phone, text);
      return;
    }
  },

  async sendTermii(phone: string, text: string): Promise<void> {
    const { termiiBase, termiiApiKey } = config();
    const res = await fetch(`${termiiBase}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: phone,
        from: process.env.TERMII_FROM || "Afrizone",
        sms: text,
        type: "plain",
        channel: "generic",
        api_key: termiiApiKey,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new Error(json.message || `Termii send failed (${res.status})`);
    }
  },

  async sendTwilio(phone: string, text: string): Promise<void> {
    const { twilioAccountSid, twilioAuthToken, twilioFrom } = config();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: twilioFrom, Body: text });
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
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
