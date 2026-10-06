/* The server's sign-in page (login.html): scripts/serve.py shows it instead of the site until you're signed in,
 * so the lab's data only reaches signed-in members. */
LabGate({ signIn: LabServerAuth.signIn, hint: I18N.t("a.issued") });
