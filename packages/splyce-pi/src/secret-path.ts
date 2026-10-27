const SECRET_NAME =
  /^(?:\.env(?:\.(?!(?:example|sample|template|dist)$).+)?|.+\.(?:pem|key|p12|pfx|jks|keystore|ppk)|id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$).*|.*credentials.*\.json|\.npmrc|\.netrc|_netrc|\.pypirc|\.git-credentials|\.htpasswd)$/i;
const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg"]);

/** Secret-shaped path: decided from the name alone, so it is never read. */
export function isSecretPath(rel: string): boolean {
  const parts = rel.toLowerCase().split("/");
  return (
    parts.slice(0, -1).some((d) => SECRET_DIRS.has(d)) ||
    SECRET_NAME.test(parts.at(-1)!)
  );
}
