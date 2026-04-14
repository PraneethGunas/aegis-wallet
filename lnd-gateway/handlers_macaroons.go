package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
	"gopkg.in/macaroon.v2"
)

func handleBakeAgentMacaroon(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			AccountID string `json:"account_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()

		// Bake macaroon with minimal agent permissions
		resp, err := lnd.Lightning.BakeMacaroon(ctx, &lnrpc.BakeMacaroonRequest{
			Permissions: []*lnrpc.MacaroonPermission{
				{Entity: "uri", Action: "/routerrpc.Router/SendPaymentV2"},
				{Entity: "uri", Action: "/routerrpc.Router/TrackPaymentV2"},
				{Entity: "uri", Action: "/lnrpc.Lightning/SendPaymentSync"},
				{Entity: "uri", Action: "/lnrpc.Lightning/DecodePayReq"},
				{Entity: "uri", Action: "/lnrpc.Lightning/ChannelBalance"},
				{Entity: "uri", Action: "/lnrpc.Lightning/ListPayments"},
				{Entity: "uri", Action: "/lnrpc.Lightning/GetInfo"},
				{Entity: "uri", Action: "/lnrpc.Lightning/AddInvoice"},
				{Entity: "uri", Action: "/invoicesrpc.Invoices/AddHoldInvoice"},
			},
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		// Decode the macaroon bytes
		macBytes, err := hexDecode(resp.Macaroon)
		if err != nil {
			writeError(w, 500, "INTERNAL", "failed to decode baked macaroon")
			return
		}

		var mac macaroon.Macaroon
		if err := mac.UnmarshalBinary(macBytes); err != nil {
			writeError(w, 500, "INTERNAL", "failed to parse baked macaroon")
			return
		}

		// Add litd account caveat
		if err := mac.AddFirstPartyCaveat([]byte("lnd-custom account " + req.AccountID)); err != nil {
			writeError(w, 500, "INTERNAL", "failed to add account caveat")
			return
		}

		// Serialize back to base64
		finalBytes, err := mac.MarshalBinary()
		if err != nil {
			writeError(w, 500, "INTERNAL", "failed to serialize macaroon")
			return
		}

		writeJSON(w, map[string]interface{}{
			"macaroon": base64.StdEncoding.EncodeToString(finalBytes),
		})
	}
}
