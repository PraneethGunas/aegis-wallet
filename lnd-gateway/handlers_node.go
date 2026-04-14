package main

import (
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func handleGetInfo(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		info, err := lnd.Lightning.GetInfo(ctx, &lnrpc.GetInfoRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"alias":               info.Alias,
			"identity_pubkey":     info.IdentityPubkey,
			"version":             info.Version,
			"synced_to_chain":     info.SyncedToChain,
			"synced_to_graph":     info.SyncedToGraph,
			"block_height":        info.BlockHeight,
			"num_peers":           info.NumPeers,
			"num_active_channels": info.NumActiveChannels,
		})
	}
}
