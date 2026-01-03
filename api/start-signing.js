import docusign from "docusign-esign";

export default async function handler(req, res) {
  try {
    const {
      DOCUSIGN_INTEGRATION_KEY,
      DOCUSIGN_USER_ID,
      DOCUSIGN_ACCOUNT_ID,
      DOCUSIGN_PRIVATE_KEY,
      DOCUSIGN_AUTH_SERVER,
      DOCUSIGN_BASE_PATH,
      DOCUSIGN_TEMPLATE_ID,
      DOCUSIGN_TEMPLATE_ROLE,
      RETURN_URL
    } = process.env;

    // JWT Token holen
    const apiClient = new docusign.ApiClient();
    apiClient.setOAuthBasePath(DOCUSIGN_AUTH_SERVER);

    const token = await apiClient.requestJWTUserToken(
      DOCUSIGN_INTEGRATION_KEY,
      DOCUSIGN_USER_ID,
      ["signature", "impersonation"],
      DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      3600
    );

    const accessToken = token.body.access_token;

    const apiClient2 = new docusign.ApiClient();
    apiClient2.setBasePath(DOCUSIGN_BASE_PATH);
    apiClient2.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

    const envelopesApi = new docusign.EnvelopesApi(apiClient2);

    const signerName = req.query.name || "Werkstatt";
    const signerEmail = req.query.email || "werkstatt@example.com";
    const clientUserId = "1000";

    const envelopeDefinition = new docusign.EnvelopeDefinition();
    envelopeDefinition.templateId = DOCUSIGN_TEMPLATE_ID;
    envelopeDefinition.status = "sent";

    const role = new docusign.TemplateRole();
    role.roleName = DOCUSIGN_TEMPLATE_ROLE;
    role.name = signerName;
    role.email = signerEmail;
    role.clientUserId = clientUserId;

    envelopeDefinition.templateRoles = [role];

    const envelope = await envelopesApi.createEnvelope(
      DOCUSIGN_ACCOUNT_ID,
      { envelopeDefinition }
    );

    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = RETURN_URL;
    viewRequest.authenticationMethod = "none";
    viewRequest.email = signerEmail;
    viewRequest.userName = signerName;
    viewRequest.clientUserId = clientUserId;

    const view = await envelopesApi.createRecipientView(
      DOCUSIGN_ACCOUNT_ID,
      envelope.envelopeId,
      { recipientViewRequest: viewRequest }
    );

    res.writeHead(302, { Location: view.url });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Embedded signing error");
  }
}
