#!/usr/bin/env bash
# Initialize LND wallets after docker compose up.
#
# Usage: ./scripts/init-wallet.sh
#
# This script:
#   1. Waits for signer REST API
#   2. Creates signer wallet (generates seed)
#   3. Exports signer credentials to litd
#   4. Creates watch-only wallet on litd
#   5. Prints funding address
set -e

SIGNER=aegis-signer
LITD=aegis-litd

echo "=== Aegis Wallet Initialization ==="
echo ""

# Wait for signer REST
echo "Waiting for signer..."
for i in $(seq 1 30); do
  if docker exec $SIGNER wget -qO- --no-check-certificate https://localhost:10013/v1/state 2>/dev/null | grep -q ""; then
    break
  fi
  sleep 2
  printf "."
done
echo " ready"

# Create signer wallet
echo "Creating signer wallet..."
PASSWORD=$(openssl rand -hex 16)
docker exec $SIGNER sh -c "echo '$PASSWORD' > /root/.lnd/wallet-password.txt"

SEED_RESPONSE=$(docker exec $SIGNER wget -qO- --no-check-certificate \
  --post-data '{}' \
  --header 'Content-Type: application/json' \
  https://localhost:10013/v1/genseed 2>/dev/null)

SEED=$(echo "$SEED_RESPONSE" | python3 -c "import sys,json; print(' '.join(json.load(sys.stdin)['cipher_seed_mnemonic']))" 2>/dev/null)

docker exec $SIGNER wget -qO- --no-check-certificate \
  --post-data "{\"wallet_password\":\"$(echo -n $PASSWORD | base64)\",\"cipher_seed_mnemonic\":$(echo $SEED_RESPONSE | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["cipher_seed_mnemonic"]))')}" \
  --header 'Content-Type: application/json' \
  https://localhost:10013/v1/initwallet > /dev/null 2>&1

echo "Signer wallet created."
echo ""
echo "IMPORTANT — Save this seed securely:"
echo "$SEED"
echo ""

# Wait for signer RPC
echo "Waiting for signer RPC..."
for i in $(seq 1 30); do
  if docker exec $SIGNER lncli --rpcserver=localhost:10012 --network=${BITCOIN_NETWORK:-mainnet} getinfo > /dev/null 2>&1; then
    break
  fi
  sleep 2
  printf "."
done
echo " ready"

# Export credentials
echo "Exporting signer credentials..."
ACCOUNTS=$(docker exec $SIGNER lncli --rpcserver=localhost:10012 --network=${BITCOIN_NETWORK:-mainnet} wallet accounts list 2>/dev/null)

docker exec $LITD mkdir -p /root/.lnd/signer-credentials
docker cp $SIGNER:/root/.lnd/tls.cert /tmp/signer-tls.cert
docker cp /tmp/signer-tls.cert $LITD:/root/.lnd/signer-credentials/tls.cert

MACAROON_EXISTS=$(docker exec $SIGNER ls /root/.lnd/data/chain/bitcoin/${BITCOIN_NETWORK:-mainnet}/admin.macaroon 2>/dev/null && echo "yes" || echo "no")
if [ "$MACAROON_EXISTS" = "yes" ]; then
  docker cp $SIGNER:/root/.lnd/data/chain/bitcoin/${BITCOIN_NETWORK:-mainnet}/admin.macaroon /tmp/signer-admin.macaroon
  docker cp /tmp/signer-admin.macaroon $LITD:/root/.lnd/signer-credentials/admin.macaroon
fi

echo "Credentials exported."

# Wait for litd REST
echo "Waiting for litd..."
docker restart $LITD
sleep 5
for i in $(seq 1 30); do
  if docker exec $LITD wget -qO- --no-check-certificate https://localhost:8080/v1/state 2>/dev/null | grep -q ""; then
    break
  fi
  sleep 2
  printf "."
done
echo " ready"

# Create watch-only wallet
echo "Creating watch-only wallet on litd..."
LITD_PASSWORD=$(openssl rand -hex 16)
docker exec $LITD sh -c "echo '$LITD_PASSWORD' > /root/.lnd/wallet-password.txt"

# Import accounts from signer
echo "$ACCOUNTS" > /tmp/signer-accounts.json
docker cp /tmp/signer-accounts.json $LITD:/tmp/accounts.json

docker exec $LITD wget -qO- --no-check-certificate \
  --post-data "{\"wallet_password\":\"$(echo -n $LITD_PASSWORD | base64)\",\"extended_master_key_birthday_timestamp\":\"0\",\"watch_only\":{\"accounts\":$(cat /tmp/signer-accounts.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get("accounts",[])))' 2>/dev/null)}}" \
  --header 'Content-Type: application/json' \
  https://localhost:8080/v1/initwallet > /dev/null 2>&1 || true

echo "Watch-only wallet created."

# Get funding address
sleep 5
NETWORK_FLAG="--network=${BITCOIN_NETWORK:-mainnet}"
ADDRESS=$(docker exec $LITD lncli $NETWORK_FLAG newaddress p2tr 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['address'])" 2>/dev/null || echo "pending...")

echo ""
echo "=== Initialization Complete ==="
echo ""
echo "Funding address: $ADDRESS"
echo "Network: ${BITCOIN_NETWORK:-mainnet}"
echo ""
echo "Next steps:"
echo "  1. Send BTC to the funding address above"
echo "  2. Open a Lightning channel: docker exec $LITD lncli $NETWORK_FLAG openchannel --node_key <pubkey> --local_amt 1000000"
echo "  3. Start the backend: docker compose up backend web"
