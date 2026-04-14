package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func handleCreateAccount(litd *LitdClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			BudgetSats int64  `json:"budget_sats"`
			Label      string `json:"label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		result, err := litd.CreateAccount(req.BudgetSats, req.Label)
		if err != nil {
			writeError(w, 500, "LITD_ERROR", err.Error())
			return
		}

		writeJSON(w, result)
	}
}

func handleListAccounts(litd *LitdClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		accounts, err := litd.ListAccounts()
		if err != nil {
			writeError(w, 500, "LITD_ERROR", err.Error())
			return
		}

		writeJSON(w, map[string]interface{}{"accounts": accounts})
	}
}

func handleUpdateBalance(litd *LitdClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract account ID from path: /v1/litd/accounts/{id}
		parts := strings.Split(r.URL.Path, "/")
		accountID := parts[len(parts)-1]

		var req struct {
			BalanceSats int64 `json:"balance_sats"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "INVALID_REQUEST", "invalid JSON body")
			return
		}

		if err := litd.UpdateBalance(accountID, req.BalanceSats); err != nil {
			writeError(w, 500, "LITD_ERROR", err.Error())
			return
		}

		writeJSON(w, map[string]interface{}{"success": true, "balance_sats": req.BalanceSats})
	}
}

func handleFreezeAccount(litd *LitdClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(r.URL.Path, "/")
		accountID := parts[len(parts)-1]

		if err := litd.FreezeAccount(accountID); err != nil {
			writeError(w, 500, "LITD_ERROR", err.Error())
			return
		}

		writeJSON(w, map[string]interface{}{"success": true})
	}
}
