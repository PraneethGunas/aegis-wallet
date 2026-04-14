package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/lightningnetwork/lnd/lnrpc/walletrpc"
)

func handleSendCoins(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Address    string `json:"address"`
			AmountSats int64  `json:"amount_sats"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()
		resp, err := lnd.Lightning.SendCoins(ctx, &lnrpc.SendCoinsRequest{
			Addr:   req.Address,
			Amount: req.AmountSats,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{"txid": resp.Txid})
	}
}

func handlePublishTx(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			TxHex string `json:"tx_hex"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()

		txBytes, err := hexDecode(req.TxHex)
		if err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid tx hex")
			return
		}

		resp, err := lnd.WalletKit.PublishTransaction(ctx, &walletrpc.Transaction{
			TxHex: txBytes,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"publish_error": resp.PublishError,
		})
	}
}

func handleListUnspent(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp, err := lnd.Lightning.ListUnspent(ctx, &lnrpc.ListUnspentRequest{
			MinConfs: 0,
			MaxConfs: 999999,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		utxos := make([]map[string]interface{}, 0, len(resp.Utxos))
		for _, u := range resp.Utxos {
			utxos = append(utxos, map[string]interface{}{
				"txid":          u.Outpoint.TxidStr,
				"vout":          u.Outpoint.OutputIndex,
				"value":         u.AmountSat,
				"confirmations": u.Confirmations,
				"address":       u.Address,
			})
		}

		writeJSON(w, map[string]interface{}{"utxos": utxos})
	}
}

func handleGetTransactions(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		resp, err := lnd.Lightning.GetTransactions(ctx, &lnrpc.GetTransactionsRequest{})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		txs := make([]map[string]interface{}, 0, len(resp.Transactions))
		for _, tx := range resp.Transactions {
			txs = append(txs, map[string]interface{}{
				"txid":          tx.TxHash,
				"amount":        tx.Amount,
				"confirmations": tx.NumConfirmations,
				"timestamp":     tx.TimeStamp,
				"total_fees":    tx.TotalFees,
			})
		}

		writeJSON(w, map[string]interface{}{"transactions": txs})
	}
}

func hexDecode(s string) ([]byte, error) {
	b := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := hexVal(s[i])
		lo := hexVal(s[i+1])
		if hi == 255 || lo == 255 {
			return nil, fmt.Errorf("invalid hex char")
		}
		b[i/2] = hi<<4 | lo
	}
	return b, nil
}

func hexVal(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	default:
		return 255
	}
}
