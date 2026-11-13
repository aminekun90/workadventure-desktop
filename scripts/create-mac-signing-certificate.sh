#!/usr/bin/env bash
# Creates the self-signed code signing certificate of the macOS app, once, and stores it in the repository's GitHub
# secrets (MAC_SIGNING_P12, MAC_SIGNING_PASSWORD). Keep the same certificate for good: a new one makes macOS see a new
# app, and every user grants camera and microphone again. The private key never leaves this computer except into the
# secret; the temporary folder is deleted at the end.
set -euo pipefail

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cat >"$work/cert.cnf" <<'EOF'
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=WorkAdventure Desktop (goyan.fr)
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
EOF

password=$(openssl rand -base64 24)
openssl req -x509 -newkey rsa:3072 -nodes -keyout "$work/key.pem" -out "$work/cert.pem" -days 36500 -config "$work/cert.cnf"
# -legacy: the macOS `security` tool cannot read the newer PKCS#12 encryption of OpenSSL 3.
openssl pkcs12 -export -legacy -inkey "$work/key.pem" -in "$work/cert.pem" -out "$work/cert.p12" -passout "pass:$password" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -out "$work/cert.p12" -passout "pass:$password"

base64 <"$work/cert.p12" | tr -d '\n' | gh secret set MAC_SIGNING_P12
printf '%s' "$password" | gh secret set MAC_SIGNING_PASSWORD
echo "Stored MAC_SIGNING_P12 and MAC_SIGNING_PASSWORD. Certificate SHA-1:"
openssl x509 -in "$work/cert.pem" -noout -fingerprint -sha1
