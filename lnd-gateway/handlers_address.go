package main

import (
	"encoding/json"
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func handleNewAddress(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type string `json:"type"` // "TAPROOT_PUBKEY" or "WITNESS_PUBKEY_HASH"
		}
		json.NewDecoder(r.Body).Decode(&req)

		addrType := lnrpc.AddressType_TAPROOT_PUBKEY
		if req.Type == "WITNESS_PUBKEY_HASH" {
			addrType = lnrpc.AddressType_WITNESS_PUBKEY_HASH
		}

		ctx := r.Context()
		resp, err := lnd.Lightning.NewAddress(ctx, &lnrpc.NewAddressRequest{
			Type: addrType,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"address": resp.Address,
		})
	}
}
