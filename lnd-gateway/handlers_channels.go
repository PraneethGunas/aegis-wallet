package main

import (
	"encoding/json"
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func handleConnectPeer(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Pubkey string `json:"pubkey"`
			Host   string `json:"host"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()
		_, err := lnd.Lightning.ConnectPeer(ctx, &lnrpc.ConnectPeerRequest{
			Addr: &lnrpc.LightningAddress{
				Pubkey: req.Pubkey,
				Host:   req.Host,
			},
		})
		if err != nil {
			// "already connected" is not an error
			if containsInsensitive(err.Error(), "already connected") {
				writeJSON(w, map[string]interface{}{"ok": true})
				return
			}
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{"ok": true})
	}
}

func handleOpenChannel(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PeerPubkey     string `json:"peer_pubkey"`
			LocalAmountSats int64  `json:"local_amount_sats"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()
		resp, err := lnd.Lightning.OpenChannelSync(ctx, &lnrpc.OpenChannelRequest{
			NodePubkeyString:   req.PeerPubkey,
			LocalFundingAmount: req.LocalAmountSats,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"funding_txid_str": resp.GetFundingTxidStr(),
			"output_index":     resp.OutputIndex,
		})
	}
}

func handleListChannels(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp, err := lnd.Lightning.ListChannels(ctx, &lnrpc.ListChannelsRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		channels := make([]map[string]interface{}, 0, len(resp.Channels))
		for _, ch := range resp.Channels {
			channels = append(channels, map[string]interface{}{
				"channel_point": ch.ChannelPoint,
				"remote_pubkey": ch.RemotePubkey,
				"local_balance": ch.LocalBalance,
				"remote_balance": ch.RemoteBalance,
				"capacity":      ch.Capacity,
				"active":        ch.Active,
				"chan_id":        ch.ChanId,
			})
		}

		writeJSON(w, map[string]interface{}{"channels": channels})
	}
}

func handleListPeers(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp, err := lnd.Lightning.ListPeers(ctx, &lnrpc.ListPeersRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		peers := make([]map[string]interface{}, 0, len(resp.Peers))
		for _, p := range resp.Peers {
			peers = append(peers, map[string]interface{}{
				"pubkey":  p.PubKey,
				"address": p.Address,
			})
		}

		writeJSON(w, map[string]interface{}{"peers": peers})
	}
}

func handlePendingChannels(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp, err := lnd.Lightning.PendingChannels(ctx, &lnrpc.PendingChannelsRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		pending := make([]map[string]interface{}, 0, len(resp.PendingOpenChannels))
		for _, ch := range resp.PendingOpenChannels {
			pending = append(pending, map[string]interface{}{
				"channel_point": ch.Channel.ChannelPoint,
				"local_balance": ch.Channel.LocalBalance,
				"capacity":      ch.Channel.Capacity,
			})
		}

		writeJSON(w, map[string]interface{}{"pending_open_channels": pending})
	}
}
