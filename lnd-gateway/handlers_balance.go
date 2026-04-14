package main

import (
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func handleChannelBalance(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := callWithMacaroon(r.Context(), extractMacaroon(r))

		bal, err := lnd.Lightning.ChannelBalance(ctx, &lnrpc.ChannelBalanceRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"balance_sats": bal.GetLocalBalance().GetSat(),
		})
	}
}

func handleWalletBalance(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		bal, err := lnd.Lightning.WalletBalance(ctx, &lnrpc.WalletBalanceRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"confirmed_balance":   bal.ConfirmedBalance,
			"unconfirmed_balance": bal.UnconfirmedBalance,
		})
	}
}
