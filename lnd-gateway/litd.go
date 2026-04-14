package main

import (
	"bytes"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// LitdClient manages litd account operations over HTTPS.
type LitdClient struct {
	baseURL  string
	macaroon string // hex-encoded lit.macaroon
	client   *http.Client
}

// NewLitdClient creates a client for the litd account API.
func NewLitdClient(host, macaroonPath string) (*LitdClient, error) {
	macBytes, err := os.ReadFile(macaroonPath)
	if err != nil {
		return nil, fmt.Errorf("read lit.macaroon: %w", err)
	}

	return &LitdClient{
		baseURL:  host,
		macaroon: hex.EncodeToString(macBytes),
		client: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true, // litd uses self-signed certs on localhost
				},
			},
		},
	}, nil
}

func (c *LitdClient) request(method, path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Grpc-Metadata-macaroon", c.macaroon)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("litd %s %s: %d %s", method, path, resp.StatusCode, string(data))
	}

	return data, nil
}

// CreateAccount creates a litd account with a budget ceiling.
func (c *LitdClient) CreateAccount(budgetSats int64, label string) (map[string]interface{}, error) {
	data, err := c.request("POST", "/v1/accounts", map[string]interface{}{
		"account_balance": fmt.Sprintf("%d", budgetSats),
		"label":           label,
	})
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	json.Unmarshal(data, &result)
	return result, nil
}

// ListAccounts returns all litd accounts.
func (c *LitdClient) ListAccounts() ([]map[string]interface{}, error) {
	data, err := c.request("GET", "/v1/accounts", nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Accounts []map[string]interface{} `json:"accounts"`
	}
	json.Unmarshal(data, &result)
	return result.Accounts, nil
}

// UpdateBalance changes the budget ceiling for an account.
func (c *LitdClient) UpdateBalance(accountID string, newBalanceSats int64) error {
	_, err := c.request("PUT", "/v1/accounts/"+accountID, map[string]interface{}{
		"account_balance": fmt.Sprintf("%d", newBalanceSats),
	})
	return err
}

// FreezeAccount deletes a litd account (macaroon becomes invalid).
func (c *LitdClient) FreezeAccount(accountID string) error {
	_, err := c.request("DELETE", "/v1/accounts/"+accountID, nil)
	return err
}
