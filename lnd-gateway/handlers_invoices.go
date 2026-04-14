package main

import (
	"encoding/json"
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func handleAddInvoice(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			AmountSats int64  `json:"amount_sats"`
			Memo       string `json:"memo"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := callWithMacaroon(r.Context(), extractMacaroon(r))

		invoice, err := lnd.Lightning.AddInvoice(ctx, &lnrpc.Invoice{
			Value: req.AmountSats,
			Memo:  req.Memo,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"bolt11":       invoice.PaymentRequest,
			"payment_hash": invoice.RHash,
		})
	}
}
