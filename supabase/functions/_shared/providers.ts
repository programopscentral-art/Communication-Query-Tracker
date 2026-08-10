// Provider-agnostic WhatsApp sending. Business logic depends only on the
// WhatsAppProvider interface; swap implementations via the WHATSAPP_PROVIDER env.

export interface SendResult {
  id: string;
}

export interface WhatsAppProvider {
  /** Send an approved template message with named variables to an E.164 number. */
  sendTemplate(
    to: string,
    template: string,
    vars: Record<string, string>,
  ): Promise<SendResult>;
}

/** Dev/testing: logs instead of sending. Lets us verify timing before WhatsApp onboarding. */
export class MockProvider implements WhatsAppProvider {
  async sendTemplate(to: string, template: string, vars: Record<string, string>) {
    console.log(`[MOCK WA] → ${to} template=${template}`, vars);
    return { id: `mock-${crypto.randomUUID()}` };
  }
}

/** Meta WhatsApp Cloud API. */
export class MetaCloudProvider implements WhatsAppProvider {
  constructor(
    private phoneNumberId: string,
    private token: string,
  ) {}

  async sendTemplate(to: string, template: string, vars: Record<string, string>) {
    // Body variables are positional in Meta templates: {{1}}, {{2}}, …
    // We send them in the order the template expects (see buildTemplateParams).
    const components = [
      {
        type: "body",
        parameters: Object.values(vars).map((text) => ({ type: "text", text })),
      },
    ];
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components,
          },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Meta API ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    return { id: json.messages?.[0]?.id ?? "unknown" };
  }
}

/** Generic BSP (AiSensy / Interakt / Gupshup) via a simple REST call.
 *  Fill BSP_BASE_URL + BSP_API_KEY and adjust the payload to your BSP's schema. */
export class BspProvider implements WhatsAppProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async sendTemplate(to: string, template: string, vars: Record<string, string>) {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        templateName: template,
        params: Object.values(vars),
      }),
    });
    if (!res.ok) {
      throw new Error(`BSP API ${res.status}: ${await res.text()}`);
    }
    const json = await res.json().catch(() => ({}));
    return { id: json.messageId ?? json.id ?? "unknown" };
  }
}

export function getProvider(): WhatsAppProvider {
  const kind = (Deno.env.get("WHATSAPP_PROVIDER") ?? "mock").toLowerCase();
  switch (kind) {
    case "meta":
      return new MetaCloudProvider(
        Deno.env.get("META_WABA_PHONE_NUMBER_ID")!,
        Deno.env.get("META_WABA_TOKEN")!,
      );
    case "aisensy":
    case "interakt":
    case "gupshup":
    case "bsp":
      return new BspProvider(Deno.env.get("BSP_BASE_URL")!, Deno.env.get("BSP_API_KEY")!);
    default:
      return new MockProvider();
  }
}
