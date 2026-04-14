package main

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/lightningnetwork/lnd/lnrpc/routerrpc"
)

type sendPaymentRequest struct {
	Bolt11        string `json:"bolt11"`
	AgentMacaroon string `json:"agent_macaroon,omitempty"`
}

func handleSendPayment(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req sendPaymentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		agentMac := extractMacaroon(r)
		if agentMac == "" {
			agentMac = req.AgentMacaroon
		}

		ctx := r.Context()

		if agentMac != "" {
			// AGENT PATH: unary SendPaymentSync (litd account middleware compatible)
			callCtx := callWithMacaroon(ctx, agentMac)
			resp, err := lnd.Lightning.SendPaymentSync(callCtx, &lnrpc.SendRequest{
				PaymentRequest: req.Bolt11,
			})
			if err != nil {
				writeGRPCError(w, err)
				return
			}

			if resp.PaymentError != "" {
				writeJSON(w, map[string]interface{}{
					"success":         false,
					"error":           resp.PaymentError,
					"budget_exceeded": isBudgetError(resp.PaymentError),
				})
				return
			}

			// Get remaining balance
			bal, _ := lnd.Lightning.ChannelBalance(callCtx, &lnrpc.ChannelBalanceRequest{})
			balSats := int64(0)
			if bal != nil {
				balSats = int64(bal.GetLocalBalance().GetSat())
			}

			writeJSON(w, map[string]interface{}{
				"success":              true,
				"amount_sats":          resp.PaymentRoute.TotalAmt,
				"fee_sats":             resp.PaymentRoute.TotalFees,
				"preimage":             hex.EncodeToString(resp.PaymentPreimage),
				"balance_remaining_sats": balSats,
			})
		} else {
			// ADMIN PATH: streaming SendPaymentV2 (better pathfinding)
			stream, err := lnd.Router.SendPaymentV2(ctx, &routerrpc.SendPaymentRequest{
				PaymentRequest: req.Bolt11,
				TimeoutSeconds: 60,
				FeeLimitSat:    1000,
			})
			if err != nil {
				writeGRPCError(w, err)
				return
			}

			// Read from stream until terminal state
			for {
				payment, err := stream.Recv()
				if err != nil {
					writeGRPCError(w, err)
					return
				}

				if payment.Status == lnrpc.Payment_SUCCEEDED {
					bal, _ := lnd.Lightning.ChannelBalance(ctx, &lnrpc.ChannelBalanceRequest{})
					balSats := int64(0)
					if bal != nil {
						balSats = int64(bal.GetLocalBalance().GetSat())
					}

					writeJSON(w, map[string]interface{}{
						"success":              true,
						"amount_sats":          payment.ValueSat,
						"fee_sats":             payment.FeeSat,
						"preimage":             payment.PaymentPreimage,
						"balance_remaining_sats": balSats,
					})
					return
				}

				if payment.Status == lnrpc.Payment_FAILED {
					reason := payment.FailureReason.String()
					writeJSON(w, map[string]interface{}{
						"success":         false,
						"error":           reason,
						"budget_exceeded": isBudgetError(reason),
					})
					return
				}
			}
		}
	}
}

func handleDecodeInvoice(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Bolt11 string `json:"bolt11"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		ctx := r.Context()
		decoded, err := lnd.Lightning.DecodePayReq(ctx, &lnrpc.PayReqString{
			PayReq: req.Bolt11,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		writeJSON(w, map[string]interface{}{
			"is_valid":       true,
			"payment_hash":   decoded.PaymentHash,
			"amount_sats":    decoded.NumSatoshis,
			"description":    decoded.Description,
			"destination":    decoded.Destination,
			"expiry_seconds": decoded.Expiry,
			"timestamp":      decoded.Timestamp,
		})
	}
}

func handleListPayments(lnd *LNDConn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := callWithMacaroon(r.Context(), extractMacaroon(r))

		limitStr := r.URL.Query().Get("limit")
		limit := 10
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}

		resp, err := lnd.Lightning.ListPayments(ctx, &lnrpc.ListPaymentsRequest{
			MaxPayments: uint64(limit),
			Reversed:    true,
		})
		if err != nil {
			writeGRPCError(w, err)
			return
		}

		payments := make([]map[string]interface{}, 0, len(resp.Payments))
		for _, p := range resp.Payments {
			status := "pending"
			if p.Status == lnrpc.Payment_SUCCEEDED {
				status = "settled"
			} else if p.Status == lnrpc.Payment_FAILED {
				status = "failed"
			}

			payments = append(payments, map[string]interface{}{
				"amount_sats":  p.ValueSat,
				"fee_sats":     p.FeeSat,
				"status":       status,
				"timestamp":    p.CreationDate,
				"payment_hash": p.PaymentHash,
			})
		}

		writeJSON(w, map[string]interface{}{"payments": payments})
	}
}

func isBudgetError(msg string) bool {
	for _, keyword := range []string{"insufficient", "account", "budget"} {
		if containsInsensitive(msg, keyword) {
			return true
		}
	}
	return false
}

func containsInsensitive(s, substr string) bool {
	return len(s) >= len(substr) &&
		(s == substr || len(s) > 0 && containsLower(toLower(s), toLower(substr)))
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := range s {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 32
		}
		b[i] = c
	}
	return string(b)
}

func containsLower(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
