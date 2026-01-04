import docusign from "docusign-esign";

function required(name, value) {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizeHost(host) {
  // SDK will "account-d.docusign.com" not "https://account-d.docusign.com"
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function normalizePrivateKey(key) {
  // Works if you stored it as:
  // -----BEGIN...-----\nLINE\nLINE\n-----END...-----
  // or with real newlines
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export default async function handler(req, res) {
  try {
    // --- ENV ---
    const DOCUSIGN_INTEGRATION_KEY = required(
      "DOCUSIGN_INTEGRATION_KEY",
      process.env.DOCUSIGN_INTEGRATION_KEY
    );

    const DOCUSIGN_USER_ID = required(
      "DOCUSIGN_USER_ID",
      process.env.DOCUSIGN_USER_ID
    );

    const DOCUSIGN_ACCOUNT_ID = required(
      "DOCUSIGN_ACCOUNT_ID",
      process.env.DOCUSIGN_ACCOUNT_ID
    );

    const DOCUSIGN_PRIVATE_KEY = required(
      "DOCUSIGN_PRIVATE_KEY",
      process.env.DOCUSIGN_PRIVATE_KEY
    );

    const DOCUSIGN_AUTH_SERVER = normalizeHost(
      required("DOCUSIGN_AUTH_SERVER", process.env.DOCUSIGN_AUTH_SERVER)
    );

    const DOCUSIGN_BASE_PATH = required(
      "DOCUSIGN_BASE_PATH",
      process.env.DOCUSIGN_BASE_PATH
    );

    const DOCUSIGN_TEMPLATE_ID = required(
      "DOCUSIGN_TEMPLATE_ID",
      process.env.DOCUSIGN_TEMPLATE_ID
    );

    // IMPORTANT: Must match the Template "Role" EXACTLY (e.g. "Signer")
    const DOCUSIGN_TEMPLATE_ROLE =
      process.env.DOCUSIGN_TEMPLATE_ROLE?.trim() || "Signer";

    const RETURN_URL = required("RETURN_URL", process.env.RETURN_URL);

    // --- Query Params ---
    const signerName = (req.query.name || "Werkstatt").toString();
    const signerEmail = (req.query.email || "werkstatt@example.com").toString();
    const clientUserId = "1000"; // must be consistent for embedded signing

    // --- 1) JWT Token holen ---
    const apiClient = new docusign.ApiClient();
    apiClient.setOAuthBasePath(DOCUSIGN_AUTH_SERVER);

    const token = await apiClient.requestJWTUserToken(
      DOCUSIGN_INTEGRATION_KEY,
      DOCUSIGN_USER_ID,
      ["signature", "impersonation"],
      normalizePrivateKey(DOCUSIGN_PRIVATE_KEY),
      3600
    );

    const accessToken = token.body.access_token;

    // --- 2) Envelopes API Client ---
    const apiClient2 = new docusign.ApiClient();
    apiClient2.setBasePath(DOCUSIGN_BASE_PATH);
    apiClient2.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

    const envelopesApi = new docusign.EnvelopesApi(apiClient2);

    // --- 3) Envelope aus Template erstellen ---
    const envelopeDefinition = new docusign.EnvelopeDefinition();
    envelopeDefinition.templateId = DOCUSIGN_TEMPLATE_ID;
    envelopeDefinition.status = "sent";

    const role = new docusign.TemplateRole();
    role.roleName = DOCUSIGN_TEMPLATE_ROLE; // MUST MATCH TEMPLATE ROLE
    role.name = signerName;
    role.email = signerEmail;
    role.clientUserId = clientUserId;
    role.recipientId = "1";

    envelopeDefinition.templateRoles = [role];

    const envelope = await envelopesApi.createEnvelope(DOCUSIGN_ACCOUNT_ID, {
      envelopeDefinition,
    });

    // --- 4) Embedded Signing View erstellen ---
    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = RETURN_URL;
    viewRequest.authenticationMethod = "none";
    viewRequest.email = signerEmail;
    viewRequest.userName = signerName;
    viewRequest.clientUserId = clientUserId;
    viewRequest.recipientId = "1";

    const view = await envelopesApi.createRecipientView(
      DOCUSIGN_ACCOUNT_ID,
      envelope.envelopeId,
      { recipientViewRequest: viewRequest }
    );

    // Redirect zur Signing-URL
    res.writeHead(302, { Location: view.url });
    res.end();
  } catch (err) {
    console.error("start-signing error:", err?.response?.body || err);
    res
      .status(500)
      .send(
        "Embedded signing error: " +
          (err?.response?.body?.message || err.message || "unknown")
      );
  }
}
